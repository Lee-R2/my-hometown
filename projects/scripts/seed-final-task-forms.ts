import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * 种子脚本：创建三个角色的最后任务表单（基于学生人工智能素养水平量表_后测）
 * 
 * 运行方式: npx tsx scripts/seed-final-task-forms.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================
// 步骤1：确保 final_task_forms 表有所需列
// ============================================
async function ensureColumns() {
  console.log('📋 步骤1：确保 final_task_forms 表有所需列...');

  const alterStatements = [
    `ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS name VARCHAR(200)`,
    `ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS form_config JSONB`,
    `ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT true`,
    `ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS team_role VARCHAR(20)`,
    `ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT '🏆'`,
    `ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)`,
    `ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`,
    `UPDATE final_task_forms SET name = title WHERE name IS NULL AND title IS NOT NULL`,
    `UPDATE final_task_forms SET form_config = fields WHERE form_config IS NULL AND fields IS NOT NULL`,
  ];

  for (const sql of alterStatements) {
    const { error } = await supabase.rpc('exec_sql', { sql_string: sql });
    if (error) {
      // RPC 可能不存在，尝试直接用 REST API
      console.log(`  ⚠️ 无法通过 RPC 执行: ${sql.substring(0, 60)}...`);
    }
  }

  // 检查表结构
  const { data, error } = await supabase
    .from('final_task_forms')
    .select('id, name, team_role, is_active')
    .limit(1);

  if (error) {
    console.error('  ❌ 检查表结构失败:', error.message);
    console.log('  尝试直接插入数据...');
  } else {
    console.log('  ✅ 表结构检查通过');
  }
}

// ============================================
// 步骤2：创建三个角色的最后任务表单
// ============================================

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
    // A. 情感与态度（1-3题）
    {
      id: 'guider_q1',
      type: 'radio',
      label: '1. 学了人工智能之后，我对它更感兴趣了，还想继续探索更多。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'guider_q2',
      type: 'radio',
      label: '2. 现在我更有信心了，觉得用人工智能工具做自己想做的事并不难。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'guider_q3',
      type: 'radio',
      label: '3. 我现在更关心人工智能未来会给我们的学习和生活带来什么变化。',
      required: true,
      options: SCALE_OPTIONS,
    },
    // D. 伦理与责任（10-12题）
    {
      id: 'guider_q4',
      type: 'radio',
      label: '4. 用了AI辅助完成的作品，我会主动标注哪些部分是AI帮忙做的。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'guider_q5',
      type: 'radio',
      label: '5. 我更清楚哪些事不能用AI做（比如造假、骗人、抄袭），也知道为什么。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'guider_q6',
      type: 'radio',
      label: '6. 现在我会先判断AI的回答靠不靠谱，有疑问就去查证，而不是直接采用。',
      required: true,
      options: SCALE_OPTIONS,
    },
    // 开放题
    {
      id: 'guider_q7',
      type: 'textarea',
      label: '7. 作为指引者，你觉得AI对你的学习方式产生了什么影响？请举例说明。',
      placeholder: '请详细描述你的感受和经历...',
      required: true,
    },
    {
      id: 'guider_q8',
      type: 'textarea',
      label: '8. 在使用AI的过程中，你遇到过哪些让你觉得"这样做不对"的情况？你是怎么处理的？',
      placeholder: '请描述具体情境和你的做法...',
      required: false,
    },
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
    // B. 使用与协作（4-6题）
    {
      id: 'mage_q1',
      type: 'radio',
      label: '1. 我已经能用人工智能工具帮自己完成具体的任务了（比如查资料、写提纲、做计划）。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'mage_q2',
      type: 'radio',
      label: '2. 当AI的回答不满意时，我能调整提问方式，让它给出更好的结果。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'mage_q3',
      type: 'radio',
      label: '3. 我和同学一起用AI工具完成过小组任务，知道怎么分工合作。',
      required: true,
      options: SCALE_OPTIONS,
    },
    // C. 认知与理解（7-9题）
    {
      id: 'mage_q4',
      type: 'radio',
      label: '4. 我能解释人工智能是怎么"学"到知识的，知道它靠的是数据而不是人手写规则。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'mage_q5',
      type: 'radio',
      label: '5. 我遇到过AI给出错误或编造的信息，知道不能完全相信AI的回答。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'mage_q6',
      type: 'radio',
      label: '6. 我能举出更多人工智能在生活中的应用，还能说出它大概是怎么工作的。',
      required: true,
      options: SCALE_OPTIONS,
    },
    // 开放题
    {
      id: 'mage_q7',
      type: 'textarea',
      label: '7. 作为光影法师，请描述一次你成功使用AI工具完成任务的经历。你是如何与AI互动的？',
      placeholder: '请描述具体任务、操作步骤和结果...',
      required: true,
    },
    {
      id: 'mage_q8',
      type: 'textarea',
      label: '8. 你发现AI在哪些方面做得好，哪些方面容易出错？你是怎么判断的？',
      placeholder: '请举例说明...',
      required: false,
    },
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
    // A. 情感与态度（选2题）
    {
      id: 'scholar_q1',
      type: 'radio',
      label: '1. 学了人工智能之后，我对它更感兴趣了，还想继续探索更多。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'scholar_q2',
      type: 'radio',
      label: '2. 现在我更有信心了，觉得用人工智能工具做自己想做的事并不难。',
      required: true,
      options: SCALE_OPTIONS,
    },
    // B. 使用与协作（选2题）
    {
      id: 'scholar_q3',
      type: 'radio',
      label: '3. 我已经能用人工智能工具帮自己完成具体的任务了（比如查资料、写提纲、做计划）。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'scholar_q4',
      type: 'radio',
      label: '4. 当AI的回答不满意时，我能调整提问方式，让它给出更好的结果。',
      required: true,
      options: SCALE_OPTIONS,
    },
    // C. 认知与理解（选2题）
    {
      id: 'scholar_q5',
      type: 'radio',
      label: '5. 我能解释人工智能是怎么"学"到知识的，知道它靠的是数据而不是人手写规则。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'scholar_q6',
      type: 'radio',
      label: '6. 我遇到过AI给出错误或编造的信息，知道不能完全相信AI的回答。',
      required: true,
      options: SCALE_OPTIONS,
    },
    // D. 伦理与责任（选2题）
    {
      id: 'scholar_q7',
      type: 'radio',
      label: '7. 用了AI辅助完成的作品，我会主动标注哪些部分是AI帮忙做的。',
      required: true,
      options: SCALE_OPTIONS,
    },
    {
      id: 'scholar_q8',
      type: 'radio',
      label: '8. 我更清楚哪些事不能用AI做（比如造假、骗人、抄袭），也知道为什么。',
      required: true,
      options: SCALE_OPTIONS,
    },
    // 深度反思题
    {
      id: 'scholar_q9',
      type: 'textarea',
      label: '9. 作为秘语学者，请总结你在本次AI学习活动中的最大收获，以及你对AI的新认识。',
      placeholder: '请从知识、技能、态度等方面详细描述...',
      required: true,
    },
    {
      id: 'scholar_q10',
      type: 'textarea',
      label: '10. 如果让你给还没学过AI的同学提建议，你会告诉他们什么？',
      placeholder: '请结合你的亲身经历给出建议...',
      required: false,
    },
  ],
};

