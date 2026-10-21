# Dockerfile — production image for Terminal-bird
#
# Builds the Vite frontend, bundles the Express + Socket.IO server, and runs
# it. Listens on $PORT (Render injects it). WebSockets (Socket.IO) work on
# Render web services out of the box — no sticky sessions needed since this
# app is a single instance with in-memory session state.

FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# vite build -> dist/ (frontend) + esbuild bundles server.ts -> dist/server.cjs
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server.cjs"]
