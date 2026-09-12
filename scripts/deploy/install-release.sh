#!/usr/bin/env bash
set -Eeuo pipefail

# This script runs as the unprivileged deploy user. No sudo or service reload.
release_id=${1:?Expected a release identifier}
[[ "$release_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || exit 2
base=/var/www/digital-monster
archive="$HOME/incoming/$release_id.tar.gz"
release="$base/releases/$release_id"
exec 9>"$base/.deploy.lock"
flock -n 9 || { echo 'Another deployment is active' >&2; exit 3; }
test -s "$archive"
test ! -e "$release"

previous=$(readlink "$base/current" || true)
activated=0
cleanup() {
    result=$?
    trap - EXIT
    if (( result != 0 && activated == 1 )); then
        if [[ -n "$previous" ]]; then
            ln -sfn "$previous" "$base/.rollback"
            mv -Tf "$base/.rollback" "$base/current"
        else
            rm -f "$base/current"
        fi
        echo 'Health check failed; previous release restored' >&2
    fi
    rm -f "$archive"
    if (( result != 0 )); then
        rm -rf -- "$release"
    fi
    exit "$result"
}
trap cleanup EXIT

mkdir "$release"
tar -xzf "$archive" --no-same-owner --no-same-permissions -C "$release"
test -s "$release/index.html"
test -s "$release/__release.json"
test -d "$release/assets"
if find "$release" -type l -print -quit | grep -q .; then
    echo 'Release must not contain symbolic links' >&2
    exit 4
fi
chmod -R u=rwX,go=rX "$release"

# Keep old hashed chunks available to visitors with an already-open page.
cp -R "$release/assets/." "$base/shared/assets/"
find "$base/shared/assets" -type f -mtime +30 -delete

ln -sfn "$release" "$base/.next"
mv -Tf "$base/.next" "$base/current"
activated=1
curl --fail --silent --show-error --retry 2 --max-time 15 \
    -H 'Host: digital-monster.pro' http://127.0.0.1/__release.json \
    -o "$base/.health-response"
cmp "$release/__release.json" "$base/.health-response"
curl --fail --silent --show-error --max-time 15 \
    -H 'Host: digital-monster.pro' http://127.0.0.1/ -o /dev/null

# The active version plus two prior releases fit comfortably on the 25 GB disk.
mapfile -t releases < <(find "$base/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %f\n' | sort -nr | awk '{print $2}')
for old in "${releases[@]:3}"; do
    [[ "$old" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || continue
    [[ "$base/releases/$old" == "$(readlink "$base/current")" ]] && continue
    rm -rf -- "$base/releases/$old"
done
echo "Published $release_id"
