// Kiểm thử: xuất hủy, xuất dùng nội bộ, sản xuất theo định mức, mua dịch vụ, nhóm khách hàng theo điều kiện
import { freshDb, makeApi, suite, finish, rid, TODAY, daysAgo } from './harness.js';

const { G, C, E } = suite();
freshDb();
const api = makeApi();
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const d = TODAY();
const fund = (await api.q('funds', TH))[0].id;
const prod = async (id) => api.one('products', TH, [['id', 'eq', id]]);
const newProd = async (name, qty, cost) => {
  const id = (await api.call('save_product', { book_id: TH, name, unit: 'Viên', price1: cost * 2 })).id;
  if (qty) await api.call('adjust_stock', { book_id: TH, date: daysAgo(5), reason: 'dau_ky', lines: [{ product_id: id, qty_delta: qty, unit_cost: cost }] });
  return id;
};
const men = await newProd('Men lam', 100, 2000);
const dat = await newProd('Đất sét', 500, 1000);
const binh = await newProd('Bình hút lộc', 0, 0);
const pl = async () => api.call('rpt_overview', { book_id: TH, from: d, to: d });

G('Xuất hủy');
const xh = await api.call('adjust_stock', { book_id: TH, request_id: rid(), date: d, reason: 'vo', note: 'Rơi vỡ', lines: [{ product_id: men, qty_delta: -10 }] });
C('Phiếu xuất hủy mang mã XH', xh.code.slice(0, 2), 'XH');
C('Tồn giảm đúng', (await prod(men)).on_hand, 90);

G('Xuất dùng nội bộ');
await E('Thiếu loại xuất bị chặn', () => api.call('adjust_stock', { book_id: TH, date: d, reason: 'noi_bo', lines: [{ product_id: men, qty_delta: -1 }] }), 'loại xuất');
await E('Ghi tăng bị chặn', () => api.call('adjust_stock', { book_id: TH, date: d, reason: 'noi_bo', purpose: 'Khác', lines: [{ product_id: men, qty_delta: 1 }] }), 'ghi giảm');
const nb = await api.call('adjust_stock', { book_id: TH, request_id: rid(), date: d, reason: 'noi_bo', purpose: 'Quà tặng khách hàng, đối tác', note: 'Tặng đối tác',
  lines: [{ product_id: men, qty_delta: -5 }] });
C('Phiếu nội bộ mang mã XNB', nb.code.slice(0, 3), 'XNB');
const nbRow = await api.one('adjustments', TH, [['id', 'eq', nb.id]]);
C('Lưu loại xuất và nhãn', [nbRow.purpose, nbRow.reason_label, nbRow.value], ['Quà tặng khách hàng, đối tác', 'Xuất dùng nội bộ', -10000]);
const p1 = await pl();
C('Lãi lỗ: hủy + nội bộ vào chi phí kho', p1.stock_loss, 30000);
const ex = await api.call('rpt_expenses', { book_id: TH, from: d, to: d });
C('Báo cáo chi phí tách nhóm Xuất dùng nội bộ', ex.filter((x) => x.grp === 'Xuất dùng nội bộ').map((x) => [x.name, x.amount]), [['Quà tặng khách hàng, đối tác', 10000]]);
C('Hao hụt kho không gồm phần nội bộ', ex.find((x) => x.grp === 'Hao hụt kho').amount, 20000);

G('Sản xuất');
await E('Không đủ thành phần bị chặn', () => api.call('save_production', { book_id: TH, date: d, product_id: binh, qty: 10, lines: [{ product_id: men, qty: 500 }] }), 'Không đủ');
await E('Không có thành phần bị chặn', () => api.call('save_production', { book_id: TH, date: d, product_id: binh, qty: 10, lines: [] }), 'chưa có thành phần');
await E('Thành phần trùng thành phẩm bị chặn', () => api.call('save_production', { book_id: TH, date: d, product_id: binh, qty: 1, lines: [{ product_id: binh, qty: 1 }] }), 'trùng');
const sx = await api.call('save_production', { book_id: TH, request_id: rid(), date: d, product_id: binh, qty: 10, save_bom: true,
  lines: [{ product_id: men, qty: 20 }, { product_id: dat, qty: 100 }] });
C('Phiếu sản xuất mã SX, giá trị = tổng thành phần', [sx.code.slice(0, 2), sx.value], ['SX', 140000]);
const b1 = await prod(binh);
C('Thành phẩm nhập kho với giá vốn từ thành phần', [b1.on_hand, b1.stock_value, b1.avg_cost], [10, 140000, 14000]);
C('Thành phần bị trừ', [(await prod(men)).on_hand, (await prod(dat)).on_hand], [65, 400]);
const bom = await api.q('bom_items', TH, [['product_id', 'eq', binh]], 'sku');
C('Lưu định mức cho 1 thành phẩm', bom.map((x) => [x.name, x.qty]).sort(), [['Men lam', 2], ['Đất sét', 10]].sort());
const pv = await api.one('productions', TH, [['id', 'eq', sx.id]]);
C('Danh sách sản xuất có thành phần', [pv.name, pv.qty, pv.lines.length, pv.unit_cost], ['Bình hút lộc', 10, 2, 14000]);
const p2 = await pl();
C('Sản xuất không làm đổi lãi lỗ', p2.stock_loss, p1.stock_loss);
const nxt = await api.call('rpt_stock', { book_id: TH, from: d, to: d });
C('NXT: sản xuất ghi vào cột điều chỉnh', [nxt.find((x) => x.id === binh).adj_qty, nxt.find((x) => x.id === dat).adj_qty], [10, -100]);
const moves = await api.q('stock_moves', TH, [['doc_id', 'eq', sx.id]]);
C('Thẻ kho ghi nhãn sản xuất', [...new Set(moves.map((m) => m.doc_label))].sort(), ['Sản xuất (thành phẩm)', 'Sản xuất (xuất nguyên liệu)']);

