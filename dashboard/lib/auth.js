import 'server-only';
import crypto from 'crypto';
import { promisify } from 'util';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { q, q1 } from './db';

const scrypt = promisify(crypto.scrypt);
export const SESSION_COOKIE = 'mama_dash_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = (await scrypt(String(password), salt, 64)).toString('hex');
  return { salt, hash };
}

export async function verifyPassword(password, salt, hash) {
  const candidate = (await scrypt(String(password || ''), salt, 64));
  const actual = Buffer.from(hash, 'hex');
  return candidate.length === actual.length && crypto.timingSafeEqual(candidate, actual);
}

export function validateNewPassword(pw) {
  if (pw.length < 10) return '비밀번호는 10자 이상이어야 합니다.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return '영문과 숫자를 모두 포함해야 합니다.';
  return null;
}

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export async function clientIp() {
  const h = await headers();
  // Nginx가 Cloudflare IP 대역에서 온 요청만 CF-Connecting-IP를 신뢰해 X-Real-IP로 넘김 (헤더 위조 방지)
  // 앱은 127.0.0.1에서만 리슨하므로 X-Real-IP는 항상 Nginx가 설정한 값
  return h.get('x-real-ip') || 'unknown';
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await q('DELETE FROM dash_sessions WHERE expires_at < now()');
  await q('INSERT INTO dash_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token), userId, new Date(Date.now() + SESSION_TTL_MS),
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q('DELETE FROM dash_sessions WHERE token_hash = $1', [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
}

/** 현재 로그인 사용자 (없으면 null) */
export async function getUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (
    (await q1(
      `SELECT u.id, u.username, u.must_change, u.is_super FROM dash_sessions s JOIN dash_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)],
    )) || null
  );
}

/** 로그인 필수 페이지·액션용. allowMustChange=false면 비밀번호 변경 전 사용자는 변경 화면으로 */
export async function requireUser({ allowMustChange = false } = {}) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (user.must_change && !allowMustChange) redirect('/account?first=1');
  return user;
}

/** 슈퍼관리자 전용 페이지·액션 (설정). 일반 계정은 메인으로 */
export async function requireSuper() {
  const user = await requireUser();
  if (!user.is_super) redirect('/');
  return user;
}

export async function audit(userId, action, detail) {
  await q('INSERT INTO dash_audit (user_id, action, detail, ip) VALUES ($1, $2, $3, $4)', [
    userId, action, detail ? JSON.stringify(detail) : null, await clientIp(),
  ]);
}

// 로그인 시도 제한: IP당 5회 실패 시 10분 잠금 (프로세스 메모리)
const attempts = globalThis.__dashLoginAttempts || (globalThis.__dashLoginAttempts = new Map());
export function loginLocked(ip) {
  const r = attempts.get(ip);
  return r && r.lockUntil > Date.now() ? Math.ceil((r.lockUntil - Date.now()) / 60000) : 0;
}
export function loginFailed(ip) {
  const r = attempts.get(ip) || { count: 0, lockUntil: 0 };
  r.count += 1;
  if (r.count >= 5) {
    r.lockUntil = Date.now() + 10 * 60 * 1000;
    r.count = 0;
  }
  attempts.set(ip, r);
}
export function loginSucceeded(ip) {
  attempts.delete(ip);
}
