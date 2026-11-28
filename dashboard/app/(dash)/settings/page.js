import { requireSuper } from '@/lib/auth';
import { hasMasterKey, opsStatus, settingHistory, settingRows } from '@/lib/settings';
import { SETTING_GROUPS } from '@/lib/settings-def';
import SettingsForm from './SettingsForm';

export const metadata = { title: '설정 · 마마치킨' };
export const dynamic = 'force-dynamic';

const fmt = (ts) => (ts ? new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const ACTIONS = { setting_updated: '설정 저장', setting_tested: '연결 테스트', setting_imported: '서버 .env에서 가져오기' };
// 클라이언트로 보낼 수 있는 값만 (정규식·함수 제외)
const plain = (it) => ({ key: it.key, label: it.label, secret: !!it.secret, help: it.help || '', multiline: !!it.multiline, placeholder: it.placeholder || '' });

export default async function SettingsPage() {
  await requireSuper();
  const [current, history, ops] = await Promise.all([settingRows(), settingHistory(), opsStatus()]);
  const keyOk = hasMasterKey();
  const { pos, ext } = ops;

  const status = [
    ['POS 매출 수집', pos.last_day ? `최근 데이터 ${pos.last_day} · 마지막 수집 ${fmt(pos.fetched_at)}` : '데이터 없음', '매일 06:00 (systemd mamapos-sync.timer)'],
    ['공휴일', ext.holiday_last ? `${ext.holiday_last}까지 등록` : '수집 전', 'Nager.Date · 키 불필요'],
    ['날씨 관측', ext.weather_last ? `${ext.weather_last}까지` : '키 필요 (공공데이터포털)', '기상청 ASOS 일자료 · 서울'],
    ['단기예보', ext.forecast_at ? `발표 ${fmt(ext.forecast_at)}` : '키 필요 (공공데이터포털)', '기상청 단기예보 · 매장 동네'],
    ['경쟁 브랜드 소식', ext.news_at ? `마지막 수집 ${fmt(ext.news_at)} · ${ext.news_provider === 'naver' ? '네이버' : 'Google 뉴스'}` : '수집 전', '네이버 검색 API (없으면 Google 뉴스)'],
    ['DB 백업', '매일 04:30 · 14일 보관', '서버 /var/backups/postgresql (pg_dump)'],
  ];

  return (
    <>
      <div className="head">
        <div>
          <h1>설정</h1>
          <div className="muted">외부 API 키와 수집 설정 · 저장한 값은 다음 수집(매일 06:00)부터 서버 .env보다 우선 적용됩니다</div>
        </div>
      </div>

      {!keyOk && (
        <div className="notice" role="alert">
          서버에 암호화 키(SETTINGS_KEY)가 설정되지 않아 API 키를 저장할 수 없습니다. 관리자에게 서버 .env 설정을 요청하세요.
        </div>
      )}

      <section className="panel">
        <div className="ph"><h2>운영 상태</h2><span className="small muted">수집·백업 일정</span></div>
        <div className="scroll">
          <table>
            <thead><tr><th className="l">항목</th><th className="l">상태</th><th className="l">일정·출처</th></tr></thead>
            <tbody>
              {status.map(([a, b, c]) => <tr key={a}><td className="l"><b>{a}</b></td><td className="l">{b}</td><td className="l muted">{c}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      {SETTING_GROUPS.map((g) => (
        <section key={g.id} className="panel">
          <div className="ph"><h2>{g.title}</h2></div>
          <div className="small muted">{g.desc}</div>
          <SettingsForm group={{ id: g.id, test: !!g.test }} items={g.items.map(plain)} current={current} />
        </section>
      ))}

      <section className="panel">
        <div className="ph"><h2>변경 이력</h2><span className="small muted">최근 15건 · 비밀값은 기록하지 않음</span></div>
        {history.length === 0 ? <div className="empty">아직 변경 이력이 없습니다.</div> : (
          <div className="scroll">
            <table>
              <thead><tr><th className="l">시각</th><th className="l">사용자</th><th className="l">작업</th><th className="l">내용</th></tr></thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td className="l" style={{ whiteSpace: 'nowrap' }}>{fmt(h.at)}</td>
                    <td className="l">{h.username || '-'}</td>
                    <td className="l">{ACTIONS[h.action] || h.action}</td>
                    <td className="l small">
                      {h.action === 'setting_imported' ? (h.detail?.keys || []).join(', ') : h.action === 'setting_updated'
                        ? (h.detail?.changes || []).map((c) => `${c.key} ${c.change}`).join(', ')
                        : `${h.detail?.group || ''} ${h.detail?.ok ? '성공' : '실패'}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="small muted">
        보안: API 키는 AES-256-GCM으로 암호화해 DB에 저장하며, 화면에는 끝 4자리만 표시합니다. 저장·삭제할 때 현재 비밀번호를 확인하고, 변경 이력에는 키 이름만 남깁니다.
        DB 접속 정보·암호화 키 같은 서버 기본 설정은 보안상 화면에서 바꿀 수 없고 서버 .env에서만 관리합니다.
      </div>
    </>
  );
}
