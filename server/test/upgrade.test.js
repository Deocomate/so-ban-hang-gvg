// Kiểm thử nâng cấp CSDL đã có dữ liệu lên bản có mức giá 4 và thương hiệu — chạy: node test/upgrade.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from '../src/db/sqlite.js';
import { openDb } from '../src/db/index.js';
import { suite, finish } from './harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { G, C, E } = suite();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomsu-nang-cap-'));
const file = path.join(dir, 'so.db');

// Dựng CSDL đúng như bản đang chạy: chưa có cột mới, mức giá chỉ từ 1 đến 3
const oldSchema = fs.readFileSync(path.join(here, '../src/db/schema.sql'), 'utf8')
  .replace(/^\s*price4 real not null default 0,\r?\n/m, '').replace('category text, brand text,', 'category text,').replace('between 1 and 4', 'between 1 and 3')
  .replace("'hang_tra_loi','noi_bo','khac'", "'hang_tra_loi','khac'").replace(/,\r?\n\s*purpose text[^\n]*/, '')
  .replace(/\r?\n\s*product_type text[\s\S]*?images text[^\r\n]*/, '').replace(/,\r?\n\s*price_book_id text\r?\n\);/, '\n);')
  .replace(/,\r?\n\s*unit_name text,[^\n]*\r?\n\s*unit_conv real not null default 1\r?\n\);/g, '\n);');
const old = new Database(file);
old.exec(oldSchema);
const now = new Date().toISOString();
old.prepare(`insert into users (id, email, password_hash, created_at) values ('u1', 'chu@gomsu.vn', 'x', ?)`).run(now);
const settings = (names) => JSON.stringify({ price_names: names });
old.prepare(`insert into books (id, name, short_name, settings, created_at) values ('th', 'Thanh Hải', 'TH', ?, ?), ('vg', 'Vũ Gia', 'VG', ?, ?)`)
  .run(settings(['Giá lẻ', 'Giá sỉ riêng', 'Giá công trình']), now, settings(['Giá lẻ', 'Giá sỉ', 'Giá CTV']), now);
old.prepare(`insert into book_members (book_id, user_id, role, created_at) values ('th', 'u1', 'owner', ?)`).run(now);
old.prepare(`insert into customers (id, book_id, code, name, price_tier, credit_days, created_at) values ('c1', 'th', 'KH1', 'Khách cũ', 3, 30, ?)`).run(now);
old.prepare(`insert into products (id, book_id, sku, name, price1, price3, created_at, updated_at) values ('p1', 'th', 'SP1', 'Hàng cũ', 100, 300, ?, ?)`).run(now, now);
old.prepare(`insert into products (id, book_id, sku, name, is_kit, image_url, created_at, updated_at) values ('p2', 'th', 'BO1', 'Bộ cũ', 1, 'anh.jpg', ?, ?)`).run(now, now);
old.prepare(`insert into sales_orders (id, book_id, code, customer_id, order_date, created_at) values ('o1', 'th', 'BH1', 'c1', '2026-10-01', ?)`).run(now);
old.prepare(`insert into stock_adjustments (id, book_id, code, adj_date, reason, created_at) values ('a1', 'th', 'DC00001', '2026-10-01', 'vo', ?)`).run(now);
old.prepare(`insert into stock_adjustment_lines (id, adjustment_id, book_id, product_id, qty_delta, unit_cost, value) values ('l1', 'a1', 'th', 'p1', -1, 0, 0)`).run();
old.pragma('user_version = 1');
old.close();

