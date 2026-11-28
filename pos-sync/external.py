"""외부 데이터 수집 (매일 POS 수집 뒤 자동 실행, 단독 실행도 가능)

  ext_holiday     공휴일 (Nager.Date 공개 API, 키 불필요) — 올해·내년
  ext_weather     서울 일별 날씨 관측 (기상청 ASOS 일자료, 공공데이터포털 키 DATA_GO_KR_KEY 필요)
  ext_forecast    매장 동네 단기예보 (기상청 단기예보, 같은 키) — 오늘~3일 뒤
  ext_brand_news  경쟁 치킨 브랜드 이벤트·신메뉴 소식 (네이버 뉴스 검색 API 키가 있으면 사용,
                  없으면 Google 뉴스 RSS) — 제목·링크·날짜만 저장, 본문은 저장하지 않음

  python3 external.py                       # 전부 (키 없는 항목은 건너뜀)
  python3 external.py --weather-from 20231101  # 과거 날씨 한 번에 채우기
  python3 external.py --only news           # 하나만 (holiday|weather|forecast|news)

.env (pos-sync/.env, git 제외)
  DATA_GO_KR_KEY=        공공데이터포털 일반 인증키(Decoding) — 기상청 ASOS 일자료·단기예보 활용신청 필요
  NAVER_CLIENT_ID=       네이버 개발자센터 애플리케이션 (검색 API)
  NAVER_CLIENT_SECRET=
"""
import argparse
import datetime
import email.utils
import html
import logging
import math
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg2
import psycopg2.extras
import requests

log = logging.getLogger('external')
KST = ZoneInfo('Asia/Seoul')
UA = {'User-Agent': 'mamapos-dashboard/1.0'}

ASOS_STATION = 108  # 서울 관측소 (두 매장 모두)
# 매장 위치 (단기예보 격자 계산용, 대략 좌표)
STORE_POINTS = {
    '독립문점': (37.5745, 126.9580),
    '고려대점': (37.5862, 127.0290),
}
# 경쟁 브랜드: (표시 이름, 제목에 있어야 하는 표기들) — 매출 상위 5개 (2025년 실적 기준)
BRANDS = [
    ('bhc', ['bhc', 'BHC', '비에이치씨']),
    ('BBQ', ['BBQ', '비비큐']),
    ('교촌치킨', ['교촌']),
    ('굽네치킨', ['굽네']),
    ('60계치킨', ['60계']),
]
NEWS_KEEP_DAYS = 60
EVENT_RE = re.compile(r'이벤트|할인|프로모션|증정|쿠폰|반값|페스타|혜택|사은|무료|특가|세일|깎아|1\+1|블프|블랙프라이데이')
# 치킨과 무관한 같은 회사 브랜드·여러 브랜드를 나열한 소식 모음 기사 제외
EXCLUDE_RE = re.compile(r'듀먼|^\[똑똑한|^\[유통|^\[식음료|^\[마이펫')
def is_roundup(title):
    return len(re.findall(r'[,·]', title)) >= 4
MENU_RE = re.compile(r'신메뉴|신제품|출시|선보|론칭|한정')

