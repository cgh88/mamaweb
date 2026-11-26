import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import LoginForm from './LoginForm';

export const metadata = { title: '로그인 · 마마치킨 매출 대시보드' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getUser()) redirect('/');
  return (
    <div className="login-wrap">
      <main className="login">
        <div className="brand"><b>MAMA CHICKEN</b><span>매출 관리 · admin</span></div>
        <h1>로그인</h1>
        <LoginForm />
        <p className="small muted" style={{ margin: 0 }}>
          비밀번호를 잊었다면 관리자에게 초기화를 요청하세요. 로그인 5회 실패 시 10분간 잠깁니다.
        </p>
      </main>
    </div>
  );
}
