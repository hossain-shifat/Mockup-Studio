# Capture server for Render, Railway, Fly.io and other Docker hosts.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
# Chromium plus the system libraries it needs
RUN npx playwright-core install --with-deps chromium
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0 BROWSER=chromium
EXPOSE 5050
CMD ["node", "index.js"]
