#!/usr/bin/env bash
# Vestiaire 7 — démarrage en une commande.
# Lance le serveur local, le tunnel Cloudflare, teste Jev et ouvre le dashboard.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SERVER_PID=""
TUNNEL_PID=""
CAFFEINATE_PID=""
LOG_DIR="${TMPDIR:-/tmp}/vestiaire-7"
mkdir -p "$LOG_DIR"
SERVER_LOG="$LOG_DIR/server.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"
COOKIE_FILE="$LOG_DIR/admin.cookies"

say() {
  printf '%s\n' "$*"
}

die() {
  printf '\n✗ %s\n' "$*" >&2
  exit 1
}

cleanup() {
  trap - EXIT INT TERM
  say ""
  say "Arrêt de Vestiaire 7…"
  if [ -n "${TUNNEL_PID:-}" ]; then kill "$TUNNEL_PID" 2>/dev/null || true; fi
  if [ -n "${CAFFEINATE_PID:-}" ]; then kill "$CAFFEINATE_PID" 2>/dev/null || true; fi
  if [ -n "${SERVER_PID:-}" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  rm -f "$COOKIE_FILE"
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

say ""
say "  Vestiaire 7 — escape game handball"
say "  ---------------------------------"
say ""

# --- Node -----------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  die "Node.js est introuvable. Installe Node 24 ou plus (https://nodejs.org) puis relance ./start.sh."
fi
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 24 ]; then
  die "Node.js $(node -v) est trop ancien. Il faut Node 24 ou plus. Sur Mac : brew install node@24."
fi

if ! command -v npm >/dev/null 2>&1; then
  die "npm est introuvable. Réinstalle Node.js."
fi

if ! command -v curl >/dev/null 2>&1; then
  die "curl est introuvable. Il est nécessaire pour vérifier le serveur."
fi

# --- cloudflared ----------------------------------------------------------
if ! command -v cloudflared >/dev/null 2>&1; then
  if [ "$(uname -s)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    say "cloudflared n'est pas installé."
    if [ -t 0 ]; then
      read -r -p "L'installer maintenant avec Homebrew ? [O/n] " INSTALL_TUNNEL
      if [ "${INSTALL_TUNNEL:-O}" != "n" ] && [ "${INSTALL_TUNNEL:-O}" != "N" ]; then
        brew install cloudflared
      else
        die "cloudflared est requis pour donner un lien aux élèves."
      fi
    else
      die "Installe cloudflared : brew install cloudflared"
    fi
  else
    die "cloudflared est introuvable. Installe-le : https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  fi
fi

# --- .env -----------------------------------------------------------------
if [ ! -f .env ]; then
  say "Premier lancement : création du fichier .env."
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))")}"
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  JEV_API_KEY="${JEV_API_KEY:-}"
  if [ -t 0 ]; then
    read -r -s -p "Clé API Jev (laisser vide pour le mode local) : " JEV_INPUT
    say ""
    if [ -n "${JEV_INPUT:-}" ]; then JEV_API_KEY="$JEV_INPUT"; fi
  fi
  cat > .env <<EOF
PORT=4317
HOST=127.0.0.1
DATA_DIR=./data
ADMIN_PASSWORD=$ADMIN_PASSWORD
SESSION_SECRET=$SESSION_SECRET
PUBLIC_URL=
JEV_API_KEY=$JEV_API_KEY
JEV_MODEL=jev-1.13-free
JEV_ENABLED=true
RETENTION_DAYS=30
EOF
  chmod 600 .env
  say "Mot de passe professeur : $ADMIN_PASSWORD"
  say "Il est enregistré dans .env (modifiable)."
else
  ADMIN_PASSWORD="$(grep -E '^ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2- || true)"
  if [ -z "$ADMIN_PASSWORD" ]; then
    die "ADMIN_PASSWORD est absent de .env. Ajoute une ligne ADMIN_PASSWORD=ton_mot_de_passe."
  fi
fi

# --- Dépendances et build -------------------------------------------------
if [ ! -d node_modules ] || { [ -f package-lock.json ] && [ package-lock.json -nt node_modules ]; }; then
  say "Installation des dépendances…"
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
else
  say "Dépendances déjà installées."
fi

say "Construction de l'application…"
npm run build

# --- Port libre -----------------------------------------------------------
PORT="${PORT:-$(node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close();console.log(p);});")}"
HOST="127.0.0.1"

# --- Serveur --------------------------------------------------------------
say "Démarrage du serveur sur le port $PORT…"
NODE_ENV=production PORT="$PORT" HOST="$HOST" node dist/server.mjs >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

READY=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
    READY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  say "--- journal serveur ---"
  tail -50 "$SERVER_LOG" || true
  die "Le serveur n'a pas démarré."
fi

# --- Tunnel ---------------------------------------------------------------
say "Ouverture du tunnel public…"
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 60); do
  PUBLIC_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)"
  if [ -n "$PUBLIC_URL" ]; then break; fi
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [ -z "$PUBLIC_URL" ]; then
  say "--- journal tunnel ---"
  tail -50 "$TUNNEL_LOG" || true
  die "Le tunnel n'a pas fourni d'URL. Vérifie la connexion internet et cloudflared."
fi

# --- Mac éveillé ----------------------------------------------------------
if [ "$(uname -s)" = "Darwin" ] && command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu -w "$SERVER_PID" >/dev/null 2>&1 &
  CAFFEINATE_PID=$!
fi

# --- Test Jev -------------------------------------------------------------
JEV_STATUS="inconnu"
LOGIN_JSON="$(node -e "console.log(JSON.stringify({password: process.argv[1]}))" "$ADMIN_PASSWORD" 2>/dev/null || true)"
if [ -n "$LOGIN_JSON" ] && curl -fsS -c "$COOKIE_FILE" -H 'Content-Type: application/json' -d "$LOGIN_JSON" "http://127.0.0.1:$PORT/api/admin/login" >/dev/null 2>&1; then
  JEV_JSON="$(curl -fsS -b "$COOKIE_FILE" -X POST "http://127.0.0.1:$PORT/api/admin/preflight/jev" 2>/dev/null || true)"
  JEV_STATUS="$(printf '%s' "$JEV_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.health&&j.health.status?j.health.status:'inconnu')}catch{console.log('inconnu')}})" 2>/dev/null || echo "inconnu")"
fi
rm -f "$COOKIE_FILE"

case "$JEV_STATUS" in
  ok) JEV_LABEL="connecté" ;;
  local) JEV_LABEL="mode local (pas de clé)" ;;
  degraded) JEV_LABEL="dégradé — le filtre local prend le relais" ;;
  error) JEV_LABEL="indisponible — le filtre local prend le relais" ;;
  *) JEV_LABEL="statut inconnu" ;;
esac

ADMIN_URL="$PUBLIC_URL/admin"

say ""
say "  ✓ Backend connecté"
say "  ✓ Tunnel public : $PUBLIC_URL"
say "  ✓ Dashboard     : $ADMIN_URL"
say "  ✓ Jev           : $JEV_LABEL"
say "  ✓ Mot de passe  : $ADMIN_PASSWORD"
say ""
say "  Ouvre le dashboard, crée une partie, puis partage le lien"
say "  et le code d'accès affichés dans l'onglet Direct."
say ""
say "  Ctrl+C pour arrêter."
say ""

if [ "$(uname -s)" = "Darwin" ]; then
  open -a "Google Chrome" "$ADMIN_URL" >/dev/null 2>&1 || open "$ADMIN_URL" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$ADMIN_URL" >/dev/null 2>&1 || true
fi

while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$TUNNEL_PID" 2>/dev/null; do
  sleep 2
done
