#!/usr/bin/env bash
# Deploy the Folia detail page (+ the matching mobile.js/css) to an Any Listen Plus server over SSH.
# Run ./build.sh first. The bundle hooks are installed separately with ../patches/apply.js.
#
# usage: SSH_HOST=root@your-server ./deploy.sh JSVER CSSVER      (the ?v= numbers nginx sub_filter injects)
#
# Env (defaults in brackets):
#   SSH_HOST    ssh target, e.g. root@your-server            (required)
#   WEB_DIR     dir nginx serves as /__m/                     [/opt/any-listen-mobile]
#   NGINX_SITE  nginx site file holding the mobile.js/css tags [/etc/nginx/sites-enabled/your-domain]
#   BACKUP_DIR  first-deploy backups (never overwritten)      [/root/backup-folia]
set -euo pipefail
cd "$(dirname "$0")"
: "${SSH_HOST:?set SSH_HOST=user@host}"
WEB_DIR=${WEB_DIR:-/opt/any-listen-mobile}
NGINX_SITE=${NGINX_SITE:-/etc/nginx/sites-enabled/your-domain}
BACKUP_DIR=${BACKUP_DIR:-/root/backup-folia}
JV=${1:?JSVER}; CV=${2:?CSSVER}
[ -f dist/folia-player.js ] || { echo "dist/ missing, run ./build.sh first" >&2; exit 1; }

ST=$(mktemp -d); trap 'rm -rf "$ST"' EXIT
mkdir -p "$ST/m"; cp ../web/mobile.js ../web/mobile.css "$ST/m/"; cp -r dist "$ST/m/folia"
# self-hosted Noto Serif SC (Folia lyrics font), fetched once into fonts/ and shipped under /__m/folia/fonts/
mkdir -p fonts "$ST/m/folia/fonts"; for w in 400 500; do f=noto-serif-sc-chinese-simplified-$w-normal.woff2; [ -s "fonts/$f" ] || curl -fsSL -o "fonts/$f" "https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5.2.9/files/$f"; cp "fonts/$f" "$ST/m/folia/fonts/"; done
rm -f "$ST"/m/folia/*.map "$ST"/m/folia/chunks/*.map
(cd "$ST" && tar czf m.tgz m)
scp -q "$ST/m.tgz" "$SSH_HOST:/tmp/folia-m.tgz"

ssh "$SSH_HOST" WEB_DIR="$WEB_DIR" NGINX_SITE="$NGINX_SITE" B="$BACKUP_DIR" JV="$JV" CV="$CV" bash -s <<'REMOTE'
set -e
mkdir -p "$B"
[ -f "$B/mobile.js" ] || cp -a "$WEB_DIR/mobile.js" "$WEB_DIR/mobile.css" "$B/" 2>/dev/null || true
[ -f "$B/site.nginx" ] || cp -a "$NGINX_SITE" "$B/site.nginx"
rm -rf /tmp/folia-m && mkdir /tmp/folia-m && tar xzf /tmp/folia-m.tgz -C /tmp/folia-m
rm -rf "$WEB_DIR/folia.new" && cp -r /tmp/folia-m/m/folia "$WEB_DIR/folia.new"
rm -rf "$WEB_DIR/folia.old"; [ -d "$WEB_DIR/folia" ] && mv "$WEB_DIR/folia" "$WEB_DIR/folia.old"
mv "$WEB_DIR/folia.new" "$WEB_DIR/folia"; rm -rf "$WEB_DIR/folia.old"
cp /tmp/folia-m/m/mobile.js /tmp/folia-m/m/mobile.css "$WEB_DIR/"
chmod -R a+rX "$WEB_DIR"
sed -i -E "s#mobile\.css\?v=[0-9]+#mobile.css?v=$CV#; s#mobile\.js\?v=[0-9]+#mobile.js?v=$JV#" "$NGINX_SITE"
if nginx -t 2>/dev/null; then systemctl reload nginx; echo "nginx reloaded"
else echo "nginx -t FAILED, restoring site file"; cp -a "$B/site.nginx" "$NGINX_SITE"; nginx -t && systemctl reload nginx; exit 4; fi
grep -o 'mobile\.[a-z]*?v=[0-9]*' "$NGINX_SITE" || true
du -sh "$WEB_DIR/folia"
REMOTE
echo "deployed. If a CDN sits in front, purge /__m/* for your domain."
