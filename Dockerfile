# ------------ Base para construir (node + pnpm) ------------
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copiamos los archivos de lock y workspace primero para cachear deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Prefetch de dependencias (solo metadata) para acelerar
RUN pnpm fetch

# ------------ Builder: instala deps y compila ------------
FROM base AS builder

# Copia del resto del repo
COPY . .

# Instala TODAS las deps del monorepo con el lockfile fijo
RUN pnpm install -r --frozen-lockfile

# ===== Prisma: forzamos engine BINARIO en la etapa donde se genera el cliente
ENV PRISMA_CLIENT_ENGINE_TYPE=binary
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary
ENV PRISMA_SCHEMA=prisma/schema.prisma

# Genera Prisma Client (usando el paquete real de prisma de packages/db)
RUN pnpm --filter ./packages/db exec prisma generate --schema ${PRISMA_SCHEMA}

# Compila la API (TS -> JS en ./apps/api/dist)
RUN pnpm --filter ./apps/api build

# Compila el Web (Next.js build)
ENV NEXT_TELEMETRY_DISABLED=1
# Front hablará con API interna en :4000 dentro del mismo contenedor
ENV NEXT_PUBLIC_API_URL=http://localhost:4000
RUN pnpm --filter ./apps/web build

# ------------ Runtime: una sola imagen que corre web+api ------------
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apk add --no-cache dumb-init

WORKDIR /app

# Solo lo necesario en runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./

# Entrypoint para migrar y arrancar ambos procesos
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=3000
EXPOSE 3000 4000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]