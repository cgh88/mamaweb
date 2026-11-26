"""POS 주문상세 메뉴 표준화: 원본 메뉴명 → 홈페이지 정상 메뉴(mamaweb.menu_items) 매핑

배달앱 주문은 메뉴코드가 앱별 공용 코드(BM2101, CP2101 …)이고 실제 메뉴명은 앱마다 다르게 적힌 자유 텍스트(id_desc)라
그대로 집계하면 같은 메뉴가 수십 가지 표기로 쪼개진다. 매장 POS 메뉴도 같은 메뉴가 코드·분류별로 중복된다.

  web_menu_items     홈페이지 메뉴(mamaweb.menu_items) 사본 — 실행할 때마다 갱신 (읽기 전용 권한으로 조회)
  pos_menu_map       원본 (구분, POS분류, 메뉴명) → 홈페이지 메뉴 id + 표준 메뉴명/분류/부위/맛
                     source='auto' 규칙 자동 생성, 'manual' 사람이 수정한 행 (자동 갱신이 덮어쓰지 않음)
  v_pos_sales_item   주문상세 + 매핑 결과 + 판매채널. 메뉴 집계는 이 뷰에서 is_option = false 조건으로

매핑 기준
  - 후라이드(바사삭/마일드/스파이시 등)            → '마일드 후라이드 {부위}'
  - 메뉴명에 소스가 하나로 적힌 치킨(마마양념치킨 등) → '{소스} {부위}'
  - 반반/소스 선택형(소스는 옵션 행으로 따로 들어옴)  → 홈페이지 메뉴 없음, 표준명 '반반·소스선택 {부위}'
  - 배달앱 0원 옵션 행 중 소스 선택                 → 베이스 소스 메뉴 (is_option = true, 매출 집계 제외)
  - 딥소스·사이드                                    → 해당 홈페이지 메뉴, 없으면 표기만 통일
  - 음료·주류·버거 등 홈페이지에 없는 품목            → 분류만 지정 (menu_item_id 없음)

  python3 menu_map.py                 # 새로 나온 메뉴명만 자동 매핑 (매일 수집 후 자동 실행)
  python3 menu_map.py --reclassify    # 규칙 변경 후 auto 행 전체 재분류 (manual 행은 유지)
  python3 menu_map.py --report        # 표준 메뉴별로 묶인 원본 메뉴명 출력

수동 수정 예 (DBeaver, mamapos DB):
  UPDATE pos_menu_map SET menu_item_id = 8, std_name = '마일드 후라이드 한마리 10P', category = '후라이드 치킨',
         source = 'manual' WHERE src = 'APP' AND item_text = '…';
"""
import argparse
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import psycopg2

# 판매채널: id_code 접두어 → 이름 (숫자 코드 = 매장 POS 메뉴)
CHANNELS = {'BM': '배달의민족', 'CP': '쿠팡이츠', 'YG': '요기요', 'BDP': '배달앱(BDP)', 'SMTDP': '배달대행'}

SCHEMA = """
CREATE TABLE IF NOT EXISTS web_menu_items (
  id INTEGER PRIMARY KEY, category TEXT NOT NULL, sub_tab TEXT, name TEXT NOT NULL, name_en TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_menu_map (
  src          TEXT NOT NULL,              -- 'POS' 매장 메뉴 / 'APP' 배달앱 메뉴
  menu_group   TEXT NOT NULL DEFAULT '',   -- POS 메뉴분류(id_menuname). 배달앱은 ''
  item_text    TEXT NOT NULL,              -- 원본 메뉴명(id_desc, 앞뒤 공백 제거)
  is_option    BOOLEAN NOT NULL DEFAULT false, -- 옵션/요청사항 (메뉴 매출 집계 제외)
  menu_item_id INTEGER,                    -- 홈페이지 메뉴(web_menu_items.id), 해당 메뉴가 없으면 NULL
  std_name     TEXT NOT NULL,              -- 표준 메뉴명 (홈페이지 메뉴가 있으면 그 이름)
  category     TEXT NOT NULL,              -- 홈페이지 분류(후라이드 치킨/소스 치킨/베이스 소스/딥 소스/사이드) 또는 기타 분류
  cut          TEXT,                       -- 치킨 부위: 반마리 5P/한마리 10P/다리 8P/윙봉 10P/윙봉 20P/순살 600g/콤보
  flavor       TEXT,                       -- 치킨 맛: 후라이드 / 소스명 / 반반·소스선택
  source       TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (src, menu_group, item_text)
);

CREATE OR REPLACE VIEW v_pos_sales_item AS
SELECT
  d.store_code, d.sale_date, d.inv_seq, d.inv_nos, d.id_code,
  CASE WHEN d.id_code ~ '^[A-Z]'
       THEN COALESCE((%(channel_case)s), '배달앱(' || regexp_replace(d.id_code, '[0-9].*$', '') || ')')
       ELSE '매장' END                                    AS channel,
  btrim(d.id_desc)                                       AS item_text,
  COALESCE(m.is_option, d.id_code ~ '^[A-Z]' AND COALESCE(d.qtyprice, 0) = 0) AS is_option,
  m.menu_item_id,
  -- 메뉴명이 빈 행은 자동절사·취소 등 금액 조정 행 (매출 합계에는 포함)
  COALESCE(m.std_name, CASE WHEN COALESCE(btrim(d.id_desc), '') = '' THEN '금액 조정'
                            ELSE '미분류: ' || btrim(d.id_desc) END) AS std_name,
  COALESCE(m.category, CASE WHEN COALESCE(btrim(d.id_desc), '') = '' THEN '할인·조정' ELSE '미분류' END) AS category,
  m.cut, m.flavor,
  d.qty, d.qtyprice, d.sumprice, d.dc_reason_desc
FROM pos_order_detail d
LEFT JOIN pos_menu_map m
  ON m.src = CASE WHEN d.id_code ~ '^[A-Z]' THEN 'APP' ELSE 'POS' END
 AND m.menu_group = CASE WHEN d.id_code ~ '^[A-Z]' THEN '' ELSE COALESCE(d.id_menuname, '') END
 AND m.item_text = btrim(d.id_desc);
"""


