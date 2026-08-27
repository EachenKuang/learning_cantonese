#!/usr/bin/env bash
set -euo pipefail

export PATH="${PATH:-}:/usr/local/bin:/usr/bin:/bin"

REPO="${REPO:-git@github.com:EachenKuang/learning_cantonese.git}"
DEPLOY_REF="${DEPLOY_REF:-refs/tags/ci-ok}"
LIVE_RELEASE="${LIVE_RELEASE:-/var/lib/jyut-deploy/release.json}"
LOCK_FILE="${LOCK_FILE:-/tmp/jyut-deploy-check.lock}"
DEPLOY="${DEPLOY:-/opt/scripts/deploy-jyut-clean.sh}"

exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1 && ! flock -n 9; then
  exit 0
fi

REMOTE_COMMIT="$(git ls-remote "$REPO" "$DEPLOY_REF" | awk 'NR==1{print $1}')"
if [[ ! "$REMOTE_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[$(date '+%F %T')] unable to resolve $REPO $DEPLOY_REF" >&2
  exit 1
fi

LIVE_COMMIT=""
if [ -f "$LIVE_RELEASE" ]; then
  LIVE_COMMIT="$(grep -o '"commit"[[:space:]]*:[[:space:]]*"[0-9a-f]*"' "$LIVE_RELEASE" | head -1 | sed 's/.*"\([0-9a-f]*\)"/\1/' || true)"
fi

if [ "$REMOTE_COMMIT" = "$LIVE_COMMIT" ]; then
  echo "[$(date '+%F %T')] no deploy needed: $LIVE_COMMIT"
  exit 0
fi

echo "[$(date '+%F %T')] deploying approved_ref=$DEPLOY_REF remote=$REMOTE_COMMIT live=${LIVE_COMMIT:-none}"
APPROVED_REF="$DEPLOY_REF" "$DEPLOY" "$REMOTE_COMMIT"
