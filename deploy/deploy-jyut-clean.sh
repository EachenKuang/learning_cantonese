#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

export PATH="${PATH:-}:/usr/local/bin:/usr/bin:/bin"

REPO="${REPO:-git@github.com:EachenKuang/learning_cantonese.git}"
BRANCH="${BRANCH:-main}"
SITE_URL="${SITE_URL:-https://jyut.kuangyichen.com}"
STATIC_BASE="${STATIC_BASE:-/var/www/jyut-releases}"
STATIC_LIVE="${STATIC_LIVE:-/var/www/jyut-live}"
SYNC_BASE="${SYNC_BASE:-/opt/jyut-sync-releases}"
SYNC_LIVE="${SYNC_LIVE:-/opt/jyut-sync-live}"
TTS_BASE="${TTS_BASE:-/opt/jyut-tts-releases}"
TTS_LIVE="${TTS_LIVE:-/opt/jyut-tts-live}"
STATE_DIR="${STATE_DIR:-/var/lib/jyut-deploy}"
LOCK_FILE="${LOCK_FILE:-/tmp/jyut-clean-deploy.lock}"
NGINX_BIN="${NGINX_BIN:-/usr/local/nginx/sbin/nginx}"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
NPM_BIN="${NPM_BIN:-/usr/local/bin/npm}"
TARGET_COMMIT="${1:-}"

