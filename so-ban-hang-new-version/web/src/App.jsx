import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './lib/store.jsx';
import { createSupabaseBackend } from './lib/backend.js';
import { todayVN } from './lib/format.js';
import { Btn, Icon, Loading, Note, Field, Input, Modal } from './components/ui.jsx';
import Overview from './pages/Overview.jsx';
import { SalesPage, SpecialPage } from './pages/Sales.jsx';
import { PurchasesPage } from './pages/Purchases.jsx';
import { InventoryPage } from './pages/Inventory.jsx';
import { ProductsPage } from './pages/Products.jsx';
import { PartiesPage } from './pages/Parties.jsx';
import { CashPage, ExpensesPage } from './pages/Cash.jsx';
import { ReportsPage } from './pages/Reports.jsx';
import { SettingsPage } from './pages/Settings.jsx';
import { ModalHost } from './pages/modals.jsx';
import { ShippingPage } from './pages/Shipping.jsx';
import { BankPage } from './pages/BankTxns.jsx';
import { Bell, NotifyPanel, useNotifications, openLink } from './components/Notify.jsx';
import { registerSW } from './lib/push.js';

const PAGES = [
  { id: 'tong-quan', label: 'Tổng quan', icon: 'home', perm: 'xem_bao_cao', comp: Overview, group: 'Hằng ngày' },
  { id: 'ban-hang', label: 'Bán hàng', icon: 'cart', comp: SalesPage, group: 'Hằng ngày' },
  { id: 'dat-rieng', label: 'Đơn đặt riêng', icon: 'kiln', comp: SpecialPage, group: 'Hằng ngày' },
  { id: 'van-chuyen', label: 'Vận chuyển', icon: 'route', comp: ShippingPage, group: 'Hằng ngày' },
  { id: 'nhap-hang', label: 'Nhập hàng / đặt xưởng', icon: 'truck', perm: 'nhap_hang', comp: PurchasesPage, group: 'Hằng ngày' },
  { id: 'kho', label: 'Kho', icon: 'box', comp: InventoryPage, group: 'Hằng ngày' },
  { id: 'thu-chi', label: 'Thu chi', icon: 'cash', perm: 'thu_chi', comp: CashPage, group: 'Tiền' },
  { id: 'tien-ve', label: 'Tiền về TK', icon: 'bank', perm: 'thu_chi', comp: BankPage, group: 'Tiền' },
  { id: 'chi-phi', label: 'Chi phí', icon: 'receipt', perm: 'chi_phi', comp: ExpensesPage, group: 'Tiền' },
  { id: 'khach-hang', label: 'Khách hàng', icon: 'users', comp: (p) => <PartiesPage type="kh" {...p} />, group: 'Danh mục' },
  { id: 'nha-cung-cap', label: 'Nhà cung cấp', icon: 'kiln', comp: (p) => <PartiesPage type="ncc" {...p} />, group: 'Danh mục' },
  { id: 'san-pham', label: 'Sản phẩm', icon: 'vase', comp: ProductsPage, group: 'Danh mục' },
  { id: 'bao-cao', label: 'Báo cáo', icon: 'chart', perm: 'xem_bao_cao', comp: ReportsPage, group: 'Quản lý' },
  { id: 'cai-dat', label: 'Cài đặt', icon: 'gear', comp: SettingsPage, group: 'Quản lý' },
];

function readHash() { const h = (location.hash || '').replace('#', ''); return PAGES.some((p) => p.id === h) ? h : null; }

