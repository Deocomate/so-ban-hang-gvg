import React, { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './lib/store.jsx';
import { createApiBackend } from './lib/backend.js';
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
  { id: 'tong-quan', label: 'Tổng quan', icon: 'home', perm: 'xem_bao_cao', comp: Overview },
  { id: 'san-pham', label: 'Danh sách hàng hóa', icon: 'vase', comp: ProductsPage },
  { id: 'kho', label: 'Tồn kho & kiểm kho', icon: 'box', comp: InventoryPage },
  { id: 'ban-hang', label: 'Đơn bán hàng', icon: 'order', comp: SalesPage },
  { id: 'dat-rieng', label: 'Đơn đặt riêng', icon: 'kiln', comp: SpecialPage },
  { id: 'van-chuyen', label: 'Vận chuyển', icon: 'route', comp: ShippingPage },
  { id: 'nhap-hang', label: 'Nhập hàng / đặt xưởng', icon: 'truck', perm: 'nhap_hang', comp: PurchasesPage },
  { id: 'khach-hang', label: 'Khách hàng', icon: 'users', comp: (p) => <PartiesPage type="kh" {...p} /> },
  { id: 'nha-cung-cap', label: 'Nhà cung cấp', icon: 'kiln', comp: (p) => <PartiesPage type="ncc" {...p} /> },
  { id: 'thu-chi', label: 'Phiếu thu chi', icon: 'cash', perm: 'thu_chi', comp: CashPage },
  { id: 'tien-ve', label: 'Tiền về tài khoản', icon: 'bank', perm: 'thu_chi', comp: BankPage },
  { id: 'chi-phi', label: 'Chi phí vận hành', icon: 'receipt', perm: 'chi_phi', comp: ExpensesPage },
  { id: 'bao-cao', label: 'Báo cáo', icon: 'chart', perm: 'xem_bao_cao', comp: ReportsPage },
  { id: 'cai-dat', label: 'Cài đặt', icon: 'gear', comp: SettingsPage },
];
// Thanh menu ngang: mục đơn hoặc nhóm có menu con
const MENU = [
  { id: 'tong-quan' },
  { label: 'Hàng hóa', icon: 'vase', items: ['san-pham', 'kho'] },
  { label: 'Đơn hàng', icon: 'order', items: ['ban-hang', 'dat-rieng', 'van-chuyen'] },
  { id: 'nhap-hang', label: 'Nhập hàng' },
  { label: 'Đối tác', icon: 'users', items: ['khach-hang', 'nha-cung-cap'] },
  { label: 'Sổ quỹ', icon: 'cash', items: ['thu-chi', 'tien-ve', 'chi-phi'] },
  { id: 'bao-cao' },
];

function readHash() { const h = (location.hash || '').replace('#', ''); return PAGES.some((p) => p.id === h) ? h : null; }

