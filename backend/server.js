const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { query, tx, ensureSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

// Nginx 등 리버스 프록시 뒤에서 실행할 때만 TRUST_PROXY=1로 설정
// (켜야 X-Forwarded-For를 신뢰해 실제 방문자 IP를 인식 — IP 제한/로그인 잠금에 필요.
//  프록시 없이 켜면 헤더 조작으로 IP를 속일 수 있으므로 로컬 개발에서는 끈 상태 유지)
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// CORS 허용 origin: 기본은 로컬 프론트만. 배포 시 CORS_ORIGINS 환경변수로 지정 (쉼표 구분)
// (프론트는 Next rewrite로 서버-서버 프록시하므로 브라우저 CORS가 필요 없음 —
//  브라우저에서 :4000에 직접 접근하는 경우만 아래 목록으로 제한됨)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// 업로드 이미지는 frontend/public/uploads에 파일로 저장 (DB에는 경로만 저장)
const UPLOAD_DIR = path.join(__dirname, '..', 'frontend', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 기존 사이트와 동일한 메뉴 카테고리 구성
const CATEGORIES = ['BEST MENU', '후라이드 치킨', '소스 치킨', '베이스 소스', '딥 소스', '사이드'];
// 소스 치킨 서브탭: 관리자에서 편집하지 않는 고정 목록이므로 서버 시작 시 DB에서 한 번 로드
let sauceTabs = [];
let DEFAULT_SAUCE_TAB = null; // 아메리칸 징 (첫 번째 서브탭)

// DB 컬럼(snake_case) → 기존 API 필드명(camelCase)
const MENU_COLS = `id, category, sub_tab AS "subTab", name, name_en AS "nameEn", image, description, origin`;
const POST_COLS = `idx, type, title, date, start_date AS "startDate", end_date AS "endDate", thumbnail, content`;
const STORE_COLS = `id, name, short_name AS "shortName", city, district, address, phone, hours, map_embed AS "mapEmbed"`;

// 새소식은 기존 JSON처럼 startDate/endDate 필드 없이 반환
const toPost = (row) => {
  if (row.type === 'event') return row;
  const { startDate, endDate, ...rest } = row;
  return rest;
};

// Express 4는 async 핸들러의 예외를 잡지 못하므로 감싸서 에러 핸들러로 전달
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.use(helmet()); // 보안 헤더 적용 (X-Frame-Options, CSP 등) + X-Powered-By 제거
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// 업로드 이미지 서빙: 운영 모드(next start)는 서버 시작 후 public/에 추가된 파일을 제공하지 않으므로
// Next가 /uploads/* 를 백엔드로 프록시하고 여기서 직접 제공 (파일명에 타임스탬프가 있어 장기 캐시 가능)
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false }));

// 카테고리 + 소스치킨 서브탭 목록
app.get('/api/menu/categories', (_req, res) => {
  res.json({ categories: CATEGORIES, sauceTabs });
});

// 메뉴 목록: 기존 menu.php?ct=...&tab=... 로직과 동일
//  - ct 미지정 시 BEST MENU
//  - ct=소스 치킨 이면 tab(서브탭)으로 필터, tab 미지정 시 첫 번째(아메리칸 징)
app.get('/api/menu', h(async (req, res) => {
  const ct = (req.query.ct || 'BEST MENU').toString();
  if (!CATEGORIES.includes(ct)) {
    return res.status(404).json({ error: 'unknown category', ct });
  }

  let items;
  let activeTab = null;
  if (ct === '소스 치킨') {
    activeTab = (req.query.tab || DEFAULT_SAUCE_TAB).toString();
    if (!sauceTabs.some((t) => t.name === activeTab)) {
      return res.status(404).json({ error: 'unknown tab', tab: activeTab });
    }
    ({ rows: items } = await query(
      `SELECT ${MENU_COLS} FROM menu_items WHERE category = $1 AND sub_tab = $2 ORDER BY id`,
      [ct, activeTab],
    ));
  } else {
    ({ rows: items } = await query(`SELECT ${MENU_COLS} FROM menu_items WHERE category = $1 ORDER BY id`, [ct]));
  }

  res.json({ ct, tab: activeTab, sauceTabs: ct === '소스 치킨' ? sauceTabs : undefined, items });
}));

