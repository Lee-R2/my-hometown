require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://emfluysvhghloklrmcxi.supabase.co',
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Insert a test borrow record to get columns
  const testBorrow = {
    borrower_id: '6bdf09f2-2e14-4cf2-a4ed-81a59374d181',
    lender_id: 'e12f7274-060f-4a94-95f1-75f99f747786',
    points: 10,
    interest_rate: 0,
    overdue_interest_rate: 0,
    repay_date: '2026-07-01',
    status: 'pending'
  };
  const { data: pb, error: pbErr } = await c.from('point_borrows').insert(testBorrow).select().single();
  if (pbErr) console.log('point_borrows insert error:', pbErr.message);
  else {
    console.log('point_borrows cols:', Object.keys(pb).join(', '));
    // Clean up
    await c.from('point_borrows').delete().eq('id', pb.id);
    console.log('Test record cleaned up');
  }
}
check();