// Menu thả xuống: bấm để mở (máy tính rê chuột cũng mở); bấm ra ngoài hoặc Esc để đóng
function Dropdown({ label, icon, active, align = 'left', className = '', btnClass = 'mnav', children }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!show) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    const k = (e) => { if (e.key === 'Escape') setShow(false); };
    document.addEventListener('mousedown', h); window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k); };
  }, [show]);
  const hover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
  return (
    <div className={`dd ${className}`} ref={ref} onMouseEnter={hover ? () => setShow(true) : undefined} onMouseLeave={hover ? () => setShow(false) : undefined}>
      <button type="button" className={`${btnClass}${active ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={show} onClick={() => setShow((v) => (hover ? true : !v))}>
        {icon && <Icon name={icon} size={17} />}{label}<Icon name="down" size={14} className="dd-caret" />
      </button>
      {show && <div className={`dd-menu dd-${align}`} role="menu" onClick={() => setShow(false)}>{children}</div>}
    </div>
  );
}

function Shell() {
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
  const byId = Object.fromEntries(visible.map((p) => [p.id, p]));
  const cur = byId[page] || byId['ban-hang'] || visible[0];
  const go = (id) => { setPage(id); setMoreOpen(false); try { history.replaceState(null, '', '#' + id); } catch (e) { /* bỏ qua */ } window.scrollTo(0, 0); };
  const signOut = () => backend.signOut().then(() => setSession(null));
  const switchBook = (id) => { closeAll(); setBookId(id); };

  if (bootError) return <div className="center-screen"><div className="login"><Note tone="warn">{bootError}</Note><Btn onClick={signOut}>Đăng xuất</Btn></div></div>;
  if (!books || !book) return <div className="center-screen"><Loading text="Đang mở sổ…" /></div>;
  const Page = cur.comp;
  const quick = [
    can('ban_hang') && { label: 'Tạo đơn bán', icon: 'cart', kind: 'primary', on: () => open('order-form', {}) },
    can('nhap_hang') && { label: 'Nhập hàng', icon: 'truck', on: () => open('po-form', {}) },
    can('thu_chi') && { label: 'Thu tiền', icon: 'in', on: () => open('payment', { kind: 'thu_khach' }) },
    can('thu_chi') && { label: 'Chi tiền', icon: 'out', on: () => open('payment', { kind: 'tra_ncc' }) },
  ].filter(Boolean);
  const menu = MENU.map((m) => (m.items ? { ...m, items: m.items.map((id) => byId[id]).filter(Boolean) } : byId[m.id] && { ...byId[m.id], label: m.label || byId[m.id].label }))
    .filter((m) => m && (!m.items || m.items.length));
  const userName = session?.user?.name || book.display_name || session?.user?.email || 'Tài khoản';
  const bookSwitch = (onPick) => books.length > 1 && (
    <div className="book-switch" role="tablist" aria-label="Chọn sổ">
      {books.map((b) => (
        <button key={b.id} role="tab" aria-selected={b.id === book.id} className={b.id === book.id ? 'on' : ''} onClick={() => { switchBook(b.id); onPick?.(); }}>
          <span className="bs-long">{b.name.replace(/\s*\(mẫu\)/, '')}</span><span className="bs-short">{b.short_name}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-in">
          <div className="brand"><div className="seal">{book.short_name}</div><div className="brand-text"><div className="brand-name">{book.name}</div><div className="brand-sub">{book.role === 'owner' ? 'Chủ cửa hàng' : (book.display_name || 'Nhân viên')}</div></div></div>
          {bookSwitch()}
          <span className="grow" />
          <Bell data={notif.data} onOpen={() => setNotifyOpen(true)} />
          {byId['cai-dat'] && <button className={`icon-btn hdr-gear${cur.id === 'cai-dat' ? ' on' : ''}`} onClick={() => go('cai-dat')} aria-label="Cài đặt" title="Cài đặt"><Icon name="gear" size={20} /></button>}
          <Dropdown className="hdr-user" btnClass="user-btn" align="right" icon="users" label={<span className="user-name">{userName}</span>}>
            <div className="dd-info"><b>{userName}</b>{session?.user?.email && <span className="muted small">{session.user.email}</span>}</div>
            <button className="dd-item" role="menuitem" onClick={() => go('cai-dat')}><Icon name="gear" size={16} />Cài đặt &amp; tài khoản</button>
            <button className="dd-item" role="menuitem" onClick={signOut}><Icon name="logout" size={16} />Đăng xuất</button>
          </Dropdown>
        </div>
      </header>
      <nav className="mbar" aria-label="Chức năng">
        <div className="mbar-in">
          {menu.map((m) => (m.items ? (
            <Dropdown key={m.label} label={m.label} icon={m.icon} active={m.items.some((x) => x.id === cur.id)}>
              {m.items.map((x) => <button key={x.id} role="menuitem" className={`dd-item${x.id === cur.id ? ' on' : ''}`} onClick={() => go(x.id)}><Icon name={x.icon} size={16} />{x.label}</button>)}
            </Dropdown>
          ) : <button key={m.id} className={`mnav${cur.id === m.id ? ' on' : ''}`} onClick={() => go(m.id)}><Icon name={m.icon} size={17} />{m.label}</button>))}
          <span className="grow" />
          {quick.length > 1 && (
            <Dropdown label="Tạo nhanh" icon="plus" align="right">
              {quick.map((q) => <button key={q.label} role="menuitem" className="dd-item" onClick={q.on}><Icon name={q.icon} size={16} />{q.label}</button>)}
            </Dropdown>
          )}
          {can('ban_hang') && <button className="sell-btn" onClick={() => open('order-form', {})}><Icon name="cart" size={18} />Bán hàng</button>}
        </div>
      </nav>
      <main className="page" key={book.id + cur.id}><Page go={go} /></main>
      <nav className="bottom-nav" aria-label="Điều hướng">
        {[byId['tong-quan'] || byId['kho'], byId['ban-hang']].filter(Boolean).map((p) => (
          <button key={p.id} className={cur.id === p.id ? 'on' : ''} onClick={() => go(p.id)}><Icon name={p.icon} />{p.id === 'ban-hang' ? 'Đơn hàng' : p.id === 'kho' ? 'Kho' : p.label}</button>
        ))}
        <button className="fab" onClick={() => setQuickOpen(true)} aria-label="Tạo nhanh"><Icon name="plus" size={22} />Tạo</button>
        {byId['thu-chi'] ? <button className={cur.id === 'thu-chi' ? 'on' : ''} onClick={() => go('thu-chi')}><Icon name="cash" />Thu chi</button> : <button className={cur.id === 'kho' ? 'on' : ''} onClick={() => go('kho')}><Icon name="box" />Kho</button>}
        <button className={moreOpen ? 'on' : ''} onClick={() => setMoreOpen(true)}><Icon name="more" />Thêm</button>
      </nav>
      {quickOpen && (
        <Modal title="Tạo nhanh" onClose={() => setQuickOpen(false)} size="sm">
          <div className="sheet-actions">{quick.map((q) => <Btn key={q.label} kind={q.kind || 'soft'} icon={q.icon} onClick={() => { setQuickOpen(false); q.on(); }}>{q.label}</Btn>)}</div>
        </Modal>
      )}
      {moreOpen && (
        <Modal title="Chức năng" onClose={() => setMoreOpen(false)} size="sm">
          {bookSwitch(() => setMoreOpen(false))}
          {[...menu, byId['cai-dat'] && { label: 'Hệ thống', items: [byId['cai-dat']] }].filter(Boolean).map((m) => (
            <div key={m.label || m.id} className="more-group">
              {m.items && <div className="more-title">{m.label}</div>}
              <div className="more-menu">{(m.items || [m]).map((p) => <Btn key={p.id} kind={cur.id === p.id ? 'soft' : 'ghost'} icon={p.icon} onClick={() => go(p.id)}>{p.label}</Btn>)}</div>
            </div>
          ))}
          <Btn icon="logout" onClick={signOut}>Đăng xuất</Btn>
        </Modal>
      )}
      <ModalHost />
      {notifyOpen && <NotifyPanel data={notif.data} reload={notif.reload} onClose={() => setNotifyOpen(false)} go={go} />}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast${t.kind === 'err' ? ' err' : ''}`}><Icon name={t.kind === 'err' ? 'alert' : 'check'} /> <span>{t.text}</span></div>)}</div>
    </div>
  );
}

