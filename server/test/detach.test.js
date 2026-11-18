// Ngắt dữ liệu cũ: chứng từ đến hết ngày chọn rời khỏi sổ, công nợ cũ bỏ hẳn (hoặc giữ nếu chọn), tồn kho / quỹ / điểm giữ nguyên,
// dữ liệu đã ngắt giữ đủ trong bản lưu trữ để tải về.
import { freshDb, makeApi, suite, finish, TODAY, rid } from './harness.js';
import { seedSample } from '../scripts/sample-seed-data.js';
import { addDays, ctx } from '../src/lib/context.js';
import { custBalances, calcPl } from '../src/domain/reports.js';
import { setUser } from '../src/domain/access.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();
const owner = await api.user('chu@gomsu.vn');
const r = await seedSample({ call: (fn, p) => api.call(fn, p), svc: (fn, p) => api.svc(fn, p), ensureUser: (e) => api.user(e), setUser: (u) => api.as(u), owner, today: TODAY() });
api.as(owner);
const { TH } = r;
const T = TODAY(); const D = (n) => addDays(T, -n);
const set = (settings) => api.call('update_book_settings', { book_id: TH, settings });
const P = (await api.sql(`select * from products where book_id = ? and is_kit = 0 and product_type = 'hang' and on_hand > 50 order by sku`, [TH]))[0];
const A = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách Nợ Cũ', phone: '0900000099' })).id;
const old = D(400); const cut = D(300);
// Đơn cũ đã giao nhưng chưa ghi thu tiền (nợ ảo), và một khoản nợ đầu kỳ cũ của cùng khách
const so = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, order_date: old, deliver_now: true, lines: [{ product_id: P.id, qty: 3, unit_price: 1000000 }] });
await api.call('save_opening_debt', { book_id: TH, party_type: 'kh', party_id: A, amount: 500000, debt_date: old });
// Đơn mới sau ngày ngắt: phải giữ nguyên
const so2 = await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: A, order_date: T, deliver_now: true, lines: [{ product_id: P.id, qty: 1, unit_price: 200000 }] });

const bal = () => { setUser(owner); return Math.round(custBalances(TH, T).find((x) => x.party_id === A)?.balance ?? 0); };
const stock = () => ctx.db.prepare('select product_id, sum(qty) q, round(sum(value)) v from stock_moves where book_id = ? group by product_id order by 1').all(TH).map((x) => [x.product_id, x.q, x.v]);
const funds = () => ctx.db.prepare('select id, round(balance) b from v_funds where book_id = ? order by id').all(TH).map((x) => [x.id, x.b]);
const onHand = () => ctx.db.prepare('select id, on_hand from products where book_id = ? order by id').all(TH).map((x) => [x.id, x.on_hand]);

G('Ngắt dữ liệu: điều kiện');
await E('Phải khóa sổ trước', () => api.call('detach_preview', { book_id: TH, cutoff: cut }), 'khóa sổ');
await set({ lock_date: cut });
await E('Không ngắt dữ liệu hôm nay', () => api.call('detach_preview', { book_id: TH, cutoff: T }), 'trước hôm nay');

G('Xem trước không làm đổi dữ liệu');
const b0 = bal(); const s0 = stock(); const f0 = funds(); const h0 = onHand();
C('Khách đang nợ đơn cũ, nợ đầu kỳ và đơn mới', b0, 3700000);
C('Kỳ cũ đang có doanh thu', calcPl(TH, D(500), cut).revenue > 0, true);
const pv = await api.call('detach_preview', { book_id: TH, cutoff: cut });
C('Xem trước: có đơn bán cũ', pv.items.find((x) => x.key === 'orders').count >= 1, true);
C('Xem trước: phải thu giảm', pv.debt.kh.after < pv.debt.kh.before, true);
C('Xem trước: khách nợ cũ nằm trong danh sách thay đổi', pv.debt.kh.parties.some((x) => x.id === A), true);
C('Xem trước xong dữ liệu vẫn như cũ', [bal(), (await api.sql('select count(*) n from sales_orders where id = ?', [so.id]))[0].n], [b0, 1]);
C('Xem trước không tạo bản lưu trữ', (await api.call('data_archives', { book_id: TH })).length, 0);