function Shell({ demo }) {
  const { book, books, setBookId, can, open, closeAll, toasts, bootError, backend, session, setSession } = useApp();
  const [page, setPage] = useState(readHash() || 'tong-quan');
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const notif = useNotifications();
  // Mở từ thông báo điện thoại: ?book=<sổ>&open=<order:id | ship:id | bank:id | page:x>
  const [pendingOpen, setPendingOpen] = useState(() => { try { const u = new URLSearchParams(location.search); return u.get('open') ? { book: u.get('book'), link: u.get('open') } : null; } catch (e) { return null; } });
  useEffect(() => { registerSW(); const h = (e) => { if (e.data?.type === 'open') { try { const u = new URL(e.data.url); setPendingOpen({ book: u.searchParams.get('book'), link: u.searchParams.get('open') }); } catch (er) { /* bỏ qua */ } } };
    navigator.serviceWorker?.addEventListener?.('message', h); return () => navigator.serviceWorker?.removeEventListener?.('message', h); }, []);
  useEffect(() => {
    if (!pendingOpen || !books) return;
    if (pendingOpen.book && pendingOpen.book !== book?.id && books.some((b) => b.id === pendingOpen.book)) { closeAll(); setBookId(pendingOpen.book); return; }
    const l = pendingOpen.link; setPendingOpen(null);
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* bỏ qua */ }
    setTimeout(() => openLink(l, { open, go }), 50);
  }, [pendingOpen, books, book?.id]);
  useEffect(() => { const h = () => { const r = readHash(); if (r) setPage(r); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const visible = PAGES.filter((p) => !p.perm || can(p.perm));
  const cur = visible.find((p) => p.id === page) || visible.find((p) => p.id === 'ban-hang') || visible[0];
  const go = (id) => { setPage(id); setMoreOpen(false); try { history.replaceState(null, '', '#' + id); } catch (e) { /* bỏ qua */ } window.scrollTo(0, 0); };

  if (bootError) return <div className="center-screen"><div className="login"><Note tone="warn">{bootError}</Note><Btn onClick={() => backend.signOut().then(() => setSession(null))}>Đăng xuất</Btn></div></div>;
  if (!books || !book) return <div className="center-screen"><Loading text="Đang mở sổ…" /></div>;
  const Page = cur.comp;
  const quick = [
    can('ban_hang') && { label: 'Tạo đơn bán', icon: 'cart', kind: 'primary', on: () => open('order-form', {}) },
    can('nhap_hang') && { label: 'Nhập hàng', icon: 'truck', on: () => open('po-form', {}) },
    can('thu_chi') && { label: 'Thu tiền', icon: 'in', on: () => open('payment', { kind: 'thu_khach' }) },
    can('thu_chi') && { label: 'Chi tiền', icon: 'out', on: () => open('payment', { kind: 'tra_ncc' }) },
  ].filter(Boolean);
  let lastGroup = '';
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><div className="seal">{book.short_name}</div><div><div className="brand-name">{book.name}</div><div className="brand-sub">{book.role === 'owner' ? 'Chủ cửa hàng' : (book.display_name || 'Nhân viên')}</div></div></div>
        {visible.map((p) => {
          const g = p.group !== lastGroup ? (lastGroup = p.group, <div key={'g' + p.group} className="nav-group">{p.group}</div>) : null;
          return <React.Fragment key={p.id}>{g}<button className={`nav${cur.id === p.id ? ' on' : ''}`} onClick={() => go(p.id)}><Icon name={p.icon} />{p.label}</button></React.Fragment>;
        })}
        <div className="grow" />
        {!demo && <button className="nav" onClick={() => backend.signOut().then(() => setSession(null))}><Icon name="logout" />Đăng xuất</button>}
      </aside>
      <div className="main">
        {demo && <DemoBar />}
        <header className="topbar">
          {books.length > 1 && (
            <div className="book-switch" role="tablist" aria-label="Chọn sổ">
              {books.map((b) => <button key={b.id} className={b.id === book.id ? 'on' : ''} onClick={() => { closeAll(); setBookId(b.id); }}>{b.name.replace(/\s*\(mẫu\)/, '')}</button>)}
            </div>
          )}
          <div className="quick">{quick.map((q) => <Btn key={q.label} kind={q.kind || 'soft'} icon={q.icon} onClick={q.on}>{q.label}</Btn>)}</div>
          <Bell data={notif.data} onOpen={() => setNotifyOpen(true)} />
        </header>
        <main className="page" key={book.id + cur.id}><Page go={go} /></main>
      </div>
      <nav className="bottom-nav" aria-label="Điều hướng">
        {[visible.find((p) => p.id === 'tong-quan') || visible.find((p) => p.id === 'kho'), visible.find((p) => p.id === 'ban-hang')].filter(Boolean).map((p) => (
          <button key={p.id} className={cur.id === p.id ? 'on' : ''} onClick={() => go(p.id)}><Icon name={p.icon} />{p.label.split(' ')[0] === 'Tổng' ? 'Tổng quan' : p.label}</button>
        ))}
        <button className="fab" onClick={() => setQuickOpen(true)} aria-label="Tạo nhanh"><Icon name="plus" size={22} />Tạo</button>
        {visible.find((p) => p.id === 'thu-chi') ? <button className={cur.id === 'thu-chi' ? 'on' : ''} onClick={() => go('thu-chi')}><Icon name="cash" />Thu chi</button> : <button className={cur.id === 'kho' ? 'on' : ''} onClick={() => go('kho')}><Icon name="box" />Kho</button>}
        <button className={moreOpen ? 'on' : ''} onClick={() => setMoreOpen(true)}><Icon name="more" />Thêm</button>
      </nav>
      {quickOpen && (
        <Modal title="Tạo nhanh" onClose={() => setQuickOpen(false)} size="sm">
          <div className="sheet-actions">{quick.map((q) => <Btn key={q.label} kind={q.kind || 'soft'} icon={q.icon} onClick={() => { setQuickOpen(false); q.on(); }}>{q.label}</Btn>)}</div>
        </Modal>
      )}
      {moreOpen && (
        <Modal title="Chức năng" onClose={() => setMoreOpen(false)} size="sm">
          {books.length > 1 && <div className="book-switch">{books.map((b) => <button key={b.id} className={b.id === book.id ? 'on' : ''} onClick={() => { closeAll(); setBookId(b.id); setMoreOpen(false); }}>{b.name.replace(/\s*\(mẫu\)/, '')}</button>)}</div>}
          <div className="more-menu">{visible.map((p) => <Btn key={p.id} kind={cur.id === p.id ? 'soft' : 'ghost'} icon={p.icon} onClick={() => go(p.id)}>{p.label}</Btn>)}</div>
          {!demo && <Btn icon="logout" onClick={() => backend.signOut().then(() => setSession(null))}>Đăng xuất</Btn>}
        </Modal>
      )}
      <ModalHost />
      {notifyOpen && <NotifyPanel data={notif.data} reload={notif.reload} onClose={() => setNotifyOpen(false)} go={go} />}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast${t.kind === 'err' ? ' err' : ''}`}><Icon name={t.kind === 'err' ? 'alert' : 'check'} /> <span>{t.text}</span></div>)}</div>
    </div>
  );
}

function DemoBar() {
  const { backend, session, setSession, loadBooks } = useApp();
  const [users, setUsers] = useState([]);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { backend.demoUsers().then(setUsers); }, [backend]);
  return (
    <div className="demo-bar">
      <Icon name="info" size={16} />
      <span><b>Bản chạy thử</b> · dữ liệu mẫu{backend.persistent ? ', lưu trên trình duyệt này' : ' (không lưu khi tải lại trang)'}. Xem với vai trò:</span>
      <select value={session?.user?.id || ''} onChange={(e) => { backend.setUser(e.target.value); try { localStorage.setItem('gomsu.demoUser', e.target.value); } catch (er) { /* bỏ qua */ } setSession({ user: { id: e.target.value } }); }}>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      {confirmReset
        ? <><span>Xóa mọi thay đổi và tạo lại dữ liệu mẫu?</span><Btn small kind="danger" onClick={async () => { await backend.reset(); location.reload(); }}>Làm lại</Btn><Btn small onClick={() => setConfirmReset(false)}>Thôi</Btn></>
        : <Btn small onClick={() => setConfirmReset(true)}>Làm lại dữ liệu mẫu</Btn>}
    </div>
  );
}

function Login() {
  const { backend, setSession } = useApp();
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [name, setName] = useState('');
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try {
      if (mode === 'in') { await backend.signIn(email, pw); setSession(await backend.getSession()); }
      else if (mode === 'up') {
        const r = await backend.signUp(email, pw, name);
        if (r.session) setSession(r.session); else setMsg('Đã gửi thư xác nhận tới ' + email + '. Mở thư, bấm xác nhận rồi quay lại đăng nhập.');
      } else { await backend.resetPassword(email); setMsg('Đã gửi thư đặt lại mật khẩu.'); }
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="center-screen">
      <form className="login card" onSubmit={submit}>
        <div className="brand"><div className="seal">G</div><div><div className="brand-name">Sổ bán hàng gốm</div><div className="brand-sub">Thanh Hải · Vũ Gia</div></div></div>
        {mode === 'up' && <Field label="Tên hiển thị"><Input id="name" value={name} onChange={setName} placeholder="vd. Chị Lan" /></Field>}
        <Field label="Email"><Input id="email" type="email" required value={email} onChange={setEmail} autoComplete="email" /></Field>
        {mode !== 'reset' && <Field label="Mật khẩu"><Input id="pw" type="password" required minLength={6} value={pw} onChange={setPw} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>}
        {err && <Note tone="bad">{err}</Note>}
        {msg && <Note tone="good">{msg}</Note>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <span className="spin" /> : null}{mode === 'in' ? 'Đăng nhập' : mode === 'up' ? 'Tạo tài khoản' : 'Gửi thư đặt lại mật khẩu'}</button>
        <div className="row gap small">
          {mode !== 'in' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('in'); }}>Đăng nhập</a>}
          {mode !== 'up' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('up'); }}>Tạo tài khoản mới</a>}
          {mode !== 'reset' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('reset'); }}>Quên mật khẩu</a>}
        </div>
        <div className="muted small">Người đăng ký đầu tiên trở thành chủ cửa hàng. Nhân viên đăng ký xong, nhờ chủ cửa hàng thêm email vào sổ.</div>
      </form>
    </div>
  );
}

function Gate({ demo }) {
  const { session } = useApp();
  if (!session) return demo ? <div className="center-screen"><Loading /></div> : <Login />;
  return <Shell demo={demo} />;
}

export default function App() {
  const [backend, setBackend] = useState(null);
  const [status, setStatus] = useState('Đang khởi động…');
  const [error, setError] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        if (__DEMO__) {
          // Chỉ bản chạy thử mới tải Postgres-trong-trình-duyệt và dữ liệu mẫu; bản thật không chứa phần này
          const { createDemoBackend } = await import('./lib/backend.js');
          const [{ seedDemo }, { default: logo }] = await Promise.all([import('./lib/demoSeed.js'), import('./assets/demoLogo.js')]);
          const b = await createDemoBackend(setStatus);
          if (b.fresh) {
            setStatus('Đang tạo dữ liệu mẫu…');
            await seedDemo({ call: (fn, p) => b.rpc(fn, p), ensureUser: (e, n) => b.ensureUser(e, n), setUser: (u) => b.setUser(u), today: todayVN(), onProgress: setStatus, logo });
          }
          const users = await b.demoUsers();
          let pick = null; try { pick = localStorage.getItem('gomsu.demoUser'); } catch (e) { /* bỏ qua */ }
          const u = users.find((x) => x.id === pick) || users.find((x) => x.email.startsWith('chu')) || users[0];
          b.setUser(u.id);
          setBackend(b);
        } else {
          const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
          if (!url || !key) throw new Error('Chưa cấu hình kết nối Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). Xem hướng dẫn triển khai.');
          setBackend(await createSupabaseBackend(url, key));
        }
      } catch (e) { console.error(e); setError(e.message || String(e)); }
    })();
  }, []);
  if (error) return <div className="center-screen"><div className="login"><Note tone="bad">{error}</Note></div></div>;
  if (!backend) return <div className="center-screen"><Loading text={status} /></div>;
  return <AppProvider backend={backend}><Gate demo={__DEMO__} /></AppProvider>;
}