def channel_case():
    whens = ' '.join(f"WHEN d.id_code LIKE '{p}%' THEN '{n}'" for p, n in sorted(CHANNELS.items(), key=lambda x: -len(x[0])))
    return f'CASE {whens} END'


# ---------------------------------------------------------------- 정규화·사전
def norm(s):
    """비교용 정규화: 소문자, 취소/번호/└ 접두어 제거, 흔한 표기 차이 통일, 공백·기호 제거"""
    s = (s or '').lower().strip()
    s = re.sub(r'^(└\s*|\(\s*(부분)?취소\s*\)\s*|\d+\.\s+)', '', s)
    for a, b in (('1/25l', '1.25l'), ('코카콜라', '콜라'), ('코카 콜라', '콜라'), ('pcs', 'p'), ('개', 'p'), ('조각', 'p'),
                 ('프라이드', '후라이드'), ('렌치', '랜치'), ('붉닭', '불닭'), ('떡복이', '떡볶이'),
                 ('스위트앤사워', '스윗앤사워'), ('스위트 앤 사워', '스윗앤사워'), ('사우어', '사워'), ('치킨 무', '치킨무')):
        s = s.replace(a, b)
    return re.sub(r'[^0-9a-z가-힣.]', '', s)


# 베이스 소스(= 소스 치킨 서브탭): 홈페이지 sub_tab 이름 → 메뉴명에서 찾을 패턴
BASE_SAUCES = [
    ('매운양념', r'매운양념'),
    ('마마양념', r'마마양념'),
    ('아메리칸 징', r'아메리칸징|아메리칸'),
    ('저크', r'저크'),
    ('버팔로', r'버팔로'),
    ('레몬페퍼', r'레몬페퍼'),
    ('마늘간장', r'마늘간장'),
    ('오렌지', r'오렌지'),
    ('블랙페퍼', r'블랙페퍼'),
    ('삼양불닭', r'불닭'),
]
GENERIC_SAUCE = ('마마양념', r'양념')  # 소스명 없이 '양념'만 있으면 마마양념
# 홈페이지에 없는 소스 치킨 (맛 이름만 기록)
EXTRA_SAUCES = [('마마콘소메', r'콘소메'), ('스위트갈릭', r'스위트갈릭|스윗갈릭'), ('핫양념바베큐', r'핫양념바베큐|바베큐')]
DIP_SAUCES = [('화이트 소스', r'화이트'), ('렌치', r'랜치'), ('허니버터', r'허니버터'),
              ('망고 하바네로', r'망고하바네로|하바네로'), ('스윗 앤 사우어', r'스윗앤사워|새콤달콤')]
SIDES = [('케이준 감자튀김', r'케이준(감자|후라이)'), ('포테이토칩', r'포테이토칩'), ('어니언 프라이', r'어니언프라이'),
         ('멘보샤 5P', r'멘보샤'), ('치즈볼 5P', r'(?<!맥앤)(?<!맥엔)치즈볼'), ('통새우튀김 5P', r'통새우튀김'),
         ('후라이드 콘립', r'콘립'), ('모듬 감자튀김', r'모듬감자'), ('불꽃 오징어🦑', r'오징어'), ('국물 떡볶이', r'국물떡볶이')]

