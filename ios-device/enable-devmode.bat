@echo off
REM Makes "Developer Mode" appear on the iPhone (iOS 16+), so you can turn it on.
REM Run wer9loc.bat once first (to set up), keep the iPhone connected + unlocked.
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Please run wer9loc.bat once first to finish setup.
  pause
  exit /b 1
)
set "PY=.venv\Scripts\python.exe"

echo ============================================================
echo   Revealing Developer Mode on your iPhone
echo   (keep the iPhone connected and UNLOCKED)
echo ============================================================
echo.
echo Step 1: reveal the Developer Mode menu...
%PY% -m pymobiledevice3 amfi reveal-developer-mode
echo.
echo Step 2: current status:
%PY% -m pymobiledevice3 amfi developer-mode-status
echo.
echo ------------------------------------------------------------
echo Now, on the iPhone (Arabic):
echo   الاعدادات  ^>  الخصوصية والامان  ^>  وضع المطور
echo   Turn it ON, RESTART the iPhone, then confirm "تشغيل".
echo ------------------------------------------------------------
echo.
pause
