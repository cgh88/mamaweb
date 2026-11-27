'use client';

import { Fragment, useState } from 'react';
import { won } from '@/lib/format';

const pay = (o) => [['카드', o.ax_card], ['현금', o.ax_cash], ['앱·기타', o.ax_etc]].filter(([, v]) => Number(v)).map(([k, v]) => `${k} ${won(v)}`).join(' · ') || '-';

/** 주문 헤더 표 + 행 클릭 시 상세 펼침 */
export default function OrdersTable({ orders, items }) {
  const [open, setOpen] = useState(() => new Set());
  const byOrder = items.reduce((m, it) => m.set(it.inv_seq, [...(m.get(it.inv_seq) || []), it]), new Map());
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const summary = (id) => {
    const menus = (byOrder.get(id) || []).filter((i) => !i.is_option && i.category !== '할인·조정');
    if (!menus.length) return '-';
    const first = `${menus[0].std_name}${Number(menus[0].qty) > 1 ? ` ×${Number(menus[0].qty)}` : ''}`;
    return menus.length > 1 ? `${first} 외 ${menus.length - 1}` : first;
  };

  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th className="l">주문 시각</th><th className="l">매장</th><th className="l">구분</th><th className="l">메뉴</th>
            <th>총매출</th><th>할인</th><th>실매출</th><th>순매출</th><th className="l">결제</th><th className="l">상태</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const isOpen = open.has(o.inv_seq);
            const rows = byOrder.get(o.inv_seq) || [];
            return (
              <Fragment key={o.inv_seq}>
                <tr onClick={() => toggle(o.inv_seq)} style={{ cursor: 'pointer', background: isOpen ? '#FFF4EF' : undefined }}>
                  <td className="l">
                    <button type="button" aria-expanded={isOpen} aria-label={`주문 ${o.inv_seq} 상세 ${isOpen ? '닫기' : '열기'}`}
                      onClick={(e) => { e.stopPropagation(); toggle(o.inv_seq); }}
                      style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink)', font: 'inherit' }}>
                      {isOpen ? '▾' : '▸'} {o.order_time || o.sale_date}
                    </button>
                  </td>
                  <td className="l">{o.store_name}</td>
                  <td className="l"><span className={o.sale_type_name === '포장' ? 'tag warn' : o.sale_type_name === '배달' ? 'tag' : 'tag web'}>{o.order_kind}</span></td>
                  <td className="l" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary(o.inv_seq)}</td>
                  <td>{won(o.gross)}</td>
                  <td className="muted">{Number(o.dc) ? `-${won(o.dc)}` : '0'}</td>
                  <td>{won(o.paid)}</td>
                  <td><b>{won(o.net)}</b></td>
                  <td className="l small">{pay(o)}</td>
                  <td className="l">{o.is_cancel ? <span className="tag warn">취소</span> : <span className="tag on">정상</span>}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={10} className="l" style={{ background: '#FBFAF8', whiteSpace: 'normal' }}>
                      <div className="small muted" style={{ marginBottom: 6 }}>
                        주문번호 {o.inv_seq} · POS {o.pos_no || '-'} · 영업일 {o.sale_date}
                        {o.ret_inv_seq ? ` · 원주문 ${o.ret_inv_seq}` : ''}{o.dc_reason_desc ? ` · 할인사유 ${o.dc_reason_desc}` : ''}
                        {' '}· 부가세 {won(o.tax)}원
                      </div>
                      {rows.length === 0 ? <div className="small muted">주문 상세가 없습니다 (2024-10 이전 일부 주문은 상세가 누락되어 있습니다).</div> : (
                        <table>
                          <thead><tr><th>#</th><th className="l">원래 표기</th><th className="l">표준 메뉴</th><th className="l">분류</th><th>수량</th><th>단가</th><th>금액</th></tr></thead>
                          <tbody>
                            {rows.map((it) => (
                              <tr key={it.inv_nos} style={it.is_option ? { color: 'var(--muted)' } : undefined}>
                                <td>{it.inv_nos}</td>
                                <td className="l" style={{ whiteSpace: 'normal' }}>{it.is_option ? '└ ' : ''}{it.item_text || '(금액 조정)'}</td>
                                <td className="l" style={{ whiteSpace: 'normal' }}>{it.std_name}</td>
                                <td className="l small">{it.is_option ? '옵션' : it.category}{it.dc_reason_desc ? ` · ${it.dc_reason_desc}` : ''}</td>
                                <td>{won(it.qty)}</td>
                                <td>{won(it.qtyprice)}</td>
                                <td>{won(it.sumprice)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <div className="small muted" style={{ marginTop: 6 }}>상세 금액은 할인 전 메뉴 가격입니다. 결제 금액은 위 주문 행(헤더)을 기준으로 보세요.</div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
