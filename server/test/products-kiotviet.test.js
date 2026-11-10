// Kiểm thử hàng hóa kiểu KiotViet: loại hàng (dịch vụ, combo, sản xuất), tồn đầu từ form, đơn vị quy đổi, biến thể, xóa hàng, bảng giá có tên
import { freshDb, makeApi, suite, finish, rid, TODAY, daysAgo } from './harness.js';

const { G, C, E } = suite();
freshDb();
const api = makeApi();
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const d = TODAY();
const prod = async (id) => api.one('products', TH, [['id', 'eq', id]]);
const KL = (await api.q('customers', TH)).find((c) => c.code === 'KL').id;

G('Tồn đầu và giá vốn nhập ở form');
const ngoi = await api.call('save_product', { book_id: TH, name: 'Ngói âm 27', unit: 'Viên', price1: 16000, price2: 15000, cost: 9000, opening_qty: 1000,
  max_stock: 5000, low_stock: 100, location: 'Kệ A1', width: 27, length: 20, dim_unit: 'cm', description: 'Ngói men đỏ', order_note: 'Kiểm đủ 4 góc',
  images: ['a.jpg', 'b.jpg'], sell_direct: true });
let p = await prod(ngoi.id);
C('Tồn và giá vốn từ phiếu tồn đầu', [p.on_hand, p.avg_cost], [1000, 9000]);
C('Trường mới lưu đủ', [p.product_type, p.max_stock, p.location, p.width, p.length, p.dim_unit, p.description, p.order_note, p.images, p.image_url, p.sell_direct],
  ['hang', 5000, 'Kệ A1', 27, 20, 'cm', 'Ngói men đỏ', 'Kiểm đủ 4 góc', ['a.jpg', 'b.jpg'], 'a.jpg', true]);
const THUMB = 'data:image/jpeg;base64,/9j/thumb';
await api.call('save_product', { ...p, book_id: TH, thumb: THUMB, images: ['data:image/jpeg;base64,/9j/full'] });
const one1 = await prod(ngoi.id);
const inList = (await api.q('products', TH)).find((x) => x.id === ngoi.id);
C('Ảnh đại diện là bản thu nhỏ; danh sách không tải ảnh đầy đủ, xem một mã thì có', [one1.image_url, one1.images.length, 'images' in inList, inList.image_url], [THUMB, 1, false, THUMB]);
await api.call('save_product', { ...one1, book_id: TH, thumb: 'không phải ảnh' });
C('Ảnh thu nhỏ không hợp lệ thì dùng ảnh đầu', (await prod(ngoi.id)).image_url, 'data:image/jpeg;base64,/9j/full');
await api.call('save_product', { ...p, book_id: TH, images: ['a.jpg', 'b.jpg'] });
const adj = (await api.q('adjustments', TH)).find((a) => a.reason === 'dau_ky');
C('Có phiếu Tồn đầu kỳ làm chứng từ', !!adj, true);
await E('Tồn tối đa nhỏ hơn tồn tối thiểu bị chặn', () => api.call('save_product', { book_id: TH, name: 'X', low_stock: 10, max_stock: 5 }), 'cao nhất');
await E('Quá 5 ảnh bị chặn', () => api.call('save_product', { book_id: TH, name: 'X', images: ['1', '2', '3', '4', '5', '6'] }), '5 ảnh');

G('Đơn vị quy đổi');
await api.call('save_product', { ...p, book_id: TH, id: ngoi.id, units: [{ name: 'Hộp', conv: 100, prices: [1500000, null, null, null] }, { name: 'Pallet', conv: 1000, sell_direct: false }] });
p = await prod(ngoi.id);
C('Lưu đơn vị và giá riêng', p.units.map((u) => [u.name, u.conv, u.prices[0], u.sell_direct]), [['Hộp', 100, 1500000, 1], ['Pallet', 1000, null, 0]]);
await E('Trùng tên đơn vị cơ bản bị chặn', () => api.call('save_product', { ...p, book_id: TH, id: ngoi.id, units: [{ name: 'viên', conv: 2 }] }), 'trùng');
const o1 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: d, deliver_now: true,
  lines: [{ product_id: ngoi.id, qty: 200, unit_price: 15000, unit_name: 'Hộp' }] });
const l1 = (await api.q('sales_order_lines', TH, [['order_id', 'eq', o1.id]]))[0];
C('Dòng đơn ghi đơn vị Hộp, số lượng theo viên', [l1.unit_name, l1.unit_conv, l1.qty, l1.line_total], ['Hộp', 100, 200, 3000000]);
C('Kho trừ theo đơn vị cơ bản', (await prod(ngoi.id)).on_hand, 800);
await E('Đơn vị không có trong danh mục bị chặn', () => api.call('save_sales_order', { book_id: TH, customer_id: KL, order_date: d,
  lines: [{ product_id: ngoi.id, qty: 1, unit_price: 1, unit_name: 'Thùng' }] }), 'không có đơn vị');

