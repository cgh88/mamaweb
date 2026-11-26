"""마마치킨 POS 매출 수집 (SMARTRO 스마일비즈 API → PostgreSQL)

기존 mama_data_header_input*.py / mama_data_detail_input*.py (매장별 6개 파일)를 하나로 통합.

  python3 pos_sync.py                         # 어제(KST)부터 SYNC_DAYS일치를 전 매장 수집
  python3 pos_sync.py --date 20261125         # 특정 일자
  python3 pos_sync.py --from 20261101 --to 20261125 --store 7915301   # 기간/매장 지정 (과거 데이터 채우기)

- API 조회 가능 기간: 현재 월 기준 2년 전 1일부터 (예: 2026-11 → 2024-11-01~). 그 이전은 기존 MySQL에서 이관

- 매장·일자 단위로 한 트랜잭션: 기존 행 삭제 → 전 페이지 재수집 후 저장. 여러 번 실행해도 중복 없음
  (도중에 API 오류가 나면 롤백되어 기존 데이터 유지)
- API가 '조회된 데이터가 없습니다'를 주면 기존 데이터를 지우지 않고 건너뜀
- 설정은 같은 폴더의 .env (POS_API_TOKEN, POS_STORE_CODES, PG*) — git에 올리지 않음
"""
import argparse
import datetime
import logging
import os
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg2
import requests

KST = ZoneInfo('Asia/Seoul')
API_BASE = 'https://exttran.smilebiz.co.kr/V1/sales'
PAGE_SIZE = 100
OK_CODE = '0000'
NO_DATA_MESSAGE = '조회된 데이터가 없습니다.'

log = logging.getLogger('pos_sync')

# 저장할 필드: API 필드명 → PostgreSQL 타입 (컬럼명은 소문자)
# 기존 MySQL 프로그램이 저장하던 필드와 동일. 고객명/고객ID(PNTASP_*) 등 이후 추가된 필드는 저장하지 않음
N = 'NUMERIC(15,2)'
HEADER_FIELDS = {
    'AX_ETC': N, 'SERVICE_AMT': N, 'COUPON_VALUE': N, 'YN_VAT': 'TEXT', 'GROSS_AMT': N, 'DC_AMT': N,
    'AX_POINT': N, 'COUPON_DESC': 'TEXT', 'SALE_STAT': 'TEXT', 'DC_USED_RATE': N, 'UP_DATE': 'TIMESTAMP',
    'TAXRATE': N, 'AX_CMSDC': N, 'DT_CLOSE': 'TEXT', 'AX_COUPON': N, 'ORDER_DATE': 'TIMESTAMP', 'POS_NO': 'TEXT',
    'RET_INV_SEQ': 'TEXT', 'YN_CREDIT': 'TEXT', 'AX_CREDIT': N, 'STORE_CODE': 'TEXT', 'TBL_CLA1NAME': 'TEXT',
    'AX_DC': N, 'YN_COUPON': 'TEXT', 'AX_BANK': N, 'QTY_SUM': N, 'AX_CASH': N, 'DC_USED_TYPE': 'TEXT',
    'PRODUCT_AMT': N, 'ORDER_POS_NO': 'TEXT', 'YN_END': 'TEXT', 'DC_REASON_CODE': 'TEXT', 'DEPOSIT_FEE': N,
    'SERVICE_FEE': N, 'INV_PRTNUM': 'TEXT', 'TBL_CLA2NAME': 'TEXT', 'AX_AMT': N, 'ID_MEMO': 'TEXT', 'NET_AMT': N,
    'ETC_CHARGE': N, 'COUPON_AMT': N, 'AX_CARD': N, 'SALE_TYPE': 'TEXT', 'ROW_NUM': 'INTEGER', 'SUB_TOT': N,
    'SALE_DATE': 'DATE', 'GRAND_TOTAL': N, 'YN_CLOSE': 'TEXT', 'CLOSE_DATE': 'TIMESTAMP', 'TBL_CLA1': 'TEXT',
    'TBL_CLA2': 'TEXT', 'NOTAX_TOT': N, 'CR_DATE': 'TIMESTAMP', 'INV_SEQ': 'TEXT', 'COUPON_CODE': 'TEXT',
    'YN_PRINT': 'TEXT', 'AX_CASHRECEPT': N, 'DC_REASON_DESC': 'TEXT', 'COUPON_COUNT': 'INTEGER', 'TAX_TOT': N,
}
DETAIL_FIELDS = {
    'YN_SET_OPTION': 'TEXT', 'POTOTAL': N, 'SERVICE_AMT': N, 'COUPON_VALUE': N, 'YN_VAT': 'TEXT', 'ID_MENU': 'TEXT',
    'INV_STS': 'TEXT', 'QTY_DELIVERY': N, 'INV_TYPE': 'TEXT', 'QTY': N, 'SALE_STAT': 'TEXT', 'ID_CODE': 'TEXT',
    'DC_USED_RATE': N, 'UP_DATE': 'TIMESTAMP', 'DIFF_AMT': N, 'TAXRATE': N, 'POS_NO': 'TEXT', 'STORE_CODE': 'TEXT',
    'QTY_SERVICE': N, 'YN_TAX': 'TEXT', 'SUMPRICE': N, 'YN_COUPON': 'TEXT', 'ID_DESC': 'TEXT', 'DC_USED_TYPE': 'TEXT',
    'POPRICE': N, 'PRODUCT_AMT': N, 'DC_REASON_CODE': 'TEXT', 'YN_END': 'TEXT', 'DEPOSIT_FEE': N, 'SERVICE_FEE': N,
    'YN_SET': 'TEXT', 'ID_MEMO': 'TEXT', 'NET_AMT': N, 'ETC_CHARGE': N, 'COUPON_AMT': N, 'ID_MENUNAME': 'TEXT',
    'COMPANY_ID': 'TEXT', 'QTY_PACKING': N, 'QTYPRICE': N, 'ROW_NUM': 'INTEGER', 'SUB_TOT': N, 'SALE_DATE': 'DATE',
    'GRAND_TOTAL': N, 'ADD_PRICE': N, 'YN_SERVICE': 'TEXT', 'INV_NOS': 'INTEGER', 'POSPRICE': N, 'NOTAX_TOT': N,
    'ID_ALTC': 'TEXT', 'CR_DATE': 'TIMESTAMP', 'INV_SEQ': 'TEXT', 'COUPON_CODE': 'TEXT', 'YN_NOTAX': 'TEXT',
    'DATA_STAT': 'TEXT', 'POINT': 'INTEGER', 'DC_REASON_DESC': 'TEXT', 'COUPON_COUNT': 'INTEGER', 'TAX_TOT': N,
}

