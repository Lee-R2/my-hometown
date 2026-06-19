/**
 * 检查 final_task_forms 和 final_task_submissions 两张表的实际列
 */
const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';

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
