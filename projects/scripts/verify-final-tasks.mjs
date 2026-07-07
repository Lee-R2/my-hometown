import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * 验证脚本：检查 final_task_forms 表中的数据
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/final_task_forms?select=*`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  const data = await res.json();
  console.log('所有 final_task_forms 数据:');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
