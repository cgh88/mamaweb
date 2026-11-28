/* 서버 .env의 현재 값을 설정 페이지(dash_setting)로 가져오기 — 이미 저장된 항목은 건너뜀
 *   npm run settings:import                       # 미리보기 (키 이름만 표시)
 *   npm run settings:import -- --apply            # 저장
 *   npm run settings:import -- --env ../pos-sync/.env --apply
 * 비밀값은 dashboard/.env의 SETTINGS_KEY로 암호화 (lib/secret.js와 같은 형식). 값은 화면에 출력하지 않음.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const SECRET = ['POS_API_TOKEN', 'DATA_GO_KR_KEY', 'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'];
const PLAIN = ['POS_STORE_CODES', 'POS_SYNC_DAYS', 'COMPETITOR_BRANDS'];
// 경쟁 브랜드 기본값 (pos-sync/external.py BRANDS와 같음)
const DEFAULT_BRANDS = 'bhc: bhc, BHC, 비에이치씨\nBBQ: BBQ, 비비큐\n교촌치킨: 교촌\n굽네치킨: 굽네\n60계치킨: 60계';

function parseEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function encrypt(name, plain) {
  const key = Buffer.from(process.env.SETTINGS_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('dashboard/.env에 SETTINGS_KEY가 없습니다.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(name));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64')}`;
}

(async () => {
  const apply = process.argv.includes('--apply');
  const i = process.argv.indexOf('--env');
  const src = path.resolve(i > 0 ? process.argv[i + 1] : path.join(__dirname, '..', '..', 'pos-sync', '.env'));
  const env = fs.existsSync(src) ? parseEnv(src) : {};
  if (!env.COMPETITOR_BRANDS) env.COMPETITOR_BRANDS = DEFAULT_BRANDS;

  const client = new Client({ connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const have = new Set((await client.query('SELECT key FROM dash_setting')).rows.map((r) => r.key));
    const todo = [...SECRET, ...PLAIN].filter((k) => env[k] && !have.has(k));
    console.log(`원본: ${src}`);
    console.log(`가져올 항목: ${todo.join(', ') || '없음'}${have.size ? ` (이미 저장됨: ${[...have].join(', ')})` : ''}`);
    if (!apply || !todo.length) { if (!apply) console.log('미리보기입니다. 저장하려면 --apply'); return; }
    await client.query('BEGIN');
    for (const k of todo) {
      const secret = SECRET.includes(k);
      const v = env[k].trim();
      await client.query(
        'INSERT INTO dash_setting (key, value, secret, hint) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO NOTHING',
        [k, secret ? encrypt(k, v) : v, secret, secret ? v.slice(-4) : null],
      );
    }
    await client.query(`INSERT INTO dash_audit (action, detail) VALUES ('setting_imported', $1)`, [JSON.stringify({ keys: todo, from: path.basename(path.dirname(src)) + '/.env' })]);
    await client.query('COMMIT');
    console.log(`저장 완료: ${todo.length}개`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('실패:', err.message);
  process.exitCode = 1;
});
