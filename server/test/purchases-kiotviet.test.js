// Kiểm thử mua hàng kiểu KiotViet: phiếu nhập (lưu tạm / hoàn thành), giảm giá dòng và cả phiếu, hủy phiếu nhập,
// đặt hàng nhập nhận nhiều đợt, trả hàng nhập theo phiếu hoặc lập riêng, giá trả lại, hủy phiếu trả
import { freshDb, makeApi, suite, finish, rid, TODAY } from './harness.js';

const { G, C, E } = suite();
freshDb();
const api = makeApi();
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const d = TODAY();
const prod = async (id) => api.one('products', TH, [['id', 'eq', id]]);
const po = async (id) => api.one('purchase_orders', TH, [['id', 'eq', id]]);
const supp = async (id) => api.one('suppliers', TH, [['id', 'eq', id]]);
const fund = (await api.q('funds', TH))[0].id;
const X = (await api.call('save_party', { book_id: TH, type: 'ncc', name: 'Xưởng Bát Tràng' })).id;
const A = (await api.call('save_product', { book_id: TH, name: 'Ngói âm 27', unit: 'Viên', price1: 16000 })).id;
const B = (await api.call('save_product', { book_id: TH, name: 'Ngói dương 27', unit: 'Viên', price1: 12000 })).id;

G('Phiếu nhập: lưu tạm rồi hoàn thành, giảm giá dòng và cả phiếu');
const pn = await api.call('save_purchase_order', { book_id: TH, request_id: rid(), mode: 'nhap', supplier_id: X, order_date: d, invoice_no: '0001234',
  discount: 100000, lines: [{ product_id: A, qty: 100, unit_price: 10000, discount: 1000 }, { product_id: B, qty: 100, unit_price: 2000 }] });
let o = await po(pn.id);
C('Phiếu tạm mã PN, chưa vào kho', [pn.code.slice(0, 2), o.mode, o.status, o.status_label, (await prod(A)).on_hand], ['PN', 'nhap', 'nhap', 'Phiếu tạm', 0]);
C('Tổng tiền hàng trừ giảm giá dòng, cần trả NCC trừ giảm giá phiếu', [o.goods_total, o.discount, o.order_total, o.invoice_no], [1100000, 100000, 1000000, '0001234']);
const ls = await api.q('purchase_order_lines', TH, [['po_id', 'eq', pn.id]], 'line_no');
C('Dòng giữ đơn giá, giảm giá; giá nhập đã chia giảm giá phiếu', ls.map((l) => [l.unit_price, l.discount, l.price_net, Math.round(l.unit_cost)]), [[10000, 1000, 9000, 8182], [2000, 0, 2000, 1818]]);
await E('Giảm giá lớn hơn đơn giá bị chặn', () => api.call('save_purchase_order', { book_id: TH, mode: 'nhap', supplier_id: X, order_date: d,
  lines: [{ product_id: A, qty: 1, unit_price: 100, discount: 200 }] }), 'lớn hơn đơn giá');
await E('Giảm giá phiếu lớn hơn tổng tiền hàng bị chặn', () => api.call('save_purchase_order', { book_id: TH, mode: 'nhap', supplier_id: X, order_date: d, discount: 1000,
  lines: [{ product_id: A, qty: 1, unit_price: 100 }] }), 'lớn hơn tổng tiền hàng');
await api.call('save_purchase_order', { book_id: TH, request_id: rid(), id: pn.id, supplier_id: X, order_date: d, invoice_no: '0001234', discount: 100000, receive_now: true,
  lines: ls.map((l) => ({ id: l.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price, discount: l.discount })) });
o = await po(pn.id);
C('Hoàn thành: đã nhập hàng, công nợ NCC đúng số sau giảm giá', [o.status_label, o.received_value, (await supp(X)).payable], ['Đã nhập hàng', 1000000, 1000000]);
C('Giá vốn theo giá đã giảm', Math.round((await prod(A)).avg_cost), 8182);
const rc = (await api.q('receipts', TH, [['po_id', 'eq', pn.id]]))[0];
C('Phiếu nhận hàng hiện ở danh sách nhập hàng', [rc.po_mode, rc.status_label, rc.invoice_no, rc.value], ['nhap', 'Đã nhập hàng', '0001234', 1000000]);

G('Hủy phiếu nhập');
const pn2 = await api.call('save_purchase_order', { book_id: TH, request_id: rid(), mode: 'nhap', supplier_id: X, order_date: d, receive_now: true,
  deposit: { amount: 50000, fund_id: fund }, lines: [{ product_id: A, qty: 10, unit_price: 9000 }] });
await E('Đã trả NCC thì phải hủy phiếu chi trước', () => api.call('cancel_purchase_order', { id: pn2.id, reason: 'Nhập nhầm' }), 'hủy phiếu chi');
const pay = (await api.q('payments', TH)).find((x) => x.code === pn2.payment_code);
await api.call('void_payment', { id: pay.id, reason: 'Nhập nhầm' });
await E('Hủy phải có lý do', () => api.call('cancel_purchase_order', { id: pn2.id }), 'lý do');
await api.call('cancel_purchase_order', { id: pn2.id, reason: 'Nhập nhầm' });
o = await po(pn2.id);
C('Phiếu hủy: tồn và công nợ trở lại', [o.status_label, o.received_value, (await prod(A)).on_hand, (await supp(X)).payable], ['Đã hủy', 0, 100, 1000000]);
C('Phiếu nhận hàng của phiếu đã hủy hiện Đã hủy', (await api.q('receipts', TH, [['po_id', 'eq', pn2.id]]))[0].status_label, 'Đã hủy');
C('Giá vốn quay lại như trước khi nhập', Math.round((await prod(A)).avg_cost), 8182);

