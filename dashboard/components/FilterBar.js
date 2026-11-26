'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PERIODS } from '@/lib/period';

/**
 * 기간·매장·비교 기준 필터. 상태는 URL 쿼리에 저장 (링크 공유·새로고침 시 유지)
 *  periods: 보여줄 기간 키 목록 / cmp: 비교 기준 토글 / stores: [{store_name, open}] / selects: 추가 드롭다운
 */
export default function FilterBar({ periodKey, from, to, periods, cmp, stores, selects = [], extra }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [custom, setCustom] = useState(periodKey === 'custom');
  const [range, setRange] = useState({ from, to });

  const go = (changes) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === null || v === '') p.delete(k);
      else p.set(k, v);
    }
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="bar">
      <div className="seg" role="group" aria-label="기간">
        {PERIODS.filter((x) => periods.includes(x.key)).map((x) => (
          <button key={x.key} type="button" className={periodKey === x.key && !custom ? 'on' : ''}
            onClick={() => { setCustom(false); go({ period: x.key, from: '', to: '' }); }}>
            {x.label}
          </button>
        ))}
        <button type="button" className={custom ? 'on' : ''} onClick={() => setCustom(true)}>직접 선택</button>
      </div>
      {custom && (
        <form className="field" onSubmit={(e) => { e.preventDefault(); go({ period: 'custom', from: range.from, to: range.to }); }}>
          <input type="date" aria-label="시작일" value={range.from} max={to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          ~
          <input type="date" aria-label="종료일" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <button className="btn small" type="submit">적용</button>
        </form>
      )}
      {stores && (
        <label className="field">매장
          <select value={sp.get('store') || ''} onChange={(e) => go({ store: e.target.value })}>
            <option value="">운영 매장 전체</option>
            {stores.map((s) => (
              <option key={s.store_name} value={s.store_name}>{s.store_name}{s.open ? '' : ' (폐점)'}</option>
            ))}
            <option value="all">폐점 매장 포함 전체</option>
          </select>
        </label>
      )}
      {selects.map((s) => (
        <label key={s.name} className="field">{s.label}
          <select value={sp.get(s.name) || ''} onChange={(e) => go({ [s.name]: e.target.value })}>
            {s.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      ))}
      {cmp && (
        <div className="seg push" role="group" aria-label="비교 기준">
          <button type="button" className={cmp !== 'yoy' ? 'on' : ''} onClick={() => go({ cmp: '' })}>전월·직전 기간 대비</button>
          <button type="button" className={cmp === 'yoy' ? 'on' : ''} onClick={() => go({ cmp: 'yoy' })}>전년 동기 · 동일 매장</button>
        </div>
      )}
      {extra && <span className="small muted push">{extra}</span>}
    </div>
  );
}
