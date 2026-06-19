const SUPABASE_URL = 'https://emfluysvhghloklrmcxi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0';

async function main() {
  // 检查 task_themes 表的列
  const res = await fetch(`${SUPABASE_URL}/rest/v1/task_themes?select=*&limit=1`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  const data = await res.json();
  console.log('task_themes 列:', data.length > 0 ? Object.keys(data[0]).join(', ') : '空表');
  console.log('数据:', JSON.stringify(data, null, 2).substring(0, 500));
}

main().catch(console.error);
