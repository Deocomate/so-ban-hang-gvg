// Giấy tờ theo đơn hàng: hợp đồng, biên bản giao hàng, giấy chứng nhận xuất xưởng, hóa đơn VAT.
// Mỗi giấy tờ có ô "bên mình" và (với hợp đồng, biên bản) ô "bản đối tác ký gửi lại".
// Theo dõi là tùy chọn: mặc định chỉ đơn của khách cần xuất hóa đơn VAT; khách hoặc từng đơn có thể bật / tắt riêng.
import { ctx, fail, one, all, run, insert, uuid, nowIso, json, trimNz, inList } from '../lib/context.js';
import { requirePerm, bookSettings } from './access.js';
import { scope } from './query.js';
import { COMPANY_SQL } from './reminders.js';
import { cleanUrl } from './customer-files.js';

const MAX_FILE = 15 * 1024 * 1024;
const MAX_BODY = 3 * 1024 * 1024;
const EDIT = 'ban_hang';
const VIEW = 'xem_ban_hang';

// Danh mục giấy tờ bắt buộc của một đơn và các bên cần có bản
export const DOCS = [
  { key: 'hop_dong', sides: ['minh', 'doi_tac'] },
  { key: 'bien_ban', sides: ['minh', 'doi_tac'] },
  { key: 'cn_xuat_xuong', sides: ['minh'] },
  { key: 'hoa_don_vat', sides: ['minh'] },
];
const DOC_KEYS = DOCS.map((d) => d.key);
const SIDES = ['minh', 'doi_tac'];
const KINDS = ['kinh_te', 'ca_nhan', 'nguyen_tac'];

