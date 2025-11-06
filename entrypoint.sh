#!/usr/bin/env sh
set -euo pipefail

PRISMA_SCHEMA=${PRISMA_SCHEMA:-prisma/schema.prisma}
API_PORT=${API_PORT:-4000}
WEB_PORT=${PORT:-3000}
export HOSTNAME=0.0.0.0

echo "==> DATABASE_URL: ${DATABASE_URL:-<no definida>}"
echo "==> Prisma schema: ${PRISMA_SCHEMA}"
echo "==> API_PORT: ${API_PORT} | WEB_PORT: ${WEB_PORT}"

echo "==> prisma generate (workspace)"
pnpm --filter ./packages/db exec prisma generate --schema "$PRISMA_SCHEMA" >/dev/null 2>&1 || true

echo "==> prisma migrate deploy"
pnpm --filter ./packages/db exec prisma migrate deploy --schema "$PRISMA_SCHEMA" || {
  echo "WARN: migrate deploy falló (DB no accesible?). Continúo…"
}

echo "==> Iniciando API en :${API_PORT}"
PORT="$API_PORT" node apps/api/dist/index.js &
API_PID=$!

echo "==> Iniciando Web en :${WEB_PORT}"
if [ -f "apps/web/standalone/server.js" ]; then
  echo "Usando Next standalone: apps/web/standalone/server.js"
  node apps/web/standalone/server.js -p "$WEB_PORT" -H 0.0.0.0 &
else
  echo "WARN: no hay standalone; fallback a 'pnpm -C apps/web start'"
  pnpm -C apps/web start -p "$WEB_PORT" --hostname 0.0.0.0 &
fi
WEB_PID=$!

wait -n "$API_PID" "$WEB_PID"
exit $?
