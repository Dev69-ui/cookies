# Serves the one-click capture page: index.html + stake_hacks.bat + assets.
FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public

ENV PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]