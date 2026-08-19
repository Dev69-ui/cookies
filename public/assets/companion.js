// Companion service: lets the deployed website trigger the REAL record.js flow
// on your own PC (your browser, your login, full-screen screenshots).
//
// Run locally:   node companion.js
// Then on the deployed site click "Capture with your browser (record.js)".
// Browsers allow an HTTPS page to fetch this local http://127.0.0.1 service.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 9876;
const HOST = '127.0.0.1';
const recordJs = path.join(__dirname, 'record.js');
const screenshots = path.join(os.homedir(), 'Pictures', 'Screenshots');
const OUT_FILES = {
  instagram: 'instagram_insta.png',
  facebook: 'facebook_insta.png',
};
const JOB_TIMEOUT_MS = 240000; // record.js handles both sites sequentially
let busy = false;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function toDataUrl(rel) {
  const p = path.join(screenshots, rel);
  if (!fs.existsSync(p)) return null;
  return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
}

function runRecordJs() {
  return new Promise((resolve) => {
    for (const rel of Object.values(OUT_FILES)) {
      const p = path.join(screenshots, rel);
      try {
        fs.unlinkSync(p);
      } catch {}
    }
    const child = spawn(process.execPath, [recordJs], {
      cwd: __dirname,
      stdio: 'ignore',
      detached: false,
      env: { ...process.env, COOKIES_SILENT: '1' },
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}
    }, JOB_TIMEOUT_MS);
    child.on('close', () => {
      clearTimeout(timer);
      resolve(timedOut);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const u = new URL(req.url, `http://${HOST}:${PORT}`);

  if (u.pathname === '/ping') {
    return sendJson(res, 200, { ok: true, note: 'companion running' });
  }

  if (u.pathname === '/latest') {
    let images = {};
    for (const s of ['instagram', 'facebook']) {
      const data = toDataUrl(OUT_FILES[s]);
      if (data) images[s] = data;
    }
    return sendJson(res, 200, { ok: true, busy, images });
  }

  if (u.pathname === '/run') {
    const site = u.searchParams.get('site') || 'both';
    if (!['instagram', 'facebook', 'both'].includes(site)) {
      return sendJson(res, 400, { error: 'site must be instagram, facebook or both' });
    }
    if (busy) {
      return sendJson(res, 409, { error: 'already running', busy: true });
    }
    busy = true;
    console.log(`[companion] /run site=${site} — starting record.js in your browser...`);
    runRecordJs()
      .then((timedOut) => {
        busy = false;
        let images = {};
        let names = {};
        for (const s of ['instagram', 'facebook']) {
          const data = toDataUrl(OUT_FILES[s]);
          if (data) {
            images[s] = data;
          }
        }
        if (timedOut) {
          return sendJson(res, 500, { error: 'record.js did not finish in time; is your browser closed or locked?' });
        }
        const count = Object.keys(images).length;
        if (count === 0) {
          return sendJson(res, 500, { error: 'no screenshots produced. Re-run record.js from your project folder once to confirm it works.' });
        }
        console.log(`[companion] done — returned ${count} screenshots`);
        return sendJson(res, 200, { ok: true, site, images, filenames: names });
      })
      .catch((err) => {
        busy = false;
        sendJson(res, 500, { error: String(err && err.message) });
      });
    return;
  }

  sendJson(res, 404, { error: 'unknown endpoint' });
});

server.listen(PORT, HOST, () => {
  console.log(`[companion] listoning on http://${HOST}:${PORT}`);
  console.log('[companion] keep this window open; now click "Capture with your browser" on the deployed site.');
});