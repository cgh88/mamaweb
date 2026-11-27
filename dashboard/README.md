# 마마치킨 매출 대시보드 (dash.mamachicken.kr)

POS 매출 DB(`mamapos`)를 조회하는 관리자 전용 대시보드입니다. 홈페이지(`frontend/`, `backend/`)와는 별개의 앱입니다.

| 메뉴 | 내용 |
| --- | --- |
| 매출 현황 `/` | 매출·주문·객단가·취소, 일별 매출(비교 기간 겹쳐 보기), 매장별 성과, 월별 추이 |
| 채널 분석 `/channel` | 판매유형(배달·매장·포장) / 주문 채널(배달앱), 월별 비중, 매장×판매유형 |
| 시간 분석 `/time` | 요일×시간대 히트맵(주문 수·매출·객단가), 시간대·요일별 주문 |
| 메뉴 분석 `/menu` | 판매 순위(분류 탭), 치킨 부위·맛 구성, 소스 선택 순위, 함께 주문 비율, 주간 추이 |
| 매장 비교 `/stores` | 매장 카드(일평균·누적), 12개월 표, **매장 정보 관리**(POS 코드 → 매장명) |
| 주문 리포트 `/orders` | 주문 헤더(총매출·할인·실매출·부가세·순매출·결제수단) + 행을 펼쳐 주문 상세(메뉴·옵션), 판매유형·채널·상태·메뉴 검색, CSV(최대 93일) |
| 메뉴 매핑 관리 `/mapping` | 배달앱·POS 원래 메뉴명 → 홈페이지 메뉴 연결 수정 (수동 저장은 자동 매핑이 덮어쓰지 않음) |

## 집계 기준

- **매출 금액**: 주문 헤더 기준, 화면의 토글로 선택 (쿠키에 저장, 기본 순매출). 취소는 음수로 들어와 합계에서 상쇄
  - 순매출 `sub_tot` = 실매출 − 부가세 / 실매출 `grand_total` = 할인 후 결제액 / 총매출 `gross_amt` = 할인 전 정가
- **판매유형**: POS 판매유형(1001 매장 · 1002 배달 · 1003 포장). 배민·쿠팡 포장 주문도 POS에 포장으로 들어오며 주문상세 `qty_delivery`/`qty_packing` 플래그와 일치
- **주문 채널**: 주문상세에 배달앱 메뉴코드(BM·CP·YG·BDP)가 있으면 그 앱, 없으면 매장 POS (`pos_order_app`, 수집 때마다 재생성)
  → 주문 구분 `order_kind`: 배민 배달·배민 포장·쿠팡 배달·쿠팡 포장·전화 배달·방문 포장·홀
- **주문 수**: 취소가 아닌 주문 건수 / **객단가** = 매출 ÷ 주문 수
- **메뉴**: 주문상세 수량(`v_pos_sales_item`, 옵션 행 제외). 상세 금액은 할인 전 정가라 매출로 쓰지 않음
- **매장**: `store_info`의 매장명 단위 (같은 매장의 POS 코드 변경은 하나로 합산), 기본은 운영 매장만
- **비교**: 월 단위 기간은 전월 같은 날짜, 그 외는 직전 같은 길이 / 전년 비교는 두 기간 모두 매출이 있는 매장만
- 2024-10 이전 주문상세는 기존 수집 프로그램 문제로 일부 누락 → 메뉴 분석에 경고 표시

## 구성

- Next.js 15 (App Router, 서버 컴포넌트에서 직접 SQL 조회), `pg`
- DB 계정 `mamadash`: 매출 데이터 **조회만**, `pos_menu_map`·`store_info`·대시보드 테이블만 수정
- 로그인: `dash_users`(scrypt 해시), 세션 `dash_sessions`(토큰 SHA-256 해시, 12시간), 5회 실패 시 IP 10분 잠금,
  첫 로그인 시 비밀번호 변경 강제, 변경 이력 `dash_audit`
- 앱은 `127.0.0.1:3100`에서만 리슨, Nginx(`deploy/nginx-dash.conf`)가 HTTPS 처리

## 운영 서버 설치 (최초 1회)

```bash
cd ~/mamaweb/dashboard
cp .env.example .env            # PGPASSWORD = mamadash 계정 비밀번호
npm ci && npm run build
(set -a; . ../pos-sync/.env; set +a; npm run db:init)   # 테이블·권한 (DB 소유자 계정으로)
npm run user:create -- admin    # 임시 비밀번호 출력 (한 번만 표시)
pm2 start npm --name mama-dash -- start && pm2 save
```

비밀번호 초기화: `npm run user:create -- admin --reset`

## 업데이트

```bash
cd ~/mamaweb && git pull && cd dashboard && npm ci && npm run build && pm2 restart mama-dash
```

## 로컬 개발

`.env`에 로컬 PostgreSQL(운영 DB 복사본) 접속 정보를 넣고 `npm run dev` → http://localhost:3100
