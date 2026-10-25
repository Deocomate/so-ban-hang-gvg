// Web Push thuần WebCrypto (RFC 8291 mã hóa aes128gcm + RFC 8292 VAPID) — không cần thư viện ngoài.
// Khóa VAPID tạo bằng: npx web-push generate-vapid-keys  (công khai 65 byte, bí mật 32 byte, dạng base64url)
const { subtle } = globalThis.crypto;
const enc = new TextEncoder();

export const b64uDecode = (s) => new Uint8Array(Buffer.from(String(s), 'base64url'));
export const b64uEncode = (b) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
async function hkdf(salt, ikm, info, len) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}

// Khóa của máy nhận phải là điểm P-256 hợp lệ
export async function validSub(s) {
  try {
    const k = b64uDecode(s.p256dh); const a = b64uDecode(s.auth);
    if (k.length !== 65 || k[0] !== 4 || a.length < 16) return false;
    await subtle.importKey('raw', k, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return /^https:\/\//.test(s.endpoint);
  } catch { return false; }
}

// Mã hóa nội dung cho 1 máy nhận (trả về thân request đã mã hóa)
async function encryptPayload(p256dh, authSecret, payload) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const uaPublic = b64uDecode(p256dh); const auth = b64uDecode(authSecret);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh không hợp lệ');
  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const as = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await subtle.exportKey('raw', as.publicKey));
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

// Chữ ký VAPID (JWT ES256) cho máy chủ push của trình duyệt
async function vapidAuth(endpoint, vapidPublic, vapidPrivate, subject) {
  const pub = b64uDecode(vapidPublic);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: vapidPrivate, ext: true };
  const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${vapidPublic}`;
}

export async function sendWebPush(sub, data, opt) {
  let bodyBytes;
  try { bodyBytes = await encryptPayload(sub.p256dh, sub.auth, enc.encode(data)); } catch (e) {
    return { status: 0, ok: false, invalidKey: true, text: String(e?.message || e) };   // khóa máy nhận hỏng
  }
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, opt.publicKey, opt.privateKey, opt.subject),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      TTL: String(opt.ttl ?? 86400), Urgency: opt.urgency || 'normal',
    },
    body: bodyBytes,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, ok: res.status >= 200 && res.status < 300, invalidKey: false, text };
}
