# 🚀 마마치킨 사이트 AWS 배포 가이드 (왕초보용)

> 이 문서는 처음 배포해보는 사람도 따라할 수 있게 최대한 쉽게 썼습니다.
> 순서대로 하나씩 따라 하면 됩니다. 예상 소요 시간: 약 1시간.

---

## 0. 먼저 알아두기 — "배포"가 뭐예요?

지금 사이트는 **내 컴퓨터에서만** 돌아갑니다. 내 컴퓨터를 끄면 사이트도 꺼져요.

"배포"란 **24시간 켜져 있는 컴퓨터(=서버)를 빌려서**, 거기에 우리 사이트를 옮겨 놓는 것입니다.
그러면 누구나 인터넷 주소로 우리 사이트에 들어올 수 있어요.

AWS(아마존 웹 서비스)는 이런 "컴퓨터 빌려주는 회사" 중 세계에서 제일 큰 회사입니다.

### 왜 이 방법(서버 1대 빌리기)을 쓰나요?

우리 사이트는 메뉴/게시글 데이터를 **파일(JSON)로 저장**하고, 관리자 페이지에서 올린 이미지도 **서버 폴더에 저장**합니다.
그래서 "항상 켜져 있고 저장 공간이 있는 서버 1대"가 꼭 필요해요.
(Vercel 같은 서버리스 서비스에 올리면 저장한 데이터가 사라집니다!)

### 💰 돈이 드나요?

네, 조금 듭니다. 이 가이드에서 쓰는 **AWS Lightsail**은 **월 $12 (약 1만 6천원)** 정도예요.
- 신용카드(또는 체크카드)가 있어야 가입할 수 있습니다. 미성년자는 부모님 도움이 필요해요.
- 다 써보고 나서 서버를 삭제하면 더 이상 돈이 나가지 않습니다. (마지막 장 참고)

---

## 1단계. AWS 계정 만들기 (10분)

1. https://aws.amazon.com/ko/ 접속 → 오른쪽 위 **"AWS 계정 생성"** 클릭
2. 이메일 주소, 계정 이름 입력 → 이메일 인증
3. 비밀번호 설정 (⚠️ 절대 잊어버리면 안 돼요. 메모해두세요)
4. 개인 정보 입력 (한글 대신 영문으로: 홍길동 → Gildong Hong)
5. 카드 등록 (확인용으로 $1이 결제됐다 취소될 수 있어요. 정상입니다)
6. 휴대폰 인증 → 지원 플랜은 **"기본 지원 - 무료"** 선택
7. 가입 완료! 로그인하세요.

> 🔒 **중요**: AWS 비밀번호와 카드 정보는 절대 다른 사람(친구, 인터넷)에게 알려주면 안 됩니다.

---

## 2단계. 서버 만들기 — Lightsail (10분)

Lightsail은 AWS에서 제일 쉬운 서버 서비스입니다. 복잡한 설정이 미리 다 되어 있어요.

1. 로그인 후 위쪽 검색창에 **`Lightsail`** 입력 → 클릭
2. 주황색 **"인스턴스 생성(Create instance)"** 버튼 클릭
3. 아래처럼 선택하세요:
   - **리전(지역)**: `서울 (ap-northeast-2)` — 한국에서 접속이 제일 빨라요
   - **플랫폼**: `Linux/Unix`
   - **블루프린트**: `OS 전용(OS Only)` 탭 → **`Ubuntu 22.04 LTS`**
   - **인스턴스 플랜**: **월 $12 (2GB 메모리)** 선택
     - ⚠️ 제일 싼 $5(512MB)를 고르면 사이트 빌드 중에 메모리가 부족해서 멈춥니다. 꼭 2GB 이상!
   - **인스턴스 이름**: `mamaweb` 이라고 입력
4. **"인스턴스 생성"** 클릭 → 1~2분 기다리면 "실행 중(Running)"으로 바뀝니다

### 고정 IP 붙이기 (서버 주소가 바뀌지 않게)

