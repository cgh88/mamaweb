const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// 접속 정보: backend/.env (서버 전용, git 제외)의 PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
// 이미 설정된 환경변수가 있으면 그것이 우선 (loadEnvFile은 기존 값을 덮어쓰지 않음)
const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

// DATE 컬럼을 JS Date(시간대 변환) 대신 'YYYY-MM-DD' 문자열 그대로 반환 — 기존 JSON 형식 유지
types.setTypeParser(types.builtins.DATE, (v) => v);

// DB가 응답하지 않을 때 요청이 무한정 대기하지 않도록 접속 5초 / 쿼리 10초 제한
const pool = new Pool({ max: 10, connectionTimeoutMillis: 5000, query_timeout: 10000 });
pool.on('error', (err) => console.error('[db] idle client error', err));

const query = (text, params) => pool.query(text, params);

// 트랜잭션: fn(client) 안의 쿼리가 모두 성공해야 반영
const tx = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

const ensureSchema = () => query(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));

module.exports = { pool, query, tx, ensureSchema };
