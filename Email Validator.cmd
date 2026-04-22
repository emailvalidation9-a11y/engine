@echo off
title Email Validation Engine
color 0A

echo.
echo ============================================================
echo        Email Validation Engine - Startup
echo ============================================================
echo.

:: ---- Unblock files (removes "downloaded from internet" flag) ----
echo [INFO] Removing security blocks from files...
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File -ErrorAction SilentlyContinue" >nul 2>nul
echo [OK] Security blocks removed.
echo.

:: ---- Check if Node.js is installed ----
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please download and install Node.js from:
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: ---- Display Node.js version ----
echo [OK] Node.js found:
node -v
echo.

:: ---- Install dependencies if needed ----
if not exist "%~dp0node_modules" (
    echo [INFO] Installing dependencies...
    echo.
    cd /d "%~dp0"
    npm install
    echo.
    if %ERRORLEVEL% neq 0 (
        color 0C
        echo [ERROR] Failed to install dependencies!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully.
    echo.
) else (
    echo [OK] Dependencies already installed.
    echo.
)

:: ---- Create uploads directory ----
if not exist "%~dp0uploads" (
    mkdir "%~dp0uploads"
    echo [OK] Created uploads directory.
    echo.
)

:: ---- Set port ----
if "%PORT%"=="" (
    set PORT=3000
)

echo ============================================================
echo   Server starting on: http://localhost:%PORT%
echo   Admin Dashboard:    http://localhost:%PORT%/admin
echo   Health Check:       http://localhost:%PORT%/health
echo ============================================================
echo.
echo   Press Ctrl+C to stop the server.
echo.

:: ---- Open browser after 2 seconds ----
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%"

:: ---- Start the application ----
cd /d "%~dp0"
node app.js

:: ---- If server stops ----
echo.
echo [INFO] Server has stopped.
pause
