import { getUser } from '@/lib/auth';
import { getAmount } from '@/lib/amount-server';
import { addDays, parsePeriod } from '@/lib/period';
import { WEEKDAYS } from '@/lib/format';
import { addInfo, addTable, newWorkbook, xlsxResponse } from '@/lib/excel';
import {
  MENU_TAB_NAMES, attachRates, byApp, byType, dailyRecent, exportDailyStore, exportMenuSales, heatmap, menuMix, menuRanking,
  monthlyByStore, orderItems, orderList, overview, storeBreakdown, typeByChannel, typeTrend, weeklyTop,
} from '@/lib/queries';
import { channelLabel, parseOrderFilters } from '../orders/filters';

export const dynamic = 'force-dynamic';

/*
 * 화면별 엑셀 내보내기: /export?view=overview|channel|menu|time|orders&(화면과 같은 필터)
 *  - 화면에 보이는 표·그래프 값을 시트로, 관련 원자료(일별 매장 매출·메뉴 판매·주문 목록/상세)를 추가 시트로
 *  - 주문 목록·상세 시트는 최대 93일 (그보다 긴 기간은 집계 시트만)
 */
const ORDER_MAX_DAYS = 93;
const VIEWS = {
  overview: { title: '매출 현황', def: 'yesterday' },
  channel: { title: '채널 분석', def: 'yesterday' },
  menu: { title: '메뉴 분석', def: 'yesterday' },
  time: { title: '시간 분석', def: '12w' },
  orders: { title: '주문 리포트', def: 'yesterday' },
};
const HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1];
const storeLabel = (s) => (s === 'all' ? '폐점 매장 포함 전체' : s || '운영 매장 전체');
const aov = (rev, orders) => (Number(orders) ? Math.round(Number(rev) / Number(orders)) : 0);
const share = (part, total) => (Number(total) ? Math.round((Number(part) / Number(total)) * 1000) / 10 : 0);

const WON = (header, key) => ({ header, key, fmt: 'won', width: 14 });
const INT = (header, key) => ({ header, key, fmt: 'int', width: 10 });

/** 원자료: 일자 × 매장 × 판매유형 (세 금액 기준) */
async function addDailyRaw(wb, p, store) {
  const rows = await exportDailyStore(p, store);
  addTable(wb, '원자료_일별매장매출', [
    { header: '영업일', key: 'sale_date', width: 12 },
    { header: '요일', key: (r) => '일월화수목금토'[new Date(`${r.sale_date}T00:00:00Z`).getUTCDay()], width: 6 },
    { header: '매장', key: 'store_name', width: 12 }, { header: '판매유형', key: 'sale_type_name', width: 10 },
    INT('주문 수', 'orders'), INT('취소', 'cancels'),
    WON('총매출', 'gross'), WON('실매출', 'paid'), WON('부가세', 'tax'), WON('순매출', 'net'),
  ], rows, { notes: ['취소 주문은 음수 금액으로 들어 있어 합계에서 상쇄됩니다.'] });
}

/** 원자료: 주문 목록 + 주문 상세 */
async function addOrdersRaw(wb, p, store, f) {
  if (p.days > ORDER_MAX_DAYS) {
    addTable(wb, '원자료_주문', [{ header: '안내', key: 'msg', width: 80 }], [{ msg: `주문 목록·상세는 최대 ${ORDER_MAX_DAYS}일까지 내보냅니다. 기간을 줄여 다시 받으세요.` }]);
    return;
  }
  const orders = await orderList(p, store, f, 1, 0);
  const items = await orderItems(orders.map((o) => o.inv_seq));
  const orderOf = new Map(orders.map((o) => [o.inv_seq, o]));
  addTable(wb, '원자료_주문목록', [
    { header: '영업일', key: 'sale_date', width: 12 }, { header: '주문시각', key: 'order_time', width: 17 },
    { header: '매장', key: 'store_name', width: 10 }, { header: '주문번호', key: 'inv_seq', fmt: 'text', width: 22 },
    { header: '주문구분', key: 'order_kind', width: 12 }, { header: '판매유형', key: 'sale_type_name', width: 9 },
    { header: '주문채널', key: (o) => channelLabel(o.channel), width: 12 }, { header: '상태', key: (o) => (o.is_cancel ? '취소' : '정상'), width: 7 },
    WON('총매출', 'gross'), WON('할인', 'dc'), WON('실매출', 'paid'), WON('부가세', 'tax'), WON('순매출', 'net'),
    WON('카드', 'ax_card'), WON('현금', 'ax_cash'), WON('앱·기타', 'ax_etc'), { header: '할인 사유', key: 'dc_reason_desc', width: 16 },
  ], orders);
  addTable(wb, '원자료_주문상세', [
    { header: '영업일', key: (it) => orderOf.get(it.inv_seq)?.sale_date, width: 12 },
    { header: '매장', key: (it) => orderOf.get(it.inv_seq)?.store_name, width: 10 },
    { header: '주문번호', key: 'inv_seq', fmt: 'text', width: 22 }, INT('상세순번', 'inv_nos'),
    { header: '원래 표기', key: 'item_text', width: 30 }, { header: '표준 메뉴', key: 'std_name', width: 24 },
    { header: '분류', key: 'category', width: 12 }, { header: '옵션', key: (it) => (it.is_option ? 'Y' : ''), width: 6 },
    { header: '수량', key: 'qty', fmt: 'qty', width: 8 }, WON('단가', 'qtyprice'), WON('금액(정가)', 'sumprice'),
  ], items, { notes: ['상세 금액은 할인 전 정가입니다. 매출 합계는 주문 목록 시트를 쓰세요.'] });
}

