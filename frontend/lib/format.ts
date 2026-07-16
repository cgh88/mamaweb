/** "2024-07-19 20:01:52" → "2024-07-19" (작성시간은 표시하지 않음) */
export const formatDate = (d?: string | null) => (d ? d.slice(0, 10) : '');
