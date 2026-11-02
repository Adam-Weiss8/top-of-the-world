@echo off
title Top of the World - fix my copy
cd /d "%~dp0"

echo.
echo   Fixing this copy of Top of the World
echo.
echo   Your unpublished questions are copied somewhere safe first,
echo   so nothing you have written can be lost.
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo   Git isn't installed, so there is nothing to fix here.
  echo   Ask Adam.
  echo.
  pause
  exit /b 1
)

rem This only means anything inside the project folder. Run from anywhere else and every
rem git command below would quietly fail while still reporting success.
if not exist "package.json" goto :wrongplace
if not exist "srcdata" goto :wrongplace
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 goto :wrongplace
goto :rightplace

:wrongplace
echo   This file needs to live in the Top of the World project folder -
echo   the one containing "Write questions" - and be double-clicked there.
echo.
echo   Right now it is in:
echo       %CD%
echo.
echo   Move it next to "Write questions" and double-click it again.
echo.
pause
exit /b 1

:rightplace
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set DT=%%I
set STAMP=%DT:~0,8%-%DT:~8,6%
set BACKUP=rescued-questions\%STAMP%

echo   1. Copying everything in src\data to %BACKUP%
mkdir "%BACKUP%" 2>nul
xcopy /E /I /Q /Y "src\data" "%BACKUP%" >nul

echo   2. Undoing any half-finished update
git rebase --abort >nul 2>nul
git merge --abort >nul 2>nul

echo   3. Going back to the shared copy
git checkout main >nul 2>nul
git fetch origin
git reset --hard origin/main >nul 2>nul

echo   4. Putting your unpublished questions back
if exist "%BACKUP%\inbox" xcopy /E /I /Q /Y "%BACKUP%\inbox" "src\data\inbox" >nul

echo.
for /f %%B in ('git rev-parse --abbrev-ref HEAD') do set BR=%%B
echo   Done. This copy is on "%BR%" and matches GitHub again.
echo.
echo   Everything src\data held before the fix is in the folder:
echo       %BACKUP%
echo   You can delete it once you are sure nothing is missing.
echo.
echo   Now double-click "Write questions" as usual.
echo.
pause
