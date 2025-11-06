#!/usr/bin/env sh
set -euo pipefail

PRISMA_SCHEMA=${PRISMA_SCHEMA:-prisma/schema.prisma}
API_PORT=${API_PORT:-4000}
WEB_PORT=${PORT:-3000}

echo "==> DATABASE_URL: ${DATABASE_URL:-<no definida>}"
echo "==> Prisma schema: ${PRISMA_SCHEMA}"
echo "==> API_PORT: ${API_PORT} | WEB_PORT: ${WEB_PORT}"

echo "==> prisma generate (workspace)"
pnpm --filter ./packages/db exec prisma generate --schema "$PRISMA_SCHEMA" >/dev/null 2>&1 || true

echo "==> prisma migrate deploy"
pnpm --filter ./packages/db exec prisma migrate deploy --schema "$PRISMA_SCHEMA" || {
  echo "WARN: prisma migrate deploy falló; continuando…"
}

# API
echo "==> Iniciando API en :${API_PORT}"
PORT="$API_PORT" node apps/api/dist/index.js &
API_PID=$!

# Web
if [ -f "apps/web/standalone/server.js" ]; then
  echo "==> Iniciando Web (standalone) en :${WEB_PORT}"
  PORT="$WEB_PORT" node apps/web/standalone/server.js &
else
  echo "WARN: no hay standalone; fallback a 'pnpm -C apps/web start'"
  pnpm -C apps/web start -p "$WEB_PORT" &
fi
WEB_PID=$!

wait -n "$API_PID" "$WEB_PID"
exit $?