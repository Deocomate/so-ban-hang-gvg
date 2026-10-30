// Nhận cập nhật trạng thái vận đơn tự động từ đơn vị vận chuyển.
// Địa chỉ đưa cho hãng:  https://<mã-dự-án>.supabase.co/functions/v1/tracking-webhook?carrier=BEST&secret=<TRACKING_WEBHOOK_SECRET>
//   carrier = BEST (BEST Express) | SPX (Shopee Express) | KHAC
// Nhận các dạng dữ liệu:
//  (1) Dạng chung của phần mềm: {tracking_no, status (mã), detail?, at?, events?:[{at, detail, location}]}
//  (2) Webhook TrackingMore (dịch vụ tra vận đơn trả phí): {data:{tracking_number, delivery_status, …}}
//  (3) Dữ liệu riêng của hãng (vd. BEST): dò các trường hay gặp (billcode / waybillNo / status / statusName / scanTime…)
// Mọi lần nhận đều ghi nhật ký (Cài đặt → Đơn vị vận chuyển) — dữ liệu chưa đọc được vẫn được lưu nguyên văn để chỉnh.
// Bảo mật: header  x-webhook-secret: <TRACKING_WEBHOOK_SECRET>  hoặc  ?secret=…
import { adminClient, flushPush, json } from '../_shared/push.ts';
import { CODES, mapStatus, extractItems, toIso } from '../_shared/shipstatus.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = Deno.env.get('TRACKING_WEBHOOK_SECRET');
  const given = req.headers.get('x-webhook-secret') || url.searchParams.get('secret');
  if (!secret || given !== secret) return json({ success: false, error: 'unauthorized' }, 401);
  const carrier = (url.searchParams.get('carrier') || 'KHAC').toUpperCase();
  if (!['SPX', 'BEST', 'KHAC'].includes(carrier)) return json({ success: false, error: 'carrier không hợp lệ' }, 400);
  let b: any;
  const raw = await req.text();
  try { b = JSON.parse(raw); } catch {
    // Một số hãng gửi dạng form: a=1&b=2
    try { b = Object.fromEntries(new URLSearchParams(raw)); } catch { b = { raw }; }
  }
  const sb = adminClient();
  const log = (x: Record<string, unknown>) => sb.rpc('log_carrier_webhook', { p: { carrier, payload: b, ...x } });

  // Gom thành danh sách cập nhật {tracking_no, p (gửi ingest_tracking), raw_status}
  const jobs: { tracking_no?: string; p?: any; raw_status?: string; mapped?: string | null }[] = [];
  if (b?.tracking_no) {                                   // (1) dạng chung
    if (b.status && !CODES.includes(b.status)) return json({ success: false, error: 'status không hợp lệ', allowed: CODES }, 400);
    jobs.push({ tracking_no: b.tracking_no, raw_status: b.status, mapped: b.status, p: { tracking_no: b.tracking_no, mapped_status: b.status,
      latest_detail: b.detail, latest_at: toIso(b.at), events: (b.events || []).map((e: any) => ({ at: toIso(e.at), detail: e.detail, location: e.location, mapped_status: CODES.includes(e.status) ? e.status : null })) } });
  } else if (b?.data?.tracking_number && b?.data?.delivery_status !== undefined) {   // (2) TrackingMore
    const d = b.data;
    const ev = (d.origin_info?.trackinfo || []).map((e: any) => ({ at: e.checkpoint_date, detail: e.tracking_detail || e.checkpoint_delivery_status,
      location: e.location || null, status: e.checkpoint_delivery_status, substatus: e.checkpoint_delivery_substatus }));
    jobs.push({ tracking_no: d.tracking_number, raw_status: `${d.delivery_status}/${d.substatus || ''}`, mapped: undefined as any,
      p: { tracking_no: d.tracking_number, status: d.delivery_status, substatus: d.substatus, latest_detail: d.latest_event || ev[0]?.detail,
           latest_at: d.latest_checkpoint_time || ev[0]?.at, events: ev } });
  } else {                                                // (3) dữ liệu riêng của hãng
    for (const it of extractItems(b)) {
      const mapped = mapStatus(carrier, it.code, it.text);
      const rawSt = [it.code, it.text].filter((x) => x !== undefined).join(' - ');
      if (!it.tracking_no || !mapped) { jobs.push({ tracking_no: it.tracking_no, raw_status: rawSt, mapped: null }); continue; }
      const label = it.text ? String(it.text) : `Mã trạng thái ${it.code}`;
      const detail = [label, it.location].filter(Boolean).join(' · ');
      jobs.push({ tracking_no: String(it.tracking_no), raw_status: rawSt, mapped,
        p: { tracking_no: String(it.tracking_no), mapped_status: mapped, latest_detail: detail, latest_at: toIso(it.at),
             events: [{ at: toIso(it.at), detail: label, location: it.location ?? null, mapped_status: mapped }] } });
    }
  }

  const results: unknown[] = [];
  for (const j of jobs) {
    if (!j.p) {
      await log({ tracking_no: j.tracking_no, raw_status: j.raw_status, result: 'chua_doc_duoc',
        note: !j.tracking_no ? 'Không tìm thấy mã vận đơn trong dữ liệu' : 'Chưa hiểu trạng thái — cần bổ sung cách đọc' });
      results.push({ tracking_no: j.tracking_no, result: 'chua_doc_duoc' }); continue;
    }
    const { data, error } = await sb.rpc('ingest_tracking', { p: j.p });
    if (error) { await log({ tracking_no: j.tracking_no, raw_status: j.raw_status, result: 'loi', note: error.message }); return json({ success: false, error: error.message }, 500); }
    const result = data.shipments === 0 ? 'khong_co_van_don' : data.changed > 0 ? 'da_cap_nhat' : 'khong_doi';
    await log({ tracking_no: j.tracking_no, raw_status: j.raw_status, mapped_status: data.status ?? j.mapped, result });
    results.push({ tracking_no: j.tracking_no, result });
  }
  try { await flushPush(sb); } catch (e) { console.error('push', e); }
  // Luôn trả 200 khi đã nhận & ghi nhật ký, để hãng không gửi lặp mãi các dữ liệu chưa đọc được
  return json({ success: true, code: 200, message: 'ok', results });
});
