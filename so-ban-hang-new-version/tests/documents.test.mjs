// Kiểm thử: quy cách đóng gói + thông tin chứng từ — chạy: node tests/documents.test.mjs
import { freshDb, makeApi, check, expectError, summary, SQL_FILES } from './harness.mjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

const db = await freshDb();
const api = makeApi(db);
const rid = () => crypto.randomUUID();
const log = []; let group = '';
const G = (n) => { group = n; };
const sortKeys = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const C = (name, actual0, expected0, tol) => { const actual = sortKeys(actual0), expected = sortKeys(expected0); const ok = check(`[${group}] ${name}`, actual, expected, tol); log.push({ group, name, expected, actual, ok }); return ok; };
const E = async (name, fn, pat) => { const before = summary().failed; await expectError(`[${group}] ${name}`, fn, pat); log.push({ group, name, expected: 'Báo lỗi / chặn', actual: summary().failed === before ? 'Đã chặn' : 'KHÔNG chặn', ok: summary().failed === before }); };

const owner = await api.user('chu@gomsu.vn'); const staff = await api.user('nv@gomsu.vn'); const kt = await api.user('kt@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id; const VG = books.find((b) => b.short_name === 'VG').id;
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', role: 'staff', perms: { ban_hang: true } });
await api.call('upsert_member', { book_id: TH, email: 'kt@gomsu.vn', role: 'staff', perms: { thu_chi: true } });

G('1. Quy cách đóng gói sản phẩm');
const p1 = await api.call('save_product', { book_id: TH, name: 'Ngói âm 80 đỏ cờ', unit: 'Viên', price1: 10000, units_per_pack: 140, pack_unit: 'hộp' });
let pr = await api.one('products', TH, [['id', 'eq', p1.id]]);
C('Lưu 140 viên / hộp', [pr.units_per_pack, pr.pack_unit], [140, 'hộp']);
await api.call('save_product', { book_id: TH, id: p1.id, name: 'Ngói âm 80 đỏ cờ', unit: 'Viên', price1: 10000, units_per_pack: 150, pack_unit: 'thùng' });
pr = await api.one('products', TH, [['id', 'eq', p1.id]]);
C('Sửa quy cách', [pr.units_per_pack, pr.pack_unit], [150, 'thùng']);
await E('Số lượng mỗi hộp phải > 0', () => api.call('save_product', { book_id: TH, name: 'X', units_per_pack: 0 }), 'lớn hơn 0');
const p2 = await api.call('save_product', { book_id: TH, name: 'Đèn vườn', unit: 'Cái' });
C('Không có quy cách: để trống, đơn vị đóng gói mặc định “hộp”', [(await api.one('products', TH, [['id', 'eq', p2.id]])).units_per_pack, (await api.one('products', TH, [['id', 'eq', p2.id]])).pack_unit], [null, 'hộp']);
await api.call('import_products', { book_id: TH, request_id: rid(), rows: [
  { sku: 'NGD-80', name: 'Ngói dương 80 đỏ cờ', unit: 'Viên', cost: 6000, price1: 10000, qty: 3000, units_per_pack: 170 },
  { sku: 'DA-80', name: 'Diềm âm 80 đỏ cờ hổ phù', unit: 'Viên', cost: 12000, price1: 20000, qty: 1000, units_per_pack: 100, pack_unit: 'thùng' }] });
const im = await api.q('products', TH, [['sku', 'in', ['NGD-80', 'DA-80']]], 'sku');
C('Nhập Excel kèm quy cách', im.map((x) => [x.sku, x.units_per_pack, x.pack_unit]), [['DA-80', 100, 'thùng'], ['NGD-80', 170, 'hộp']]);
await api.call('import_products', { book_id: TH, request_id: rid(), rows: [{ sku: 'NGD-80', name: 'Ngói dương 80 đỏ cờ', price1: 11000 }] });
C('Nhập lại không có cột quy cách: giữ quy cách cũ', (await api.one('products', TH, [['sku', 'eq', 'NGD-80']])).units_per_pack, 170);

G('2. Thông tin riêng của chứng từ');
const kh = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Chú Dũng', phone: '0976389811', address: 'Cầu Trà Lý - Tiền Hải - Thái Bình' })).id;
const ngd = im.find((x) => x.sku === 'NGD-80').id;
const o = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh, lines: [{ product_id: ngd, qty: 600, unit_price: 10000 }], deliver_now: true });
const dl = (await api.q('deliveries', TH, [['order_id', 'eq', o.id]]))[0];
C('Chưa lưu gì: trả về rỗng', await api.call('get_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id }), {});
await api.call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id, data: { recv_phone: '0982197099', recv_address: 'Cầu Trà Lý', box_total: '13', hacker: 'x' } });
C('Lưu SĐT, địa chỉ nhận, số hộp; bỏ trường lạ', await api.call('get_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id }), { recv_phone: '0982197099', recv_address: 'Cầu Trà Lý', box_total: '13' });
await api.call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id, data: { box_total: '14' } });
C('Lưu tiếp chỉ đổi trường gửi lên', await api.call('get_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id }), { recv_phone: '0982197099', recv_address: 'Cầu Trà Lý', box_total: '14' });
await api.call('save_doc_info', { book_id: TH, ref_type: 'delivery', ref_id: dl.id, data: { driver_name: 'Nguyễn An Giang', driver_phone: '0977937690', goods_condition: 'Hàng nguyên kiện, không sứt vỡ' } });
C('Biên bản giao hàng: lái xe, tình trạng hàng', (await api.call('get_doc_info', { book_id: TH, ref_type: 'delivery', ref_id: dl.id })).driver_name, 'Nguyễn An Giang');
await api.call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id, data: { date_hoa_don: '2026-10-25', date_don_dat_hang: '2026-10-17' } });
const di = await api.call('get_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id });
C('Ngày riêng cho hóa đơn và đơn đặt hàng', [di.date_hoa_don, di.date_don_dat_hang], ['2026-10-25', '2026-10-17']);
await E('Không lưu được vào chứng từ của sổ khác', () => api.call('save_doc_info', { book_id: VG, ref_type: 'order', ref_id: o.id, data: { note: 'x' } }), 'Không tìm thấy');
await E('Loại chứng từ lạ bị chặn', () => api.call('save_doc_info', { book_id: TH, ref_type: 'xyz', ref_id: o.id, data: {} }), 'Không tìm thấy');
api.as(staff);
await api.call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id, data: { note: 'Giao giờ hành chính' } });
C('Nhân viên bán hàng lưu được thông tin đơn', (await api.call('get_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id })).note, 'Giao giờ hành chính');
api.as(kt);
await E('Nhân viên không có quyền bán hàng không sửa thông tin đơn', () => api.call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id, data: { note: 'x' } }), 'quyền');
const outsider = await api.user('la@gomsu.vn'); api.as(outsider);
await E('Người ngoài không đọc được', () => api.call('get_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id }), 'quyền');
api.as(owner);
const big = 'x'.repeat(2000);
await api.call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id, data: { note: big } });
C('Giới hạn 500 ký tự mỗi trường', (await api.call('get_doc_info', { book_id: TH, ref_type: 'order', ref_id: o.id })).note.length, 500);

G('3. Mẫu chứng từ trong cài đặt sổ');
const docs = { profiles: [{ id: 'hkd', name: 'HỘ KINH DOANH GỐM SỨ MAI HIẾU', address: 'Số 18 Thôn 2 Giang Cao - Xã Bát Tràng - Hà Nội' }], use: { hoa_don: 'hkd' }, thousand_sep: ',' };
await api.call('update_book_settings', { book_id: TH, settings: { docs } });
C('Lưu mẫu chứng từ vào cài đặt sổ', (await api.call('my_books')).find((b) => b.id === TH).settings.docs.profiles[0].name, 'HỘ KINH DOANH GỐM SỨ MAI HIẾU');
api.as(staff);
await E('Nhân viên không sửa được mẫu chứng từ', () => api.call('update_book_settings', { book_id: TH, settings: { docs: {} } }), 'chủ');
api.as(owner);

G('4. Trọng lượng sản phẩm');
const w1 = await api.call('save_product', { book_id: TH, name: 'Ngói âm 80 gốm', unit: 'Viên', price1: 10000, units_per_pack: 140, pack_unit: 'thùng', pack_weight: 28 });
let wp = await api.one('products', TH, [['id', 'eq', w1.id]]);
C('Nhập 28 kg / thùng 140 viên → 0,2 kg / viên', [wp.pack_weight, wp.unit_weight, wp.weight_per_unit], [28, null, 0.2]);
await api.call('save_product', { book_id: TH, id: w1.id, name: 'Ngói âm 80 gốm', unit: 'Viên', price1: 10000, units_per_pack: 140, pack_unit: 'thùng', pack_weight: 28, unit_weight: 0.21 });
wp = await api.one('products', TH, [['id', 'eq', w1.id]]);
C('Có kg / viên thì ưu tiên kg / viên', wp.weight_per_unit, 0.21);
await E('Trọng lượng âm bị chặn', () => api.call('save_product', { book_id: TH, name: 'X', pack_weight: -1 }), 'không được âm');
await api.call('import_products', { book_id: TH, request_id: rid(), rows: [{ sku: 'DD-80G', name: 'Diềm dương 80 gốm', unit: 'Viên', price1: 20000, units_per_pack: 144, pack_unit: 'thùng', pack_weight: 29, unit_weight: 0.2 }] });
wp = await api.one('products', TH, [['sku', 'eq', 'DD-80G']]);
C('Nhập Excel kèm trọng lượng', [wp.pack_weight, wp.unit_weight, wp.weight_per_unit], [29, 0.2, 0.2]);
await api.call('import_products', { book_id: TH, request_id: rid(), rows: [{ sku: 'DD-80G', name: 'Diềm dương 80 gốm', price1: 21000 }] });
C('Nhập lại không có cột trọng lượng: giữ trọng lượng cũ', (await api.one('products', TH, [['sku', 'eq', 'DD-80G']])).pack_weight, 29);

G('5. Nâng cấp cơ sở dữ liệu đã cài');
const here = path.dirname(new URL(import.meta.url).pathname);
const old = new PGlite();
for (const f of SQL_FILES.filter((x) => x !== '10_documents.sql' && x !== '11_weight.sql')) await old.exec(fs.readFileSync(path.join(here, '..', 'db', f), 'utf8'));
await old.exec(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'cu@gomsu.vn')`);
await old.exec(`select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', false)`);
const ob = (await old.query(`select public.bootstrap('{}'::jsonb) r`)).rows[0].r[0].id;
await old.query(`select public.save_product(jsonb_build_object('book_id', $1::text, 'name', 'Sản phẩm cũ', 'price1', 5000))`, [ob]);
for (const f of ['10_documents.sql', '10_documents.sql', '11_weight.sql', '11_weight.sql']) await old.exec(fs.readFileSync(path.join(here, '..', 'db', f), 'utf8'));
const r = (await old.query(`select public.q(jsonb_build_object('view', 'products', 'book_id', $1::text)) r`, [ob])).rows[0].r;
C('Sản phẩm cũ còn nguyên, có thêm cột quy cách và trọng lượng (chạy 2 lần không lỗi)', [r.length, r[0].name, r[0].pack_unit, r[0].units_per_pack, r[0].pack_weight, r[0].weight_per_unit], [1, 'Sản phẩm cũ', 'hộp', null, null, null]);

const s = summary();
fs.writeFileSync(new URL('./last-results-doc.json', import.meta.url), JSON.stringify({ ...s, log }, null, 2));
console.log(`\nĐẠT: ${s.passed}   LỖI: ${s.failed}`);
for (const f of s.failures) console.log('  ✗ ' + f);
process.exit(s.failed ? 1 : 0);
