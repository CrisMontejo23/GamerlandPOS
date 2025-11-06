#!/usr/bin/env sh
set -euo pipefail

# Puertos
API_PORT=${API_PORT:-4000}
WEB_PORT=${PORT:-3000}
export HOSTNAME=0.0.0.0

# Prisma schema (el que SÍ existe en el contenedor runtime)
PRISMA_SCHEMA=${PRISMA_SCHEMA:-packages/db/prisma/schema.prisma}

echo "==> DATABASE_URL: ${DATABASE_URL:-<no definida>}"
echo "==> Prisma schema: ${PRISMA_SCHEMA}"
echo "==> API_PORT: ${API_PORT} | WEB_PORT: ${WEB_PORT}"

# --- Prisma: usa pnpm dlx (no requiere que prisma esté instalado localmente)
echo "==> prisma generate (dlx)"
pnpm dlx prisma generate --schema "$PRISMA_SCHEMA" >/dev/null 2>&1 || true

echo "==> prisma migrate deploy (dlx)"
if ! pnpm dlx prisma migrate deploy --schema "$PRISMA_SCHEMA"; then
  echo "WARN: migrate deploy falló (DB no accesible o sin migraciones). Continúo…"
fi

# --- API
echo "==> Iniciando API en :${API_PORT}"
PORT="$API_PORT" node apps/api/dist/index.js &
API_PID=$!

# --- Web (Next standalone ó fallback a start)
echo "==> Iniciando Web en :${WEB_PORT}"
if [ -f "apps/web/standalone/server.js" ]; then
  PORT="$WEB_PORT" HOSTNAME=0.0.0.0 node apps/web/standalone/server.js &
elif [ -f "apps/web/standalone/server.mjs" ]; then
  PORT="$WEB_PORT" HOSTNAME=0.0.0.0 node apps/web/standalone/server.mjs &
else
  echo "WARN: standalone no encontrado; fallback a 'pnpm -C apps/web start'"
  pnpm -C apps/web start -p "$WEB_PORT" --hostname 0.0.0.0 &
fi
WEB_PID=$!

wait -n "$API_PID" "$WEB_PID"
exit $?
