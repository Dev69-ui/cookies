# Server-side capture (Render / any Linux host)
FROM node:20-slim

# Puppeteer needs these chromium system libs on Debian slim (full set from
# https://github.com/puppeteer/puppeteer#system-requirements).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libdrm2 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 unzip wget fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PUPPETEER_CACHE_DIR=/opt/puppeteer-cache
COPY package.json package-lock.json ./
RUN npm install --omit=dev \
  && npx puppeteer browsers install chrome
COPY server.js capture.js ./
COPY public ./public

ENV PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]