// 이벤트 진행 상태 계산: 종료일이 지나면 'ended', 시작 전이면 'upcoming', 그 외 'ongoing'
const todayStr = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};
const withStatus = (p) => {
  if (p.type !== 'event') return p;
  const today = todayStr();
  let status = 'ongoing';
  if (p.endDate && today > p.endDate) status = 'ended';
  else if (p.startDate && today < p.startDate) status = 'upcoming';
  return { ...p, status };
};

const getBanners = async () =>
  (await query('SELECT image FROM banners ORDER BY sort_order, id')).rows;

// 홈 화면 데이터 (배너/신메뉴/추천메뉴/추천사이드 + 최신 게시글)
app.get('/api/home', h(async (_req, res) => {
  const [settings, banners, postRows] = await Promise.all([
    query(`SELECT value FROM site_settings WHERE key = 'home'`),
    getBanners(),
    query(`SELECT ${POST_COLS} FROM posts ORDER BY date DESC, idx DESC`),
  ]);
  const posts = postRows.rows.map(toPost);
  res.json({
    ...(settings.rows[0]?.value || {}),
    banners,
    events: posts.filter((p) => p.type === 'event').map(withStatus),
    notices: posts.filter((p) => p.type === 'notice'),
  });
}));

// 게시판: 새소식(notice) / 이벤트(event)
app.get('/api/posts', h(async (req, res) => {
  const type = (req.query.type || 'notice').toString();
  const { rows } = await query(
    `SELECT ${POST_COLS} FROM posts WHERE type = $1 ORDER BY date DESC, idx DESC`,
    [type],
  );
  const list = rows.map(toPost).map(({ content, ...rest }) => withStatus(rest));
  res.json({ type, items: list });
}));

// 게시글 상세 + 이전/다음 글 (기존 bbs_view.php 로직)
app.get('/api/posts/:idx', h(async (req, res) => {
  const idx = Number(req.params.idx);
  if (!Number.isInteger(idx)) return res.status(404).json({ error: 'not found' });
  const { rows } = await query(`SELECT ${POST_COLS} FROM posts WHERE idx = $1`, [idx]);
  const post = rows[0] && toPost(rows[0]);
  if (!post) return res.status(404).json({ error: 'not found' });

  const { rows: sameType } = await query(
    'SELECT idx, title FROM posts WHERE type = $1 ORDER BY date DESC, idx DESC',
    [post.type],
  );
  const pos = sameType.findIndex((p) => p.idx === idx);
  const prev = pos > 0 ? sameType[pos - 1] : null;
  const next = pos < sameType.length - 1 ? sameType[pos + 1] : null;

  res.json({
    ...withStatus(post),
    prev: prev ? { idx: prev.idx, title: prev.title } : null,
    next: next ? { idx: next.idx, title: next.title } : null,
  });
}));

const getStores = async () => (await query(`SELECT ${STORE_COLS} FROM stores ORDER BY id`)).rows;

// 매장 검색: 시/도, 구/군, 매장명 필터
app.get('/api/stores', h(async (req, res) => {
  const { city, district, q } = req.query;
  const stores = await getStores();
  let list = stores;
  if (city) list = list.filter((s) => s.city === city);
  if (district) list = list.filter((s) => s.district === district);
  if (q) list = list.filter((s) => s.name.includes(q.toString()) || s.shortName.includes(q.toString()));

  const cities = [...new Set(stores.map((s) => s.city))];
  const districts = [...new Set(stores.filter((s) => !city || s.city === city).map((s) => s.district))];
  res.json({ cities, districts, items: list });
}));

/* ============================================================
   관리자 인증
   - 비밀번호는 scrypt 해시로 admin_auth 테이블에 저장 (평문 저장 안 함)
   - 로그인 성공 시 랜덤 세션 토큰 발급 (x-admin-token 헤더로 인증, 12시간 유효)
     토큰은 SHA-256 해시로 admin_sessions에 저장 → 서버를 재시작해도 로그인 유지
   - 로그인 실패 5회 → 해당 IP 10분 잠금 (무차별 대입 방어)
   - 최초 실행 시 ADMIN_KEY 환경변수(없으면 mama1234)로 초기 비밀번호 생성
   ============================================================ */

const hashPassword = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const getAuth = async () =>
  (await query('SELECT salt, hash, is_default AS "isDefault", allowed_ips AS "allowedIps" FROM admin_auth WHERE id = 1'))
    .rows[0];

