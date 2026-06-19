/**
 * AI素养量表种子数据脚本
 * 将18道小学生人工智能素养水平量表题目插入pretest_questions表
 *
 * 数据库列: id, title, description, question_type, options(jsonb), correct_answer,
 *           is_active, is_required, dimension, part, order_index, created_at, updated_at
 *
 * 使用方式：node scripts/seed_ai_literacy_questions.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('缺少Supabase环境变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 4点量表选项
const ratingOptions = [
  { label: '1 - 完全不符合', value: '1' },
  { label: '2 - 不太符合', value: '2' },
  { label: '3 - 比较符合', value: '3' },
  { label: '4 - 完全符合', value: '4' },
];

// 18道量表题目
const questions = [
  // ===== Part 1: 素养测评 =====
  // A. 情感与态度 (1-3题)
  {
    title: '我觉得人工智能很有意思，想知道更多关于它的事情。',
    description: 'Part 1 · 素养测评 · A. 情感与态度',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'A',
    part: 'literacy',
    is_active: true,
    order_index: 1,
  },
  {
    title: '我相信自己能学会使用人工智能工具，不怕出错、愿意动手尝试。',
    description: 'Part 1 · 素养测评 · A. 情感与态度',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'A',
    part: 'literacy',
    is_active: true,
    order_index: 2,
  },
  {
    title: '我想了解人工智能以后会怎么改变我们的生活。',
    description: 'Part 1 · 素养测评 · A. 情感与态度',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'A',
    part: 'literacy',
    is_active: true,
    order_index: 3,
  },
  // B. 使用与协作 (4-6题)
  {
    title: '我会用人工智能工具来帮我做事（比如问AI问题、让AI帮忙翻译或写提纲）。',
    description: 'Part 1 · 素养测评 · B. 使用与协作',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'B',
    part: 'literacy',
    is_active: true,
    order_index: 4,
  },
  {
    title: '当AI给我的回答不够好时，我会换一种方式再问它，让它回答得更准确。',
    description: 'Part 1 · 素养测评 · B. 使用与协作',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'B',
    part: 'literacy',
    is_active: true,
    order_index: 5,
  },
  {
    title: '我能和同学一起使用AI工具完成小组任务（比如一起查资料、做手抄报）。',
    description: 'Part 1 · 素养测评 · B. 使用与协作',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'B',
    part: 'literacy',
    is_active: true,
    order_index: 6,
  },
  // C. 认知与理解 (7-9题)
  {
    title: '我知道人工智能是从大量数据中学习的，不是人一条一条把规则写进去的。',
    description: 'Part 1 · 素养测评 · C. 认知与理解',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'C',
    part: 'literacy',
    is_active: true,
    order_index: 7,
  },
  {
    title: '我知道人工智能有时候会出错或"编造"看起来像真的但实际是假的信息。',
    description: 'Part 1 · 素养测评 · C. 认知与理解',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'C',
    part: 'literacy',
    is_active: true,
    order_index: 8,
  },
  {
    title: '我能说出生活中至少3个人工智能的应用例子（比如语音助手、刷脸解锁、短视频推荐）。',
    description: 'Part 1 · 素养测评 · C. 认知与理解',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'C',
    part: 'literacy',
    is_active: true,
    order_index: 9,
  },
  // D. 伦理与责任 (10-12题)
  {
    title: '用AI帮忙完成的作业或作品，我会告诉老师这是AI协助我做的，不会假装全是我自己做的。',
    description: 'Part 1 · 素养测评 · D. 伦理与责任',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'D',
    part: 'literacy',
    is_active: true,
    order_index: 10,
  },
  {
    title: '我知道不能用人工智能做伤害别人的事（比如用AI造假照片、编假消息骗人）。',
    description: 'Part 1 · 素养测评 · D. 伦理与责任',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'D',
    part: 'literacy',
    is_active: true,
    order_index: 11,
  },
  {
    title: '当AI给出的答案我不确定对不对时，我会去查别的资料验证，而不是直接相信。',
    description: 'Part 1 · 素养测评 · D. 伦理与责任',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'D',
    part: 'literacy',
    is_active: true,
    order_index: 12,
  },
  // ===== Part 2: 角色倾向 =====
  {
    title: '🧭 在小组任务中，我喜欢决定大家做什么、怎么分工，推动每个人把事做完。',
    description: 'Part 2 · 角色倾向',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'guide',
    part: 'role',
    is_active: true,
    order_index: 13,
  },
  {
    title: '📷 我喜欢用拍照、录视频或AI画画的方式把想法和故事表现出来。',
    description: 'Part 2 · 角色倾向',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'visual',
    part: 'role',
    is_active: true,
    order_index: 14,
  },
  {
    title: '📜 我喜欢用文字把事情写清楚、记下来，比如写活动记录、整理笔记。',
    description: 'Part 2 · 角色倾向',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'text',
    part: 'role',
    is_active: true,
    order_index: 15,
  },
  {
    title: '🧭 当小组讨论不知道该怎么办时，我通常会主动提出方向，带着大家往前走。',
    description: 'Part 2 · 角色倾向',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'guide',
    part: 'role',
    is_active: true,
    order_index: 16,
  },
  {
    title: '📷 看到一个场景或活动，我脑子里会想"这里拍个照片或视频一定很好看"。',
    description: 'Part 2 · 角色倾向',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'visual',
    part: 'role',
    is_active: true,
    order_index: 17,
  },
  {
    title: '📜 听完一段内容或参加完一个活动，我能用文字很快把重点整理出来。',
    description: 'Part 2 · 角色倾向',
    question_type: 'single_choice',
    options: ratingOptions,
    is_required: true,
    dimension: 'text',
    part: 'role',
    is_active: true,
    order_index: 18,
  },
];

async function seed() {
  console.log('开始插入AI素养量表题目...');

  // 检查是否已有量表题目（通过part列判断）
  const { data: existing } = await supabase
    .from('pretest_questions')
    .select('id')
    .eq('part', 'literacy');

  if (existing && existing.length > 0) {
    console.log(`已有 ${existing.length} 道素养测评题目，跳过插入`);
    console.log('如需重新插入，请先清除现有量表题目');
    return;
  }

  // 插入题目
  const { data, error } = await supabase
    .from('pretest_questions')
    .insert(questions)
    .select();

  if (error) {
    console.error('插入题目失败:', error);
    process.exit(1);
  }

  console.log(`成功插入 ${data.length} 道AI素养量表题目`);
  console.log('  - Part 1 素养测评: 12题 (A×3 + B×3 + C×3 + D×3)');
  console.log('  - Part 2 角色倾向: 6题 (引导者×2 + 光影法师×2 + 秘语学者×2)');
}

seed().catch(console.error);
