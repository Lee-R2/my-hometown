/**
 * 模拟API调用，检查前端实际接收的数据
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.COZE_SUPABASE_URL,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function simulateAPI() {
  // 模拟 GET /api/team/pretest 的逻辑
  const { data: questions } = await supabase
    .from('pretest_questions')
    .select('*')
    .eq('is_active', true)
    .order('order_index', { ascending: true });

  // 当前代码的映射逻辑
  const mappedQuestions = (questions || []).map(q => ({
    ...q,
    options: q.options?.choices || q.options,
  }));

  console.log('=== 模拟前端接收的数据 ===\n');
  
  // 检查第1题
  const q1 = mappedQuestions[0];
  console.log('第1题:');
  console.log('  title:', q1.title);
  console.log('  description:', q1.description);
  console.log('  dimension:', q1.dimension);
  console.log('  part:', q1.part);
  console.log('  is_required:', q1.is_required);
  console.log('  question_type:', q1.question_type);
  console.log('  options类型:', typeof q1.options, '是否数组:', Array.isArray(q1.options));
  console.log('  options内容:', JSON.stringify(q1.options, null, 2));
  
  // 检查options是否是前端期望的 [{label, value}] 格式
  if (Array.isArray(q1.options)) {
    console.log('\n  ✅ options是数组格式，前端可正常渲染');
    q1.options.forEach(o => {
      console.log(`    - label: "${o.label}", value: "${o.value}"`);
    });
  } else {
    console.log('\n  ❌ options不是数组格式，前端无法渲染！');
    console.log('  实际options:', JSON.stringify(q1.options));
  }

  // 检查第13题（角色倾向）
  const q13 = mappedQuestions[12];
  console.log('\n第13题(角色倾向):');
  console.log('  title:', q13.title);
  console.log('  dimension:', q13.dimension);
  console.log('  part:', q13.part);
  console.log('  options类型:', typeof q13.options, '是否数组:', Array.isArray(q13.options));
  
  // 检查是否有_metadata残留
  const hasMetadata = mappedQuestions.some(q => q._metadata || (q.options && q.options._metadata));
  console.log('\n是否有_metadata残留:', hasMetadata ? '❌ 有' : '✅ 无');

  // 检查所有题目的options是否都是数组
  const allArray = mappedQuestions.every(q => Array.isArray(q.options));
  console.log('所有题目options都是数组:', allArray ? '✅ 是' : '❌ 否');
  
  if (!allArray) {
    const nonArray = mappedQuestions.filter(q => !Array.isArray(q.options));
    console.log('非数组options的题目:', nonArray.map(q => ({ order: q.order_index, type: typeof q.options })));
  }
}

simulateAPI().catch(console.error);