// admin_auth가 비어 있으면(최초 실행) 초기 비밀번호 생성
const ensureAuth = async () => {
  const salt = crypto.randomBytes(16).toString('hex');
  await query(
    'INSERT INTO admin_auth (id, salt, hash, is_default) VALUES (1, $1, $2, $3) ON CONFLICT (id) DO NOTHING',
    [salt, hashPassword(process.env.ADMIN_KEY || 'mama1234', salt), !process.env.ADMIN_KEY],
  );
};

const verifyPassword = (auth, pw) => {
  const candidate = Buffer.from(hashPassword(pw || '', auth.salt), 'hex');
  const actual = Buffer.from(auth.hash, 'hex');
  return candidate.length === actual.length && crypto.timingSafeEqual(candidate, actual);
};

const SESSION_TTL = 12 * 60 * 60 * 1000;
const createSession = async () => {
  const token = crypto.randomBytes(32).toString('hex');
  await query('DELETE FROM admin_sessions WHERE expires_at < now()'); // 만료 세션 정리
  await query('INSERT INTO admin_sessions (token_hash, expires_at) VALUES ($1, $2)', [
    hashToken(token),
    new Date(Date.now() + SESSION_TTL),
  ]);
  return token;
};
const isValidSession = async (token) =>
  (await query('SELECT 1 FROM admin_sessions WHERE token_hash = $1 AND expires_at > now()', [hashToken(token)]))
    .rowCount > 0;

// 로그인 시도 제한: IP당 5회 실패 시 10분 잠금 (메모리 — 재시작 시 초기화)
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;
const loginAttempts = new Map(); // ip -> { count, lockUntil }

const requireAdmin = h(async (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || !(await isValidSession(token))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

/* ---------- 관리자 접속 IP 제한 ----------
   admin_auth.allowed_ips 배열로 관리.
   - 빈 배열: 모든 IP 허용
   - IP가 등록돼 있으면 목록에 있는 IP만 관리자 API(로그인 포함) 접근 가능
   - 서버에서 직접 복구: psql로 UPDATE admin_auth SET allowed_ips = '{}'; 실행 */
const normalizeIp = (ip) => {
  let v = String(ip || '');
  if (v.startsWith('::ffff:')) v = v.slice(7); // IPv4-mapped IPv6
  if (v === '::1') v = '127.0.0.1'; // IPv6 localhost
  return v;
};
const clientIp = (req) => normalizeIp(req.ip);

const requireAllowedIp = h(async (req, res, next) => {
  const list = (await getAuth())?.allowedIps || [];
  if (list.length === 0) return next();
  if (list.includes(clientIp(req))) return next();
  return res.status(403).json({ error: `허용되지 않은 IP입니다. (현재 IP: ${clientIp(req)})` });
});

// 모든 관리자 API(로그인 포함)에 IP 제한 적용
app.use('/api/admin', requireAllowedIp);

app.post('/api/admin/login', h(async (req, res) => {
  const ip = req.ip || 'unknown';
  const rec = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };

  if (Date.now() < rec.lockUntil) {
    const waitMin = Math.ceil((rec.lockUntil - Date.now()) / 60000);
    return res.status(429).json({ ok: false, error: `로그인 시도가 너무 많습니다. ${waitMin}분 후 다시 시도해주세요.` });
  }

  const auth = await getAuth();
  if (!verifyPassword(auth, req.body?.password)) {
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
      rec.lockUntil = Date.now() + LOCK_MS;
      rec.count = 0;
    }
    loginAttempts.set(ip, rec);
    return res.status(401).json({ ok: false, error: '비밀번호가 올바르지 않습니다.' });
  }

  loginAttempts.delete(ip);
  res.json({ ok: true, token: await createSession(), isDefaultPassword: !!auth.isDefault });
}));

app.post('/api/admin/logout', requireAdmin, h(async (req, res) => {
  await query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(req.headers['x-admin-token'])]);
  res.json({ ok: true });
}));

