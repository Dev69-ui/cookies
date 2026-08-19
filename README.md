# Headers Capture Server

Opens Instagram / Facebook `?__a=1` in a headless Chromium, harvests the
main document request headers (including `Cookie:` on the second load),
and returns a DevTools-style screenshot as PNG.

## Deploy to Render (one click)

1. Create a GitHub repo and push **this folder** (`server/`) as the repo root:

```bash
git init
git add .
git commit -m "headers capture server"
git remote add origin https://github.com/<you>/headers-capture.git
git push -u origin main
```

2. On [render.com](https://render.com) → **New** → **Blueprint** → connect the repo.
   Render reads `render.yaml` and deploys a Docker web service with the
   `headers-capture` name.

3. Open the service URL (e.g. `https://headers-capture.onrender.com`) and click
   **Instagram** or **Facebook**.

## Local run

```bash
npm install
node server.js        # -> http://localhost:3000
```

## API

```
GET /run?site=instagram|facebook  -> PNG image
```

## Known limitations

- **Data-center IP block**: Instagram/Facebook often serve a login/challenge
  wall to cloud IPs (Render). The automation runs correctly, but the capture
  may show the login page instead of headers. Home/ISP IPs usually work.
- **Bot detection**: This is a plain headless Chrome; Meta may detect and
  block it. No proxy/stealth rotation is included.
- First request after idle on the free tier is slow (cold start) and the
  capture can take 10–30s.