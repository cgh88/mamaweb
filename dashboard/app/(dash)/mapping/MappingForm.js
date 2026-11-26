'use client';

import { useActionState } from 'react';
import { saveMapping } from '../actions';

const CATEGORIES = ['후라이드 치킨', '소스 치킨', '사이드', '버거', '딥 소스', '베이스 소스', '음료', '주류', '토핑', '치킨무', '세트·기타', '이벤트', '배달비', '할인·조정', '옵션', '옵션(소스선택)', '요청사항'];

export default function MappingForm({ row, webMenu }) {
  const [state, action, pending] = useActionState(saveMapping, null);
  const [resetState, resetAction, resetPending] = useActionState(saveMapping, null);
  const msg = state || resetState;
  const groups = [...new Set(webMenu.map((m) => m.category))];
  return (
    <div className="form" key={`${row.src}|${row.menu_group}|${row.item_text}`}>
      <div className="ins">
        <span className="small muted">원래 표기 · {row.src === 'APP' ? '배달앱' : `매장 POS (분류: ${row.menu_group || '-'})`}</span>
        <b style={{ wordBreak: 'break-all' }}>{row.item_text}</b>
        <span className="small muted">판매 {Number(row.n).toLocaleString('ko-KR')}행 · 마지막 {row.last_day || '-'} · {row.source === 'manual' ? '수동 수정됨' : '자동 분류'}</span>
      </div>
      {msg?.error && <div className="error" role="alert">{msg.error}</div>}
      {msg?.ok && <div className="ok" role="status">{msg.ok}</div>}
      <form action={action} className="form">
        <input type="hidden" name="src" value={row.src} />
        <input type="hidden" name="menu_group" value={row.menu_group} />
        <input type="hidden" name="item_text" value={row.item_text} />
        <label>홈페이지 메뉴
          <select name="menu_item_id" defaultValue={row.menu_item_id || ''}>
            <option value="">연결 안 함 (표준명만 사용)</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {webMenu.filter((m) => m.category === g).map((m) => <option key={m.id} value={m.id}>{m.name} (#{m.id})</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>표준 메뉴명 <span className="small muted" style={{ fontWeight: 400 }}>홈페이지 메뉴를 고르고 비워두면 그 메뉴 이름</span>
          <input name="std_name" defaultValue={row.std_name} maxLength={80} />
        </label>
        <div className="grid2" style={{ gap: 10 }}>
          <label>분류
            <select name="category" defaultValue={row.category}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <label>집계
            <select name="is_option" defaultValue={row.is_option ? '1' : '0'}>
              <option value="0">메뉴 (판매 집계)</option>
              <option value="1">옵션·요청 (집계 제외)</option>
            </select>
          </label>
        </div>
        <label className="check"><input type="checkbox" name="rename_all" value="1" /> 같은 표준명(&lsquo;{row.std_name}&rsquo;)으로 묶인 다른 표기도 함께 변경</label>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? '저장 중…' : '저장 (수동)'}</button>
      </form>
      {row.source === 'manual' && (
        <form action={resetAction}>
          <input type="hidden" name="src" value={row.src} />
          <input type="hidden" name="menu_group" value={row.menu_group} />
          <input type="hidden" name="item_text" value={row.item_text} />
          <input type="hidden" name="reset" value="1" />
          <button className="btn" type="submit" disabled={resetPending} style={{ width: '100%' }}>자동 분류로 되돌리기</button>
        </form>
      )}
      <div className="small muted">저장하면 과거를 포함한 모든 기간의 메뉴 집계에 바로 반영되고, 변경 이력이 남습니다.</div>
    </div>
  );
}
