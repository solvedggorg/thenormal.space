FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

WORKDIR /app/.medusa/server
RUN npm ci --omit=dev

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=9000
EXPOSE 9000

# Migrate at deploy time (`npx medusa db:migrate`), not on every container boot.
# A failing migrate here exits the process and the Worker reports
# "The container is not running, consider calling start()".
CMD ["npm", "--prefix", ".medusa/server", "start"]
