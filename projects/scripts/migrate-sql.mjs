/**
 * 使用 Supabase Management API 执行 SQL
 * 需要先获取 access_token
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';
const PROJECT_REF = 'emfluysvhghloklrmcxi';

async function main() {
  // 使用 Supabase SQL Editor API
  const sql = `
    ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS task_id VARCHAR(36);
    ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_id VARCHAR(36);
    ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS member_role VARCHAR(20);
    ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS form_data JSONB;
    ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS cycle INTEGER DEFAULT 1;
    ALTER TABLE final_task_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  `;

  // 尝试使用 Supabase 客户端的 from 方式来间接添加列
  // 方法：通过 pg_net 扩展执行 SQL
  // 或者：直接用 service role key 调用 PostgreSQL

  // 方法3：使用 Supabase 的 query endpoint (如果可用)
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text.substring(0, 500));
}

main().catch(console.error);
