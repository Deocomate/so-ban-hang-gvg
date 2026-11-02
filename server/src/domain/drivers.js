// Lái xe và công nợ lái xe. Khoản phải trả lái xe được ghi thành 1 chi phí chưa thanh toán, nên tiền trả đi qua phiếu chi như mọi chi phí khác.
import { ctx, fail, one, run, insert, uuid, nowIso, num, bool, nz, trimNz, rnd, asDate, today } from '../lib/context.js';
import { requirePerm, nextCode, newMasterCode, checkDate, once } from './access.js';
import { doPayment, insertExpense } from './cash.js';

const FREIGHT_CATEGORY = 'Phí vận chuyển (ship, COD)';
const PAYERS = ['khach', 'cua_hang']; const COLLECTS = ['hoa_don', 'truc_tiep'];

export function save_driver(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  if (!trimNz(p.name)) fail('Thiếu tên lái xe');
  const f = { name: trimNz(p.name), phone: p.phone ?? null, plate: p.plate ?? null, id_no: p.id_no ?? null, note: p.note ?? null, active: (bool(p.active) ?? true) ? 1 : 0 };
  let id = nz(p.id);
  if (!id) {
    id = uuid();
    insert('drivers', { id, book_id: b, code: newMasterCode(b, 'LX', 'drivers'), ...f, created_at: nowIso() });
  } else if (!run(`update drivers set name = ?, phone = ?, plate = ?, id_no = ?, note = ?, active = ? where id = ? and book_id = ?`,
    f.name, f.phone, f.plate, f.id_no, f.note, f.active, id, b).changes) fail('Không tìm thấy lái xe');
  return { id };
}

// Khách trả trực tiếp cho lái xe thì cửa hàng không có khoản phải trả
const owesDriver = (payer, collect) => !(payer === 'khach' && collect === 'truc_tiep');

function insertTrip(b, t) {
  const amount = rnd(num(t.amount) ?? 0);
  if (amount <= 0) fail('Tiền vận chuyển phải lớn hơn 0');
  const payer = t.payer || 'khach'; const collect = t.collect || 'hoa_don';
  if (!PAYERS.includes(payer) || !COLLECTS.includes(collect)) fail('Cách thanh toán vận chuyển không hợp lệ');
  const drv = one(`select * from drivers where id = ? and book_id = ?`, t.driver_id, b);
  if (!drv) fail('Chưa chọn lái xe');
  const date = asDate(t.date) || today();
  checkDate(b, date);
  const code = nextCode(b, 'VC'); const id = uuid();
  const exp = owesDriver(payer, collect)
    ? insertExpense(b, { exp_date: date, category: FREIGHT_CATEGORY, description: `Vận chuyển ${code} – lái xe ${drv.name}`, amount }) : null;
  insert('driver_trips', { id, book_id: b, code, order_id: nz(t.order_id), delivery_id: nz(t.delivery_id), driver_id: drv.id, trip_date: date, amount, payer, collect,
    expense_id: exp?.id ?? null, note: t.note ?? null, created_by: ctx.uid, created_at: nowIso() });
  const paid = rnd(num(t.paid) ?? 0);
  if (paid > 0) {
    if (!exp) fail('Khách trả trực tiếp lái xe nên cửa hàng không cần trả');
    requirePerm(b, 'thu_chi');
    payExpense(b, exp.id, paid, t.fund_id, date, `Trả lái xe ${drv.name} – ${code}`);
  }
  return { id, code };
}

function payExpense(b, expenseId, amount, fundId, date, note) {
  return doPayment(b, { kind: 'chi_phi', date, fund_id: fundId, amount, method: null, note, allocations: [{ doc_type: 'chi_phi', doc_id: expenseId, amount }] });
}

function removeTrip(t) {
  if (t.expense_id) {
    if (one(`select 1 from v_alloc_signed where doc_id = ?`, t.expense_id)) fail(`Chuyến ${t.code} đã trả tiền lái xe — hãy hủy phiếu chi trước`);
    run(`update expenses set voided = 1, void_reason = ? where id = ?`, 'Hủy theo chuyến ' + t.code, t.expense_id);
  }
  run(`delete from driver_trips where id = ?`, t.id);
}

// Đơn hàng chỉ có 1 chuyến khai trong màn bán hàng: lưu lại đơn thì thay chuyến cũ. Chuyến của từng đợt giao gắn delivery_id nên không bị đụng.
export function saveOrderTrip(b, order, date, t) {
  const old = one(`select * from driver_trips where order_id = ? and delivery_id is null`, order.id);
  if (!t?.driver_id) { if (old) removeTrip(old); return null; }
  if (old && old.driver_id === t.driver_id && old.amount === rnd(num(t.amount) ?? 0) && old.payer === (t.payer || 'khach') && old.collect === (t.collect || 'hoa_don')) return { id: old.id, code: old.code };
  if (old) removeTrip(old);
  return insertTrip(b, { ...t, order_id: order.id, date: t.date || date });
}

export function save_trip(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  return once(p, b, 'save_trip', () => {
    if (nz(p.order_id) && !one(`select 1 from sales_orders where id = ? and book_id = ?`, p.order_id, b)) fail('Không tìm thấy đơn hàng');
    if (nz(p.delivery_id) && !one(`select 1 from deliveries where id = ? and book_id = ?`, p.delivery_id, b)) fail('Không tìm thấy đợt giao');
    return insertTrip(b, p);
  });
}

export function delete_trip(p) {
  const t = one(`select * from driver_trips where id = ?`, p.id);
  if (!t) fail('Không tìm thấy chuyến');
  requirePerm(t.book_id, 'ban_hang');
  removeTrip(t);
  return { ok: true };
}

export function pay_driver(p) {
  const t = one(`select * from v_driver_trips where id = ?`, p.id);
  if (!t) fail('Không tìm thấy chuyến');
  requirePerm(t.book_id, 'thu_chi');
  if (!t.expense_id) fail('Chuyến này khách trả trực tiếp lái xe');
  return once(p, t.book_id, 'pay_driver', () => {
    const amt = rnd(num(p.amount) ?? t.unpaid);
    if (amt > t.unpaid) fail(`Chỉ còn phải trả ${t.unpaid}`);
    return payExpense(t.book_id, t.expense_id, amt, p.fund_id, asDate(p.date) || today(), `Trả lái xe ${t.driver_name} – ${t.code}`);
  });
}
