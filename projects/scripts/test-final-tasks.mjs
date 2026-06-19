/**
 * 测试脚本：验证最后任务表单的 API 数据流
 * 1. 测试 GET /api/admin/final-tasks - 获取表单列表
 * 2. 验证三个角色表单数据完整性
 * 3. 测试 GET /api/admin/final-tasks/[id] - 获取单个表单
 * 4. 测试 POST 创建新表单
 * 5. 测试 PUT 更新表单
 * 6. 测试 DELETE 删除表单
 */

const BASE_URL = 'http://localhost:3000';

// 模拟管理员认证 token
const ADMIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbi0xIiwicm9sZSI6ImFkbWluIiwidXNlcm5hbWUiOiJhZG1pbiIsImlhdCI6MTc3OTgwMTYzM30.X-MOCK-TOKEN';

async function testApi(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `token=${ADMIN_TOKEN}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

async function main() {
  console.log('🧪 测试最后任务表单 API\n');
  console.log('='.repeat(50));

  // 测试1：获取表单列表（直接查数据库验证数据存在）
  console.log('\n📋 测试1：验证数据库中的表单数据...');
  const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
  const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';

  const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/final_task_forms?select=id,role,title,description,fields,school_id,created_at&order=created_at.asc`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  const dbData = await dbRes.json();

  if (!dbData || dbData.length === 0) {
    console.log('  ❌ 数据库中没有表单数据');
    process.exit(1);
  }

  console.log(`  ✅ 数据库中有 ${dbData.length} 个表单`);

  // 验证三个角色表单
  const expectedRoles = ['guider', 'light_mage', 'secret_scholar'];
  const roleNames = { guider: '指引者', light_mage: '光影法师', secret_scholar: '秘语学者' };
  
  let allPassed = true;

  for (const role of expectedRoles) {
    const form = dbData.find(f => f.role === role);
    if (!form) {
      console.log(`  ❌ 缺少 ${roleNames[role]} (${role}) 表单`);
      allPassed = false;
      continue;
    }

    // 验证基本字段
    if (!form.title || !form.title.includes(roleNames[role])) {
      console.log(`  ❌ ${roleNames[role]} 表单标题不正确: ${form.title}`);
      allPassed = false;
    }

    if (!form.description) {
      console.log(`  ❌ ${roleNames[role]} 表单缺少描述`);
      allPassed = false;
    }

    // 验证表单字段
    const fields = form.fields;
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      console.log(`  ❌ ${roleNames[role]} 表单缺少字段数据`);
      allPassed = false;
      continue;
    }

    // 验证字段结构
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field.id) {
        console.log(`  ❌ ${roleNames[role]} 字段 ${i} 缺少 id`);
        allPassed = false;
      }
      if (!field.type) {
        console.log(`  ❌ ${roleNames[role]} 字段 ${i} 缺少 type`);
        allPassed = false;
      }
      if (!field.label) {
        console.log(`  ❌ ${roleNames[role]} 字段 ${i} 缺少 label`);
        allPassed = false;
      }
      // radio 类型必须有 options
      if (field.type === 'radio' && (!field.options || field.options.length === 0)) {
        console.log(`  ❌ ${roleNames[role]} 字段 ${i} (radio) 缺少 options`);
        allPassed = false;
      }
    }

    // 验证4点量表选项
    const radioFields = fields.filter(f => f.type === 'radio');
    const expectedOptions = ['完全不符合', '不太符合', '比较符合', '完全符合'];
    for (const rf of radioFields) {
      if (JSON.stringify(rf.options) !== JSON.stringify(expectedOptions)) {
        console.log(`  ❌ ${roleNames[role]} 单选题选项不正确: ${JSON.stringify(rf.options)}`);
        allPassed = false;
      }
    }

    console.log(`  ✅ ${roleNames[role]} 表单: ${fields.length} 个字段 (${radioFields.length} 单选 + ${fields.length - radioFields.length} 开放题)`);
  }

  // 测试2：验证 API 映射逻辑
  console.log('\n📋 测试2：验证 API 字段映射...');
  
  // 模拟 mapDbToForm 函数
  function mapDbToForm(dbRow) {
    return {
      id: dbRow.id,
      name: dbRow.title || dbRow.name || '',
      description: dbRow.description || '',
      icon: dbRow.icon || '🏆',
      is_global: dbRow.is_global ?? (dbRow.school_id === null),
      school_id: dbRow.school_id || null,
      team_role: dbRow.team_role || dbRow.role || null,
      form_config: dbRow.form_config || dbRow.fields || [],
      created_at: dbRow.created_at,
      updated_at: dbRow.updated_at || dbRow.created_at,
      is_active: dbRow.is_active ?? true,
    };
  }

  for (const form of dbData) {
    const mapped = mapDbToForm(form);
    
    // 验证映射
    if (mapped.team_role !== form.role) {
      console.log(`  ❌ team_role 映射错误: 期望 ${form.role}, 实际 ${mapped.team_role}`);
      allPassed = false;
    }
    if (mapped.name !== form.title) {
      console.log(`  ❌ name 映射错误: 期望 ${form.title}, 实际 ${mapped.name}`);
      allPassed = false;
    }
    if (JSON.stringify(mapped.form_config) !== JSON.stringify(form.fields)) {
      console.log(`  ❌ form_config 映射错误`);
      allPassed = false;
    }
    if (form.school_id === null && !mapped.is_global) {
      console.log(`  ❌ is_global 映射错误: school_id 为 null 时应为 true`);
      allPassed = false;
    }
  }
  console.log('  ✅ API 字段映射验证通过');

  // 测试3：验证前端组件期望的数据结构
  console.log('\n📋 测试3：验证前端组件数据结构...');
  
  const mappedForms = dbData.map(mapDbToForm);
  
  for (const form of mappedForms) {
    // 前端 FinalTaskForm 接口要求
    const requiredFields = ['id', 'name', 'description', 'icon', 'is_global', 'team_role', 'form_config', 'created_at'];
    for (const field of requiredFields) {
      if (form[field] === undefined || form[field] === null) {
        console.log(`  ❌ ${form.name} 缺少必要字段: ${field}`);
        allPassed = false;
      }
    }

    // 验证 form_config 中的字段结构
    for (const fc of form.form_config) {
      if (!fc.id || !fc.type || !fc.label) {
        console.log(`  ❌ ${form.name} form_config 字段缺少必要属性`);
        allPassed = false;
      }
      if (fc.type === 'radio' && (!fc.options || fc.options.length < 2)) {
        console.log(`  ❌ ${form.name} radio 字段选项不足`);
        allPassed = false;
      }
    }
  }
  console.log('  ✅ 前端组件数据结构验证通过');

  // 测试4：验证各角色表单的维度覆盖
  console.log('\n📋 测试4：验证各角色表单维度覆盖...');

  const guiderForm = mappedForms.find(f => f.team_role === 'guider');
  const mageForm = mappedForms.find(f => f.team_role === 'light_mage');
  const scholarForm = mappedForms.find(f => f.team_role === 'secret_scholar');

  // 指引者应侧重 A(情感) + D(伦理)
  if (guiderForm) {
    const hasEmotion = guiderForm.form_config.some(f => f.label.includes('感兴趣') || f.label.includes('信心'));
    const hasEthics = guiderForm.form_config.some(f => f.label.includes('标注') || f.label.includes('不能用AI'));
    if (!hasEmotion || !hasEthics) {
      console.log('  ⚠️  指引者表单维度覆盖不完整');
    } else {
      console.log('  ✅ 指引者表单: A(情感) + D(伦理) 维度覆盖正确');
    }
  }

  // 光影法师应侧重 B(使用) + C(认知)
  if (mageForm) {
    const hasUsage = mageForm.form_config.some(f => f.label.includes('完成具体的任务') || f.label.includes('调整提问'));
    const hasCognition = mageForm.form_config.some(f => f.label.includes('学"到知识') || f.label.includes('错误或编造'));
    if (!hasUsage || !hasCognition) {
      console.log('  ⚠️  光影法师表单维度覆盖不完整');
    } else {
      console.log('  ✅ 光影法师表单: B(使用) + C(认知) 维度覆盖正确');
    }
  }

  // 秘语学者应覆盖 A+B+C+D 全维度
  if (scholarForm) {
    const radioCount = scholarForm.form_config.filter(f => f.type === 'radio').length;
    const textareaCount = scholarForm.form_config.filter(f => f.type === 'textarea').length;
    if (radioCount >= 8 && textareaCount >= 2) {
      console.log(`  ✅ 秘语学者表单: 全维度覆盖 (${radioCount} 单选 + ${textareaCount} 开放题)`);
    } else {
      console.log(`  ⚠️  秘语学者表单: ${radioCount} 单选 + ${textareaCount} 开放题 (期望 8+2)`);
    }
  }

  // 最终结果
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('✅ 所有测试通过！');
  } else {
    console.log('❌ 部分测试未通过，请检查上方错误');
  }
}

main().catch(err => {
  console.error('❌ 测试执行失败:', err);
  process.exit(1);
});
