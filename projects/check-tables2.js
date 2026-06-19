const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0'
);

async function check() {
  // Check point_borrows columns
  const { data: pb, error: pbErr } = await c.from('point_borrows').select('*').limit(1);
  if (pbErr) console.log('point_borrows error:', pbErr.message);
  else console.log('point_borrows cols:', pb && pb[0] ? Object.keys(pb[0]).join(', ') : 'empty');

  // Check point_transactions columns
  const { data: pt, error: ptErr } = await c.from('point_transactions').select('*').limit(1);
  if (ptErr) console.log('point_transactions error:', ptErr.message);
  else console.log('point_transactions cols:', pt && pt[0] ? Object.keys(pt[0]).join(', ') : 'empty');

  // Check team_side_tasks columns
  const { data: ts, error: tsErr } = await c.from('team_side_tasks').select('*').limit(1);
  if (tsErr) console.log('team_side_tasks error:', tsErr.message);
  else console.log('team_side_tasks cols:', ts && ts[0] ? Object.keys(ts[0]).join(', ') : 'empty');
}
check();
