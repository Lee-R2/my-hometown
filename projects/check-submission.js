const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0'
);

async function check() {
  // Try inserting a submission to see what columns exist
  const { data, error } = await c.from('task_submissions').insert({
    team_id: '6bdf09f2-2e14-4cf2-a4ed-81a59374d181',
    task_id: 'a0000001-0001-0001-0001-000000000001',
    content: 'test',
    status: 'pending',
    cycle: 1,
  }).select().single();

  if (error) {
    console.log('task_submissions insert error:', error.message);
  } else {
    console.log('task_submissions cols:', Object.keys(data).join(', '));
    await c.from('task_submissions').delete().eq('id', data.id);
    console.log('Test record cleaned up');
  }
}
check();
