// Sổ công nợ của đơn hàng: ghi từng đợt khách trả (tiền đặt cọc / khách chuyển thêm), và với đơn thanh toán theo tiến độ giao hàng
// thì cấn trừ tiền cọc, lập đợt quyết toán.
// Đơn theo tiến độ, tính lũy kế đến hết một ngày:
//   đến hạn = Σ round(giá trị thực giao từng chuyến × tỷ lệ %) + các khoản quyết toán
//   còn phải thanh toán = đến hạn − tiền khách chuyển thêm − tiền cọc đã cấn trừ
//   số dư cọc = tiền cọc đã nhận − tiền cọc đã cấn trừ; chưa đến hạn = giá trị đã giao − Σ đến hạn từng chuyến − quyết toán
import { fail, one, all, run, insert, uuid, nowIso, num, nz, trimNz, rnd, asDate, today, vnd, ctx } from '../lib/context.js';
import { requirePerm, checkDate, once } from './access.js';
import { checkTxnDate } from './order-rules.js';
import { doPayment } from './cash.js';
import { logOrder } from './order-log.js';

const END = '9999-12-31';

// Số liệu lũy kế của đơn đến hết ngày `date` (bỏ qua khoản `skipId` khi đang kiểm tra lại chính khoản đó)
export function progressAt(orderId, date = END, skipId = null) {
  const o = one(`select pay_ratio from sales_orders where id = ?`, orderId);
  const ratio = Number(o?.pay_ratio) || 70;
  const trips = all(`select total from v_order_invoices where order_id = ? and delivery_date <= ?`, orderId, date);
  const delivered = trips.reduce((t, x) => t + (Number(x.total) || 0), 0);
  const dueTrips = trips.reduce((t, x) => t + Math.round(((Number(x.total) || 0) * ratio) / 100), 0);
  const money = (purpose) => one(`select coalesce(sum(signed_amount), 0) as v from v_doc_payments where doc_type = 'don_ban' and doc_id = ? and purpose = ? and pay_date <= ?`,
    orderId, purpose, date).v;
  const adj = (kind) => one(`select coalesce(sum(amount), 0) as v from order_adjustments where order_id = ? and kind = ? and adj_date <= ? and id is not ?`,
    orderId, kind, date, skipId).v;
  const settled = adj('quyet_toan'); const offset = adj('can_tru_coc');
  const deposit = money('coc'); const paid = money('thanh_toan');
  const due = dueTrips + settled;
  return { ratio, delivered, dueTrips, settled, due, deposit, paid, offset, remaining: due - paid - offset,
    depositLeft: deposit - offset, notDue: delivered - dueTrips - settled };
}

function orderFor(p) {
  const o = one(`select * from sales_orders where id = ?`, p.order_id);
  if (!o) fail('Không tìm thấy đơn hàng');
  if (o.status === 'huy') fail('Đơn đã hủy');
  return o;
}

// Thêm đợt thanh toán của đơn: tiền đặt cọc hoặc khoản khách chuyển thêm; ngày nhận tiền, số tiền, mã giao dịch, ghi chú, chuyến giao (tùy chọn).
// Mỗi giao dịch chỉ ghi một lần: mã giao dịch đã có ở phiếu thu khác (chưa hủy) thì không nhận.
export function add_order_payment(p) {
  const o = orderFor(p); const b = o.book_id;
  requirePerm(b, 'thu_chi');
  if (o.status === 'nhap') fail('Xác nhận đơn trước khi ghi nhận thanh toán');
  const purpose = p.purpose === 'coc' ? 'coc' : p.purpose === 'thanh_toan' ? 'thanh_toan' : fail('Chọn loại tiền: đặt cọc hay thanh toán thêm');
  const ref = trimNz(p.ref_no);
  if (ref) {
    const dup = one(`select code, pay_date from payments where book_id = ? and voided = 0 and lower(trim(ref_no)) = lower(?)`, b, ref);
    if (dup) fail(`Mã giao dịch ${ref} đã ghi ở phiếu ${dup.code} ngày ${dup.pay_date.split('-').reverse().join('/')} — mỗi giao dịch chỉ ghi nhận một lần`);
  }
  let alloc = { doc_type: 'don_ban', doc_id: o.id };
  if (nz(p.delivery_id)) {
    if (!one(`select 1 from deliveries where id = ? and order_id = ?`, p.delivery_id, o.id)) fail('Chuyến giao không thuộc đơn này');
    alloc = { doc_type: 'hoa_don', doc_id: p.delivery_id };
  }
  return once(p, b, 'add_order_payment', () => {
    checkTxnDate(b, 'thu_chi', asDate(p.date) || today());
    const amount = rnd(num(p.amount));
    return doPayment(b, { kind: 'thu_khach', date: p.date, fund_id: p.fund_id, party_id: o.customer_id, amount, method: nz(p.method), ref_no: ref,
      note: trimNz(p.note) || `${purpose === 'coc' ? 'Đặt cọc' : 'Thanh toán'} đơn ${o.code}`, allocations: [{ ...alloc, amount, purpose }] });
  });
}

