#!/usr/bin/env sh
set -eu

mode="${1:-guarantee-10}"
case "$mode" in guarantee-10|capacity) ;; *) echo "Use: $0 [guarantee-10|capacity]" >&2; exit 64 ;; esac

root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
compose="docker compose -f $root/load/docker-compose.yml"
results="$root/load/results/$(date +%Y%m%dT%H%M%S)-$mode"
keep_stack="${LOAD_TEST_KEEP_STACK:-false}"
mkdir -p "$results"

cleanup() {
  [ -n "${monitor_pid:-}" ] && kill "$monitor_pid" 2>/dev/null || true
  if [ "$keep_stack" != "true" ]; then
    $compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

$compose up --build -d postgres migrate backend nginx
$compose exec -T backend wget -q --spider http://127.0.0.1:8080/ready
$compose run --rm --no-deps -e LOAD_TEST_CONFIRM=seed -e LOAD_TEST_USER_COUNT=100 backend npm run load:seed

containers="$($compose ps -q nginx backend postgres)"
(
  while true; do
    docker stats --no-stream --format '{{json .}}' $containers >> "$results/container-stats.jsonl" || true
    sleep 5
  done
) &
monitor_pid=$!

network="controle_horas_load_default"
set +e
docker run --rm --network "$network" \
  --user "$(id -u):$(id -g)" \
  -e LOAD_MODE="$mode" \
  -e LOAD_BASE_URL=http://nginx \
  -e LOAD_GUARANTEE_DURATION="${LOAD_GUARANTEE_DURATION:-5m}" \
  -v "$root/load/k6:/scripts:ro" \
  -v "$results:/results" \
  grafana/k6:0.52.0 run --summary-export /results/summary.json /scripts/scenario.js
status=$?
set -e

kill "$monitor_pid" 2>/dev/null || true
monitor_pid=""
$compose ps --format json > "$results/compose-state.json"
$compose ps -q nginx backend postgres | xargs docker inspect > "$results/container-inspect.json"
docker inspect --format '{{.Name}} RestartCount={{.RestartCount}} OOMKilled={{.State.OOMKilled}}' $containers > "$results/container-health.txt"
if grep -Eq 'RestartCount=[1-9]|OOMKilled=true' "$results/container-health.txt"; then
  printf '%s\n' 'Load test failed: a measured container restarted or was OOM-killed.' >&2
  status=1
fi
$compose exec -T backend wget -q --spider http://127.0.0.1:8080/ready
printf 'Resultados: %s\n' "$results"
exit "$status"
