// Vận chuyển (Shopee Express, BEST Express, đơn vị khác): vận đơn, trạng thái (tay / tự động / file Excel), đối soát COD.
import crypto from 'node:crypto';
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, nz, rnd, asDate, asTs, today, json, vnd, outRows } from '../lib/context.js';
import { requirePerm, nextCode, once } from './access.js';
import { CARRIERS, isShipStatus, shipStatusLabel, carrierShort, carrierName, shipRank, mapTmStatus } from '../lib/labels.js';
import { doPayment } from './cash.js';
import { notify } from './notify.js';

const normTracking = (t) => String(t ?? '').replace(/\s/g, '').toUpperCase();
const minuteKey = (ts) => (ts ? ts.slice(0, 16).replace(/[-T:]/g, '') : '');

// Thêm 1 dòng lịch sử (không trùng); trả về true nếu là dòng mới
export function addShipEvent(shipId, at, status, detail, location, source) {
  const s = one(`select book_id from shipments where id = ?`, shipId);
  const key = crypto.createHash('md5').update(`${(at || '').slice(0, 19).replace(/[-T:]/g, '')}|${status ?? ''}|${detail ?? ''}`).digest('hex');
  return run(`insert into shipment_events (shipment_id, book_id, ev_at, status, detail, location, source, ev_key, created_by, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict (shipment_id, ev_key) do nothing`,
  shipId, s.book_id, at, status, detail ?? null, location ?? null, source, key, ctx.uid, nowIso()).changes > 0;
}

// Đổi trạng thái hiện tại + hệ quả (tiền COD) + thông báo
export function setShipStatus(shipId, status, at, detail) {
  const s = one(`select * from shipments where id = ?`, shipId);
  if (status == null || status === s.status) {
    run(`update shipments set last_sync_at = ?, status_detail = coalesce(?, status_detail) where id = ?`, nowIso(), detail ?? null, shipId);
    return false;
  }
  let cod = s.cod_status;
  if (status === 'giao_thanh_cong' && s.cod_status === 'chua_thu') cod = 'spx_dang_giu';
  if (['da_hoan', 'da_huy'].includes(status) && ['chua_thu', 'spx_dang_giu'].includes(s.cod_status)) cod = 'khong_thu_duoc';
  if (!['da_hoan', 'da_huy', 'dang_hoan'].includes(status) && s.cod_status === 'khong_thu_duoc') cod = s.cod_amount > 0 ? 'chua_thu' : 'khong_cod';
  run(`update shipments set status = ?, status_at = ?, status_detail = ?, cod_status = ?, last_sync_at = ?, updated_at = ? where id = ?`,
    status, at || nowIso(), detail ?? null, cod, nowIso(), nowIso(), shipId);

  const o = one(`select so.code, c.name as cname from sales_orders so left join customers c on c.id = so.customer_id where so.id = ?`, s.order_id);
  const lvl = { giao_thanh_cong: 'good', giao_that_bai: 'warn', dang_hoan: 'bad', da_hoan: 'bad', su_co: 'bad', da_huy: 'warn' }[status] || 'info';
  if (['da_lay_hang', 'dang_giao', 'giao_thanh_cong', 'giao_that_bai', 'dang_hoan', 'da_hoan', 'su_co', 'da_huy'].includes(status)) {
    const cs = carrierShort(s.carrier);
    const body = `${o.cname ?? ''} · ${cs} ${s.tracking_no}`
      + (detail ? ' · ' + detail : '')
      + (status === 'giao_thanh_cong' && s.cod_amount > 0 ? ` · ${cs} đang giữ COD ${vnd(s.cod_amount)}, chờ đối soát về tài khoản` : '')
      + (['dang_hoan', 'da_hoan'].includes(status) ? ' · Khi nhận lại hàng, mở đơn → Trả hàng để nhập lại kho' : '');
    notify(s.book_id, 'van_chuyen', lvl, `🚚 ${o.code} · ${shipStatusLabel(status)}`, body, 'ship:' + s.id, `ship:${s.id}:${status}:${minuteKey(at)}`);
  }
  return true;
}

