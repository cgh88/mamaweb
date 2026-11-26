/* JSON 데이터(backend/data/*.json) → PostgreSQL 이전
 *
 *   npm run db:migrate            # DB가 비어 있을 때만 실행
 *   npm run db:migrate -- --force # 기존 DB 내용을 지우고 JSON으로 다시 채움 (전환 직전 재동기화용)
 *
 * - 반드시 운영 서버에서 실행: 운영 서버의 data/*.json(관리자에서 수정한 내용)이 원본
 * - auth.json이 있으면 관리자 비밀번호 해시/허용 IP도 그대로 옮김 (비밀번호 유지)
 * - 한 트랜잭션으로 처리되어 중간에 실패하면 아무것도 반영되지 않음
 */
const fs = require('fs');
const path = require('path');
const { pool, tx, ensureSchema } = require('../db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf8'));
const force = process.argv.includes('--force');

const CONTENT_TABLES = ['sauce_tabs', 'menu_items', 'posts', 'stores', 'banners', 'site_settings'];

(async () => {
  await ensureSchema();

  const sauceTabs = load('sauceTabs');
  const menu = load('menu');
  const posts = load('posts');
  const stores = load('stores');
  const { banners = [], ...homeRest } = load('home');
  const authFile = path.join(DATA_DIR, 'auth.json');
  const auth = fs.existsSync(authFile) ? JSON.parse(fs.readFileSync(authFile, 'utf8')) : null;

  // 메뉴의 서브탭이 서브탭 목록에 모두 있는지 먼저 확인 (외래키 오류를 알아보기 쉽게)
  const tabNames = new Set(sauceTabs.map((t) => t.name));
  const badTabs = menu.filter((m) => m.subTab && !tabNames.has(m.subTab));
  if (badTabs.length) throw new Error(`서브탭 목록에 없는 subTab: ${badTabs.map((m) => `${m.id}:${m.subTab}`).join(', ')}`);

  await tx(async (c) => {
    // 한 트랜잭션 클라이언트에서는 쿼리를 순차 실행해야 함 (병렬 실행은 pg에서 지원 중단)
    let hasData = false;
    for (const t of CONTENT_TABLES) {
      if (Number((await c.query(`SELECT count(*) FROM ${t}`)).rows[0].count) > 0) hasData = true;
    }
    if (hasData) {
      if (!force) {
        throw new Error('DB에 이미 데이터가 있습니다. 덮어쓰려면 --force 옵션을 붙여 다시 실행하세요.');
      }
      console.log('--force: 기존 데이터를 지우고 다시 채웁니다.');
    }
    await c.query(`TRUNCATE ${CONTENT_TABLES.join(', ')}, admin_sessions RESTART IDENTITY CASCADE`);

    for (const [i, t] of sauceTabs.entries()) {
      await c.query('INSERT INTO sauce_tabs (name, image, sort_order) VALUES ($1, $2, $3)', [t.name, t.image || '', i]);
    }
    for (const m of menu) {
      await c.query(
        `INSERT INTO menu_items (id, category, sub_tab, name, name_en, image, description, origin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [m.id, m.category, m.subTab || null, m.name, m.nameEn || '', m.image, m.description || '', m.origin || ''],
      );
    }
    for (const p of posts) {
      await c.query(
        `INSERT INTO posts (idx, type, title, date, start_date, end_date, thumbnail, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [p.idx, p.type, p.title, p.date, p.startDate || null, p.endDate || null, p.thumbnail || null, p.content || ''],
      );
    }
    for (const s of stores) {
      await c.query(
        `INSERT INTO stores (id, name, short_name, city, district, address, phone, hours, map_embed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [s.id, s.name, s.shortName || s.name, s.city, s.district, s.address, s.phone || '', s.hours || [], s.mapEmbed || ''],
      );
    }
    for (const [i, b] of banners.entries()) {
      await c.query('INSERT INTO banners (image, sort_order) VALUES ($1, $2)', [b.image, i]);
    }
    await c.query(`INSERT INTO site_settings (key, value) VALUES ('home', $1)`, [JSON.stringify(homeRest)]);

    if (auth) {
      await c.query(
        `INSERT INTO admin_auth (id, salt, hash, is_default, allowed_ips, updated_at)
         VALUES (1, $1, $2, $3, $4, COALESCE($5::timestamptz, now()))
         ON CONFLICT (id) DO UPDATE SET salt = EXCLUDED.salt, hash = EXCLUDED.hash, is_default = EXCLUDED.is_default,
           allowed_ips = EXCLUDED.allowed_ips, updated_at = EXCLUDED.updated_at`,
        [auth.salt, auth.hash, !!auth.isDefault, auth.allowedIps || [], auth.updatedAt || null],
      );
    }

    // id를 직접 넣었으므로 다음 자동 번호를 최댓값 다음으로 맞춤
    for (const [table, col] of [['menu_items', 'id'], ['posts', 'idx'], ['stores', 'id']]) {
      await c.query(
        `SELECT setval(pg_get_serial_sequence('${table}', '${col}'), COALESCE((SELECT MAX(${col}) FROM ${table}), 0) + 1, false)`,
      );
    }

    // 검증: JSON 건수와 DB 건수 비교
    const expected = {
      sauce_tabs: sauceTabs.length,
      menu_items: menu.length,
      posts: posts.length,
      stores: stores.length,
      banners: banners.length,
      site_settings: 1,
    };
    for (const [table, n] of Object.entries(expected)) {
      const got = Number((await c.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
      console.log(`${got === n ? 'OK ' : 'ERR'} ${table.padEnd(13)} JSON ${n} → DB ${got}`);
      if (got !== n) throw new Error(`${table} 건수 불일치`);
    }
    console.log(auth ? 'OK  admin_auth    auth.json의 비밀번호/허용 IP 이전' : '-   admin_auth    auth.json 없음 (서버 시작 시 초기 비밀번호 생성)');
  });

  console.log('이전 완료');
})()
  .catch((err) => {
    console.error('이전 실패:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
