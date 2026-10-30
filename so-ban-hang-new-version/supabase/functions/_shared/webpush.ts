// Web Push thuần WebCrypto (RFC 8291 mã hóa aes128gcm + RFC 8292 VAPID) — không phụ thuộc node:crypto.
// vapidPublic: khóa công khai 65 byte (base64url); vapidPrivate: 32 byte (base64url) — tạo bằng `npx web-push generate-vapid-keys`.

const enc = new TextEncoder();
export const b64uDecode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
export const b64uEncode = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; } return out;
};
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

// Mã hóa nội dung cho 1 máy nhận (trả về thân request đã mã hóa)
export async function encryptPayload(p256dh: string, authSecret: string, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const uaPublic = b64uDecode(p256dh); const auth = b64uDecode(authSecret);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh không hợp lệ');
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

// Chữ ký VAPID (JWT ES256) cho máy chủ push của trình duyệt
export async function vapidAuth(endpoint: string, vapidPublic: string, vapidPrivate: string, subject: string) {
  const pub = b64uDecode(vapidPublic);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: vapidPrivate, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${vapidPublic}`;
}

export interface PushSub { endpoint: string; p256dh: string; auth: string }
export async function sendWebPush(sub: PushSub, data: string, opt: { publicKey: string; privateKey: string; subject: string; ttl?: number; urgency?: string }) {
  let bodyBytes: Uint8Array;
  try { bodyBytes = await encryptPayload(sub.p256dh, sub.auth, enc.encode(data)); }
  catch (e) { return { status: 0, ok: false, invalidKey: true, text: String((e as Error)?.message || e) }; }   // khóa máy nhận hỏng
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, opt.publicKey, opt.privateKey, opt.subject),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: String(opt.ttl ?? 86400), Urgency: opt.urgency || 'normal',
    },
    body: bodyBytes,
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, ok: res.status >= 200 && res.status < 300, invalidKey: false, text };
}
