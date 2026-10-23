# Das Admin Dashboard als Image: der Server mit der API.
#
# Im Betrieb startet es docker-compose.prod.yml im Ordner RL Nexus Bot,
# nginx auf dem Host davor übernimmt Domain und Zertifikat. Node führt den Server
# direkt als TypeScript aus. Die Oberfläche baut man auf dem Server mit
# npm run build, Compose hängt dist dann nach /app/dist ein.

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

# Nur was der Server zur Laufzeit braucht: Fastify, Rate Limit, Static, MariaDB.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY shared ./shared

# UID 1000: Ihm müssen data/site und data/flags auf dem Server gehören.
USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3001/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/index.ts"]
