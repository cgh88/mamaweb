import 'server-only';
import { q } from './db';

export const FEEDBACK_CATEGORIES = ['기능 추가', '오류 신고', '화면·사용성', '데이터 확인', '기타'];
export const FEEDBACK_STATUSES = ['접수', '검토 중', '진행 중', '완료', '보류'];
export const FEEDBACK_PAGES = ['매출 현황', '외부 인사이트', '채널 분석', '시간 분석', '메뉴 분석', '매장 비교', '주문 리포트', '식자재 소모량', '재고·안전재고', '메뉴 매핑 관리', '레시피·식자재', '설정', '기타'];

const safe = (p) => p.catch((err) => (err.code === '42P01' ? [] : Promise.reject(err)));

/** 내가 보낸 요청 */
export async function myFeedback(userId) {
  return safe(q(
    `SELECT id, category, page, title, body, status, reply, created_at, updated_at FROM dash_feedback
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`, [userId]));
}

/** 전체 요청 (슈퍼관리자) */
export async function allFeedback(status = '') {
  const params = [];
  let w = '';
  if (status === 'open') w = `WHERE f.status NOT IN ('완료', '보류')`;
  else if (status) { params.push(status); w = 'WHERE f.status = $1'; }
  return safe(q(
    `SELECT f.*, u.username, r.username AS replied_name FROM dash_feedback f
     LEFT JOIN dash_users u ON u.id = f.user_id LEFT JOIN dash_users r ON r.id = f.replied_by
     ${w} ORDER BY (f.status = '접수') DESC, f.created_at DESC LIMIT 200`, params));
}

/** 상태별 건수 */
export async function feedbackCounts() {
  const rows = await safe(q('SELECT status, count(*)::int AS n FROM dash_feedback GROUP BY 1'));
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
