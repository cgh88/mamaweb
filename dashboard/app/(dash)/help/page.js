import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { FEEDBACK_CATEGORIES, FEEDBACK_PAGES, myFeedback } from '@/lib/feedback';
import { FeedbackForm } from './FeedbackForms';

export const metadata = { title: '도움말 · 마마치킨' };

// 자주 묻는 질문: [분류, [질문, 답]...]
const FAQ = [
  ['매출 숫자', [
    ['순매출·실매출·총매출은 무엇이 다른가요?', '총매출은 할인 전 정가 합계, 실매출은 할인 후 손님이 실제로 낸 금액(부가세 포함), 순매출은 실매출에서 부가세를 뺀 금액입니다. 화면 위쪽 금액 버튼으로 바꿀 수 있고, 고른 기준은 모든 화면에 똑같이 적용됩니다. 기본은 순매출입니다.'],
    ['오늘 매출은 왜 안 보이나요?', 'POS 매출은 매일 아침 6시에 전날까지 한 번에 가져옵니다. 그래서 대시보드는 항상 어제까지의 매출을 보여줍니다. 기본 기간도 \'어제\'입니다.'],
    ['취소 주문은 어떻게 계산되나요?', '취소는 마이너스 금액으로 들어와 합계에서 빠집니다. 주문 수에는 취소를 넣지 않고, 취소 건수는 따로 보여줍니다.'],
    ['POS 프로그램 숫자와 조금 달라요.', '사후 취소·반품이 생기면 3일 동안 다시 받아 맞춥니다. 사흘이 지나도 다르면 날짜와 매장을 적어 개선 요청(데이터 확인)으로 보내 주세요.'],
  ]],
  ['배달·포장·매장 구분', [
    ['배민·쿠팡 주문은 모두 배달인가요?', '아닙니다. 배민·쿠팡도 손님이 가지러 오는 포장 주문이 있어, POS에 찍힌 판매유형대로 배달과 포장을 나눕니다.'],
    ['매장(홀)과 매장 포장은 어떻게 나누나요?', '테이블에서 먹은 주문과 키오스크 주문은 \'매장(홀)\', 방문 포장과 테이블 그룹이 \'포장\'인 주문은 \'포장\'으로 셉니다. 키오스크는 먹고 가는지 포장인지 구분하는 값이 없어 홀로 셉니다.'],
    ['주문 채널은 무엇인가요?', '주문이 들어온 곳입니다. 배달의민족·쿠팡이츠·요기요 주문은 앱별로, 나머지는 매장 POS(홀·포장·전화 배달)로 나눕니다.'],
  ]],
  ['화면 사용', [
    ['엑셀로 받으려면?', '매출 현황·채널·메뉴·시간·주문 리포트 화면 오른쪽 위 \'엑셀 다운로드\'를 누르세요. 화면에서 고른 기간·매장 그대로, 화면 표와 관련 원자료가 시트별로 들어갑니다. 주문 목록·상세는 93일까지 들어갑니다.'],
    ['메인 화면 막대그래프는 무엇인가요?', '고른 기간의 마지막 날까지 최근 14일 매출입니다. 점은 지난주 같은 요일 매출이고, 날짜 아래에 공휴일·매장 이벤트·비 온 날이 표시됩니다.'],
    ['외부 인사이트의 예상 주문은 어떻게 나오나요?', '같은 요일 최근 4주 평균 주문에 공휴일 보정과 비 예보 보정을 곱한 값입니다. 생닭 수량은 레시피 기준 주문당 사용량으로 환산했습니다. 참고용 추정치입니다.'],
    ['경쟁 브랜드 소식은 어디서 오나요?', '뉴스 검색으로 bhc·BBQ·교촌·굽네·60계의 이벤트·할인·신메뉴 기사를 모아, 같은 내용의 기사는 하나로 묶었습니다. 분류는 제목으로 자동 판정해 가끔 틀릴 수 있습니다.'],
    ['매장 이벤트는 왜 등록하나요?', '시험기간, 축구 경기, 배달앱 할인처럼 주문에 영향을 주는 일을 적어 두면 7일 전망과 그래프에 표시되고, 나중에 효과를 비교할 수 있습니다. 외부 인사이트 화면 아래에서 등록합니다.'],
  ]],
  ['재고', [
    ['추정 재고는 어떻게 계산하나요?', '마지막 실사 수량 + 그 뒤 입고량 − 그 뒤 판매로 쓴 양(레시피 기준)입니다. 실사를 자주 할수록 정확해집니다.'],
    ['재고 알람은 언제 뜨나요?', '추정 재고가 안전재고 이하이면 \'부족\', 안전재고까지 이틀치 사용량 이하로 남으면 \'주의\'입니다. 실사를 한 번도 안 한 식자재는 알람이 뜨지 않습니다.'],
    ['레시피 수치가 실제와 달라요.', '처음 넣은 레시피와 안전재고는 업계 통상값으로 만든 초안입니다. 레시피·식자재 화면과 재고·안전재고 화면에서 매장 실제 값으로 고쳐 주세요.'],
  ]],
  ['계정·보안', [
    ['비밀번호를 바꾸려면?', '왼쪽 아래 \'비밀번호\'를 누르세요. 8자 이상, 영문과 숫자를 섞어야 합니다.'],
    ['비밀번호를 잊었어요.', '슈퍼관리자에게 초기화를 요청하세요. 임시 비밀번호로 로그인하면 새 비밀번호를 정하는 화면이 먼저 나옵니다. 로그인을 5번 틀리면 10분 동안 잠깁니다.'],
    ['아이디 저장은 안전한가요?', '아이디만 이 브라우저에 저장하고 비밀번호는 저장하지 않습니다. 여러 사람이 같이 쓰는 컴퓨터에서는 체크하지 마세요.'],
    ['설정 메뉴가 안 보여요.', 'API 키와 수집 설정은 슈퍼관리자만 바꿀 수 있어, 일반 계정에는 설정 메뉴가 보이지 않습니다.'],
  ]],
];

