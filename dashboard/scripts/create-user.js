/* 대시보드 로그인 계정 생성 (또는 비밀번호 초기화)
 *   npm run user:create -- admin            # 새 계정 — 임시 비밀번호를 생성해 한 번만 출력
 *   npm run user:create -- admin --reset    # 기존 계정 비밀번호 초기화
 * 임시 비밀번호로 처음 로그인하면 비밀번호 변경 화면이 먼저 나옵니다.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const username = (process.argv[2] || '').trim();
const reset = process.argv.includes('--reset');
if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
  console.error('사용법: npm run user:create -- <아이디(영문·숫자 3~30자)> [--reset]');
  process.exit(1);
}

// 헷갈리는 문자(0/O, 1/l/I) 제외한 16자 임시 비밀번호 (영문+숫자 보장)
function tempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  for (;;) {
    const pw = Array.from(crypto.randomBytes(16), (b) => all[b % all.length]).join('');
    if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)) return pw;
  }
}

(async () => {
  const password = tempPassword();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const client = new Client({ connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const sql = reset
      ? `UPDATE dash_users SET salt = $2, hash = $3, must_change = true WHERE username = $1 RETURNING id`
      : `INSERT INTO dash_users (username, salt, hash) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING RETURNING id`;
    const { rows } = await client.query(sql, [username, salt, hash]);
    if (!rows.length) {
      console.error(reset ? `계정 '${username}'이 없습니다.` : `계정 '${username}'이 이미 있습니다. 초기화하려면 --reset`);
      process.exitCode = 1;
      return;
    }
    if (reset) await client.query('DELETE FROM dash_sessions WHERE user_id = $1', [rows[0].id]);
    console.log(`아이디: ${username}`);
    console.log(`임시 비밀번호: ${password}`);
    console.log('(첫 로그인 시 비밀번호를 변경해야 합니다. 이 비밀번호는 다시 표시되지 않습니다.)');
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('실패:', err.message);
  process.exitCode = 1;
});
