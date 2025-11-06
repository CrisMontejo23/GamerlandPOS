# ------------ Base para construir (node + pnpm) ------------
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Lock/workspace para cache de deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch

# ------------ Builder: instala deps y compila ------------
FROM base AS builder
COPY . .

# Instala deps del monorepo
RUN pnpm install -r --frozen-lockfile

# Prisma: engines binarios (mejor en Alpine)
ENV PRISMA_CLIENT_ENGINE_TYPE=binary
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary
ENV PRISMA_SCHEMA=prisma/schema.prisma

# Genera Prisma Client desde el paquete db
RUN pnpm --filter ./packages/db exec prisma generate --schema ${PRISMA_SCHEMA}

# Compila API (TS -> JS)
RUN pnpm --filter ./apps/api build

# Compila Web con standalone
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=/api
RUN pnpm -C apps/web build

# *** Importante: deps de prod locales para API ***
RUN pnpm --filter apps/api deploy --prod /app/apps/api_deploy

# ------------ Runtime: una sola imagen que corre web+api ------------
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apk add --no-cache dumb-init
WORKDIR /app

# API: dist + node_modules locales + package.json
COPY --from=builder /app/apps/api/dist                 ./apps/api/dist
COPY --from=builder /app/apps/api_deploy/package.json  ./apps/api/package.json
COPY --from=builder /app/apps/api_deploy/node_modules  ./apps/api/node_modules

# Web: standalone + static + public
COPY --from=builder /app/apps/web/.next/standalone ./apps/web/standalone
COPY --from=builder /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /app/apps/web/public           ./apps/web/public

# Prisma schema para migrate deploy en runtime
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma

# (opcional) raíz mínima
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=3000
EXPOSE 3000 4000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]