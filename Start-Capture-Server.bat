@echo off
title Mockup Studio capture server
cd /d "%~dp0server"
if not exist node_modules call npm install
if exist origin.txt goto have
echo.
set /p ORIGIN=Paste your Vercel address, like https://mockup-studio.vercel.app and press Enter: 
>origin.txt echo %ORIGIN%
:have
set /p SAVED=<origin.txt
set ALLOWED_ORIGINS=%SAVED%,http://localhost:5173,http://localhost:5174
echo.
echo Capture server running. Keep this window open. Press Ctrl+C to stop.
node index.js --local
pause
