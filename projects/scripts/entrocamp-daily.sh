#!/bin/bash
# EntroCamp 每日自动学习 Cron Job
# 每天 08:00 执行，为银蛇博士和蜡象助手自动学习课程
# 安装方式: 复制到 /app/work/logs/bypass/ 下并添加到系统 crontab

ENTROCAMP_API="http://localhost:5000/api/ai/entrocamp"
LOG_FILE="/app/work/logs/bypass/entrocamp-cron.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== 开始每日自动学习 ==="

# Step 1: 执行每日学习
log "执行每日学习..."
LEARN_RESULT=$(curl -s -X POST "$ENTROCAMP_API" \
  -H "Content-Type: application/json" \
  -d '{"agent": "all", "action": "learn"}')

log "学习结果: $LEARN_RESULT"

# Step 2: 检查是否有Agent完成所有科目，自动重新选课
sleep 2
log "检查是否需要重新选课..."
ENROLL_RESULT=$(curl -s -X POST "$ENTROCAMP_API" \
  -H "Content-Type: application/json" \
  -d '{"agent": "all", "action": "auto-enroll"}')

log "选课结果: $ENROLL_RESULT"

log "=== 每日自动学习完成 ==="
