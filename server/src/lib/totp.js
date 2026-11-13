// Mã xác thực 6 số theo thời gian (TOTP, RFC 6238) dùng với Google Authenticator, Microsoft Authenticator…
import crypto from 'node:crypto';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newSecret() {
  const bytes = crypto.randomBytes(20); let bits = ''; let out = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += ALPHA[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decode(secret) {
  let bits = '';
  for (const c of String(secret).replace(/=+$/, '').toUpperCase()) { const v = ALPHA.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function totp(secret, at = Date.now(), step = 30) {
  const counter = Math.floor(at / 1000 / step);
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

// Chấp nhận lệch đồng hồ ±30 giây
export function verifyTotp(secret, code, at = Date.now()) {
  const c = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return false;
  return [-1, 0, 1].some((w) => crypto.timingSafeEqual(Buffer.from(totp(secret, at + w * 30e3)), Buffer.from(c)));
}

export const otpauthUri = (secret, email, issuer = 'So ban hang gom') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
