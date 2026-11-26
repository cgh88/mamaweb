import { requireUser } from '@/lib/auth';
import PasswordForm from './PasswordForm';

export const metadata = { title: '비밀번호 변경 · 마마치킨' };

export default async function AccountPage({ searchParams }) {
  const user = await requireUser({ allowMustChange: true });
  const sp = await searchParams;
  return (
    <>
      <div className="head">
        <div>
          <h1>비밀번호 변경</h1>
          <div className="muted">{user.username} 계정</div>
        </div>
      </div>
      <section className="panel" style={{ maxWidth: 480 }}>
        <PasswordForm first={user.must_change || sp.first === '1'} />
      </section>
    </>
  );
}
