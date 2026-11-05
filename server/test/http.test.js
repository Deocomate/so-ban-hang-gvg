// Kiểm thử qua HTTP thật: tài khoản (quản trị đầu tiên, mời, quên mật khẩu, đổi email, khóa), RPC bằng token,
// webhook SePay & vận đơn — chạy: node test/http.test.js
import os from 'node:os';
import path from 'node:path';

Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'test-secret', SEPAY_API_KEY: 'sepay-key', TRACKING_WEBHOOK_SECRET: 'track-secret',
  DATA_DIR: path.join(os.tmpdir(), 'gomsu-http-test'), APP_URL: 'https://so.test' });
const { suite, finish } = await import('./harness.js');   // sau khi đặt biến môi trường (harness nạp config)
const { openDb } = await import('../src/db/index.js');
const { createServer } = await import('../src/http.js');
const { all, one } = await import('../src/lib/context.js');
const { ensureAdmin } = await import('../src/lib/auth.js');

openDb(':memory:');
const server = createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { G, C } = suite();

const post = async (p, body, headers = {}) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const rpc = (token, fn, p = {}) => post('/api/rpc/' + fn, p, { Authorization: 'Bearer ' + token });
const authed = (token, p, body = {}) => post('/api/auth/' + p, body, { Authorization: 'Bearer ' + token });
const login = (email, password) => post('/api/auth/login', { email, password });
// Thư mới nhất gửi tới email; link trong thư → mã
const lastMail = (to) => one(`select * from mail_outbox where to_email = ? order by id desc limit 1`, to);
const tokenOf = (mail) => (mail?.body?.match(/#tai-khoan\/[a-z-]+\/([\w-]+)/) || [])[1];
const mailCount = () => one(`select count(*) n from mail_outbox`).n;

G('1. Tổng quản trị đầu tiên');
C('Kiểm tra sống', (await (await fetch(base + '/api/health')).json()).ok, true);
const cfg = await (await fetch(base + '/api/config')).json();
C('Cấu hình công khai (không lộ khóa bí mật)', Object.keys(cfg).sort(), ['demo', 'perm_groups', 'vapid_public_key']);
C('Không còn tự đăng ký', (await post('/api/auth/signup', { email: 'x@y.vn', password: 'matkhau1' })).status, 404);
C('Tạo Tổng quản trị từ .env', ensureAdmin('Chu@GomSu.vn', 'matkhau1').action, 'đã tạo (lần đăng nhập đầu phải đổi mật khẩu)');
C('Sai mật khẩu', (await login('chu@gomsu.vn', 'sai')).status, 401);
let r = await login('chu@gomsu.vn', 'matkhau1');
C('Đăng nhập được, bị yêu cầu đổi mật khẩu', [r.status, r.body.user.email, r.body.user.is_admin, r.body.user.must_change_password], [200, 'chu@gomsu.vn', true, true]);
C('Chưa đổi mật khẩu thì chưa dùng được sổ', (await rpc(r.body.token, 'bootstrap')).status, 403);
C('Mật khẩu yếu bị chặn', (await authed(r.body.token, 'password', { old_password: 'matkhau1', password: '12345678' })).body.error, 'Mật khẩu cần có cả chữ và số');
C('Mật khẩu mới phải khác mật khẩu cũ', (await authed(r.body.token, 'password', { old_password: 'matkhau1', password: 'matkhau1' })).status, 400);
r = await authed(r.body.token, 'password', { old_password: 'matkhau1', password: 'quantri2026' });
C('Đổi mật khẩu xong hết bị yêu cầu đổi', [r.status, r.body.user.must_change_password], [200, false]);
const t1 = r.body.token;
C('Thư báo đổi mật khẩu gửi cho chủ tài khoản', lastMail('chu@gomsu.vn').subject, 'Mật khẩu Sổ bán hàng gốm vừa được đổi');
C('Khởi động lại: .env không đặt lại mật khẩu đã đổi', ensureAdmin('chu@gomsu.vn', 'matkhau1').action, 'giữ nguyên');
C('… mật khẩu cũ trong .env không đăng nhập được', (await login('chu@gomsu.vn', 'matkhau1')).status, 401);
C('Email khác trong .env khi đã có Tổng quản trị → bỏ qua', ensureAdmin('khac@gomsu.vn', 'matkhau9').action, 'bỏ qua — hệ thống đã có Tổng quản trị');
C('… không tạo tài khoản', one(`select count(*) n from users where email = 'khac@gomsu.vn'`).n, 0);

G('2. Gọi RPC');
C('Không có token → 401', (await post('/api/rpc/bootstrap', {})).status, 401);
C('Token giả → 401', (await rpc('abc.def', 'bootstrap')).status, 401);
r = await rpc(t1, 'bootstrap');
C('Tổng quản trị là Quản lý cả 3 sổ', [r.status, r.body.map((b) => b.role)], [200, ['owner', 'owner', 'owner']]);
const VG = r.body.find((b) => b.short_name === 'VG').id;
const TH = r.body.find((b) => b.short_name === 'TH').id;
C('Hàm không có trong danh sách → 404', (await rpc(t1, 'ingest_bank_txn', {})).status, 404);
r = await rpc(t1, 'save_party', { book_id: VG, type: 'kh', name: '' });
C('Lỗi nghiệp vụ trả 400 kèm câu tiếng Việt', [r.status, r.body.error], [400, 'Thiếu tên']);

G('3. Webhook SePay');
await rpc(t1, 'save_bank_account', { book_id: VG, bank: { bin: '970436', account_no: '1106738888', account_name: 'HKD GOM' } });
const sepay = { id: 9001, transferAmount: 500000, transferType: 'in', accountNumber: '1106738888', content: 'chuyen tien', transactionDate: '2026-10-14 09:30:00' };
C('Sai khóa SePay → 401', (await post('/api/hooks/sepay', sepay, { Authorization: 'Apikey sai' })).status, 401);
r = await post('/api/hooks/sepay', sepay, { Authorization: 'Apikey sepay-key' });
C('Nhận giao dịch, chờ xử lý', [r.status, r.body.success, r.body.result.status], [200, true, 'cho_xu_ly']);
r = await post('/api/hooks/sepay', sepay, { Authorization: 'Apikey sepay-key' });
C('SePay gửi lại không ghi trùng', r.body.result.duplicate, true);
C('Giao dịch hiện trong sổ', (await rpc(t1, 'q', { book_id: VG, view: 'bank_txns' })).body.length, 1);

G('4. Webhook vận đơn');
C('Sai khóa → 401', (await post('/api/hooks/tracking?carrier=BEST&secret=x', { tracking_no: 'A1' })).status, 401);
r = await post('/api/hooks/tracking?carrier=BEST&secret=track-secret', { billcode: '84999', statusCode: '666', statusName: 'Giao hàng thành công' });
C('Dữ liệu riêng của hãng: đọc được trạng thái, chưa có vận đơn trong sổ', r.body.results[0].result, 'khong_co_van_don');
r = await post('/api/hooks/tracking?carrier=BEST&secret=track-secret', { foo: 1 });
C('Dữ liệu không đọc được vẫn trả 200 và ghi nhật ký', [r.status, r.body.results[0].result], [200, 'chua_doc_duoc']);
C('Chủ sổ xem nhật ký', (await rpc(t1, 'carrier_webhook_log', { book_id: VG, carrier: 'BEST' })).body.length >= 1, true);

G('5. Mời nhân viên');
const ov = (await rpc(t1, 'admin_overview')).body;
const sales = ov.roles.find((x) => x.name === 'Nhân viên bán hàng');
r = await rpc(t1, 'admin_save_user', { email: 'NV@gomsu.vn', name: 'Lan', books: { [VG]: { access: 'staff', role_id: sales.id }, [TH]: { access: 'none' } } });
const nvId = r.body.id;
C('Tạo lời mời', [r.status, one(`select status, email_verified_at from users where id = ?`, nvId)], [200, { status: 'invited', email_verified_at: null }]);
const invite = tokenOf(lastMail('nv@gomsu.vn'));
C('Thư mời có link tới trang web', lastMail('nv@gomsu.vn').body.includes('https://so.test/#tai-khoan/nhan-loi-moi/'), true);
C('Link chỉ lưu bản băm trong CSDL', one(`select count(*) n from auth_tokens where token_hash = ?`, invite).n, 0);
C('Chưa nhận lời mời thì không đăng nhập được', (await login('nv@gomsu.vn', '')).status, 401);
C('Xem link mời', (await post('/api/auth/link-info', { token: invite })).body, { kind: 'invite', email: 'nv@gomsu.vn', name: 'Lan', new_email: null });
C('Link sai → báo hết hạn', (await post('/api/auth/link-info', { token: 'sai' })).status, 400);
C('Nhận lời mời: mật khẩu yếu bị chặn', (await post('/api/auth/accept-invite', { token: invite, password: 'abc' })).status, 400);
r = await post('/api/auth/accept-invite', { token: invite, password: 'lan2026ok' });
C('Nhận lời mời → đăng nhập luôn, email đã xác thực', [r.status, r.body.user.email_verified, r.body.user.is_admin], [200, true, false]);
let tNv = r.body.token;
C('Link mời chỉ dùng 1 lần', (await post('/api/auth/accept-invite', { token: invite, password: 'lan2026ok' })).status, 400);
r = await rpc(tNv, 'bootstrap');
C('Nhân viên chỉ thấy sổ được cấp, quyền theo vai trò', [r.body.length, r.body[0].role_name, r.body[0].perms],
  [1, 'Nhân viên bán hàng', { ban_hang: true, xem_ban_hang: true, thu_chi: true, xem_thu_chi: true }]);
C('Nhân viên không vào được trang quản trị', (await rpc(tNv, 'admin_overview')).status, 403);
C('Nhân viên không tự cấp quyền', (await rpc(tNv, 'upsert_member', { book_id: VG, email: 'nv@gomsu.vn', role: 'owner' })).status, 403);
C('Nhân viên không mở được sổ không được cấp', (await rpc(tNv, 'q', { book_id: TH, view: 'products' })).status, 403);
C('Mời trùng email bị chặn', (await rpc(t1, 'admin_save_user', { email: 'nv@gomsu.vn' })).status, 400);

G('6. Quên mật khẩu');
let n0 = mailCount();
C('Email không có tài khoản: vẫn trả lời như thường', (await post('/api/auth/forgot', { email: 'khong-co@gomsu.vn' })).body, { ok: true });
C('… và không gửi thư nào', mailCount(), n0);
await post('/api/auth/forgot', { email: 'nv@gomsu.vn' });
const reset = tokenOf(lastMail('nv@gomsu.vn'));
C('Có thư đặt lại mật khẩu', [lastMail('nv@gomsu.vn').subject, !!reset], ['Đặt lại mật khẩu Sổ bán hàng gốm', true]);
r = await post('/api/auth/reset', { token: reset, password: 'lanmoi2026' });
C('Đặt mật khẩu mới → đăng nhập luôn', r.status, 200);
C('Phiên cũ của nhân viên hết hiệu lực', (await rpc(tNv, 'my_books')).status, 401);
tNv = r.body.token;
C('Link đặt lại chỉ dùng 1 lần', (await post('/api/auth/reset', { token: reset, password: 'lanmoi2027' })).status, 400);
C('Đăng nhập bằng mật khẩu mới', (await login('nv@gomsu.vn', 'lanmoi2026')).status, 200);
C('Thư báo mật khẩu vừa đặt lại', lastMail('nv@gomsu.vn').subject, 'Mật khẩu Sổ bán hàng gốm vừa được đặt lại');
const expired = tokenOf(((await post('/api/auth/forgot', { email: 'nv@gomsu.vn' })), lastMail('nv@gomsu.vn')));
await (await import('../src/lib/context.js')).run(`update auth_tokens set expires_at = '2000-01-01' where kind = 'reset_password' and used_at is null`);
C('Link quá hạn bị từ chối', (await post('/api/auth/reset', { token: expired, password: 'lanmoi2027' })).status, 400);

G('7. Thông tin cá nhân, đổi email');
r = await authed(tNv, 'profile', { name: 'Nguyễn Thị Lan', phone: '0912 345 678' });
C('Sửa tên, số điện thoại', [r.body.user.name, r.body.user.phone], ['Nguyễn Thị Lan', '0912 345 678']);
C('Đổi email cần đúng mật khẩu', (await authed(tNv, 'email', { new_email: 'lan@gomsu.vn', password: 'sai' })).status, 400);
C('Không đổi sang email người khác đang dùng', (await authed(tNv, 'email', { new_email: 'chu@gomsu.vn', password: 'lanmoi2026' })).status, 400);
C('Yêu cầu đổi email', (await authed(tNv, 'email', { new_email: 'lan@gomsu.vn', password: 'lanmoi2026' })).body, { ok: true });
C('Chưa bấm link thì email chưa đổi', (await login('nv@gomsu.vn', 'lanmoi2026')).status, 200);
C('Email cũ nhận thư báo có yêu cầu đổi', lastMail('nv@gomsu.vn').subject, 'Có yêu cầu đổi email đăng nhập');
r = await post('/api/auth/verify-email', { token: tokenOf(lastMail('lan@gomsu.vn')) });
C('Bấm link ở email mới → đổi email', r.body, { ok: true, email: 'lan@gomsu.vn' });
C('Đăng nhập bằng email mới', (await login('lan@gomsu.vn', 'lanmoi2026')).status, 200);
C('Email cũ không đăng nhập được nữa', (await login('nv@gomsu.vn', 'lanmoi2026')).status, 401);
C('Email đã xác thực thì không gửi lại link', (await authed(tNv, 'resend-verify')).status, 400);

G('8. Khóa tài khoản, đăng xuất mọi thiết bị');
C('Không tự khóa chính mình', (await rpc(t1, 'admin_set_status', { user_id: one(`select id from users where email = 'chu@gomsu.vn'`).id, disabled: true })).status, 400);
C('Không tự bỏ quyền Tổng quản trị duy nhất', (await rpc(t1, 'admin_save_user', { id: one(`select id from users where email = 'chu@gomsu.vn'`).id, is_admin: false })).status, 400);
await rpc(t1, 'admin_set_status', { user_id: nvId, disabled: true });
C('Khóa → phiên đang mở hết hiệu lực', (await rpc(tNv, 'my_books')).status, 401);
C('Khóa → đăng nhập báo bị khóa', (await login('lan@gomsu.vn', 'lanmoi2026')).body.error, 'Tài khoản đã bị khóa — liên hệ Tổng quản trị');
C('Khóa → quên mật khẩu không gửi thư', ((n0 = mailCount()), (await post('/api/auth/forgot', { email: 'lan@gomsu.vn' })), mailCount()), n0);
await rpc(t1, 'admin_set_status', { user_id: nvId, disabled: false });
r = await login('lan@gomsu.vn', 'lanmoi2026');
C('Mở khóa → đăng nhập lại được', r.status, 200);
tNv = r.body.token;
r = await authed(tNv, 'logout-all');
const tOld = tNv; tNv = r.body.token;
C('Đăng xuất mọi thiết bị: phiên cũ hết hiệu lực, phiên hiện tại nhận token mới', [(await rpc(tOld, 'my_books')).status, (await rpc(tNv, 'my_books')).status], [401, 200]);

G('8b. Ghi nhớ đăng nhập');
const life = (t) => { const p = JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString()); return [p.rem, Math.round((p.exp - Date.now() / 1000) / 3600)]; };
r = await post('/api/auth/login', { email: 'lan@gomsu.vn', password: 'lanmoi2026', remember: false });
C('Không ghi nhớ: phiên 12 giờ', [r.body.remember, life(r.body.token)], [false, [0, 12]]);
r = await authed(r.body.token, 'logout-all');
C('Phiên mới cấp lại vẫn không ghi nhớ', [r.body.remember, life(r.body.token)], [false, [0, 12]]);
r = await login('lan@gomsu.vn', 'lanmoi2026');
C('Mặc định ghi nhớ 30 ngày', [r.body.remember, life(r.body.token)], [true, [1, 720]]);
tNv = r.body.token;

for (let i = 0; i < 8; i++) await login('chi-thu@gomsu.vn', 'sai');
C('Sai 8 lần cùng email → tạm chặn', (await login('chi-thu@gomsu.vn', 'sai')).status, 429);
C('Đăng nhập đúng nhiều lần cùng IP không bị chặn', (await login('lan@gomsu.vn', 'lanmoi2026')).status, 200);

G('9. Nhật ký bảo mật');
const log = (await rpc(t1, 'admin_security_log', { limit: 500 })).body;
const events = new Set(log.map((x) => x.event));
C('Ghi đủ sự kiện', ['admin_bootstrap', 'login_fail', 'login_ok', 'password_changed', 'invite_sent', 'invite_accepted', 'password_reset', 'email_changed', 'user_disabled', 'user_enabled', 'logout_all']
  .filter((e) => !events.has(e)), []);
C('Đăng nhập sai ghi lại email đã thử', log.some((x) => x.event === 'login_fail' && x.detail.email === 'chu@gomsu.vn'), true);
C('Ghi người làm và IP', log.find((x) => x.event === 'user_disabled').actor_email, 'chu@gomsu.vn');
C('Nhân viên không xem được nhật ký bảo mật', (await rpc(tNv, 'admin_security_log')).status, 403);

G('10. Mật khẩu .env vẫn đang dùng → bắt đổi');
server.close();
openDb(':memory:');
const { createUser } = await import('../src/lib/auth.js');
createUser({ email: 'cu@gomsu.vn', password: 'matkhau1', isAdmin: true });
C('Tổng quản trị cũ còn dùng mật khẩu ghi trong .env', ensureAdmin('cu@gomsu.vn', 'matkhau1').action, 'mật khẩu còn trùng .env → bắt đổi ở lần đăng nhập tới');
C('… bị đánh dấu phải đổi', one(`select must_change_password from users where email = 'cu@gomsu.vn'`).must_change_password, 1);
openDb(':memory:');
ensureAdmin('admin@gomsu.vn', 'quantri1');
C('CSDL trống: tạo sẵn 3 sổ cho Tổng quản trị', all(`select b.short_name, m.role from books b join book_members m on m.book_id = b.id order by b.short_name`),
  [{ short_name: 'AN', role: 'owner' }, { short_name: 'TH', role: 'owner' }, { short_name: 'VG', role: 'owner' }]);

finish('HTTP · tài khoản · webhook');
