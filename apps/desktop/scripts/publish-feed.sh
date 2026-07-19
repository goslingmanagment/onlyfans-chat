#!/usr/bin/env bash
set -euo pipefail

mode=publish
dry_run=false
stage_validated=false
stage_dir=
public_arg=

if [[ "${1:-}" == --maintain ]]; then
  mode=maintain
  shift
  feed_arg=${1:?feed directory required}
  shift
  if [[ "${1:-}" == --dry-run ]]; then
    dry_run=true
    shift
  fi
  if (( $# != 0 )); then
    echo "usage: publish-feed.sh --maintain <feed-dir> [--dry-run]" >&2
    exit 2
  fi
elif [[ "${1:-}" == --refresh-public ]]; then
  # Standalone repair mode: point the public download page at whatever
  # latest.yml currently references, without touching the feed.
  mode=refresh_public
  shift
  feed_arg=${1:?feed directory required}
  public_arg=${2:?public download directory required}
  if (( $# != 2 )); then
    echo "usage: publish-feed.sh --refresh-public <feed-dir> <public-dir>" >&2
    exit 2
  fi
else
  feed_arg=${1:?feed directory required}
  stage_arg=${2:?stage directory required}
  public_arg=${3:-}
  if (( $# < 2 || $# > 3 )); then
    echo "usage: publish-feed.sh <feed-dir> <stage-dir> [public-dir]" >&2
    exit 2
  fi
fi

keep_installers=${CHATGOOSE_FEED_KEEP_INSTALLERS:-3}
min_free_kib=${CHATGOOSE_FEED_MIN_FREE_KIB:-5242880}

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
public_dir=
if [[ -n "$public_arg" ]]; then
  if ! public_dir=$(canonical_dir "$public_arg"); then
    echo "public download directory does not exist: $public_arg" >&2
    exit 1
  fi
fi
if [[ "$mode" == publish ]]; then
  stage_dir=$(canonical_dir "$stage_arg")
  case "$stage_dir" in
    "$feed_dir"/.incoming/*) ;;
    *) echo "unsafe stage directory: $stage_dir" >&2; exit 1 ;;
  esac
  stage_validated=true
fi

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

if ! [[ "$keep_installers" =~ ^[0-9]+$ ]] || (( keep_installers < 2 )); then
  echo "CHATGOOSE_FEED_KEEP_INSTALLERS must be an integer of at least 2" >&2
  exit 2
fi
if ! [[ "$min_free_kib" =~ ^[0-9]+$ ]]; then
  echo "CHATGOOSE_FEED_MIN_FREE_KIB must be a non-negative integer" >&2
  exit 2
fi

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

current_version=
current_artifact=
load_current_manifest() {
  if [[ ! -f "$feed_dir/latest.yml" ]]; then
    return
  fi

  current_version=$(awk '/^version:/ { print $2; exit }' "$feed_dir/latest.yml" | tr -d '\r')
  current_artifact=$(awk '/^path:/ { print $2; exit }' "$feed_dir/latest.yml" | tr -d '\r')
  if ! [[ "$current_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "current feed version is invalid: $current_version" >&2
    exit 1
  fi
  if [[ "$current_artifact" != "ChatGoose-Setup-$current_version.exe" ]]; then
    echo "current feed artifact does not match version: $current_artifact" >&2
    exit 1
  fi
  if [[ ! -f "$feed_dir/$current_artifact" ]]; then
    echo "current latest.yml references a missing installer: $current_artifact" >&2
    exit 1
  fi
}

installer_version() {
  local name=${1##*/}
  if [[ "$name" =~ ^ChatGoose-Setup-([0-9]+)\.([0-9]+)\.([0-9]+)\.exe$ ]]; then
    printf '%s.%s.%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
    return 0
  fi
  return 1
}

# Point the public download page (ext site /desktop/) at the installer the
# current latest.yml references: swap the ChatGoose-Setup-latest.exe symlink
# atomically and rewrite version-win.json. The page's mac half has its own
# writer (publish-mac.sh) and its own file, so there is no shared JSON to
# parse or race on. Runs after the feed is already consistent — a failure
# here must be loud (stale page) but cannot corrupt the feed.
refresh_public() {
  local version artifact size link_tmp json_tmp
  # Do not rely on `set -e` here. The normal publication path calls this
  # function from an `if ! refresh_public` condition so it can print a targeted
  # repair message; Bash disables errexit inside functions used as conditions.
  # Every operation therefore propagates failure explicitly.
  version=$(awk '/^version:/ { print $2; exit }' "$feed_dir/latest.yml" | tr -d '\r') || return 1
  artifact=$(awk '/^path:/ { print $2; exit }' "$feed_dir/latest.yml" | tr -d '\r') || return 1
  if [[ ! -f "$feed_dir/$artifact" ]]; then
    echo "refresh-public: latest.yml references a missing installer: $artifact" >&2
    return 1
  fi
  if [[ -d "$public_dir/ChatGoose-Setup-latest.exe" || -d "$public_dir/version-win.json" ]]; then
    echo "refresh-public: destination path is a directory" >&2
    return 1
  fi
  size=$(wc -c < "$feed_dir/$artifact" | tr -d '[:space:]') || return 1
  rm -f "$public_dir"/.ChatGoose-Setup-latest.exe.*.tmp "$public_dir"/.version-win.json.*.tmp || return 1
  link_tmp="$public_dir/.ChatGoose-Setup-latest.exe.$$.tmp"
  ln -sfn "$feed_dir/$artifact" "$link_tmp" || return 1
  mv -f "$link_tmp" "$public_dir/ChatGoose-Setup-latest.exe" || return 1
  json_tmp="$public_dir/.version-win.json.$$.tmp"
  printf '{"version":"%s","size":%s}\n' "$version" "$size" > "$json_tmp" || return 1
  mv -f "$json_tmp" "$public_dir/version-win.json" || return 1
  echo "public download refreshed dir=$public_dir version=$version" || return 1
}

# Keep the installer referenced by latest.yml plus the newest remaining stable
# installers up to the configured total. Blockmaps are intentionally retained:
# electron-updater can use an old client's blockmap for a differential update,
# and those files are tiny relative to the installers being reclaimed.
retain_installers() {
  local target_count=$1
  local retention_dry_run=$2
  local other_slots=$target_count
  local installer other installer_name other_name version other_version rank
  local -a installers

  shopt -s nullglob
  installers=("$feed_dir"/ChatGoose-Setup-*.exe)
  shopt -u nullglob
  if [[ -n "$current_artifact" ]]; then
    other_slots=$((target_count - 1))
  fi

  for installer in "${installers[@]}"; do
    installer_name=${installer##*/}
    if ! version=$(installer_version "$installer"); then
      continue
    fi
    if [[ -n "$current_artifact" && "$installer_name" == "$current_artifact" ]]; then
      continue
    fi

    rank=1
    for other in "${installers[@]}"; do
      other_name=${other##*/}
      if [[ -n "$current_artifact" && "$other_name" == "$current_artifact" ]]; then
        continue
      fi
      if ! other_version=$(installer_version "$other"); then
        continue
      fi
      if version_is_greater "$other_version" "$version"; then
        rank=$((rank + 1))
      fi
    done

    if (( rank > other_slots )); then
      if [[ "$retention_dry_run" == true ]]; then
        echo "retention would remove installer=$installer_name"
      else
        rm -f -- "$installer"
        echo "retention removed installer=$installer_name"
      fi
    fi
  done
}

enforce_disk_floor() {
  local available_kib
  available_kib=$(df -Pk "$feed_dir" | awk 'NR == 2 { print $4; exit }')
  if ! [[ "$available_kib" =~ ^[0-9]+$ ]]; then
    echo "could not determine feed free space" >&2
    exit 1
  fi
  echo "feed free space available_kib=$available_kib minimum_kib=$min_free_kib"
  if (( available_kib < min_free_kib )); then
    echo "feed free space is below the required floor: available_kib=$available_kib minimum_kib=$min_free_kib" >&2
    exit 1
  fi
}

# A runner can die after scp but before its EXIT trap reaches the remote host.
# Reclaim only directories older than the workflow's hard 130-minute timeout,
# while holding the same publication lock. This must run before the disk-floor
# check: abandoned uploads may be the bytes that pushed the feed below it.
reclaim_stale_stages() {
  local reclaim_dry_run=$1
  local incoming="$feed_dir/.incoming"
  local stage
  if [[ ! -d "$incoming" ]]; then
    return
  fi
  while IFS= read -r -d '' stage; do
    if [[ "$reclaim_dry_run" == true ]]; then
      echo "maintenance would remove stale stage=${stage##*/}"
    else
      rm -rf -- "$stage"
      echo "maintenance removed stale stage=${stage##*/}"
    fi
  done < <(find "$incoming" -mindepth 1 -maxdepth 1 -type d -mmin +180 -print0)
}

load_current_manifest
if [[ "$mode" == maintain ]]; then
  reclaim_stale_stages "$dry_run"
  retain_installers "$keep_installers" "$dry_run"
  enforce_disk_floor
  echo "feed maintenance complete keep_installers=$keep_installers dry_run=$dry_run"
  exit 0
fi

if [[ "$mode" == refresh_public ]]; then
  refresh_public
  exit 0
fi

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

if [[ -n "$current_version" ]]; then
  if [[ "$new_version" == "$current_version" ]]; then
    # An SSH acknowledgement or post-publish probe can be lost after the
    # atomic rename succeeded. Retrying the same tag is a safe successful no-op
    # only when every client-visible byte is already identical.
    if [[ -f "$feed_dir/$artifact" && -f "$feed_dir/$artifact.blockmap" ]] \
      && cmp -s "$manifest" "$feed_dir/latest.yml" \
      && cmp -s "$stage_dir/$artifact.blockmap" "$feed_dir/$artifact.blockmap" \
      && [[ "$(openssl dgst -sha512 -binary "$feed_dir/$artifact" | openssl base64 -A)" == "$expected_sha" ]]; then
      retain_installers "$keep_installers" false
      enforce_disk_floor
      rm -f "$stage_dir/$artifact" "$stage_dir/$artifact.blockmap" "$manifest"
      rmdir "$stage_dir"
      # A retry after a lost acknowledgement must also converge the public
      # download page, which may have missed the original run's refresh.
      if [[ -n "$public_dir" ]]; then
        refresh_public
      fi
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

# Reserve one installer slot for the candidate before moving any client-visible
# bytes. The current latest.yml target always survives this locked retention.
retain_installers "$((keep_installers - 1))" false
enforce_disk_floor

# Assets have versioned names and are moved into place before the manifest.
# The final same-filesystem rename is the single atomic client-visible switch.
mv "$stage_dir/$artifact" "$feed_dir/$artifact"
mv "$stage_dir/$artifact.blockmap" "$feed_dir/$artifact.blockmap"
manifest_tmp="$feed_dir/.latest.yml.$$.tmp"
mv "$manifest" "$manifest_tmp"
mv "$manifest_tmp" "$feed_dir/latest.yml"
rmdir "$stage_dir"

if [[ -n "$public_dir" ]]; then
  if ! refresh_public; then
    # The feed itself is already consistent and clients will update; only the
    # download page is stale. Fail the run so the staleness is noticed, and
    # name the repair mode.
    echo "feed published OK but the public download refresh FAILED — repair with: publish-feed.sh --refresh-public <feed-dir> <public-dir>" >&2
    exit 1
  fi
fi

echo "published version=$new_version artifact=$artifact sha512=$actual_sha"
