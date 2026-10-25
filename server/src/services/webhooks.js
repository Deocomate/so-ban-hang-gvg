// Webhook nhận dữ liệu từ bên ngoài: SePay (tiền về tài khoản) và đơn vị vận chuyển (trạng thái vận đơn).
import { config } from '../config.js';
import { callService } from '../domain/rpc.js';
import { ingestBankTxn } from '../domain/bank.js';
import { ingestTracking, logCarrierWebhook } from '../domain/shipping.js';
import { CODES, mapStatus, extractItems, toIso } from '../lib/ship-status.js';
import { flushPushSoon } from './push.js';

// SePay: WebHooks → URL https://<tên-miền>/api/hooks/sepay, chứng thực "API Key" = SEPAY_API_KEY
export function sepayWebhook(headers, raw) {
  if (!config.sepayApiKey || headers.authorization !== `Apikey ${config.sepayApiKey}`) return [401, { success: false, error: 'unauthorized' }];
  let b; try { b = JSON.parse(raw); } catch { return [400, { success: false, error: 'bad json' }]; }
  if (b?.id === undefined || !b?.transferAmount) return [400, { success: false, error: 'thiếu id / transferAmount' }];
  // transactionDate dạng "2026-10-14 09:30:00" theo giờ Việt Nam
  const txnAt = typeof b.transactionDate === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(b.transactionDate)
    ? b.transactionDate.replace(' ', 'T') + '+07:00' : new Date().toISOString();
  const result = callService(ingestBankTxn, {
    provider: 'sepay', ext_id: String(b.id), account_no: b.accountNumber || b.subAccount || '', amount: b.transferAmount,
    direction: b.transferType === 'out' ? 'out' : 'in', content: b.content || b.description || '', code: b.code || null,
    txn_at: txnAt, ref: b.referenceCode || null, counter_name: null, raw: b,
  });
  flushPushSoon();
  return [200, { success: true, result }];
}

// Trạng thái vận đơn: https://<tên-miền>/api/hooks/tracking?carrier=BEST&secret=<TRACKING_WEBHOOK_SECRET>
// Nhận: (1) dạng chung {tracking_no, status (mã), detail?, at?, events?}; (2) TrackingMore {data:{tracking_number, delivery_status…}};
// (3) dữ liệu riêng của hãng (dò các trường hay gặp). Mọi lần nhận đều ghi nhật ký (Cài đặt → Đơn vị vận chuyển).
export function trackingWebhook(headers, url, raw) {
  const given = headers['x-webhook-secret'] || url.searchParams.get('secret');
  if (!config.trackingSecret || given !== config.trackingSecret) return [401, { success: false, error: 'unauthorized' }];
  const carrier = (url.searchParams.get('carrier') || 'KHAC').toUpperCase();
  if (!['SPX', 'BEST', 'KHAC'].includes(carrier)) return [400, { success: false, error: 'carrier không hợp lệ' }];
  let b;
  try { b = JSON.parse(raw); } catch {
    try { b = Object.fromEntries(new URLSearchParams(raw)); } catch { b = { raw }; }   // một số hãng gửi dạng form
  }
  const log = (x) => callService(logCarrierWebhook, { carrier, payload: b, ...x });

  const jobs = [];
  if (b?.tracking_no) {
    if (b.status && !CODES.includes(b.status)) return [400, { success: false, error: 'status không hợp lệ', allowed: CODES }];
    jobs.push({ tracking_no: b.tracking_no, raw_status: b.status, mapped: b.status, p: { tracking_no: b.tracking_no, mapped_status: b.status,
      latest_detail: b.detail, latest_at: toIso(b.at),
      events: (b.events || []).map((e) => ({ at: toIso(e.at), detail: e.detail, location: e.location, mapped_status: CODES.includes(e.status) ? e.status : null })) } });
  } else if (b?.data?.tracking_number && b?.data?.delivery_status !== undefined) {
    const d = b.data;
    const ev = (d.origin_info?.trackinfo || []).map((e) => ({ at: e.checkpoint_date, detail: e.tracking_detail || e.checkpoint_delivery_status,
      location: e.location || null, status: e.checkpoint_delivery_status, substatus: e.checkpoint_delivery_substatus }));
    jobs.push({ tracking_no: d.tracking_number, raw_status: `${d.delivery_status}/${d.substatus || ''}`,
      p: { tracking_no: d.tracking_number, status: d.delivery_status, substatus: d.substatus, latest_detail: d.latest_event || ev[0]?.detail,
        latest_at: d.latest_checkpoint_time || ev[0]?.at, events: ev } });
  } else {
    for (const it of extractItems(b)) {
      const mapped = mapStatus(carrier, it.code, it.text);
      const rawSt = [it.code, it.text].filter((x) => x !== undefined).join(' - ');
      if (!it.tracking_no || !mapped) { jobs.push({ tracking_no: it.tracking_no, raw_status: rawSt, mapped: null }); continue; }
      const label = it.text ? String(it.text) : `Mã trạng thái ${it.code}`;
      jobs.push({ tracking_no: String(it.tracking_no), raw_status: rawSt, mapped,
        p: { tracking_no: String(it.tracking_no), mapped_status: mapped, latest_detail: [label, it.location].filter(Boolean).join(' · '), latest_at: toIso(it.at),
          events: [{ at: toIso(it.at), detail: label, location: it.location ?? null, mapped_status: mapped }] } });
    }
  }

  const results = [];
  for (const j of jobs) {
    if (!j.p) {
      log({ tracking_no: j.tracking_no, raw_status: j.raw_status, result: 'chua_doc_duoc',
        note: !j.tracking_no ? 'Không tìm thấy mã vận đơn trong dữ liệu' : 'Chưa hiểu trạng thái — cần bổ sung cách đọc' });
      results.push({ tracking_no: j.tracking_no, result: 'chua_doc_duoc' });
      continue;
    }
    let data;
    try { data = callService(ingestTracking, j.p); } catch (e) {
      log({ tracking_no: j.tracking_no, raw_status: j.raw_status, result: 'loi', note: e.message });
      return [500, { success: false, error: e.message }];
    }
    const result = data.shipments === 0 ? 'khong_co_van_don' : data.changed > 0 ? 'da_cap_nhat' : 'khong_doi';
    log({ tracking_no: j.tracking_no, raw_status: j.raw_status, mapped_status: data.status ?? j.mapped, result });
    results.push({ tracking_no: j.tracking_no, result });
  }
  flushPushSoon();
  // Luôn trả 200 khi đã nhận & ghi nhật ký, để hãng không gửi lặp mãi các dữ liệu chưa đọc được
  return [200, { success: true, code: 200, message: 'ok', results }];
}
