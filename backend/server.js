const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'mama1234';

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

app.use(cors());
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
   관리자 API (/api/admin/*)
   - x-admin-key 헤더로 인증 (기본 키: mama1234, ADMIN_KEY 환경변수로 변경)
   - 변경 사항은 data/*.json에 즉시 영속화
   ============================================================ */

const requireAdmin = (req, res, next) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
};

app.post('/api/admin/login', (req, res) => {
  if ((req.body?.password || '') === ADMIN_KEY) {
    return res.json({ ok: true, key: ADMIN_KEY });
  }
  res.status(401).json({ ok: false, error: '비밀번호가 올바르지 않습니다.' });
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
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

app.post('/api/admin/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
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
