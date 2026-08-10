import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: '마마치킨 | MAMA CHICKEN',
  description: '마마치킨, 마포구치킨, 마포맛집, 미국식치킨, MAMACHICKEN, 치킨배달',
  icons: { icon: '/img/favicon.ico' },
};

// viewportFit은 지정하지 않음 — 안드로이드 크롬에서 레이아웃 뷰포트가
// 화면 폭보다 넓게 잡혀 헤더가 밀리는 사례가 있어 기본값(auto) 사용
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

// CSS 청크보다 먼저 적용되는 최소 스타일.
// 초기 렌더링 시점에 어떤 요소도 화면보다 넓어지지 않게 해
// 모바일 브라우저가 페이지 폭을 화면보다 크게 잡는 것을 방지한다.
// body에는 overflow-x를 주지 않는다 — body가 스크롤 컨테이너가 되면
// 메뉴/커뮤니티 페이지의 sticky 탭이 동작하지 않음
const criticalCss = `
  html { overflow-x: hidden; }
  body { max-width: 100%; }
  img { max-width: 100%; }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
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
