// Sổ công nợ của đơn hàng: ghi từng đợt khách trả (tiền đặt cọc / khách chuyển thêm), và với đơn thanh toán theo tiến độ giao hàng
// thì cấn trừ tiền cọc, lập đợt quyết toán.
// Đơn theo tiến độ, tính lũy kế đến hết một ngày:
//   đến hạn = Σ round(giá trị thực giao từng chuyến × tỷ lệ %) + các khoản quyết toán
//   còn phải thanh toán = đến hạn − tiền khách chuyển thêm − tiền cọc đã cấn trừ
//   số dư cọc = tiền cọc đã nhận − tiền cọc đã cấn trừ; chưa đến hạn = giá trị đã giao − Σ đến hạn từng chuyến − quyết toán
import { fail, one, all, run, insert, uuid, nowIso, num, nz, trimNz, rnd, asDate, today, vnd, ctx } from '../lib/context.js';
import { requirePerm, checkDate, once } from './access.js';
import { checkTxnDate } from './order-rules.js';
import { doPayment, insertAlloc, paySnapshot, logPayEdit } from './cash.js';
import { logOrder } from './order-log.js';

const END = '9999-12-31';

// Số liệu lũy kế của đơn đến hết ngày `date` (bỏ qua khoản `skipId` khi đang kiểm tra lại chính khoản đó)
export function progressAt(orderId, date = END, skipId = null) {
  const o = one(`select pay_ratio from sales_orders where id = ?`, orderId);
  const ratio = Number(o?.pay_ratio) || 70;
  // Tiền vận chuyển của chuyến đến hạn đủ; tỷ lệ chỉ áp vào giá trị hàng (giống web/src/lib/pay-term.js tripFigures)
  const trips = all(`select total, shipping_fee from v_order_invoices where order_id = ? and delivery_date <= ?`, orderId, date);
  const delivered = trips.reduce((t, x) => t + (Number(x.total) || 0), 0);
  const dueTrips = trips.reduce((t, x) => { const ship = Number(x.shipping_fee) || 0; return t + Math.round(((Number(x.total) || 0) - ship) * ratio / 100) + ship; }, 0);
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

// Chuyến giao của đơn (tùy chọn): khoản thu gắn chuyến đó, không thì gắn cả đơn
function allocTarget(o, deliveryId) {
  if (!nz(deliveryId)) return { doc_type: 'don_ban', doc_id: o.id };
  if (!one(`select 1 from deliveries where id = ? and order_id = ?`, deliveryId, o.id)) fail('Chuyến giao không thuộc đơn này');
  return { doc_type: 'hoa_don', doc_id: deliveryId };
}

// Thêm đợt thanh toán của đơn: tiền đặt cọc hoặc khoản khách trả thêm; ngày nhận tiền, số tiền, mã giao dịch, ghi chú, chuyến giao (tùy chọn).
// - payment_id: lấy phiếu thu đã có trong sổ (số tiền và ngày nhận theo phiếu) — phân bổ vào đơn ngay trên phiếu đó, không tạo phiếu mới.
// - offset: tiền cọc cấn trừ trong đợt này (đơn theo tiến độ; trống = 0) — ghi một khoản cấn trừ cùng ngày, không phải khoản thu mới.
// Mỗi giao dịch chỉ ghi một lần: mã giao dịch đã có ở phiếu thu khác (chưa hủy) thì không nhận.
export function add_order_payment(p) {
  const o = orderFor(p); const b = o.book_id;
  requirePerm(b, 'thu_chi');
  if (o.status === 'nhap') fail('Xác nhận đơn trước khi ghi nhận thanh toán');
  const purpose = p.purpose === 'coc' ? 'coc' : p.purpose === 'thanh_toan' ? 'thanh_toan' : fail('Chọn loại tiền: đặt cọc hay thanh toán thêm');
  const offset = rnd(num(p.offset)) || 0;
  if (offset < 0) fail('Tiền cọc cấn trừ không được âm');
  if (offset && purpose === 'coc') fail('Khoản đặt cọc không cấn trừ cọc — chọn loại "Khách trả thêm"');
  if (offset && o.pay_term !== 'don_lon') fail('Chỉ đơn thanh toán theo tiến độ giao hàng mới cấn trừ tiền cọc');
  const existing = nz(p.payment_id);
  const amount = existing ? 0 : rnd(num(p.amount)) || 0;
  if (amount < 0) fail('Số tiền phải lớn hơn 0');
  if (!existing && !amount && !offset) fail('Nhập số tiền khách trả hoặc tiền cọc cấn trừ');
  const ref = existing ? null : trimNz(p.ref_no);
  if (ref) {
    const dup = one(`select code, pay_date from payments where book_id = ? and voided = 0 and lower(trim(ref_no)) = lower(?)`, b, ref);
    if (dup) fail(`Mã giao dịch ${ref} đã ghi ở phiếu ${dup.code} ngày ${dup.pay_date.split('-').reverse().join('/')} — mỗi giao dịch chỉ ghi nhận một lần`);
  }
  const alloc = allocTarget(o, p.delivery_id);
  return once(p, b, 'add_order_payment', () => {
    let res = {};
    if (existing) res = allocateReceipt(o, existing, p.amount, purpose, alloc);
    else if (amount) {
      const date = asDate(p.date) || today();
      checkTxnDate(b, 'thu_chi', date);
      res = { ...doPayment(b, { kind: 'thu_khach', date, fund_id: p.fund_id, party_id: o.customer_id, amount, method: nz(p.method), ref_no: ref,
        note: trimNz(p.note) || `${purpose === 'coc' ? 'Đặt cọc' : 'Thanh toán'} đơn ${o.code}`, allocations: [{ ...alloc, amount, purpose }] }), date, amount };
    }
    // Cấn trừ ghi sau khoản thu: kiểm tra "không vượt số còn phải thu" đã tính khoản khách trả trong đợt này
    if (offset) res.offset_id = addAdjustment(o, 'can_tru_coc', res.date || asDate(p.date) || today(), offset,
      trimNz(p.note) || (res.code ? `Cùng đợt thanh toán phiếu ${res.code}` : null));
    return { ...res, offset };
  });
}

// Phân bổ phiếu thu đã có của khách (cả phiếu hoặc phần chưa phân bổ) vào đơn — lưu vào chính phiếu thu đó, không tạo phiếu mới.
// Khách có nhiều đơn: chỉ phần phân bổ cho đơn này được tính cho đơn; phần còn lại của phiếu vẫn chưa phân bổ.
export function allocate_receipt(p) {
  const o = orderFor(p);
  requirePerm(o.book_id, 'thu_chi');
  if (o.status === 'nhap') fail('Xác nhận đơn trước khi ghi nhận thanh toán');
  const alloc = allocTarget(o, p.delivery_id);
  return once(p, o.book_id, 'allocate_receipt', () => allocateReceipt(o, nz(p.payment_id) || fail('Chưa chọn phiếu thu'), p.amount,
    p.purpose === 'coc' ? 'coc' : 'thanh_toan', alloc));
}

function allocateReceipt(o, payId, amt, purpose, alloc) {
  const pay = one(`select * from payments where id = ?`, payId);
  if (!pay || pay.book_id !== o.book_id) fail('Không tìm thấy phiếu thu');
  if (pay.voided) fail(`Phiếu ${pay.code} đã hủy`);
  if (pay.kind !== 'thu_khach') fail(`Phiếu ${pay.code} không phải phiếu thu tiền khách`);
  if (pay.party_id !== o.customer_id) fail(`Phiếu ${pay.code} không phải của khách đơn ${o.code}`);
  checkDate(o.book_id, pay.pay_date);
  const free = pay.amount - one(`select coalesce(sum(amount), 0) as v from payment_allocations where payment_id = ?`, pay.id).v;
  const amount = amt === undefined || amt === null || amt === '' ? free : rnd(num(amt));
  if (!(amount > 0)) fail(free > 0 ? 'Số tiền phải lớn hơn 0' : `Phiếu ${pay.code} đã phân bổ hết`);
  if (amount > free) fail(`Phiếu ${pay.code} chỉ còn ${vnd(Math.max(free, 0))} chưa phân bổ`);
  const doc = one(`select remaining_total from v_open_docs where doc_type = 'don_ban' and doc_id = ?`, o.id);
  if (doc && amount > doc.remaining_total) fail(`Số tiền phân bổ (${vnd(amount)}) vượt số còn phải trả của đơn ${o.code} (${vnd(Math.max(doc.remaining_total, 0))})`);
  const before = paySnapshot(pay.id);
  insertAlloc(o.book_id, pay.id, alloc.doc_type, alloc.doc_id, amount, purpose);
  logPayEdit(pay, before, `Phân bổ vào đơn ${o.code}`);
  logOrder(o.id, 'thu_tien', `Phân bổ phiếu thu ${pay.code} vào đơn: ${vnd(amount)}`,
    [`Ngày nhận ${pay.pay_date.split('-').reverse().join('/')}`, amount !== pay.amount ? `Phiếu ${vnd(pay.amount)}, phần cho đơn này ${vnd(amount)}` : null].filter(Boolean));
  return { id: pay.id, code: pay.code, date: pay.pay_date, amount };
}

// Cấn trừ tiền cọc / lập đợt quyết toán (đơn thanh toán theo tiến độ giao hàng)
export function add_order_adjustment(p) {
  const o = orderFor(p);
  requirePerm(o.book_id, 'thu_chi');
  const kind = ['can_tru_coc', 'quyet_toan'].includes(p.kind) ? p.kind : fail('Loại không hợp lệ');
  return { id: addAdjustment(o, kind, asDate(p.date) || fail('Chưa chọn ngày'), rnd(num(p.amount)), trimNz(p.note)) };
}

function addAdjustment(o, kind, date, amount, note) {
  if (o.pay_term !== 'don_lon') fail('Chỉ đơn thanh toán theo tiến độ giao hàng mới cấn trừ cọc / quyết toán');
  if (date > today()) fail('Ngày không được ở tương lai');
  checkDate(o.book_id, date);
  if (!(amount > 0)) fail('Số tiền phải lớn hơn 0');
  checkAdjustment(o.id, kind, date, amount);
  const id = uuid();
  insert('order_adjustments', { id, book_id: o.book_id, order_id: o.id, kind, adj_date: date, amount, note: note || null, created_by: ctx.uid, created_at: nowIso() });
  logOrder(o.id, 'sua', `${kind === 'can_tru_coc' ? 'Cấn trừ tiền cọc' : 'Lập đợt quyết toán'}: ${vnd(amount)}`,
    [`Ngày ${date.split('-').reverse().join('/')}`, note ? `Ghi chú: ${note}` : null].filter(Boolean));
  return id;
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