SCHEMA = """
CREATE TABLE IF NOT EXISTS ext_holiday (
  day  DATE PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ext_weather (
  day     DATE NOT NULL,
  stn     INTEGER NOT NULL,
  avg_ta  NUMERIC, min_ta NUMERIC, max_ta NUMERIC,   -- 기온 ℃
  rain_mm NUMERIC,                                    -- 일 강수량 (없으면 0)
  snow_cm NUMERIC,                                    -- 일 최심 신적설
  PRIMARY KEY (day, stn)
);
CREATE TABLE IF NOT EXISTS ext_forecast (
  day        DATE NOT NULL,
  region     TEXT NOT NULL,          -- 매장명
  min_ta     NUMERIC, max_ta NUMERIC,
  pop        INTEGER,                -- 하루 중 최대 강수확률 %
  rain_mm    NUMERIC,                -- 예상 강수량 합 (대략)
  rain_hours INTEGER,                -- 비·눈 예보 시간 수 (11시~다음날 1시 영업 시간 기준)
  sky        TEXT,                   -- 맑음·구름많음·흐림 (영업시간 최빈값)
  pty        TEXT,                   -- 비·눈·비/눈·소나기 (영업시간 중 있으면)
  base_at    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (day, region)
);
CREATE TABLE IF NOT EXISTS ext_brand_news (
  link       TEXT PRIMARY KEY,
  brand      TEXT NOT NULL,
  title      TEXT NOT NULL,
  source     TEXT,
  kind       TEXT NOT NULL,          -- 이벤트·할인 / 신메뉴 / 소식
  pub_at     TIMESTAMPTZ NOT NULL,
  provider   TEXT NOT NULL,          -- naver / google
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  story      TEXT                    -- 같은 소식 묶음 (대표 기사 link) — 언론사별 중복 기사를 하나로 보여줌
);
ALTER TABLE ext_brand_news ADD COLUMN IF NOT EXISTS story TEXT;
CREATE INDEX IF NOT EXISTS ext_brand_news_pub ON ext_brand_news (pub_at DESC);
"""


def load_env(path):
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())


def num(v):
    try:
        return float(v) if v not in (None, '', ' ') else None
    except ValueError:
        return None


# ------------------------------------------------------------------ 공휴일
def update_holidays(conn):
    year = datetime.datetime.now(KST).year
    names = {}
    for y in (year - 1, year, year + 1):
        r = requests.get(f'https://date.nager.at/api/v3/PublicHolidays/{y}/KR', headers=UA, timeout=20)
        r.raise_for_status()
        for h in r.json():  # 같은 날 공휴일이 겹치면 이름을 합침 (예: 어린이날·부처님오신날)
            if h['localName'] not in names.setdefault(h['date'], []):
                names[h['date']].append(h['localName'])
    rows = [(d, '·'.join(n)) for d, n in names.items()]
    with conn, conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur, 'INSERT INTO ext_holiday (day, name) VALUES %s ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name', rows)
    log.info('공휴일 %d건', len(rows))


