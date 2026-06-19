/**
 * 种子脚本：创建三个角色的最后任务表单（基于学生人工智能素养水平量表_后测）
 * 运行方式: node scripts/seed-final-task-forms.mjs
 */

const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';

// 简易 Supabase REST 客户端
async function sbFrom(table) {
  const baseUrl = `${SUPABASE_URL}/rest/v1/${table}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  return {
    select: async (columns = '*', filters = {}) => {
      const params = new URLSearchParams({ select: columns });
      Object.entries(filters).forEach(([k, v]) => params.set(k, String(v)));
      const res = await fetch(`${baseUrl}?${params}`, { headers });
      return res.json();
    },
    insert: async (data) => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      return res.json();
    },
  };
}

// 4点量表选项
const SCALE_OPTIONS = ['完全不符合', '不太符合', '比较符合', '完全符合'];

// 指引者表单 - 侧重情感与态度（A维度）+ 伦理与责任（D维度）
const guiderForm = {
  name: '指引者·最后任务',
  description: '指引者角色的AI素养后测评估，侧重情感态度与伦理责任维度。请根据你现在的真实想法选择。',
  icon: '🧭',
  is_global: true,
  school_id: null,
  team_role: 'guider',
  is_active: true,
  form_config: [
    { id: 'guider_q1', type: 'radio', label: '1. 学了人工智能之后，我对它更感兴趣了，还想继续探索更多。', required: true, options: SCALE_OPTIONS },
    { id: 'guider_q2', type: 'radio', label: '2. 现在我更有信心了，觉得用人工智能工具做自己想做的事并不难。', required: true, options: SCALE_OPTIONS },
    { id: 'guider_q3', type: 'radio', label: '3. 我现在更关心人工智能未来会给我们的学习和生活带来什么变化。', required: true, options: SCALE_OPTIONS },
    { id: 'guider_q4', type: 'radio', label: '4. 用了AI辅助完成的作品，我会主动标注哪些部分是AI帮忙做的。', required: true, options: SCALE_OPTIONS },
    { id: 'guider_q5', type: 'radio', label: '5. 我更清楚哪些事不能用AI做（比如造假、骗人、抄袭），也知道为什么。', required: true, options: SCALE_OPTIONS },
    { id: 'guider_q6', type: 'radio', label: '6. 现在我会先判断AI的回答靠不靠谱，有疑问就去查证，而不是直接采用。', required: true, options: SCALE_OPTIONS },
    { id: 'guider_q7', type: 'textarea', label: '7. 作为指引者，你觉得AI对你的学习方式产生了什么影响？请举例说明。', placeholder: '请详细描述你的感受和经历...', required: true },
    { id: 'guider_q8', type: 'textarea', label: '8. 在使用AI的过程中，你遇到过哪些让你觉得"这样做不对"的情况？你是怎么处理的？', placeholder: '请描述具体情境和你的做法...', required: false },
  ],
};

// 光影法师表单 - 侧重使用与协作（B维度）+ 认知与理解（C维度）
const lightMageForm = {
  name: '光影法师·最后任务',
  description: '光影法师角色的AI素养后测评估，侧重使用协作与认知理解维度。请根据你现在的真实想法选择。',
  icon: '✨',
  is_global: true,
  school_id: null,
  team_role: 'light_mage',
  is_active: true,
  form_config: [
    { id: 'mage_q1', type: 'radio', label: '1. 我已经能用人工智能工具帮自己完成具体的任务了（比如查资料、写提纲、做计划）。', required: true, options: SCALE_OPTIONS },
    { id: 'mage_q2', type: 'radio', label: '2. 当AI的回答不满意时，我能调整提问方式，让它给出更好的结果。', required: true, options: SCALE_OPTIONS },
    { id: 'mage_q3', type: 'radio', label: '3. 我和同学一起用AI工具完成过小组任务，知道怎么分工合作。', required: true, options: SCALE_OPTIONS },
    { id: 'mage_q4', type: 'radio', label: '4. 我能解释人工智能是怎么"学"到知识的，知道它靠的是数据而不是人手写规则。', required: true, options: SCALE_OPTIONS },
    { id: 'mage_q5', type: 'radio', label: '5. 我遇到过AI给出错误或编造的信息，知道不能完全相信AI的回答。', required: true, options: SCALE_OPTIONS },
    { id: 'mage_q6', type: 'radio', label: '6. 我能举出更多人工智能在生活中的应用，还能说出它大概是怎么工作的。', required: true, options: SCALE_OPTIONS },
    { id: 'mage_q7', type: 'textarea', label: '7. 作为光影法师，请描述一次你成功使用AI工具完成任务的经历。你是如何与AI互动的？', placeholder: '请描述具体任务、操作步骤和结果...', required: true },
    { id: 'mage_q8', type: 'textarea', label: '8. 你发现AI在哪些方面做得好，哪些方面容易出错？你是怎么判断的？', placeholder: '请举例说明...', required: false },
  ],
};

// 秘语学者表单 - 全维度覆盖（A+B+C+D各2题）+ 深度反思
const secretScholarForm = {
  name: '秘语学者·最后任务',
  description: '秘语学者角色的AI素养后测评估，覆盖全部四个维度并侧重深度反思。请根据你现在的真实想法选择。',
  icon: '📚',
  is_global: true,
  school_id: null,
  team_role: 'secret_scholar',
  is_active: true,
  form_config: [
    { id: 'scholar_q1', type: 'radio', label: '1. 学了人工智能之后，我对它更感兴趣了，还想继续探索更多。', required: true, options: SCALE_OPTIONS },
    { id: 'scholar_q2', type: 'radio', label: '2. 现在我更有信心了，觉得用人工智能工具做自己想做的事并不难。', required: true, options: SCALE_OPTIONS },
    { id: 'scholar_q3', type: 'radio', label: '3. 我已经能用人工智能工具帮自己完成具体的任务了（比如查资料、写提纲、做计划）。', required: true, options: SCALE_OPTIONS },
    { id: 'scholar_q4', type: 'radio', label: '4. 当AI的回答不满意时，我能调整提问方式，让它给出更好的结果。', required: true, options: SCALE_OPTIONS },
    { id: 'scholar_q5', type: 'radio', label: '5. 我能解释人工智能是怎么"学"到知识的，知道它靠的是数据而不是人手写规则。', required: true, options: SCALE_OPTIONS },
    { id: 'scholar_q6', type: 'radio', label: '6. 我遇到过AI给出错误或编造的信息，知道不能完全相信AI的回答。', required: true, options: SCALE_OPTIONS },
    { id: 'scholar_q7', type: 'radio', label: '7. 用了AI辅助完成的作品，我会主动标注哪些部分是AI帮忙做的。', required: true, options: SCALE_OPTIONS },
    { id: 'scholar_q8', type: 'radio', label: '8. 我更清楚哪些事不能用AI做（比如造假、骗人、抄袭），也知道为什么。', required: true, options: SCALE_OPTIONS },
    { id: 'scholar_q9', type: 'textarea', label: '9. 作为秘语学者，请总结你在本次AI学习活动中的最大收获，以及你对AI的新认识。', placeholder: '请从知识、技能、态度等方面详细描述...', required: true },
    { id: 'scholar_q10', type: 'textarea', label: '10. 如果让你给还没学过AI的同学提建议，你会告诉他们什么？', placeholder: '请结合你的亲身经历给出建议...', required: false },
  ],
};

async function main() {
  console.log('🚀 开始创建最后任务表单...\n');

  const sb = await sbFrom('final_task_forms');

  // 先检查现有表单
  console.log('📋 检查现有表单...');
  const existing = await sb.select('*', { team_role: 'eq.guider' });
  console.log(`  现有指引者表单: ${existing?.length || 0} 个`);

  const forms = [
    { key: 'guider', data: guiderForm, label: '指引者' },
    { key: 'light_mage', data: lightMageForm, label: '光影法师' },
    { key: 'secret_scholar', data: secretScholarForm, label: '秘语学者' },
  ];

  for (const form of forms) {
    // 检查是否已存在
    const existingForms = await sb.select('id,name', { team_role: `eq.${form.key}`, is_active: 'eq.true' });
    
    if (existingForms && existingForms.length > 0) {
      console.log(`  ⏭️  ${form.label} 表单已存在 (id: ${existingForms[0].id})，跳过`);
      continue;
    }

    // 插入新表单
    const result = await sb.insert(form.data);
    
    if (Array.isArray(result) && result.length > 0 && result[0].id) {
      console.log(`  ✅ ${form.label} 表单创建成功 (id: ${result[0].id})`);
    } else if (result?.code) {
      console.error(`  ❌ 创建 ${form.label} 表单失败:`, result.message || JSON.stringify(result));
      // 尝试兼容schema
      console.log(`  🔄 尝试使用兼容schema插入...`);
      const compatData = {
        role: form.key,
        title: form.data.name,
        description: form.data.description,
        fields: form.data.form_config,
        school_id: form.data.school_id,
      };
      const compatResult = await sb.insert(compatData);
      if (Array.isArray(compatResult) && compatResult.length > 0 && compatResult[0].id) {
        console.log(`  ✅ ${form.label} 表单创建成功 (兼容模式, id: ${compatResult[0].id})`);
      } else {
        console.error(`  ❌ 兼容插入也失败:`, compatResult?.message || JSON.stringify(compatResult));
      }
    } else {
      console.log(`  ✅ ${form.label} 表单创建成功`);
    }
  }

  // 验证
  console.log('\n🔍 验证创建的表单...');
  const allForms = await sb.select('id,name,team_role,icon,is_active,form_config', { is_active: 'eq.true' });
  if (allForms && allForms.length > 0) {
    console.log(`  ✅ 共找到 ${allForms.length} 个活跃表单：`);
    allForms.forEach(f => {
      const fieldCount = f.form_config?.length || f.fields?.length || 0;
      console.log(`     - ${f.icon || '🏆'} ${f.name || f.title} (team_role: ${f.team_role || f.role || 'N/A'}, ${fieldCount} 个字段)`);
    });
  } else {
    console.log('  ⚠️  未找到任何活跃表单');
  }

  console.log('\n✅ 脚本执行完毕！');
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
