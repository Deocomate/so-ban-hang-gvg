// Kiểm thử phân quyền: vai trò mẫu, chỉnh riêng từng ô, quyền xem tách khỏi quyền sửa, chỉ Tổng quản trị cấp quyền — chạy: node test/permissions.test.js
import { freshDb, makeApi, suite, finish, rid, TODAY } from './harness.js';

const { G, C, E } = suite();
freshDb();
const api = makeApi();
const admin = await api.user('chu@gomsu.vn');
api.as(admin);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const VG = books.find((b) => b.short_name === 'VG').id;
const ov = await api.call('admin_overview');
const role = (n) => ov.roles.find((r) => r.name === n).id;
const kh = (await api.q('customers', TH))[0].id;
const sku = (await api.call('save_product', { book_id: TH, sku: 'SP1', name: 'Ngói', unit: 'Viên', price1: 10000 })).id;

G('Tổng quản trị');
C('Người đầu tiên là Tổng quản trị', (await api.sql(`select is_admin from users where id = ?`, [admin]))[0].is_admin, 1);
C('Danh mục quyền theo nhóm', ov.perm_groups.map((g) => g.group), ['Bán hàng', 'Mua hàng', 'Sổ quỹ', 'Hàng hóa & kho', 'Nhân sự', 'Báo cáo']);
C('Có 5 vai trò mẫu', ov.roles.length, 5);

G('Vai trò mẫu và chỉnh riêng');
const xem = await api.user('xem@gomsu.vn');
const ban = await api.user('ban@gomsu.vn');
await api.call('admin_save_user', { id: xem, books: { [TH]: { access: 'staff', role_id: role('Chỉ xem') } } });
await api.call('admin_save_user', { id: ban, books: { [TH]: { access: 'staff', role_id: role('Nhân viên bán hàng'), perms: { thu_chi: false, danh_muc: true } } } });
const permsOf = async (u) => { api.as(u); const r = (await api.call('my_books')).find((b) => b.id === TH); api.as(admin); return r?.perms; };
C('Vai trò "Chỉ xem" chỉ có quyền xem', Object.keys(await permsOf(xem)).sort(), ['xem_ban_hang', 'xem_bao_cao', 'xem_chi_phi', 'xem_nhap_hang', 'xem_thu_chi']);
C('Chỉnh riêng: bỏ thu chi, thêm sửa danh mục', Object.keys(await permsOf(ban)).sort(), ['ban_hang', 'danh_muc', 'xem_ban_hang']);

api.as(xem);
C('Quyền xem: đọc được đơn bán', Array.isArray(await api.q('sales_orders', TH)), true);
C('Quyền xem: đọc được phiếu thu chi', Array.isArray(await api.q('payments', TH)), true);
await E('Quyền xem: không tạo được đơn bán', () => api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh, order_date: TODAY(), status: 'xac_nhan',
  lines: [{ product_id: sku, qty: 1, unit_price: 10000 }] }), 'Bán hàng|ban_hang|Tạo / sửa đơn bán');
await E('Không mở được sổ không được cấp', () => api.q('products', VG), 'không có quyền truy cập');

api.as(ban);
C('Bán hàng: tạo được đơn', !!(await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh, order_date: TODAY(), status: 'xac_nhan',
  lines: [{ product_id: sku, qty: 1, unit_price: 10000 }] })).id, true);
await E('Bị bỏ thu chi: không xem phiếu thu chi', () => api.q('payments', TH), 'Xem phiếu thu chi');
await E('Không có quyền xem đơn nhập', () => api.q('purchase_orders', TH), 'Xem đơn nhập');
await E('Nhân viên không cấp quyền cho người khác', () => api.call('admin_save_user', { id: xem, books: { [TH]: { access: 'owner' } } }), 'Tổng quản trị');
await E('Nhân viên không gọi được upsert_member', () => api.call('upsert_member', { book_id: TH, email: 'xem@gomsu.vn', role: 'owner' }), 'Tổng quản trị');

G('Sửa vai trò áp dụng cho mọi người dùng vai trò đó');
api.as(admin);
await api.call('admin_save_role', { id: role('Chỉ xem'), name: 'Chỉ xem', perms: ['xem_ban_hang'] });
C('Người có vai trò "Chỉ xem" mất quyền đã bỏ', Object.keys(await permsOf(xem)), ['xem_ban_hang']);
await E('Không xóa vai trò đang dùng', () => api.call('admin_delete_role', { id: role('Chỉ xem') }), 'đang dùng');
await E('Vai trò phải có ít nhất 1 quyền', () => api.call('admin_save_role', { name: 'Trống', perms: [] }), 'ít nhất 1');
await E('Quyền lạ bị chặn', () => api.call('admin_save_role', { name: 'Lạ', perms: ['xoa_so'] }), 'không có');
await E('Tên vai trò không trùng', () => api.call('admin_save_role', { name: 'thủ kho', perms: ['kho'] }), 'Đã có');
const r2 = await api.call('admin_save_role', { name: 'Giao hàng', description: 'Xem đơn để đi giao', perms: ['xem_ban_hang'] });
C('Thêm vai trò mới', (await api.call('admin_overview')).roles.some((r) => r.id === r2.id && r.used === 0), true);
C('Xóa vai trò chưa ai dùng', (await api.call('admin_delete_role', { id: r2.id })).ok, true);

G('Gỡ quyền, Quản lý sổ, Tổng quản trị');
await api.call('admin_save_user', { id: xem, books: { [TH]: { access: 'none' }, [VG]: { access: 'owner' } } });
C('Gỡ khỏi sổ Thanh Hải, thành Quản lý sổ Vũ Gia', (await api.sql(`select book_id, role from book_members where user_id = ?`, [xem])).map((m) => [m.book_id === VG, m.role]), [[true, 'owner']]);
await api.call('admin_save_user', { id: ban, is_admin: true });
C('Cấp Tổng quản trị → Quản lý cả 3 sổ', (await api.sql(`select role from book_members where user_id = ? order by role`, [ban])).map((m) => m.role), ['owner', 'owner', 'owner']);
await E('Không hạ quyền sổ của Tổng quản trị', () => api.call('upsert_member', { book_id: TH, email: 'ban@gomsu.vn', role: 'staff' }), 'Tổng quản trị luôn');
await api.call('admin_save_user', { id: ban, is_admin: false, books: { [TH]: { access: 'staff', role_id: role('Thủ kho') }, [VG]: { access: 'none' }, [books.find((b) => b.short_name === 'AN').id]: { access: 'none' } } });
C('Bỏ Tổng quản trị → theo quyền được chọn lại', (await api.sql(`select is_admin from users where id = ?`, [ban]))[0].is_admin, 0);
C('… còn đúng 1 sổ với vai trò Thủ kho', Object.keys(await permsOf(ban)).sort(), ['kho', 'nhap_hang', 'xem_ban_hang', 'xem_nhap_hang']);
const log = await api.call('admin_security_log', {});
C('Mọi lần cấp quyền ghi vào nhật ký bảo mật', log.filter((x) => x.event === 'user_updated').length, 5);

finish('Phân quyền');
