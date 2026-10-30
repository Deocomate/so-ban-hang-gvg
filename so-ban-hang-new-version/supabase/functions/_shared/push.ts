// Gửi các thông báo đang chờ lên điện thoại (Web Push, chuẩn VAPID).
// Biến môi trường: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (vd. mailto:email-cua-anh@gmail.com)
import { sendWebPush, b64uDecode } from './webpush.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

// Khóa của máy nhận phải là điểm P-256 hợp lệ; khóa hỏng có thể làm sập tiến trình khi mã hóa → loại trước
const b64u = b64uDecode;
async function validSub(s: any) {
  try {
    const k = b64u(s.p256dh); const a = b64u(s.auth);
    if (k.length !== 65 || k[0] !== 4 || a.length < 16) return false;
    await crypto.subtle.importKey('raw', k, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return /^https:\/\//.test(s.endpoint);
  } catch { return false; }
}

export async function flushPush(sb = adminClient()) {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return { skipped: 'Chưa cài VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' };
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';
  const { data: queue, error } = await sb.rpc('push_queue', { p: { limit: 100 } });
  if (error) throw error;
  const ok = new Set<string>(), dead = new Set<string>(), ids: number[] = [];
  for (const n of queue as any[]) {
    const payload = JSON.stringify({ id: n.id, title: n.title, body: n.body, link: n.link, level: n.level, book_id: n.book_id, tag: 'n' + n.id });
    await Promise.all((n.subs || []).map(async (s: any) => {
      if (dead.has(s.endpoint)) return;
      if (!(await validSub(s))) { dead.add(s.endpoint); return; }
      try {
        const r = await sendWebPush(s, payload, { publicKey: pub, privateKey: priv, subject, ttl: 86400, urgency: n.level === 'bad' ? 'high' : 'normal' });
        if (r.ok) ok.add(s.endpoint);
        else if (r.status === 404 || r.status === 410 || r.invalidKey) dead.add(s.endpoint);   // máy đã hủy đăng ký / khóa hỏng → xóa
        else console.error('push lỗi', r.status, r.text.slice(0, 200));
      } catch (e: any) { console.error('push lỗi', e?.message || e); }
    }));
    ids.push(n.id);
  }
  if (ids.length || dead.size) await sb.rpc('push_done', { p: { ids, ok_endpoints: [...ok], dead_endpoints: [...dead] } });
  return { notifications: ids.length, delivered_to: ok.size, removed: dead.size };
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
