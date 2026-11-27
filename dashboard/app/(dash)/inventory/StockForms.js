'use client';

import { useActionState, useState } from 'react';
import { addReceipt, saveCounts, saveSafety } from '../inv-actions';
import { qtyFmt } from '@/lib/stock';

const MODES = [['count', '재고 실사'], ['receipt', '입고 등록'], ['safety', '안전재고 설정']];
const cellInput = { width: 110, minHeight: 36, border: '1px solid #DDD6CD', borderRadius: 8, padding: '0 10px', textAlign: 'right' };

function Msg({ state }) {
  if (state?.error) return <div className="error" role="alert">{state.error}</div>;
  if (state?.ok) return <div className="ok" role="status">{state.ok}</div>;
  return null;
}

/** 재고 실사 / 입고 / 안전재고 입력 */
export default function StockForms({ store, rows, defaultDate, today }) {
  const [mode, setMode] = useState('count');
  const [cState, cAction, cPending] = useActionState(saveCounts, null);
  const [rState, rAction, rPending] = useActionState(addReceipt, null);
  const [sState, sAction, sPending] = useActionState(saveSafety, null);

  return (
    <>
      <div className="ph">
        <h2>{store} 입력</h2>
        <div className="seg" role="group" aria-label="입력 종류">
          {MODES.map(([k, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
        </div>
      </div>

      {mode === 'count' && (
        <form action={cAction} className="form">
          <input type="hidden" name="store" value={store} />
          <label style={{ maxWidth: 260 }}>실사 기준일 <span className="small muted" style={{ fontWeight: 400 }}>그날 마감 후 재고</span>
            <input type="date" name="count_date" defaultValue={defaultDate} max={today} required />
          </label>
          <div className="small muted">센 식자재만 입력하세요. 빈칸은 저장하지 않습니다.</div>
          <div className="scroll">
            <table>
              <thead><tr><th className="l">식자재</th><th>현재 추정</th><th>실사 수량</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="l">{r.name}</td>
                    <td className="muted">{r.est === null ? '-' : `${qtyFmt(r.est)} ${r.unit}`}</td>
                    <td><input name={`cnt_${r.id}`} inputMode="decimal" aria-label={`${r.name} 실사 수량 (${r.unit})`} style={cellInput} /> <span className="small muted">{r.unit}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Msg state={cState} />
          <button className="btn primary" type="submit" disabled={cPending}>{cPending ? '저장 중…' : '실사 저장'}</button>
        </form>
      )}

      {mode === 'receipt' && (
        <form action={rAction} className="form">
          <input type="hidden" name="store" value={store} />
          <div className="grid2" style={{ gap: 10 }}>
            <label>식자재
              <select name="ingredient_id" required defaultValue="">
                <option value="" disabled>선택</option>
                {rows.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.unit}{r.pack_size ? `, 1${r.pack_name || '팩'}=${qtyFmt(r.pack_size)}` : ''})</option>)}
              </select>
            </label>
            <label>입고일<input type="date" name="receipt_date" defaultValue={today} max={today} required /></label>
          </div>
          <div className="grid2" style={{ gap: 10 }}>
            <label>수량 (기본 단위)<input name="qty" inputMode="decimal" required placeholder="예: 10000" /></label>
            <label>메모 <span className="small muted" style={{ fontWeight: 400 }}>선택</span><input name="note" maxLength={100} placeholder="거래처·발주번호 등" /></label>
          </div>
          <div className="small muted">실사일 이후에 들어온 입고만 추정 재고에 더해집니다. 실사 당일 입고분은 실사 수량에 포함된 것으로 봅니다.</div>
          <Msg state={rState} />
          <button className="btn primary" type="submit" disabled={rPending}>{rPending ? '저장 중…' : '입고 등록'}</button>
        </form>
      )}

      {mode === 'safety' && (
        <form action={sAction} className="form">
          <input type="hidden" name="store" value={store} />
          <div className="small muted">이 수량 이하로 내려가면 &lsquo;부족&rsquo;으로 알립니다. 빈칸으로 저장하면 알람을 끕니다. 참고: 일평균 사용량 × 발주 소요 일수.</div>
          <div className="scroll">
            <table>
              <thead><tr><th className="l">식자재</th><th>일평균 사용</th><th>안전재고</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="l">{r.name}</td>
                    <td className="muted">{r.avg_daily ? `${qtyFmt(r.avg_daily)} ${r.unit}` : '-'}</td>
                    <td><input name={`safety_${r.id}`} defaultValue={r.safety_qty ?? ''} inputMode="decimal" aria-label={`${r.name} 안전재고 (${r.unit})`} style={cellInput} /> <span className="small muted">{r.unit}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Msg state={sState} />
          <button className="btn primary" type="submit" disabled={sPending}>{sPending ? '저장 중…' : '안전재고 저장'}</button>
        </form>
      )}
    </>
  );
}