async function addMenuRaw(wb, p, store) {
  addTable(wb, '원자료_메뉴판매', [
    { header: '매장', key: 'store_name', width: 10 }, { header: '분류', key: 'category', width: 12 },
    { header: '표준 메뉴', key: 'std_name', width: 26 }, { header: '수량', key: 'qty', fmt: 'qty', width: 10 }, WON('금액(정가)', 'list_amt'),
  ], await exportMenuSales(p, store), { notes: ['옵션 행 제외 · 금액은 할인 전 정가 합계'] });
}

// ---------------------------------------------------------------- 화면별 시트
async function overviewSheets(wb, p, store, amt) {
  const shift = p.cmp === 'yoy' ? 364 : 7;
  const [ov, days, byStore, monthly] = await Promise.all([
    overview(p, store), dailyRecent(p.to, store, 14, shift), storeBreakdown(p, store), monthlyByStore(p.to, store),
  ]);
  const { cur, base } = ov;
  const kpi = (label, c, b) => ({ label, cur: c, base: b, diff: Number(c) - Number(b), rate: Number(b) ? Math.round((Number(c) / Number(b) - 1) * 1000) / 10 : null });
  addTable(wb, '요약', [
    { header: '지표', key: 'label', width: 14 }, { header: '선택 기간', key: 'cur', fmt: 'won', width: 16 },
    { header: '비교 기간', key: 'base', fmt: 'won', width: 16 }, { header: '차이', key: 'diff', fmt: 'won', width: 14 },
    { header: '증감률(%)', key: 'rate', fmt: 'pct', width: 11 },
  ], [
    kpi(amt.label, cur.rev, base.rev), kpi('주문 수', cur.orders, base.orders),
    kpi('객단가', aov(cur.rev, cur.orders), aov(base.rev, base.orders)), kpi('취소 건수', cur.cancels, base.cancels),
    kpi('배달 취소', cur.delivery_cancels, base.delivery_cancels),
  ], { title: `매출 현황 · ${p.label}`, notes: [`비교: ${p.cmpLabel}`, `금액: ${amt.label} (${amt.desc}), 취소 차감`] });

  const byDate = Object.fromEntries(days.map((r) => [r.d, r]));
  const chart = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(p.to, i - 13);
    const x = byDate[d] || { rev: 0, orders: 0 };
    return { d, dow: '일월화수목금토'[new Date(`${d}T00:00:00Z`).getUTCDay()], rev: x.rev, orders: x.orders, aov: aov(x.rev, x.orders), prev: byDate[addDays(d, -shift)]?.rev || 0 };
  });
  addTable(wb, '일별 매출(최근14일)', [
    { header: '영업일', key: 'd', width: 12 }, { header: '요일', key: 'dow', width: 6 },
    WON(amt.label, 'rev'), INT('주문 수', 'orders'), WON('객단가', 'aov'), WON(p.cmp === 'yoy' ? '52주 전 같은 요일' : '전주 같은 요일', 'prev'),
  ], chart);

  const total = byStore.reduce((s, r) => s + r.rev, 0);
  addTable(wb, '매장별 성과', [
    { header: '매장', key: 'store_name', width: 12 }, { header: '상태', key: (r) => (r.open ? '운영' : '폐점'), width: 7 },
    WON(amt.label, 'rev'), { header: '비중(%)', key: (r) => share(r.rev, total), fmt: 'pct', width: 9 }, INT('주문 수', 'orders'),
    WON('객단가', (r) => aov(r.rev, r.orders)), WON('배달', 'delivery'), WON('매장(홀)', 'dinein'), WON('포장', 'takeout'),
  ], byStore, { notes: [p.label] });

  const months = [...new Set(monthly.map((r) => r.m))];
  const names = [...new Set(monthly.map((r) => r.store_name))];
  addTable(wb, '월별 매장 매출', [
    { header: '월', key: 'm', width: 10 }, ...names.map((n) => WON(n, n)), WON('합계', 'total'),
  ], months.map((m) => {
    const row = { m, total: 0 };
    for (const r of monthly.filter((x) => x.m === m)) { row[r.store_name] = r.rev; row.total += r.rev; }
    return row;
  }), { notes: ['최근 12개월, 기간 마지막 날이 속한 달은 그날까지'] });

  await addDailyRaw(wb, p, store);
  await addOrdersRaw(wb, p, store, {});
}