// 비밀번호 변경: 현재 비밀번호 확인 후 새 해시 저장, 기존 세션 전체 무효화
app.post('/api/admin/password', requireAdmin, h(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const auth = await getAuth();
  if (!verifyPassword(auth, currentPassword)) {
    return res.status(400).json({ ok: false, error: '현재 비밀번호가 올바르지 않습니다.' });
  }
  const pw = String(newPassword || '');
  if (pw.length < 8) {
    return res.status(400).json({ ok: false, error: '새 비밀번호는 8자 이상이어야 합니다.' });
  }
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return res.status(400).json({ ok: false, error: '새 비밀번호는 영문과 숫자를 모두 포함해야 합니다.' });
  }
  if (verifyPassword(auth, pw)) {
    return res.status(400).json({ ok: false, error: '현재 비밀번호와 다른 비밀번호를 사용해주세요.' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  await tx(async (c) => {
    // allowed_ips 등 기존 설정은 유지
    await c.query('UPDATE admin_auth SET salt = $1, hash = $2, is_default = false, updated_at = now() WHERE id = 1', [
      salt,
      hashPassword(pw, salt),
    ]);
    await c.query('DELETE FROM admin_sessions');
  });
  res.json({ ok: true, token: await createSession() });
}));

// 접속 허용 IP 목록 조회
app.get('/api/admin/allowed-ips', requireAdmin, h(async (req, res) => {
  res.json({ allowedIps: (await getAuth()).allowedIps || [], currentIp: clientIp(req) });
}));

// 접속 허용 IP 목록 저장 (빈 배열 = 모든 IP 허용)
app.put('/api/admin/allowed-ips', requireAdmin, h(async (req, res) => {
  const input = req.body?.allowedIps;
  if (!Array.isArray(input)) {
    return res.status(400).json({ ok: false, error: 'allowedIps는 배열이어야 합니다.' });
  }
  const ipPattern = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:]+)$/;
  const list = [...new Set(input.map((ip) => normalizeIp(String(ip).trim())).filter(Boolean))];
  const invalid = list.filter((ip) => !ipPattern.test(ip));
  if (invalid.length) {
    return res.status(400).json({ ok: false, error: `잘못된 IP 형식: ${invalid.join(', ')}` });
  }

  // 잠금 방지: 목록이 비어있지 않은데 현재 접속 IP가 빠져 있으면 자동 추가
  let selfAdded = false;
  const me = clientIp(req);
  if (list.length > 0 && !list.includes(me)) {
    list.push(me);
    selfAdded = true;
  }

  await query('UPDATE admin_auth SET allowed_ips = $1, updated_at = now() WHERE id = 1', [list]);
  res.json({ ok: true, allowedIps: list, currentIp: me, selfAdded });
}));

// 이미지 업로드
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = Buffer.from(file.originalname, 'latin1')
      .toString('utf8')
      .replace(/[^\w.\-가-힣]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
// 확장자 + MIME 화이트리스트 (SVG는 스크립트를 포함할 수 있어 XSS 위험 → 차단)
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ALLOWED_EXT.includes(ext) && ALLOWED_MIME.includes(file.mimetype);
    if (!ok) req.uploadRejected = true;
    cb(null, ok);
  },
});

// multer 오류(용량 초과 등)를 Express 기본 HTML 500 대신 JSON 메시지로 반환
const uploadSingle = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error:
          err.code === 'LIMIT_FILE_SIZE'
            ? '이미지 용량이 10MB를 초과합니다. 용량을 줄여서 다시 업로드해주세요.'
            : `업로드 요청이 올바르지 않습니다. (${err.code})`,
      });
    }
    console.error('[upload]', err);
    return res.status(500).json({ error: '이미지 저장 중 오류가 발생했습니다.' });
  });

app.post('/api/admin/upload', requireAdmin, uploadSingle, (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: req.uploadRejected
        ? 'jpg, png, gif, webp 형식의 이미지만 업로드할 수 있습니다.'
        : '이미지 파일이 필요합니다.',
    });
  }
  res.json({ path: `/uploads/${req.file.filename}` });
});

/* ---------- 메뉴 관리 ---------- */
const getMenuItem = async (id) =>
  Number.isInteger(id) ? (await query(`SELECT ${MENU_COLS} FROM menu_items WHERE id = $1`, [id])).rows[0] : undefined;

app.get('/api/admin/menu', requireAdmin, h(async (_req, res) => {
  const { rows } = await query(`SELECT ${MENU_COLS} FROM menu_items ORDER BY id`);
  res.json({ categories: CATEGORIES, sauceTabs, items: rows });
}));

app.post('/api/admin/menu', requireAdmin, h(async (req, res) => {
  const { category, subTab, name, nameEn, image, description, origin } = req.body || {};
  if (!category || !name || !image) {
    return res.status(400).json({ error: 'category, name, image는 필수입니다.' });
  }
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: '잘못된 카테고리' });
  if (category === '소스 치킨' && !sauceTabs.some((t) => t.name === subTab)) {
    return res.status(400).json({ error: '소스 치킨은 서브탭이 필요합니다.' });
  }
  const { rows } = await query(
    `INSERT INTO menu_items (category, sub_tab, name, name_en, image, description, origin)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${MENU_COLS}`,
    [
      category,
      category === '소스 치킨' ? subTab : null,
      name,
      nameEn || '',
      image,
      description || '',
      origin || '원료육 : 국내산',
    ],
  );
  res.status(201).json(rows[0]);
}));

