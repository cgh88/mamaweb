'use server';

import { redirect } from 'next/navigation';
import { q, q1 } from '@/lib/db';
import {
  audit, clientIp, createSession, destroySession, getUser, hashPassword, loginFailed, loginLocked,
  loginSucceeded, validateNewPassword, verifyPassword,
} from '@/lib/auth';

export async function login(_prev, formData) {
  const ip = await clientIp();
  const wait = loginLocked(ip);
  if (wait) return { error: `로그인 시도가 너무 많습니다. ${wait}분 후 다시 시도해주세요.` };

  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  const user = username ? await q1('SELECT id, salt, hash FROM dash_users WHERE username = $1', [username]) : null;
  // 계정이 없어도 같은 시간이 걸리도록 해시 계산은 항상 수행
  const ok = await verifyPassword(password, user?.salt || '00', user?.hash || '00'.repeat(64));
  if (!user || !ok) {
    loginFailed(ip);
    await audit(user?.id || null, 'login_failed', { username });
    return { error: '아이디 또는 비밀번호가 올바르지 않습니다.', username };
  }
  loginSucceeded(ip);
  await q('UPDATE dash_users SET last_login_at = now() WHERE id = $1', [user.id]);
  await createSession(user.id);
  await audit(user.id, 'login');
  redirect('/');
}

export async function logout() {
  const user = await getUser();
  if (user) await audit(user.id, 'logout');
  await destroySession();
  redirect('/login');
}

export async function changePassword(_prev, formData) {
  const user = await getUser();
  if (!user) redirect('/login');
  const current = String(formData.get('current') || '');
  const next = String(formData.get('next') || '');
  const confirm = String(formData.get('confirm') || '');
  const row = await q1('SELECT salt, hash FROM dash_users WHERE id = $1', [user.id]);
  if (!(await verifyPassword(current, row.salt, row.hash))) return { error: '현재 비밀번호가 올바르지 않습니다.' };
  if (next !== confirm) return { error: '새 비밀번호 확인이 일치하지 않습니다.' };
  const invalid = validateNewPassword(next);
  if (invalid) return { error: invalid };
  if (await verifyPassword(next, row.salt, row.hash)) return { error: '현재 비밀번호와 다른 비밀번호를 사용해주세요.' };
  const { salt, hash } = await hashPassword(next);
  await q('UPDATE dash_users SET salt = $2, hash = $3, must_change = false WHERE id = $1', [user.id, salt, hash]);
  // 다른 기기의 세션은 모두 종료하고 현재 기기만 새 세션으로
  await q('DELETE FROM dash_sessions WHERE user_id = $1', [user.id]);
  await createSession(user.id);
  await audit(user.id, 'password_changed');
  return { ok: '비밀번호를 변경했습니다.' };
}
