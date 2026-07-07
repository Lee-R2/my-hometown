require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
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