CUTS = ['반마리 5P', '한마리 10P', '다리 8P', '윙봉 10P', '윙봉 20P', '순살 600g']
CHICKEN_HINT = re.compile(r'치킨|후라이드|윙봉|순살|한마리|반마리|마마치킨|닭다리|다리\d|콤보|12호|1\.2kg|\d+p|10각|소스한마리|소스반마리|소스다리')
NOT_CHICKEN = re.compile(r'버거|콘립|감자|떡볶이|소떡|핫도그|치킨무|볼$|볼\(|너겟|나초|어니언|웨지|포테이토|해쉬|해시|버켓'
                         r'|새우|튀김|닭발|오징어|먹태|멘보샤')
SET_MENU = re.compile(r'세트|플래터|\+|이벤트|치맥')
REQUEST = re.compile(r'빼주세요|주세요|해주세요|적게|많이|요청|따로|안넣|빼고')


def detect_cut(text):
    if '콤보' in text:
        return '콤보'
    if '윙' in text:
        m = re.search(r'윙봉?\D{0,6}?(\d+)p|(\d+)p\D{0,6}?윙|윙봉?(\d+)', text)
        num = next((g for g in (m.groups() if m else ()) if g), '20')
        return '윙봉 10P' if num == '10' else '윙봉 20P'
    if re.search(r'닭다리|다리\d|다리\D{0,3}\d+p|^다리|소스다리|후라이드다리', text) and '통다리살' not in text:
        return '다리 8P'
    if '순살' in text or re.search(r'600g|650g', text):
        return '순살 600g'
    if '반마리' in text or re.search(r'(?<!\d)5p', text):
        return '반마리 5P'
    if re.search(r'(?<!\d)20p', text) and not re.search(r'한마리|12호|1\.2kg', text):
        return '윙봉 20P'  # '마마양념 20P'처럼 부위 없이 20P만 있으면 윙봉
    return '한마리 10P'


def detect_flavor(text):
    """→ (맛, 홈페이지 소스명 or None). 홈페이지에 없는 소스 → 특정 소스 → 반반/소스선택 → 일반 '양념' → 후라이드"""
    for name, pat in EXTRA_SAUCES:
        if re.search(pat, text):
            return name, None
    for name, pat in BASE_SAUCES:
        if re.search(pat, text):
            return name, name
    if re.search(r'반반|소스\d*종|소스택1|소스선택|소스치킨|^소스|양념치킨반마리|^양념치킨', text):
        return '반반·소스선택', None
    if re.search(GENERIC_SAUCE[1], text):
        return GENERIC_SAUCE[0], GENERIC_SAUCE[0]
    return '후라이드', '후라이드'


def find(table, text):
    return next((name for name, pat in table if re.search(pat, text)), None)


def classify_other(n):
    if re.search(r'배달|팁', n):
        return '배달비'
    if re.search(r'할인|마이너스|쿠폰', n):
        return '할인·조정'
    if re.search(r'행복|이벤트|증정|리뷰', n):
        return '이벤트'
    if re.search(r'카스|테라|참이슬|처음처럼|새로|버드|산토리|아사히|삿뽀로|진로|맥주|하이볼|소주|켈리|크러쉬|하이네켄|클라우드|막걸리|\(생\)|생\d', n):
        return '주류'
    if re.search(r'콜라|사이다|스프라이트|환타|음료|탄산|생수|ml|1.25l|1.5l|에이드|아이스티|펩시', n):
        return '음료'
    if '버거' in n:
        return '버거'
    if n in ('치킨무', '무') or n.endswith('치킨무'):
        return '치킨무'
    if re.search(r'사리|추가|토핑', n):
        return '토핑'
    return '사이드'


