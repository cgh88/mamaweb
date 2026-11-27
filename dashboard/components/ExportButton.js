import { withParams } from '@/lib/period';

/** 현재 화면 필터 그대로 엑셀(.xlsx) 내려받기 — 화면 표 + 관련 원자료 시트 */
export default function ExportButton({ view, sp }) {
  const { page: _pg, ...keep } = sp || {};
  return (
    <a className="btn" href={`/export${withParams(keep, { view })}`} download title="화면에 보이는 표와 관련 원자료(일별 매장 매출·주문 목록 등)를 시트별로 담은 엑셀 파일">
      엑셀 다운로드
    </a>
  );
}