# ------------------------------------------------------------------ 날씨 관측 (ASOS)
def update_weather(conn, key, start=None):
    yesterday = datetime.datetime.now(KST).date() - datetime.timedelta(days=1)
    if start is None:
        with conn.cursor() as cur:
            cur.execute('SELECT max(day) FROM ext_weather WHERE stn = %s', (ASOS_STATION,))
            last = cur.fetchone()[0]
        start = (last - datetime.timedelta(days=3)) if last else yesterday - datetime.timedelta(days=30)
    total = 0
    cur_start = start
    while cur_start <= yesterday:
        end = min(yesterday, cur_start + datetime.timedelta(days=360))
        r = requests.get('https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList', params={
            'serviceKey': key, 'pageNo': 1, 'numOfRows': 999, 'dataType': 'JSON', 'dataCd': 'ASOS', 'dateCd': 'DAY',
            'startDt': cur_start.strftime('%Y%m%d'), 'endDt': end.strftime('%Y%m%d'), 'stnIds': ASOS_STATION,
        }, headers=UA, timeout=30)
        r.raise_for_status()
        body = r.json()['response']
        if body['header']['resultCode'] != '00':
            raise RuntimeError(f"ASOS 오류 {body['header']['resultCode']} {body['header']['resultMsg']}")
        items = body['body']['items']['item'] if body['body'].get('items') else []
        rows = [(i['tm'], ASOS_STATION, num(i.get('avgTa')), num(i.get('minTa')), num(i.get('maxTa')),
                 num(i.get('sumRn')) or 0, num(i.get('ddMes'))) for i in items]
        with conn, conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO ext_weather (day, stn, avg_ta, min_ta, max_ta, rain_mm, snow_cm) VALUES %s
                ON CONFLICT (day, stn) DO UPDATE SET avg_ta = EXCLUDED.avg_ta, min_ta = EXCLUDED.min_ta, max_ta = EXCLUDED.max_ta,
                  rain_mm = EXCLUDED.rain_mm, snow_cm = EXCLUDED.snow_cm""", rows)
        total += len(rows)
        cur_start = end + datetime.timedelta(days=1)
    log.info('날씨 관측 %d일 (%s~)', total, start)


# ------------------------------------------------------------------ 단기예보
def latlon_to_grid(lat, lon):
    """기상청 단기예보 격자 (Lambert Conformal Conic) 변환"""
    RE, GRID, SLAT1, SLAT2, OLON, OLAT, XO, YO = 6371.00877, 5.0, 30.0, 60.0, 126.0, 38.0, 43, 136
    DEG = math.pi / 180.0
    re = RE / GRID
    slat1, slat2, olon, olat = SLAT1 * DEG, SLAT2 * DEG, OLON * DEG, OLAT * DEG
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5))
    sf = math.pow(math.tan(math.pi * 0.25 + slat1 * 0.5), sn) * math.cos(slat1) / sn
    ro = re * sf / math.pow(math.tan(math.pi * 0.25 + olat * 0.5), sn)
    ra = re * sf / math.pow(math.tan(math.pi * 0.25 + lat * DEG * 0.5), sn)
    theta = lon * DEG - olon
    theta = (theta + math.pi) % (2 * math.pi) - math.pi
    theta *= sn
    return int(ra * math.sin(theta) + XO + 0.5), int(ro - ra * math.cos(theta) + YO + 0.5)


SKY = {'1': '맑음', '3': '구름많음', '4': '흐림'}
PTY = {'1': '비', '2': '비/눈', '3': '눈', '4': '소나기'}
OPEN_HOURS = {11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}


def pcp_mm(v):
    if not v or '없음' in v:
        return 0.0
    if '미만' in v:
        return 0.5
    m = re.search(r'[\d.]+', v)
    return float(m.group()) if m else 0.0


def update_forecast(conn, key):
    now = datetime.datetime.now(KST)
    base = now.replace(hour=5, minute=0, second=0, microsecond=0)
    if now < base + datetime.timedelta(minutes=15):  # 05시 발표는 05:10 이후 제공
        base -= datetime.timedelta(days=1)
        base = base.replace(hour=23)
    rows = []
    for region, (lat, lon) in STORE_POINTS.items():
        nx, ny = latlon_to_grid(lat, lon)
        r = requests.get('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst', params={
            'serviceKey': key, 'pageNo': 1, 'numOfRows': 1500, 'dataType': 'JSON',
            'base_date': base.strftime('%Y%m%d'), 'base_time': base.strftime('%H%M'), 'nx': nx, 'ny': ny,
        }, headers=UA, timeout=30)
        r.raise_for_status()
        body = r.json()['response']
        if body['header']['resultCode'] != '00':
            raise RuntimeError(f"단기예보 오류 {body['header']['resultCode']} {body['header']['resultMsg']}")
        days = {}
        for it in body['body']['items']['item']:
            d = days.setdefault(it['fcstDate'], {'tmp': [], 'pop': [], 'pcp': 0.0, 'sky': [], 'pty': set(), 'rain_h': 0, 'tmn': None, 'tmx': None})
            h = int(it['fcstTime'][:2])
            c, v = it['category'], it['fcstValue']
            if c == 'TMP':
                d['tmp'].append(float(v))
            elif c == 'TMN':
                d['tmn'] = float(v)
            elif c == 'TMX':
                d['tmx'] = float(v)
            elif c == 'POP':
                d['pop'].append(int(v))
            elif c == 'PCP':
                d['pcp'] += pcp_mm(v)
            elif c == 'SKY' and h in OPEN_HOURS:
                d['sky'].append(SKY.get(v, v))
            elif c == 'PTY' and v != '0' and h in OPEN_HOURS:
                d['pty'].add(PTY.get(v, v))
                d['rain_h'] += 1
        for day, d in days.items():
            if not d['tmp']:
                continue
            sky = max(set(d['sky']), key=d['sky'].count) if d['sky'] else None
            rows.append((datetime.datetime.strptime(day, '%Y%m%d').date(), region,
                         d['tmn'] if d['tmn'] is not None else min(d['tmp']), d['tmx'] if d['tmx'] is not None else max(d['tmp']),
                         max(d['pop']) if d['pop'] else None, round(d['pcp'], 1), d['rain_h'], sky,
                         '·'.join(sorted(d['pty'])) or None, base))
    with conn, conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO ext_forecast (day, region, min_ta, max_ta, pop, rain_mm, rain_hours, sky, pty, base_at) VALUES %s
            ON CONFLICT (day, region) DO UPDATE SET min_ta = EXCLUDED.min_ta, max_ta = EXCLUDED.max_ta, pop = EXCLUDED.pop,
              rain_mm = EXCLUDED.rain_mm, rain_hours = EXCLUDED.rain_hours, sky = EXCLUDED.sky, pty = EXCLUDED.pty, base_at = EXCLUDED.base_at""", rows)
        cur.execute("DELETE FROM ext_forecast WHERE day < current_date - 7")
    log.info('단기예보 %d건 (발표 %s)', len(rows), base.strftime('%m-%d %H시'))