class Classifier:
    def __init__(self, web_menu):
        # (맛, 부위) → 메뉴 / 이름 → 메뉴
        self.chicken, self.by_name = {}, {}
        for mid, cat, sub, name in web_menu:
            if cat == 'BEST MENU':
                # 대부분 다른 분류와 중복 등록된 대표 메뉴 — 원래 분류 메뉴를 우선하고, BEST에만 있는 메뉴(국물 떡볶이)만 사용
                self.by_name[(cat, name)] = mid
                continue
            self.by_name[(cat, name)] = mid
            if cat in ('후라이드 치킨', '소스 치킨'):
                flavor = '후라이드' if cat == '후라이드 치킨' else sub
                cut = next((c for c in CUTS if norm(c) in norm(name)), None)
                if cut:
                    self.chicken[(flavor, cut)] = (mid, name, cat)
        self.base = {name: self.by_name.get(('베이스 소스', name)) for name, _ in BASE_SAUCES}

    def menu(self, cat, name):
        return self.by_name.get((cat, name))

    def classify(self, src, group, text, price):
        """→ dict(is_option, menu_item_id, gkey(표준명 결정용), category, cut, flavor)"""
        n, g = norm(text), norm(group)
        r = dict(is_option=False, menu_item_id=None, category='기타', cut=None, flavor=None, std=None)
        if not n:
            return {**r, 'std': '(이름없음)'}

        # 배달앱 0원 옵션: 소스 선택이면 베이스 소스로, 나머지는 옵션 그대로
        if src == 'APP' and price == 0:
            sauce = find([(s, p) for s, p in BASE_SAUCES], n)
            if sauce and not CHICKEN_HINT.search(n.replace('치킨', '')):
                return {**r, 'is_option': True, 'menu_item_id': self.base.get(sauce), 'category': '옵션(소스선택)',
                        'flavor': sauce, 'std': sauce}
            return {**r, 'is_option': True, 'category': '옵션', 'std': None}

        if src == 'POS' and price == 0 and REQUEST.search(n):
            return {**r, 'is_option': True, 'category': '요청사항', 'std': None}

        # 세트·플래터·이벤트 (치킨+사이드 묶음 등)
        if price >= 10000 and SET_MENU.search(text):
            return {**r, 'category': '세트·기타', 'std': None}

        # 치킨
        text_for_chicken = (g + n) if src == 'POS' else n
        if price >= 10000 and (CHICKEN_HINT.search(n) or (src == 'POS' and CHICKEN_HINT.search(g))) \
                and not NOT_CHICKEN.search(n):
            cut = detect_cut(text_for_chicken)
            flavor, web_flavor = detect_flavor(text_for_chicken)
            hit = self.chicken.get((web_flavor, cut)) if web_flavor else None
            if hit:
                mid, name, cat = hit
                return {**r, 'menu_item_id': mid, 'category': cat, 'cut': cut, 'flavor': flavor, 'std': name}
            cat = '후라이드 치킨' if flavor == '후라이드' else '소스 치킨'
            return {**r, 'category': cat, 'cut': cut, 'flavor': flavor, 'std': f'{flavor} {cut}'}

        # 딥소스 / 베이스 소스(디핑 컵) / 사이드 — 가격과 무관하게 이름으로 판정
        dip = find(DIP_SAUCES, n)
        if dip:
            return {**r, 'menu_item_id': self.menu('딥 소스', dip), 'category': '딥 소스', 'std': dip}
        if not CHICKEN_HINT.search(n) and price < 10000:
            extra = find(EXTRA_SAUCES, n)
            if extra:
                return {**r, 'category': '베이스 소스', 'flavor': extra, 'std': extra}
            base = find(BASE_SAUCES + [GENERIC_SAUCE], n)
            if base and (re.search(r'소스|디핑|딥', n + g) or len(n) <= 6):
                return {**r, 'menu_item_id': self.base.get(base), 'category': '베이스 소스', 'flavor': base, 'std': base}
        side = find(SIDES, n)
        if side:
            mid = self.menu('사이드', side) or self.menu('BEST MENU', side)
            return {**r, 'menu_item_id': mid, 'category': '사이드', 'std': side if mid else None}
        if price >= 10000:
            return {**r, 'category': '세트·기타', 'std': None}
        return {**r, 'category': classify_other(n), 'std': None}


# ---------------------------------------------------------------- DB 작업
KEYS_SQL = """
SELECT CASE WHEN id_code ~ '^[A-Z]' THEN 'APP' ELSE 'POS' END src,
       CASE WHEN id_code ~ '^[A-Z]' THEN '' ELSE COALESCE(id_menuname, '') END menu_group,
       btrim(id_desc) item_text,
       COALESCE(max(qtyprice), 0) price,  -- 서비스(0원)·취소 행이 섞여도 정가 기준으로 판정
       count(*) n
FROM pos_order_detail
WHERE id_desc IS NOT NULL AND btrim(id_desc) <> ''
GROUP BY 1, 2, 3
"""


