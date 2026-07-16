import CommunityTabs from '@/components/CommunityTabs';
import styles from '../community.module.css';

export const metadata = { title: '제휴문의 | 마마치킨' };

export default function PartnershipPage() {
  return (
    <>
      <div className="sub-hero" style={{ backgroundImage: "url('/img/sub_kv3.png')" }}>
        <div>
          <h1>커뮤니티</h1>
          <p>마마치킨의 소식을 전해드립니다</p>
        </div>
      </div>

      <CommunityTabs active="/community/partnership" />

      <section className="section">
        <div className="container">
          <div className={styles.contactCard}>
            <h2>제휴문의 🤝</h2>
            <p>
              마마치킨의 문은 열려있습니다.
              <br />
              궁금한 점이나 문의사항이 있다면 언제든 환영입니다.
            </p>
            <div className={styles.contactBtns}>
              <a href="tel:02-703-7979" className="btn btn-primary">
                📞 전화 : 02-703-7979
              </a>
              <a href="mailto:webmaster@mamachicken.kr" className="btn btn-ghost">
                ✉️ 이메일 : webmaster@mamachicken.kr
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
