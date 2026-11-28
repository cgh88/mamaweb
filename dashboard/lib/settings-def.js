// 설정 페이지 항목 정의 (서버·클라이언트 공용)
//   secret: 암호화 저장, 화면에는 끝 4자리만 표시 · 값이 비어 있으면 서버 .env 값 사용 (pos-sync/.env)
//   저장 위치: mamapos.dash_setting — pos-sync(매출 수집·외부 데이터)가 실행할 때 읽어 .env보다 우선 적용

export const SETTING_GROUPS = [
  {
    id: 'pos',
    title: 'POS 매출 수집 (스마일비즈)',
    desc: '매일 06:00 전날 매출을 가져오는 API 설정입니다. 토큰이 만료되면 수집이 실패하니 새 토큰으로 바꿔 주세요.',
    test: true,
    items: [
      { key: 'POS_API_TOKEN', label: 'API 인증 토큰', secret: true, help: 'Authorization: Bearer 뒤의 값만 입력' },
      { key: 'POS_STORE_CODES', label: '수집 매장 코드', help: '쉼표로 구분 (예: 7915301,7915302)', pattern: /^\d+(,\d+)*$/ },
      { key: 'POS_SYNC_DAYS', label: '재수집 일수', help: '매일 어제 포함 며칠치를 다시 받을지 (사후 취소 반영, 1~14)', number: [1, 14] },
    ],
  },
  {
    id: 'weather',
    title: '날씨 (기상청 · 공공데이터포털)',
    desc: 'data.go.kr에서 「기상청_지상(종관, ASOS) 일자료 조회서비스」와 「기상청_단기예보 조회서비스」를 활용신청한 일반 인증키(Decoding)를 넣어 주세요.',
    test: true,
    items: [
      { key: 'DATA_GO_KR_KEY', label: '공공데이터포털 인증키', secret: true, help: '일반 인증키 (Decoding)' },
    ],
  },
  {
    id: 'news',
    title: '경쟁 브랜드 소식 (네이버 검색 API)',
    desc: '네이버 개발자센터에서 애플리케이션을 등록하고 「검색」 API를 선택해 받은 값입니다. 비워 두면 Google 뉴스로 수집합니다.',
    test: true,
    items: [
      { key: 'NAVER_CLIENT_ID', label: 'Client ID', secret: true },
      { key: 'NAVER_CLIENT_SECRET', label: 'Client Secret', secret: true },
      {
        key: 'COMPETITOR_BRANDS', label: '경쟁 브랜드', multiline: true,
        help: '한 줄에 하나씩 「표시 이름: 기사 제목에 있어야 하는 표기, …」 (비우면 기본 5개)',
        placeholder: 'bhc: bhc, BHC, 비에이치씨\nBBQ: BBQ, 비비큐\n교촌치킨: 교촌\n굽네치킨: 굽네\n60계치킨: 60계',
        validate: (v) => {
          const lines = v.split('\n').map((l) => l.trim()).filter(Boolean);
          if (lines.length > 10) return '브랜드는 10개까지 넣을 수 있습니다.';
          const bad = lines.find((l) => !/^[^:]{1,20}:\s*[^:]+$/.test(l));
          return bad ? `형식을 확인하세요: ${bad}` : null;
        },
      },
    ],
  },
];

export const SETTING_DEFS = Object.fromEntries(SETTING_GROUPS.flatMap((g) => g.items.map((i) => [i.key, { ...i, group: g.id }])));
