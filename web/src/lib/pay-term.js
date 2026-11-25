// Phương thức thanh toán của đơn hàng (chọn trên từng đơn, mặc định "trên hóa đơn bán hàng"; không tự đổi theo giá trị đơn).
// 'mac_dinh' — thanh toán trên hóa đơn bán hàng: đơn giao một lần; hóa đơn ghi tiền cọc đã nhận, các đợt thanh toán bổ sung và
//   còn phải thanh toán = giá trị hóa đơn − tiền cọc − các đợt thanh toán.
// 'don_lon' — thanh toán theo tiến độ giao hàng: mỗi chuyến đến hạn `ratio` % giá trị thực giao của chính chuyến đó; tiền cọc chỉ
//   được dùng khi chủ sổ nhập "Cấn trừ tiền cọc"; phần chưa đến hạn chỉ vào số đến hạn khi lập đợt quyết toán.
export const PAY_TERMS = [
  { value: 'mac_dinh', label: 'Thanh toán trên hóa đơn bán hàng' },
  { value: 'don_lon', label: 'Thanh toán theo tiến độ giao hàng' },
];
export const isProgress = (o) => o?.pay_term === 'don_lon';
export const payRatio = (o) => Number(o?.pay_ratio) || 70;
export const payTermLabel = (o) => (isProgress(o) ? `Theo tiến độ giao hàng – mỗi chuyến đến hạn ${payRatio(o)}%` : 'Thanh toán trên hóa đơn bán hàng');

// Số tiền đến hạn của một chuyến: ratio % giá trị thực giao của chuyến
export const tripDue = (value, ratio = 70) => Math.round(((Number(value) || 0) * (Number(ratio) || 70)) / 100);

const day = (d) => String(d || '').slice(0, 10);
const sum = (ls, k) => ls.reduce((t, x) => t + (Number(x[k]) || 0), 0);
const byDate = (a, b) => day(a.date).localeCompare(day(b.date)) || String(a.code || '').localeCompare(String(b.code || ''));

// Các khoản tiền của đơn (dòng v_doc_payments) gộp theo phiếu thu: mỗi phiếu một dòng đủ số tiền, tách theo loại cọc / thanh toán
export function receipts(pays, purpose) {
  const by = new Map();
  for (const p of pays || []) {
    if (purpose && p.purpose !== purpose) continue;
    const v = Number(p.signed_amount); if (!v) continue;
    const k = `${p.payment_id}|${p.purpose}`;
    const x = by.get(k) || { payment_id: p.payment_id, code: p.code, date: day(p.pay_date), purpose: p.purpose, ref_no: p.ref_no || '', note: p.note || '',
      invoice_code: p.invoice_code || '', fund_name: p.fund_name || '', kind: p.kind, amount: 0 };
    x.amount += v; by.set(k, x);
  }
  return [...by.values()].filter((x) => Math.abs(x.amount) >= 1).sort(byDate);
}

// Tiền trên hóa đơn bán hàng: tiền cọc đã nhận và các đợt thanh toán bổ sung.
// whole = true: hóa đơn là cả đơn (đơn bán ngay, hoặc đơn thanh toán trên hóa đơn chỉ có một hóa đơn) — tính mọi khoản của đơn;
// còn lại chỉ tính tiền khách trả cho đúng hóa đơn đó (deliveryId).
export function invoiceMoney(pays, { whole, deliveryId = null }) {
  const own = (pays || []).filter((p) => whole || (deliveryId && p.delivery_id === deliveryId));
  const deposits = whole ? receipts(own, 'coc') : [];
  const payments = receipts(whole ? own.filter((p) => p.purpose !== 'coc') : own);
  const deposit = sum(deposits, 'amount'); const paid = sum(payments, 'amount');
  return { deposits, payments, deposit, paid, total: deposit + paid };
}

// Sổ công nợ của đơn thanh toán theo tiến độ, lũy kế đến hết ngày cutoff (yyyy-mm-dd).
// invoices: hóa đơn HD (chuyến giao) của đơn — { id, code, delivery_date, total }; pays: dòng v_doc_payments của đơn;
// adjustments: dòng v_order_adjustments (cấn trừ cọc / quyết toán).
export function progressStatement({ ratio = 70, invoices = [], pays = [], adjustments = [], cutoff = '9999-12-31' }) {
  const upTo = (d) => day(d) <= cutoff;
  const trips = invoices.filter((x) => upTo(x.delivery_date)).map((x) => ({ id: x.id, code: x.code, date: day(x.delivery_date), value: Number(x.total) || 0 }))
    .sort(byDate).map((x, i) => ({ ...x, no: i + 1, due: tripDue(x.value, ratio) }));
  const adj = (kind) => adjustments.filter((a) => a.kind === kind && upTo(a.adj_date))
    .map((a) => ({ id: a.id, date: day(a.adj_date), amount: Number(a.amount) || 0, note: a.note || '' })).sort(byDate);
  const settlements = adj('quyet_toan'); const offsets = adj('can_tru_coc');
  const inRange = (pays || []).filter((p) => upTo(p.pay_date));
  const payments = receipts(inRange, 'thanh_toan'); const deposits = receipts(inRange, 'coc');
  const delivered = sum(trips, 'value'); const dueTrips = sum(trips, 'due');
  const settled = sum(settlements, 'amount'); const offset = sum(offsets, 'amount');
  const paid = sum(payments, 'amount'); const deposit = sum(deposits, 'amount');
  const due = dueTrips + settled;
  return { ratio, cutoff, trips, delivered, dueTrips, settlements, settled, due, payments, paid, offsets, offset, deposits, deposit,
    remaining: due - paid - offset, depositLeft: deposit - offset, notDue: delivered - dueTrips - settled };
}
