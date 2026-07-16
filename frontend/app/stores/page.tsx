import { Suspense } from 'react';
import StoresClient from './StoresClient';

export const metadata = { title: '매장 찾기 | 마마치킨' };

export default function StoresPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ padding: '80px 24px' }}>
          <div className="skeleton" style={{ height: 400 }} />
        </div>
      }
    >
      <StoresClient />
    </Suspense>
  );
}
