import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

/**
 * 检查 final_task_forms 和 final_task_submissions 两张表的实际列
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkTable(table) {
  console.log(`\n📋 检查 ${table} 表...`);
  
  // 获取一条数据看有哪些列
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  const data = await res.json();
  
  if (data.length > 0) {
    console.log(`  实际列: ${Object.keys(data[0]).join(', ')}`);
  } else {
    console.log('  表为空，无法确定列');
  }
}

async function main() {
  await checkTable('final_task_forms');
  await checkTable('final_task_submissions');
}

main().catch(console.error);