if [[ ! "$TARGET_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: $0 <40-character commit>" >&2
  exit 2
fi

install -d -m 0755 "$STATIC_BASE" "$SYNC_BASE" "$TTS_BASE"
install -d -m 0700 "$STATE_DIR"
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
  echo "[$(date '+%F %T')] Jyut deploy already running"
  exit 0
fi

SOURCE_DIR="$(mktemp -d /var/tmp/jyut-source.XXXXXX)"
STATIC_STAGE=""
SYNC_STAGE=""
TTS_STAGE=""
OLD_STATIC="$(readlink -f "$STATIC_LIVE" 2>/dev/null || true)"
OLD_SYNC="$(readlink -f "$SYNC_LIVE" 2>/dev/null || true)"
OLD_TTS="$(readlink -f "$TTS_LIVE" 2>/dev/null || true)"
STATIC_SWITCHED=0
SYNC_SWITCHED=0
TTS_SWITCHED=0

cleanup(){
  for path in "$SOURCE_DIR" "$STATIC_STAGE" "$SYNC_STAGE" "$TTS_STAGE"; do
    case "$path" in
      /var/tmp/jyut-source.*|"$STATIC_BASE"/.stage.*|"$SYNC_BASE"/.stage.*|"$TTS_BASE"/.stage.*) rm -rf -- "$path" ;;
    esac
  done
}

switch_link(){
  local target="$1" live="$2" next="${2}.next"
  ln -sfn "$target" "$next"
  mv -Tf "$next" "$live"
}

wait_health(){
  local url="$1"
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 4 "$url" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}

rollback(){
  local status=$?
  trap - ERR
  set +e
  echo "[$(date '+%F %T')] deploy failed; rolling back"
  if [ "$STATIC_SWITCHED" -eq 1 ] && [[ "$OLD_STATIC" == "$STATIC_BASE"/* ]] && [ -d "$OLD_STATIC" ]; then
    switch_link "$OLD_STATIC" "$STATIC_LIVE"
  fi
  if [ "$SYNC_SWITCHED" -eq 1 ] && [[ "$OLD_SYNC" == "$SYNC_BASE"/* ]] && [ -d "$OLD_SYNC" ]; then
    switch_link "$OLD_SYNC" "$SYNC_LIVE"
    systemctl restart jyut-sync
  fi
  if [ "$TTS_SWITCHED" -eq 1 ] && [[ "$OLD_TTS" == "$TTS_BASE"/* ]] && [ -d "$OLD_TTS" ]; then
    switch_link "$OLD_TTS" "$TTS_LIVE"
    systemctl restart jyut-tts
  fi
  cleanup
  trap - EXIT
  exit "$status"
}
trap rollback ERR
trap cleanup EXIT

echo "[$(date '+%F %T')] fetching Jyut commit $TARGET_COMMIT"
git init -q "$SOURCE_DIR"
git -C "$SOURCE_DIR" remote add origin "$REPO"
git -C "$SOURCE_DIR" fetch -q --depth 1 origin "$TARGET_COMMIT"
git -C "$SOURCE_DIR" checkout -q --detach FETCH_HEAD
COMMIT="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
if [ "$COMMIT" != "$TARGET_COMMIT" ]; then
  echo "Fetched commit mismatch" >&2
  exit 1
fi

for file in index.html sw.js manifest.webmanifest css/style.css js/app.js js/data.js js/songs.js server/sync-server.mjs server/sync-store.mjs server/manage-user.mjs server/tts-proxy.mjs server/package.json server/package-lock.json; do
  test -f "$SOURCE_DIR/$file" || { echo "Missing required file: $file" >&2; exit 1; }
done

"$NODE_BIN" --check "$SOURCE_DIR/js/app.js"
"$NODE_BIN" --check "$SOURCE_DIR/js/data.js"
"$NODE_BIN" --check "$SOURCE_DIR/js/songs.js"
"$NODE_BIN" --check "$SOURCE_DIR/server/sync-server.mjs"
"$NODE_BIN" --check "$SOURCE_DIR/server/sync-store.mjs"
"$NODE_BIN" --check "$SOURCE_DIR/server/manage-user.mjs"
"$NODE_BIN" --check "$SOURCE_DIR/server/tts-proxy.mjs"

CACHE_VERSION="$(sed -n "s/^const CACHE = 'canto-shell-v\([0-9][0-9]*\)';$/\1/p" "$SOURCE_DIR/sw.js")"
if [ -z "$CACHE_VERSION" ]; then
  echo "Unable to resolve Service Worker cache version" >&2
  exit 1
fi
for asset in manifest.webmanifest css/style.css js/data.js js/songs.js js/app.js; do
  grep -Fq "$asset?v=$CACHE_VERSION" "$SOURCE_DIR/sw.js" || { echo "sw.js cache version mismatch: $asset" >&2; exit 1; }
done
for asset in manifest.webmanifest css/style.css js/data.js js/songs.js js/app.js; do
  grep -Fq "$asset?v=$CACHE_VERSION" "$SOURCE_DIR/index.html" || { echo "index.html cache version mismatch: $asset" >&2; exit 1; }
done

if [ "${VALIDATE_ONLY:-0}" = "1" ]; then
  trap - ERR
  echo "[$(date '+%F %T')] validation passed for $COMMIT cache=v$CACHE_VERSION"
  exit 0
fi

STATIC_RELEASE="$STATIC_BASE/$COMMIT"
if [ ! -d "$STATIC_RELEASE" ]; then
  STATIC_STAGE="$(mktemp -d "$STATIC_BASE/.stage.XXXXXX")"
  install -m 0644 "$SOURCE_DIR/index.html" "$SOURCE_DIR/sw.js" "$SOURCE_DIR/manifest.webmanifest" "$STATIC_STAGE/"
  cp -a "$SOURCE_DIR/css" "$SOURCE_DIR/js" "$SOURCE_DIR/icons" "$STATIC_STAGE/"
  mv "$STATIC_STAGE" "$STATIC_RELEASE"
  STATIC_STAGE=""
fi

SYNC_CHANGED=1
if [ -d "$SYNC_LIVE" ] && cmp -s "$SOURCE_DIR/server/sync-server.mjs" "$SYNC_LIVE/sync-server.mjs" && cmp -s "$SOURCE_DIR/server/sync-store.mjs" "$SYNC_LIVE/sync-store.mjs" && cmp -s "$SOURCE_DIR/server/manage-user.mjs" "$SYNC_LIVE/manage-user.mjs"; then
  SYNC_CHANGED=0
fi
SYNC_RELEASE="$OLD_SYNC"
if [ "$SYNC_CHANGED" -eq 1 ]; then
  SYNC_RELEASE="$SYNC_BASE/$COMMIT"
  if [ ! -d "$SYNC_RELEASE" ]; then
    SYNC_STAGE="$(mktemp -d "$SYNC_BASE/.stage.XXXXXX")"
    install -m 0644 "$SOURCE_DIR/server/sync-server.mjs" "$SOURCE_DIR/server/sync-store.mjs" "$SOURCE_DIR/server/manage-user.mjs" "$SOURCE_DIR/server/package.json" "$SYNC_STAGE/"
    mv "$SYNC_STAGE" "$SYNC_RELEASE"
    SYNC_STAGE=""
  fi
fi

TTS_CHANGED=1
if [ -d "$TTS_LIVE" ] && cmp -s "$SOURCE_DIR/server/tts-proxy.mjs" "$TTS_LIVE/tts-proxy.mjs" && cmp -s "$SOURCE_DIR/server/package-lock.json" "$TTS_LIVE/package-lock.json"; then
  TTS_CHANGED=0
fi
TTS_RELEASE="$OLD_TTS"
if [ "$TTS_CHANGED" -eq 1 ]; then
  TTS_RELEASE="$TTS_BASE/$COMMIT"
  if [ ! -d "$TTS_RELEASE" ]; then
    TTS_STAGE="$(mktemp -d "$TTS_BASE/.stage.XXXXXX")"
    install -m 0644 "$SOURCE_DIR/server/tts-proxy.mjs" "$SOURCE_DIR/server/package.json" "$SOURCE_DIR/server/package-lock.json" "$TTS_STAGE/"
    (cd "$TTS_STAGE" && "$NPM_BIN" ci --omit=dev --ignore-scripts --silent)
    mv "$TTS_STAGE" "$TTS_RELEASE"
    TTS_STAGE=""
  fi
fi

"$NGINX_BIN" -t

if [ "$SYNC_CHANGED" -eq 1 ]; then
  switch_link "$SYNC_RELEASE" "$SYNC_LIVE"
  SYNC_SWITCHED=1
  systemctl restart jyut-sync
  wait_health "http://127.0.0.1:8788/health"
fi
if [ "$TTS_CHANGED" -eq 1 ]; then
  switch_link "$TTS_RELEASE" "$TTS_LIVE"
  TTS_SWITCHED=1
  systemctl restart jyut-tts
  wait_health "http://127.0.0.1:8787/health"
fi

switch_link "$STATIC_RELEASE" "$STATIC_LIVE"
STATIC_SWITCHED=1

curl -fsS --retry 3 --retry-delay 1 --max-time 10 "$SITE_URL/?deploy=$COMMIT" -o "$SOURCE_DIR/live-index.html"
cmp -s "$SOURCE_DIR/index.html" "$SOURCE_DIR/live-index.html"
curl -fsS --retry 3 --retry-delay 1 --max-time 10 "$SITE_URL/api/account/health" >/dev/null
curl -fsS --retry 3 --retry-delay 1 --max-time 10 "$SITE_URL/api/tts/health" >/dev/null

METADATA_TMP="$STATE_DIR/release.json.$$.tmp"
cat > "$METADATA_TMP" <<JSON
{
  "commit": "$COMMIT",
  "branch": "$BRANCH",
  "source": "$REPO",
  "deployedAt": "$(date -Iseconds)",
  "staticRelease": "$STATIC_RELEASE",
  "syncRelease": "$SYNC_RELEASE",
  "ttsRelease": "$TTS_RELEASE",
  "syncChanged": $SYNC_CHANGED,
  "ttsChanged": $TTS_CHANGED
}
JSON
chmod 0600 "$METADATA_TMP"
mv -f "$METADATA_TMP" "$STATE_DIR/release.json"

trap - ERR
echo "[$(date '+%F %T')] deployed Jyut commit $COMMIT cache=v$CACHE_VERSION sync_changed=$SYNC_CHANGED tts_changed=$TTS_CHANGED"
echo "static_release=$STATIC_RELEASE"
echo "metadata=$STATE_DIR/release.json"
