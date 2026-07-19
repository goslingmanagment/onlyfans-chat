#!/usr/bin/env bash
set -euo pipefail

# Server-side half of publish-mac.sh. The local publisher streams this script
# over SSH after uploading one uniquely named staged DMG. All channel mutation
# happens while holding one lock, and a version is immutable once published.

if (( $# != 7 )); then
  echo "usage: publish-mac-remote.sh <public-dir> <stage-name> <version> <sha512> <size> <owner> <keep-dmgs>" >&2
  exit 2
fi

public_arg=$1
stage_name=$2
version=$3
expected_sha=$4
expected_size=$5
public_owner=$6
keep_dmgs=$7

canonical_dir() {
  local path=$1
  cd "$path" && pwd -P
}

public_dir=$(canonical_dir "$public_arg")

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "only stable semver releases are publishable: $version" >&2
  exit 1
fi
if ! [[ "$expected_sha" =~ ^[A-Za-z0-9+/]+={0,2}$ ]]; then
  echo "invalid expected SHA-512" >&2
  exit 1
fi
if ! [[ "$expected_size" =~ ^[0-9]+$ ]]; then
  echo "invalid expected size: $expected_size" >&2
  exit 1
fi
if ! [[ "$public_owner" =~ ^[a-z_][a-z0-9_-]*$ ]]; then
  echo "invalid public owner: $public_owner" >&2
  exit 1
fi
if ! [[ "$keep_dmgs" =~ ^[0-9]+$ ]] || (( keep_dmgs < 2 )); then
  echo "keep-dmgs must be an integer of at least 2" >&2
  exit 1
fi

expected_stage_prefix=".upload-ChatGoose-$version-mac-arm64.dmg."
if [[ "$stage_name" == */* || "$stage_name" != "$expected_stage_prefix"*.tmp ]]; then
  echo "unsafe staged DMG name: $stage_name" >&2
  exit 1
fi

stage_path="$public_dir/$stage_name"
if [[ ! -f "$stage_path" ]]; then
  echo "staged DMG does not exist: $stage_name" >&2
  exit 1
fi

lock_dir="$public_dir/.publish-mac.lock.d"
lock_mode=none
link_tmp=
json_tmp=

cleanup_lock() {
  if [[ "$lock_mode" == mkdir ]]; then
    rm -f "$lock_dir/pid"
    rmdir "$lock_dir" 2>/dev/null || true
  fi
}

cleanup() {
  local status=$?
  trap - EXIT
  [[ -z "$stage_path" ]] || rm -f -- "$stage_path"
  [[ -z "$link_tmp" ]] || rm -f -- "$link_tmp"
  [[ -z "$json_tmp" ]] || rm -f -- "$json_tmp"
  cleanup_lock
  exit "$status"
}
trap cleanup EXIT

sha512_file() {
  openssl dgst -sha512 -binary "$1" | openssl base64 -A
}

actual_size=$(wc -c < "$stage_path" | tr -d '[:space:]')
if [[ "$actual_size" != "$expected_size" ]]; then
  echo "staged DMG size mismatch: expected=$expected_size actual=$actual_size" >&2
  exit 1
fi
actual_sha=$(sha512_file "$stage_path")
if [[ "$actual_sha" != "$expected_sha" ]]; then
  echo "staged DMG SHA-512 mismatch" >&2
  exit 1
fi

if command -v flock >/dev/null 2>&1; then
  exec 9>"$public_dir/.publish-mac.lock"
  if ! flock -n 9; then
    echo "another mac publication is already in progress" >&2
    exit 1
  fi
  lock_mode=flock
elif [[ "${CHATGOOSE_ALLOW_PORTABLE_LOCK_FALLBACK:-}" == 1 ]]; then
  if ! mkdir "$lock_dir" 2>/dev/null; then
    owner_pid=$(cat "$lock_dir/pid" 2>/dev/null || true)
    if [[ "$owner_pid" =~ ^[0-9]+$ ]] && kill -0 "$owner_pid" 2>/dev/null; then
      echo "another mac publication is already in progress" >&2
      exit 1
    fi
    rm -f "$lock_dir/pid"
    if ! rmdir "$lock_dir" 2>/dev/null || ! mkdir "$lock_dir" 2>/dev/null; then
      echo "could not reclaim stale mac publication lock" >&2
      exit 1
    fi
  fi
  printf '%s\n' "$$" > "$lock_dir/pid"
  lock_mode=mkdir
else
  echo "flock is required for production mac publication" >&2
  exit 1
fi

version_is_greater() {
  local candidate_major candidate_minor candidate_patch
  local current_major current_minor current_patch
  IFS=. read -r candidate_major candidate_minor candidate_patch <<<"$1"
  IFS=. read -r current_major current_minor current_patch <<<"$2"

  if (( 10#$candidate_major != 10#$current_major )); then
    (( 10#$candidate_major > 10#$current_major ))
  elif (( 10#$candidate_minor != 10#$current_minor )); then
    (( 10#$candidate_minor > 10#$current_minor ))
  else
    (( 10#$candidate_patch > 10#$current_patch ))
  fi
}

dmg_version() {
  local name=${1##*/}
  if [[ "$name" =~ ^ChatGoose-([0-9]+)\.([0-9]+)\.([0-9]+)-mac-arm64\.dmg$ ]]; then
    printf '%s.%s.%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
    return 0
  fi
  return 1
}

current_version=
current_artifact=
current_size=
latest_link="$public_dir/ChatGoose-latest-mac-arm64.dmg"
version_file="$public_dir/version-mac.json"

load_current_publication() {
  local current_json current_json_re current_target actual_current_size
  if [[ ! -e "$version_file" && ! -e "$latest_link" && ! -L "$latest_link" ]]; then
    return
  fi
  if [[ ! -f "$version_file" ]]; then
    echo "current mac publication is incomplete" >&2
    exit 1
  fi

  current_json=$(<"$version_file")
  current_json_re='^\{"version":"([0-9]+\.[0-9]+\.[0-9]+)","size":([0-9]+)\}$'
  if [[ "$current_json" =~ $current_json_re ]]; then
    current_version=${BASH_REMATCH[1]}
    current_size=${BASH_REMATCH[2]}
  else
    echo "current version-mac.json is invalid" >&2
    exit 1
  fi

  current_artifact="ChatGoose-$current_version-mac-arm64.dmg"
  if [[ ! -f "$public_dir/$current_artifact" ]]; then
    echo "current version-mac.json references a missing artifact" >&2
    exit 1
  fi
  actual_current_size=$(wc -c < "$public_dir/$current_artifact" | tr -d '[:space:]')
  if [[ "$actual_current_size" != "$current_size" ]]; then
    echo "current mac artifact size does not match version-mac.json" >&2
    exit 1
  fi

  # version-mac.json is the channel's authority. The two public names cannot
  # be replaced by one filesystem rename, so a process death between renames
  # may leave the latest symlink behind. Repair that recoverable state while
  # holding the publication lock; never guess when the JSON/artifact pair is
  # itself invalid.
  current_target=
  if [[ -L "$latest_link" ]]; then
    current_target=$(readlink "$latest_link")
  elif [[ -e "$latest_link" ]]; then
    echo "current latest mac path is not a symlink" >&2
    exit 1
  fi
  if [[ "$current_target" != "$current_artifact" ]]; then
    link_tmp="$public_dir/.repair-latest-mac.$$.tmp"
    rm -f -- "$link_tmp"
    ln -s "$current_artifact" "$link_tmp"
    if [[ "${CHATGOOSE_SKIP_PUBLIC_CHOWN:-}" != 1 ]]; then
      chown -h "$public_owner:$public_owner" "$link_tmp"
    fi
    mv -f "$link_tmp" "$latest_link"
    link_tmp=
    echo "repaired latest mac link from version-mac.json version=$current_version"
  fi
}

retain_dmgs() {
  local target_count=$1
  local extra_protected=${2:-}
  local other_slots=$target_count
  local candidate other candidate_name other_name candidate_version other_version rank
  local -a dmgs

  if [[ -n "$current_artifact" ]]; then
    other_slots=$((other_slots - 1))
  fi
  if [[ -n "$extra_protected" && "$extra_protected" != "$current_artifact" ]]; then
    other_slots=$((other_slots - 1))
  fi

  shopt -s nullglob
  dmgs=("$public_dir"/ChatGoose-*-mac-arm64.dmg)
  shopt -u nullglob

  for candidate in "${dmgs[@]}"; do
    candidate_name=${candidate##*/}
    if ! candidate_version=$(dmg_version "$candidate"); then
      continue
    fi
    if [[ "$candidate_name" == "$current_artifact" || "$candidate_name" == "$extra_protected" ]]; then
      continue
    fi

    rank=1
    for other in "${dmgs[@]}"; do
      other_name=${other##*/}
      if [[ "$other_name" == "$current_artifact" || "$other_name" == "$extra_protected" ]]; then
        continue
      fi
      if ! other_version=$(dmg_version "$other"); then
        continue
      fi
      if version_is_greater "$other_version" "$candidate_version"; then
        rank=$((rank + 1))
      fi
    done

    if (( rank > other_slots )); then
      rm -f -- "$candidate"
      echo "mac retention removed artifact=$candidate_name"
    fi
  done
}

load_current_publication
artifact_name="ChatGoose-$version-mac-arm64.dmg"
artifact_path="$public_dir/$artifact_name"

if [[ -n "$current_version" ]]; then
  if [[ "$version" == "$current_version" ]]; then
    current_sha=$(sha512_file "$public_dir/$current_artifact")
    if [[ "$current_sha" == "$expected_sha" && "$current_size" == "$expected_size" ]] \
      && cmp -s "$stage_path" "$public_dir/$current_artifact"; then
      rm -f -- "$stage_path"
      stage_path=
      retain_dmgs "$keep_dmgs"
      echo "mac release already published version=$version sha512=$expected_sha"
      exit 0
    fi
    echo "refusing conflicting equal-version mac publication: version=$version" >&2
    exit 1
  fi
  if ! version_is_greater "$version" "$current_version"; then
    echo "refusing mac downgrade: current=$current_version candidate=$version" >&2
    exit 1
  fi
fi

# A prior lost acknowledgement may have moved the versioned artifact before the
# public link/JSON switch. Reuse it only when its bytes are exactly this build.
if [[ -e "$artifact_path" ]]; then
  if [[ ! -f "$artifact_path" || "$(sha512_file "$artifact_path")" != "$expected_sha" ]] \
    || [[ "$(wc -c < "$artifact_path" | tr -d '[:space:]')" != "$expected_size" ]] \
    || ! cmp -s "$stage_path" "$artifact_path"; then
    echo "refusing conflicting pre-existing mac artifact: $artifact_name" >&2
    exit 1
  fi
  rm -f -- "$stage_path"
else
  mv "$stage_path" "$artifact_path"
fi
stage_path=

if [[ "${CHATGOOSE_SKIP_PUBLIC_CHOWN:-}" != 1 ]]; then
  chown "$public_owner:$public_owner" "$artifact_path"
fi

# Retention runs before either client-visible pointer changes. Protect both the
# old selected artifact and the fully validated candidate; once the switch
# completes the directory is already at the configured bound, so no
# post-commit cleanup failure can be mistaken for a lost SSH acknowledgement.
retain_dmgs "$keep_dmgs" "$artifact_name"

if [[ -d "$latest_link" || -d "$version_file" ]]; then
  echo "mac publication destination path is a directory" >&2
  exit 1
fi

link_tmp="$public_dir/.latest-mac.$$.tmp"
json_tmp="$public_dir/.version-mac.json.$$.tmp"
rm -f -- "$link_tmp" "$json_tmp"
ln -s "$artifact_name" "$link_tmp"
printf '{"version":"%s","size":%s}\n' "$version" "$expected_size" > "$json_tmp"

if [[ "${CHATGOOSE_SKIP_PUBLIC_CHOWN:-}" != 1 ]]; then
  chown -h "$public_owner:$public_owner" "$link_tmp"
  chown "$public_owner:$public_owner" "$json_tmp"
fi

# Publish JSON first: it names an already-complete versioned artifact and is
# authoritative for crash recovery. The download page derives its versioned
# href from this JSON, while the stable symlink is replaced immediately after.
mv -f "$json_tmp" "$version_file"
json_tmp=
mv -f "$link_tmp" "$latest_link"
link_tmp=

current_version=$version
current_artifact=$artifact_name
current_size=$expected_size

echo "mac release published version=$version artifact=$artifact_name sha512=$expected_sha"