app.put('/api/admin/menu/:id', requireAdmin, h(async (req, res) => {
  const item = await getMenuItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'not found' });
  const { category, subTab, name, nameEn, image, description, origin } = req.body || {};
  if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: '잘못된 카테고리' });
  Object.assign(item, {
    ...(category !== undefined && { category }),
    ...(name !== undefined && { name }),
    ...(nameEn !== undefined && { nameEn }),
    ...(image !== undefined && { image }),
    ...(description !== undefined && { description }),
    ...(origin !== undefined && { origin }),
  });
  item.subTab = item.category === '소스 치킨' ? (subTab !== undefined ? subTab : item.subTab) : null;
  if (item.subTab !== null && !sauceTabs.some((t) => t.name === item.subTab)) {
    return res.status(400).json({ error: '잘못된 서브탭' });
  }
  const { rows } = await query(
    `UPDATE menu_items SET category = $2, sub_tab = $3, name = $4, name_en = $5, image = $6, description = $7, origin = $8
     WHERE id = $1 RETURNING ${MENU_COLS}`,
    [item.id, item.category, item.subTab, item.name, item.nameEn, item.image, item.description, item.origin],
  );
  res.json(rows[0]);
}));

app.delete('/api/admin/menu/:id', requireAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = Number.isInteger(id) ? await query('DELETE FROM menu_items WHERE id = $1', [id]) : { rowCount: 0 };
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
}));

/* ---------- 게시글(새소식/이벤트) 관리 ---------- */
app.post('/api/admin/posts', requireAdmin, h(async (req, res) => {
  const { type, title, date, thumbnail, content, startDate, endDate } = req.body || {};
  if (!['notice', 'event'].includes(type) || !title) {
    return res.status(400).json({ error: 'type(notice|event), title은 필수입니다.' });
  }
  const isEvent = type === 'event';
  const { rows } = await query(
    `INSERT INTO posts (type, title, date, thumbnail, content, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${POST_COLS}`,
    [
      type,
      title,
      date || todayStr(),
      thumbnail || null,
      content || '',
      isEvent ? startDate || null : null,
      isEvent ? endDate || null : null,
    ],
  );
  res.status(201).json(withStatus(toPost(rows[0])));
}));

app.put('/api/admin/posts/:idx', requireAdmin, h(async (req, res) => {
  const idx = Number(req.params.idx);
  const found = Number.isInteger(idx) && (await query(`SELECT ${POST_COLS} FROM posts WHERE idx = $1`, [idx])).rows[0];
  if (!found) return res.status(404).json({ error: 'not found' });
  const { type, title, date, thumbnail, content, startDate, endDate } = req.body || {};
  if (type && !['notice', 'event'].includes(type)) return res.status(400).json({ error: '잘못된 type' });
  const post = {
    ...found,
    ...(type !== undefined && { type }),
    ...(title !== undefined && { title }),
    ...(date !== undefined && { date }),
    ...(thumbnail !== undefined && { thumbnail }),
    ...(content !== undefined && { content }),
    ...(startDate !== undefined && { startDate: startDate || null }),
    ...(endDate !== undefined && { endDate: endDate || null }),
  };
  const { rows } = await query(
    `UPDATE posts SET type = $2, title = $3, date = $4, thumbnail = $5, content = $6, start_date = $7, end_date = $8
     WHERE idx = $1 RETURNING ${POST_COLS}`,
    [idx, post.type, post.title, post.date, post.thumbnail, post.content, post.startDate, post.endDate],
  );
  res.json(withStatus(toPost(rows[0])));
}));

app.delete('/api/admin/posts/:idx', requireAdmin, h(async (req, res) => {
  const idx = Number(req.params.idx);
  const { rowCount } = Number.isInteger(idx) ? await query('DELETE FROM posts WHERE idx = $1', [idx]) : { rowCount: 0 };
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
}));