const fmt = (ts) => new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const statusTag = (s) => (s === '완료' ? 'tag on' : s === '보류' ? 'tag off' : s === '접수' ? 'tag warn' : 'tag web');

export default async function HelpPage() {
  const user = await requireUser();
  const mine = await myFeedback(user.id);
  return (
    <>
      <div className="head">
        <div>
          <h1>도움말</h1>
          <div className="muted">자주 묻는 질문과 개선 요청</div>
        </div>
        {user.is_super && <Link className="btn" href="/feedback">개선 요청 관리</Link>}
      </div>

      <section className="panel">
        <div className="ph"><h2>자주 묻는 질문</h2></div>
        <div className="faq">
          {FAQ.map(([group, items]) => (
            <div key={group} className="faq-group">
              <h3>{group}</h3>
              {items.map(([qq, a]) => (
                <details key={qq}>
                  <summary>{qq}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <section className="panel">
          <div className="ph"><h2>개선 요청 보내기</h2><span className="small muted">불편한 점·필요한 기능·오류</span></div>
          <FeedbackForm categories={FEEDBACK_CATEGORIES} pages={FEEDBACK_PAGES} />
        </section>
        <section className="panel">
          <div className="ph"><h2>내가 보낸 요청</h2><span className="small muted">최근 30건</span></div>
          {mine.length === 0 ? <div className="empty">아직 보낸 요청이 없습니다.</div> : (
            <div className="fb-list">
              {mine.map((f) => (
                <details key={f.id} className="fb">
                  <summary>
                    <span className={statusTag(f.status)}>{f.status}</span>
                    <b>{f.title}</b>
                    <span className="small muted">#{f.id} · {fmt(f.created_at)}</span>
                  </summary>
                  <div className="small muted">{f.category}{f.page ? ` · ${f.page}` : ''}</div>
                  <p className="fb-body">{f.body}</p>
                  {f.reply && <div className="ins"><b className="small">답변</b><span>{f.reply}</span></div>}
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
