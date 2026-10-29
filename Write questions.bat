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

rem A previous run may have been interrupted part-way through an update, which leaves the
rem copy in a state where Publish refuses to work. These are no-ops if all is well.
git rebase --abort >nul 2>nul
git merge --abort >nul 2>nul

echo   Getting everyone's latest questions...
git pull --rebase --autostash
if errorlevel 1 (
  rem Never leave a half-finished update behind - that's what strands people.
  git rebase --abort >nul 2>nul
  echo.
  echo   Couldn't get everyone's latest questions just now.
  echo   Your own work is safe. You can still write, and press Publish later.
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