# (API 이름, 테이블, 필드, 기본키) — 기본키는 실제 응답으로 중복 없음을 확인한 조합
DATASETS = [
    ('getSaleHeadInfo', 'pos_order_header', HEADER_FIELDS, ('inv_seq',)),
    ('getSaleDetailInfo', 'pos_order_detail', DETAIL_FIELDS, ('inv_seq', 'inv_nos')),
]


def load_env(path):
    """KEY=VALUE 형식의 .env를 읽어 환경변수에 없는 값만 설정"""
    if not path.exists():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip())


def ensure_schema(conn):
    with conn, conn.cursor() as cur:
        for _, table, fields, pk in DATASETS:
            cols = ',\n  '.join(f'{name.lower()} {sqltype}' for name, sqltype in fields.items())
            cur.execute(
                f'CREATE TABLE IF NOT EXISTS {table} (\n  {cols},\n'
                f'  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  PRIMARY KEY ({", ".join(pk)})\n)'
            )
            cur.execute(f'CREATE INDEX IF NOT EXISTS {table}_store_date_idx ON {table} (store_code, sale_date)')


def to_db(value, sqltype):
    # API는 빈 날짜/숫자를 ''로 주므로 NULL로 변환
    if value == '' and sqltype != 'TEXT':
        return None
    return value


def fetch_page(session, api, store, sale_date, page):
    url = f'{API_BASE}/{api}'
    params = {'STORE_CODE': store, 'SALE_DATE': sale_date, 'PAGE_SIZE': PAGE_SIZE, 'PAGE_NO': page}
    for attempt in range(1, 4):
        try:
            res = session.get(url, params=params, timeout=30)
            try:
                data = res.json()
            except ValueError:
                data = None
            # 업무 오류(예: EXT_COMM-2010 조회 가능 기간 초과)는 HTTP 500 + JSON으로 오며 재시도해도 같으므로 바로 반환
            if data is not None and (res.ok or data.get('CODE')):
                return data
            res.raise_for_status()
            raise ValueError('JSON이 아닌 응답')
        except (requests.RequestException, ValueError) as err:
            if attempt == 3:
                raise
            log.warning('%s %s %s p%d 재시도 %d/3: %s', api, store, sale_date, page, attempt, err)
            time.sleep(5 * attempt)


