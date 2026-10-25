// Tạo dữ liệu mẫu để chạy thử (2 sổ mẫu, nhân viên, đơn hàng, vận đơn, tiền về…) — chỉ dùng cho CSDL trống.
// Chạy: DEMO_MODE=true npm run seed:demo   (trong Docker: docker compose exec api npm run seed:demo)
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { ctx, today } from '../src/lib/context.js';
import { callRpc } from '../src/domain/rpc.js';
import { demoFlag } from '../src/domain/books.js';
import { signUp } from '../src/lib/auth.js';
import { seedDemo } from './demo-seed-data.js';
import logo from './demo-logo.js';

const PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';

openDb(config.dbPath);
if (ctx.db.prepare('select count(*) n from books').get().n > 0) {
  console.error('CSDL đã có sổ — dữ liệu mẫu chỉ tạo trên CSDL trống. Dừng.');
  process.exit(1);
}
demoFlag.on = true;
let uid = null;
const users = [];
const r = await seedDemo({
  call: async (fn, p) => callRpc(uid, fn, p),
  ensureUser: async (email, name) => {
    const ex = ctx.db.prepare('select id from users where email = ?').get(email);
    if (ex) return ex.id;
    users.push(email);
    return ctx.db.transaction(() => signUp({ email, password: PASSWORD, name }))().id;
  },
  setUser: (u) => { uid = u; },
  today: today(),
  onProgress: (m) => console.log(m),
  logo,
});
console.log(`Đã tạo dữ liệu mẫu (sổ ${r.TH}, ${r.VG}). Đăng nhập: ${users.join(', ')} · mật khẩu: ${PASSWORD}`);
