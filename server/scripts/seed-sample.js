// Nạp dữ liệu mẫu theo giấy tờ thật vào 3 sổ đang có — chỉ dùng trên máy, khi các sổ chưa có hàng hóa. Tự sao lưu CSDL trước khi ghi.
// Chạy: npm run seed:sample
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { ctx, today } from '../src/lib/context.js';
import { callRpc, callService } from '../src/domain/rpc.js';
import { ingestBankTxn } from '../src/domain/bank.js';
import { signUp } from '../src/lib/auth.js';
import { seedSample } from './sample-seed-data.js';

const PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';

openDb(config.dbPath);
// CSDL mới tinh chưa có sổ: tài khoản chủ mẫu thành chủ của cả 3 sổ
const owner = ctx.db.prepare(`select m.user_id from books b join book_members m on m.book_id = b.id and m.role = 'owner' where b.short_name = 'TH' order by b.created_at limit 1`).get()?.user_id
  ?? ctx.db.transaction(() => signUp({ email: 'chu.cuahang@demo.vn', password: PASSWORD, name: 'Chủ cửa hàng (mẫu)' }))().id;
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
