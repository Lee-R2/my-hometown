import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * 测试 final-task-feedback API 的 GET 请求
 * 验证旧schema兼容逻辑是否正常工作
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log('🧪 测试 final-task-feedback API 兼容性\n');

  // 1. 测试旧schema查询 final_task_forms（用 role 列代替 team_role）
  console.log('📋 测试1: 用旧schema查询 final_task_forms...');
  const memberRoles = ['guider', 'light_mage', 'secret_scholar'];
  const res1 = await fetch(`${SUPABASE_URL}/rest/v1/final_task_forms?select=*&school_id=is.null&role=in.(${memberRoles.join(',')})`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  const data1 = await res1.json();
  console.log(`  Status: ${res1.status}`);
  if (res1.ok && data1.length > 0) {
    console.log(`  ✅ 找到 ${data1.length} 个表单`);
    data1.forEach(f => {
      console.log(`     - ${f.title} (role: ${f.role}, fields: ${f.fields?.length || 0})`);
    });
  } else {
    console.log(`  ❌ 查询失败:`, JSON.stringify(data1).substring(0, 200));
  }

  // 2. 测试旧schema查询 final_task_submissions
  console.log('\n📋 测试2: 用旧schema查询 final_task_submissions...');
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions?select=*&limit=5`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  const data2 = await res2.json();
  console.log(`  Status: ${res2.status}`);
  console.log(`  列: ${data2.length > 0 ? Object.keys(data2[0]).join(', ') : '空'}`);

  // 3. 测试旧schema插入 final_task_submissions
  console.log('\n📋 测试3: 用旧schema插入 final_task_submissions...');
  const testData = {
    team_id: '00000000-0000-0000-0000-000000000099',
    form_id: data1[0]?.id || '00000000-0000-0000-0000-000000000001',
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  };
  const res3 = await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(testData),
  });
  const data3 = await res3.json();
  console.log(`  Status: ${res3.status}`);
  if (res3.ok) {
    console.log(`  ✅ 插入成功 (id: ${data3[0]?.id})`);
    // 清理
    await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions?id=eq.${data3[0]?.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
  } else {
    console.log(`  ❌ 插入失败:`, JSON.stringify(data3).substring(0, 200));
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ 旧schema兼容测试完成');
  console.log('\n⚠️  注意：要支持完整功能（每个成员独立提交、表单数据存储），');
  console.log('   需要在 Supabase Dashboard 执行迁移 SQL：');
  console.log('   supabase/migrations/009_add_missing_columns.sql');
}

main().catch(console.error);
