'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setAmount } from '@/app/(dash)/actions';
import { AMOUNTS } from '@/lib/amount';

/** 매출 금액 기준 토글 (순매출 / 실매출 / 총매출). 선택은 쿠키에 저장되어 다른 화면에도 유지 */
export default function AmountSwitch({ value, className = '' }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (key) => start(async () => {
    await setAmount(key);
    router.refresh();
  });
  return (
    <div className={`seg ${className}`} role="group" aria-label="매출 금액 기준" aria-busy={pending} style={pending ? { opacity: 0.6 } : undefined}>
      {Object.entries(AMOUNTS).map(([key, a]) => (
        <button key={key} type="button" className={value === key ? 'on' : ''} title={a.desc} aria-pressed={value === key}
          disabled={pending} onClick={() => value !== key && pick(key)}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
