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
# versioned DMG → locked monotonic retention + public switch → exact HTTPS hash
# postcheck.

readonly VPS=root@152.53.191.242
readonly PUBLIC_DIR=/var/www/ext/desktop
readonly PUBLIC_URL=https://ext.gosling-agency.ru/desktop
readonly PUBLIC_OWNER=cgupdates
readonly KEEP_DMGS=3
readonly REMOTE_PUBLISHER=apps/desktop/scripts/publish-mac-remote.sh

if [[ "$(uname)" != Darwin ]]; then
  echo "publish-mac.sh must run on macOS (builds and smoke-tests the DMG)" >&2
  exit 1
fi
if [[ ! -f apps/desktop/package.json ]]; then
  echo "run from the repo root" >&2
  exit 1
fi
if [[ ! -f "$REMOTE_PUBLISHER" ]]; then
  echo "missing $REMOTE_PUBLISHER" >&2
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
if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "only a stable X.Y.Z package version can be published: $version" >&2
  exit 1
fi

# A public build is an immutable release artifact, not a snapshot of whichever
# checkout happens to be open. Require the exact clean release tag before the
# build (or reuse) so post-tag/dirty code cannot replace official same-version
# bytes.
expected_tag="v$version"
assert_release_checkout() {
  local head_commit tag_commit
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "refusing mac publication from a dirty worktree" >&2
    return 1
  fi
  head_commit=$(git rev-parse HEAD)
  if ! tag_commit=$(git rev-parse --verify "refs/tags/$expected_tag^{commit}" 2>/dev/null); then
    echo "release tag does not exist locally: $expected_tag (fetch tags first)" >&2
    return 1
  fi
  if [[ "$head_commit" != "$tag_commit" ]]; then
    echo "refusing mac publication: HEAD is not exact tag $expected_tag" >&2
    return 1
  fi
}
assert_release_checkout

dmg_name="ChatGoose-$version-mac-arm64.dmg"
dmg="apps/desktop/release/$dmg_name"
provenance="$dmg.publish-provenance"

if [[ "$skip_build" == false ]]; then
  # Do not let electron-builder's output cache bless bytes from an earlier
  # dirty/same-version build. A fresh run must create this exact artifact.
  rm -f -- "$dmg" "$provenance"
  pnpm dist:mac
fi
if [[ ! -f "$dmg" ]]; then
  echo "missing $dmg — build it first (or drop --skip-build)" >&2
  exit 1
fi
# Recheck after the build as well: a lifecycle script or concurrent edit must
# not make the artifact's source differ from the tag we validated above.
assert_release_checkout

size=$(wc -c < "$dmg" | tr -d '[:space:]')
sha512=$(openssl dgst -sha512 -binary "$dmg" | openssl base64 -A)
release_commit=$(git rev-parse HEAD)
provenance_record="commit=$release_commit sha512=$sha512 size=$size"
if [[ "$skip_build" == true ]]; then
  if [[ ! -f "$provenance" ]]; then
    echo "refusing --skip-build: DMG lacks matching clean-tag provenance; rebuild it" >&2
    exit 1
  fi
  actual_provenance=$(<"$provenance")
  if [[ "$actual_provenance" != "$provenance_record" ]]; then
    echo "refusing --skip-build: DMG lacks matching clean-tag provenance; rebuild it" >&2
    exit 1
  fi
else
  provenance_tmp="$provenance.$$.tmp"
  printf '%s\n' "$provenance_record" > "$provenance_tmp"
  mv -f "$provenance_tmp" "$provenance"
fi

# Fail-closed smoke: mount THIS DMG at a unique path, so an already-mounted
# image with the same volume title can never be mistaken for the candidate.
mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/chatgoose-publish-mac.XXXXXX")
detach() {
  hdiutil detach "$mount_dir" -quiet 2>/dev/null || true
  rmdir "$mount_dir" 2>/dev/null || true
}
trap detach EXIT
hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" -quiet "$dmg"
smoke_binary="$mount_dir/ChatGoose.app/Contents/MacOS/ChatGoose"
if [[ ! -x "$smoke_binary" ]]; then
  echo "mounted DMG does not contain the ChatGoose executable" >&2
  exit 1
