"""대시보드 설정 페이지(/settings)에서 저장한 값을 읽어 환경변수에 적용 (.env보다 우선)

  dash_setting.value: 일반 값은 그대로, 비밀값은 'v1:' + base64(iv 12바이트 + 암호문 + 태그 16바이트)
  암호화: AES-256-GCM, 키 = 환경변수 SETTINGS_KEY(32바이트 base64, dashboard/.env와 같은 값), AAD = 설정 이름
"""
import base64
import os

import psycopg2

# 설정 페이지에서 관리하는 키만 적용 (DB 접속 정보 등은 .env 전용)
ALLOWED = {'POS_API_TOKEN', 'POS_STORE_CODES', 'POS_SYNC_DAYS', 'DATA_GO_KR_KEY', 'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'COMPETITOR_BRANDS'}


def decrypt(name, stored):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = base64.b64decode(os.environ.get('SETTINGS_KEY', ''))
    if len(key) != 32:
        raise ValueError('SETTINGS_KEY 없음')
    if not stored.startswith('v1:'):
        raise ValueError('알 수 없는 저장 형식')
    buf = base64.b64decode(stored[3:])
    return AESGCM(key).decrypt(buf[:12], buf[12:], name.encode()).decode('utf-8')


def apply_db_settings(conn, log=print):
    """적용한 키 이름 목록 반환. 테이블이 없거나 복호화에 실패한 값은 건너뜀 (.env 값 유지)"""
    applied = []
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT key, value, secret FROM dash_setting')
            rows = cur.fetchall()
        conn.rollback()
    except psycopg2.errors.UndefinedTable:
        conn.rollback()
        return applied
    for key, value, secret in rows:
        if key not in ALLOWED:
            continue
        try:
            os.environ[key] = decrypt(key, value) if secret else value
            applied.append(key)
        except Exception as err:  # 값은 로그에 남기지 않음
            log(f'설정 {key} 적용 실패 ({type(err).__name__}: {err}) — .env 값 사용')
    if applied:
        log(f'대시보드 설정 적용: {", ".join(sorted(applied))}')
    return applied
