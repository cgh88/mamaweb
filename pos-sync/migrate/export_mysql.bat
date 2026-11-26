@echo off
chcp 65001 >nul
rem 기존 MySQL(order_info, order_detail)의 2023-11-01 ~ 2024-11-30 데이터를 TSV로 내보내기
rem MySQL 서버가 이 PC가 아니라 본사 랙서버면 아래 HOST를 192.168.0.55로 바꾸세요
set HOST=localhost
set MYSQL="C:\Program Files (x86)\MySQL\MySQL Server 5.5\bin\mysql.exe"
cd /d "%~dp0"
echo [1/2] order_info 내보내기 - MySQL root 비밀번호를 입력하세요
%MYSQL% -h %HOST% -u root -p --default-character-set=utf8 --batch mamachicken < export_order_info.sql > order_info.tsv
if errorlevel 1 goto fail
echo [2/2] order_detail 내보내기 - 비밀번호를 한 번 더 입력하세요
%MYSQL% -h %HOST% -u root -p --default-character-set=utf8 --batch mamachicken < export_order_detail.sql > order_detail.tsv
if errorlevel 1 goto fail
echo.
echo 완료: %~dp0order_info.tsv, order_detail.tsv
for %%F in (order_info.tsv order_detail.tsv) do echo   %%F  %%~zF bytes
pause
exit /b 0
:fail
echo 실패했습니다. 비밀번호 또는 HOST를 확인하세요.
pause
exit /b 1
