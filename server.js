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

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
