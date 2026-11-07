#!/usr/bin/env bash
# restores the database and the avatars/uploads volumes from snapshots made by scripts/backup.sh,
# replacing the current data. The app is stopped while restoring. Run it as root on the server,
# after the stack has been created once (docker compose up -d). See "backups" in README.md.
#
# usage: scripts/restore.sh [db snapshot] [files snapshot]
#   both default to "latest"; list the ids with `restic snapshots --tag db` / `--tag files`.
#   The config file is /etc/social-backup.env, or the path in BACKUP_CONFIG.
set -euo pipefail

DB_SNAPSHOT=${1:-latest}
FILES_SNAPSHOT=${2:-latest}
CONFIG=${BACKUP_CONFIG:-/etc/social-backup.env}
if [[ -f $CONFIG ]]; then
	set -a
	# shellcheck source=/dev/null
	source "$CONFIG"
	set +a
fi
COMPOSE_DIR=${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
: "${RESTIC_REPOSITORY:?set RESTIC_REPOSITORY (in $CONFIG or the environment)}"
export RESTIC_REPOSITORY

compose() { docker compose --project-directory "$COMPOSE_DIR" "$@"; }

project=$(compose config | sed -n 's/^name: *//p')
volume_path() {
	local name
	name=$(docker volume ls -q \
		--filter "label=com.docker.compose.project=$project" \
		--filter "label=com.docker.compose.volume=$1")
	[[ -n $name ]] || { echo "volume $1 of project $project not found, run docker compose up -d first" >&2; exit 1; }
	docker volume inspect -f '{{ .Mountpoint }}' "$name"
}
avatars=$(volume_path avatars)
uploads=$(volume_path uploads)

restic snapshots --tag db "$DB_SNAPSHOT"
restic snapshots --tag files "$FILES_SNAPSHOT"
read -r -p "This replaces the database, avatars and uploads of '$project'. Continue? [y/N] " answer
[[ $answer == [yY] ]] || exit 1

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# restore the files first, into a temporary directory: nothing is touched if it fails
echo "fetching avatars and uploads"
restic restore --tag files "$FILES_SNAPSHOT" --target "$tmp"
# snapshots hold the volume paths of the machine they were taken on, which can differ here
find_in_snapshot() {
	local src
	src=$(find "$tmp" -type d -path "*_$1/_data" | head -n1)
	[[ -n $src ]] || { echo "no $1 volume in the files snapshot" >&2; exit 1; }
	echo "$src"
}
avatars_src=$(find_in_snapshot avatars)
uploads_src=$(find_in_snapshot uploads)

echo "stopping the app"
compose stop web
compose up -d db
until compose exec -T db pg_isready -U postgres -q; do sleep 1; done

echo "restoring the database"
restic dump --tag db "$DB_SNAPSHOT" /postgres.sql |
	compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -q -d postgres

echo "restoring avatars and uploads"
find "$avatars" -mindepth 1 -delete
cp -a "$avatars_src/." "$avatars/"
find "$uploads" -mindepth 1 -delete
cp -a "$uploads_src/." "$uploads/"

echo "starting the app"
compose up -d
echo "done"
