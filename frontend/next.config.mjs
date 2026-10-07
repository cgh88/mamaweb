/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const nextConfig = {
  experimental: {
    // rewrite 프록시의 기본 본문 제한(10MB)이 백엔드 업로드 제한(10MB)과 같아
    // multipart 오버헤드만큼 잘려 연결이 끊김 → 여유를 두고 크기 검사는 백엔드가 담당
    middlewareClientMaxBodySize: '12mb',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        // 관리자 업로드 이미지는 백엔드가 제공 (운영 모드에서 런타임 추가 파일 404 방지)
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
