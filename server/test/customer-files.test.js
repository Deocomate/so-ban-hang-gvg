// Kiểm thử: kho tài liệu riêng của khách hàng + nhắc xuất hóa đơn VAT — chạy: node test/customer-files.test.js
import { freshDb, makeApi, suite, finish, rid } from './harness.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();
const owner = await api.user('chu@gomsu.vn'); const staff = await api.user('nv@gomsu.vn'); const viewer = await api.user('xem@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id; const VG = books.find((b) => b.short_name === 'VG').id;
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', role: 'staff', perms: { ban_hang: true, xem_ban_hang: true } });
await api.call('upsert_member', { book_id: TH, email: 'xem@gomsu.vn', role: 'staff', perms: { xem_ban_hang: true } });
const kh = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Công ty Thăng Long', kind: 'Công ty', extra: { tax_code: '0500383583', tax_name: 'CÔNG TY CP THĂNG LONG' } })).id;
const kh2 = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Anh Hòa' })).id;
const b64 = (s) => Buffer.from(s).toString('base64');

G('1. Thư mục, tệp, link');
const hd = (await api.call('create_customer_folder', { book_id: TH, customer_id: kh, name: 'Hợp đồng' })).id;
const bb = (await api.call('create_customer_folder', { book_id: TH, customer_id: kh, name: 'Biên bản' })).id;
const sub = (await api.call('create_customer_folder', { book_id: TH, customer_id: kh, parent_id: hd, name: '2026' })).id;
const f1 = (await api.call('upload_customer_file', { book_id: TH, customer_id: kh, parent_id: sub, name: 'hop-dong.pdf', mime: 'application/pdf', base64: b64('%PDF-1.4 test') })).id;
const l1 = (await api.call('add_customer_link', { book_id: TH, customer_id: kh, name: 'Bản vẽ', url: 'drive.google.com/abc' })).id;
let list = await api.call('customer_files', { book_id: TH, customer_id: kh });
C('Đủ 5 mục, thư mục xếp trước rồi theo tên', list.items.map((x) => x.name), ['2026', 'Biên bản', 'Hợp đồng', 'Bản vẽ', 'hop-dong.pdf']);
C('Link thiếu https được tự thêm', list.items.find((x) => x.id === l1).url, 'https://drive.google.com/abc');
C('Không trả nội dung tệp trong danh sách', 'data' in list.items.find((x) => x.id === f1), false);
C('Tải lại đúng nội dung tệp', Buffer.from((await api.call('get_customer_file', { book_id: TH, id: f1 })).base64, 'base64').toString(), '%PDF-1.4 test');
await E('Chặn link javascript:', () => api.call('add_customer_link', { book_id: TH, customer_id: kh, url: 'javascript:alert(1)' }), 'http');
await E('Không tạo vào thư mục của khách khác', () => api.call('create_customer_folder', { book_id: TH, customer_id: kh2, parent_id: hd, name: 'X' }), 'không tồn tại');
await E('Tệp trống bị chặn', () => api.call('upload_customer_file', { book_id: TH, customer_id: kh, name: 'a.txt', base64: '' }), 'trống');

G('2. Di chuyển, đổi tên, xóa');
await api.call('move_customer_items', { ids: [f1, l1], parent_id: bb });
list = await api.call('customer_files', { book_id: TH, customer_id: kh });
C('Tệp và link đã vào thư mục Biên bản', [f1, l1].map((id) => list.items.find((x) => x.id === id).parent_id), [bb, bb]);
await E('Không chuyển thư mục vào thư mục con của nó', () => api.call('move_customer_items', { ids: [hd], parent_id: sub }), 'chính nó');
await api.call('move_customer_items', { ids: [sub], parent_id: null });
C('Chuyển thư mục con ra gốc', (await api.call('customer_files', { book_id: TH, customer_id: kh })).items.find((x) => x.id === sub).parent_id, null);
await api.call('update_customer_item', { id: l1, name: 'Bản vẽ mái', url: 'https://example.com/x' });
list = await api.call('customer_files', { book_id: TH, customer_id: kh });
C('Đổi tên và link', [list.items.find((x) => x.id === l1).name, list.items.find((x) => x.id === l1).url], ['Bản vẽ mái', 'https://example.com/x']);
await api.call('delete_customer_items', { ids: [bb] });
list = await api.call('customer_files', { book_id: TH, customer_id: kh });
C('Xóa thư mục xóa luôn tệp và link bên trong', list.items.map((x) => x.name).sort(), ['2026', 'Hợp đồng']);

G('3. Link Google Drive riêng, quyền');
await api.call('set_customer_drive', { book_id: TH, customer_id: kh, url: 'https://drive.google.com/drive/folders/xyz' });
C('Lưu link Drive', (await api.call('customer_files', { book_id: TH, customer_id: kh })).drive_url, 'https://drive.google.com/drive/folders/xyz');
const c = await api.one('customers', TH, [['id', 'eq', kh]]);
C('Giữ nguyên thông tin xuất hóa đơn', [c.extra.tax_code, c.extra.drive_url], ['0500383583', 'https://drive.google.com/drive/folders/xyz']);
api.as(staff);
await api.call('create_customer_folder', { book_id: TH, customer_id: kh, name: 'Nhân viên tạo' });
C('Nhân viên bán hàng tạo được thư mục', (await api.call('customer_files', { book_id: TH, customer_id: kh })).items.length, 3);
api.as(viewer);
C('Người chỉ xem vẫn xem được', (await api.call('customer_files', { book_id: TH, customer_id: kh })).items.length, 3);
await E('Người chỉ xem không tải lên được', () => api.call('create_customer_folder', { book_id: TH, customer_id: kh, name: 'X' }), 'quyền');
api.as(owner);
await E('Khách không thuộc sổ', () => api.call('customer_files', { book_id: VG, customer_id: kh }), 'Không tìm thấy');

G('4. Nhắc xuất hóa đơn VAT');
const p1 = (await api.call('save_product', { book_id: TH, name: 'Ngói âm 80 gốm', unit: 'Viên', price1: 4130 })).id;
const o = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh, vat_rate: 8, lines: [{ product_id: p1, qty: 3800, unit_price: 4130 }], deliver_now: true });
const o2 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh2, lines: [{ product_id: p1, qty: 100, unit_price: 4130 }], deliver_now: true });
let todo = await api.call('vat_invoice_todo', { book_id: TH });
C('Đơn của khách công ty đã giao → cần xuất', todo.map((r) => [r.code, r.state, r.need]), [[(await api.one('sales_orders', TH, [['id', 'eq', o.id]])).code, 'chua', 15694000]]);
C('Khách cá nhân không bị nhắc', todo.some((r) => r.id === o2.id), false);
await api.call('save_tax_invoice', { book_id: TH, direction: 'ra', inv_no: '00000081', amount: 10000000, vat_rate: 8, order_id: o.id });
todo = await api.call('vat_invoice_todo', { book_id: TH, order_id: o.id });
C('Xuất thiếu → còn nhắc phần thiếu', [todo[0]?.state, todo[0]?.missing], ['thieu', 5694000]);
await api.call('save_tax_invoice', { book_id: TH, direction: 'ra', inv_no: '00000082', amount: 5694000, vat_rate: 8, order_id: o.id });
C('Xuất đủ → hết nhắc', (await api.call('vat_invoice_todo', { book_id: TH })).length, 0);
const o3 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh, lines: [{ product_id: p1, qty: 10, unit_price: 4130 }], deliver_now: true });
C('Đơn mới của khách công ty được nhắc', (await api.call('vat_invoice_todo', { book_id: TH })).map((r) => r.id), [o3.id]);
await api.call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: o3.id, data: { vat_skip: '1' } });
C('Đánh dấu không cần xuất → hết nhắc', (await api.call('vat_invoice_todo', { book_id: TH })).length, 0);
await api.call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: o3.id, data: { vat_buyer: 'Chị Lan', vat_rate: '8', vat_pay_method: 'TM/CK' } });
C('Lưu thông tin phiếu yêu cầu xuất hóa đơn', (await api.call('get_doc_info', { book_id: TH, ref_type: 'order', ref_id: o3.id })).vat_pay_method, 'TM/CK');

finish('Tài liệu khách hàng & nhắc hóa đơn VAT');
