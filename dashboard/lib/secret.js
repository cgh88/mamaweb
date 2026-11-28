import 'server-only';
import crypto from 'crypto';

/*
 * 설정 비밀값 암호화 (AES-256-GCM)
 *   키: 환경변수 SETTINGS_KEY (32바이트 base64) — dashboard/.env 와 pos-sync/.env 에 같은 값
 *   저장 형식: 'v1:' + base64(iv 12바이트 + 암호문 + 인증태그 16바이트), AAD = 설정 키 이름
 *   pos-sync/settings_store.py 가 같은 형식으로 복호화
 */
function masterKey() {
  const raw = process.env.SETTINGS_KEY;
  const key = raw ? Buffer.from(raw, 'base64') : null;
  if (!key || key.length !== 32) throw new Error('SETTINGS_KEY가 설정되지 않았습니다 (서버 .env, 32바이트 base64).');
  return key;
}

export const hasMasterKey = () => {
  try { masterKey(); return true; } catch { return false; }
};

export function encrypt(name, plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  c.setAAD(Buffer.from(name));
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64')}`;
}

export function decrypt(name, stored) {
  if (!stored?.startsWith('v1:')) throw new Error('알 수 없는 저장 형식');
  const buf = Buffer.from(stored.slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), buf.subarray(0, 12));
  d.setAAD(Buffer.from(name));
  d.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([d.update(buf.subarray(12, buf.length - 16)), d.final()]).toString('utf8');
}
