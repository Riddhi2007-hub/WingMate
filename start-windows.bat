@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the current LTS from https://nodejs.org ^(or: winget install OpenJS.NodeJS.LTS^), then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing project tools ^(first run only, needs internet^)...
  call npm install
  if errorlevel 1 ( echo npm install failed. & pause & exit /b 1 )
)
node scripts\preflight.mjs
if errorlevel 1 ( pause & exit /b 1 )
start "" http://localhost:3000
call npm start
pause
