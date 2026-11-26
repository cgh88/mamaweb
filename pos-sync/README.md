# POS 매출 수집 (pos-sync)

스마일비즈(SMARTRO) POS API에서 매장별 전날 매출을 가져와 운영 서버 PostgreSQL(`mamapos` DB)에 저장합니다.
기존 `mama_data_header_input*.py`, `mama_data_detail_input*.py`(매장별 6개 파일, MySQL 저장)를 대체합니다.

| API | 테이블 | 기본키 |
| --- | --- | --- |
| `getSaleHeadInfo` (주문 헤더) | `pos_order_header` | `inv_seq` |
| `getSaleDetailInfo` (주문 상세) | `pos_order_detail` | `inv_seq, inv_nos` |

- 컬럼명은 API 필드명을 소문자로 바꾼 것 (기존 MySQL `order_info` / `order_detail`과 같은 필드)
- 매장·일자 단위로 삭제 후 재저장하므로 여러 번 실행해도 중복이 생기지 않음
- 매일 실행 시 어제 포함 `POS_SYNC_DAYS`(기본 3)일치를 다시 가져와 사후 취소/반품을 반영

## 실행

```bash
python3 pos_sync.py                                   # 어제 기준 3일치, 전 매장
python3 pos_sync.py --date 20261125                   # 특정 일자
python3 pos_sync.py --from 20260101 --to 20261125     # 기간 (과거 데이터 채우기)
python3 pos_sync.py --date 20261125 --store 7915301   # 특정 매장
```

설정: `.env.example`을 `.env`로 복사해 API 토큰·매장 코드·DB 접속 정보를 입력 (권한 600, git 제외).
필요 패키지(Ubuntu): `sudo apt install python3-requests python3-psycopg2`

## 자동 실행 (systemd 타이머, 매일 06:00 KST)

```bash
sudo cp systemd/mamapos-sync.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mamapos-sync.timer
systemctl list-timers mamapos-sync.timer      # 다음 실행 시각
journalctl -u mamapos-sync --since today      # 실행 로그
sudo systemctl start mamapos-sync             # 지금 바로 1회 실행
```
