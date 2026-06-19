#!/usr/bin/env node
/**
 * 记忆蒸馏定时服务
 * 每天北京时间 03:00 自动执行记忆蒸馏
 * 清理过时记忆、合并重复记忆、归档低频访问记忆
 * 同时清理 user_memories 表中过期的用户记忆
 */

// API 地址：优先使用环境变量，默认回退到本地开发地址
const API_BASE = process.env.SCHEDULER_API_BASE || 'http://localhost:3000';
const DISTILL_API = `${API_BASE}/api/ai/memory/distill`;
const USER_MEMORY_API = `${API_BASE}/api/ai/memory/user`;

const DISTILL_HOUR = 3;    // 北京时间 03:00
const DISTILL_MINUTE = 0;
const CHECK_INTERVAL = 60 * 1000; // 1 分钟检查一次

let lastDistillDate = null;

// 日志路径：跨平台兼容，优先使用环境变量
const path = require('path');
const os = require('os');
const LOG_FILE = process.env.SCHEDULER_LOG_FILE || path.join(os.tmpdir(), 'memory-distiller-scheduler.log');

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  process.stdout.write(line);
  try {
    const fs = require('fs');
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

async function callAPI(url, body) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    return { success: response.ok, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function executeDailyDistillation() {
  const today = new Date().toISOString().split('T')[0];
  if (lastDistillDate === today) return;

  log('=== 开始每日记忆蒸馏 ===');

  // Step 1: 蒸馏 agent_memories（银蛇博士 + 蜡象助手）
  const agents = ['yinshe_boshi', 'laxiang_zhushou'];
  for (const agent of agents) {
    log(`蒸馏 ${agent} 的记忆...`);
    const result = await callAPI(DISTILL_API, { agent, action: 'distill' });
    if (result.success) {
      const data = result.data;
      log(`  ${agent} 蒸馏完成: 候选 ${data.candidates || 0} 条, 合并 ${data.merged || 0} 条, 归档 ${data.archived || 0} 条, 清理 ${data.cleaned || 0} 条`);
    } else {
      log(`  ${agent} 蒸馏失败: ${result.error}`);
    }
  }

  // Step 2: 清理 user_memories 中过期的用户记忆
  log('清理用户记忆...');
  const userResult = await callAPI(USER_MEMORY_API, { action: 'cleanup' });
  if (userResult.success) {
    log(`  用户记忆清理完成: ${userResult.data?.cleaned || 0} 条过期记忆已归档`);
  } else {
    log(`  用户记忆清理失败: ${userResult.error}`);
  }

  lastDistillDate = today;
  log('=== 每日记忆蒸馏完成 ===');
}

function getBeijingHour() {
  return (new Date().getUTCHours() + 8) % 24;
}

function getBeijingMinute() {
  return new Date().getUTCMinutes();
}

function checkAndRun() {
  const hour = getBeijingHour();
  const minute = getBeijingMinute();

  if (hour === DISTILL_HOUR && minute >= DISTILL_MINUTE && minute < DISTILL_MINUTE + 5) {
    executeDailyDistillation().catch(err => {
      log(`执行出错: ${err.message}`);
    });
  }
}

// 主循环
log('记忆蒸馏定时服务启动');
log(`蒸馏时间: 每天北京时间 ${DISTILL_HOUR}:${String(DISTILL_MINUTE).padStart(2, '0')}`);
log(`检查间隔: ${CHECK_INTERVAL / 1000} 秒`);

// 立即检查一次
const now = new Date();
const today = now.toISOString().split('T')[0];
const hour = getBeijingHour();
if (hour >= DISTILL_HOUR && lastDistillDate !== today) {
  log('检测到今天尚未蒸馏，立即执行...');
  executeDailyDistillation().catch(err => {
    log(`启动时蒸馏出错: ${err.message}`);
  });
}

const timer = setInterval(checkAndRun, CHECK_INTERVAL);

// 优雅退出
process.on('SIGTERM', () => {
  log('收到 SIGTERM，停止服务...');
  clearInterval(timer);
  process.exit(0);
});

process.on('SIGINT', () => {
  log('收到 SIGINT，停止服务...');
  clearInterval(timer);
  process.exit(0);
});