1. Lightsail 홈 → **네트워킹(Networking)** 탭 → **"고정 IP 생성(Create static IP)"**
2. 방금 만든 `mamaweb` 인스턴스에 연결 → 이름은 `mamaweb-ip`
3. 생성된 IP 주소(예: `3.35.123.45`)를 **메모해 두세요**. 이게 우리 사이트 주소가 됩니다!

### 방화벽 포트 열기 (문 열어주기)

서버는 기본적으로 문이 다 잠겨 있어요. 우리 사이트가 쓰는 문(포트)을 열어줍니다.

1. `mamaweb` 인스턴스 클릭 → **네트워킹(Networking)** 탭
2. **IPv4 방화벽**에서 **"+ 규칙 추가(Add rule)"**:
   - 애플리케이션: `사용자 지정(Custom)` / 프로토콜: `TCP` / 포트: **`3000`** → 저장

---

## 3단계. 코드를 GitHub에 올리기 (15분)

서버로 코드를 옮기는 가장 쉬운 방법은 GitHub(코드 저장소 사이트)를 거치는 거예요.

> 이미 GitHub에 올려져 있다면 이 단계는 건너뛰세요.

1. https://github.com 에서 계정을 만들고 로그인
2. 오른쪽 위 **+** → **"New repository"** → 이름 `mamaweb`, **Private(비공개)** 선택 → 생성
3. 내 컴퓨터에서 터미널(PowerShell)을 열고, 프로젝트 폴더에서 아래를 한 줄씩 실행:

```bash
cd D:\DEV\aiCoding\mamaweb

# .gitignore 파일이 없다면 만들어 주세요 (node_modules 등을 제외)
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/내아이디/mamaweb.git
git push -u origin main
```

> 💡 `git push` 할 때 로그인 창이 뜨면 GitHub 계정으로 로그인하면 됩니다.

**.gitignore 파일 내용** (프로젝트 폴더에 `.gitignore` 이름으로 저장):

```
node_modules/
.next/
```

---

## 4단계. 서버에 접속해서 사이트 설치하기 (20분)

### 서버 접속

1. Lightsail에서 `mamaweb` 인스턴스의 **주황색 터미널 아이콘(>_)** 클릭
2. 검은 화면(터미널)이 브라우저에 뜹니다. 여기가 바로 **서버 안**이에요!

### 아래 명령어를 순서대로 복사해서 붙여넣기

> 💡 브라우저 터미널에 붙여넣기: 오른쪽 아래 클립보드 아이콘을 쓰거나 `Ctrl+Shift+V`

**① Node.js 설치** (사이트를 돌리는 프로그램):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # v20.xx 라고 나오면 성공!
```

**② 우리 코드 내려받기**:

```bash
git clone https://github.com/내아이디/mamaweb.git
cd mamaweb
```

> 💡 Private 저장소라면 GitHub에서 **Settings → Developer settings → Personal access tokens**로 토큰을 만들어 비밀번호 대신 입력해요. (귀찮으면 저장소를 잠깐 Public으로 바꿔도 됩니다)

**③ 필요한 부품(패키지) 설치 + 사이트 빌드**:

```bash
npm install
npm run install:all
npm run build          # 프론트엔드를 실전용으로 포장하는 과정 (2~5분 걸려요)
```

**④ 관리자 비밀번호 바꾸기** (⚠️ 꼭 하세요! 기본값 그대로 두면 아무나 관리자가 됩니다):

```bash
echo 'export ADMIN_KEY="나만아는비밀번호123"' >> ~/.bashrc
source ~/.bashrc
```

**⑤ PM2 설치 후 사이트 켜기** (PM2 = 사이트가 꺼지지 않게 지켜주는 프로그램):

```bash
sudo npm install -g pm2

# 백엔드 켜기 (포트 4000)
cd ~/mamaweb/backend
ADMIN_KEY="나만아는비밀번호123" pm2 start server.js --name mama-backend

# 프론트엔드 켜기 (포트 3000)
cd ~/mamaweb/frontend
pm2 start npm --name mama-frontend -- start

