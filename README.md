# 마마치킨 웹사이트 리뉴얼 (mamaweb)

[mamachicken.kr](https://mamachicken.kr)을 모던한 UI/UX로 리뉴얼한 프로젝트입니다.

## 기술 스택

- **Frontend**: Next.js 15 (App Router, TypeScript) — 포트 3000
- **Backend**: Node.js + Express — 포트 4000
- **이미지**: 기존 사이트에서 전량 다운로드하여 `frontend/public/`에서 서빙

## 실행 방법

```bash
# 1. 의존성 설치 (루트/백엔드/프론트엔드)
npm install
npm run install:all

# 2. 개발 서버 실행 (백엔드 + 프론트엔드 동시 실행)
npm run dev
```

- 프론트엔드: http://localhost:3000
- 백엔드 API: http://localhost:4000/api (프론트에서 `/api/*` 리라이트로 프록시)

## 구조

```
mamaweb/
├─ backend/            # Express API 서버
│  ├─ server.js
│  └─ data/            # 메뉴/매장/게시글/홈 데이터 (기존 사이트에서 추출)
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
- 비밀번호: 기본 `mama1234` — 백엔드 `ADMIN_KEY` 환경변수로 변경 가능
- 기능:
  - **메뉴 관리**: 카테고리/서브탭별 메뉴 추가·수정·삭제, 이미지 업로드
  - **홈 배너 관리**: 메인 상단 스크롤(슬라이드) 배너 추가·삭제·순서 변경
  - **새소식/이벤트 관리**: 게시글 작성·수정·삭제 (본문 HTML 지원, 이벤트 썸네일 업로드)
  - **이벤트 기간**: 이벤트에 시작일/종료일을 설정하면 사이트에 진행중/예정/종료 배지가 자동 표시 (종료 시 썸네일 흑백 처리, 기간 미설정 시 상시 진행)
  - **매장 관리**: 매장 추가·수정·삭제 (매장명/지역/주소/연락처/운영시간/구글지도 퍼가기 주소) — 매장찾기 페이지와 홈 검색에 바로 반영
- 변경 사항은 `backend/data/*.json`에 즉시 저장되고 사이트에 바로 반영됩니다.
- 업로드 이미지는 `frontend/public/uploads/`에 저장됩니다.

### 관리자 API (`x-admin-key` 헤더 필요)

| 엔드포인트 | 설명 |
| --- | --- |
| `POST /api/admin/login` | 비밀번호 확인 |
| `POST /api/admin/upload` | 이미지 업로드 (multipart, 10MB 제한) |
| `GET/POST /api/admin/menu`, `PUT/DELETE /api/admin/menu/:id` | 메뉴 CRUD |
| `POST /api/admin/posts`, `PUT/DELETE /api/admin/posts/:idx` | 게시글 CRUD |
| `GET/PUT /api/admin/banners` | 홈 배너 조회/일괄 저장 |
| `GET/POST /api/admin/stores`, `PUT/DELETE /api/admin/stores/:id` | 매장 CRUD |

> ⚠️ 현재 인증은 로컬 개발용 단순 키 방식입니다. 실서비스 배포 시 세션/JWT 기반 인증과 HTTPS 적용이 필요합니다.
