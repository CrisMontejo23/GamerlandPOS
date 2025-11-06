# ------------ Base para construir (node + pnpm) ------------
FROM node:20-bookworm-slim AS base
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

# ------------ Runtime: una sola imagen que corre web+api ------------
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends dumb-init ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos node_modules completos del builder (ya reproducibles por lockfile)
COPY --from=builder /app/node_modules ./node_modules

# ✅ NEW: también los node_modules de cada app (necesarios con pnpm workspaces)
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules 
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules    

# API compilada + package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

# Next standalone + static + public
COPY --from=builder /app/apps/web/.next/standalone ./apps/web/standalone
COPY --from=builder /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder /app/apps/web/public           ./apps/web/public

# ✅ NEW: para que el fallback `pnpm -C apps/web start` tenga manifiesto
COPY --from=builder /app/apps/web/package.json     ./apps/web/package.json
# 👇 NECESARIO para que el fallback `next start` funcione
COPY --from=builder /app/apps/web/.next            ./apps/web/.next

# Prisma schema y metadatos del monorepo
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=3000
EXPOSE 3000 4000
ENTRYPOINT ["/usr/bin/dumb-init","--"]
CMD ["/entrypoint.sh"]