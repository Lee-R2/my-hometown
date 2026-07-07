require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
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
