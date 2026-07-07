import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * 检查 final_task_submissions 表的实际列结构
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  // 尝试插入一条测试数据来检查列
  const testData = {
    team_id: '00000000-0000-0000-0000-000000000000',
    task_id: 'test',
    member_id: 'test',
    member_role: 'guider',
    form_id: '00000000-0000-0000-0000-000000000000',
    form_data: {},
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
    body: JSON.stringify(testData),
  });

  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
