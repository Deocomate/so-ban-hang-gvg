// Kiểm thử hủy chứng từ kho như KiotViet: chứng từ đã hủy không còn trên thẻ kho, tồn ở các ngày trước như chưa từng có nó
// — chạy: node test/stock-cancel.test.js
import { freshDb, makeApi, suite, finish, rid, daysAgo as D } from './harness.js';

freshDb();
const api = makeApi();
const { G, C } = suite();

const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: D(30), rows: [{ sku: 'BINH', name: 'Bình gốm', unit: 'Cái', cost: 500, price1: 1000, qty: 100 }] });
const P = (await api.one('products', TH, [['sku', 'eq', 'BINH']])).id;
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Chị Lan' })).id;
const X = (await api.call('save_party', { book_id: TH, type: 'ncc', name: 'Xưởng gốm' })).id;
const moves = async () => api.q('stock_moves', TH, [['product_id', 'eq', P]], 'id');
const stockAt = async (d) => (await moves()).filter((m) => m.move_date <= d).reduce((s, m) => s + m.qty, 0);
const prod = async () => api.one('products', TH, [['id', 'eq', P]]);

G('1. Hủy hóa đơn: không còn trên thẻ kho, tồn các ngày trước như chưa bán');
const o = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'ban_san', order_date: D(10), deliver_now: true,
  lines: [{ product_id: P, qty: 30, unit_price: 1000 }] });
C('Bán 30: tồn ngày bán còn 70', await stockAt(D(10)), 70);
await api.call('cancel_sales_order', { id: o.id });
C('Sau khi hủy: thẻ kho không còn dòng nào của hóa đơn', (await moves()).filter((m) => m.doc_type === 'giao').length, 0);
C('Tồn ở ngày bán và hôm nay đều 100', [await stockAt(D(10)), await stockAt(D(0)), (await prod()).on_hand], [100, 100, 100]);
C('Giá trị tồn giữ đúng giá vốn', Math.round((await prod()).stock_value), 50000);

G('2. Hủy phiếu nhập: tồn các ngày trước như chưa nhập, giá vốn tính lại');
const pn = await api.call('save_purchase_order', { book_id: TH, request_id: rid(), mode: 'nhap', supplier_id: X, order_date: D(8), receive_now: true,
  lines: [{ product_id: P, qty: 100, unit_price: 800 }] });
C('Nhập 100 giá 800: giá vốn bình quân 650', Math.round((await prod()).avg_cost), 650);
const sale = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, kind: 'ban_san', order_date: D(5), deliver_now: true,
  lines: [{ product_id: P, qty: 10, unit_price: 1000 }] });
const rc = (await api.q('receipts', TH, [['po_id', 'eq', pn.id]]))[0];
await api.call('cancel_receipt', { id: rc.id, reason: 'Nhập nhầm' });
C('Thẻ kho không còn dòng nhập của phiếu', (await moves()).filter((m) => m.doc_type === 'nhap').length, 0);
C('Tồn ngày nhập về như cũ, hôm nay 90', [await stockAt(D(8)), await stockAt(D(0)), (await prod()).on_hand], [100, 90, 90]);
const sl = (await api.q('delivery_lines', TH, [['order_id', 'eq', sale.id]]))[0];
C('Giá vốn hóa đơn bán sau đó tính lại theo giá trước khi nhập (500)', Math.round(sl.cogs ?? 0), 5000);

G('3. Hủy phiếu trả hàng nhập: thẻ kho không còn dòng trả');
const t = await api.call('supplier_return', { book_id: TH, supplier_id: X, request_id: rid(), date: D(3), lines: [{ product_id: P, qty: 5, unit_price: 500 }] });
C('Trả NCC 5: tồn hôm nay 85', (await prod()).on_hand, 85);
await api.call('cancel_supplier_return', { id: t.id, reason: 'Trả nhầm' });
C('Không còn dòng trả trên thẻ kho, tồn trở lại 90', [(await moves()).filter((m) => m.doc_type === 'tra_ncc').length, await stockAt(D(3)), (await prod()).on_hand], [0, 90, 90]);

finish('Hủy chứng từ kho như KiotViet');
