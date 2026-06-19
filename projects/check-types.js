const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZmx1eXN2aGdobG9rbHJtY3hpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgwMTYzMywiZXhwIjoyMDk1Mzc3NjMzfQ.qDB8GMxGBMW7XMJfMSjOc-8SBhxUkgH91INa9MQ7gJ0'
);

async function check() {
  // Check teams id type
  const { data: t } = await c.from('teams').select('id').limit(1);
  console.log('teams.id type:', typeof t?.[0]?.id, '- sample:', t?.[0]?.id?.substring(0, 20));

  // Check task_themes id type
  const { data: th } = await c.from('task_themes').select('id').limit(1);
  console.log('task_themes.id type:', typeof th?.[0]?.id, '- sample:', th?.[0]?.id?.substring(0, 20));

  // Check task_submissions id type
  const { data: ts } = await c.from('task_submissions').select('id').limit(1);
  console.log('task_submissions.id type:', typeof ts?.[0]?.id, '- sample:', ts?.[0]?.id?.substring(0, 20));

  // Check point_borrows columns by inserting minimal
  const { data: pb, error: pbErr } = await c.from('point_borrows').insert({
    borrower_id: '6bdf09f2-2e14-4cf2-a4ed-81a59374d181',
    lender_id: 'e12f7274-060f-4a94-95f1-75f99f747786',
    points: 5,
    repay_date: '2026-07-01',
    status: 'pending'
  }).select().single();
  if (pbErr) console.log('point_borrows error:', pbErr.message);
  else {
    console.log('point_borrows cols:', Object.keys(pb).join(', '));
    await c.from('point_borrows').delete().eq('id', pb.id);
  }
}
check();
