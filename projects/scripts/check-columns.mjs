import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * 逐列检查 final_task_submissions 表结构
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function tryInsert(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function main() {
  // 先用最小数据集测试
  const baseData = {
    team_id: '00000000-0000-0000-0000-000000000000',
    form_id: '00000000-0000-0000-0000-000000000000',
  };

  console.log('测试基础列...');
  let result = await tryInsert(baseData);
  console.log('基础:', JSON.stringify(result));

  // 如果基础成功，逐个添加列测试
  const extraColumns = [
    'task_id', 'member_id', 'member_role', 'form_data', 
    'cycle', 'updated_at', 'status', 'score', 'reviewer_name'
  ];

  for (const col of extraColumns) {
    const testData = { ...baseData };
    if (col === 'form_data') testData[col] = {};
    else if (col === 'cycle') testData[col] = 1;
    else if (col === 'score') testData[col] = 0;
    else testData[col] = 'test';

    const res = await tryInsert(testData);
    if (res.code === 'PGRST204') {
      console.log(`  ❌ 列不存在: ${col}`);
    } else {
      console.log(`  ✅ 列存在: ${col}`);
    }

    // 清理测试数据
    if (res.id) {
      await fetch(`${SUPABASE_URL}/rest/v1/final_task_submissions?id=eq.${res.id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      });
    }
  }
}

main().catch(console.error);