G('Mua dịch vụ');
const sup = (await api.call('save_party', { book_id: TH, type: 'ncc', name: 'Xe tải Minh' })).id;
await E('Thiếu nhà cung cấp bị chặn', () => api.call('save_expense', { book_id: TH, service: true, date: d, category: 'Vận chuyển', amount: 500000 }), 'nhà cung cấp');
const dv = await api.call('save_expense', { book_id: TH, request_id: rid(), service: true, date: d, category: 'Vận chuyển', description: 'Chở hàng đi Hưng Yên',
  amount: 2000000, supplier_id: sup, invoice_no: '0001234', pay_now: { fund_id: fund, amount: 500000 } });
C('Phiếu mua dịch vụ mã DV', dv.code.slice(0, 2), 'DV');
const dvRow = await api.one('expenses', TH, [['id', 'eq', dv.id]]);
C('Trả một phần, còn nợ phần còn lại', [dvRow.invoice_no, dvRow.paid, dvRow.unpaid], ['0001234', 500000, 1500000]);
C('Phần còn nợ vào công nợ nhà cung cấp', (await api.one('suppliers', TH, [['id', 'eq', sup]])).payable, 1500000);
await E('Trả ngay quá số cần trả bị chặn', () => api.call('save_expense', { book_id: TH, service: true, date: d, category: 'Vận chuyển', amount: 100, supplier_id: sup, pay_now: { fund_id: fund, amount: 200 } }), 'không quá');

G('Nhóm khách hàng');
const kA = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách A', address: 'Bát Tràng, Hà Nội' })).id;
const kB = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách B', address: 'Hưng Yên' })).id;
await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kA, order_date: d, status: 'xac_nhan', lines: [{ product_id: dat, qty: 10, unit_price: 50000 }] });
const r1 = await api.call('save_customer_group', { book_id: TH, name: 'Khách chi tiêu cao', discount: 5, discount_type: 'pct', note: 'Ưu tiên',
  conds: [{ field: 'total', op: 'gte', value: 300000 }], days: 30, auto_add: true, auto_remove: true });
C('Tự thêm khách thỏa điều kiện', r1.added, 1);
const grp = async (id) => (await api.one('customers', TH, [['id', 'eq', id]])).kind;
C('Khách A vào nhóm, khách B không', [await grp(kA), await grp(kB) ?? null], ['Khách chi tiêu cao', null]);
let st = (await api.call('my_books')).find((b) => b.id === TH).settings;
C('Lưu giảm giá và điều kiện', [st.customer_group_info['Khách chi tiêu cao'].discount, st.customer_groups.includes('Khách chi tiêu cao')], [5, true]);
await E('Trùng tên nhóm bị chặn', () => api.call('save_customer_group', { book_id: TH, name: 'khách chi tiêu cao' }), 'đã có');
await E('Giảm giá quá 100% bị chặn', () => api.call('save_customer_group', { book_id: TH, name: 'X', discount: 120, discount_type: 'pct' }), 'Giảm giá');
await api.call('save_customer_group', { book_id: TH, old_name: 'Khách chi tiêu cao', name: 'VIP', conds: [{ field: 'area', value: 'hưng yên' }], auto_add: false, auto_remove: true });
C('Đổi tên nhóm: khách đi theo, bỏ khách hết thỏa', [await grp(kA) ?? null], [null]);
await api.call('set_customer_group', { book_id: TH, customer_ids: [kA, kB], name: 'Công trình' });
C('Gán nhóm hàng loạt', [await grp(kA), await grp(kB)], ['Công trình', 'Công trình']);
await api.call('save_customer_group', { book_id: TH, old_name: 'VIP', name: 'VIP', conds: [{ field: 'area', value: 'hưng yên' }], auto_add: true });
await api.call('set_customer_group', { book_id: TH, customer_ids: [kB], name: null });
C('Cập nhật theo điều kiện thêm khách chưa có nhóm', [(await api.call('refresh_customer_groups', { book_id: TH })).added, await grp(kB)], [1, 'VIP']);
const del = await api.call('delete_customer_group', { book_id: TH, name: 'VIP' });
st = (await api.call('my_books')).find((b) => b.id === TH).settings;
C('Xóa nhóm: khách thành chưa có nhóm', [del.removed, st.customer_groups.includes('VIP'), st.customer_group_info.VIP ?? null], [1, false, null]);

G('Quyền');
const staff = await api.user('nv@gomsu.vn');
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', role: 'staff', perms: { ban_hang: true } });
api.as(staff);
await E('Nhân viên không quyền kho không sản xuất', () => api.call('save_production', { book_id: TH, product_id: binh, qty: 1, lines: [{ product_id: dat, qty: 1 }] }), 'quyền');
await E('Nhân viên không quyền danh mục không sửa nhóm', () => api.call('save_customer_group', { book_id: TH, name: 'Y' }), 'quyền');

finish('Kho · nhóm khách · mua dịch vụ');
