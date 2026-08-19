const puppeteer = require('puppeteer');
const { execFileSync } = require('child_process');

function ensureChrome() {
  try {
    puppeteer.executablePath();
    return;
  } catch {}
  console.log('Chrome not found, installing...');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npx, ['puppeteer', 'browsers', 'install', 'chrome'], { stdio: 'inherit', timeout: 180000 });
}

const SITES = {
  instagram: { url: 'https://www.instagram.com/instagram/?__a=1', label: 'instagram' },
  facebook: { url: 'https://www.facebook.com/facebook/?__a=1', label: 'facebook' },
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function headerTable(title, headers, collapsed) {
  const rows = Object.entries(headers || {})
    .map(([k, v]) => `<div class="row"><span class="key">${esc(k)}</span><span class="val">${esc(v)}</span></div>`)
    .join('');
  const count = Object.keys(headers || {}).length;
  return `
    <div class="section${collapsed ? ' collapsed' : ''}">
      <div class="sec-head">${esc(title)} (${count})</div>
      <div class="sec-body">${rows || '<div class="row"><span class="val">(none)</span></div>'}</div>
    </div>`;
}

function renderScreenshot({ site, reqUrl, method, status, requestHeaders, responseHeaders }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #24292e; color: #d4d4d4; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; font-size: 13px; width: 1000px; padding: 0; }
  .bar { background: #2d333b; color: #e8e8e8; font-weight: 600; padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #1b1f23; }
  .subbar { background: #1f2429; color: #8b949e; padding: 8px 16px; font-size: 12px; border-bottom: 1px solid #1b1f23; }
  .tabs { display: flex; gap: 2px; padding: 8px 16px 0; background: #2d333b; }
  .tab { padding: 8px 14px; border-radius: 4px 4px 0 0; color: #9da5b1; }
  .tab.active { background: #24292e; color: #e8e8e8; font-weight: 600; }
  .content { padding: 0 0 8px; }
  .section { border-bottom: 1px solid #1b1f23; padding: 0 16px; }
  .sec-head { color: #79b8ff; font-weight: 600; padding: 10px 0 6px; }
  .collapsed .sec-body { display: none; }
  .row { display: flex; border-bottom: 1px solid #22262b; padding: 6px 0; }
  .key { width: 260px; color: #79b8ff; flex-shrink: 0; padding-right: 12px; }
  .val { color: #e8e8e8; word-break: break-all; }
</style>
</head>
<body>
  <div class="bar">DevTools — ${esc(site)}/?__a=1</div>
  <div class="subbar">${esc(reqUrl)}</div>
  <div class="tabs"><span class="tab">Elements</span><span class="tab">Console</span><span class="tab">Sources</span><span class="tab active">Network</span></div>
  <div class="content">
    ${headerTable('General', { 'Request URL': reqUrl, 'Request Method': method, 'Status Code': status })}
    ${headerTable('Request Headers', requestHeaders)}
    ${headerTable('Response Headers', responseHeaders, true)}
  </div>
</body>
</html>`;
}

async function capture(siteName, cookieStr) {
  const site = SITES[siteName] || SITES.instagram;
  let browser = null;
  try {
    ensureChrome();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1200 });
    const client = await page.createCDPSession();
    await client.send('Network.enable');

    let reqUrl = site.url;
    let method = 'GET';
    let status = '';
    let requestHeaders = null;
    let responseHeaders = null;

    const matchUrl = (u) => u.replace(/[?#].*$/, '') === site.url.replace(/[?#].*$/, '');
    const pendingDocs = new Map();

    // When cookies are supplied they're valid from the first navigation, so
    // capture that one (its Cookie header is exactly the supplied value). With
    // no cookies, the first navigation runs on an empty jar and the SECOND
    // one carries the cookies Instagram set; capture that one instead.
    const captureCount = cookieStr ? 1 : 2;
    let navCount = 0;

    if (cookieStr) {
      // Send the EXACT cookie string verbatim (Chrome would otherwise
      // reorder cookies when building the Cookie header from its jar).
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.isNavigationRequest() && matchUrl(req.url()) && cookieStr) {
          req.continue({ headers: { ...req.headers(), cookie: cookieStr } });
        } else {
          req.continue();
        }
      });
    }

    // requestWillBeSent headers omit the Cookie header; the authoritative
    // headers (including Cookie) arrive in requestWillBeSentExtraInfo and
    // are correlated by requestId.
    client.on('Network.requestWillBeSent', (e) => {
      if (e.type === 'Document' && matchUrl(e.request.url)) {
        pendingDocs.set(e.requestId, {
          url: e.request.url,
          method: e.request.method,
        });
      }
    });
    client.on('Network.requestWillBeSentExtraInfo', (e) => {
      const doc = pendingDocs.get(e.requestId);
      if (!doc) return;
      pendingDocs.delete(e.requestId);
      navCount += 1;
      if (navCount !== captureCount) return;
      reqUrl = doc.url;
      method = doc.method;
      requestHeaders = e.headers;
    });
    client.on('Network.responseReceived', (e) => {
      const doc = pendingDocs.get(e.requestId);
      if (!doc) return;
      pendingDocs.delete(e.requestId);
      if (navCount !== captureCount) return;
      status = String(e.response.status);
      responseHeaders = e.response.headers;
    });

    const load = async () => {
      try {
        await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch {}
      await new Promise((r) => setTimeout(r, 2000));
    };

    await load();
    if (!cookieStr) await load();

    const html = renderScreenshot({
      site: site.label,
      reqUrl,
      method,
      status,
      requestHeaders,
      responseHeaders,
    });

    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));
    const shot = await page.screenshot({ type: 'png', fullPage: true });
    return shot;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { capture };
