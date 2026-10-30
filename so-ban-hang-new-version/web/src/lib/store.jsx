import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { uid } from './format.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ backend, children }) {
  const [session, setSession] = useState(null);
  const [books, setBooks] = useState(null);
  const [bookId, setBookId] = useState(() => { try { return localStorage.getItem('gomsu.book') || null; } catch (e) { return null; } });
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [modals, setModals] = useState([]); // ngăn xếp hộp thoại [{type, props, key}]
  const [bootError, setBootError] = useState(null);

  const loadBooks = useCallback(async () => {
    try {
      const bs = await backend.rpc('bootstrap', {});
      setBooks(bs); setBootError(null);
      setBookId((cur) => (bs.find((b) => b.id === cur) ? cur : bs[0]?.id || null));
    } catch (e) { setBooks([]); setBootError(e.message); }
  }, [backend]);

  useEffect(() => {
    let unsub;
    (async () => {
      const s = await backend.getSession(); setSession(s);
      if (backend.onAuth) { const r = backend.onAuth((s2) => setSession(s2)); unsub = r?.data?.subscription; }
    })();
    return () => { try { unsub?.unsubscribe(); } catch (e) { /* bỏ qua */ } };
  }, [backend]);

  useEffect(() => { if (session) loadBooks(); else setBooks(null); }, [session, loadBooks]);
  useEffect(() => { try { if (bookId) localStorage.setItem('gomsu.book', bookId); } catch (e) { /* bỏ qua */ } }, [bookId]);

  const book = books?.find((b) => b.id === bookId) || null;
  const can = useCallback((perm) => {
    if (!book) return false;
    if (book.role === 'owner') return true;
    if (!perm) return true;
    if (perm === 'owner') return false;
    return !!(book.perms && book.perms[perm]);
  }, [book]);

  const toast = useCallback((text, kind = 'ok') => {
    const id = uid(); setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 7000 : 3500);
  }, []);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const rpc = useCallback((fn, p = {}) => backend.rpc(fn, { book_id: bookId, ...p }), [backend, bookId]);
  const q = useCallback((view, filters = [], order, limit) => backend.rpc('q', { view, book_id: bookId, filters, order, limit }), [backend, bookId]);

  const open = useCallback((type, props = {}) => setModals((m) => [...m, { type, props, key: uid() }]), []);
  const close = useCallback(() => setModals((m) => m.slice(0, -1)), []);
  const closeAll = useCallback(() => setModals([]), []);
  const closeKey = useCallback((key) => setModals((m) => m.filter((x) => x.key !== key)), []);

  const value = useMemo(() => ({
    backend, session, setSession, books, book, bookId, setBookId, loadBooks, can, version, refresh, toast, toasts, rpc, q,
    modals, open, close, closeAll, closeKey, bootError, settings: book?.settings || {},
  }), [backend, session, books, book, bookId, loadBooks, can, version, refresh, toast, toasts, rpc, q, modals, open, close, closeAll, closeKey, bootError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Đọc dữ liệu, tự tải lại sau mỗi thao tác ghi (version tăng)
export function useQ(view, filters = [], order, limit, enabled = true) {
  const { q, version, bookId } = useApp();
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const key = JSON.stringify([view, filters, order, limit, bookId, version, enabled]);
  useEffect(() => {
    if (!enabled || !bookId) { setState({ data: null, loading: false, error: null }); return; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    q(view, filters, order, limit).then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e.message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useRpcData(fn, p, enabled = true) {
  const { rpc, version, bookId } = useApp();
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const key = JSON.stringify([fn, p, version, bookId, enabled]);
  useEffect(() => {
    if (!enabled || !bookId) { setState({ data: null, loading: false, error: null }); return; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    rpc(fn, p).then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState({ data: null, loading: false, error: e.message }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

// Gửi thao tác ghi: khóa nút trong lúc lưu + mã yêu cầu cố định để không ghi trùng
export function useAction() {
  const { rpc, refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const reqRef = useRef(uid());
  const busyRef = useRef(false);
  const run = useCallback(async (fn, p, okText) => {
    if (busyRef.current) return null;
    busyRef.current = true; setBusy(true);
    try {
      const r = await rpc(fn, { request_id: reqRef.current, ...p });
      reqRef.current = uid();
      refresh();
      if (okText) toast(typeof okText === 'function' ? okText(r) : okText);
      return r;
    } catch (e) {
      // Giữ nguyên mã yêu cầu: bấm lưu lại sau lỗi mạng sẽ không bị ghi 2 lần
      toast(e.message, 'err');
      return null;
    } finally { busyRef.current = false; setBusy(false); }
  }, [rpc, refresh, toast]);
  return { run, busy };
}
