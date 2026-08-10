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
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `요청 실패 (${res.status})`);
  }
  return res.json();
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const data = await adminFetch('/api/admin/upload', { method: 'POST', body: form });
  return data.path;
}
