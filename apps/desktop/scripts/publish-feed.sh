#!/usr/bin/env bash
set -euo pipefail

feed_arg=${1:?feed directory required}
stage_arg=${2:?stage directory required}

# Git Bash passes native Windows paths to scripts invoked by Node. Resolve both
# existing directories through Bash itself before enforcing containment; Linux
# production paths remain unchanged and symlink escapes are collapsed.
canonical_dir() {
  local path=$1
  if command -v cygpath >/dev/null 2>&1 && [[ "$path" =~ ^[A-Za-z]:\\ ]]; then
    path=$(cygpath -u "$path")
  fi
  cd "$path" && pwd -P
}
feed_dir=$(canonical_dir "$feed_arg")
stage_dir=$(canonical_dir "$stage_arg")

case "$stage_dir" in
  "$feed_dir"/.incoming/*) ;;
  *) echo "unsafe stage directory: $stage_dir" >&2; exit 1 ;;
esac
stage_validated=true

lock_dir="$feed_dir/.publish.lock.d"
lock_mode=none
cleanup_lock() {
  if [[ "$lock_mode" == mkdir ]]; then
    rm -f "$lock_dir/pid"
    rmdir "$lock_dir" 2>/dev/null || true
  fi
}
cleanup() {
  local status=$?
  trap - EXIT
  cleanup_lock
  # Only a canonical stage proven to be inside this feed's .incoming directory
  # may be removed. This runs on validation, locking, hash, semver, and move
  # failures so a rejected publication cannot accumulate staged release bytes.
  if [[ "$stage_validated" == true && -d "$stage_dir" ]]; then
    rm -rf -- "$stage_dir"
  fi
  exit "$status"
}
trap cleanup EXIT

if command -v flock >/dev/null 2>&1; then
  # Kernel-owned advisory locks disappear on SIGKILL and reboot; the lock file
  # itself is intentionally persistent and cannot wedge future publications.
  exec 9>"$feed_dir/.publish.lock"
  if ! flock -n 9; then
    echo "another feed publication is already in progress" >&2
    exit 1
  fi
  lock_mode=flock
elif [[ "${CHATGOOSE_ALLOW_PORTABLE_LOCK_FALLBACK:-}" == 1 ]]; then
  # Portable fallback for local macOS/Git-Bash verification. Reclaim an owner
  # whose process no longer exists instead of trusting a permanent mkdir.
  if ! mkdir "$lock_dir" 2>/dev/null; then
    owner=$(cat "$lock_dir/pid" 2>/dev/null || true)
    if [[ "$owner" =~ ^[0-9]+$ ]] && kill -0 "$owner" 2>/dev/null; then
      echo "another feed publication is already in progress" >&2
      exit 1
    fi
    rm -f "$lock_dir/pid"
    if ! rmdir "$lock_dir" 2>/dev/null || ! mkdir "$lock_dir" 2>/dev/null; then
      echo "could not reclaim stale feed publication lock" >&2
      exit 1
    fi
  fi
  printf '%s\n' "$$" > "$lock_dir/pid"
  lock_mode=mkdir
else
  echo "flock is required for production feed publication" >&2
  exit 1
fi

version_is_greater() {
  local candidate_major candidate_minor candidate_patch
  local current_major current_minor current_patch
  IFS=. read -r candidate_major candidate_minor candidate_patch <<<"$1"
  IFS=. read -r current_major current_minor current_patch <<<"$2"

  if (( candidate_major != current_major )); then
    (( candidate_major > current_major ))
  elif (( candidate_minor != current_minor )); then
    (( candidate_minor > current_minor ))
  else
    (( candidate_patch > current_patch ))
  fi
}

manifest="$stage_dir/latest.yml"
test -f "$manifest"
new_version=$(awk '/^version:/ { print $2; exit }' "$manifest" | tr -d '\r')
artifact=$(awk '/^path:/ { print $2; exit }' "$manifest" | tr -d '\r')
expected_sha=$(awk '/^sha512:/ { print $2; exit }' "$manifest" | tr -d '\r')

case "$new_version" in
  ''|*[!0-9.]*) echo "invalid staged version: $new_version" >&2; exit 1 ;;
esac
if ! [[ "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "only stable semver releases are publishable: $new_version" >&2
  exit 1
fi
if [[ "$artifact" != "ChatGoose-Setup-$new_version.exe" ]]; then
  echo "manifest artifact does not match version: $artifact" >&2
  exit 1
fi
test -f "$stage_dir/$artifact"
test -f "$stage_dir/$artifact.blockmap"

actual_sha=$(openssl dgst -sha512 -binary "$stage_dir/$artifact" | openssl base64 -A)
if [[ "$actual_sha" != "$expected_sha" ]]; then
  echo "staged installer SHA-512 does not match latest.yml" >&2
  exit 1
fi

if [[ -f "$feed_dir/latest.yml" ]]; then
  current_version=$(awk '/^version:/ { print $2; exit }' "$feed_dir/latest.yml" | tr -d '\r')
  if ! [[ "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "current feed version is invalid: $current_version" >&2
    exit 1
  fi
  if [[ "$new_version" == "$current_version" ]]; then
    # An SSH acknowledgement or post-publish probe can be lost after the
    # atomic rename succeeded. Retrying the same tag is a safe successful no-op
    # only when every client-visible byte is already identical.
    if [[ -f "$feed_dir/$artifact" && -f "$feed_dir/$artifact.blockmap" ]] \
      && cmp -s "$manifest" "$feed_dir/latest.yml" \
      && cmp -s "$stage_dir/$artifact.blockmap" "$feed_dir/$artifact.blockmap" \
      && [[ "$(openssl dgst -sha512 -binary "$feed_dir/$artifact" | openssl base64 -A)" == "$expected_sha" ]]; then
      rm -f "$stage_dir/$artifact" "$stage_dir/$artifact.blockmap" "$manifest"
      rmdir "$stage_dir"
      echo "already published version=$new_version artifact=$artifact sha512=$actual_sha"
      exit 0
    fi
    echo "refusing conflicting equal-version publication: current=$current_version candidate=$new_version" >&2
    exit 1
  fi
  if ! version_is_greater "$new_version" "$current_version"; then
    echo "refusing non-increasing feed publication: current=$current_version candidate=$new_version" >&2
    exit 1
  fi
fi

# Assets have versioned names and are moved into place before the manifest.
# The final same-filesystem rename is the single atomic client-visible switch.
mv "$stage_dir/$artifact" "$feed_dir/$artifact"
mv "$stage_dir/$artifact.blockmap" "$feed_dir/$artifact.blockmap"
manifest_tmp="$feed_dir/.latest.yml.$$.tmp"
mv "$manifest" "$manifest_tmp"
mv "$manifest_tmp" "$feed_dir/latest.yml"
rmdir "$stage_dir"

echo "published version=$new_version artifact=$artifact sha512=$actual_sha"
