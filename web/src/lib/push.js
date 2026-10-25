// Bật / tắt thông báo đẩy trên thiết bị này (Web Push).
// Android (Chrome): bật được ngay. iPhone/iPad (iOS 16.4+): phải "Thêm vào màn hình chính" rồi mở từ biểu tượng đó.
// Khóa công khai VAPID lấy từ máy chủ (GET /api/config), không cần build lại giao diện khi đổi khóa
let VAPID = '';
export const setVapidKey = (k) => { VAPID = k || ''; };

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function pushSupport() {
  if (!VAPID) return { ok: false, reason: 'no_key' };
  if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios_home' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { ok: false, reason: 'browser' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  return { ok: true };
}

const b64 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function registration() { return navigator.serviceWorker.register('./sw.js', { scope: './' }); }

export async function currentSub() {
  if (!pushSupport().ok) return null;
  const reg = await navigator.serviceWorker.getRegistration('./');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(rpc) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Chưa cho phép thông báo. Vào cài đặt trình duyệt của trang này → Thông báo → Cho phép, rồi bấm lại.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) });
  await rpc('save_push_sub', { endpoint: sub.endpoint, p256dh: enc(sub.getKey('p256dh')), auth: enc(sub.getKey('auth')), user_agent: navigator.userAgent });
  return sub;
}

export async function disablePush(rpc) {
  const sub = await currentSub();
  if (sub) { await rpc('delete_push_sub', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
}

// Đăng ký service worker sớm để bấm thông báo mở lại đúng app (kể cả khi chưa bật)
export function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  registration().catch(() => {});
}
