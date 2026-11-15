#!/usr/bin/env bash
# Receives one release of the built site over SSH and makes it live.
#
# Installed on the VPS as the forced command of a dedicated deploy key, so that key can do nothing else:
#   restrict,command="/home/ubuntu/thienlong/ci-deploy.sh" ssh-ed25519 AAAA... gh-actions-thienlong
#
# The CI job runs:   ssh deploy@host <40-char commit sha> < dist.tar.gz
# The sha arrives in SSH_ORIGINAL_COMMAND and the archive on stdin.
set -euo pipefail

SITE_ROOT="${SITE_ROOT:-/var/www/thienlong}"
KEEP="${KEEP:-5}"
MAX_BYTES="${MAX_BYTES:-209715200}" # 200 MB: refuse anything larger

sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "deploy: expected a full 40-character commit sha, got '${sha}'" >&2
  exit 2
fi

releases="$SITE_ROOT/releases"
target="$releases/$sha"
incoming="$(mktemp -d "$SITE_ROOT/.incoming.XXXXXX")"
trap 'rm -rf "$incoming"' EXIT
mkdir -p "$releases"

# Read at most MAX_BYTES + 1 so an oversized upload is detected rather than filling the disk.
head -c "$((MAX_BYTES + 1))" > "$incoming/site.tar.gz"
size="$(stat -c %s "$incoming/site.tar.gz")"
if (( size == 0 )); then echo "deploy: empty upload" >&2; exit 3; fi
if (( size > MAX_BYTES )); then echo "deploy: upload larger than ${MAX_BYTES} bytes" >&2; exit 3; fi

# Refuse absolute paths and anything that climbs out of the release directory.
if tar -tzf "$incoming/site.tar.gz" | grep -Eq '^/|(^|/)\.\.(/|$)'; then
  echo "deploy: archive contains unsafe paths" >&2
  exit 4
fi
# Only plain files and directories: nginx follows symlinks, so a link could publish any file on the server.
if tar -tvzf "$incoming/site.tar.gz" | grep -Evq '^[-d]'; then
  echo "deploy: archive contains links or special files" >&2
  exit 4
fi

mkdir "$incoming/site"
tar -xzf "$incoming/site.tar.gz" -C "$incoming/site" --no-same-owner --no-same-permissions
if [[ ! -f "$incoming/site/index.html" ]]; then
  echo "deploy: archive has no index.html at its top level" >&2
  exit 5
fi
chmod -R u=rwX,go=rX "$incoming/site"

rm -rf "$target"
mv "$incoming/site" "$target"
# Extraction keeps the archive's timestamps; stamp the release with the deploy time so "newest" means "last deployed".
touch "$target"

# Switch atomically: nginx serves $SITE_ROOT/current.
ln -sfn "$target" "$SITE_ROOT/current.new"
mv -Tf "$SITE_ROOT/current.new" "$SITE_ROOT/current"

# Keep the newest releases for rollback, never removing the live one.
mapfile -t old < <(ls -1dt "$releases"/*/ 2>/dev/null | tail -n "+$((KEEP + 1))")
for dir in "${old[@]}"; do
  dir="${dir%/}"
  [[ "$dir" == "$target" ]] || rm -rf "$dir"
done

echo "deploy: $sha is live ($(du -sh "$target" | cut -f1))"