def fetch_all(session, api, store, sale_date):
    """전 페이지 조회. 데이터 없음이면 None"""
    rows, page = [], 1
    while True:
        data = fetch_page(session, api, store, sale_date, page)
        if data.get('MESSAGE') == NO_DATA_MESSAGE and page == 1:
            return None
        if data.get('CODE') != OK_CODE:
            raise RuntimeError(f'API 오류 {api} {store} {sale_date} p{page}: {data.get("CODE")} {data.get("MESSAGE")}')
        rows.extend(data.get('SALE_INFO') or [])
        if page >= int(data.get('PAGE_TOTAL') or 1):
            return rows
        page += 1
        time.sleep(0.5)


def sync_one(conn, session, store, day):
    sale_date = day.strftime('%Y%m%d')
    for api, table, fields, _ in DATASETS:
        rows = fetch_all(session, api, store, sale_date)
        if rows is None:
            log.info('%s %s %s: 데이터 없음 (기존 데이터 유지)', store, day, table)
            continue
        names = list(fields)
        cols = ', '.join(n.lower() for n in names)
        placeholders = ', '.join(['%s'] * len(names))
        with conn, conn.cursor() as cur:
            cur.execute(f'DELETE FROM {table} WHERE store_code = %s AND sale_date = %s', (store, day))
            deleted = cur.rowcount
            cur.executemany(
                f'INSERT INTO {table} ({cols}) VALUES ({placeholders})',
                [tuple(to_db(r.get(n), fields[n]) for n in names) for r in rows],
            )
        log.info('%s %s %s: %d건 저장 (기존 %d건 교체)', store, day, table, len(rows), deleted)


def parse_day(s):
    return datetime.datetime.strptime(s, '%Y%m%d').date()


def main():
    base = Path(__file__).resolve().parent
    load_env(base / '.env')
    logging.basicConfig(level=logging.INFO, format='[%(levelname)s %(asctime)s] %(message)s', stream=sys.stdout)

    yesterday = datetime.datetime.now(KST).date() - datetime.timedelta(days=1)
    parser = argparse.ArgumentParser(description='마마치킨 POS 매출 수집')
    parser.add_argument('--date', type=parse_day, help='수집 일자 YYYYMMDD')
    parser.add_argument('--from', dest='date_from', type=parse_day, help='시작 일자 YYYYMMDD')
    parser.add_argument('--to', dest='date_to', type=parse_day, help='종료 일자 YYYYMMDD (기본: 어제)')
    parser.add_argument('--store', action='append', help='매장 코드 (여러 번 지정 가능, 기본: POS_STORE_CODES)')
    args = parser.parse_args()

    if args.date:
        days = [args.date]
    else:
        end = args.date_to or yesterday
        # 기본: 어제 포함 SYNC_DAYS일 재수집 (사후 취소/반품 반영)
        start = args.date_from or end - datetime.timedelta(days=int(os.environ.get('POS_SYNC_DAYS', '3')) - 1)
        days = [start + datetime.timedelta(days=i) for i in range((end - start).days + 1)]
    stores = args.store or [s.strip() for s in os.environ['POS_STORE_CODES'].split(',') if s.strip()]

    session = requests.Session()
    session.headers.update({'Authorization': f'Bearer {os.environ["POS_API_TOKEN"]}', 'Accept': 'application/json'})
    conn = psycopg2.connect(connect_timeout=10)  # PGHOST/PGDATABASE/PGUSER/PGPASSWORD 환경변수 사용
    failed = 0
    try:
        ensure_schema(conn)
        log.info('수집 시작: 매장 %s, 일자 %s ~ %s', ','.join(stores), days[0], days[-1])
        for store in stores:
            for day in days:
                try:
                    sync_one(conn, session, store, day)
                except Exception:  # 한 매장·일자가 실패해도 나머지는 계속
                    failed += 1
                    log.exception('%s %s 수집 실패', store, day)
    finally:
        conn.close()
    log.info('수집 종료: 실패 %d건', failed)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
