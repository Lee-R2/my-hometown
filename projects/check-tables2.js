require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
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
