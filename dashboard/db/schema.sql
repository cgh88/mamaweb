-- 대시보드 전용 테이블 (mamapos DB, 소유자 mamapos 계정으로 실행 — scripts/init-db.js)
-- 반복 실행해도 안전 (IF NOT EXISTS)

-- 로그인 계정: 비밀번호는 scrypt 해시만 저장
CREATE TABLE IF NOT EXISTS dash_users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  salt          TEXT NOT NULL,
  hash          TEXT NOT NULL,
  must_change   BOOLEAN NOT NULL DEFAULT true,   -- 첫 로그인 시 비밀번호 변경 강제
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- 로그인 세션: 토큰 원문 대신 SHA-256 해시 저장
CREATE TABLE IF NOT EXISTS dash_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES dash_users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 변경 이력: 로그인, 비밀번호 변경, 메뉴 매핑·매장 정보 수정
CREATE TABLE IF NOT EXISTS dash_audit (
  id      BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES dash_users (id) ON DELETE SET NULL,
  action  TEXT NOT NULL,
  detail  JSONB,
  ip      TEXT,
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 메뉴 매핑 '최근 추가' 목록용
ALTER TABLE pos_menu_map ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------- 식자재·재고
-- 식자재 (unit: 레시피·재고 기본 단위, pack_*: 발주 단위 환산용 예) 박스 = 10000 g)
CREATE TABLE IF NOT EXISTS inv_ingredient (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  unit       TEXT NOT NULL,
  pack_name  TEXT,
  pack_size  NUMERIC(14,3) CHECK (pack_size IS NULL OR pack_size > 0),
  active     BOOLEAN NOT NULL DEFAULT true,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 레시피: 표준 메뉴(분류 + 표준명, v_pos_sales_item 기준) 1개에 들어가는 식자재 양 (옵션 행도 등록 가능)
CREATE TABLE IF NOT EXISTS inv_recipe (
  category      TEXT NOT NULL,
  std_name      TEXT NOT NULL,
  ingredient_id INTEGER NOT NULL REFERENCES inv_ingredient (id) ON DELETE CASCADE,
  qty           NUMERIC(14,3) NOT NULL CHECK (qty > 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (category, std_name, ingredient_id)
);

-- 재고 실사: count_date 영업 마감 후(다음 날 오픈 전) 실제 수량
CREATE TABLE IF NOT EXISTS inv_stock_count (
  id            SERIAL PRIMARY KEY,
  store_name    TEXT NOT NULL,
  ingredient_id INTEGER NOT NULL REFERENCES inv_ingredient (id) ON DELETE CASCADE,
  count_date    DATE NOT NULL,
  qty           NUMERIC(14,3) NOT NULL CHECK (qty >= 0),
  created_by    INTEGER REFERENCES dash_users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_stock_count_idx ON inv_stock_count (store_name, ingredient_id, count_date DESC, id DESC);

-- 입고 (receipt_date 영업 중 입고 → 실사일보다 뒤인 입고만 추정 재고에 더함)
CREATE TABLE IF NOT EXISTS inv_receipt (
  id            SERIAL PRIMARY KEY,
  store_name    TEXT NOT NULL,
  ingredient_id INTEGER NOT NULL REFERENCES inv_ingredient (id) ON DELETE CASCADE,
  receipt_date  DATE NOT NULL,
  qty           NUMERIC(14,3) NOT NULL CHECK (qty > 0),
  note          TEXT,
  created_by    INTEGER REFERENCES dash_users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_receipt_idx ON inv_receipt (store_name, ingredient_id, receipt_date);

-- 매장별 안전재고
CREATE TABLE IF NOT EXISTS inv_safety (
  store_name    TEXT NOT NULL,
  ingredient_id INTEGER NOT NULL REFERENCES inv_ingredient (id) ON DELETE CASCADE,
  safety_qty    NUMERIC(14,3) NOT NULL CHECK (safety_qty >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_name, ingredient_id)
);

-- 대시보드 접속 계정(mamadash) 권한: 매출 데이터는 조회만, 매핑·매장 정보와 대시보드 테이블만 수정
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mamadash') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO mamadash';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO mamadash';
    EXECUTE 'GRANT INSERT, UPDATE ON pos_menu_map, store_info TO mamadash';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON dash_users, dash_sessions, dash_audit TO mamadash';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON inv_ingredient, inv_recipe, inv_stock_count, inv_receipt, inv_safety TO mamadash';
    EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mamadash';
    -- 이후 새로 만드는 테이블·뷰도 조회 가능하도록
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mamadash';
  END IF;
END $$;
