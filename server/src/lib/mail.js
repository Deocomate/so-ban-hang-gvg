// Gửi email: thư được ghi vào hàng chờ (mail_outbox) trong cùng giao dịch với thao tác, rồi gửi ngay sau đó qua SMTP (Gmail).
// Gửi thật xong thì xóa nội dung thư khỏi CSDL (trong thư có link dùng 1 lần).
// Máy dev chưa khai SMTP: in thư ra console để test. Bản chạy thật chưa khai SMTP: không in link ra log, các thao tác cần link báo lỗi.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { fail, all, run, nowIso } from './context.js';

export const mailReady = () => !!(config.smtp.user && config.smtp.pass);

// Chặn trước các thao tác phải gửi link (mời, quên mật khẩu, đổi email) khi máy chủ chưa gửi được thư
export function requireMail() {
  if (config.production && !mailReady()) fail('Máy chủ chưa cấu hình gửi email (SMTP_USER / SMTP_PASS) — báo người quản trị máy chủ', 503);
  if (!config.appUrl) fail('Máy chủ chưa khai địa chỉ trang web (APP_URL) — báo người quản trị máy chủ', 503);
}

// Mã nằm sau dấu # : trình duyệt không gửi phần này lên máy chủ nên mã không lọt vào nhật ký truy cập (nginx) của máy chủ
export const appLink = (p, token) => `${config.appUrl}/#tai-khoan/${p}/${encodeURIComponent(token)}`;

const FOOTER = '\n\n—\nSổ bán hàng gốm · Thanh Hải · Vũ Gia · Anamtile\nThư gửi tự động, vui lòng không trả lời thư này.';

export function queueMail(to, subject, text) {
  run(`insert into mail_outbox (to_email, subject, body, created_at) values (?, ?, ?, ?)`, to, subject, text + FOOTER, nowIso());
}

let transport = null;
const smtp = () => (transport ??= nodemailer.createTransport({
  host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
}));

let running = false;
export async function flushMail() {
  if (running) return;
  if (!mailReady() && config.production) return;   // giữ thư trong hàng chờ tới khi khai SMTP
  running = true;
  try {
    for (const m of all(`select * from mail_outbox where status = 'cho' or (status = 'loi' and tries < 5) order by id limit 20`)) {
      try {
        if (mailReady()) {
          await smtp().sendMail({ from: config.smtp.from, to: m.to_email, subject: m.subject, text: m.body });
          run(`update mail_outbox set status = 'da_gui', sent_at = ?, tries = tries + 1, body = null, error = null where id = ?`, nowIso(), m.id);
        } else {
          if (process.env.NODE_ENV !== 'test') console.log(`\n✉ [chưa khai SMTP — thư chỉ in ra đây]\nTới: ${m.to_email}\nTiêu đề: ${m.subject}\n${m.body}\n`);
          run(`update mail_outbox set status = 'da_gui', sent_at = ?, tries = tries + 1, error = 'chỉ in ra console' where id = ?`, nowIso(), m.id);
        }
      } catch (e) {
        run(`update mail_outbox set status = 'loi', tries = tries + 1, error = ? where id = ?`, String(e?.message || e).slice(0, 500), m.id);
        console.error('gửi email lỗi', m.to_email, e?.message || e);
      }
    }
  } finally { running = false; }
}

let timer = null;
export function flushMailSoon() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flushMail().catch((e) => console.error('email', e)); }, 300);
  timer.unref?.();
}
