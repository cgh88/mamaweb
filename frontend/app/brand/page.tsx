import { Suspense } from 'react';
import BrandClient from './BrandClient';

export const metadata = { title: '브랜드 소개 | 마마치킨' };

export default function BrandPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ padding: '80px 24px' }}>
          <div className="skeleton" style={{ height: 400 }} />
        </div>
      }
    >
      <BrandClient />
    </Suspense>
  );
}
