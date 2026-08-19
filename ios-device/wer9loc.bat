@echo off
REM wer9loc - one-click launcher for Windows.
REM Double-click this file. It sets up the environment on first run,
REM then opens the interactive location menu.
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python is not installed.
  echo Install Python 3 from https://www.python.org/downloads/
  echo IMPORTANT: on the first install screen, tick "Add python.exe to PATH".
  echo Then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo First-time setup: creating environment and installing dependencies...
  python -m venv .venv
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  echo.
  echo Setup done.
  echo.
)

".venv\Scripts\python.exe" wer9loc.py
echo.
pause