async function seedForms() {
  console.log('\n📝 步骤2：创建三个角色的最后任务表单...\n');

  const forms = [
    { key: 'guider', data: guiderForm, label: '指引者' },
    { key: 'light_mage', data: lightMageForm, label: '光影法师' },
    { key: 'secret_scholar', data: secretScholarForm, label: '秘语学者' },
  ];

  for (const form of forms) {
    // 先检查是否已存在
    const { data: existing, error: checkError } = await supabase
      .from('final_task_forms')
      .select('id, name')
      .eq('team_role', form.key)
      .eq('is_active', true)
      .limit(1);

    if (checkError) {
      console.error(`  ❌ 检查 ${form.label} 表单失败:`, checkError.message);
      continue;
    }

    if (existing && existing.length > 0) {
      console.log(`  ⏭️  ${form.label} 表单已存在 (id: ${existing[0].id})，跳过`);
      continue;
    }

    // 插入新表单
    const { data, error } = await supabase
      .from('final_task_forms')
      .insert(form.data)
      .select()
      .single();

    if (error) {
      console.error(`  ❌ 创建 ${form.label} 表单失败:`, error.message);
      // 如果是因为缺少列，尝试用旧schema
      if (error.message.includes('column') || error.message.includes('does not exist')) {
        console.log(`  🔄 尝试使用兼容schema插入...`);
        const compatData = {
          role: form.key,
          title: form.data.name,
          description: form.data.description,
          fields: form.data.form_config,
          school_id: form.data.school_id,
        };
        const { data: compatResult, error: compatError } = await supabase
          .from('final_task_forms')
          .insert(compatData)
          .select()
          .single();

        if (compatError) {
          console.error(`  ❌ 兼容插入也失败:`, compatError.message);
        } else {
          console.log(`  ✅ ${form.label} 表单创建成功 (兼容模式, id: ${compatResult.id})`);
        }
      }
    } else {
      console.log(`  ✅ ${form.label} 表单创建成功 (id: ${data.id})`);
    }
  }
}

// ============================================
// 步骤3：验证数据
// ============================================
async function verifyData() {
  console.log('\n🔍 步骤3：验证创建的表单数据...\n');

  const { data, error } = await supabase
    .from('final_task_forms')
    .select('id, name, team_role, icon, is_active, is_global, form_config')
    .in('team_role', ['guider', 'light_mage', 'secret_scholar'])
    .eq('is_active', true);

  if (error) {
    console.error('  ❌ 查询验证失败:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('  ⚠️  未找到任何角色表单，尝试用旧schema查询...');
    const { data: oldData, error: oldError } = await supabase
      .from('final_task_forms')
      .select('*')
      .in('role', ['guider', 'light_mage', 'secret_scholar']);

    if (oldError) {
      console.error('  ❌ 旧schema查询也失败:', oldError.message);
    } else if (oldData && oldData.length > 0) {
      console.log(`  ✅ 找到 ${oldData.length} 个表单（旧schema）`);
      oldData.forEach(f => {
        console.log(`     - ${f.title || f.name} (role: ${f.role || f.team_role})`);
      });
    } else {
      console.log('  ⚠️  旧schema也未找到表单');
    }
    return;
  }

  console.log(`  ✅ 找到 ${data.length} 个角色表单：`);
  data.forEach(f => {
    const fieldCount = (f as any).form_config?.length || (f as any).fields?.length || 0;
    console.log(`     - ${f.icon} ${f.name} (team_role: ${f.team_role}, ${fieldCount} 个字段)`);
  });
}

// ============================================
// 主函数
// ============================================
async function main() {
  console.log('🚀 开始创建最后任务表单...\n');
  console.log('=' .repeat(50));

  await ensureColumns();
  await seedForms();
  await verifyData();

  console.log('\n' + '='.repeat(50));
  console.log('✅ 脚本执行完毕！');
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
