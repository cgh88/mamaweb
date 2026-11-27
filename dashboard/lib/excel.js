import 'server-only';
import ExcelJS from 'exceljs';

// 엑셀(.xlsx) 생성 도우미 — 문자열은 항상 텍스트 셀로 써서 수식으로 해석되지 않음
const NUM_FMT = { won: '#,##0', int: '#,##0', qty: '#,##0.##', pct: '0.0"%"', text: '@' };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EEE8' } };

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = '마마치킨 매출 대시보드';
  wb.created = new Date();
  return wb;
}

/** 시트 이름: 엑셀 금지 문자 제거, 31자 제한 */
const sheetName = (s) => s.replace(/[\\/?*[\]:]/g, '·').slice(0, 31);

/**
 * 표 시트 추가
 *  cols: [{ header, key, width?, fmt?: 'won'|'int'|'qty'|'pct'|'text' }]
 *  opts.title: 1행 제목, opts.notes: 제목 아래 설명 줄들
 */
export function addTable(wb, name, cols, rows, opts = {}) {
  const ws = wb.addWorksheet(sheetName(name));
  let r = 1;
  if (opts.title) {
    ws.getCell(r, 1).value = opts.title;
    ws.getCell(r, 1).font = { bold: true, size: 13 };
    r += 1;
  }
  for (const n of opts.notes || []) {
    ws.getCell(r, 1).value = n;
    ws.getCell(r, 1).font = { color: { argb: 'FF7A716A' }, size: 10 };
    r += 1;
  }
  if (opts.title || opts.notes?.length) r += 1;
  const headRow = ws.getRow(r);
  cols.forEach((c, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = HEAD_FILL;
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFDDD6CD' } } };
    ws.getColumn(i + 1).width = c.width || Math.max(10, String(c.header).length * 2 + 2);
    if (c.fmt) ws.getColumn(i + 1).numFmt = NUM_FMT[c.fmt];
  });
  ws.views = [{ state: 'frozen', ySplit: r }];
  const first = r;
  for (const row of rows) {
    r += 1;
    const xr = ws.getRow(r);
    cols.forEach((c, i) => {
      let v = typeof c.key === 'function' ? c.key(row) : row[c.key];
      if (v === undefined) v = null;
      if (c.fmt && c.fmt !== 'text' && v !== null && v !== '' && typeof v !== 'number' && !Number.isNaN(Number(v))) v = Number(v);
      if (c.fmt === 'text' && v !== null) v = String(v);
      xr.getCell(i + 1).value = v;
    });
  }
  if (rows.length) ws.autoFilter = { from: { row: first, column: 1 }, to: { row: r, column: cols.length } };
  if (opts.totalRow) {
    r += 1;
    const xr = ws.getRow(r);
    cols.forEach((c, i) => {
      const v = opts.totalRow[c.key];
      if (v !== undefined) xr.getCell(i + 1).value = v;
    });
    xr.font = { bold: true };
  }
  return ws;
}

/** 조건 정보 시트 (내보낸 기준) */
export function addInfo(wb, title, pairs) {
  const ws = wb.addWorksheet('조건');
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  pairs.forEach(([k, v], i) => {
    ws.getCell(i + 3, 1).value = k;
    ws.getCell(i + 3, 1).font = { bold: true };
    ws.getCell(i + 3, 2).value = v === null || v === undefined ? '' : String(v);
  });
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 70;
  return ws;
}

export async function xlsxResponse(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename).replace(/%[0-9A-F]{2}/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