G('Đặt hàng nhập: nhận nhiều đợt, hủy một đợt nhận');
const dn = await api.call('save_purchase_order', { book_id: TH, request_id: rid(), supplier_id: X, order_date: d, status: 'xac_nhan', expected_date: d,
  lines: [{ product_id: B, qty: 50, unit_price: 2000 }] });
o = await po(dn.id);
C('Đơn đặt mã DN, đã xác nhận NCC, có số ngày chờ', [dn.code.slice(0, 2), o.mode, o.status_label, o.wait_days], ['DN', 'dat', 'Đã xác nhận NCC', 0]);
const dl = (await api.q('purchase_order_lines', TH, [['po_id', 'eq', dn.id]]))[0];
const r1 = await api.call('receive', { po_id: dn.id, request_id: rid(), date: d, lines: [{ po_line_id: dl.id, qty: 20 }] });
C('Nhận một phần', (await po(dn.id)).status_label, 'Nhập một phần');
await api.call('cancel_receipt', { id: r1.id, reason: 'Sai số lượng' });
o = await po(dn.id);
C('Hủy đợt nhận: đơn về chờ hàng, kho trở lại', [o.status_label, o.remaining_qty, (await prod(B)).on_hand], ['Đã xác nhận NCC', 50, 100]);
await api.call('receive', { po_id: dn.id, request_id: rid(), date: d, lines: [{ po_line_id: dl.id, qty: 50 }] });
C('Nhận đủ: hoàn thành', (await po(dn.id)).status_label, 'Hoàn thành');

G('Trả hàng nhập theo phiếu nhập, giá trả lại khác giá nhập');
const gl = rc.lines.find((l) => l.product_id === A);
const t1 = await api.call('supplier_return', { po_id: pn.id, request_id: rid(), date: d, reason: 'Men lỗi', discount: 1000,
  lines: [{ receipt_line_id: gl.id, qty: 10, unit_price: 8000 }] });
let t = await api.one('supplier_returns', TH, [['id', 'eq', t1.id]]);
C('NCC cần trả = giá trả lại × SL − giảm giá; kho xuất theo giá nhập', [t.goods_total, t.discount, t.value, Math.round(t.cost_value), t.status_label], [80000, 1000, 79000, 81818, 'Đã trả hàng']);
C('Công nợ NCC giảm theo số NCC cần trả', (await supp(X)).payable, 1000000 + 100000 - 79000);
await E('Không trả vượt số đã nhận', () => api.call('supplier_return', { po_id: pn.id, date: d, lines: [{ receipt_line_id: gl.id, qty: 91 }] }), 'vượt');
await E('Không hủy phiếu nhập đã có phiếu trả', () => api.call('cancel_purchase_order', { id: pn.id, reason: 'x' }), 'phiếu trả');

G('Trả hàng nhập lập riêng theo NCC, NCC hoàn tiền');
const t2 = await api.call('supplier_return', { book_id: TH, supplier_id: X, request_id: rid(), date: d, lines: [{ product_id: B, qty: 10, unit_price: 2500 }],
  refund: { amount: 25000, fund_id: fund } });
t = await api.one('supplier_returns', TH, [['id', 'eq', t2.id]]);
C('Phiếu riêng không gắn đơn, có phiếu thu hoàn tiền', [t.po_id, t.supplier_name, t.value, t.refunded, !!t2.refund_code], [null, 'Xưởng Bát Tràng', 25000, 25000, true]);
C('Kho trừ theo giá vốn bình quân', [(await prod(B)).on_hand, Math.round(t.cost_value)], [140, Math.round(10 * (181818 + 100000) / 150)]);
C('Công nợ NCC: trừ hàng trả, cộng tiền NCC đã hoàn', (await supp(X)).payable, 1021000);
await E('Trả vượt tồn bị chặn', () => api.call('supplier_return', { book_id: TH, supplier_id: X, date: d, lines: [{ product_id: B, qty: 1000 }] }), 'không đủ');
await E('Phiếu riêng không chọn dòng phiếu nhập', () => api.call('supplier_return', { book_id: TH, supplier_id: X, date: d, lines: [{ receipt_line_id: gl.id, qty: 1 }] }), 'phiếu nhập');

G('Hủy phiếu trả hàng nhập');
await E('Còn phiếu thu hoàn tiền thì chưa hủy được', () => api.call('cancel_supplier_return', { id: t2.id, reason: 'Nhầm' }), 'hủy phiếu thu');
const refund = (await api.q('payments', TH)).find((x) => x.code === t2.refund_code);
await api.call('void_payment', { id: refund.id, reason: 'Nhầm' });
await api.call('cancel_supplier_return', { id: t2.id, reason: 'Nhầm' });
C('Hủy phiếu riêng: tồn và công nợ trở lại', [(await prod(B)).on_hand, (await supp(X)).payable], [150, 1021000]);
await api.call('cancel_supplier_return', { id: t1.id, reason: 'NCC không nhận' });
t = await api.one('supplier_returns', TH, [['id', 'eq', t1.id]]);
C('Hủy phiếu theo phiếu nhập: số đã trả của dòng trở lại 0', [t.status_label, (await api.q('receipts', TH, [['po_id', 'eq', pn.id]]))[0].returned_qty], ['Đã hủy', 0]);
C('Công nợ NCC về như trước khi trả', (await supp(X)).payable, 1100000);
C('Tồn ngói âm trở lại', (await prod(A)).on_hand, 100);

finish('Mua hàng kiểu KiotViet');
