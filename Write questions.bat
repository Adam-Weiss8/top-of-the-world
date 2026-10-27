@echo off
title Top of the World - write questions
cd /d "%~dp0"

echo.
echo   Top of the World - question writer
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo   Git isn't installed on this computer yet.
  echo   Ask Adam to set it up. Nothing is broken.
  echo.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo   Node isn't installed on this computer yet.
  echo   Ask Adam to set it up. Nothing is broken.
  echo.
  pause
  exit /b 1
)

echo   Getting everyone's latest questions...
git pull --rebase --autostash
if errorlevel 1 (
  echo.
  echo   Couldn't reach GitHub, so you may not have the newest questions.
  echo   You can still write - press Publish when you're back online.
  echo.
)

echo   Getting ready...
call npm install --silent

echo.
echo   Opening the question writer in your browser.
echo   Keep this black window open while you work, then just close it.
echo.
call npm run dev -- --open /admin.html

echo.
echo   Stopped. You can close this window.
pause
