@echo off
REM wer9loc tunnel - required ONLY for iOS 17 and newer.
REM Double-click this file. It will request Administrator rights (needed for
REM the tunnel), then start it. Keep the window OPEN while you use wer9loc.
cd /d "%~dp0"

REM Re-launch elevated if not already Administrator.
net session >nul 2>nul
if errorlevel 1 (
  echo Requesting Administrator rights...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Please run wer9loc.bat once first to finish setup.
  pause
  exit /b 1
)

echo ============================================================
echo   iOS 17+ tunnel is starting. KEEP THIS WINDOW OPEN.
echo   Then open wer9loc.bat in another window to set location.
echo ============================================================
echo.
".venv\Scripts\python.exe" -m pymobiledevice3 remote tunneld
pause
