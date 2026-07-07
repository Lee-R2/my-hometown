require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check point_transfers table
  const { data: pt, error: ptErr } = await c.from('point_transfers').select('*').limit(1);
  if (ptErr) console.log('point_transfers:', ptErr.message.substring(0, 80));
  else console.log('point_transfers: EXISTS, cols=', pt?.[0] ? Object.keys(pt[0]).join(', ') : 'empty');

  // Check team_side_tasks columns
  const { data: ts, error: tsErr } = await c.from('team_side_tasks').select('*').limit(1);
  if (tsErr) console.log('team_side_tasks:', tsErr.message.substring(0, 80));
  else console.log('team_side_tasks: EXISTS, cols=', ts?.[0] ? Object.keys(ts[0]).join(', ') : 'empty');

  // Check point_borrows columns by inserting test
  const { data: pb, error: pbErr } = await c.from('point_borrows').insert({
    borrower_id: '6bdf09f2-2e14-4cf2-a4ed-81a59374d181',
    lender_id: 'e12f7274-060f-4a94-95f1-75f99f747786',
    points: 5,
    repay_date: '2026-07-01',
    status: 'pending',
    interest_rate: 0,
    overdue_interest_rate: 0,
  }).select().single();
  if (pbErr) console.log('point_borrows:', pbErr.message.substring(0, 100));
  else {
    console.log('point_borrows: cols=', Object.keys(pb).join(', '));
    await c.from('point_borrows').delete().eq('id', pb.id);
  }
}
check();
