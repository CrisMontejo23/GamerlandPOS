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

# Instala TODAS las deps del monorepo con el lockfile ya resuelto
RUN pnpm install -r --frozen-lockfile

# Genera Prisma Client (apunta a tu schema real)
ENV PRISMA_SCHEMA=packages/db/prisma/schema.prisma
RUN pnpm dlx prisma generate --schema ${PRISMA_SCHEMA}

# Compila la API (TS -> JS en ./apps/api/dist)
RUN pnpm --filter ./apps/api build

# Compila el Web (Next.js build)
# Importante: en producción el front se comunica con la API interna en :4000
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=http://localhost:4000
RUN pnpm --filter ./apps/web build

# ------------ Runtime: una sola imagen que corre web+api ------------
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apk add --no-cache dumb-init

WORKDIR /app

# Sólo lo necesario en runtime:
# - node_modules de producción (de todo el monorepo)
# - dist de la api
# - .next de la web (standalone si la tienes, o la build normal)
# - prisma schema (para migrate deploy)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./

# Entrypoint para lanzar migraciones y arrancar ambos procesos
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PORT=3000
EXPOSE 3000 4000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]
