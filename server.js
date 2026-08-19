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

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