# 서버가 재부팅돼도 자동으로 다시 켜지게 설정
pm2 save
pm2 startup   # 화면에 나오는 "sudo env ..." 명령을 복사해서 한 번 더 실행!
```

**⑥ 잘 켜졌는지 확인**:

```bash
pm2 status    # mama-backend, mama-frontend 둘 다 "online" 이면 성공!
```

---

## 5단계. 🎉 접속해보기!

컴퓨터나 폰 브라우저에서:

```
http://아까메모한IP주소:3000
```

예: `http://3.35.123.45:3000`

마마치킨 사이트가 뜨면 **배포 성공**입니다! 👏
관리자 페이지는 `http://IP주소:3000/admin` (비밀번호는 4단계 ④에서 정한 것)

---

## 6단계. (선택) 진짜 도메인 주소 붙이기

`http://3.35.123.45:3000` 은 좀 없어 보이죠? `mamachicken.kr` 같은 주소를 붙이려면:

1. 가비아(gabia.com)나 AWS Route 53에서 도메인 구입 (연 1~2만원)
2. 도메인 관리 페이지에서 **A 레코드**를 추가하고 값에 서버 IP 입력
3. 포트 번호(`:3000`) 없이 접속되게 하려면 서버에서 Nginx를 설치해 80번 포트 → 3000번 포트로 연결:

```bash
sudo apt install -y nginx
sudo tee /etc/nginx/sites-available/mamaweb <<'EOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 20M;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/mamaweb /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

그리고 Lightsail 방화벽에서 **80(HTTP)** 포트를 열어주세요. (기본으로 열려 있어요)
이제 `http://내도메인.kr` 로 접속됩니다.

---

## 6-1단계. 구매한 SSL 인증서 적용 (HTTPS 🔒)

