@echo off
chcp 65001 >nul
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\ucrt64\bin;%PATH%"
title NozGuard - GitHub Otomatik Yukleme
cd /d "%~dp0"
echo ========================================================
echo       NOZGUARD DISCORD BOT - GITHUB YUKLEME
echo ========================================================
echo.
git add .
git commit -m "update: NozGuard otomatik guncelleme"
git push origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo [BASARILI] Tum dosyalar GitHub'a basariyla aktarildi!
    echo Render.com uzerinde guncel commit yayina alinabilir.
    echo ========================================================
) else (
    echo ========================================================
    echo [BILGI] Zaten tum dosyalar guncel veya yukleme tamamlandi.
    echo ========================================================
)
echo.
pause
