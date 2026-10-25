// Máy chủ HTTP (node:http, không cần framework): API dưới /api, các đường dẫn còn lại trả giao diện đã build (web/dist).
//   POST /api/auth/signup | /api/auth/login | /api/auth/password    GET /api/auth/me
//   POST /api/rpc/:fn   (Authorization: Bearer <token>, thân = tham số p)
//   POST /api/hooks/sepay | /api/hooks/tracking                     GET /api/config | /api/health
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { ctx, AppError } from './lib/context.js';
import { callRpc } from './domain/rpc.js';
import { signUp, signIn, changePassword, issueToken, verifyToken, me, publicUser } from './lib/auth.js';
import { sepayWebhook, trackingWebhook } from './services/webhooks.js';
import { flushPushSoon } from './services/push.js';
import { backupNow } from './services/scheduler.js';

const MAX_BODY = 20 * 1024 * 1024;
const READ_ONLY = new Set(['q', 'my_books', 'rpt_overview', 'rpt_drill', 'rpt_monthly', 'rpt_products', 'rpt_groups', 'rpt_stock', 'rpt_expenses',
  'my_notifications', 'get_doc_info', 'carrier_webhook_log', 'export_book']);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new AppError('Dữ liệu gửi lên quá lớn', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const parseJson = (raw) => { if (!raw) return {}; try { return JSON.parse(raw); } catch { throw new AppError('Dữ liệu không phải JSON hợp lệ'); } };

function send(res, status, body) {
  const s = JSON.stringify(body ?? null);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}

// Lỗi ràng buộc của SQLite → câu tiếng Việt dễ hiểu
function errorMessage(e) {
  const m = String(e?.message || e);
  if (e instanceof AppError) return [e.status, m];
  if (/UNIQUE constraint failed/.test(m)) return [400, 'Dữ liệu bị trùng với dữ liệu đã có'];
  if (/CHECK constraint failed/.test(m)) return [400, 'Dữ liệu không hợp lệ (số lượng / số tiền / lựa chọn không đúng quy định)'];
  if (/FOREIGN KEY constraint failed/.test(m)) return [400, 'Dữ liệu liên kết không hợp lệ (chứng từ / sản phẩm / đối tượng không tồn tại)'];
  if (/NOT NULL constraint failed/.test(m)) return [400, 'Thiếu thông tin bắt buộc'];
  return [500, null];
}

// Giới hạn số lần thử đăng nhập / đăng ký theo IP (chống dò mật khẩu)
const attempts = new Map();
function limit(key, max = 10, windowMs = 15 * 60e3) {
  const now = Date.now(); const a = attempts.get(key);
  if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + windowMs }); return; }
  if (++a.n > max) throw new AppError('Thử quá nhiều lần — vui lòng đợi 15 phút rồi thử lại', 429);
}
setInterval(() => { const now = Date.now(); for (const [k, a] of attempts) if (a.reset < now) attempts.delete(k); }, 10 * 60e3).unref();

const clientIp = (req) => (config.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
const bearer = (req) => (String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i) || [])[1];
const authUser = (req) => { const uid = verifyToken(bearer(req), config.jwtSecret); if (!uid) throw new AppError('Phiên đăng nhập đã hết hạn — hãy đăng nhập lại', 401); return uid; };
const tx = (fn) => ctx.db.transaction(fn)();
const session = (u) => ({ token: issueToken(u, config.jwtSecret), user: publicUser(u) });

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  if (method === 'GET' && p === '/api/health') return send(res, 200, { ok: true });
  if (method === 'GET' && p === '/api/config') return send(res, 200, { vapid_public_key: config.vapid.publicKey, allow_signup: config.allowSignup, demo: config.demoMode });

  if (method === 'POST' && p.startsWith('/api/rpc/')) {
    const fn = decodeURIComponent(p.slice('/api/rpc/'.length));
    const uid = authUser(req);
    const body = parseJson(await readBody(req));
    if (fn === 'import_book' && config.dbPath !== ':memory:') await backupNow('truoc-nhap');   // luôn có bản để quay lại
    const result = callRpc(uid, fn, body);
    if (!READ_ONLY.has(fn)) flushPushSoon();
    return send(res, 200, result);
  }

  if (method === 'POST' && p === '/api/auth/login') {
    const b = parseJson(await readBody(req));
    limit('login:' + clientIp(req));
    return send(res, 200, session(signIn(b)));
  }
  if (method === 'POST' && p === '/api/auth/signup') {
    if (!config.allowSignup) throw new AppError('Đăng ký tài khoản mới đang tắt — liên hệ chủ cửa hàng', 403);
    const b = parseJson(await readBody(req));
    limit('signup:' + clientIp(req), 20, 60 * 60e3);
    return send(res, 200, session(tx(() => signUp(b))));
  }
  if (method === 'GET' && p === '/api/auth/me') {
    const u = me(authUser(req));
    if (!u) throw new AppError('Phiên đăng nhập đã hết hạn — hãy đăng nhập lại', 401);
    return send(res, 200, { user: u });
  }
  if (method === 'POST' && p === '/api/auth/password') {
    const uid = authUser(req);
    const b = parseJson(await readBody(req));
    limit('password:' + uid);
    return send(res, 200, session(tx(() => changePassword(uid, b))));
  }

  if (method === 'POST' && p === '/api/hooks/sepay') { const [s, body] = sepayWebhook(req.headers, await readBody(req)); return send(res, s, body); }
  if (method === 'POST' && p === '/api/hooks/tracking') { const [s, body] = trackingWebhook(req.headers, url, await readBody(req)); return send(res, s, body); }

  if (p.startsWith('/api/') || p === '/api') return send(res, 404, { error: 'Không tìm thấy' });
  if (method === 'GET' || method === 'HEAD') return serveStatic(req, res, p);
  return send(res, 404, { error: 'Không tìm thấy' });
}

// ---------- Giao diện (thư mục web/dist đã build) ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function serveStatic(req, res, p) {
  const root = config.webDir;
  let file = path.join(root, path.normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root)) return send(res, 404, { error: 'Không tìm thấy' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(p)) return send(res, 404, { error: 'Không tìm thấy' });   // tệp tĩnh không có
    file = path.join(root, 'index.html');                                      // đường dẫn của ứng dụng → trang chính
    if (!fs.existsSync(file)) return send(res, 404, { error: 'Chưa có giao diện (thiếu web/dist)' });
  }
  const ext = path.extname(file).toLowerCase();
  const immutable = p.startsWith('/assets/');
  const headers = {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN',
  };
  const compressible = /^(text\/|application\/(json|manifest)|image\/svg|font\/ttf)/.test(headers['Content-Type']);
  if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
  }
  headers['Content-Length'] = fs.statSync(file).size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (e) {
      const [status, msg] = errorMessage(e);
      if (status >= 500) console.error(new Date().toISOString(), req.method, req.url, e);
      if (!res.headersSent) send(res, status, { error: msg || 'Lỗi máy chủ — vui lòng thử lại. Nếu lặp lại, báo cho người quản trị.' });
      else res.end();
    }
  });
}
