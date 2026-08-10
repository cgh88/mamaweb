import styles from './Footer.module.css';

const SNS = [
  { href: 'https://www.instagram.com/mamachickenkr/', img: '/img/ins.png', label: '인스타그램' },
  { href: '', img: '/img/youtube.png', label: '유튜브' },
  { href: '', img: '/img/blog.png', label: '블로그' },
  { href: 'https://www.facebook.com/mamachickenkr', img: '/img/face.png', label: '페이스북' },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.top}>
          <div className={styles.brandCol}>
            <img src="/img/f-logo.png" alt="마마치킨" width={270} height={48} className={styles.logo} />
            <div className={styles.tel}>
              <span>전화주문</span>
              <a href="tel:02-703-7979">02-703-7979</a>
            </div>
          </div>

          <div className={styles.infoCol}>
            <ul className={styles.links}>
              <li><a href="#">이용약관</a></li>
              <li><a href="#">개인정보처리방침</a></li>
              <li><a href="#">이메일 무단수집거부</a></li>
              <li><a href="#">찾아오시는 길</a></li>
            </ul>
            <div className={styles.meta}>
              <p>
                <span><b>회사명</b> 마마치킨</span>
                <span><b>대표자</b> 서창우</span>
                <span><b>사업자등록번호</b> 211-87-25621</span>
              </p>
              <p>
                <span><b>사업소재지</b> 서울시 마포구 큰우물로 62, 1~2층 (용강동) 마마치킨 마포점</span>
                <span><b>대표메일</b> webmaster@mamachicken.kr</span>
              </p>
            </div>
          </div>

          <div className={styles.snsCol}>
            {SNS.map((s) =>
              s.href ? (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" aria-label={s.label}>
                  <img src={s.img} alt={s.label} />
                </a>
              ) : (
                <span key={s.label} aria-label={s.label}>
                  <img src={s.img} alt={s.label} />
                </span>
              )
            )}
          </div>
        </div>

        <p className={styles.copyright}>
          Copyright © 2023 SHEEPS all rights reserved. <a href="/admin" className={styles.adminLink}>관리자</a>
        </p>
      </div>
    </footer>
  );
}
