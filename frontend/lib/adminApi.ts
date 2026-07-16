'use client';

const KEY_STORAGE = 'mama_admin_key';

export const getAdminKey = () =>
  typeof window === 'undefined' ? null : localStorage.getItem(KEY_STORAGE);

export const setAdminKey = (key: string) => localStorage.setItem(KEY_STORAGE, key);
export const clearAdminKey = () => localStorage.removeItem(KEY_STORAGE);

export async function adminFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      'x-admin-key': getAdminKey() || '',
      ...init.headers,
    },
  });
  if (res.status === 401) {
    clearAdminKey();
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
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
