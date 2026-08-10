const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

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

// 업로드 이미지는 Next.js가 정적 서빙하도록 frontend/public/uploads에 저장
const UPLOAD_DIR = path.join(__dirname, '..', 'frontend', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const load = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'data', `${name}.json`), 'utf8'));
const save = (name, data) =>
  fs.writeFileSync(path.join(__dirname, 'data', `${name}.json`), JSON.stringify(data, null, 2), 'utf8');

let menu = load('menu');
const sauceTabs = load('sauceTabs');
let stores = load('stores');
let posts = load('posts');
const home = load('home');

// 기존 사이트와 동일한 메뉴 카테고리 구성
const CATEGORIES = ['BEST MENU', '후라이드 치킨', '소스 치킨', '베이스 소스', '딥 소스', '사이드'];
const DEFAULT_SAUCE_TAB = sauceTabs[0].name; // 아메리칸 징

app.use(helmet()); // 보안 헤더 적용 (X-Frame-Options, CSP 등) + X-Powered-By 제거
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// 카테고리 + 소스치킨 서브탭 목록
app.get('/api/menu/categories', (_req, res) => {
  res.json({ categories: CATEGORIES, sauceTabs });
});

// 메뉴 목록: 기존 menu.php?ct=...&tab=... 로직과 동일
//  - ct 미지정 시 BEST MENU
//  - ct=소스 치킨 이면 tab(서브탭)으로 필터, tab 미지정 시 첫 번째(아메리칸 징)
app.get('/api/menu', (req, res) => {
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
    items = menu.filter((m) => m.category === ct && m.subTab === activeTab);
  } else {
    items = menu.filter((m) => m.category === ct);
  }

  res.json({ ct, tab: activeTab, sauceTabs: ct === '소스 치킨' ? sauceTabs : undefined, items });
});

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

// 홈 화면 데이터 (배너/신메뉴/추천메뉴/추천사이드 + 최신 게시글)
app.get('/api/home', (_req, res) => {
  const byDateDesc = (a, b) => (a.date < b.date ? 1 : -1);
  res.json({
    ...home,
    events: posts.filter((p) => p.type === 'event').sort(byDateDesc).map(withStatus),
    notices: posts.filter((p) => p.type === 'notice').sort(byDateDesc),
  });
});

// 게시판: 새소식(notice) / 이벤트(event)
app.get('/api/posts', (req, res) => {
  const type = (req.query.type || 'notice').toString();
  const list = posts
    .filter((p) => p.type === type)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(({ content, ...rest }) => withStatus(rest));
  res.json({ type, items: list });
});

// 게시글 상세 + 이전/다음 글 (기존 bbs_view.php 로직)
app.get('/api/posts/:idx', (req, res) => {
  const idx = Number(req.params.idx);
  const post = posts.find((p) => p.idx === idx);
  if (!post) return res.status(404).json({ error: 'not found' });

  const sameType = posts
    .filter((p) => p.type === post.type)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const pos = sameType.findIndex((p) => p.idx === idx);
  const prev = pos > 0 ? sameType[pos - 1] : null;
  const next = pos < sameType.length - 1 ? sameType[pos + 1] : null;

  res.json({
    ...withStatus(post),
    prev: prev ? { idx: prev.idx, title: prev.title } : null,
    next: next ? { idx: next.idx, title: next.title } : null,
  });
});

// 매장 검색: 시/도, 구/군, 매장명 필터
app.get('/api/stores', (req, res) => {
  const { city, district, q } = req.query;
  let list = stores;
  if (city) list = list.filter((s) => s.city === city);
  if (district) list = list.filter((s) => s.district === district);
  if (q) list = list.filter((s) => s.name.includes(q.toString()) || s.shortName.includes(q.toString()));

  const cities = [...new Set(stores.map((s) => s.city))];
  const districts = [...new Set(stores.filter((s) => !city || s.city === city).map((s) => s.district))];
  res.json({ cities, districts, items: list });
});

/* ============================================================
   관리자 인증
   - 비밀번호는 scrypt 해시로 data/auth.json에 저장 (평문 저장 안 함)
   - 로그인 성공 시 랜덤 세션 토큰 발급 (x-admin-token 헤더로 인증, 12시간 유효)
   - 로그인 실패 5회 → 해당 IP 10분 잠금 (무차별 대입 방어)
   - 최초 실행 시 ADMIN_KEY 환경변수(없으면 mama1234)로 초기 비밀번호 생성
   - 변경 사항은 data/*.json에 즉시 영속화
   ============================================================ */

const AUTH_FILE = path.join(__dirname, 'data', 'auth.json');
const hashPassword = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');

const loadAuth = () => {
  if (fs.existsSync(AUTH_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    // 이전 버전 auth.json 호환: allowedIps 없으면 빈 배열(모든 IP 허용)
    if (!Array.isArray(loaded.allowedIps)) loaded.allowedIps = [];
    return loaded;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const initial = {
    salt,
    hash: hashPassword(process.env.ADMIN_KEY || 'mama1234', salt),
    isDefault: !process.env.ADMIN_KEY,
    allowedIps: [], // 비어 있으면 모든 IP에서 접속 허용
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(initial, null, 2), 'utf8');
  return initial;
};
let auth = loadAuth();
const saveAuth = () => fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), 'utf8');