// Cấn trừ tiền cọc / lập đợt quyết toán (đơn thanh toán theo tiến độ giao hàng)
export function add_order_adjustment(p) {
  const o = orderFor(p); const b = o.book_id;
  requirePerm(b, 'thu_chi');
  if (o.pay_term !== 'don_lon') fail('Chỉ đơn thanh toán theo tiến độ giao hàng mới cấn trừ cọc / quyết toán');
  const kind = ['can_tru_coc', 'quyet_toan'].includes(p.kind) ? p.kind : fail('Loại không hợp lệ');
  const date = asDate(p.date) || fail('Chưa chọn ngày');
  if (date > today()) fail('Ngày không được ở tương lai');
  checkDate(b, date);
  const amount = rnd(num(p.amount));
  if (!(amount > 0)) fail('Số tiền phải lớn hơn 0');
  checkAdjustment(o.id, kind, date, amount);
  const id = uuid();
  insert('order_adjustments', { id, book_id: b, order_id: o.id, kind, adj_date: date, amount, note: trimNz(p.note), created_by: ctx.uid, created_at: nowIso() });
  logOrder(o.id, 'sua', `${kind === 'can_tru_coc' ? 'Cấn trừ tiền cọc' : 'Lập đợt quyết toán'}: ${vnd(amount)}`,
    [`Ngày ${date.split('-').reverse().join('/')}`, trimNz(p.note) ? `Ghi chú: ${p.note}` : null].filter(Boolean));
  return { id };
}

// Cấn trừ không quá số dư cọc và số còn phải thu tại ngày cấn trừ; quyết toán không quá phần chưa đến hạn.
// Kiểm tra cả ở ngày đó lẫn toàn bộ (khoản ghi lùi ngày không được làm âm số dư về sau).
function checkAdjustment(orderId, kind, date, amount, skipId = null) {
  for (const at of [date, END]) {
    const x = progressAt(orderId, at, skipId);
    const when = at === END ? 'hiện tại' : `đến ngày ${date.split('-').reverse().join('/')}`;
    if (kind === 'can_tru_coc') {
      if (amount > x.depositLeft) fail(`Số dư tiền cọc ${when} chỉ còn ${vnd(Math.max(x.depositLeft, 0))}`);
      if (at === date && amount > x.remaining) fail(`Số tiền còn phải thu ${when} chỉ còn ${vnd(Math.max(x.remaining, 0))}`);
    } else if (amount > x.notDue) fail(`Giá trị hàng đã giao chưa đến hạn ${when} chỉ còn ${vnd(Math.max(x.notDue, 0))}`);
  }
}

export function delete_order_adjustment(p) {
  const x = one(`select * from order_adjustments where id = ?`, p.id);
  if (!x) fail('Không tìm thấy khoản cần xóa');
  requirePerm(x.book_id, 'thu_chi');
  checkDate(x.book_id, x.adj_date);
  // Bỏ một khoản quyết toán không được làm khoản cấn trừ cọc đã ghi vượt số còn phải thu
  if (x.kind === 'quyet_toan') {
    for (const c of all(`select * from order_adjustments where order_id = ? and kind = 'can_tru_coc' and adj_date >= ?`, x.order_id, x.adj_date)) {
      const at = progressAt(x.order_id, c.adj_date, x.id);
      if (at.remaining < 0 && at.offset > 0) fail(`Khoản cấn trừ cọc ngày ${c.adj_date.split('-').reverse().join('/')} dựa vào đợt quyết toán này — xóa khoản cấn trừ đó trước`);
    }
  }
  run(`delete from order_adjustments where id = ?`, x.id);
  logOrder(x.order_id, 'sua', `Xóa ${x.kind === 'can_tru_coc' ? 'khoản cấn trừ tiền cọc' : 'đợt quyết toán'}: ${vnd(x.amount)}`, [`Ngày ${x.adj_date.split('-').reverse().join('/')}`]);
  return { ok: true };
}
