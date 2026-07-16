import { Suspense } from 'react';
import MenuClient from './MenuClient';

export const metadata = { title: '메뉴 안내 | 마마치킨' };

export default function MenuPage() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ padding: '80px 24px' }}>
          <div className="skeleton" style={{ height: 400 }} />
        </div>
      }
    >
      <MenuClient />
    </Suspense>
  );
}
