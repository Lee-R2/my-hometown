/**
 * 通过 Supabase Management API 执行迁移 SQL
 * 使用 Supabase Access Token (从浏览器获取)
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const PROJECT_REF = 'emfluysvhghloklrmcxi';

// Supabase Service Key 可以用来调用 Management API
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';

async function main() {
  // 读取迁移 SQL
  const sqlPath = join(import.meta.dirname || '.', 'supabase', 'migrations', '009_add_missing_columns.sql');
  let sql;
  try {
    sql = readFileSync(sqlPath, 'utf-8');
  } catch {
    // 直接内联 SQL
    sql = `
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS task_id VARCHAR(36);
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_id VARCHAR(36);
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_role VARCHAR(20);
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS form_data JSONB;
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS cycle INTEGER DEFAULT 1;
ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_final_task_submissions_unique ON final_task_submissions(team_id, task_id, member_id, cycle);
ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT true;
ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT '🏆';
ALTER TABLE final_task_forms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
UPDATE final_task_forms SET is_global = true WHERE school_id IS NULL;
UPDATE final_task_forms SET is_global = false WHERE school_id IS NOT NULL;
ALTER TABLE task_themes ADD COLUMN IF NOT EXISTS final_task_form_id UUID;
ALTER TABLE task_themes ADD COLUMN IF NOT EXISTS guider_form_id UUID;
ALTER TABLE task_themes ADD COLUMN IF NOT EXISTS light_mage_form_id UUID;
ALTER TABLE task_themes ADD COLUMN IF NOT EXISTS secret_scholar_form_id UUID;
`;
  }

  console.log('🔧 尝试通过 Supabase SQL API 执行迁移...\n');

  // 方法1: 使用 Supabase SQL API (需要 access_token)
  const sqlApiUrl = `https://${PROJECT_REF}.supabase.co/rest/v1/rpc/exec_sql`;
  
  // 方法2: 使用 pg_query endpoint
  const pgQueryUrl = `https://${PROJECT_REF}.supabase.co/pg/query`;

  // 方法3: 使用 Supabase Management API
  // POST https://api.supabase.com/v1/projects/{ref}/database/query
  // 需要: Supabase access_token (不是 service_key)

  // 尝试方法3 - 但需要 access_token
  console.log('⚠️  Supabase Management API 需要 access_token (不是 service_key)');
  console.log('   请按以下步骤手动执行迁移：\n');
  console.log('1. 打开 Supabase Dashboard: https://supabase.com/dashboard/project/' + PROJECT_REF);
  console.log('2. 点击左侧菜单 "SQL Editor"');
  console.log('3. 复制以下 SQL 并执行：\n');
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));

  // 尝试直接通过 REST API 添加列（逐个尝试）
  console.log('\n\n🔧 尝试通过 REST API 间接添加列...');
  
  const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
  
  // 测试：尝试插入带新列的数据
  const testInsert = {
    team_id: '00000000-0000-0000-0000-000000000003',
    task_id: 'migration-test',
    member_id: 'migration-test',
    member_role: 'guider',
    form_id: '00000000-0000-0000-0000-000000000001',
    form_data: { migration: true },
    cycle: 1,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(testInsert),
  });

  const data = await res.json();
  
  if (res.status === 201 && data.id) {
    console.log('✅ 列已存在！迁移可能已执行');
    // 清理
    await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions?id=eq.${data.id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
  } else {
    console.log(`❌ 列尚未添加 (status: ${res.status})`);
    console.log('   错误:', data.message || JSON.stringify(data));
    console.log('\n   请在 Supabase Dashboard SQL Editor 中执行迁移 SQL');
  }
}

main().catch(console.error);
