'use client';

// 세션 토큰은 sessionStorage에 보관 (탭을 닫으면 삭제되어 localStorage보다 안전)
const TOKEN_STORAGE = 'mama_admin_token';

export const getAdminToken = () =>
  typeof window === 'undefined' ? null : sessionStorage.getItem(TOKEN_STORAGE);

export const setAdminToken = (token: string) => sessionStorage.setItem(TOKEN_STORAGE, token);
export const clearAdminToken = () => sessionStorage.removeItem(TOKEN_STORAGE);

export async function adminFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      'x-admin-token': getAdminToken() || '',
      ...init.headers,
    },
  });
  if (res.status === 401) {
    clearAdminToken();
    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (body?.error) throw new Error(body.error);
    // JSON이 아닌 응답: 대부분 Next 프록시가 백엔드(:4000)에 연결하지 못한 경우
    throw new Error(
      res.status >= 500
        ? `서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인해주세요. (${res.status})`
        : `요청 실패 (${res.status})`,
    );
  }
  return res.json();
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function uploadImage(file: File): Promise<string> {
  // 서버와 동일한 제한을 미리 검사해 불필요한 전송을 막고 명확한 메시지 표시
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    throw new Error('jpg, png, gif, webp 형식의 이미지만 업로드할 수 있습니다.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `이미지 용량이 10MB를 초과합니다. (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)`,
    );
  }
  const form = new FormData();
  form.append('file', file);
  const data = await adminFetch('/api/admin/upload', { method: 'POST', body: form });
  return data.path;
}
