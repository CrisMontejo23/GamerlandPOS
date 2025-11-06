#!/usr/bin/env sh
set -euo pipefail

PRISMA_SCHEMA=${PRISMA_SCHEMA:-packages/db/prisma/schema.prisma}
API_PORT=${API_PORT:-4000}
WEB_PORT=${PORT:-3000}

echo "==> DATABASE_URL: ${DATABASE_URL:-<no definida>}"
echo "==> Prisma schema: ${PRISMA_SCHEMA}"
echo "==> API_PORT: ${API_PORT} | WEB_PORT: ${WEB_PORT}"

# Asegura Prisma Client (si la imagen se construyó sin DB, aquí no falla)
echo "==> prisma generate (workspace)"
pnpm --filter ./packages/db exec prisma generate --schema "$PRISMA_SCHEMA" >/dev/null 2>&1 || true

# Migraciones en producción
echo "==> prisma migrate deploy"
if ! pnpm --filter ./packages/db exec prisma migrate deploy --schema "$PRISMA_SCHEMA"; then
  echo "WARN: prisma migrate deploy falló (¿DATABASE_URL faltante o DB inaccesible?). Continuando…"
fi

# Arranca API (Express) en segundo plano
echo "==> Iniciando API en :${API_PORT}"
PORT="$API_PORT" node apps/api/dist/index.js &
API_PID=$!

# Arranca Web (Next.js) en primer plano
echo "==> Iniciando Web en :${WEB_PORT}"
pnpm -C apps/web start -p "$WEB_PORT" &
WEB_PID=$!

# Espera ambos procesos; si uno cae, salimos
wait -n "$API_PID" "$WEB_PID"
exit $?