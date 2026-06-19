#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
PORT=5000
DEPLOY_RUN_PORT="${DEPLOY_RUN_PORT:-$PORT}"

start_service() {
    cd "${COZE_WORKSPACE_PATH}"
    
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
    
    echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
    npx next start --port ${DEPLOY_RUN_PORT}
}

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for deploy..."
start_service
