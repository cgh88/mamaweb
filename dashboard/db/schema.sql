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

-- 대시보드 접속 계정(mamadash) 권한: 매출 데이터는 조회만, 매핑·매장 정보와 대시보드 테이블만 수정
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mamadash') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO mamadash';
    EXECUTE 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO mamadash';
    EXECUTE 'GRANT INSERT, UPDATE ON pos_menu_map, store_info TO mamadash';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON dash_users, dash_sessions, dash_audit TO mamadash';
    EXECUTE 'GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mamadash';
    -- 이후 새로 만드는 테이블·뷰도 조회 가능하도록
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mamadash';
  END IF;
END $$;
