@echo off
chcp 65001 >nul
echo ========================================================
echo  CAU HINH DOMAIN TUY CHINH CHO HE THONG KHO
echo ========================================================
echo.

set HOSTS_FILE=%SystemRoot%\System32\drivers\etc\hosts

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [CANH BAO] Ban can chay file nay voi quyen Administrator!
    echo Chuot phai vao file nay va chon "Run as administrator".
    pause
    exit /b 1
)

echo Dang them domain vao file hosts...
findstr /i "hethongquanlykhodachinhanh.local" "%HOSTS_FILE%" >nul
if %errorlevel% neq 0 (
    echo 127.0.0.1 hethongquanlykhodachinhanh.local >> "%HOSTS_FILE%"
    echo 127.0.0.1 hethongquanlykhodachinhanh >> "%HOSTS_FILE%"
    echo 127.0.0.1 kho.local >> "%HOSTS_FILE%"
    echo [THANH CONG] Da them hethongquanlykhodachinhanh.local vao file hosts.
) else (
    echo [INFO] Domain da ton tai trong file hosts.
)

echo.
echo ========================================================
echo Hoan tat! Ban co the truy cap frontend qua:
echo   - http://hethongquanlykhodachinhanh.local:3000
echo   - http://kho.local:3000
echo   - http://phantan.local:3000 (da co san)
echo ========================================================
pause
