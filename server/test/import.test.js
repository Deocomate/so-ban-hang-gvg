// Kiểm thử nhập bản sao lưu JSON: xuất sổ đầy đủ dữ liệu → nhập vào máy chủ mới → mọi con số khớp — chạy: node test/import.test.js
import { freshDb, makeApi, suite, finish, rid, TODAY as today } from './harness.js';
import { demoFlag } from '../src/domain/books.js';
import { seedDemo } from '../scripts/demo-seed-data.js';

const d = today();
const from = d.slice(0, 8) + '01';
const { G, C, E } = suite();

// Máy chủ cũ: dữ liệu mẫu đầy đủ (đơn, giao, trả hàng, đặt xưởng, vận đơn, tiền về, chi phí…)
freshDb();
let api = makeApi();
demoFlag.on = true;
const src = await seedDemo({ call: (fn, p) => api.call(fn, p), ensureUser: (e) => api.user(e), setUser: (u) => api.as(u), today: d });
api.as(src.owner);
const snapshot = async (b) => {
  const ov = await api.call('rpt_overview', { book_id: b, from, to: d });
  return {
    ov: ['revenue', 'cogs', 'gross_profit', 'opex', 'profit', 'cash_in', 'cash_out', 'receivable', 'payable', 'inventory_value', 'fund_balance', 'open_orders', 'low_stock'].map((k) => ov[k]),
    counts: await Promise.all(['products', 'customers', 'suppliers', 'sales_orders', 'purchase_orders', 'payments', 'stock_moves', 'shipments', 'bank_txns', 'expenses']
      .map(async (v) => (await api.q(v, b)).length)),
  };
};
const before = { TH: await snapshot(src.TH), VG: await snapshot(src.VG) };
const backup = { TH: await api.call('export_book', { book_id: src.TH }), VG: await api.call('export_book', { book_id: src.VG }) };

// Giả lập tệp của bản Supabase cũ: thời điểm dạng Postgres "+00:00", micro giây
const pgStyle = JSON.parse(JSON.stringify(backup.VG, (k, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) ? v.replace('Z', '123+00:00') : v)));

// Máy chủ mới
freshDb();
api = makeApi();
demoFlag.on = false;
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id; const VG = books.find((b) => b.short_name === 'VG').id;

G('1. Nhập sổ Thanh Hải (tệp của máy chủ mới)');
await E('Tệp sai định dạng bị chặn', () => api.call('import_book', { book_id: TH, data: { hello: 1 } }), 'gomsu-backup-v1');
const r1 = await api.call('import_book', { book_id: TH, data: backup.TH });
C('Nhập thành công, tồn kho khớp sổ kho', [r1.ok, r1.stock_mismatch], [true, []]);
C('Báo nhân viên cần thêm lại', r1.staff_to_readd.length > 0, true);
const afterTH = await snapshot(TH);
C('Mọi con số Tổng quan giống hệt sổ gốc', afterTH.ov, before.TH.ov);
C('Số sản phẩm, khách, đơn, phiếu, sổ kho… giống hệt', afterTH.counts, before.TH.counts);
C('Tên và mã sổ lấy theo tệp', (await api.call('my_books')).find((b) => b.id === TH).name, backup.TH.books[0].name);

G('2. Nhập sổ Vũ Gia (tệp dạng Supabase cũ)');
const r2 = await api.call('import_book', { book_id: VG, data: pgStyle });
C('Nhập thành công', [r2.ok, r2.stock_mismatch], [true, []]);
const afterVG = await snapshot(VG);
C('Mọi con số Tổng quan giống hệt sổ gốc', afterVG.ov, before.VG.ov);
C('Số lượng dữ liệu giống hệt', afterVG.counts, before.VG.counts);
const sh = (await api.q('shipments', VG))[0];
C('Thời điểm dạng Postgres được chuẩn hóa', /Z$/.test(sh.status_at), true);

G('3. An toàn');
await E('Không nhập đè vào sổ đã có chứng từ', () => api.call('import_book', { book_id: TH, data: backup.TH }), 'chưa có chứng từ|đã có chứng từ');
const staff = await api.user('nv@gomsu.vn');
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', role: 'staff' });
api.as(staff);
await E('Nhân viên không nhập được', () => api.call('import_book', { book_id: TH, data: backup.TH }), 'chủ');
api.as(owner);
G('4. Làm tiếp nghiệp vụ sau khi nhập');
const kh = (await api.q('customers', TH))[0];
const prod = (await api.q('products', TH)).find((p) => !p.is_kit && p.available > 5);
const o = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh.id, lines: [{ product_id: prod.id, qty: 1 }], deliver_now: true });
C('Tạo đơn mới tiếp nối số chứng từ cũ', Number(o.code.slice(2)) > backup.TH.sales_orders.length - 1, true);
const audit = await api.q('audit', TH, [['table_name', 'eq', 'books']]);
C('Nhật ký ghi lần nhập', audit.some((a) => a.op === 'IMPORT'), true);

finish('Nhập bản sao lưu');
