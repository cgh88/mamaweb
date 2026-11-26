# 마마치킨 웹사이트 리뉴얼 (mamaweb)

[mamachicken.kr](https://mamachicken.kr)을 모던한 UI/UX로 리뉴얼한 프로젝트입니다.

## 기술 스택

- **Frontend**: Next.js 15 (App Router, TypeScript) — 포트 3000
- **Backend**: Node.js + Express — 포트 4000
- **Database**: PostgreSQL 18 (`pg` 드라이버) — 메뉴/게시글/매장/배너/관리자 인증 저장
- **이미지**: 기존 사이트에서 전량 다운로드하여 `frontend/public/`에서 서빙

## 실행 방법

```bash
# 1. 의존성 설치 (루트/백엔드/프론트엔드)
npm install
npm run install:all

# 2. 로컬 PostgreSQL 준비 (Docker 예시)
docker run -d --name mamaweb-pg -e POSTGRES_USER=mamaweb -e POSTGRES_PASSWORD=<비밀번호> -e POSTGRES_DB=mamaweb -p 5432:5432 postgres:18

# 3. 접속 정보 설정: backend/.env.example → backend/.env 복사 후 PGPASSWORD 입력

# 4. JSON 초기 데이터를 DB로 이전 (최초 1회)
npm run db:migrate --prefix backend

# 5. 개발 서버 실행 (백엔드 + 프론트엔드 동시 실행)
npm run dev
```

- 프론트엔드: http://localhost:3000
- 백엔드 API: http://localhost:4000/api (프론트에서 `/api/*` 리라이트로 프록시)

## 구조

```
mamaweb/
├─ backend/            # Express API 서버
│  ├─ server.js
│  ├─ db.js            # PostgreSQL 연결 (backend/.env의 PG* 접속 정보)
│  ├─ db/schema.sql    # 테이블 정의 (서버 시작 시 자동 적용)
│  ├─ scripts/migrate-json-to-pg.js  # JSON → DB 이전 스크립트
│  └─ data/            # 이전 원본 JSON (기존 사이트에서 추출, DB 이전 후에는 읽지 않음)
└─ frontend/           # Next.js 앱
   ├─ app/             # 페이지 (홈/브랜드/메뉴/매장찾기/커뮤니티)
   ├─ components/      # 공용 컴포넌트 (헤더/푸터/모달/슬라이더 등)
   └─ public/          # 기존 사이트에서 다운로드한 이미지 (img/, menu/, bbs_file/)
```

## 메뉴 로직 (기존 사이트와 동일)

- `/menu?ct=<카테고리>&tab=<서브탭>` — 기존 `menu.php?ct=...&tab=...`과 동일한 파라미터 체계
- 카테고리: BEST MENU(기본) / 후라이드 치킨 / 소스 치킨 / 베이스 소스 / 딥 소스 / 사이드
- **소스 치킨**은 10개 서브탭(아메리칸 징 → 삼양불닭, 순서 고정)을 가지며 좌우 화살표로 이동(양끝에서 멈춤)
- 메뉴 클릭 시 상세 팝업: 메뉴명 / 영문명 / 이미지 / 설명 / 원산지 + 고지문구 2줄
- 팝업 하단 추천메뉴 슬라이더: 클릭하면 상세 내용이 해당 메뉴로 교체

## API

| 엔드포인트 | 설명 |
| --- | --- |
| `GET /api/menu?ct=&tab=` | 메뉴 목록 (기존 menu.php 로직) |
| `GET /api/menu/categories` | 카테고리 + 소스치킨 서브탭 |
| `GET /api/home` | 홈 데이터 (배너/신메뉴/추천메뉴/게시글) |
| `GET /api/posts?type=notice\|event` | 게시글 목록 |
| `GET /api/posts/:idx` | 게시글 상세 (+이전/다음 글) |
| `GET /api/stores?city=&district=&q=` | 매장 검색 |

## 관리자 페이지

- 주소: **http://localhost:3000/admin** (푸터 하단 '관리자' 링크로도 진입)
- 비밀번호: 최초 `mama1234` (또는 최초 실행 시 `ADMIN_KEY` 환경변수 값) — **로그인 후 관리자 페이지의 "🔒 비밀번호 변경" 버튼으로 변경**하세요. 기본 비밀번호 사용 중에는 경고 배너가 표시됩니다.

### 인증 보안 구조

- 비밀번호는 **scrypt 해시 + 솔트**로 DB `admin_auth` 테이블에 저장 (평문 저장 없음)
- 로그인 성공 시 **랜덤 세션 토큰**(12시간 유효) 발급 — 비밀번호 자체는 클라이언트에 저장되지 않음
- 세션은 토큰의 SHA-256 해시만 DB `admin_sessions`에 저장 (서버를 재시작해도 로그인 유지)
- 토큰은 브라우저 sessionStorage에 보관 (탭 종료 시 삭제)
- **로그인 5회 실패 시 해당 IP 10분 잠금** (무차별 대입 방어)
- 비밀번호 변경 시 기존 세션 전체 무효화, 새 비밀번호는 8자 이상 + 영문/숫자 포함 필수
- 비밀번호 비교는 timing-safe 방식 사용
- **업로드 제한**: jpg/png/gif/webp만 허용 (확장자 + MIME 이중 검사, SVG는 XSS 위험으로 차단), 10MB 제한
- **보안 헤더**: helmet 적용 (CSP, X-Frame-Options, X-Content-Type-Options 등, X-Powered-By 제거)
- **CORS 제한**: 기본 `http://localhost:3000`만 허용 — 배포 시 `CORS_ORIGINS` 환경변수로 지정 (쉼표 구분)
- **접속 IP 제한**: 관리자 페이지의 "⚙️ 보안 설정" 탭에서 허용 IP 목록 관리 (DB `admin_auth.allowed_ips`에 저장)
  - 목록이 비어 있으면 모든 IP 허용, IP를 등록하면 해당 IP에서만 관리자 API(로그인 포함) 접근 가능
  - 저장 시 현재 접속 IP가 목록에 없으면 자동 추가 (잠금 방지)
  - 실수로 잠긴 경우: 서버에서 `psql -d mamaweb -c "UPDATE admin_auth SET allowed_ips = '{}'"` 실행 (재시작 불필요)
- 기능:
  - **메뉴 관리**: 카테고리/서브탭별 메뉴 추가·수정·삭제, 이미지 업로드
  - **홈 배너 관리**: 메인 상단 스크롤(슬라이드) 배너 추가·삭제·순서 변경
  - **새소식/이벤트 관리**: 게시글 작성·수정·삭제 (본문 HTML 지원, 이벤트 썸네일 업로드)
  - **이벤트 기간**: 이벤트에 시작일/종료일을 설정하면 사이트에 진행중/예정/종료 배지가 자동 표시 (종료 시 썸네일 흑백 처리, 기간 미설정 시 상시 진행)
  - **매장 관리**: 매장 추가·수정·삭제 (매장명/지역/주소/연락처/운영시간/구글지도 퍼가기 주소) — 매장찾기 페이지와 홈 검색에 바로 반영
- 변경 사항은 PostgreSQL에 즉시 저장되고 사이트에 바로 반영됩니다.
- 업로드 이미지는 `frontend/public/uploads/`에 파일로 저장되고, DB에는 경로만 저장됩니다.

### 데이터베이스

| 테이블 | 내용 |
| --- | --- |
| `menu_items` | 메뉴 (카테고리/서브탭/이름/이미지/설명/원산지) |
| `sauce_tabs` | 소스 치킨 서브탭 10개 (순서 고정) |
| `posts` | 새소식/이벤트 (이벤트 시작일/종료일) |
| `stores` | 매장 |
| `banners` | 홈 상단 슬라이드 배너 (순서 포함) |
| `site_settings` | 홈 신메뉴/추천메뉴/추천사이드 (JSON) |
| `admin_auth`, `admin_sessions` | 관리자 비밀번호 해시·허용 IP, 로그인 세션 |

- `npm run db:migrate --prefix backend`: `backend/data/*.json`을 DB로 이전 (DB가 비어 있을 때만). `-- --force`를 붙이면 기존 DB 내용을 지우고 JSON으로 다시 채움
- 운영 서버는 매일 04:30(KST) `pg_dump` 백업을 `/var/backups/postgresql/`에 14일 보관

### 관리자 API (`x-admin-token` 헤더 필요)

| 엔드포인트 | 설명 |
| --- | --- |
| `POST /api/admin/login` | 로그인 → 세션 토큰 발급 (5회 실패 시 IP 잠금) |
| `POST /api/admin/logout` | 세션 종료 |
| `POST /api/admin/password` | 비밀번호 변경 (현재 비밀번호 확인 필수) |
| `GET/PUT /api/admin/allowed-ips` | 접속 허용 IP 목록 조회/저장 |
| `POST /api/admin/upload` | 이미지 업로드 (multipart, 10MB 제한) |
| `GET/POST /api/admin/menu`, `PUT/DELETE /api/admin/menu/:id` | 메뉴 CRUD |
| `POST /api/admin/posts`, `PUT/DELETE /api/admin/posts/:idx` | 게시글 CRUD |
| `GET/PUT /api/admin/banners` | 홈 배너 조회/일괄 저장 |
| `GET/POST /api/admin/stores`, `PUT/DELETE /api/admin/stores/:id` | 매장 CRUD |

> ⚠️ 실서비스 배포 시 HTTPS 적용이 필수입니다 (토큰이 평문 HTTP로 전송되면 탈취 가능).
