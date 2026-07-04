@echo off
title AI Video Dubber Pro — Starting...
cd /d "%~dp0"

echo.
echo  ==========================================
echo   AI Video Dubber Pro  ^|  Starting...
echo  ==========================================
echo.

REM ── 1. Check if backend already running ──────────────────────────────────────
curl -s --max-time 1 http://127.0.0.1:8765/api/ping >nul 2>&1
if %errorlevel% == 0 (
    echo  [OK] Backend already running — skipping startup.
    goto :launch_electron
)

REM ── 2. Start backend in background ───────────────────────────────────────────
echo  [>>] Starting backend server...

REM Try venv python first, then system python
if exist "%~dp0venv\Scripts\python.exe" (
    set PYTHON="%~dp0venv\Scripts\python.exe"
) else (
    set PYTHON=python
)

start "AI Dubber Backend" /min %PYTHON% -m uvicorn backend.app:app --host 127.0.0.1 --port 8765

REM ── 3. Wait until backend is ready (max 30s) ─────────────────────────────────
echo  [..] Waiting for backend to be ready...
set /a TRIES=0
:waitloop
    timeout /t 1 /nobreak >nul
    curl -s --max-time 1 http://127.0.0.1:8765/api/ping >nul 2>&1
    if %errorlevel% == 0 goto :ready
    set /a TRIES+=1
    if %TRIES% GEQ 30 (
        echo  [!!] Backend did not start in 30s. Check Python installation.
        pause
        exit /b 1
    )
    goto :waitloop

:ready
echo  [OK] Backend is ready!
echo.

REM ── 4. Launch Electron app ────────────────────────────────────────────────────
:launch_electron
echo  [>>] Launching AI Video Dubber Pro...
start "" npm run electron
exit
