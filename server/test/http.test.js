// Kiểm thử qua HTTP thật: đăng ký / đăng nhập, gọi RPC bằng token, webhook SePay & vận đơn — chạy: node test/http.test.js
import os from 'node:os';
import path from 'node:path';
import { suite, finish } from './harness.js';

Object.assign(process.env, { JWT_SECRET: 'test-secret', SEPAY_API_KEY: 'sepay-key', TRACKING_WEBHOOK_SECRET: 'track-secret',
  DATA_DIR: path.join(os.tmpdir(), 'gomsu-http-test'), ALLOW_SIGNUP: 'true' });
const { openDb } = await import('../src/db/index.js');
const { createServer } = await import('../src/http.js');

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

G('1. Đăng ký, đăng nhập');
C('Kiểm tra sống', (await (await fetch(base + '/api/health')).json()).ok, true);
const cfg = await (await fetch(base + '/api/config')).json();
C('Cấu hình công khai (không lộ khóa bí mật)', Object.keys(cfg).sort(), ['allow_signup', 'demo', 'vapid_public_key']);
let r = await post('/api/auth/signup', { email: 'Chu@GomSu.vn', password: 'matkhau1', name: 'Chủ' });
C('Đăng ký trả về token, email chuẩn hóa chữ thường', [r.status, !!r.body.token, r.body.user.email], [200, true, 'chu@gomsu.vn']);
const t1 = r.body.token;
C('Mật khẩu quá ngắn bị chặn', (await post('/api/auth/signup', { email: 'x@y.vn', password: '123' })).status, 400);
C('Email trùng bị chặn', (await post('/api/auth/signup', { email: 'chu@gomsu.vn', password: 'matkhau1' })).status, 400);
C('Sai mật khẩu', (await post('/api/auth/login', { email: 'chu@gomsu.vn', password: 'sai' })).status, 401);
r = await post('/api/auth/login', { email: 'chu@gomsu.vn', password: 'matkhau1' });
C('Đăng nhập đúng', [r.status, !!r.body.token], [200, true]);

G('2. Gọi RPC');
C('Không có token → 401', (await post('/api/rpc/bootstrap', {})).status, 401);
C('Token giả → 401', (await rpc('abc.def', 'bootstrap')).status, 401);
r = await rpc(t1, 'bootstrap');
C('Người đầu tiên thành chủ 2 sổ', [r.status, r.body.length], [200, 2]);
const VG = r.body.find((b) => b.short_name === 'VG').id;
C('Hàm không có trong danh sách → 404', (await rpc(t1, 'ingest_bank_txn', {})).status, 404);
r = await rpc(t1, 'save_party', { book_id: VG, type: 'kh', name: '' });
C('Lỗi nghiệp vụ trả 400 kèm câu tiếng Việt', [r.status, r.body.error], [400, 'Thiếu tên']);
const r2 = await post('/api/auth/signup', { email: 'nv@gomsu.vn', password: 'matkhau2' });
C('Người đăng ký sau không thấy sổ nào', (await rpc(r2.body.token, 'bootstrap')).status, 403);

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

G('5. Đổi mật khẩu');
r = await post('/api/auth/password', { old_password: 'matkhau1', password: 'matkhaumoi' }, { Authorization: 'Bearer ' + t1 });
C('Đổi mật khẩu trả token mới', [r.status, !!r.body.token], [200, true]);
C('Token cũ hết hiệu lực', (await rpc(t1, 'my_books')).status, 401);
C('Token mới dùng được', (await rpc(r.body.token, 'my_books')).status, 200);

G('6. Tài khoản quản trị từ .env (ADMIN_EMAIL / ADMIN_PASSWORD)');
const { ensureAdmin } = await import('../src/lib/auth.js');
C('Chưa có thì tạo', ensureAdmin('Admin@GomSu.vn', 'quantri1'), { email: 'admin@gomsu.vn', action: 'đã tạo' });
r = await post('/api/auth/login', { email: 'admin@gomsu.vn', password: 'quantri1' });
const ta = r.body.token;
C('Đăng nhập được bằng mật khẩu trong .env', r.status, 200);
C('Là chủ của cả 2 sổ đã có', (await rpc(ta, 'my_books')).body.map((b) => b.role), ['owner', 'owner']);
C('Khởi động lại, mật khẩu không đổi → giữ nguyên', ensureAdmin('admin@gomsu.vn', 'quantri1').action, 'giữ nguyên');
C('… và không bị đăng xuất', (await rpc(ta, 'my_books')).status, 200);
C('Đổi mật khẩu trong .env → đặt lại', ensureAdmin('admin@gomsu.vn', 'quantri2').action, 'đã đặt lại mật khẩu');
C('… phiên cũ hết hiệu lực', (await rpc(ta, 'my_books')).status, 401);
C('… đăng nhập bằng mật khẩu mới', (await post('/api/auth/login', { email: 'admin@gomsu.vn', password: 'quantri2' })).status, 200);
let adminErr = '';
try { ensureAdmin('admin@gomsu.vn', '123'); } catch (e) { adminErr = e.message; }
C('Mật khẩu quá ngắn bị từ chối', /ít nhất 6/.test(adminErr), true);

server.close();
openDb(':memory:');
ensureAdmin('admin@gomsu.vn', 'quantri1');
C('CSDL trống: tạo sẵn 2 sổ cho quản trị (người đăng ký sau không chiếm quyền chủ)',
  (await import('../src/lib/context.js')).all(`select b.short_name, m.role from books b join book_members m on m.book_id = b.id order by b.short_name`),
  [{ short_name: 'TH', role: 'owner' }, { short_name: 'VG', role: 'owner' }]);

finish('HTTP · đăng nhập · webhook');