/* ---------- 매장(스토어) 관리 ---------- */
const normalizeStore = (body) => ({
  name: (body.name || '').trim(),
  shortName: (body.shortName || body.name || '').trim(),
  city: (body.city || '').trim(),
  district: (body.district || '').trim(),
  address: (body.address || '').trim(),
  phone: (body.phone || '').trim(),
  hours: Array.isArray(body.hours)
    ? body.hours.map((h) => String(h).trim()).filter(Boolean)
    : String(body.hours || '')
        .split('\n')
        .map((h) => h.trim())
        .filter(Boolean),
  mapEmbed: (body.mapEmbed || '').trim(),
});
const storeValues = (s) => [s.name, s.shortName, s.city, s.district, s.address, s.phone, s.hours, s.mapEmbed];

app.get('/api/admin/stores', requireAdmin, h(async (_req, res) => {
  res.json({ items: await getStores() });
}));

app.post('/api/admin/stores', requireAdmin, h(async (req, res) => {
  const s = normalizeStore(req.body || {});
  if (!s.name || !s.city || !s.district || !s.address) {
    return res.status(400).json({ error: '매장명, 시/도, 구/군, 주소는 필수입니다.' });
  }
  const { rows } = await query(
    `INSERT INTO stores (name, short_name, city, district, address, phone, hours, map_embed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${STORE_COLS}`,
    storeValues(s),
  );
  res.status(201).json(rows[0]);
}));

app.put('/api/admin/stores/:id', requireAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const store = Number.isInteger(id) && (await query(`SELECT ${STORE_COLS} FROM stores WHERE id = $1`, [id])).rows[0];
  if (!store) return res.status(404).json({ error: 'not found' });
  const s = normalizeStore({ ...store, ...req.body });
  if (!s.name || !s.city || !s.district || !s.address) {
    return res.status(400).json({ error: '매장명, 시/도, 구/군, 주소는 필수입니다.' });
  }
  const { rows } = await query(
    `UPDATE stores SET name = $2, short_name = $3, city = $4, district = $5, address = $6, phone = $7, hours = $8, map_embed = $9
     WHERE id = $1 RETURNING ${STORE_COLS}`,
    [id, ...storeValues(s)],
  );
  res.json(rows[0]);
}));

app.delete('/api/admin/stores/:id', requireAdmin, h(async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = Number.isInteger(id) ? await query('DELETE FROM stores WHERE id = $1', [id]) : { rowCount: 0 };
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
}));

/* ---------- 홈 배너(메인 스크롤 화면) 관리 ---------- */
app.get('/api/admin/banners', requireAdmin, h(async (_req, res) => {
  res.json({ banners: await getBanners() });
}));

// 배너 전체 교체 (추가/삭제/순서 변경을 프론트에서 조합해 전달)
app.put('/api/admin/banners', requireAdmin, h(async (req, res) => {
  const { banners } = req.body || {};
  if (!Array.isArray(banners) || banners.some((b) => !b || typeof b.image !== 'string' || !b.image)) {
    return res.status(400).json({ error: 'banners는 {image} 배열이어야 합니다.' });
  }
  await tx(async (c) => {
    await c.query('DELETE FROM banners');
    for (const [i, b] of banners.entries()) {
      await c.query('INSERT INTO banners (image, sort_order) VALUES ($1, $2)', [b.image, i]);
    }
  });
  res.json({ banners: await getBanners() });
}));

// 처리되지 않은 오류: 내부 정보 노출 없이 JSON으로 응답
app.use((err, _req, res, _next) => {
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error('[error]', err);
  res.status(status).json({ error: status === 500 ? '서버 오류가 발생했습니다.' : '잘못된 요청입니다.' });
});

// 시작: 스키마 확인 → 관리자 계정 확인 → 서브탭 로드 → 리슨 (DB 연결 실패 시 종료 → pm2가 재시작)
(async () => {
  await ensureSchema();
  await ensureAuth();
  ({ rows: sauceTabs } = await query('SELECT name, image FROM sauce_tabs ORDER BY sort_order'));
  DEFAULT_SAUCE_TAB = sauceTabs[0]?.name ?? null;
  if (!sauceTabs.length) console.warn('[mamaweb-backend] sauce_tabs가 비어 있습니다. npm run db:migrate 를 먼저 실행하세요.');
  app.listen(PORT, () => {
    console.log(`[mamaweb-backend] listening on http://localhost:${PORT}`);
  });
})().catch((err) => {
  console.error('[mamaweb-backend] DB 초기화 실패 — backend/.env 접속 정보를 확인하세요.', err);
  process.exit(1);
});
