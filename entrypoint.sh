#!/usr/bin/env sh
set -euo pipefail

PRISMA_SCHEMA=${PRISMA_SCHEMA:-prisma/schema.prisma}
API_PORT=${API_PORT:-4000}
WEB_PORT=${PORT:-3000}
export HOSTNAME=0.0.0.0

echo "==> DATABASE_URL: ${DATABASE_URL:-<no definida>}"
echo "==> Prisma schema: ${PRISMA_SCHEMA}"
echo "==> API_PORT: ${API_PORT} | WEB_PORT: ${WEB_PORT}"

# Migraciones (usa el CLI local de la API)
if [ -x "./apps/api/node_modules/.bin/prisma" ]; then
  echo "==> prisma migrate deploy"
  ./apps/api/node_modules/.bin/prisma migrate deploy --schema "$PRISMA_SCHEMA" || {
    echo "WARN: migrate deploy falló (DB no accesible?). Continúo…"
  }
else
  echo "WARN: Prisma CLI no encontrado en ./apps/api/node_modules/.bin/prisma"
fi

# Inicia API
echo "==> Iniciando API en :${API_PORT}"
PORT="$API_PORT" node apps/api/dist/index.js &
API_PID=$!

# Inicia Web (standalone)
SERVER="apps/web/standalone/server.js"
if [ ! -f "$SERVER" ]; then
  echo "ERROR: No se encontró $SERVER. Revisa output:'standalone' y el build de Next."
  kill "$API_PID" >/dev/null 2>&1 || true
  exit 1
fi

echo "==> Iniciando Web (standalone) en :${WEB_PORT}"
PORT="$WEB_PORT" node "$SERVER" -p "$WEB_PORT" -H 0.0.0.0 &
WEB_PID=$!

wait -n "$API_PID" "$WEB_PID"
exit $?