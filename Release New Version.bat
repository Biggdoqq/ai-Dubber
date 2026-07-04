@echo off
:: ============================================================
::  AI Video Dubber Pro — One-Click Release Script
::  Usage: Double-click this file, enter version, done!
:: ============================================================

title AI Video Dubber Pro — Release Tool

echo.
echo  ==========================================
echo   AI Video Dubber Pro — Release Publisher
echo  ==========================================
echo.

:: Get current version from package.json
for /f "tokens=2 delims=:, " %%a in ('findstr /i "\"version\"" package.json') do (
    set CURRENT=%%~a
    goto :found
)
:found

echo  Current version: %CURRENT%
echo.
set /p NEW_VERSION= Enter new version (e.g. 2.1.0): 

if "%NEW_VERSION%"=="" (
    echo  [!!] No version entered. Exiting.
    pause
    exit /b
)

echo.
echo  [1/4] Updating version to v%NEW_VERSION%...
:: Update version in package.json using PowerShell
powershell -Command "(Get-Content package.json) -replace '\"version\": \"%CURRENT%\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content package.json"

echo  [2/4] Committing changes...
git add package.json
git commit -m "chore: release v%NEW_VERSION%"

echo  [3/4] Creating git tag v%NEW_VERSION%...
git tag v%NEW_VERSION%

echo  [4/4] Pushing to GitHub (triggers auto-build)...
git push origin main
git push origin v%NEW_VERSION%

echo.
echo  ==========================================
echo   Done! GitHub Actions will now:
echo   - Build the .exe installer
echo   - Create GitHub Release v%NEW_VERSION%
echo   - Publish for Auto-Update
echo  ==========================================
echo.
echo  Check: https://github.com/Biggdoqq/AI_Video_Dubber_Clean/releases
echo.
pause