G('Dịch vụ');
const lap = await api.call('save_product', { book_id: TH, name: 'Công lắp đặt mái', product_type: 'dich_vu', unit: 'm²', price1: 80000, cost: 50000, opening_qty: 0, location: 'bỏ' });
p = await prod(lap.id);
C('Dịch vụ không cảnh báo tồn, không vị trí', [p.is_service, p.is_low, p.location, p.avg_cost], [true, false, null, 50000]);
await E('Dịch vụ không nhận tồn đầu', () => api.call('save_product', { book_id: TH, name: 'DV2', product_type: 'dich_vu', opening_qty: 5 }), 'không có tồn kho');
const o2 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: d, deliver_now: true,
  lines: [{ product_id: lap.id, qty: 10, unit_price: 80000 }] });
const ord2 = await api.one('sales_orders', TH, [['id', 'eq', o2.id]]);
C('Bán dịch vụ: doanh thu, giá vốn theo danh mục, đã giao đủ', [ord2.delivered_value, ord2.cogs, ord2.delivery_status], [800000, 500000, 'da_giao_du']);
C('Dịch vụ không phát sinh thẻ kho', (await api.q('stock_moves', TH, [['product_id', 'eq', lap.id]])).length, 0);
const dl = (await api.q('delivery_lines', TH)).find((x) => x.product_id === lap.id);
await api.call('sales_return', { order_id: o2.id, request_id: rid(), date: d, reason: 'Làm thiếu', lines: [{ delivery_line_id: dl.id, qty: 4 }] });
const ret = (await api.q('sales_returns', TH)).find((r) => r.order_id === o2.id);
C('Trả dịch vụ hoàn giá vốn tương ứng', (await api.sql(`select sum(cogs) c, sum(revenue) r from sales_return_lines where return_id = ?`, [ret.id]))[0], { c: 200000, r: 320000 });
const ncc = (await api.call('save_party', { book_id: TH, type: 'ncc', name: 'Xưởng Bát Tràng' })).id;
await E('Đơn nhập không nhận dịch vụ', () => api.call('save_purchase_order', { book_id: TH, supplier_id: ncc, order_date: d, lines: [{ product_id: lap.id, qty: 1, unit_cost: 1 }] }), 'Mua dịch vụ');
const po = await api.call('save_purchase_order', { book_id: TH, request_id: rid(), supplier_id: ncc, order_date: d, receive_now: true,
  lines: [{ product_id: ngoi.id, qty: 300, unit_cost: 9000, unit_name: 'Hộp' }] });
const pol = (await api.q('purchase_order_lines', TH, [['po_id', 'eq', po.id]]))[0];
C('Đơn nhập ghi đơn vị Hộp, kho nhận theo viên', [pol.unit_name, pol.unit_conv, (await prod(ngoi.id)).on_hand], ['Hộp', 100, 1100]);
C('Giá nhập cuối hiện ở hàng hóa', (await prod(ngoi.id)).last_in_cost, 9000);
await E('Không đổi hàng đã có tồn thành dịch vụ', () => api.call('save_product', { book_id: TH, id: ngoi.id, name: 'Ngói âm 27', product_type: 'dich_vu' }), 'không đổi thành dịch vụ');

G('Combo và hàng sản xuất');
const men = await api.call('save_product', { book_id: TH, name: 'Men đỏ', unit: 'kg', cost: 20000, opening_qty: 50 });
await E('Combo không nhận dịch vụ làm thành phần', () => api.call('save_product', { book_id: TH, name: 'Bộ X', product_type: 'combo', components: [{ product_id: lap.id, qty: 1 }] }), 'tồn kho');
const bo = await api.call('save_product', { book_id: TH, name: 'Bộ ngói + men', product_type: 'combo', components: [{ product_id: ngoi.id, qty: 10 }, { product_id: men.id, qty: 1 }] });
C('Combo giữ is_kit', [(await prod(bo.id)).is_kit, (await prod(bo.id)).product_type], [true, 'combo']);
const sx = await api.call('save_product', { book_id: TH, name: 'Ngói phủ men', product_type: 'san_xuat', bom: [{ product_id: ngoi.id, qty: 1 }, { product_id: men.id, qty: 0.05 }] });
p = await prod(sx.id);
C('Hàng sản xuất lưu định mức ở form', p.bom.map((x) => [x.sku, x.qty]).sort(), [[(await prod(men.id)).sku, 0.05], [(await prod(ngoi.id)).sku, 1]].sort());
const bom = await api.q('bom_items', TH, [['product_id', 'eq', sx.id]]);
C('Phiếu sản xuất đọc được định mức', bom.length, 2);

G('Biến thể theo thuộc tính');
const vr = await api.call('create_product_variants', { book_id: TH, base: { name: 'Diềm', unit: 'Viên', category: 'Diềm', price1: 30000 },
  variants: [{ name: 'Diềm 27 đỏ', size: '27', color: 'Đỏ', cost: 10000, opening_qty: 20 }, { name: 'Diềm 27 nâu', size: '27', color: 'Nâu', price1: 32000 }] });
