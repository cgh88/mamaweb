import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: '마마치킨 | MAMA CHICKEN',
  description: '마마치킨, 마포구치킨, 마포맛집, 미국식치킨, MAMACHICKEN, 치킨배달',
  icons: { icon: '/img/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <Header />
        <main style={{ paddingTop: 'var(--header-h)' }}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
