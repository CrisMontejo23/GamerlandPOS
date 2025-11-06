# ------------ Base para construir (node + pnpm) ------------
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

# ------------ Builder: instala deps y compila ------------
FROM base AS builder
COPY . .
RUN pnpm install -r --frozen-lockfile

# Prisma (ajusta si tu schema estuviera en otro path)
ENV PRISMA_CLIENT_ENGINE_TYPE=binary
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary
ENV PRISMA_SCHEMA=prisma/schema.prisma
RUN pnpm --filter ./packages/db exec prisma generate --schema ${PRISMA_SCHEMA}

# Build API
RUN pnpm --filter ./apps/api build

# Build Web con proxy a /api
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=/api
RUN pnpm -C apps/web build

# ------------ Runner: una sola imagen que corre web+api ------------
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apk add --no-cache dumb-init

WORKDIR /app

# node_modules (monorepo)
COPY --from=builder /app/node_modules ./node_modules

# API compilada
COPY --from=builder /app/apps/api/dist        ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

# Web: standalone + static + public (NO copiar .next entero ni package.json)
COPY --from=builder /app/apps/web/.next/standalone ./apps/web/standalone
COPY --from=builder /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /app/apps/web/public           ./apps/web/public

# Prisma schema (para migrate deploy en runtime)
COPY --from=builder /app/prisma ./prisma

# Workspace manifests (opcional pero útil)
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=3000
EXPOSE 3000
# (4000 queda interno; no hace falta exponerlo fuera)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]