// Đơn còn hiệu lực (không nháp, không hủy) của sổ
function orderOf(b, id) {
  const o = one(`select o.id, o.book_id, o.code, o.status, o.customer_id from sales_orders o where o.id = ? and o.book_id = ?`, id, b);
  if (!o) fail('Không tìm thấy đơn hàng');
  return o;
}
const docKey = (k) => { if (!DOC_KEYS.includes(k)) fail('Loại giấy tờ không hợp lệ'); return k; };
function sideOf(key, s) {
  if (!SIDES.includes(s) || !DOCS.find((d) => d.key === key).sides.includes(s)) fail('Giấy tờ này không có bản của bên đã chọn');
  return s;
}
function orderInfo(id) { return json(one(`select data from doc_info where ref_type = 'order' and ref_id = ?`, id)?.data); }
function patchOrderInfo(b, id, patch) {
  const cur = orderInfo(id);
  for (const [k, v] of Object.entries(patch)) if (v === null || v === undefined) delete cur[k]; else cur[k] = v;
  run(`insert into doc_info (book_id, ref_type, ref_id, data, updated_by, updated_at) values (?, 'order', ?, ?, ?, ?)
    on conflict (ref_type, ref_id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, b, id, cur, ctx.uid, nowIso());
}
const skipList = (info) => String(info.docs_skip || '').split(',').filter((k) => DOC_KEYS.includes(k));

// Có theo dõi giấy tờ của đơn không, và vì sao: đơn đặt riêng > hồ sơ khách > nhóm khách > tự động (khách cần xuất VAT)
export function trackOf(company, custTrack, groupTrack, info) {
  if (info.docs_track === '1') return { on: true, by: 'order' };
  if (info.docs_track === '0') return { on: false, by: 'order' };
  if (custTrack === 'on' || custTrack === 'off') return { on: custTrack === 'on', by: 'customer' };
  if (groupTrack === 'on' || groupTrack === 'off') return { on: groupTrack === 'on', by: 'group' };
  return { on: !!company && info.vat_skip !== '1', by: 'auto' };
}
// Thiết lập theo dõi của nhóm khách (Nhóm khách hàng → Theo dõi giấy tờ)
const groupTrackOf = (b) => { const g = bookSettings(b).customer_group_info || {}; return (name) => g[name]?.docs_track || ''; };

// Trạng thái một ô: đã tải lên › đã lập trên phần mềm › có bản giấy › thiếu (giấy tờ "không cần" thì bỏ qua)
function slotState(files, auto, skipped) {
  if (skipped) return 'khong_can';
  if (files.some((f) => f.kind !== 'paper')) return 'tai_len';
  if (auto) return 'da_lap';
  if (files.some((f) => f.kind === 'paper')) return 'ban_giay';
  return 'thieu';
}

// Bằng chứng lập trên phần mềm (chỉ bản bên mình): hợp đồng đã soạn, đơn đã có đợt giao (biên bản), đã ghi số hóa đơn VAT
function autoOf(key, r) {
  if (key === 'hop_dong') return r.contract_code ? `HĐ ${r.contract_code}` : null;
  if (key === 'bien_ban') return r.delivery_count > 0 ? `${r.delivery_count} đợt giao` : null;
  if (key === 'hoa_don_vat') return r.vat_nos ? `HĐ số ${r.vat_nos}` : null;
  return null;
}

// Gộp trạng thái mọi ô của một đơn: { slots: {key: {skip, sides: {minh: {state, auto}, ...}}}, missing, total }
function summarize(r, files, info) {
  const skip = skipList(info);
  const slots = {}; let missing = 0; let total = 0;
  for (const d of DOCS) {
    const sk = skip.includes(d.key); const sides = {};
    for (const s of d.sides) {
      const fs = files.filter((f) => f.doc_key === d.key && f.side === s);
      const auto = s === 'minh' ? autoOf(d.key, r) : null;
      const state = slotState(fs, auto, sk);
      sides[s] = { state, auto, count: fs.filter((f) => f.kind !== 'paper').length };
      if (!sk) { total++; if (state === 'thieu') missing++; }
    }
    slots[d.key] = { skip: sk, sides };
  }
  return { slots, missing, total };
}

// Các đơn của sổ kèm dữ liệu cần để tính trạng thái giấy tờ
function orderRows(b, where, args) {
  where.unshift(`o.book_id = ?`, `o.status not in ('huy', 'nhap')`); args.unshift(b);
  scope('customers', b, where, args);
  return all(`select o.id, o.code, o.kind, o.order_date, o.customer_id, o.customer_name, o.order_total, o.delivery_count, o.delivery_status, c.kind as cust_group,
      ${COMPANY_SQL} as company, json_extract(c.extra, '$.docs_track') as cust_track, di.data as info,
      k.id as contract_id, k.code as contract_code, k.kind as contract_kind, k.gdoc_url, k.body_html is not null as has_body,
      (select group_concat(t.inv_no, ', ') from tax_invoices t where t.order_id = o.id and t.direction = 'ra' and t.voided = 0) as vat_nos
    from v_sales_orders o left join customers c on c.id = o.customer_id
    left join doc_info di on di.ref_type = 'order' and di.ref_id = o.id
    left join contracts k on k.order_id = o.id
    where ${where.join(' and ')} order by o.order_date desc, o.code desc`, ...args);
}
// Tệp của nhiều đơn (không kèm nội dung); bản scan hợp đồng đính kèm kiểu cũ tính là bản bên mình đã tải lên
function filesOf(orderIds, contractIds) {
  if (!orderIds.length) return [];
  const rows = all(`select id, order_id, doc_key, side, kind, name, url, mime, size, note, created_at from order_doc_files where order_id in ${inList(orderIds)} order by created_at`, ...orderIds);
  const ks = contractIds.filter(Boolean);
  if (ks.length) {
    const legacy = all(`select a.id, k.order_id, a.name, a.mime, a.size, a.created_at from attachments a join contracts k on k.id = a.ref_id
      where a.ref_type = 'contract' and a.ref_id in ${inList(ks)}`, ...ks);
    for (const a of legacy) rows.push({ ...a, doc_key: 'hop_dong', side: 'minh', kind: 'file', legacy: true });
  }
  return rows;
}

// p = {book_id, track: 'on' | 'off', customer_id?, group?} → bảng theo dõi: mỗi đơn một dòng, trạng thái từng ô.
// Lọc theo một khách hoặc một nhóm khách (group = '' : khách chưa có nhóm).
export function order_docs_board(p) {
  const b = p.book_id;
  requirePerm(b, VIEW);
  const where = []; const args = [];
  if (p.customer_id) { where.push('o.customer_id = ?'); args.push(String(p.customer_id)); }
  if (p.group != null) { where.push(`coalesce(c.kind, '') = ?`); args.push(String(p.group)); }
  const rows = orderRows(b, where, args);
  const want = p.track === 'off' ? false : true;
  const gt = groupTrackOf(b);
  const out = [];
  const keep = rows.filter((r) => { r.infoObj = json(r.info); r.track = trackOf(r.company, r.cust_track, gt(r.cust_group), r.infoObj); return r.track.on === want; });
  const files = filesOf(keep.map((r) => r.id), keep.map((r) => r.contract_id));
  for (const r of keep) {
    const s = summarize(r, files.filter((f) => f.order_id === r.id), r.infoObj);
    out.push({ id: r.id, code: r.code, kind: r.kind, order_date: r.order_date, customer_id: r.customer_id, customer_name: r.customer_name, order_total: r.order_total,
      delivery_status: r.delivery_status, cust_group: r.cust_group || '', company: !!r.company, track: r.track, contract_id: r.contract_id, contract_code: r.contract_code, contract_kind: r.contract_kind, ...s });
  }
  return out;
}

// p = {book_id, order_id} → chi tiết giấy tờ của một đơn kèm danh sách tệp từng ô
export function order_docs(p) {
  const b = p.book_id;
  requirePerm(b, VIEW);
  const [r] = orderRows(b, ['o.id = ?'], [String(p.order_id)]);
  if (!r) fail('Không tìm thấy đơn hàng');
  const info = json(r.info);
  const files = filesOf([r.id], [r.contract_id]);
  const s = summarize(r, files, info);
  for (const d of DOCS) for (const side of d.sides) s.slots[d.key].sides[side].files = files.filter((f) => f.doc_key === d.key && f.side === side);
  const groupTrack = groupTrackOf(b)(r.cust_group);
  return { order_id: r.id, code: r.code, company: !!r.company, cust_group: r.cust_group || '', group_track: groupTrack || 'auto', cust_track: r.cust_track || 'auto',
    track: trackOf(r.company, r.cust_track, groupTrack, info),
    contract: r.contract_id ? { id: r.contract_id, code: r.contract_code, kind: r.contract_kind, gdoc_url: r.gdoc_url, has_body: !!r.has_body } : null, ...s };
}

// p = {book_id, order_id, track: 'on' | 'off' | 'auto'} — 'auto' = theo hồ sơ khách
export function set_order_docs_track(p) {
  const b = p.book_id;
  requirePerm(b, EDIT);
  const o = orderOf(b, p.order_id);
  if (!['on', 'off', 'auto'].includes(p.track)) fail('Lựa chọn theo dõi không hợp lệ');
  patchOrderInfo(b, o.id, { docs_track: p.track === 'auto' ? null : p.track === 'on' ? '1' : '0' });
  return { ok: true };
}

// p = {book_id, order_id, doc_key, skip} — giấy tờ không áp dụng cho đơn này
export function set_order_doc_skip(p) {
  const b = p.book_id;
  requirePerm(b, EDIT);
  const o = orderOf(b, p.order_id); const k = docKey(p.doc_key);
  const cur = new Set(skipList(orderInfo(o.id)));
  if (p.skip) cur.add(k); else cur.delete(k);
  patchOrderInfo(b, o.id, { docs_skip: [...cur].join(',') || null });
  return { ok: true };
}

function slotArgs(p) {
  const b = p.book_id;
  requirePerm(b, EDIT);
  const o = orderOf(b, p.order_id); const k = docKey(p.doc_key);
  return { b, o, k, side: sideOf(k, p.side) };
}
const cleanName = (v, dflt) => (trimNz(v) || dflt).replace(/[\\/]+/g, '-').slice(0, 200);

// p = {book_id, order_id, doc_key, side, name, mime, base64}
export function upload_order_doc(p) {
  const { b, o, k, side } = slotArgs(p);
  const data = Buffer.from(String(p.base64 ?? ''), 'base64');
  if (!data.length) fail('Tệp trống');
  if (data.length > MAX_FILE) fail(`Tệp "${p.name}" lớn hơn 15 MB — hãy để trên Google Drive rồi gắn link`);
  const id = uuid();
  insert('order_doc_files', { id, book_id: b, order_id: o.id, doc_key: k, side, kind: 'file', name: cleanName(p.name, 'tep'), mime: trimNz(p.mime), size: data.length, data, created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

// p = {book_id, order_id, doc_key, side, name, url}
export function add_order_doc_link(p) {
  const { b, o, k, side } = slotArgs(p);
  const url = cleanUrl(p.url);
  const id = uuid();
  insert('order_doc_files', { id, book_id: b, order_id: o.id, doc_key: k, side, kind: 'link', name: cleanName(p.name, url), url, created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

// p = {book_id, order_id, doc_key, side, note} — đã có bản giấy, chưa scan
export function mark_order_doc_paper(p) {
  const { b, o, k, side } = slotArgs(p);
  if (one(`select 1 from order_doc_files where order_id = ? and doc_key = ? and side = ? and kind = 'paper'`, o.id, k, side)) fail('Đã đánh dấu có bản giấy');
  const id = uuid();
  insert('order_doc_files', { id, book_id: b, order_id: o.id, doc_key: k, side, kind: 'paper', name: 'Bản giấy', note: trimNz(p.note), created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

export function delete_order_doc(p) {
  const f = one(`select id, book_id from order_doc_files where id = ?`, p.id);
  if (!f) fail('Không tìm thấy tệp');
  requirePerm(f.book_id, EDIT);
  run(`delete from order_doc_files where id = ?`, f.id);
  return { ok: true };
}

export function get_order_doc(p) {
  const f = one(`select book_id, kind, name, mime, data from order_doc_files where id = ?`, p.id);
  if (!f || f.kind !== 'file') fail('Không tìm thấy tệp');
  requirePerm(f.book_id, VIEW);
  return { name: f.name, mime: f.mime, base64: f.data.toString('base64') };
}

// Lưu nội dung hợp đồng soạn theo mẫu: p = {book_id, id, kind, fields, body_html (null = dựng lại từ mẫu), gdoc_url}
// Loại hợp đồng được nhớ vào hồ sơ khách để lần sau chọn sẵn.
export function save_contract_doc(p) {
  const b = p.book_id;
  requirePerm(b, EDIT);
  const k = one(`select k.id, k.order_id, o.customer_id from contracts k join sales_orders o on o.id = k.order_id where k.id = ? and k.book_id = ?`, p.id, b);
  if (!k) fail('Không tìm thấy hợp đồng');
  if (!KINDS.includes(p.kind)) fail('Loại hợp đồng không hợp lệ');
  const fields = p.fields && typeof p.fields === 'object' && !Array.isArray(p.fields) ? Object.fromEntries(Object.entries(p.fields).map(([x, v]) => [x, v == null ? '' : String(v).slice(0, 5000)])) : {};
  const body = p.body_html == null || p.body_html === '' ? null : String(p.body_html);
  if (body && body.length > MAX_BODY) fail('Nội dung hợp đồng quá dài (tối đa 3 MB) — hãy bớt ảnh chèn vào');
  const gdoc = trimNz(p.gdoc_url) ? cleanUrl(p.gdoc_url) : null;
  run(`update contracts set kind = ?, fields = ?, body_html = ?, gdoc_url = ?, updated_at = ? where id = ?`, p.kind, JSON.stringify(fields), body, gdoc, nowIso(), k.id);
  if (k.customer_id) {
    const extra = json(one(`select extra from customers where id = ?`, k.customer_id)?.extra);
    if (extra.contract_kind !== p.kind) run(`update customers set extra = ? where id = ?`, JSON.stringify({ ...extra, contract_kind: p.kind }), k.customer_id);
  }
  return { ok: true };
}

// Nội dung hợp đồng (fields, body_html) chỉ đọc khi mở trình soạn
export function get_contract_doc(p) {
  const k = one(`select book_id, kind, fields, body_html, gdoc_url from contracts where id = ?`, p.id);
  if (!k) fail('Không tìm thấy hợp đồng');
  requirePerm(k.book_id, VIEW);
  return { kind: k.kind, fields: json(k.fields), body_html: k.body_html, gdoc_url: k.gdoc_url };
}