fi
"$smoke_binary" --smoke
if ! hdiutil detach "$mount_dir" -quiet; then
  echo "could not detach the candidate DMG after smoke" >&2
  exit 1
fi
rmdir "$mount_dir"
trap - EXIT
echo "smoke OK version=$version"

# Upload to a unique staging name. The streamed server-side publisher validates
# its exact bytes, acquires the channel lock, rejects downgrades/conflicting
# equal versions, bounds retention while protecting old+new selected targets,
# then switches JSON+link. A cleanup trap also covers failures before remote
# Bash starts.
stage_name=".upload-$dmg_name.$(date +%s)-$$.tmp"
ssh_options=(
  -o BatchMode=yes
  -o ConnectTimeout=10
  -o ConnectionAttempts=2
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=2
)
stage_uploaded=false
cleanup_remote_stage() {
  ssh "${ssh_options[@]}" "$VPS" \
    "case '$stage_name' in '.upload-ChatGoose-$version-mac-arm64.dmg.'*.tmp) rm -f -- '$PUBLIC_DIR/$stage_name' ;; *) exit 2 ;; esac"
}
cleanup_publish() {
  local status=$?
  trap - EXIT
  if [[ "$stage_uploaded" == true ]]; then
    cleanup_remote_stage || echo "warning: could not confirm cleanup of remote mac stage $stage_name" >&2
  fi
  exit "$status"
}
trap cleanup_publish EXIT

scp "${ssh_options[@]}" "$dmg" "$VPS:$PUBLIC_DIR/$stage_name"
stage_uploaded=true
publish_ack=true
if ! ssh "${ssh_options[@]}" "$VPS" \
  "bash -s -- '$PUBLIC_DIR' '$stage_name' '$version' '$sha512' '$size' '$PUBLIC_OWNER' '$KEEP_DMGS'" \
  < "$REMOTE_PUBLISHER"; then
  # The server may have committed before the SSH acknowledgement was lost.
  # The exact HTTPS checks below decide whether this is success or failure.
  publish_ack=false
fi

if cleanup_remote_stage; then
  stage_uploaded=false
else
  echo "warning: could not confirm cleanup of remote mac stage $stage_name" >&2
fi

# Postcheck through the real URL: JSON and every served DMG byte must be this
# release. This also safely resolves an ambiguous lost SSH acknowledgement.
served=$(curl --fail --silent --show-error --header 'Cache-Control: no-cache' "$PUBLIC_URL/version-mac.json")
expected_json="{\"version\":\"$version\",\"size\":$size}"
if [[ "$served" != "$expected_json" ]]; then
  echo "postcheck FAILED: served version-mac.json=$served expected=$expected_json" >&2
  exit 1
fi
# The page rewrites its button to this immutable URL after loading the JSON.
curl --fail --silent --show-error --header 'Cache-Control: no-cache' \
  --range 0-0 --output /dev/null "$PUBLIC_URL/$dmg_name"
served_sha=$(curl --fail --silent --show-error --header 'Cache-Control: no-cache' \
  "$PUBLIC_URL/ChatGoose-latest-mac-arm64.dmg" | openssl dgst -sha512 -binary | openssl base64 -A)
if [[ "$served_sha" != "$sha512" ]]; then
  echo "postcheck FAILED: served mac DMG SHA-512 does not match this release" >&2
  exit 1
fi
if [[ "$stage_uploaded" == true ]]; then
  if cleanup_remote_stage; then
    stage_uploaded=false
  else
    echo "publication is live, but the remote mac staging file could not be cleaned up" >&2
    exit 1
  fi
fi
if [[ "$publish_ack" != true ]]; then
  echo "warning: remote publisher returned no success acknowledgement, but the exact mac release is live" >&2
fi
trap - EXIT
echo "published mac $version → $PUBLIC_URL/"