export function create_shipment(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  return once(p, b, 'create_shipment', () => {
    const o = one(`select * from v_sales_orders where id = ? and book_id = ?`, p.order_id, b);
    if (!o) fail('Không tìm thấy đơn hàng');
    if (o.status !== 'xac_nhan') fail(`Chỉ tạo vận đơn cho đơn đã xác nhận (đơn ${o.code} đang ${o.status === 'nhap' ? 'là nháp' : 'đã hủy'})`);
    const tn = normTracking(p.tracking_no);
    if (!tn) fail('Nhập mã vận đơn (vd. SPXVN0… của Shopee Express, hoặc mã vận đơn BEST)');
    const carrier = nz(p.carrier) || 'SPX';
    if (!CARRIERS.includes(carrier)) fail('Đơn vị vận chuyển không hợp lệ');
    if (tn.length < 6) fail('Mã vận đơn quá ngắn');
    const ex = one(`select s.code, so.code as ocode from shipments s join sales_orders so on so.id = s.order_id
      where s.book_id = ? and upper(s.tracking_no) = ? and s.carrier = ?`, b, tn, carrier);
    if (ex) fail(`Mã vận đơn ${tn} đã có (vận đơn ${ex.code} của đơn ${ex.ocode})`);
    const cod = rnd(num(p.cod_amount)) ?? 0;
    if (cod < 0) fail('Tiền thu hộ không được âm');
    const did = nz(p.delivery_id);
    if (did && !one(`select 1 from deliveries where id = ? and order_id = ?`, did, o.id)) fail('Phiếu giao không thuộc đơn này');
    const id = uuid(); const code = nextCode(b, 'VD'); const now = nowIso();
    insert('shipments', { id, book_id: b, code, order_id: o.id, delivery_id: did, carrier, tracking_no: tn, status_at: now, cod_amount: cod,
      ship_fee: rnd(num(p.ship_fee)) ?? 0, cod_status: cod > 0 ? 'chua_thu' : 'khong_cod',
      receiver_name: nz(p.receiver_name) || o.customer_name, receiver_phone: nz(p.receiver_phone) || o.customer_phone,
      receiver_address: nz(p.receiver_address) || o.customer_address, note: p.note ?? null, created_by: ctx.uid, created_at: now });
    addShipEvent(id, now, 'cho_lay_hang', 'Tạo vận đơn trong sổ', null, 'he_thong');
    return { id, code, tracking_no: tn };
  });
}

export function update_shipment(p) {
  const s = one(`select * from shipments where id = ?`, p.id);
  if (!s) fail('Không tìm thấy vận đơn');
  requirePerm(s.book_id, 'ban_hang');
  if (s.cod_status === 'da_ve_tk' && 'cod_amount' in p && rnd(num(p.cod_amount)) !== s.cod_amount) {
    fail('Tiền COD của vận đơn này đã đối soát về tài khoản — không sửa được');
  }
  const cod = rnd(num(p.cod_amount)) ?? s.cod_amount;
  if (cod < 0) fail('Tiền thu hộ không được âm');
  const codStatus = ['khong_cod', 'chua_thu'].includes(s.cod_status) ? (cod > 0 ? 'chua_thu' : 'khong_cod')
    : s.cod_status === 'spx_dang_giu' && cod === 0 ? 'khong_cod' : s.cod_status;
  run(`update shipments set cod_amount = ?, cod_status = ?, ship_fee = coalesce(?, ship_fee), note = coalesce(?, note),
      receiver_name = coalesce(?, receiver_name), receiver_phone = coalesce(?, receiver_phone), receiver_address = coalesce(?, receiver_address),
      updated_at = ? where id = ?`,
  cod, codStatus, rnd(num(p.ship_fee)), p.note ?? null, p.receiver_name ?? null, p.receiver_phone ?? null, p.receiver_address ?? null, nowIso(), s.id);
  return { ok: true };
}

// Cập nhật trạng thái bằng tay (khi xem trên app hãng hoặc gọi shipper)
export function update_shipment_status(p) {
  const s = one(`select * from shipments where id = ?`, p.id);
  if (!s) fail('Không tìm thấy vận đơn');
  requirePerm(s.book_id, 'ban_hang');
  const st = p.status;
  if (!isShipStatus(st)) fail('Trạng thái vận chuyển không hợp lệ');
  const at = asTs(p.at) || nowIso();
  if (Date.parse(at) > Date.now() + 5 * 60e3) fail('Thời điểm cập nhật ở tương lai');
  addShipEvent(s.id, at, st, nz(p.note), null, 'tay');
  if (at >= s.status_at || st !== s.status) setShipStatus(s.id, st, at, nz(p.note));
  return { ok: true, status: st };
}