function Login() {
  const { backend, setSession } = useApp();
  const [mode, setMode] = useState('in');
  const [allowSignup, setAllowSignup] = useState(true);
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [name, setName] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { backend.config().then((c) => setAllowSignup(c.allow_signup !== false)); }, [backend]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'in') await backend.signIn(email, pw);
      else await backend.signUp(email, pw, name);
      setSession(await backend.getSession());
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="center-screen login-screen">
      <form className="login card" onSubmit={submit}>
        <div className="brand"><div className="seal">G</div><div><div className="brand-name">Sổ bán hàng gốm</div><div className="brand-sub">Thanh Hải · Vũ Gia</div></div></div>
        <h1 className="login-title">{mode === 'in' ? 'Đăng nhập' : mode === 'up' ? 'Tạo tài khoản' : 'Quên mật khẩu'}</h1>
        {mode === 'up' && <Field label="Tên hiển thị"><Input id="name" value={name} onChange={setName} placeholder="vd. Chị Lan" /></Field>}
        <Field label="Email"><Input id="email" type="email" required value={email} onChange={setEmail} autoComplete="email" /></Field>
        {mode !== 'forgot' && <Field label="Mật khẩu"><Input id="pw" type="password" required minLength={6} value={pw} onChange={setPw} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>}
        {err && <Note tone="bad">{err}</Note>}
        {mode === 'forgot'
          ? <Note>Nhân viên quên mật khẩu: nhờ chủ cửa hàng vào <b>Cài đặt → Người dùng &amp; quyền</b> đặt mật khẩu mới. Chủ cửa hàng quên mật khẩu: người quản trị máy chủ chạy lệnh đặt lại (xem HUONG-DAN.md).</Note>
          : <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? <span className="spin" /> : null}{mode === 'in' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>}
        <div className="row gap small">
          {mode !== 'in' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('in'); }}>Đăng nhập</a>}
          {mode !== 'up' && allowSignup && <a href="#" onClick={(e) => { e.preventDefault(); setMode('up'); }}>Tạo tài khoản mới</a>}
          {mode !== 'forgot' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); }}>Quên mật khẩu</a>}
        </div>
        <div className="muted small">Người đăng ký đầu tiên trở thành chủ cửa hàng. Nhân viên đăng ký xong, nhờ chủ cửa hàng thêm email vào sổ.</div>
      </form>
    </div>
  );
}

function Gate() {
  const { session } = useApp();
  if (!session) return <Login />;
  return <Shell />;
}

export default function App() {
  const [backend] = useState(() => createApiBackend());
  return <AppProvider backend={backend}><Gate /></AppProvider>;
}
