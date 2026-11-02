@echo off
chcp 65001 >nul
title Sổ Bán Hàng Gốm
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto run

echo Máy chưa có Node.js, đang cài tự động. Nếu Windows hỏi quyền, hãy bấm Yes.
winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto run

echo.
echo Không cài được Node.js tự động. Hãy tải bản LTS ở trang vừa mở, cài xong rồi mở lại tệp này.
start "" https://nodejs.org
pause
exit /b 1

:run
powershell -NoProfile -Command "Start-Process node -ArgumentList 'scripts/control-panel.js' -WindowStyle Hidden -RedirectStandardError '.bang-dieu-khien.log'"
