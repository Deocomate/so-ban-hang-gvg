// Hợp đồng gắn 1-1 với đơn đặt hàng: đợt giao, cọc và tồn kho lấy từ đơn; ở đây chỉ giữ phần giấy tờ.
// Kèm tệp đính kèm dùng chung (bản scan hợp đồng, hóa đơn đầu vào…).
import { ctx, fail, one, run, insert, uuid, nowIso, num, bool, nz, trimNz, rnd, asDate, today } from '../lib/context.js';
import { requirePerm } from './access.js';

const MAX_FILE = 15 * 1024 * 1024;
const REFS = { contract: 'contracts', order: 'sales_orders', quote: 'quotes', tax_invoice: 'tax_invoices' };

// Số hợp đồng mặc định theo ngày ký: 1009/2026/HĐKT
const defaultCode = (d) => `${d.slice(8, 10)}${d.slice(5, 7)}/${d.slice(0, 4)}/HĐKT`;

export function save_contract(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  const d = asDate(p.sign_date) || today();
  const adv = rnd(num(p.advance_amount) ?? 0);
  if (adv < 0) fail('Tiền tạm ứng không được âm');
  const f = { sign_date: d, profile_id: nz(p.profile_id), rep_name: p.rep_name ?? null, rep_title: p.rep_title ?? null, tax_code: p.tax_code ?? null,
    transport_included: (bool(p.transport_included) ?? false) ? 1 : 0, ship_unit: p.ship_unit ?? null, ship_fee_note: p.ship_fee_note ?? null, ship_payer: p.ship_payer ?? null,
    ship_plan: p.ship_plan ?? null, advance_amount: adv, advance_note: p.advance_note ?? null, advance_date: asDate(p.advance_date), terms: p.terms ?? null, note: p.note ?? null, updated_at: nowIso() };
  const dup = (code, id) => one(`select 1 from contracts where book_id = ? and code = ? and id is not ?`, b, code, id);
  if (nz(p.id)) {
    const k = one(`select * from contracts where id = ? and book_id = ?`, p.id, b);
    if (!k) fail('Không tìm thấy hợp đồng');
    const code = trimNz(p.code) || k.code;
    if (dup(code, k.id)) fail(`Số hợp đồng "${code}" đã có`);
    const keys = Object.keys(f);
    run(`update contracts set code = ?, ${keys.map((x) => `${x} = ?`).join(', ')} where id = ?`, code, ...keys.map((x) => f[x]), k.id);
    return { id: k.id, code };
  }
  const o = one(`select * from sales_orders where id = ? and book_id = ?`, p.order_id, b);
  if (!o) fail('Không tìm thấy đơn hàng của hợp đồng');
  if (o.status === 'huy') fail('Đơn đã hủy');
  if (one(`select 1 from contracts where order_id = ?`, o.id)) fail(`Đơn ${o.code} đã có hợp đồng`);
  const code = trimNz(p.code) || defaultCode(d);
  if (dup(code, null)) fail(`Số hợp đồng "${code}" đã có — hãy nhập số khác`);
  const id = uuid();
  insert('contracts', { id, book_id: b, code, order_id: o.id, ...f, created_by: ctx.uid, created_at: nowIso() });
  return { id, code };
}

// Đề nghị thanh toán chỉ lập được sau khi đã hoàn tất đối chiếu số lượng kèm thanh toán
export function set_contract_reconciled(p) {
  const k = one(`select * from v_contracts where id = ?`, p.id);
  if (!k) fail('Không tìm thấy hợp đồng');
  requirePerm(k.book_id, 'ban_hang');
  const done = bool(p.done) ?? true;
  if (done && !k.delivery_count) fail('Hợp đồng chưa có đợt giao nào để đối chiếu');
  run(`update contracts set reconciled_at = ? where id = ?`, done ? nowIso() : null, k.id);
  return { ok: true };
}

export function upload_attachment(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  const table = REFS[p.ref_type];
  if (!table || !one(`select 1 from ${table} where id = ? and book_id = ?`, p.ref_id, b)) fail('Không tìm thấy chứng từ cần đính kèm');
  if (!trimNz(p.name)) fail('Thiếu tên tệp');
  const data = Buffer.from(String(p.base64 ?? ''), 'base64');
  if (!data.length) fail('Tệp trống');
  if (data.length > MAX_FILE) fail('Tệp lớn hơn 15 MB');
  const id = uuid();
  insert('attachments', { id, book_id: b, ref_type: p.ref_type, ref_id: p.ref_id, name: trimNz(p.name), mime: p.mime ?? null, size: data.length, data, created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

export function get_attachment(p) {
  const a = one(`select * from attachments where id = ?`, p.id);
  if (!a) fail('Không tìm thấy tệp');
  requirePerm(a.book_id, null);
  return { name: a.name, mime: a.mime, base64: a.data.toString('base64') };
}

export function delete_attachment(p) {
  const a = one(`select book_id from attachments where id = ?`, p.id);
  if (!a) fail('Không tìm thấy tệp');
  requirePerm(a.book_id, 'ban_hang');
  run(`delete from attachments where id = ?`, p.id);
  return { ok: true };
}