G('Ngắt thật');
await E('Phải xác nhận', () => api.call('detach_data', { book_id: TH, cutoff: cut }), 'xác nhận');
const res = await api.call('detach_data', { book_id: TH, cutoff: cut, confirm: true });
C('Đơn cũ đã rời khỏi sổ', (await api.sql('select count(*) n from sales_orders where id = ?', [so.id]))[0].n, 0);
C('Đơn mới vẫn còn', (await api.sql('select count(*) n from sales_orders where id = ?', [so2.id]))[0].n, 1);
C('Không còn đơn bán nào đến hết ngày ngắt', (await api.sql('select count(*) n from sales_orders where book_id = ? and order_date <= ?', [TH, cut]))[0].n, 0);
C('Không còn nợ đầu kỳ khách đến hết ngày ngắt', (await api.sql(`select count(*) n from opening_debts where book_id = ? and party_type = 'kh' and debt_date <= ?`, [TH, cut]))[0].n, 0);
C('Công nợ khách chỉ còn đơn mới', bal(), 200000);
C('Tồn kho số lượng và giá trị từng mã giữ nguyên', JSON.stringify(stock()), JSON.stringify(s0));
C('Tồn thực tế từng mã giữ nguyên', JSON.stringify(onHand()), JSON.stringify(h0));
C('Số dư từng quỹ giữ nguyên', JSON.stringify(funds()), JSON.stringify(f0));
C('Báo cáo kỳ đã ngắt không còn doanh thu', calcPl(TH, D(500), cut).revenue, 0);

G('Bản lưu trữ');
const list = await api.call('data_archives', { book_id: TH });
C('Có 1 bản lưu trữ', list.length, 1);
C('Mã, khoảng ngày', [list[0].code.startsWith('NGAT'), list[0].cutoff, list[0].from_date <= old], [true, cut, true]);
const arc = await api.call('data_archive_get', { book_id: TH, id: list[0].id });
C('Định dạng', arc.format, 'gomsu-archive-v1');
C('Có đơn bán cũ và dòng hàng', [arc.tables.sales_orders.some((x) => x.id === so.id), arc.tables.sales_order_lines.some((x) => x.order_id === so.id)], [true, true]);
C('Có phiếu giao và dòng giao (xóa theo khóa ngoại)', [!!arc.tables.deliveries?.length, !!arc.tables.delivery_lines?.length], [true, true]);
C('Có dòng sổ kho cũ', !!arc.tables.stock_moves?.length, true);
C('Kèm danh mục để tra tên', arc.refs.customers.some((x) => x.id === A), true);
C('Số dòng trong tóm tắt khớp dữ liệu', arc.rows.sales_orders, arc.tables.sales_orders.length);
C('Nhật ký ghi một dòng ngắt dữ liệu', (await api.sql(`select count(*) n from audit_log where book_id = ? and op = 'DETACH'`, [TH]))[0].n, 1);
C('Không ghi nhật ký xóa từng dòng', (await api.sql(`select count(*) n from audit_log where book_id = ? and op = 'DELETE' and table_name = 'sales_orders' and row_id = ?`, [TH, so.id]))[0].n, 0);
await E('Không có gì để ngắt nữa', () => api.call('detach_preview', { book_id: TH, cutoff: D(350) }), 'Không có dữ liệu');

G('Giữ công nợ khi chọn');
const B = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách Giữ Nợ', phone: '0900000098' })).id;
await set({ lock_date: null });
await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: B, order_date: D(250), deliver_now: true, lines: [{ product_id: P.id, qty: 1, unit_price: 700000 }] });
await set({ lock_date: D(200) });
const bB = () => { setUser(owner); return Math.round(custBalances(TH, T).find((x) => x.party_id === B)?.balance ?? 0); };
const before = bB();
await api.call('detach_data', { book_id: TH, cutoff: D(200), keep_kh: true, confirm: true });
C('Giữ công nợ: số dư khách không đổi', bB(), before);
C('Giữ công nợ: thành nợ đầu kỳ', (await api.sql(`select count(*) n from opening_debts where party_id = ? and note like '%đã ngắt%'`, [B]))[0].n, 1);

G('Phân quyền');
const nv = await api.user('nv.ngat@gomsu.vn');
await api.call('upsert_member', { book_id: TH, email: 'nv.ngat@gomsu.vn', role: 'staff', perms: { ban_hang: true } });
api.as(nv);
await E('Nhân viên không xem được bản lưu trữ', () => api.call('data_archives', { book_id: TH }), '');
await E('Nhân viên không ngắt được', () => api.call('detach_data', { book_id: TH, cutoff: D(100), confirm: true }), '');

finish('Ngắt dữ liệu cũ');
