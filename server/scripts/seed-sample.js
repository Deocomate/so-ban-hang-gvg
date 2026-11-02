// Nạp dữ liệu mẫu theo giấy tờ thật vào 3 sổ đang có — chỉ dùng trên máy, khi các sổ chưa có hàng hóa. Tự sao lưu CSDL trước khi ghi.
// Chạy: npm run seed:sample   (máy chủ phải khởi động ít nhất 1 lần để có sổ và tài khoản chủ)
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { ctx, today } from '../src/lib/context.js';
import { callRpc, callService } from '../src/domain/rpc.js';
import { ingestBankTxn } from '../src/domain/bank.js';
import { signUp } from '../src/lib/auth.js';
import { seedSample } from './sample-seed-data.js';

const PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';

openDb(config.dbPath);
const owner = ctx.db.prepare(`select m.user_id from books b join book_members m on m.book_id = b.id and m.role = 'owner' where b.short_name = 'TH' order by b.created_at limit 1`).get()?.user_id;
if (!owner) {
  console.error('Chưa có sổ nào — hãy chạy máy chủ một lần rồi đăng ký tài khoản chủ (hoặc đặt ADMIN_EMAIL) trước.');
  process.exit(1);
}
if (ctx.db.prepare('select count(*) n from products').get().n > 0) {
  console.error('Các sổ đã có hàng hóa — dữ liệu mẫu chỉ nạp khi chưa có. Dừng.');
  process.exit(1);
}
const backup = `${config.dbPath}.truoc-du-lieu-mau.bak`;
await ctx.db.backup(backup);
console.log(`Đã sao lưu CSDL: ${backup}`);

let uid = null;
const r = await seedSample({
  call: async (fn, p) => callRpc(uid, fn, p),
  svc: async (fn, p) => callService({ ingest_bank_txn: ingestBankTxn }[fn], p),
  ensureUser: async (email, name) => {
    const ex = ctx.db.prepare('select id from users where email = ?').get(email);
    return ex ? ex.id : ctx.db.transaction(() => signUp({ email, password: PASSWORD, name }))().id;
  },
  setUser: (u) => { uid = u; },
  owner,
  today: today(),
  onProgress: (m) => console.log(m),
});
console.log(`Xong. Hợp đồng ${r.contract.code}. Đăng nhập thử: chu.cuahang@demo.vn hoặc lan.nhanvien@demo.vn · mật khẩu: ${PASSWORD}`);
