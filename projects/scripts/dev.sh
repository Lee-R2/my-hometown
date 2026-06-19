#!/bin/bash
set -Eeuo pipefail

PORT=5000
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
NODE_ENV=development
DEPLOY_RUN_PORT=5000
MAX_RETRIES=10
RETRY_DELAY=3
LOG_FILE="/app/work/logs/bypass/dev-restart.log"

cd "${COZE_WORKSPACE_PATH}"

mkdir -p /app/work/logs/bypass/ 2>/dev/null || true

# Auto install dependencies if node_modules is missing
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/next" ]; then
    echo "node_modules missing or incomplete, running pnpm install..."
    pnpm install --prefer-frozen-lockfile --prefer-offline 2>&1 || pnpm install 2>&1
fi

# Flag to distinguish intentional stop from crash
INTENTIONAL_STOP=false

log_restart() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "${LOG_FILE}" 2>/dev/null || true
}

# Trap SIGINT/SIGTERM to set intentional stop flag
trap 'echo "Received stop signal, shutting down..."; INTENTIONAL_STOP=true; kill $(jobs -p) 2>/dev/null || true' SIGINT SIGTERM

kill_port_if_listening() {
    local pids
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -z "${pids}" ]]; then
      echo "Port ${DEPLOY_RUN_PORT} is free."
      return
    fi
    echo "Port ${DEPLOY_RUN_PORT} in use by PIDs: ${pids} (SIGKILL)"
    echo "${pids}" | xargs -I {} kill -9 {}
    sleep 1
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -n "${pids}" ]]; then
      echo "Warning: port ${DEPLOY_RUN_PORT} still busy after SIGKILL, PIDs: ${pids}"
    else
      echo "Port ${DEPLOY_RUN_PORT} cleared."
    fi
}

echo "Clearing port ${PORT} before start."
kill_port_if_listening

# Start EntroCamp daily learning scheduler
ENTROCAMP_SCHEDULER_LOG="/app/work/logs/bypass/entrocamp-scheduler.log"
ENTROCAMP_SCHEDULER_SCRIPT="${COZE_WORKSPACE_PATH}/src/lib/skills/entrocamp-learner/scheduler.js"
if [ -f "${ENTROCAMP_SCHEDULER_SCRIPT}" ]; then
    echo "Starting EntroCamp daily learning scheduler..."
    (nohup node "${ENTROCAMP_SCHEDULER_SCRIPT}" > "${ENTROCAMP_SCHEDULER_LOG}" 2>&1 &)
fi

# Start Memory Distillation scheduler
MEMORY_DISTILLER_LOG="/app/work/logs/bypass/memory-distiller-scheduler.log"
MEMORY_DISTILLER_SCRIPT="${COZE_WORKSPACE_PATH}/src/lib/skills/memory-distiller/scheduler.js"
if [ -f "${MEMORY_DISTILLER_SCRIPT}" ]; then
    echo "Starting Memory Distillation scheduler..."
    (nohup node "${MEMORY_DISTILLER_SCRIPT}" > "${MEMORY_DISTILLER_LOG}" 2>&1 &)
fi

echo "Starting HTTP service on port ${PORT} for dev..."

# Auto-restart loop: if Next.js dev server crashes, automatically restart it
retry_count=0
while true; do
    if ./node_modules/.bin/next dev --webpack --port $PORT; then
        # Clean exit
        echo "Next.js dev server exited cleanly."
        log_restart "Next.js dev server exited cleanly."
        break
    else
        exit_code=$?

        # Check if this was an intentional stop (Ctrl+C, SIGTERM)
        if [[ "${INTENTIONAL_STOP}" == "true" ]]; then
            echo "Intentional stop detected. Not restarting."
            log_restart "Intentional stop (exit: ${exit_code}). Not restarting."
            break
        fi

        retry_count=$((retry_count + 1))
        echo ""
        echo "=========================================="
        echo "Next.js dev server crashed (exit code: ${exit_code})"
        echo "Restart attempt ${retry_count}/${MAX_RETRIES}..."
        echo "=========================================="
        log_restart "Next.js dev server crashed (exit: ${exit_code}), restart attempt ${retry_count}/${MAX_RETRIES}"

        if [[ ${retry_count} -ge ${MAX_RETRIES} ]]; then
            echo "Max retries (${MAX_RETRIES}) reached. Stopping."
            log_restart "Max retries reached, giving up."
            exit 1
        fi

        # Clean up port before restart
        echo "Cleaning up port ${PORT}..."
        kill_port_if_listening

        # Exponential backoff: 3s, 6s, 12s, 24s, capped at 30s
        delay=$((RETRY_DELAY * (2 ** (retry_count - 1))))
        if [[ ${delay} -gt 30 ]]; then
            delay=30
        fi
        echo "Waiting ${delay}s before restart..."
        sleep ${delay}
        echo "Restarting Next.js dev server..."
    fi
done
