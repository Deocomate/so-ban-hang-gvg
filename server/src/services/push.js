// Gửi các thông báo đang chờ lên điện thoại (Web Push). Chạy mỗi phút và ngay sau mỗi thao tác có thể tạo thông báo.
import { config } from '../config.js';
import { callService } from '../domain/rpc.js';
import { pushQueue, pushDone } from '../domain/notify.js';
import { sendWebPush, validSub } from '../lib/webpush.js';

let running = false;
let timer = null;

export async function flushPush() {
  const { publicKey, privateKey, subject } = config.vapid;
  if (!publicKey || !privateKey || running) return { skipped: true };
  running = true;
  try {
    const queue = callService(pushQueue, 100);
    const ok = new Set(); const dead = new Set(); const ids = [];
    for (const n of queue) {
      const payload = JSON.stringify({ id: n.id, title: n.title, body: n.body, link: n.link, level: n.level, book_id: n.book_id, tag: 'n' + n.id });
      await Promise.all(n.subs.map(async (s) => {
        if (dead.has(s.endpoint)) return;
        if (!(await validSub(s))) { dead.add(s.endpoint); return; }
        try {
          const r = await sendWebPush(s, payload, { publicKey, privateKey, subject, ttl: 86400, urgency: n.level === 'bad' ? 'high' : 'normal' });
          if (r.ok) ok.add(s.endpoint);
          else if (r.status === 404 || r.status === 410 || r.invalidKey) dead.add(s.endpoint);   // máy đã hủy đăng ký / khóa hỏng → xóa
          else console.error('push lỗi', r.status, r.text.slice(0, 200));
        } catch (e) { console.error('push lỗi', e?.message || e); }
      }));
      ids.push(n.id);
    }
    if (ids.length || dead.size) callService(pushDone, { ids, ok_endpoints: [...ok], dead_endpoints: [...dead] });
    return { notifications: ids.length, delivered_to: ok.size, removed: dead.size };
  } finally { running = false; }
}

// Gom nhiều lần gọi gần nhau thành 1 lần gửi
export function flushPushSoon() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flushPush().catch((e) => console.error('push', e)); }, 1500);
  timer.unref?.();
}