# ------------------------------------------------------------------ 경쟁 브랜드 소식
def clean(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def classify(title):
    if EVENT_RE.search(title):
        return '이벤트·할인'
    if MENU_RE.search(title):
        return '신메뉴'
    return '소식'


def search_naver(query, cid, secret):
    r = requests.get('https://openapi.naver.com/v1/search/news.json', params={'query': query, 'display': 50, 'sort': 'date'},
                     headers={**UA, 'X-Naver-Client-Id': cid, 'X-Naver-Client-Secret': secret}, timeout=20)
    r.raise_for_status()
    for it in r.json().get('items', []):
        src = re.sub(r'^https?://(www\.)?', '', it.get('originallink') or '').split('/')[0] or None
        yield clean(it['title']), it.get('originallink') or it['link'], src, email.utils.parsedate_to_datetime(it['pubDate'])


def search_google(query):
    r = requests.get('https://news.google.com/rss/search', params={'q': f'{query} when:30d', 'hl': 'ko', 'gl': 'KR', 'ceid': 'KR:ko'},
                     headers=UA, timeout=20)
    r.raise_for_status()
    for it in ET.fromstring(r.content).iter('item'):
        title = clean(it.findtext('title'))
        src = it.findtext('source')
        if src and title.endswith(f' - {src}'):
            title = title[: -len(src) - 3]
        yield title, it.findtext('link'), src, email.utils.parsedate_to_datetime(it.findtext('pubDate'))


def update_news(conn):
    cid, secret = os.environ.get('NAVER_CLIENT_ID'), os.environ.get('NAVER_CLIENT_SECRET')
    provider = 'naver' if cid and secret else 'google'
    cutoff = datetime.datetime.now(KST) - datetime.timedelta(days=NEWS_KEEP_DAYS)
    rows, seen = [], set()
    for brand, names in BRANDS:
        for word in ('이벤트', '할인', '신메뉴'):
            query = f'{names[0] if brand != "bhc" else "bhc치킨"} {word}'
            try:
                time.sleep(0.3 if provider == 'naver' else 2)  # 검색 사이트 부담 줄이기 (Google은 연속 요청 시 429)
                found = list(search_naver(query, cid, secret) if provider == 'naver' else search_google(query))
            except Exception:
                log.exception('%s 검색 실패: %s', provider, query)
                continue
            for title, link, src, pub in found:
                # 제목에 브랜드 표기가 있는 기사만, 같은 제목은 하나만
                norm = re.sub(r'\W', '', title)
                if (not link or pub < cutoff or not any(n in title for n in names) or norm in seen
                        or EXCLUDE_RE.search(title) or is_roundup(title)):
                    continue
                seen.add(norm)
                rows.append((link, brand, title[:300], src, classify(title), pub, provider))
    with conn, conn.cursor() as cur:
        if rows:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO ext_brand_news (link, brand, title, source, kind, pub_at, provider) VALUES %s
                ON CONFLICT (link) DO UPDATE SET title = EXCLUDED.title, kind = EXCLUDED.kind""", rows)
        cur.execute('DELETE FROM ext_brand_news WHERE pub_at < %s', (cutoff,))
        # 규칙이 바뀌어도 쌓인 기사에 다시 적용 (분류 갱신, 제외 대상 삭제)
        cur.execute('SELECT link, title, kind FROM ext_brand_news')
        drop, fix = [], []
        for link, title, kind in cur.fetchall():
            if EXCLUDE_RE.search(title) or is_roundup(title):
                drop.append(link)
            elif classify(title) != kind:
                fix.append((classify(title), link))
        if drop:
            cur.execute('DELETE FROM ext_brand_news WHERE link = ANY(%s)', (drop,))
        psycopg2.extras.execute_batch(cur, 'UPDATE ext_brand_news SET kind = %s WHERE link = %s', fix)
        n = group_stories(cur)
    log.info('브랜드 소식 %d건, %d개 소식으로 묶음 (%s)', len(rows), n, provider)


_COMMON = ['치킨', '이벤트', '할인', '출시', '판매', '진행', '고객', '신메뉴'] + [n for _, names in BRANDS for n in names]
_STOP = {w.lower()[i:i + 2] for w in _COMMON for i in range(len(w) - 1)}


def bigrams(title):
    t = re.sub(r'[^0-9A-Za-z가-힣]', '', re.sub(r'\[[^]]*\]', '', title)).lower()
    return {t[i:i + 2] for i in range(len(t) - 1)} - _STOP


def group_stories(cur):
    """브랜드별로 5일 이내 기사 중 제목 글자쌍(bigram)이 짧은 쪽 기준 50% 이상 겹치면 한 소식으로 묶음.
    브랜드명·'치킨'·'할인' 같은 흔한 단어는 비교에서 뺌. 대표 = 가장 이른 기사"""
    cur.execute('SELECT link, brand, title, pub_at FROM ext_brand_news ORDER BY brand, pub_at')
    groups = []  # [brand, rep_link, [bigram sets], last pub]
    assign = []
    for link, brand, title, pub in cur.fetchall():
        bg = bigrams(title)
        best = None
        for g in groups:
            if g[0] != brand or (pub - g[3]).days > 5 or not bg:
                continue
            sim = max(len(bg & m) / (min(len(bg), len(m)) or 1) for m in g[2])
            if sim >= 0.5 and (best is None or sim > best[0]):
                best = (sim, g)
        if best:
            g = best[1]
            g[2].append(bg)
            g[3] = pub
            assign.append((g[1], link))
        else:
            groups.append([brand, link, [bg], pub])
            assign.append((link, link))
    psycopg2.extras.execute_batch(cur, 'UPDATE ext_brand_news SET story = %s WHERE link = %s', assign)
    return len(groups)


# ------------------------------------------------------------------
def update(conn, only=None, weather_from=None):
    """POS 수집 뒤 호출. 항목별로 실패해도 나머지는 계속. 반환: 실패 수"""
    with conn, conn.cursor() as cur:
        cur.execute(SCHEMA)
    key = os.environ.get('DATA_GO_KR_KEY')
    jobs = {
        'holiday': lambda: update_holidays(conn),
        'weather': (lambda: update_weather(conn, key, weather_from)) if key else None,
        'forecast': (lambda: update_forecast(conn, key)) if key else None,
        'news': lambda: update_news(conn),
    }
    failed = 0
    for name, job in jobs.items():
        if only and name != only:
            continue
        if job is None:
            log.info('%s: DATA_GO_KR_KEY 없음 — 건너뜀', name)
            continue
        try:
            job()
        except Exception:
            failed += 1
            conn.rollback()
            log.exception('%s 수집 실패', name)
    return failed


def main():
    load_env(Path(__file__).resolve().parent / '.env')
    logging.basicConfig(level=logging.INFO, format='[%(levelname)s %(asctime)s] %(message)s', stream=sys.stdout)
    ap = argparse.ArgumentParser(description='외부 데이터 수집')
    ap.add_argument('--only', choices=['holiday', 'weather', 'forecast', 'news'])
    ap.add_argument('--weather-from', type=lambda s: datetime.datetime.strptime(s, '%Y%m%d').date())
    args = ap.parse_args()
    conn = psycopg2.connect(connect_timeout=10)
    try:
        return 1 if update(conn, args.only, args.weather_from) else 0
    finally:
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
