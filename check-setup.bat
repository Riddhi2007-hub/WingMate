@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed. Install the current LTS from https://nodejs.org
  echo or run:  winget install OpenJS.NodeJS.LTS
  echo Then open a NEW window and run this file again.
  echo.
  pause
  exit /b 1
)
node scripts\preflight.mjs
echo.
pause