C('Tạo đủ 2 mã', vr.created.length, 2);
const v2 = await prod(vr.created[1].id);
C('Biến thể nhận thuộc tính và giá riêng', [v2.size, v2.color, v2.category, v2.price1], ['27', 'Nâu', 'Diềm', 32000]);
C('Biến thể có tồn đầu', (await prod(vr.created[0].id)).on_hand, 20);
await E('SKU biến thể trùng nhau bị chặn', () => api.call('create_product_variants', { book_id: TH, base: { name: 'Y' }, variants: [{ sku: 'AA' }, { sku: 'aa' }] }), 'trùng');

G('Xóa hàng');
await E('Hàng đã giao dịch không xóa được', () => api.call('delete_product', { id: ngoi.id }), 'không xóa được');
const tmp = await api.call('save_product', { book_id: TH, name: 'Tạm', units: [{ name: 'Hộp', conv: 5 }] });
await api.call('delete_product', { id: tmp.id });
C('Hàng chưa giao dịch đã xóa', await prod(tmp.id), undefined);

G('Bảng giá có tên');
const pb = await api.call('save_price_book', { book_id: TH, name: 'Giá công trình Q4', valid_from: daysAgo(1), valid_to: daysAgo(-30),
  formula: { base: 'tier1', op: '-', value: 10, pct: true }, allow_others: false, cust_groups: null });
const ap = await api.call('apply_price_formula', { book_id: TH, price_book_id: pb.id, product_ids: [ngoi.id] });
C('Công thức: giá mức 1 trừ 10%', [(await api.q('price_book_items', TH, [['price_book_id', 'eq', pb.id]]))[0]?.price, ap.updated], [14400, 1]);
await E('Bảng không cho bán hàng ngoài bảng', () => api.call('save_sales_order', { book_id: TH, customer_id: KL, order_date: d, price_book_id: pb.id,
  lines: [{ product_id: men.id, qty: 1, unit_price: 1 }] }), 'chỉ cho bán hàng có trong bảng');
const o3 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: KL, order_date: d, price_book_id: pb.id, lines: [{ product_id: ngoi.id, qty: 1, unit_price: 14400 }] });
C('Đơn ghi bảng giá đã dùng', (await api.one('sales_orders', TH, [['id', 'eq', o3.id]])).price_book_id, pb.id);
await E('Ngoài hiệu lực bị chặn', () => api.call('save_sales_order', { book_id: TH, customer_id: KL, order_date: daysAgo(5), price_book_id: pb.id,
  lines: [{ product_id: ngoi.id, qty: 1, unit_price: 1 }] }), 'không có hiệu lực');
await api.call('save_price_book', { book_id: TH, id: pb.id, name: 'Giá công trình Q4', valid_from: daysAgo(1), allow_others: true, cust_groups: ['Đại lý'] });
await E('Sai nhóm khách bị chặn', () => api.call('save_sales_order', { book_id: TH, customer_id: KL, order_date: d, price_book_id: pb.id,
  lines: [{ product_id: men.id, qty: 1, unit_price: 1 }] }), 'không áp dụng cho nhóm');
const pb2 = await api.call('save_price_book', { book_id: TH, name: 'Giá sỉ', formula: { base: `book:${pb.id}`, op: '+', value: 1000 } });
await api.call('apply_price_formula', { book_id: TH, price_book_id: pb2.id });
C('Công thức lấy từ bảng khác, bỏ qua hàng không có trong bảng gốc', (await api.q('price_book_items', TH, [['price_book_id', 'eq', pb2.id]])).map((x) => x.price), [15400]);
await E('Không xóa bảng giá đang làm gốc cho bảng khác', () => api.call('delete_price_book', { book_id: TH, id: pb.id }), 'giá gốc');
await api.call('save_price_book_items', { book_id: TH, price_book_id: pb2.id, rows: [{ product_id: ngoi.id, price: null }, { product_id: men.id, price: 25000 }] });
C('Sửa tay giá trong bảng: bỏ dòng trống, thêm dòng mới', (await api.q('price_book_items', TH, [['price_book_id', 'eq', pb2.id]])).map((x) => [x.product_id, x.price]), [[men.id, 25000]]);
await api.call('delete_price_book', { book_id: TH, id: pb2.id });
C('Xóa bảng giá chưa dùng', (await api.q('price_books', TH)).length, 1);
await E('Không xóa bảng giá đã dùng trên đơn', () => api.call('delete_price_book', { book_id: TH, id: pb.id }), 'đã dùng trên đơn');

G('Sao lưu');
const bk = await api.call('export_book', { book_id: TH });
C('Bản sao lưu có đơn vị quy đổi và bảng giá', [bk.product_units.length > 0, bk.price_books.length, bk.price_book_items.length], [true, 1, 1]);

finish('Hàng hóa kiểu KiotViet');
