# RL Nexus als Abbild - Bot und Dashboard in einem Prozess.
#
#   docker compose -f docker-compose.prod.yml up -d --build
#
# Gebaut wird in der ersten Stufe, dort liegen TypeScript und esbuild. Ins
# fertige Abbild kommt nur, was der Betrieb braucht. Neben "dist" muss ein
# Teil von "src" mit: der Bot loest diese Pfade ueber process.cwd() auf und
# liest sie zur Laufzeit von der Platte - Seiten, Migrationen, Schriften,
# Auswahllisten und die Galerie.
#
# Siehe docs/Hosting.md.

FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/dashboard/public ./src/dashboard/public
COPY --from=build /app/src/database/migrations ./src/database/migrations
COPY --from=build /app/src/assets/fonts ./src/assets/fonts
COPY --from=build /app/src/config ./src/config
COPY --from=build /app/src/images ./src/images

# Der Bot schreibt Logs, Verlaeufe, Beweisbilder, Clips und Galerie-Uploads. Er
# laeuft nicht als root, also gehoeren die Ordner dem Nutzer "node" (UID 1000).
RUN mkdir -p logs transcripts evidence clips && chown -R node:node /app

USER node

EXPOSE 3000

# Antwortet der Server ueberhaupt, steht er. Welchen Status er schickt, ist
# egal: /dcapi/health verlangt einen Token und antwortet ohne ihn mit 401.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.SERVER_PORT||3000)+'/dcapi/health',()=>process.exit(0)).on('error',()=>process.exit(1))"

# Kein --dev: der Betrieb nimmt CLIENT_TOKEN, das Dashboard liegt an der Wurzel
# von SERVER_PUBLIC_URL, und Galerie-Bilder gehen als URL an Discord.
CMD ["node", "."]