async function channelSheets(wb, p, store, amt) {
  const [types, apps, matrix, byStore, trend] = await Promise.all([
    byType(p.from, p.to, store), byApp(p.from, p.to, store), typeByChannel(p, store), storeBreakdown(p, store), typeTrend(p.to, store),
  ]);
  const cols = (first) => [
    { header: first, key: 'name', width: 18 }, WON(amt.label, 'rev'), { header: '비중(%)', key: 'share', fmt: 'pct', width: 9 },
    INT('주문 수', 'orders'), WON('객단가', (r) => aov(r.rev, r.orders)), INT('취소', 'cancels'),
  ];
  const withShare = (list) => { const t = list.reduce((s, r) => s + r.rev, 0); return list.map((r) => ({ ...r, share: share(r.rev, t) })); };
  addTable(wb, '판매유형별', cols('판매유형'), withShare(types), { title: `채널 분석 · ${p.label}`, notes: [`금액: ${amt.label} (${amt.desc})`, '포장 = 방문 포장 + 테이블 포장 + 배달앱 포장, 매장(홀) = 테이블 식사 + 키오스크'] });
  addTable(wb, '주문채널별', cols('주문 채널'), withShare(apps), { notes: ['매장 POS 직접 주문은 홀·포장·전화 배달로 나눔'] });
  addTable(wb, '채널×판매유형×주문구분', [
    { header: '주문 채널', key: (r) => channelLabel(r.channel), width: 12 }, { header: '판매유형', key: 'type', width: 9 },
    { header: '주문 구분', key: 'kind', width: 12 }, WON(amt.label, 'rev'), INT('주문 수', 'orders'), WON('객단가', (r) => aov(r.rev, r.orders)), INT('취소', 'cancels'),
  ], [...matrix].sort((a, b) => b.rev - a.rev));
  addTable(wb, '매장×판매유형', [
    { header: '매장', key: 'store_name', width: 12 }, WON('배달', 'delivery'), WON('매장(홀)', 'dinein'), WON('포장', 'takeout'), WON('합계', 'rev'),
    { header: '배달 비중(%)', key: (r) => share(r.delivery, r.rev), fmt: 'pct', width: 11 },
    WON('배달 객단가', (r) => aov(r.delivery, r.delivery_orders)), WON('매장 객단가', (r) => aov(r.dinein, r.dinein_orders)),
  ], byStore);
  const months = [...new Set(trend.map((r) => r.m))];
  addTable(wb, '월별 판매유형', [
    { header: '월', key: 'm', width: 10 }, WON('배달', '배달'), WON('매장(홀)', '매장'), WON('포장', '포장'), WON('합계', 'total'),
  ], months.map((m) => {
    const row = { m, total: 0 };
    for (const r of trend.filter((x) => x.m === m)) { row[r.name] = r.rev; row.total += r.rev; }
    return row;
  }), { notes: ['최근 6개월'] });
  await addDailyRaw(wb, p, store);
  await addOrdersRaw(wb, p, store, {});
}

