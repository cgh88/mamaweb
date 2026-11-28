'use server';

import { revalidatePath } from 'next/cache';
import { q, q1 } from '@/lib/db';
import { audit, requireUser, verifyPassword } from '@/lib/auth';
import { encrypt } from '@/lib/secret';
import { settingValue } from '@/lib/settings';
import { SETTING_GROUPS } from '@/lib/settings-def';
import { addDays, todayKst } from '@/lib/period';

const MAX_LEN = 2000;

/** 설정 저장 — 현재 비밀번호 확인 필요. 비밀값은 빈칸이면 기존 값 유지 */
export async function saveSettings(_prev, fd) {
  const user = await requireUser();
  const group = SETTING_GROUPS.find((g) => g.id === fd.get('group'));
  if (!group) return { error: '알 수 없는 설정입니다.' };
  const me = await q1('SELECT salt, hash FROM dash_users WHERE id = $1', [user.id]);
  if (!me || !(await verifyPassword(fd.get('password'), me.salt, me.hash))) return { error: '현재 비밀번호가 올바르지 않습니다.' };

  const ops = [];
  for (const it of group.items) {
    const raw = String(fd.get(`v_${it.key}`) ?? '');
    const v = it.multiline ? raw.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n') : raw.trim();
    const clear = fd.get(`clear_${it.key}`) === '1';
    if (v.length > MAX_LEN) return { error: `${it.label}: 너무 깁니다.` };
    if (it.secret) {
      if (clear) ops.push({ key: it.key, del: true });
      else if (v) {
        if (/\s/.test(v)) return { error: `${it.label}: 공백 없이 입력하세요.` };
        ops.push({ key: it.key, value: encrypt(it.key, v), secret: true, hint: v.slice(-4) });
      }
      continue;
    }
    if (!v) { ops.push({ key: it.key, del: true }); continue; }
    if (it.pattern && !it.pattern.test(v)) return { error: `${it.label}: ${it.help || '형식을 확인하세요.'}` };
    if (it.number) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < it.number[0] || n > it.number[1]) return { error: `${it.label}: ${it.number[0]}~${it.number[1]} 사이 정수로 입력하세요.` };
    }
    const bad = it.validate?.(v);
    if (bad) return { error: `${it.label}: ${bad}` };
    ops.push({ key: it.key, value: v, secret: false, hint: null });
  }

  const before = Object.fromEntries((await q('SELECT key, value, secret FROM dash_setting WHERE key = ANY($1)', [group.items.map((i) => i.key)])).map((r) => [r.key, r]));
  const changes = [];
  for (const o of ops) {
    const prev = before[o.key];
    if (o.del) {
      if (!prev) continue;
      await q('DELETE FROM dash_setting WHERE key = $1', [o.key]);
      changes.push({ key: o.key, change: '삭제' });
    } else {
      if (prev && !o.secret && prev.value === o.value) continue;
      await q(
        `INSERT INTO dash_setting (key, value, secret, hint, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, secret = EXCLUDED.secret, hint = EXCLUDED.hint, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [o.key, o.value, o.secret, o.hint, user.id],
      );
      // 비밀값은 기록에 남기지 않음
      changes.push({ key: o.key, change: prev ? '변경' : '등록', ...(o.secret ? {} : { value: o.value.slice(0, 200) }) });
    }
  }
  if (!changes.length) return { ok: '바뀐 내용이 없습니다.', at: Date.now() };
  await audit(user.id, 'setting_updated', { group: group.id, changes });
  revalidatePath('/settings');
  return { ok: `저장했습니다 (${changes.map((c) => c.key).join(', ')}). 다음 수집(매일 06:00)부터 적용됩니다.`, at: Date.now() };
}

// ---------------------------------------------------------------- 연결 테스트 (입력한 값 → 없으면 저장된 값)
async function pick(fd, key) {
  const typed = String(fd.get(`v_${key}`) ?? '').trim();
  return typed || (await settingValue(key));
}
const short = (s) => String(s || '').replace(/\s+/g, ' ').slice(0, 160);

async function testPos(fd) {
  const token = await pick(fd, 'POS_API_TOKEN');
  const codes = (await pick(fd, 'POS_STORE_CODES')) || '';
  const store = codes.split(',')[0]?.trim();
  if (!token) return { error: '토큰이 없습니다. 입력하거나 저장한 뒤 테스트하세요. (서버 .env 값은 여기서 테스트할 수 없습니다)' };
  if (!store) return { error: '수집 매장 코드를 입력하세요.' };
  const day = addDays(todayKst(), -1).replace(/-/g, '');
  const url = `https://exttran.smilebiz.co.kr/V1/sales/getSaleHeadInfo?STORE_CODE=${encodeURIComponent(store)}&SALE_DATE=${day}&PAGE_SIZE=1&PAGE_NO=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (data?.CODE === '0000') return { ok: `연결 성공 — 매장 ${store}, ${day} 조회 정상` };
  if (data?.MESSAGE?.includes('조회된 데이터가 없습니다')) return { ok: `연결 성공 — 매장 ${store}, ${day} 데이터 없음` };
  return { error: `실패 (HTTP ${res.status}) ${short(data?.CODE)} ${short(data?.MESSAGE)}` };
}

async function testWeather(fd) {
  const key = await pick(fd, 'DATA_GO_KR_KEY');
  if (!key) return { error: '인증키가 없습니다. 입력하거나 저장한 뒤 테스트하세요.' };
  const day = addDays(todayKst(), -2).replace(/-/g, '');
  const p = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: '1', dataType: 'JSON', dataCd: 'ASOS', dateCd: 'DAY', startDt: day, endDt: day, stnIds: '108' });
  const res = await fetch(`https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList?${p}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 키 오류는 XML로 옴 */ }
  const h = data?.response?.header;
  if (h?.resultCode === '00') {
    const it = data.response.body?.items?.item?.[0];
    return { ok: `ASOS 일자료 정상 — ${day} 서울 평균 ${it?.avgTa ?? '-'}℃. (단기예보는 별도 활용신청이 필요합니다)` };
  }
  const msg = h ? `${h.resultCode} ${h.resultMsg}` : (text.match(/<returnAuthMsg>([^<]+)/)?.[1] || text.match(/<errMsg>([^<]+)/)?.[1] || `HTTP ${res.status}`);
  return { error: `실패: ${short(msg)} — 활용신청 승인 직후에는 1~2시간 뒤부터 동작할 수 있습니다.` };
}

async function testNews(fd) {
  const id = await pick(fd, 'NAVER_CLIENT_ID');
  const secret = await pick(fd, 'NAVER_CLIENT_SECRET');
  if (!id || !secret) return { error: 'Client ID와 Secret이 모두 필요합니다. (없으면 Google 뉴스로 수집합니다)' };
  const res = await fetch('https://openapi.naver.com/v1/search/news.json?query=%EC%B9%98%ED%82%A8&display=1', {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }, signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (res.ok) return { ok: `네이버 검색 API 정상 — '치킨' 뉴스 ${Number(data?.total || 0).toLocaleString('ko-KR')}건 검색됨` };
  return { error: `실패 (HTTP ${res.status}) ${short(data?.errorMessage || data?.errorCode)}` };
}

export async function testSettings(_prev, fd) {
  const user = await requireUser();
  const group = fd.get('group');
  try {
    const r = group === 'pos' ? await testPos(fd) : group === 'weather' ? await testWeather(fd) : group === 'news' ? await testNews(fd) : { error: '테스트할 수 없는 항목입니다.' };
    await audit(user.id, 'setting_tested', { group, ok: !!r.ok });
    return { ...r, at: Date.now() };
  } catch (err) {
    return { error: `연결 실패: ${short(err.name === 'TimeoutError' ? '응답 시간 초과' : err.message)}`, at: Date.now() };
  }
}
