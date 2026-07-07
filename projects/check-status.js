require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Check teams columns
  const { data: t } = await c.from('teams').select('*').limit(1);
  if (t?.[0]) {
    const cols = Object.keys(t[0]);
    console.log('teams columns:', cols.join(', '));
    console.log('  has heart_shards:', cols.includes('heart_shards'));
    console.log('  has heart_gems:', cols.includes('heart_gems'));
    console.log('  has next_task_deadline:', cols.includes('next_task_deadline'));
    console.log('  has preferred_difficulty:', cols.includes('preferred_difficulty'));
  }

  // Check which new tables exist
  const tables = ['heart_gems', 'theme_completions', 'pretest_questions', 'pretest_responses', 'team_pretest_status', 'likes'];
  for (const tbl of tables) {
    const { error } = await c.from(tbl).select('id').limit(1);
    console.log(`${tbl}: ${error ? 'MISSING - ' + error.message.substring(0, 60) : 'EXISTS'}`);
  }

  // Check point_borrows columns
  const { data: pb, error: pbErr } = await c.from('point_borrows').insert({
    borrower_id: '6bdf09f2-2e14-4cf2-a4ed-81a59374d181',
    lender_id: 'e12f7274-060f-4a94-95f1-75f99f747786',
    points: 5,
    repay_date: '2026-07-01',
    status: 'pending',
    interest_rate: 0,
    overdue_interest_rate: 0,
  }).select().single();
  if (pbErr) console.log('point_borrows insert error:', pbErr.message.substring(0, 100));
  else {
    console.log('point_borrows cols:', Object.keys(pb).join(', '));
    await c.from('point_borrows').delete().eq('id', pb.id);
  }
}
check();
