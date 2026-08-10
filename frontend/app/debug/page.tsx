'use client';

import { useEffect, useState } from 'react';

/**
 * 모바일 레이아웃 진단 페이지 (임시)
 * 실기기에서 /debug 로 접속하면 화면 폭 관련 수치를 그대로 보여준다.
 * 원인 파악 후 삭제 예정.
 */
export default function DebugPage() {
  const [info, setInfo] = useState<Record<string, string>>({});
  const [offenders, setOffenders] = useState<string[]>([]);

  const measure = () => {
    const de = document.documentElement;
    const vv = window.visualViewport;
    const header = document.querySelector('header');
    const btn = document.querySelector('button[aria-label="메뉴 열기"]');
    const hRect = header?.getBoundingClientRect();
    const bRect = btn?.getBoundingClientRect();

    setInfo({
      'window.innerWidth': String(window.innerWidth),
      'html.clientWidth (레이아웃)': String(de.clientWidth),
      'html.scrollWidth': String(de.scrollWidth),
      'body.scrollWidth': String(document.body.scrollWidth),
      'visualViewport.width': vv ? vv.width.toFixed(1) : '없음',
      'visualViewport.scale': vv ? vv.scale.toFixed(3) : '없음',
      'devicePixelRatio': String(window.devicePixelRatio),
      'screen.width': String(window.screen.width),
      '가로스크롤 발생': de.scrollWidth > de.clientWidth ? '⚠️ 예' : '아니오',
      'scrollX (가로스크롤 위치)': String(Math.round(window.scrollX)),
      '헤더 left~right': hRect ? `${Math.round(hRect.left)} ~ ${Math.round(hRect.right)}` : '-',
      '헤더 폭': hRect ? String(Math.round(hRect.width)) : '-',
      '삼선버튼 right': bRect ? String(Math.round(bRect.right)) : '(모바일 아님)',
      '삼선 우측여백': bRect ? String(Math.round(de.clientWidth - bRect.right)) : '-',
      'safe-area-right': getComputedStyle(de).getPropertyValue('--sa-r') || '(측정중)',
    });

    // 화면 밖으로 나가는 요소 찾기
    const cw = de.clientWidth;
    const list: string[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > cw + 1) {
        const cls = String((el as HTMLElement).className || '').slice(0, 28);
        list.push(`${el.tagName}.${cls} → right ${Math.round(r.right)} (폭 ${Math.round(r.width)})`);
      }
    });
    setOffenders([...new Set(list)].slice(0, 8));
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--sa-r', 'env(safe-area-inset-right, 0px)');
    const timer = setTimeout(measure, 800);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: '20px 16px 60px', fontSize: 15, lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>📐 모바일 레이아웃 진단</h1>
      <p style={{ color: '#8a807b', fontSize: 13, marginBottom: 16 }}>
        이 화면을 캡처해서 보내주세요.
      </p>

      <button
        type="button"
        onClick={measure}
        style={{
          background: '#e63312',
          color: '#fff',
          borderRadius: 999,
          padding: '10px 20px',
          fontWeight: 700,
          marginBottom: 16,
        }}
      >
        다시 측정
      </button>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 12 }}>
        <tbody>
          {Object.entries(info).map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '7px 10px', borderBottom: '1px solid #ece5db', color: '#4d4440' }}>
                {k}
              </td>
              <td
                style={{
                  padding: '7px 10px',
                  borderBottom: '1px solid #ece5db',
                  fontWeight: 800,
                  textAlign: 'right',
                  color: v.includes('⚠️') ? '#e63312' : '#191310',
                }}
              >
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '20px 0 8px' }}>화면 밖으로 나간 요소</h2>
      {offenders.length === 0 ? (
        <p style={{ color: '#1a7f3c', fontWeight: 700 }}>없음 ✓</p>
      ) : (
        <ul style={{ background: '#fff', borderRadius: 12, padding: 12 }}>
          {offenders.map((o) => (
            <li key={o} style={{ fontSize: 12.5, wordBreak: 'break-all', marginBottom: 6 }}>
              • {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