const verifyPassword = (pw) => {
  const candidate = Buffer.from(hashPassword(pw || '', auth.salt), 'hex');
  const actual = Buffer.from(auth.hash, 'hex');
  return candidate.length === actual.length && crypto.timingSafeEqual(candidate, actual);
};

// 세션 토큰 저장소 (메모리 — 서버 재시작 시 전체 로그아웃)
const SESSION_TTL = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> expiresAt
const createSession = () => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
};
const isValidSession = (token) => {
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
};

// 로그인 시도 제한: IP당 5회 실패 시 10분 잠금
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60 * 1000;
const loginAttempts = new Map(); // ip -> { count, lockUntil }

const requireAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!token || !isValidSession(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
};

/* ---------- 관리자 접속 IP 제한 ----------
   auth.json의 allowedIps 배열로 관리.
   - 빈 배열: 모든 IP 허용
   - IP가 등록돼 있으면 목록에 있는 IP만 관리자 API(로그인 포함) 접근 가능
   - 서버에서 직접 복구: backend/data/auth.json의 allowedIps를 []로 수정 후 재시작 */
const normalizeIp = (ip) => {
  let v = String(ip || '');
  if (v.startsWith('::ffff:')) v = v.slice(7); // IPv4-mapped IPv6
  if (v === '::1') v = '127.0.0.1'; // IPv6 localhost
  return v;
};
const clientIp = (req) => normalizeIp(req.ip);

const requireAllowedIp = (req, res, next) => {
  const list = auth.allowedIps || [];
  if (list.length === 0) return next();
  if (list.includes(clientIp(req))) return next();
  return res.status(403).json({ error: `허용되지 않은 IP입니다. (현재 IP: ${clientIp(req)})` });
};

// 모든 관리자 API(로그인 포함)에 IP 제한 적용
app.use('/api/admin', requireAllowedIp);

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const rec = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };

  if (Date.now() < rec.lockUntil) {
    const waitMin = Math.ceil((rec.lockUntil - Date.now()) / 60000);
    return res.status(429).json({ ok: false, error: `로그인 시도가 너무 많습니다. ${waitMin}분 후 다시 시도해주세요.` });
  }

  if (!verifyPassword(req.body?.password)) {
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
      rec.lockUntil = Date.now() + LOCK_MS;
      rec.count = 0;
    }
    loginAttempts.set(ip, rec);
    return res.status(401).json({ ok: false, error: '비밀번호가 올바르지 않습니다.' });
  }

  loginAttempts.delete(ip);
  res.json({ ok: true, token: createSession(), isDefaultPassword: !!auth.isDefault });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  sessions.delete(req.headers['x-admin-token']);
  res.json({ ok: true });
});

// 비밀번호 변경: 현재 비밀번호 확인 후 새 해시 저장, 기존 세션 전체 무효화
app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!verifyPassword(currentPassword)) {
    return res.status(400).json({ ok: false, error: '현재 비밀번호가 올바르지 않습니다.' });
  }
  const pw = String(newPassword || '');
  if (pw.length < 8) {
    return res.status(400).json({ ok: false, error: '새 비밀번호는 8자 이상이어야 합니다.' });
  }
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    return res.status(400).json({ ok: false, error: '새 비밀번호는 영문과 숫자를 모두 포함해야 합니다.' });
  }
  if (verifyPassword(pw)) {
    return res.status(400).json({ ok: false, error: '현재 비밀번호와 다른 비밀번호를 사용해주세요.' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  auth = {
    ...auth, // allowedIps 등 기존 설정 유지
    salt,
    hash: hashPassword(pw, salt),
    isDefault: false,
    updatedAt: new Date().toISOString(),
  };
  saveAuth();
  sessions.clear();
  res.json({ ok: true, token: createSession() });
});

// 접속 허용 IP 목록 조회
app.get('/api/admin/allowed-ips', requireAdmin, (req, res) => {
  res.json({ allowedIps: auth.allowedIps || [], currentIp: clientIp(req) });
});

// 접속 허용 IP 목록 저장 (빈 배열 = 모든 IP 허용)
app.put('/api/admin/allowed-ips', requireAdmin, (req, res) => {
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

  auth = { ...auth, allowedIps: list, updatedAt: new Date().toISOString() };
  saveAuth();
  res.json({ ok: true, allowedIps: list, currentIp: me, selfAdded });
});

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

app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
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
app.get('/api/admin/menu', requireAdmin, (_req, res) => {
  res.json({ categories: CATEGORIES, sauceTabs, items: menu });
});

app.post('/api/admin/menu', requireAdmin, (req, res) => {
  const { category, subTab, name, nameEn, image, description, origin } = req.body || {};
  if (!category || !name || !image) {
    return res.status(400).json({ error: 'category, name, image는 필수입니다.' });
  }
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: '잘못된 카테고리' });
  if (category === '소스 치킨' && !sauceTabs.some((t) => t.name === subTab)) {
    return res.status(400).json({ error: '소스 치킨은 서브탭이 필요합니다.' });
  }
  const item = {
    id: menu.length ? Math.max(...menu.map((m) => m.id)) + 1 : 1,
    category,
    subTab: category === '소스 치킨' ? subTab : null,
    name,
    nameEn: nameEn || '',
    image,
    description: description || '',
    origin: origin || '원료육 : 국내산',
  };
  menu.push(item);
  save('menu', menu);
  res.status(201).json(item);
});

