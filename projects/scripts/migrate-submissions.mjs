/**
 * 执行数据库迁移：为 final_task_submissions 添加缺失列
 * 使用 Supabase SQL RPC
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';

async function execSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql_string: sql }),
  });
  return res;
}

async function main() {
  console.log('🔧 执行数据库迁移：添加 final_task_submissions 缺失列...\n');

  const statements = [
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS task_id VARCHAR(36)",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_id VARCHAR(36)",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_role VARCHAR(20)",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS form_data JSONB",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS cycle INTEGER DEFAULT 1",
    "ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()",
  ];

  // 尝试通过 RPC 执行
  for (const sql of statements) {
    const res = await execSQL(sql);
    if (res.ok) {
      console.log(`  ✅ ${sql.substring(0, 60)}...`);
    } else {
      const text = await res.text();
      console.log(`  ❌ RPC不可用 (${res.status}), 尝试直接验证...`);
      // RPC 不可用，跳过，后面直接验证
      break;
    }
  }

  // 验证列是否已添加（通过尝试插入带新列的数据）
  console.log('\n🔍 验证列是否已添加...');
  
  const testData = {
    team_id: '00000000-0000-0000-0000-000000000001',
    task_id: 'test-verify',
    member_id: 'test-member',
    member_role: 'guider',
    form_id: '00000000-0000-0000-0000-000000000000',
    form_data: { test: true },
    cycle: 1,
  };

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(testData),
  });

  const insertData = await insertRes.json();

  if (insertRes.ok && insertData.id) {
    console.log('  ✅ 所有新列已添加成功！');
    console.log(`  插入测试数据 id: ${insertData.id}`);
    
    // 清理测试数据
    await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions?id=eq.${insertData.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    console.log('  ✅ 测试数据已清理');
  } else if (insertData.code === 'PGRST204') {
    console.log(`  ❌ 列尚未添加: ${insertData.message}`);
    console.log('\n  ⚠️  需要手动在 Supabase Dashboard 执行迁移 SQL！');
    console.log('  迁移文件位置: supabase/migrations/008_update_final_task_submissions.sql');
  } else {
    console.log('  响应:', JSON.stringify(insertData, null, 2));
  }

  // 尝试添加唯一约束
  console.log('\n📋 尝试添加唯一约束...');
  const constraintRes = await execSQL(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_final_task_submissions_unique ON final_task_submissions(team_id, task_id, member_id, cycle)"
  );
  if (constraintRes.ok) {
    console.log('  ✅ 唯一约束已添加');
  } else {
    console.log('  ⚠️  唯一约束需要手动添加');
  }
}

main().catch(console.error);
