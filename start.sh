#!/usr/bin/env bash
# Levanta Modela en local.
#
#   ./start.sh          arranca el editor en http://localhost:3002
#   ./start.sh --check   solo comprueba el entorno y sale
#
# Idempotente: se puede ejecutar las veces que haga falta.

set -euo pipefail

cd "$(dirname "$0")"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; DIM=$'\033[2m'; OFF=$'\033[0m'

ok()   { echo "${GREEN}✓${OFF} $1"; }
warn() { echo "${YELLOW}!${OFF} $1"; }
die()  { echo "${RED}✗${OFF} $1" >&2; exit 1; }

echo
echo "  Modela — editor arquitectónico con copiloto de IA"
echo "  ${DIM}$(pwd)${OFF}"
echo

# ── bun ──────────────────────────────────────────────────────────────────────
# El repo usa bun como package manager (bun.lock, bun test). npm no vale.
if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.local/bin/bun" ]; then
    export PATH="$HOME/.local/bin:$PATH"
  elif [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  else
    die "bun no está instalado. Instálalo con:  npm i -g --allow-scripts=bun bun"
  fi
fi
ok "bun $(bun --version)"

# ── node ─────────────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "node no está instalado (hace falta 20+)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "node $NODE_MAJOR es demasiado viejo, hace falta 20+"
ok "node $(node -v)"

# ── .env.local ───────────────────────────────────────────────────────────────
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  warn ".env.local creado desde .env.example — falta poner OPENROUTER_API_KEY"
  warn "consíguela en https://openrouter.ai/keys"
fi

if grep -qE '^OPENROUTER_API_KEY=.+' .env.local; then
  ok "OPENROUTER_API_KEY configurada"
  if grep -qE '^MODELA_AI_FREE_ONLY=(1|true)' .env.local; then
    ok "modo solo-gratis activo — el servidor rechaza modelos de pago"
  else
    warn "modo solo-gratis apagado: se aceptan modelos de pago"
  fi
else
  warn "sin OPENROUTER_API_KEY: el editor arranca, pero sin copiloto"
fi

# ── dependencias ─────────────────────────────────────────────────────────────
# bun.lock manda: si cambió respecto a la última instalación, reinstala.
LOCK_STAMP=".turbo/.start-sh-lock"
if [ ! -d node_modules ]; then
  echo "${DIM}instalando dependencias…${OFF}"
  bun install
  mkdir -p "$(dirname "$LOCK_STAMP")" && cp bun.lock "$LOCK_STAMP"
elif [ ! -f "$LOCK_STAMP" ] || ! cmp -s bun.lock "$LOCK_STAMP"; then
  echo "${DIM}bun.lock cambió, reinstalando…${OFF}"
  bun install
  mkdir -p "$(dirname "$LOCK_STAMP")" && cp bun.lock "$LOCK_STAMP"
fi
ok "dependencias listas"

if [ "${1:-}" = "--check" ]; then
  echo
  ok "entorno correcto"
  exit 0
fi

# ── arrancar ─────────────────────────────────────────────────────────────────
# `bun dev` encadena el build de los paquetes upstream vía turbo antes de Next.
echo
echo "  ${GREEN}→${OFF} http://localhost:${PORT:-3002}"
echo "  ${DIM}pestaña «Copilot» en la barra lateral · Ctrl+C para parar${OFF}"
echo

exec bun dev