G('Nâng cấp CSDL cũ');
const db = openDb(file);
C('Đã sao lưu trước khi nâng cấp', fs.existsSync(`${file}.truoc-nang-cap-v1.bak`), true);
const bak = new Database(`${file}.truoc-nang-cap-v1.bak`, { readonly: true });
C('Bản sao lưu còn cấu trúc cũ', bak.prepare(`select 1 from pragma_table_info('products') where name = 'price4'`).get(), undefined);
bak.close();
C('Lên phiên bản mới', db.pragma('user_version', { simple: true }), 6);
C('Phiếu kho cũ và dòng phiếu giữ nguyên', db.prepare(`select a.code, l.qty_delta from stock_adjustments a join stock_adjustment_lines l on l.adjustment_id = a.id`).get(), { code: 'DC00001', qty_delta: -1 });
db.prepare(`insert into stock_adjustments (id, book_id, code, adj_date, reason, purpose, created_at) values ('a2', 'th', 'XNB00001', '2026-10-02', 'noi_bo', 'Khác', ?)`).run(now);
C('Phiếu kho nhận lý do xuất dùng nội bộ', db.prepare(`select reason_label from v_adjustments where id = 'a2'`).get().reason_label, 'Xuất dùng nội bộ');
C('Khách hàng giữ nguyên', db.prepare(`select code, name, price_tier, credit_days from customers`).get(), { code: 'KH1', name: 'Khách cũ', price_tier: 3, credit_days: 30 });
C('Đơn cũ vẫn trỏ đúng khách', db.prepare(`select c.code from sales_orders o join customers c on c.id = o.customer_id`).get().code, 'KH1');
C('Hàng hóa giữ nguyên, cột mới để trống', db.prepare(`select sku, price1, price3, price4, brand from products`).get(), { sku: 'SP1', price1: 100, price3: 300, price4: 0, brand: null });
C('Không hỏng liên kết', db.pragma('foreign_key_check').length, 0);
C('Khóa ngoại vẫn bật', db.pragma('foreign_keys', { simple: true }), 1);
db.prepare(`update customers set price_tier = 4 where code = 'KH1'`).run();
C('Khách nhận được mức giá 4', db.prepare(`select price_tier from customers`).get().price_tier, 4);
await E('Mức giá 5 vẫn bị chặn', () => db.prepare(`update customers set price_tier = 5`).run(), 'CHECK');
await E('Mã khách vẫn không được trùng', () => db.prepare(`insert into customers (id, book_id, code, name, created_at) values ('c2', 'th', 'kh1', 'Trùng', ?)`).run(now), 'UNIQUE');
const names = (id) => JSON.parse(db.prepare(`select settings from books where id = ?`).get(id).settings).price_names;
C('Sổ Thanh Hải có thêm mức 4, giữ tên đã đổi', names('th'), ['Giá lẻ', 'Giá sỉ riêng', 'Giá công trình', 'Giá đại lý II']);
C('Sổ Vũ Gia giữ 3 mức', names('vg').length, 3);
C('Hàng cũ nhận loại Hàng hóa, bán trực tiếp', db.prepare(`select product_type, sell_direct, images from products where id = 'p1'`).get(), { product_type: 'hang', sell_direct: 1, images: '[]' });
C('Bộ cũ thành combo, ảnh cũ thành ảnh đầu', db.prepare(`select product_type, images from products where id = 'p2'`).get(), { product_type: 'combo', images: '["anh.jpg"]' });
C('Dòng đơn có đơn vị quy đổi mặc định 1', db.prepare(`select 1 from pragma_table_info('sales_order_lines') where name = 'unit_conv' and dflt_value = '1'`).get() !== undefined, true);
C('Có bảng giá có tên', db.prepare(`select count(*) n from sqlite_master where name in ('price_books', 'price_book_items', 'product_units')`).get().n, 3);
C('View hàng hóa có cột mới', Object.keys(db.prepare(`select * from v_products`).get()).includes('price4'), true);
C('Nhật ký sửa khách hàng hoạt động lại', db.prepare(`select count(*) n from sqlite_master where type = 'trigger' and tbl_name = 'customers'`).get().n, 3);

const upgraded = (id) => JSON.parse(db.prepare(`select settings from books where id = ?`).get(id).settings);
C('Sổ cũ có đủ 2 pháp nhân', upgraded('vg').docs.profiles.map((x) => x.id), ['thanh_hai', 'mai_hieu']);
C('Hóa đơn Thanh Hải mặc định đứng tên Mai Hiếu', upgraded('th').docs.types.hoa_don.profile, 'mai_hieu');
C('Có thêm sổ Anamtile cho chủ sổ Thanh Hải', db.prepare(`select count(*) n from books where short_name = 'AN'`).get().n, 1);

G('Mở lại lần sau');
db.prepare(`update books set settings = ? where id = 'th'`).run(settings(['Giá lẻ', 'Giá sỉ riêng', 'Giá công trình']));
// Trigger nhật ký của bảng đã bỏ khỏi danh sách theo dõi (vd. bảng không có book_id) phải bị xóa khi mở lại
db.exec(`create trigger audit_price_book_items_ins after insert on price_book_items begin select 1; end;`);
db.close();
const again = openDb(file);
C('Xóa trigger nhật ký của bảng không còn theo dõi', again.prepare(`select count(*) n from sqlite_master where type = 'trigger' and tbl_name = 'price_book_items'`).get().n, 0);
C('Không tự thêm lại mức 4 đã bỏ', JSON.parse(again.prepare(`select settings from books where id = 'th'`).get().settings).price_names.length, 3);
C('Dữ liệu còn nguyên', again.prepare(`select count(*) n from customers where book_id in ('th', 'vg')`).get().n, 1);
C('Có thêm sổ Anamtile đúng 1 lần', again.prepare(`select count(*) n from books where short_name = 'AN'`).get().n, 1);
again.close();

fs.rmSync(dir, { recursive: true, force: true });
finish('Nâng cấp CSDL');
