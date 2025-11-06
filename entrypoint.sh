#!/usr/bin/env sh
set -euo pipefail

# === Config ===
PRISMA_SCHEMA=${PRISMA_SCHEMA:-prisma/schema.prisma}  # relativo a packages/db
API_PORT=${API_PORT:-4000}
WEB_PORT=${PORT:-3000}

echo "==> DATABASE_URL: ${DATABASE_URL:-<no definida>}"
echo "==> Prisma schema: ${PRISMA_SCHEMA}"
echo "==> API_PORT: ${API_PORT} | WEB_PORT: ${WEB_PORT}"

# === Prisma (no rompe si falla generate en runtime) ===
echo "==> prisma generate (workspace)"
pnpm --filter ./packages/db exec prisma generate --schema "$PRISMA_SCHEMA" >/dev/null 2>&1 || true

echo "==> prisma migrate deploy"
if ! pnpm --filter ./packages/db exec prisma migrate deploy --schema "$PRISMA_SCHEMA"; then
  echo "WARN: prisma migrate deploy falló (¿DATABASE_URL faltante o DB inaccesible?). Continuando…"
fi

# === API ===
echo "==> Iniciando API en :${API_PORT}"
PORT="$API_PORT" node apps/api/dist/index.js &
API_PID=$!

# === Web (Next.js standalone) ===
# Copias en la imagen:
#   - apps/web/standalone (desde .next/standalone)
#   - apps/web/.next/static
#   - apps/web/public
WEB_SERVER="apps/web/standalone/server.js"
echo "==> Iniciando Web en :${WEB_PORT}"
if [ -f "$WEB_SERVER" ]; then
  # Recomendado por Next para standalone:
  HOSTNAME="0.0.0.0" PORT="$WEB_PORT" node "$WEB_SERVER" &
else
  echo "WARN: no se encontró $WEB_SERVER; usando fallback 'pnpm -C apps/web start'"
  pnpm -C apps/web start -p "$WEB_PORT" &
fi
WEB_PID=$!

# === Orquestación: si uno cae, salir ===
wait -n "$API_PID" "$WEB_PID"
exit $?