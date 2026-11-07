#!/usr/bin/env bash
# backs up the database and the avatars/uploads volumes of the docker compose deployment to a
# restic repository, then applies the retention policy. Run it as root on the server (it reads the
# docker volumes from the host), e.g. from cron or a systemd timer. See "backups" in README.md.
#
# usage: scripts/backup.sh [config file]   (default: /etc/social-backup.env)
set -Eeuo pipefail

CONFIG=${1:-/etc/social-backup.env}
if [[ -f $CONFIG ]]; then
	set -a
	# shellcheck source=/dev/null
	source "$CONFIG"
	set +a
fi

# the directory holding docker-compose.yaml (the repository root by default)
COMPOSE_DIR=${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
KEEP_DAILY=${KEEP_DAILY:-7}
KEEP_WEEKLY=${KEEP_WEEKLY:-4}
KEEP_MONTHLY=${KEEP_MONTHLY:-12}
# share of the repository data read back by `restic check` on every run
CHECK_SUBSET=${CHECK_SUBSET:-2%}
# optional: pinged on success, with /fail appended on failure (healthchecks.io style)
HEALTHCHECK_URL=${HEALTHCHECK_URL:-}

: "${RESTIC_REPOSITORY:?set RESTIC_REPOSITORY (in $CONFIG or the environment)}"
if [[ -z ${RESTIC_PASSWORD:-} && -z ${RESTIC_PASSWORD_FILE:-} && -z ${RESTIC_PASSWORD_COMMAND:-} ]]; then
	echo "set RESTIC_PASSWORD_FILE (or RESTIC_PASSWORD / RESTIC_PASSWORD_COMMAND)" >&2
	exit 1
fi
export RESTIC_REPOSITORY

ping() {
	[[ -z $HEALTHCHECK_URL ]] || curl -fsS -m 10 --retry 3 -o /dev/null "$HEALTHCHECK_URL$1" || true
}
trap 'rc=$?; [[ $rc -eq 0 ]] || ping /fail' EXIT

log() { echo "[$(date '+%F %T')] $*"; }

# never run two backups at once (a slow upload overlapping the next run)
exec 9>/run/lock/social-backup.lock
flock -n 9 || { echo "another backup is running" >&2; exit 1; }

# --stdin-from-command (fails the snapshot when pg_dump fails) needs restic 0.17
restic_version=$(restic version | awk '{print $2}')
if [[ $(printf '%s\n' 0.17.0 "$restic_version" | sort -V | head -n1) != 0.17.0 ]]; then
	echo "restic $restic_version is too old, 0.17 or newer is needed" >&2
	exit 1
fi

compose() { docker compose --project-directory "$COMPOSE_DIR" "$@"; }

# volumes are named <project>_<volume>: find them by their compose labels instead of guessing
project=$(compose config | sed -n 's/^name: *//p')
volume_path() {
	local name
	name=$(docker volume ls -q \
		--filter "label=com.docker.compose.project=$project" \
		--filter "label=com.docker.compose.volume=$1")
	[[ -n $name ]] || { echo "volume $1 of project $project not found" >&2; exit 1; }
	docker volume inspect -f '{{ .Mountpoint }}' "$name"
}
avatars=$(volume_path avatars)
uploads=$(volume_path uploads)

# init the repository on the first run
if ! restic cat config >/dev/null 2>&1; then
	log "initializing restic repository $RESTIC_REPOSITORY"
	restic init
fi

# a plain SQL dump (not -Fc) deduplicates well between snapshots, and restic compresses it.
# --clean --if-exists makes the dump replace the existing tables on restore
log "dumping the database"
restic backup --tag db --stdin-from-command --stdin-filename postgres.sql -- \
	docker compose --project-directory "$COMPOSE_DIR" exec -T db \
	pg_dump -U postgres --clean --if-exists --no-owner postgres

log "backing up avatars and uploads"
restic backup --tag files "$avatars" "$uploads"

log "applying retention"
restic forget --prune --group-by host,tags \
	--keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" --keep-monthly "$KEEP_MONTHLY"

# reads back a sample of the data on every run, so damage in the repository shows up early
log "checking the repository"
restic check --read-data-subset="$CHECK_SUBSET"

ping ''
log "done"