// Nhận cập nhật tự động (webhook hãng / TrackingMore) — chỉ máy chủ gọi.
// p = {tracking_no, status, substatus, mapped_status, latest_detail, latest_at, events:[{at, detail, location, status, substatus, mapped_status}]}
export function ingestTracking(p) {
  const tn = normTracking(p.tracking_no);
  const st = nz(p.mapped_status) || mapTmStatus(p.status, p.substatus);
  let nEv = 0, nShip = 0, changed = 0;
  for (const s of all(`select * from shipments where upper(tracking_no) = ?`, tn)) {
    nShip++;
    for (const e of p.events || []) {
      if (addShipEvent(s.id, asTs(e.at) || nowIso(), nz(e.mapped_status) || mapTmStatus(e.status, e.substatus), e.detail ?? null, e.location ?? null, 'tu_dong')) nEv++;
    }
    const lat = asTs(p.latest_at) || one(`select max(ev_at) as m from shipment_events where shipment_id = ? and source = 'tu_dong'`, s.id).m || nowIso();
    const ldet = nz(p.latest_detail)
      ?? one(`select detail from shipment_events where shipment_id = ? and source = 'tu_dong' order by ev_at desc, id desc limit 1`, s.id)?.detail ?? null;
    if (st && st !== s.status) {
      if (setShipStatus(s.id, st, lat, ldet)) changed++;
    } else {
      run(`update shipments set last_sync_at = ? where id = ?`, nowIso(), s.id);
    }
  }
  return { shipments: nShip, new_events: nEv, changed, status: st };
}

// Đối soát tiền COD: hãng chuyển 1 khoản gộp nhiều vận đơn (đã trừ cước) về tài khoản
// p = {book_id, shipment_ids[], fund_id, date, received, bank_txn_id?}
export function settle_cod(p) {
  const b = p.book_id;
  requirePerm(b, 'thu_chi');
  return once(p, b, 'settle_cod', () => {
    const ids = [...new Set((p.shipment_ids || []).map(String))];
    if (!ids.length) fail('Chọn ít nhất 1 vận đơn để đối soát');
    const idj = JSON.stringify(ids);
    const agg = one(`select count(*) as n, coalesce(sum(cod_amount), 0) as tot from shipments
      where id in (select value from json_each(?)) and book_id = ? and cod_status = 'spx_dang_giu'`, idj, b);
    if (agg.n !== ids.length) fail('Có vận đơn chưa giao thành công hoặc đã đối soát rồi');
    const cr = one(`select count(distinct carrier) as n, min(carrier) as c from shipments where id in (select value from json_each(?))`, idj);
    if (cr.n > 1) fail('Mỗi lần đối soát chỉ chọn vận đơn của 1 đơn vị vận chuyển (SPX và BEST chuyển tiền riêng)');
    const recv = rnd(num(p.received));
    if (recv == null || recv <= 0) fail(`Nhập số tiền ${carrierShort(cr.c)} thực chuyển về`);
    const feeTot = agg.tot - recv;
    if (feeTot < 0) fail(`Số tiền về (${recv}) lớn hơn tổng COD (${agg.tot}) — kiểm tra lại các vận đơn đã chọn`);
    let tx = null;
    if (nz(p.bank_txn_id)) {
      tx = one(`select * from bank_txns where id = ?`, p.bank_txn_id);
      if (!tx || tx.status !== 'cho_xu_ly') fail('Giao dịch ngân hàng không còn chờ xử lý');
      if (tx.amount !== recv) fail(`Số tiền về (${recv}) khác số tiền giao dịch ngân hàng (${tx.amount})`);
      if (tx.book_id != null && tx.book_id !== b) fail('Giao dịch thuộc sổ khác');
    }
    const d = asDate(p.date) || today();
    let left = feeTot; let i = 0; const pids = []; const codes = [];
    for (const s of all(`select sh.*, o.customer_id from shipments sh join sales_orders o on o.id = sh.order_id
        where sh.id in (select value from json_each(?)) order by sh.cod_amount, sh.id`, idj)) {
      i++;
      let fee = i === agg.n ? left : rnd(feeTot * s.cod_amount / (agg.tot || NaN));
      fee = Math.min(fee, s.cod_amount - 1); left -= fee;
      const rem = one(`select remaining_total from v_open_docs where doc_type = 'don_ban' and doc_id = ?`, s.order_id)?.remaining_total ?? 0;
      const pay = doPayment(b, { kind: 'thu_khach', party_id: s.customer_id, fund_id: p.fund_id, date: d, amount: s.cod_amount, fee,
        fee_category: 'Phí vận chuyển (ship, COD)', fee_note: `Cước / phí thu hộ ${carrierShort(cr.c)} trừ vào COD vận đơn ${s.tracking_no}`,
        method: 'COD ' + carrierName(cr.c), note: `Đối soát COD ${carrierShort(cr.c)} ${s.tracking_no}`,
        allocations: rem > 0 ? [{ doc_type: 'don_ban', doc_id: s.order_id, amount: Math.min(s.cod_amount, rem) }] : [] });
      pids.push(pay.id); codes.push(pay.code);
      run(`update shipments set cod_status = 'da_ve_tk', cod_payment_ids = ?, cod_settled_at = ?, updated_at = ? where id = ?`,
        [...json(s.cod_payment_ids, []), pay.id], nowIso(), nowIso(), s.id);
    }
    if (left !== 0) fail('Cước bị trừ lớn hơn tiền COD của vận đơn');
    if (tx) {
      run(`update bank_txns set status = 'da_ghi', book_id = ?, payment_ids = ?, handled_by = ?, handled_at = ?, match_note = ? where id = ?`,
        b, pids, ctx.uid, nowIso(), `Đối soát COD ${agg.n} vận đơn ${carrierShort(cr.c)}`, tx.id);
    }
    return { payments: codes, count: agg.n, cod_total: agg.tot, fee_total: feeTot, carrier: cr.c };
  });
}

