/**
 * 更新三个角色的最后任务表单为相同的完整后测题目
 * 12题量表：A(1-3) + B(4-6) + C(7-9) + D(10-12)
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';

const SCALE_OPTIONS = ['完全不符合', '不太符合', '比较符合', '完全符合'];

// 完整的12题后测量表（三个角色相同）
const FULL_FORM_FIELDS = [
  // A. 情感与态度（1-3题）
  { id: 'q1', type: 'radio', label: '1. 学了人工智能之后，我对它更感兴趣了，还想继续探索更多。', required: true, options: SCALE_OPTIONS },
  { id: 'q2', type: 'radio', label: '2. 现在我更有信心了，觉得用人工智能工具做自己想做的事并不难。', required: true, options: SCALE_OPTIONS },
  { id: 'q3', type: 'radio', label: '3. 我现在更关心人工智能未来会给我们的学习和生活带来什么变化。', required: true, options: SCALE_OPTIONS },
  // B. 使用与协作（4-6题）
  { id: 'q4', type: 'radio', label: '4. 我已经能用人工智能工具帮自己完成具体的任务了（比如查资料、写提纲、做计划）。', required: true, options: SCALE_OPTIONS },
  { id: 'q5', type: 'radio', label: '5. 当AI的回答不满意时，我能调整提问方式，让它给出更好的结果。', required: true, options: SCALE_OPTIONS },
  { id: 'q6', type: 'radio', label: '6. 我和同学一起用AI工具完成过小组任务，知道怎么分工合作。', required: true, options: SCALE_OPTIONS },
  // C. 认知与理解（7-9题）
  { id: 'q7', type: 'radio', label: '7. 我能解释人工智能是怎么"学"到知识的，知道它靠的是数据而不是人手写规则。', required: true, options: SCALE_OPTIONS },
  { id: 'q8', type: 'radio', label: '8. 我遇到过AI给出错误或编造的信息，知道不能完全相信AI的回答。', required: true, options: SCALE_OPTIONS },
  { id: 'q9', type: 'radio', label: '9. 我能举出更多人工智能在生活中的应用，还能说出它大概是怎么工作的。', required: true, options: SCALE_OPTIONS },
  // D. 伦理与责任（10-12题）
  { id: 'q10', type: 'radio', label: '10. 用了AI辅助完成的作品，我会主动标注哪些部分是AI帮忙做的。', required: true, options: SCALE_OPTIONS },
  { id: 'q11', type: 'radio', label: '11. 我更清楚哪些事不能用AI做（比如造假、骗人、抄袭），也知道为什么。', required: true, options: SCALE_OPTIONS },
  { id: 'q12', type: 'radio', label: '12. 现在我会先判断AI的回答靠不靠谱，有疑问就去查证，而不是直接采用。', required: true, options: SCALE_OPTIONS },
];

const ROLE_CONFIG = {
  guider: { title: '指引者·最后任务', icon: '🧭', role: 'guider' },
  light_mage: { title: '光影法师·最后任务', icon: '✨', role: 'light_mage' },
  secret_scholar: { title: '秘语学者·最后任务', icon: '📚', role: 'secret_scholar' },
};

async function main() {
  console.log('🔄 更新三个角色表单为相同的完整后测题目...\n');

  for (const [key, config] of Object.entries(ROLE_CONFIG)) {
    // 查找现有表单
    const searchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/final_task_forms?select=id,role,title&role=eq.${key}`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const existing = await searchRes.json();

    if (!existing || existing.length === 0) {
      console.log(`  ⚠️  未找到 ${config.title} 表单，跳过`);
      continue;
    }

    const formId = existing[0].id;

    // 更新表单的 fields 和 description
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/final_task_forms?id=eq.${formId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          description: '学生人工智能素养水平量表·后测版（ABCE框架），共12题，4点量表。请根据你现在的真实想法选择。',
          fields: FULL_FORM_FIELDS,
        }),
      }
    );

    const updated = await updateRes.json();
    if (updateRes.ok) {
      console.log(`  ✅ ${config.title} 已更新为完整12题量表 (id: ${formId})`);
    } else {
      console.log(`  ❌ ${config.title} 更新失败:`, JSON.stringify(updated).substring(0, 200));
    }
  }

  // 验证
  console.log('\n🔍 验证更新结果...');
  const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/final_task_forms?select=id,role,title,fields&role=in.(guider,light_mage,secret_scholar)`,
    { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const forms = await verifyRes.json();

  for (const form of forms) {
    const fieldCount = form.fields?.length || 0;
    const radioCount = form.fields?.filter(f => f.type === 'radio').length || 0;
    console.log(`  ${form.title}: ${fieldCount} 题 (${radioCount} 单选)`);
    
    // 验证三个表单的题目是否一致
    if (fieldCount !== 12) {
      console.log(`    ⚠️  题目数量不是12题！`);
    }
  }

  // 验证三个表单题目完全一致
  if (forms.length === 3) {
    const f1 = JSON.stringify(forms[0].fields.map(f => f.label));
    const f2 = JSON.stringify(forms[1].fields.map(f => f.label));
    const f3 = JSON.stringify(forms[2].fields.map(f => f.label));
    if (f1 === f2 && f2 === f3) {
      console.log('\n  ✅ 三个表单题目完全一致');
    } else {
      console.log('\n  ❌ 三个表单题目不一致！');
    }
  }
}

main().catch(console.error);
