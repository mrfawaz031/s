@echo off
REM wer9loc - one-click launcher for Windows.
REM Double-click this file. It sets up the environment on first run,
REM then opens the interactive location menu.
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM --- Pick a Python that has ready-made packages (3.12/3.11/3.13/3.10). ---
REM Python 3.14 has NO prebuilt packages yet, so we avoid it when possible.
set "PYCMD="
for %%V in (3.12 3.11 3.13 3.10) do (
  if not defined PYCMD (
    py -%%V -c "import sys" >nul 2>nul
    if !errorlevel! equ 0 set "PYCMD=py -%%V"
  )
)
if not defined PYCMD (
  where python >nul 2>nul && set "PYCMD=python"
)
if not defined PYCMD (
  echo.
  echo Python is not installed.
  echo Install Python 3.12 from:
  echo    https://www.python.org/downloads/release/python-3128/
  echo IMPORTANT: on the first screen tick "Add python.exe to PATH".
  echo Then double-click this file again.
  echo.
  pause
  exit /b 1
)
echo Using Python: %PYCMD%

REM --- Rebuild the environment if it's missing or incomplete. ---
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -c "import pymobiledevice3" >nul 2>nul
  if errorlevel 1 (
    echo Existing environment is incomplete - rebuilding...
    rmdir /s /q ".venv"
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo First-time setup: creating environment and installing dependencies...
  %PYCMD% -m venv .venv
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install --prefer-binary -r requirements.txt
  echo.
)

REM --- Verify the install actually worked. ---
".venv\Scripts\python.exe" -c "import pymobiledevice3" >nul 2>nul
if errorlevel 1 (
  echo.
  echo ============================================================
  echo  Dependencies did NOT install.
  echo  Most likely your Python is too new ^(3.14^) with no ready
  echo  packages yet. Fix in 3 steps:
  echo    1^) Install Python 3.12:
  echo       https://www.python.org/downloads/release/python-3128/
  echo       ^(tick "Add python.exe to PATH"^)
  echo    2^) Delete the ".venv" folder in this directory.
  echo    3^) Double-click wer9loc.bat again.
  echo ============================================================
  echo.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" wer9loc.py
echo.
pause