// ---------- NHẬP TRẠNG THÁI VẬN ĐƠN HÀNG LOẠT (file Excel tải từ trang quản lý hãng) ----------
// p = {book_id, rows:[{tracking_no, status (mã trạng thái), at?, detail?}]}
export function import_shipment_statuses(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  return once(p, b, 'import_shipment_statuses', () => {
    let rows = 0, changed = 0, events = 0, same = 0; const nf = []; const bad = [];
    for (const x of p.rows || []) {
      rows++;
      const tn = normTracking(x.tracking_no); const st = x.status;
      if (!tn) continue;
      if (!isShipStatus(st)) { bad.push(tn); continue; }
      const t = asTs(x.at); const at = t && t < nowIso() ? t : nowIso();
      const s = one(`select * from shipments where book_id = ? and upper(tracking_no) = ?`, b, tn);
      if (!s) { nf.push(tn); continue; }
      if (addShipEvent(s.id, at, st, nz(x.detail), null, 'tay')) events++;
      // Ghi nhận nếu mới hơn theo thời gian, hoặc đi xa hơn trong tiến trình giao (dù giờ trong file sớm hơn lúc nhập vận đơn vào sổ)
      if (st !== s.status && (Date.parse(at) >= Date.parse(s.status_at) - 60e3 || shipRank(st) > shipRank(s.status))) {
        if (setShipStatus(s.id, st, at, nz(x.detail))) changed++;
      } else same++;
    }
    return { rows, changed, events, unchanged: same, not_found: nf, bad_status: bad };
  });
}

// ---------- NHẬT KÝ DỮ LIỆU HÃNG GỬI VỀ (webhook) ----------
export function logCarrierWebhook(p) {
  const r = run(`insert into carrier_webhook_log (carrier, received_at, tracking_no, raw_status, mapped_status, result, note, payload) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    nz(p.carrier) || 'KHAC', nowIso(), nz(p.tracking_no) ? String(p.tracking_no).toUpperCase() : null, p.raw_status != null ? String(p.raw_status).slice(0, 200) : null,
    nz(p.mapped_status), nz(p.result) || 'chua_doc_duoc', p.note != null ? String(p.note).slice(0, 500) : null, p.payload ?? null);
  const id = Number(r.lastInsertRowid);
  run(`delete from carrier_webhook_log where id < ?`, id - 3000);   // giữ 3.000 dòng gần nhất
  return { id };
}

// Chủ sổ xem 50 lần nhận gần nhất (vận đơn thuộc sổ của mình, hoặc chưa xác định được vận đơn)
export function carrier_webhook_log(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  return outRows(all(`select l.id, l.carrier, l.received_at, l.tracking_no, l.raw_status, l.mapped_status, ship_status_label(l.mapped_status) as mapped_label,
      l.result, l.note, s.order_id, o.code as order_code
    from carrier_webhook_log l
    left join shipments s on upper(s.tracking_no) = l.tracking_no and s.book_id = ?
    left join sales_orders o on o.id = s.order_id
    where (? is null or l.carrier = ?) and (s.id is not null or l.result in ('chua_doc_duoc','khong_co_van_don','loi'))
    order by l.id desc limit 50`, b, p.carrier ?? null, p.carrier ?? null));
}
