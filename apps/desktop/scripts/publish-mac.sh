#!/usr/bin/env bash
set -euo pipefail

# Publishes the macOS DMG to the public download page
# (https://ext.gosling-agency.ru/desktop/). Runs on the owner's Mac from the
# repo root:
#
#   apps/desktop/scripts/publish-mac.sh [--skip-build]
#
# macOS has no auto-update (unsigned builds can't — Squirrel.Mac requirement),
# so the page IS the mac distribution channel; re-run this after each release
# that mac users should get. The Windows half of the page is refreshed
# automatically by CI (publish-feed.sh).
#
# Steps: build (unless --skip-build) → mount the DMG and run the packaged
# app's --smoke gate (fail-closed: a DMG that can't boot never ships) → upload
# versioned DMG → atomic symlink + version-mac.json swap → retention (keep 3)
# → HTTPS postcheck.

readonly VPS=root@45.8.230.111
readonly PUBLIC_DIR=/var/www/ext/desktop
readonly PUBLIC_URL=https://ext.gosling-agency.ru/desktop
readonly PUBLIC_OWNER=cgupdates
readonly KEEP_DMGS=3

if [[ "$(uname)" != Darwin ]]; then
  echo "publish-mac.sh must run on macOS (builds and smoke-tests the DMG)" >&2
  exit 1
fi
if [[ ! -f apps/desktop/package.json ]]; then
  echo "run from the repo root" >&2
  exit 1
fi

skip_build=false
if [[ "${1:-}" == --skip-build ]]; then
  skip_build=true
  shift
fi
if (( $# != 0 )); then
  echo "usage: apps/desktop/scripts/publish-mac.sh [--skip-build]" >&2
  exit 2
fi

version=$(node -p "require('./apps/desktop/package.json').version")
dmg_name="ChatGoose-$version-mac-arm64.dmg"
dmg="apps/desktop/release/$dmg_name"

if [[ "$skip_build" == false ]]; then
  pnpm dist:mac
fi
if [[ ! -f "$dmg" ]]; then
  echo "missing $dmg — build it first (or drop --skip-build)" >&2
  exit 1
fi

# Fail-closed smoke: the packaged app from THIS dmg must boot on a throwaway
# profile before anything reaches the page.
volume="/Volumes/ChatGoose $version-arm64"
detach() { hdiutil detach "$volume" -quiet 2>/dev/null || true; }
trap detach EXIT
hdiutil attach "$dmg" -nobrowse -quiet
"$volume/ChatGoose.app/Contents/MacOS/ChatGoose" --smoke
detach
trap - EXIT
echo "smoke OK version=$version"

size=$(wc -c < "$dmg" | tr -d '[:space:]')

# Upload to a temp name, then let the server do the atomic renames as the
# page's owner user. Retention runs under the same shell: keep the newest
# KEEP_DMGS versioned DMGs (the fresh upload is always among them).
scp -o BatchMode=yes "$dmg" "$VPS:$PUBLIC_DIR/.upload-$dmg_name.tmp"
ssh -o BatchMode=yes "$VPS" "set -euo pipefail
  cd '$PUBLIC_DIR'
  mv -f '.upload-$dmg_name.tmp' '$dmg_name'
  ln -sfn '$dmg_name' '.latest-mac.tmp'
  mv -f '.latest-mac.tmp' 'ChatGoose-latest-mac-arm64.dmg'
  printf '{\"version\":\"%s\",\"size\":%s}\n' '$version' '$size' > '.version-mac.json.tmp'
  mv -f '.version-mac.json.tmp' 'version-mac.json'
  chown -h '$PUBLIC_OWNER:$PUBLIC_OWNER' 'ChatGoose-latest-mac-arm64.dmg'
  chown '$PUBLIC_OWNER:$PUBLIC_OWNER' '$dmg_name' 'version-mac.json'
  ls -1 ChatGoose-*-mac-arm64.dmg | grep -v '^ChatGoose-latest-' | sort -V | head -n -$KEEP_DMGS | xargs -r rm -f --
  echo 'server-side publish done'"

# Postcheck through the real URL: the page must serve this version's bytes.
curl --fail --silent --show-error --range 0-1023 --output /dev/null "$PUBLIC_URL/ChatGoose-latest-mac-arm64.dmg"
served=$(curl --fail --silent --show-error "$PUBLIC_URL/version-mac.json")
if [[ "$served" != *"\"version\":\"$version\""* ]]; then
  echo "postcheck FAILED: served version-mac.json=$served expected version=$version" >&2
  exit 1
fi
echo "published mac $version → $PUBLIC_URL/"
