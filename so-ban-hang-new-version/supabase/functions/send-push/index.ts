// Gửi các thông báo đang chờ (đơn mới, vận chuyển, báo cáo ngày, nhắc nợ…) lên điện thoại.
// Được lịch pg_cron gọi mỗi phút (xem supabase/schedule.sql). Biến môi trường: CRON_SECRET + các khóa VAPID.
import { flushPush, json } from '../_shared/push.ts';

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  try { return json(await flushPush()); } catch (e: any) { console.error(e); return json({ error: String(e?.message || e) }, 500); }
});
