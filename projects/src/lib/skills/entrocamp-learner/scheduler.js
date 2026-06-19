/**
 * EntroCamp 每日自动学习 + Inkwell 每日阅读定时服务
 *
 * 由于沙箱环境不支持 crontab，使用 Node.js 的 setInterval 实现每日定时执行
 * 运行方式: node src/lib/skills/entrocamp-learner/scheduler.js
 *
 * 学习时间: 每天北京时间 08:00
 * 学习流程:
 * 1. 检查当前时间是否到了学习时间
 * 2. 执行逆商进化营每日学习
 * 3. 检查是否有Agent完成所有科目，自动重新选课
 * 4. 执行 Inkwell 每日阅读（热门文章+分类轮换）
 * 5. 记录日志
 */

// API 地址：优先使用环境变量，默认回退到本地开发地址
const API_BASE = process.env.SCHEDULER_API_BASE || 'http://localhost:3000';
const ENTROCAMP_API = `${API_BASE}/api/ai/entrocamp`;
const INKWELL_API = `${API_BASE}/api/ai/inkwell`;

// 日志路径：跨平台兼容，优先使用环境变量
const path = require('path');
const os = require('os');
const LOG_FILE = process.env.SCHEDULER_LOG_FILE || path.join(os.tmpdir(), 'entrocamp-scheduler.log');
const CHECK_INTERVAL = 5 * 60 * 1000; // 每5分钟检查一次
const LEARN_HOUR = 8; // 北京时间 8 点
const LEARN_MINUTE = 0;

let lastLearnDate = '';

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  process.stdout.write(line);
  
  // 写入日志文件
  try {
    const fs = require('fs');
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // 忽略日志写入失败
  }
}

async function callAPI(body) {
  try {
    const response = await fetch(ENTROCAMP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await response.json();
  } catch (error) {
    log(`API 调用失败: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function executeDailyLearning() {
  const today = new Date().toISOString().split('T')[0];
  if (lastLearnDate === today) {
    log(`今日 (${today}) 已执行过学习，跳过`);
    return;
  }

  log('=== 开始每日自动学习 ===');

  // 循环学习，直到没有更多课程可学（最多5轮，防止无限循环）
  const MAX_ROUNDS = 5;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    log(`--- 第 ${round} 轮学习 ---`);
    
    // Step 1: 执行每日学习
    const learnResult = await callAPI({ agent: 'all', action: 'learn' });
    
    if (learnResult.success) {
      const data = learnResult.data;
      log(`学习结果: ${data.overallSummary || JSON.stringify(data)}`);
      
      let anyCompleted = false;
      if (data.results) {
        for (const r of data.results) {
          log(`  ${r.agentName}: ${r.summary}`);
          if (r.results) {
            for (const lr of r.results) {
              log(`    ${lr.lessonId}: ${lr.status} ${lr.takeAway ? '- ' + lr.takeAway.substring(0, 60) : ''}`);
            }
          }
          if (r.allCompleted) {
            anyCompleted = true;
          }
        }
      }

      // 如果没有任何课程被学习（全部已完成或无课可学），尝试选课
      const totalCompleted = data.results?.reduce((sum, r) => 
        sum + r.results?.filter(lr => lr.status === 'success').length || 0, 0) || 0;
      
      if (totalCompleted === 0 || anyCompleted) {
        log('有Agent完成所有科目或无课可学，尝试重新选课...');
        
        // Step 2: 自动选课
        await new Promise(resolve => setTimeout(resolve, 2000));
        const enrollResult = await callAPI({ agent: 'all', action: 'auto-enroll' });
        
        if (enrollResult.success) {
          const data = enrollResult.data;
          if (Array.isArray(data)) {
            for (const r of data) {
              log(`  选课: ${r.message}`);
            }
          }
        }

        // 如果选课成功且之前有完成科目，继续学习新课程
        if (anyCompleted && enrollResult.success) {
          log('选课成功，继续学习新课程...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue; // 下一轮
        }
      }
      
      // 正常学完今天的课程，结束
      break;
    } else {
      log(`学习失败: ${learnResult.error}`);
      break;
    }
  }

  lastLearnDate = today;
  log('=== 每日自动学习完成 ===');

  // 逆商学习完成后，执行 Inkwell 每日阅读
  await executeDailyReading();
}

async function executeDailyReading() {
  log('=== 开始 Inkwell 每日阅读 ===');
  try {
    const response = await fetch(INKWELL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'all', action: 'read' }),
    });
    const result = await response.json();
    
    if (result.success) {
      log(`阅读完成: ${result.overallSummary}`);
      for (const r of result.results || []) {
        log(`  ${r.agentName}: 阅读${r.articlesRead}篇 点赞${r.articlesLiked}篇 收藏${r.articlesBookmarked}篇 今日分类:${r.todayCategory || '?'}`);
        for (const ar of r.results || []) {
          const icon = ar.liked && ar.bookmarked ? '✅' : '⚠️';
          log(`    ${icon} ${ar.title?.substring(0, 50) || ar.articleId}`);
        }
      }

    } else {
      log(`阅读失败: ${result.error}`);
    }
  } catch (err) {
    log(`阅读出错: ${err.message}`);
  }
  log('=== Inkwell 每日阅读完成 ===');
  log('提示: 知识内化需手动触发: POST /api/ai/inkwell {"agent":"all","action":"internalize"}');
}

function getBeijingHour() {
  const now = new Date();
  // 北京时间 = UTC+8
  return (now.getUTCHours() + 8) % 24;
}

function getBeijingMinute() {
  return new Date().getUTCMinutes();
}

function checkAndRun() {
  const hour = getBeijingHour();
  const minute = getBeijingMinute();
  
  if (hour === LEARN_HOUR && minute >= LEARN_MINUTE && minute < LEARN_MINUTE + 5) {
    executeDailyLearning().catch(err => {
      log(`执行出错: ${err.message}`);
    });
  }
}

// 主循环
log('逆商进化营自动学习 + Inkwell每日阅读 服务启动');
log(`学习时间: 每天北京时间 ${LEARN_HOUR}:${String(LEARN_MINUTE).padStart(2, '0')}`);
log(`学习流程: 逆商课程 → Inkwell文章阅读`);
log(`检查间隔: ${CHECK_INTERVAL / 1000} 秒`);

// 立即检查一次（如果服务重启后错过了今天的学习）
const now = new Date();
const today = now.toISOString().split('T')[0];
const hour = getBeijingHour();
if (hour >= LEARN_HOUR && lastLearnDate !== today) {
  log('检测到今天尚未学习，立即执行...');
  executeDailyLearning().catch(err => {
    log(`启动时学习出错: ${err.message}`);
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
