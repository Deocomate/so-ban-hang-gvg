// Nhận giao dịch ngân hàng từ SePay → ghi vào sổ (tự gạch nợ đơn theo mã đơn trong nội dung) → gửi thông báo.
// Cài trên SePay: WebHooks → URL https://<mã-dự-án>.supabase.co/functions/v1/sepay-webhook, xác thực "API Key".
// Biến môi trường: SEPAY_API_KEY (đúng khóa đã nhập trên SePay)
import { adminClient, flushPush, json } from '../_shared/push.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ success: false, error: 'POST only' }, 405);
  const key = Deno.env.get('SEPAY_API_KEY');
  if (!key || req.headers.get('authorization') !== `Apikey ${key}`) return json({ success: false, error: 'unauthorized' }, 401);
  let b: any;
  try { b = await req.json(); } catch { return json({ success: false, error: 'bad json' }, 400); }
  if (b?.id === undefined || !b?.transferAmount) return json({ success: false, error: 'thiếu id / transferAmount' }, 400);
  // transactionDate dạng "2026-10-14 09:30:00" theo giờ Việt Nam
  const txnAt = typeof b.transactionDate === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(b.transactionDate)
    ? b.transactionDate.replace(' ', 'T') + '+07:00' : new Date().toISOString();
  const sb = adminClient();
  const { data, error } = await sb.rpc('ingest_bank_txn', { p: {
    provider: 'sepay', ext_id: String(b.id), account_no: b.accountNumber || b.subAccount || '', amount: b.transferAmount,
    direction: b.transferType === 'out' ? 'out' : 'in', content: b.content || b.description || '', code: b.code || null,
    txn_at: txnAt, ref: b.referenceCode || null, counter_name: null, raw: b,
  } });
  if (error) { console.error(error); return json({ success: false, error: error.message }, 500); } // SePay sẽ gửi lại
  try { await flushPush(sb); } catch (e) { console.error('push', e); }   // gửi thông báo ngay; lỗi gửi không làm hỏng việc ghi sổ
  return json({ success: true, result: data });
});
