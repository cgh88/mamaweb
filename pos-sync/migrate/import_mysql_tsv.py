"""기존 MySQL 데이터(export_mysql.bat로 만든 TSV) → PostgreSQL 이관

  python3 migrate/import_mysql_tsv.py order_info.tsv order_detail.tsv [--cutoff 2024-11-01]

- API로 받을 수 없는 cutoff 이전 일자만 저장 (cutoff 이후는 API 수집 데이터가 원본)
- 같은 주문이 여러 번 들어간 중복은 기본키(inv_seq / inv_seq+inv_nos) 기준으로 하나만 남김
- 이관 범위의 기존 행을 지우고 다시 넣으므로 여러 번 실행해도 결과 동일 (한 트랜잭션)
- cutoff 이후(겹치는 기간)는 저장하지 않고 API 데이터와 일자별 건수·매출을 대조해 출력
"""
import argparse
import collections
import datetime
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pos_sync import DATASETS, load_env  # noqa: E402

TABLE_BY_FILE = {'order_info': DATASETS[0], 'order_detail': DATASETS[1]}
ESCAPES = {'\\t': '\t', '\\n': '\n', '\\r': '\r', '\\0': '\0', '\\\\': '\\'}


def unescape(field):
    """mysql --batch 출력 이스케이프 해제. 'NULL'은 None"""
    if field == 'NULL':
        return None
    if '\\' not in field:
        return field
    out, i = [], 0
    while i < len(field):
        pair = field[i:i + 2]
        if pair in ESCAPES:
            out.append(ESCAPES[pair])
            i += 2
        else:
            out.append(field[i])
            i += 1
    return ''.join(out)


def to_db(value, sqltype):
    if value is None:
        return None
    if sqltype != 'TEXT' and value.strip() == '':
        return None
    if sqltype == 'TIMESTAMP' and value.startswith('0000-00-00'):
        return None
    if sqltype == 'DATE':
        value = value.strip()[:10]
        if len(value) == 8 and value.isdigit():  # YYYYMMDD 형식 대응
            value = f'{value[:4]}-{value[4:6]}-{value[6:]}'
    return value


def read_tsv(path, fields):
    with open(path, encoding='utf-8', newline='') as f:
        header = f.readline().rstrip('\r\n').split('\t')
        missing = [n for n in fields if n not in header]
        if missing:
            raise SystemExit(f'{path}: 컬럼 없음 {missing}')
        idx = [header.index(n) for n in fields]
        for lineno, line in enumerate(f, 2):
            parts = line.rstrip('\r\n').split('\t')
            if len(parts) != len(header):
                raise SystemExit(f'{path}:{lineno} 컬럼 수 불일치 ({len(parts)} != {len(header)})')
            yield [to_db(unescape(parts[i]), fields[n]) for i, n in zip(idx, fields)]


def main():
    base = Path(__file__).resolve().parent.parent
    load_env(base / '.env')
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--cutoff', default='2024-11-01', help='이 날짜 이전만 저장 (YYYY-MM-DD)')
    args = ap.parse_args()
    cutoff = datetime.date.fromisoformat(args.cutoff).isoformat()

    conn = psycopg2.connect(connect_timeout=10)
    try:
        for path in args.files:
            _, table, fields, pk = TABLE_BY_FILE[Path(path).stem]
            names = list(fields)
            cols = [n.lower() for n in names]
            pk_idx = [cols.index(c) for c in pk]
            sd, up, st = cols.index('sale_date'), cols.index('up_date'), cols.index('store_code')
            gt = cols.index('grand_total')

            total = 0
            keep = {}  # 기본키 → 행 (중복이면 up_date가 늦은 것)
            later = {}  # cutoff 이후(API와 겹치는 기간) — 대조용, 저장하지 않음
            for row in read_tsv(path, fields):
                total += 1
                if row[sd] is None:
                    continue
                bucket = later if row[sd] >= cutoff else keep
                key = tuple(row[i] for i in pk_idx)
                prev = bucket.get(key)
                if prev is None or (row[up] or '') >= (prev[up] or ''):
                    bucket[key] = row
            rows = list(keep.values())
            overlap = collections.defaultdict(lambda: [0, 0.0])
            for row in later.values():
                o = overlap[(row[st], row[sd])]
                o[0] += 1
                o[1] += float(row[gt] or 0)
            print(f'== {path} → {table}: 전체 {total}행 → 이관 {len(rows)}행 (중복 제거), 대조용 {len(later)}행')
            if not rows:
                continue
            first = min(r[sd] for r in rows)

            with conn, conn.cursor() as cur:
                cur.execute(f'DELETE FROM {table} WHERE sale_date >= %s AND sale_date < %s', (first, cutoff))
                print(f'   기존 {cur.rowcount}행 삭제 ({first} ~ {cutoff} 이전)')
                execute_values(cur, f'INSERT INTO {table} ({", ".join(cols)}) VALUES %s', rows, page_size=1000)
                cur.execute(
                    f"""SELECT store_code, to_char(sale_date, 'YYYY-MM') m, count(*) FROM {table}
                        WHERE sale_date >= %s AND sale_date < %s GROUP BY 1, 2 ORDER BY 1, 2""",
                    (first, cutoff),
                )
                print('   매장별 월별 저장 건수:')
                for store, month, n in cur.fetchall():
                    print(f'     {store} {month} {n}')

            if overlap:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""SELECT store_code, sale_date::text, count(*), COALESCE(sum(grand_total), 0) FROM {table}
                            WHERE sale_date >= %s GROUP BY 1, 2""",
                        (cutoff,),
                    )
                    api = {(s, d): (n, float(t)) for s, d, n, t in cur.fetchall()}
                diff = [(k, v, api.get(k, (0, 0.0))) for k, v in sorted(overlap.items())
                        if (v[0], round(v[1], 2)) != (api.get(k, (0, 0.0))[0], round(api.get(k, (0, 0.0))[1], 2))]
                print(f'   겹치는 기간 대조 (MySQL vs API): {len(overlap)}개 매장·일자 중 차이 {len(diff)}개')
                for (store, day), m, a in diff[:15]:
                    print(f'     {store} {day}: MySQL {m[0]}건/{m[1]:,.0f}원  API {a[0]}건/{a[1]:,.0f}원')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