async function menuSheets(wb, p, store, sp) {
  const tab = MENU_TAB_NAMES.includes(sp.tab) ? sp.tab : '전체';
  const [ranking, mix, attach, weekly] = await Promise.all([menuRanking(p, store, tab), menuMix(p, store), attachRates(p, store), weeklyTop(p.to, store)]);
  addTable(wb, `메뉴 순위(${tab})`, [
    { header: '순위', key: (r) => ranking.indexOf(r) + 1, width: 6 }, { header: '메뉴', key: 'std_name', width: 26 }, { header: '분류', key: 'category', width: 12 },
    { header: '수량', key: 'qty', fmt: 'qty' }, { header: '비교 기간 수량', key: 'prev_qty', fmt: 'qty', width: 14 },
    { header: '증감률(%)', key: (r) => (Number(r.prev_qty) ? Math.round((r.qty / r.prev_qty - 1) * 1000) / 10 : null), fmt: 'pct', width: 11 },
  ], ranking, { title: `메뉴 분석 · ${p.label}`, notes: [`비교: ${p.cmpLabel}`, '수량 기준, 옵션 제외, 상위 15개'] });
  const cutT = mix.cuts.reduce((s, r) => s + r.qty, 0);
  const flT = mix.flavors.reduce((s, r) => s + r.qty, 0);
  addTable(wb, '부위·맛 구성', [
    { header: '구분', key: 'g', width: 10 }, { header: '항목', key: 'name', width: 18 }, { header: '수량', key: 'qty', fmt: 'qty' },
    { header: '비중(%)', key: 'share', fmt: 'pct', width: 9 },
  ], [
    ...mix.cuts.map((r) => ({ g: '부위', name: r.cut, qty: r.qty, share: share(r.qty, cutT) })),
    ...mix.flavors.map((r) => ({ g: '맛', name: r.name, qty: r.qty, share: share(r.qty, flT) })),
    ...mix.sauces.map((r) => ({ g: '소스 선택', name: r.name, qty: r.n, share: null })),
  ]);
  const co = Number(attach?.chicken_orders) || 0;
  addTable(wb, '함께 주문', [
    { header: '치킨 주문과 함께', key: 'name', width: 18 }, INT('주문 수', 'n'), { header: '부착률(%)', key: (r) => share(r.n, co), fmt: 'pct', width: 10 },
  ], [['버거', attach?.burger], ['사이드', attach?.side], ['딥·베이스 소스', attach?.dip], ['음료·주류', attach?.drink]].map(([name, n]) => ({ name, n: Number(n) || 0 })),
  { notes: [`치킨 포함 주문 ${co.toLocaleString('ko-KR')}건 기준`] });
  addTable(wb, '주별 치킨 TOP3', [
    { header: '메뉴', key: 'std_name', width: 26 }, { header: '주 시작일', key: 'wk', width: 12 }, { header: '수량', key: 'qty', fmt: 'qty' },
  ], weekly, { notes: ['최근 12주'] });
  await addMenuRaw(wb, p, store);
}

async function timeSheets(wb, p, store, sp, amt) {
  const saleType = ['배달', '매장', '포장'].includes(sp.type) ? sp.type : '';
  const cells = await heatmap(p, store, saleType);
  const get = (dow, h) => cells.find((c) => c.dow === dow && c.hour === h);
  const grid = (label, val, fmt) => addTable(wb, label, [
    { header: '요일', key: 'day', width: 6 }, ...HOURS.map((h) => ({ header: `${h}시`, key: `h${h}`, fmt, width: 9 })), { header: '합계', key: 'total', fmt, width: 12 },
  ], WEEKDAYS.map((day, i) => {
    const row = { day };
    let o = 0; let r = 0;
    for (const h of HOURS) { const c = get(i + 1, h); row[`h${h}`] = val(c); o += c?.orders || 0; r += c?.rev || 0; }
    row.total = val({ orders: o, rev: r });
    return row;
  }), label === '요일×시간 주문 수' ? { title: `시간 분석 · ${p.label}`, notes: [`판매유형: ${saleType || '전체'} · 취소 제외 · 주문 시각 기준`] } : {});
  grid('요일×시간 주문 수', (c) => c?.orders || 0, 'int');
  grid(`요일×시간 ${amt.label}`, (c) => c?.rev || 0, 'won');
  grid('요일×시간 객단가', (c) => aov(c?.rev, c?.orders), 'won');
  addTable(wb, '원자료_요일시간', [
    { header: '요일', key: (c) => WEEKDAYS[c.dow - 1], width: 6 }, INT('시', 'hour'), INT('주문 수', 'orders'), WON(amt.label, 'rev'),
  ], [...cells].sort((a, b) => a.dow - b.dow || a.hour - b.hour));
  await addDailyRaw(wb, p, store);
}

export async function GET(req) {
  const user = await getUser();
  if (!user || user.must_change) return new Response('로그인이 필요합니다.', { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const view = VIEWS[sp.view] ? sp.view : 'overview';
  const p = parsePeriod(sp, VIEWS[view].def);
  const store = sp.store || '';
  const amt = await getAmount();
  const wb = newWorkbook();
  addInfo(wb, `마마치킨 ${VIEWS[view].title} 내보내기`, [
    ['기간', `${p.from} ~ ${p.to} (${p.days}일)`], ['매장', storeLabel(store)], ['금액 기준', `${amt.label} (${amt.desc})`],
    ['비교', p.cmpLabel], ['내려받은 시각', new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ') + ' (KST)'],
    ['참고', '데이터는 매일 06:00에 전날까지 수집됩니다. 취소 주문은 음수로 들어 있어 합계에서 상쇄됩니다.'],
  ]);
  if (view === 'overview') await overviewSheets(wb, p, store, amt);
  else if (view === 'channel') await channelSheets(wb, p, store, amt);
  else if (view === 'menu') await menuSheets(wb, p, store, sp);
  else if (view === 'time') await timeSheets(wb, p, store, sp, amt);
  else {
    const f = parseOrderFilters(sp);
    await addOrdersRaw(wb, p, store, f);
    await addDailyRaw(wb, p, store);
  }
  return xlsxResponse(wb, `mamachicken_${view}_${p.from}_${p.to}.xlsx`);
}
