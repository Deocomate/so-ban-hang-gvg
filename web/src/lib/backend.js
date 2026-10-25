// Kết nối API của máy chủ (cùng tên miền, đường dẫn /api). Phiên đăng nhập lưu token trong trình duyệt.
const FN_RE = /^[a-z_][a-z0-9_]*$/;
const TOKEN_KEY = 'gomsu.token';
const USER_KEY = 'gomsu.user';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
};

export function createApiBackend(base = '/api') {
  let token = store.get(TOKEN_KEY);
  let user = null; try { user = JSON.parse(store.get(USER_KEY) || 'null'); } catch (e) { user = null; }
  const listeners = new Set();
  const emit = () => { const s = token ? { user } : null; listeners.forEach((cb) => cb(s)); };
  const setSession = (s) => {
    token = s?.token || null; user = s?.user || null;
    store.set(TOKEN_KEY, token); store.set(USER_KEY, user ? JSON.stringify(user) : null);
    emit();
  };

  async function request(path, body, { auth = true, method = 'POST' } = {}) {
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(auth && token ? { Authorization: 'Bearer ' + token } : {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      });
    } catch (e) {
      throw new Error('Mất kết nối mạng — chưa lưu được. Kiểm tra mạng rồi thử lại.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      if (res.status === 401 && auth) setSession(null);
      const err = new Error(data?.error || `Lỗi máy chủ (${res.status}) — vui lòng thử lại.`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  let configP = null;
  return {
    kind: 'api',
    persistent: true,
    config() { return (configP ??= request('/config', null, { auth: false, method: 'GET' }).catch(() => ({}))); },
    async rpc(fn, p = {}) {
      if (!FN_RE.test(fn)) throw new Error('Tên hàm không hợp lệ');
      return request('/rpc/' + fn, p);
    },
    async getSession() { return token ? { user } : null; },
    onAuth(cb) { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
    async signIn(email, password) { setSession(await request('/auth/login', { email, password }, { auth: false })); },
    async signUp(email, password, name) { const s = await request('/auth/signup', { email, password, name }, { auth: false }); setSession(s); return { session: { user: s.user } }; },
    async changePassword(oldPassword, password) { setSession(await request('/auth/password', { old_password: oldPassword, password })); },
    async signOut() { setSession(null); },
  };
}
