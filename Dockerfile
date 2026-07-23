# ================= Build =================
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ================= Runtime (standalone, imagem minima) =================
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=6510

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/public ./public
COPY --from=build /app/.next/static ./.next/static

# directório dos PDFs das cotações (montado como volume no docker-compose)
RUN mkdir -p /app/cotacoes && chown node:node /app/cotacoes

USER node
EXPOSE 6510
CMD ["node", "server.js"]