app.put('/api/admin/menu/:id', requireAdmin, (req, res) => {
  const item = menu.find((m) => m.id === Number(req.params.id));
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
  save('menu', menu);
  res.json(item);
});

app.delete('/api/admin/menu/:id', requireAdmin, (req, res) => {
  const before = menu.length;
  menu = menu.filter((m) => m.id !== Number(req.params.id));
  if (menu.length === before) return res.status(404).json({ error: 'not found' });
  save('menu', menu);
  res.json({ ok: true });
});

/* ---------- 게시글(새소식/이벤트) 관리 ---------- */
app.post('/api/admin/posts', requireAdmin, (req, res) => {
  const { type, title, date, thumbnail, content, startDate, endDate } = req.body || {};
  if (!['notice', 'event'].includes(type) || !title) {
    return res.status(400).json({ error: 'type(notice|event), title은 필수입니다.' });
  }
  const post = {
    idx: posts.length ? Math.max(...posts.map((p) => p.idx)) + 1 : 1,
    type,
    title,
    date: date || todayStr(),
    thumbnail: thumbnail || null,
    content: content || '',
    ...(type === 'event' && { startDate: startDate || null, endDate: endDate || null }),
  };
  posts.push(post);
  save('posts', posts);
  res.status(201).json(withStatus(post));
});

app.put('/api/admin/posts/:idx', requireAdmin, (req, res) => {
  const post = posts.find((p) => p.idx === Number(req.params.idx));
  if (!post) return res.status(404).json({ error: 'not found' });
  const { type, title, date, thumbnail, content, startDate, endDate } = req.body || {};
  if (type && !['notice', 'event'].includes(type)) return res.status(400).json({ error: '잘못된 type' });
  Object.assign(post, {
    ...(type !== undefined && { type }),
    ...(title !== undefined && { title }),
    ...(date !== undefined && { date }),
    ...(thumbnail !== undefined && { thumbnail }),
    ...(content !== undefined && { content }),
    ...(startDate !== undefined && { startDate: startDate || null }),
    ...(endDate !== undefined && { endDate: endDate || null }),
  });
  save('posts', posts);
  res.json(withStatus(post));
});

app.delete('/api/admin/posts/:idx', requireAdmin, (req, res) => {
  const before = posts.length;
  posts = posts.filter((p) => p.idx !== Number(req.params.idx));
  if (posts.length === before) return res.status(404).json({ error: 'not found' });
  save('posts', posts);
  res.json({ ok: true });
});

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

app.get('/api/admin/stores', requireAdmin, (_req, res) => {
  res.json({ items: stores });
});

app.post('/api/admin/stores', requireAdmin, (req, res) => {
  const s = normalizeStore(req.body || {});
  if (!s.name || !s.city || !s.district || !s.address) {
    return res.status(400).json({ error: '매장명, 시/도, 구/군, 주소는 필수입니다.' });
  }
  const store = { id: stores.length ? Math.max(...stores.map((x) => x.id)) + 1 : 1, ...s };
  stores.push(store);
  save('stores', stores);
  res.status(201).json(store);
});

app.put('/api/admin/stores/:id', requireAdmin, (req, res) => {
  const store = stores.find((x) => x.id === Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'not found' });
  const s = normalizeStore({ ...store, ...req.body });
  if (!s.name || !s.city || !s.district || !s.address) {
    return res.status(400).json({ error: '매장명, 시/도, 구/군, 주소는 필수입니다.' });
  }
  Object.assign(store, s);
  save('stores', stores);
  res.json(store);
});

app.delete('/api/admin/stores/:id', requireAdmin, (req, res) => {
  const before = stores.length;
  stores = stores.filter((x) => x.id !== Number(req.params.id));
  if (stores.length === before) return res.status(404).json({ error: 'not found' });
  save('stores', stores);
  res.json({ ok: true });
});

/* ---------- 홈 배너(메인 스크롤 화면) 관리 ---------- */
app.get('/api/admin/banners', requireAdmin, (_req, res) => {
  res.json({ banners: home.banners });
});

// 배너 전체 교체 (추가/삭제/순서 변경을 프론트에서 조합해 전달)
app.put('/api/admin/banners', requireAdmin, (req, res) => {
  const { banners } = req.body || {};
  if (!Array.isArray(banners) || banners.some((b) => !b || typeof b.image !== 'string' || !b.image)) {
    return res.status(400).json({ error: 'banners는 {image} 배열이어야 합니다.' });
  }
  home.banners = banners.map((b) => ({ image: b.image }));
  save('home', home);
  res.json({ banners: home.banners });
});

app.listen(PORT, () => {
  console.log(`[mamaweb-backend] listening on http://localhost:${PORT}`);
});