> 가비아 등에서 SSL 인증서를 구매한 경우의 적용 방법입니다.
> (무료로 하고 싶다면 `certbot`(Let's Encrypt)을 검색해보세요)

### ① 받은 파일 확인

**sslcert.co.kr에서 발급받은 경우** (우리 케이스) — 발급 완료 zip 안에 이미 통합된 파일이 들어 있어 합칠 필요가 없습니다:

| 파일 | 설명 |
| --- | --- |
| `도메인.all.crt.pem` | 서버 인증서 + 체인 + 루트가 **이미 하나로 합쳐진 통합 파일** → 그대로 사용 |
| `도메인.key.pem` | **개인키** — 절대 유출 금지! |

> 💡 다른 업체에서 도메인 인증서(`.crt`)와 체인(`ca_bundle.crt`)이 따로 오는 경우에는 합쳐야 합니다 (순서 중요: 도메인 것이 먼저):
> `cat domain.crt ca_bundle.crt > fullchain.crt`
> `.pfx` 하나만 받았다면: `openssl pkcs12 -in cert.pfx -nocerts -nodes -out private.key` / `-clcerts -nokeys -out domain.crt` / `-cacerts -nokeys -out ca_bundle.crt`

### ② 서버에 인증서 올리기

내 컴퓨터(PowerShell)에서 서버로 파일 전송 (Lightsail → 계정 페이지에서 SSH 키 `.pem` 다운로드 필요):

```bash
scp -i LightsailDefaultKey.pem 도메인.all.crt.pem 도메인.key.pem ubuntu@서버IP:~/
```

서버 터미널에서 안전한 위치로 옮기고 권한 잠그기:

```bash
sudo mkdir -p /etc/nginx/ssl
sudo mv ~/도메인.all.crt.pem /etc/nginx/ssl/fullchain.crt
sudo mv ~/도메인.key.pem /etc/nginx/ssl/private.key
sudo chmod 600 /etc/nginx/ssl/private.key
sudo chown root:root /etc/nginx/ssl/*
```

### ③ Nginx 설정을 HTTPS용으로 교체

```bash
sudo tee /etc/nginx/sites-available/mamaweb <<'EOF'
# HTTP(80) → HTTPS(443) 자동 이동
server {
    listen 80;
    server_name 내도메인.kr www.내도메인.kr;
    return 301 https://$host$request_uri;
}

# HTTPS(443)
server {
    # http2를 켜는 문법은 Nginx 버전에 따라 다름:
    #  - 1.25.1 이상: listen 443 ssl; + 별도 줄에 http2 on;
    #  - 그 이전(우분투 22.04 기본 1.18 포함): 아래처럼 listen에 http2를 함께 표기
    listen 443 ssl http2;
    server_name 내도메인.kr www.내도메인.kr;

    ssl_certificate     /etc/nginx/ssl/fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/mamaweb /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
```

`내도메인.kr` 두 곳(80, 443 블록)을 실제 도메인으로 바꾸는 것을 잊지 마세요.

### ④ 방화벽에서 443 열기

Lightsail → 인스턴스 → 네트워킹 탭 → 규칙 추가: **HTTPS (TCP 443)**

### ⑤ 확인

- 브라우저에서 `https://내도메인.kr` 접속 → 주소창에 🔒 자물쇠가 보이면 성공!
- `http://`로 접속해도 자동으로 `https://`로 이동하는지 확인

### ⑥ 관리자 IP 제한을 쓰는 경우 (중요)

Nginx를 거치면 백엔드에는 모든 요청이 127.0.0.1로 보입니다.
실제 방문자 IP를 인식하도록 백엔드를 `TRUST_PROXY=1` 환경변수와 함께 실행하세요:

```bash
pm2 delete mama-backend
cd ~/mamaweb/backend
TRUST_PROXY=1 ADMIN_KEY="나만아는비밀번호123" pm2 start server.js --name mama-backend
pm2 save
```

(코드에 이미 반영되어 있어 환경변수만 주면 됩니다. 프록시 없이 로컬에서 켜면 IP 속이기가 가능해지니 서버에서만 켜세요.)

### ⚠️ 주의사항

- **private.key는 절대 이메일/메신저/git에 올리지 마세요.** 유출되면 인증서를 재발급해야 합니다.
- 구매 인증서는 **유효기간(보통 1년)**이 있습니다. 만료 전에 재발급받아 ②~③의 fullchain.crt만 교체하고 `sudo systemctl reload nginx` 하면 됩니다. 만료일 2주 전 알림을 달력에 등록해두세요.

---

## 7단계. 나중에 코드를 수정했다면? (업데이트 방법)

내 컴퓨터에서 수정 → GitHub에 올리고(`git push`) → 서버 터미널에서:

```bash
cd ~/mamaweb
git pull
npm run install:all
npm run build
pm2 restart all
```

---

## ⚠️ 돈 아끼기 & 안전 수칙

| 하지 말 것 | 이유 |
| --- | --- |
| AWS 비밀번호/카드정보 공유 | 해킹당하면 요금 폭탄 맞아요 |
| ADMIN_KEY 기본값(`mama1234`) 그대로 쓰기 | 아무나 관리자 페이지에 들어와요 |
| 안 쓰는 서버 방치 | 매달 $12씩 계속 빠져나가요 |

**다 써보고 그만하고 싶을 때** (요금 완전히 멈추기):

1. Lightsail → 인스턴스 → `mamaweb` → **삭제(Delete)**
2. 네트워킹 탭 → 고정 IP `mamaweb-ip` 도 **삭제** (인스턴스 없이 IP만 남으면 그것도 과금돼요!)

---

## 문제가 생겼을 때

| 증상 | 해결 방법 |
| --- | --- |
| 사이트가 안 열려요 | 방화벽에서 3000 포트 열었는지 확인 → `pm2 status`로 online인지 확인 |
| `npm run build` 중 멈춰요 | 서버 메모리 부족. $12(2GB) 이상 플랜인지 확인 |
| 이미지 업로드가 안 돼요 | 6단계 Nginx 설정의 `client_max_body_size 20M;` 줄이 있는지 확인 |
| 로그를 보고 싶어요 | `pm2 logs mama-backend` 또는 `pm2 logs mama-frontend` |
