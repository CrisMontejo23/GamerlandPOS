#!/usr/bin/env sh
set -euo pipefail

# Variables
PRISMA_SCHEMA=${PRISMA_SCHEMA:-packages/db/prisma/schema.prisma}
API_PORT=${API_PORT:-4000}
WEB_PORT=${PORT:-3000}

echo "==> DATABASE_URL: ${DATABASE_URL:-<no definida>}"
echo "==> Prisma schema: ${PRISMA_SCHEMA}"
echo "==> API_PORT: ${API_PORT} | WEB_PORT: ${WEB_PORT}"

# Asegura Prisma Client (por si el build de la imagen se hizo sin acceso a la DB)
echo "==> prisma generate"
pnpm dlx prisma generate --schema "$PRISMA_SCHEMA" >/dev/null 2>&1 || true

# Ejecuta migraciones en producción (no bloqueante si no hay nuevas)
echo "==> prisma migrate deploy"
pnpm dlx prisma migrate deploy --schema "$PRISMA_SCHEMA" || {
  echo "WARN: prisma migrate deploy falló (quizá sin DB). Continuando…"
}

# Levanta API (Express) en segundo plano
echo "==> Iniciando API en :${API_PORT}"
# si tu index usa PORT env, pásalo:
PORT="$API_PORT" node apps/api/dist/index.js &
API_PID=$!

# Levanta Web (Next.js) en primer plano
echo "==> Iniciando Web en :${WEB_PORT}"
pnpm -C apps/web start -p "$WEB_PORT" & 
WEB_PID=$!

# Espera ambos procesos; si uno cae, salimos
wait -n $API_PID $WEB_PID
exit $?