def sync_web_menu(conn):
    """mamaweb.menu_items → web_menu_items (mamapos 계정의 읽기 전용 권한 사용)"""
    params = conn.get_dsn_parameters()
    with psycopg2.connect(dbname=os.environ.get('WEB_PGDATABASE', 'mamaweb'), user=params['user'],
                          host=params.get('host'), port=params.get('port'), connect_timeout=10) as web:
        with web.cursor() as cur:
            cur.execute('SELECT id, category, sub_tab, name, name_en FROM menu_items ORDER BY id')
            rows = cur.fetchall()
    web.close()
    with conn, conn.cursor() as cur:
        cur.execute('DELETE FROM web_menu_items')
        cur.executemany('INSERT INTO web_menu_items (id, category, sub_tab, name, name_en) VALUES (%s, %s, %s, %s, %s)', rows)
    return [(r[0], r[1], r[2], r[3]) for r in rows]


def update(conn, reclassify=False, log=print):
    with conn, conn.cursor() as cur:
        cur.execute(SCHEMA % {'channel_case': channel_case()})
    web_menu = sync_web_menu(conn)
    clf = Classifier(web_menu)
    with conn, conn.cursor() as cur:
        cur.execute(KEYS_SQL)
        keys = cur.fetchall()
        cur.execute('SELECT src, menu_group, item_text, source FROM pos_menu_map')
        existing = {(s, g, t): src for s, g, t, src in cur.fetchall()}

        # 표준명이 정해지지 않은 품목은 정규화 키가 같은 원본명끼리 묶고, 가장 많이 쓰인 표기를 표준명으로
        results, variants = {}, defaultdict(Counter)
        for src, grp, text, price, n in keys:
            r = clf.classify(src, grp, text, float(price))
            r['gkey'] = r['std'] or f"{r['category']}|{norm(text)}"
            results[(src, grp, text)] = r
            variants[r['gkey']][text] += n
        std_of = {k: (k if '|' not in k else c.most_common(1)[0][0]) for k, c in variants.items()}

        inserted = updated = 0
        for key, r in results.items():
            prev = existing.get(key)
            if prev == 'manual' or (prev == 'auto' and not reclassify):
                continue
            cur.execute(
                """INSERT INTO pos_menu_map (src, menu_group, item_text, is_option, menu_item_id, std_name, category, cut, flavor, source)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'auto')
                   ON CONFLICT (src, menu_group, item_text) DO UPDATE SET is_option = EXCLUDED.is_option,
                     menu_item_id = EXCLUDED.menu_item_id, std_name = EXCLUDED.std_name, category = EXCLUDED.category,
                     cut = EXCLUDED.cut, flavor = EXCLUDED.flavor, updated_at = now()
                   WHERE pos_menu_map.source = 'auto'""",
                (*key, r['is_option'], r['menu_item_id'], std_of[r['gkey']], r['category'], r['cut'], r['flavor']),
            )
            updated += bool(prev)
            inserted += not prev
    log(f'메뉴 매핑: 신규 {inserted}건, 재분류 {updated}건 (원본 메뉴명 {len(results)}개, 홈페이지 메뉴 {len(web_menu)}개)')
    return inserted


def report(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT m.category, m.std_name, m.menu_item_id, count(*) variants, sum(x.n) n, sum(x.amt) amt,
                   string_agg(m.item_text, ' / ' ORDER BY x.n DESC) samples
            FROM pos_menu_map m
            JOIN (SELECT CASE WHEN id_code ~ '^[A-Z]' THEN 'APP' ELSE 'POS' END src,
                         CASE WHEN id_code ~ '^[A-Z]' THEN '' ELSE COALESCE(id_menuname, '') END grp,
                         btrim(id_desc) t, count(*) n, sum(sumprice) amt
                  FROM pos_order_detail GROUP BY 1, 2, 3) x ON x.src = m.src AND x.grp = m.menu_group AND x.t = m.item_text
            WHERE NOT m.is_option
            GROUP BY 1, 2, 3 ORDER BY 1, sum(x.amt) DESC NULLS LAST""")
        for cat, name, mid, nv, n, amt, samples in cur.fetchall():
            tag = f'#{mid}' if mid else '  -'
            print(f'[{cat}] {tag} {name}  (표기 {nv}종, {n}행, {float(amt or 0):,.0f}원)  ← {samples[:150]}')


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from pos_sync import load_env
    load_env(Path(__file__).resolve().parent / '.env')
    ap = argparse.ArgumentParser(description='POS 메뉴 → 홈페이지 메뉴 매핑')
    ap.add_argument('--reclassify', action='store_true', help='auto 행을 현재 규칙으로 전부 재분류 (manual 유지)')
    ap.add_argument('--report', action='store_true', help='표준 메뉴별 묶인 원본 메뉴명 출력')
    args = ap.parse_args()
    conn = psycopg2.connect(connect_timeout=10)
    try:
        update(conn, reclassify=args.reclassify)
        if args.report:
            report(conn)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
