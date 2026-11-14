import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppProvider, useApp } from './lib/store.jsx';
import { createApiBackend } from './lib/backend.js';
import { Btn, Icon, Loading, Note, Field, Input, Modal } from './components/ui.jsx';
import Overview from './pages/Overview.jsx';
import { SalesPage, SpecialPage } from './pages/Sales.jsx';
import { PurchasesPage, PurchaseOrdersPage, SupplierReturnsPage } from './pages/Purchases.jsx';
import { InventoryPage } from './pages/Inventory.jsx';
import { ProductsPage } from './pages/Products.jsx';
import { PartiesPage } from './pages/Parties.jsx';
import { CashPage, ExpensesPage, ServicePurchasesPage } from './pages/Cash.jsx';
import { DamagePage, InternalUsePage, ProductionPage } from './pages/StockDocs.jsx';
import { CustomerGroupsPage } from './pages/CustomerGroups.jsx';
import { EmployeesPage, SchedulePage, TimesheetPage, PaysheetsPage, CommissionPage, StaffSettingsPage } from './pages/Staff.jsx';
import { ReportsPage } from './pages/Reports.jsx';
import { SettingsPage } from './pages/Settings.jsx';
import { GEAR_MENU, ALL_SECTIONS, canSee } from './lib/settings-nav.js';
import { setExportGuard } from './lib/excel.js';
import { setPriceDecimals } from './lib/format.js';
import { ModalHost } from './pages/modals.jsx';
import { ShippingPage } from './pages/Shipping.jsx';
import { BankPage } from './pages/BankTxns.jsx';
import { Bell, NotifyPanel, useNotifications, openLink } from './components/Notify.jsx';
import { registerSW } from './lib/push.js';
import { PriceBookPage, DriversPage, SalesReturnsPage } from './pages/Catalog.jsx';
import { QuotesPage } from './pages/Quotes.jsx';
import { ContractsPage } from './pages/Contracts.jsx';
import { TaxPage, InputInvoicesPage } from './pages/Tax.jsx';
import { Login, LinkPage, ForcePassword, isLinkPage } from './pages/Account.jsx';
import { DocStandalone, readDocPage } from './pages/Documents.jsx';
import { readEditorLink } from './lib/docs/editor-link.js';
const PrintEditorPage = React.lazy(() => import('./pages/PrintEditor.jsx').then((m) => ({ default: m.PrintEditorPage })));
import { WarrantyPage } from './pages/Warranty.jsx';
import { LoyaltyPage } from './pages/Loyalty.jsx';
import { ShiftsPage } from './pages/Shifts.jsx';

const PAGES = [
  { id: 'tong-quan', label: 'Tổng quan', icon: 'home', perm: 'xem_bao_cao', comp: Overview },
  { id: 'san-pham', label: 'Danh sách hàng hóa', icon: 'vase', comp: ProductsPage },
  { id: 'bang-gia', label: 'Bảng giá', icon: 'tag', comp: PriceBookPage },
  { id: 'kho', label: 'Tồn kho & kiểm kho', icon: 'box', comp: InventoryPage },
  { id: 'san-xuat', label: 'Sản xuất', icon: 'hammer', comp: ProductionPage },
  { id: 'xuat-huy', label: 'Xuất hủy', icon: 'trash', comp: DamagePage },
  { id: 'xuat-noi-bo', label: 'Xuất dùng nội bộ', icon: 'gift', comp: InternalUsePage },
  { id: 'bao-gia', label: 'Báo giá', icon: 'quote', perm: 'xem_ban_hang', comp: QuotesPage },
  { id: 'hop-dong', label: 'Hợp đồng', icon: 'contract', perm: 'xem_ban_hang', comp: ContractsPage },
  { id: 'dat-rieng', label: 'Đặt hàng', icon: 'order', perm: 'xem_ban_hang', comp: SpecialPage },
  { id: 'ban-hang', label: 'Hóa đơn', icon: 'invoice', perm: 'xem_ban_hang', comp: SalesPage },
  { id: 'tra-hang', label: 'Trả hàng', icon: 'return', perm: 'xem_ban_hang', comp: SalesReturnsPage },
  { id: 'van-chuyen', label: 'Vận chuyển', icon: 'route', perm: 'xem_ban_hang', comp: ShippingPage },
  { id: 'lai-xe', label: 'Lái xe & công nợ', icon: 'truck', perm: 'xem_ban_hang', comp: DriversPage },
  { id: 'nhap-hang', label: 'Nhập hàng', icon: 'import', perm: 'xem_nhap_hang', comp: PurchasesPage },
  { id: 'dat-hang-nhap', label: 'Đặt hàng nhập', icon: 'truck', perm: 'xem_nhap_hang', comp: PurchaseOrdersPage },
  { id: 'hoa-don-vao', label: 'Hóa đơn đầu vào', icon: 'receipt', perm: 'xem_bao_cao', comp: InputInvoicesPage },
  { id: 'tra-nhap', label: 'Trả hàng nhập', icon: 'return', perm: 'xem_nhap_hang', comp: SupplierReturnsPage },
  { id: 'mua-dich-vu', label: 'Mua dịch vụ', icon: 'wrench', perm: 'xem_chi_phi', comp: ServicePurchasesPage },
  { id: 'khach-hang', label: 'Khách hàng', icon: 'users', comp: (p) => <PartiesPage type="kh" {...p} /> },
  { id: 'nha-cung-cap', label: 'Nhà cung cấp', icon: 'kiln', comp: (p) => <PartiesPage type="ncc" {...p} /> },
  { id: 'nhom-khach', label: 'Nhóm khách hàng', icon: 'group', comp: CustomerGroupsPage },
  { id: 'thu-chi', label: 'Sổ quỹ', icon: 'cash', perm: 'xem_thu_chi', comp: CashPage },
  { id: 'tien-ve', label: 'Tiền về tài khoản', icon: 'bank', perm: 'xem_thu_chi', comp: BankPage },
  { id: 'chi-phi', label: 'Chi phí vận hành', icon: 'receipt', perm: 'xem_chi_phi', comp: ExpensesPage },
  { id: 'nhan-vien', label: 'Danh sách nhân viên', icon: 'users', perm: 'owner', comp: EmployeesPage },
  { id: 'lich-lam-viec', label: 'Lịch làm việc', icon: 'calendar', perm: 'cham_cong', comp: SchedulePage },
  { id: 'cham-cong', label: 'Bảng chấm công', icon: 'check', perm: 'cham_cong', comp: TimesheetPage },
  { id: 'bang-luong', label: 'Bảng lương', icon: 'cash', perm: 'owner', comp: PaysheetsPage },
  { id: 'hoa-hong', label: 'Bảng hoa hồng', icon: 'tag', perm: 'owner', comp: CommissionPage },
  { id: 'thiet-lap-nv', label: 'Thiết lập nhân viên', icon: 'gear', perm: 'owner', comp: StaffSettingsPage },
  { id: 'bao-cao', label: 'Báo cáo', icon: 'chart', perm: 'xem_bao_cao', comp: ReportsPage },
  { id: 'thue', label: 'Thuế HKD', icon: 'tax', perm: 'xem_bao_cao', comp: TaxPage },
  { id: 'bao-hanh', label: 'Bảo hành, sửa chữa', icon: 'wrench', perm: 'xem_ban_hang', on: ['warranty'], comp: WarrantyPage },
  { id: 'khuyen-mai', label: 'Khuyến mại & voucher', icon: 'gift', on: ['promo_on', 'voucher_on', 'coupon_on'], comp: LoyaltyPage },
  { id: 'ket-ca', label: 'Kết ca', icon: 'cash', perm: 'thu_chi', on: ['shift_on'], comp: ShiftsPage },
  { id: 'cai-dat', label: 'Thiết lập', icon: 'gear', comp: SettingsPage },
];
// Thanh menu ngang: liên kết thẳng ({ id }), menu thả xuống (items) hoặc mega-menu (groups: tiêu đề nhóm + danh sách).
// Mỗi liên kết là id trang hoặc { id, sub (tab mở sẵn), label, perm, badge }.
const MENU = [
  { id: 'tong-quan' },
  { label: 'Hàng hóa', icon: 'vase', groups: [
    { title: 'Hàng hóa', items: ['san-pham', { id: 'bang-gia', label: 'Thiết lập giá' }] },
    { title: 'Kho hàng', items: ['san-xuat', { id: 'kho', sub: 'adj', label: 'Kiểm kho' }, 'xuat-noi-bo', 'xuat-huy',
      { id: 'kho', sub: 'stock', label: 'Tồn kho' }, { id: 'kho', sub: 'nxt', label: 'Nhập – xuất – tồn' }] },
  ] },
  { label: 'Mua hàng', icon: 'truck', groups: [
    { title: 'Nhà cung cấp', items: ['nha-cung-cap', 'hoa-don-vao'] },
    { title: 'Mua hàng', items: ['nhap-hang', 'tra-nhap', 'dat-hang-nhap'] },
    { title: 'Mua dịch vụ', items: ['mua-dich-vu'] },
  ] },
  { label: 'Đơn hàng', icon: 'order', groups: [
    { title: 'Đơn hàng', items: ['dat-rieng', 'ban-hang', 'tra-hang'] },
    { title: 'Giao hàng', items: ['van-chuyen', 'lai-xe'] },
    { title: 'Báo giá & hợp đồng', items: ['bao-gia', 'hop-dong'] },
    { title: 'Sau bán hàng', items: ['bao-hanh'] },
  ] },
  { label: 'Khách hàng', icon: 'users', groups: [{ title: 'Khách hàng', items: ['khach-hang', 'nhom-khach', 'khuyen-mai'] }] },
  { label: 'Nhân viên', icon: 'users', items: ['nhan-vien', 'lich-lam-viec', 'cham-cong', 'bang-luong', 'hoa-hong', 'thiet-lap-nv'] },
  { label: 'Sổ quỹ', icon: 'wallet', items: ['thu-chi', 'tien-ve', 'chi-phi', 'ket-ca'] },
  { label: 'Báo cáo', icon: 'chart', groups: [
    { title: 'Lãi lỗ & tài chính', items: [{ id: 'bao-cao', sub: 'pl', label: 'Lãi lỗ (P&L)' }, { id: 'bao-cao', sub: 'exp', label: 'Chi phí', perm: 'xem_gia_von' },
      { id: 'bao-cao', sub: 'debt', label: 'Công nợ' }, { id: 'bao-cao', sub: 'be', label: 'Hòa vốn & kịch bản giá', perm: 'xem_gia_von' },
      { id: 'bao-cao', sub: 'brands', label: 'So sánh thương hiệu', perm: 'xem_gia_von' }] },
    { title: 'Bán hàng', items: [{ id: 'bao-cao', sub: 'eod', label: 'Cuối ngày' }, { id: 'bao-cao', sub: 'prod', label: 'Theo sản phẩm' },
      { id: 'bao-cao', sub: 'grp', label: 'Theo kênh / khách / nhóm' }, { id: 'bao-cao', sub: 'orders', label: 'Đặt hàng' }, { id: 'bao-cao', sub: 'staff', label: 'Nhân viên' }] },
    { title: 'Mua hàng & kho', items: [{ id: 'bao-cao', sub: 'factory', label: 'Đơn đặt xưởng' }, { id: 'bao-cao', sub: 'stock', label: 'Nhập – xuất – tồn' }] },
  ] },
  { label: 'Thuế & Kế toán', icon: 'tax', items: [{ id: 'thue', sub: 'tong', label: 'Tổng quan thuế' }, { id: 'thue', sub: 'vao', label: 'Hóa đơn đầu vào' }, { id: 'thue', sub: 'ra', label: 'Hóa đơn đầu ra' }, { id: 'thue', sub: 'so', label: 'Sổ sách & hồ sơ' }] },
];

function readHash() { const [id, sub = ''] = (location.hash || '').replace('#', '').split('/'); return PAGES.some((p) => p.id === id) ? { id, sub } : null; }

// Menu thả xuống: bấm để mở (máy tính rê chuột cũng mở); bấm ra ngoài hoặc Esc để đóng.
// Rê chuột phải dừng một nhịp mới mở (lướt qua nút bên cạnh thì không đổi menu); rời chuột cũng chờ một nhịp mới đóng.
// Chỉ một menu hiện tại một thời điểm: mở menu khác thì menu cũ tắt ngay, không chạy hiệu ứng đóng.
const DD_ENTER_MS = 110; const DD_LEAVE_MS = 240; const DD_EXIT_MS = 130;
let activeDropdown = null; // ref tới hàm đóng của menu đang mở
function Dropdown({ label, icon, active, align = 'left', className = '', btnClass = 'mnav', menuClass = '', noCaret, children }) {
  const [phase, setPhase] = useState('closed'); // closed → open → closing → closed
  const [side, setSide] = useState(align);
  const menuRef = useRef(null); const ref = useRef(null); const timer = useRef(null); const closeRef = useRef(null);
  const show = phase === 'open';
  const close = () => {
    clearTimeout(timer.current);
    setPhase((v) => (v === 'open' ? 'closing' : v));
    timer.current = setTimeout(() => setPhase('closed'), DD_EXIT_MS);
    if (activeDropdown === closeRef) activeDropdown = null;
  };
  closeRef.current = () => {
    clearTimeout(timer.current);
    setPhase('closed');
    if (activeDropdown === closeRef) activeDropdown = null;
  };
  const openNow = () => {
    clearTimeout(timer.current);
    if (activeDropdown && activeDropdown !== closeRef) activeDropdown.current();
    activeDropdown = closeRef;
    setPhase('open');
  };
  const hoverIn = () => {
    clearTimeout(timer.current);
    if (phase === 'closing') openNow();
    else if (!show) timer.current = setTimeout(openNow, DD_ENTER_MS);
  };
  const hoverOut = () => {
    clearTimeout(timer.current);
    if (show) timer.current = setTimeout(close, DD_LEAVE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // Thanh menu có thể xuống dòng: căn lại menu con nếu tràn khỏi mép màn hình
  useLayoutEffect(() => {
    if (phase === 'closed') { setSide(align); return; }
    if (!show) return;
    const r = menuRef.current?.getBoundingClientRect();
    if (r && r.left < 0) setSide('left');
    else if (r && r.right > document.documentElement.clientWidth) setSide('right');
  }, [phase, align]);
  useEffect(() => {
    if (!show) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const k = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', h); window.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k); };
  }, [show]);
  const hover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
  return (
    <div className={`dd ${className}`} ref={ref} onMouseEnter={hover ? hoverIn : undefined} onMouseLeave={hover ? hoverOut : undefined}>
      <button type="button" className={`${btnClass}${active ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={show} onClick={() => (hover || !show ? openNow() : close())}>
        {icon && <Icon name={icon} size={17} />}{label}{!noCaret && <Icon name="down" size={14} className="dd-caret" />}
      </button>
      {phase !== 'closed' && <div ref={menuRef} className={`dd-menu dd-${side} ${menuClass}${show ? '' : ' closing'}`} role="menu" onClick={close}>{children}</div>}
    </div>
  );
}

const Badge = ({ text }) => (text ? <span className="badge-new">{text}</span> : null);
const linksOf = (m) => (m.groups ? m.groups.flatMap((g) => g.items) : [m]);

function MenuLinks({ items, isOn, go }) {
  return items.map((x) => (
    <button key={x.key} role="menuitem" className={`dd-item${isOn(x) ? ' on' : ''}`} onClick={() => go(x.id, x.sub)}>
      <Icon name={x.icon} size={16} /><span className="grow">{x.label}</span><Badge text={x.badge} />
    </button>
  ));
}

// Một nhóm: danh sách đơn; nhiều nhóm: mega-menu chia cột, mỗi cột một tiêu đề nhóm
function MenuPanel({ groups, isOn, go }) {
  if (groups.length === 1 && !groups[0].title) return <MenuLinks items={groups[0].items} isOn={isOn} go={go} />;
  return (
    <div className="mega" style={{ '--cols': Math.min(groups.length, 3) }}>
      {groups.map((g, i) => (
        <div key={g.title || i} className="mega-col">{g.title && <div className="mega-title">{g.title}</div>}<MenuLinks items={g.items} isOn={isOn} go={go} /></div>
      ))}
    </div>
  );
}

function TopItem({ m, isOn, go }) {
  if (!m.groups) return <button className={`mnav${isOn(m) ? ' on' : ''}`} onClick={() => go(m.id, m.sub)}><Icon name={m.icon} size={17} />{m.label}<Badge text={m.badge} /></button>;
  return (
    <Dropdown label={<>{m.label}<Badge text={m.badge} /></>} icon={m.icon} active={linksOf(m).some(isOn)} menuClass={m.groups.length > 1 ? 'dd-mega' : ''}>
      <MenuPanel groups={m.groups} isOn={isOn} go={go} />
    </Dropdown>
  );
}

// Thanh menu một dòng: mục không đủ chỗ gom vào "Khác", giữ tên menu gốc làm tiêu đề nhóm.
// Đo bằng một bản sao ẩn để biết bề rộng thật của từng mục (kể cả khi icon bị ẩn theo bề ngang màn hình).
function MenuBar({ menu, isOn, go }) {
  const inRef = useRef(null); const measRef = useRef(null);
  const [fit, setFit] = useState(menu.length);
  const sig = menu.map((m) => m.key).join('|');
  useLayoutEffect(() => {
    const el = inRef.current; const ms = measRef.current;
    if (!el || !ms) return undefined;
    const calc = () => {
      const cs = getComputedStyle(el);
      const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const gap = parseFloat(cs.columnGap) || 0;
      const ws = [...ms.children].map((c) => c.getBoundingClientRect().width);
      const more = ws.pop();
      let n = ws.length; let used = ws.reduce((t, w) => t + w, 0) + gap * (n - 1);
      if (used > avail) while (n > 0 && used + gap + more > avail) { n -= 1; used -= ws[n] + gap; }
      setFit(n);
    };
    calc();
    const ro = new ResizeObserver(calc); ro.observe(el); ro.observe(ms);
    return () => ro.disconnect();
  }, [sig]);
  const rest = menu.slice(fit);
  const restGroups = rest.map((m) => ({ title: m.groups ? m.label : '', items: linksOf(m) }));
  return (
    <div className="mbar-in" ref={inRef}>
      {menu.slice(0, fit).map((m) => <TopItem key={m.key} m={m} isOn={isOn} go={go} />)}
      {rest.length > 0 && (
        <Dropdown label="Khác" icon="more" align="right" active={rest.some((m) => linksOf(m).some(isOn))} menuClass={restGroups.length > 1 ? 'dd-mega' : ''}>
          <MenuPanel groups={restGroups} isOn={isOn} go={go} />
        </Dropdown>
      )}
      <div className="mbar-measure" aria-hidden="true"><div ref={measRef}>
        {menu.map((m) => <span key={m.key} className="mnav"><Icon name={m.icon} size={17} />{m.label}<Badge text={m.badge} />{m.groups && <Icon name="down" size={14} />}</span>)}
        <span className="mnav"><Icon name="more" size={17} />Khác<Icon name="down" size={14} /></span>
      </div></div>
    </div>
  );
}

// Bánh răng trên thanh trên cùng như KiotViet: các nhóm thiết lập kèm mô tả ngắn, cuối menu là "Xem tất cả thiết lập"
function GearMenu({ active, go }) {
  const { can, session } = useApp();
  const who = { owner: can('owner'), admin: !!session?.user?.is_admin };
  const secs = Object.fromEntries(ALL_SECTIONS.map((s) => [s.id, s]));
  const items = who.owner ? GEAR_MENU.filter((m) => canSee(secs[m.to], who))
    : [{ to: 'thong-bao', label: 'Thông báo', icon: 'bell', sub: 'Thông báo trên điện thoại' }, { to: 'tai-khoan', label: 'Tài khoản của tôi', icon: 'users', sub: 'Đổi mật khẩu' }];
  return (
    <Dropdown className="hdr-gear-dd" btnClass={`icon-btn hdr-gear${active ? ' on' : ''}`} align="right" menuClass="gear-menu" label={<><Icon name="gear" size={20} /><span className="sr-only">Thiết lập</span></>} noCaret>
      {items.map((m) => (
        <button key={m.to} role="menuitem" className="dd-item gear-item" onClick={() => go('cai-dat', m.to)}>
          <Icon name={m.icon} size={20} /><span className="gear-text"><span className="gear-label">{m.label}</span><span className="gear-sub">{m.sub}</span></span>
        </button>
      ))}
      <div className="gear-foot"><button className="btn btn-ghost gear-all" onClick={() => go('cai-dat')}>Xem tất cả thiết lập</button></div>
    </Dropdown>
  );
}

const BRAND_LOGOS ={ TH: 'th', VG: 'vg', AN: 'an' };
function BrandMark({ book }) {
  const logo = BRAND_LOGOS[book.short_name];
  return logo ? <img className="seal seal-img" src={`/logos/${logo}.png`} alt={book.name} /> : <div className="seal">{book.short_name}</div>;
}

function Shell() {
  const { book, books, setBookId, can, open, closeAll, toasts, bootError, backend, session, setSession, settings } = useApp();
  setPriceDecimals(settings?.price_decimals ?? 0);
  const [route, setRoute] = useState(() => readHash() || { id: 'tong-quan', sub: '' });
  const { id: page, sub } = route;
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
  useEffect(() => { const h = () => { const r = readHash(); if (r) setRoute(r); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const visible = PAGES.filter((p) => (!p.perm || can(p.perm)) && (!p.on || p.on.some((k) => settings?.[k])));
  const byId = Object.fromEntries(visible.map((p) => [p.id, p]));
  const cur = byId[page] || byId['ban-hang'] || visible[0];
  const go = (id, s = '') => { setRoute({ id, sub: s }); setMoreOpen(false); window.scrollTo(0, 0); };
  // Trang báo tab đang mở để địa chỉ và mục menu đang chọn khớp theo
  const onSub = useCallback((v) => setRoute((r) => (r.sub === v ? r : { ...r, sub: v })), []);
  useEffect(() => { try { history.replaceState(null, '', '#' + page + (sub ? '/' + sub : '')); } catch (e) { /* bỏ qua */ } }, [page, sub]);
  const signOut = () => backend.signOut().then(() => setSession(null));
  const switchBook = (id) => { closeAll(); setBookId(id); };
  // Xác thực khi xuất file: hỏi lại mật khẩu trước mỗi lần tải Excel
  const [pwAsk, setPwAsk] = useState(null);
  useEffect(() => {
    setExportGuard(settings?.export_auth ? () => new Promise((resolve) => setPwAsk({ resolve })) : null);
    return () => setExportGuard(null);
  }, [settings?.export_auth]);
  // Màu giao diện theo logo của sổ đang mở
  useEffect(() => { const r = document.documentElement; if (book?.short_name) r.dataset.book = book.short_name; return () => { delete r.dataset.book; }; }, [book?.short_name]);

  if (bootError) return <div className="center-screen"><div className="login"><Note tone="warn">{bootError}</Note><Btn onClick={signOut}>Đăng xuất</Btn></div></div>;
  if (!books || !book) return <div className="center-screen"><Loading text="Đang mở sổ…" /></div>;
  const Page = cur.comp;
  const quick = [
    can('ban_hang') && { label: 'Tạo đơn bán', icon: 'cart', kind: 'primary', on: () => open('order-form', {}) },
    can('nhap_hang') && { label: 'Nhập hàng', icon: 'truck', on: () => open('po-form', { mode: 'nhap' }) },
    can('thu_chi') && { label: 'Thu tiền', icon: 'in', on: () => open('payment', { kind: 'thu_khach' }) },
    can('thu_chi') && { label: 'Chi tiền', icon: 'out', on: () => open('payment', { kind: 'tra_ncc' }) },
  ].filter(Boolean);
  const link = (l) => {
    const x = typeof l === 'string' ? { id: l } : l; const p = byId[x.id];
    return p && (!x.perm || can(x.perm)) && { ...p, ...x, key: x.id + (x.sub ? '/' + x.sub : '') };
  };
  const menu = MENU.map((m) => {
    if (!m.groups && !m.items) return link(m);
    const groups = (m.groups || [{ items: m.items }]).map((g) => ({ ...g, items: g.items.map(link).filter(Boolean) })).filter((g) => g.items.length);
    const all = groups.flatMap((g) => g.items);
    if (all.length === 1) return { ...all[0], label: m.label, icon: m.icon || all[0].icon, key: m.label }; // chỉ còn một mục: liên kết thẳng
    return all.length > 0 && { ...m, key: m.label, groups };
  }).filter(Boolean);
  const isOn = (x) => x.id === cur.id && (!x.sub || x.sub === sub);
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
        <div className={`hdr-in${books.length > 1 ? ' multi' : ''}`}>
          <div className="brand"><BrandMark book={book} /><div className="brand-text"><div className="brand-name">{book.name}</div><div className="brand-sub">{session?.user?.is_admin ? 'Tổng quản trị' : book.role === 'owner' ? 'Quản lý sổ' : (book.role_name || book.display_name || 'Nhân viên')}</div></div></div>
          {bookSwitch()}
          <span className="grow" />
          {quick.length > 1 && (
            <Dropdown label="Tạo nhanh" icon="plus" align="right" className="hdr-action" btnClass="hdr-quick">
              {quick.map((q) => <button key={q.label} role="menuitem" className="dd-item" onClick={q.on}><Icon name={q.icon} size={16} />{q.label}</button>)}
            </Dropdown>
          )}
          {can('ban_hang') && <button className="sell-btn hdr-action" onClick={() => open('order-form', {})}><Icon name="cart" size={18} />Bán hàng</button>}
          <Bell data={notif.data} onOpen={() => setNotifyOpen(true)} />
          {byId['cai-dat'] && <GearMenu active={cur.id === 'cai-dat'} go={go} />}
          <Dropdown className="hdr-user" btnClass="user-btn" align="right" icon="users" label={<span className="user-name">{userName}</span>}>
            <div className="dd-info"><b>{userName}</b>{session?.user?.email && <span className="muted small">{session.user.email}</span>}</div>
            <button className="dd-item" role="menuitem" onClick={() => go('cai-dat', 'tai-khoan')}><Icon name="users" size={16} />Tài khoản của tôi (đổi mật khẩu)</button>
            <button className="dd-item" role="menuitem" onClick={() => go('cai-dat')}><Icon name="gear" size={16} />Thiết lập</button>
            <button className="dd-item" role="menuitem" onClick={signOut}><Icon name="logout" size={16} />Đăng xuất</button>
          </Dropdown>
        </div>
      </header>
      <nav className="mbar" aria-label="Chức năng">
        <MenuBar menu={menu} isOn={isOn} go={go} />
      </nav>
      <main className="page" key={book.id + cur.id}><Page go={go} sub={cur.id === page ? sub : ''} onSub={onSub} /></main>
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
          {[...menu, byId['cai-dat'] && { label: 'Hệ thống', key: 'he-thong', groups: [{ items: [{ ...byId['cai-dat'], key: 'cai-dat' }] }] }].filter(Boolean).map((m) => (
            <div key={m.key} className="more-group">
              {m.groups && <div className="more-title">{m.label}</div>}
              <div className="more-menu">{linksOf(m).map((p) => <Btn key={p.key} kind={isOn(p) ? 'soft' : 'ghost'} icon={p.icon} onClick={() => go(p.id, p.sub)}>{p.label}</Btn>)}</div>
            </div>
          ))}
          <Btn icon="logout" onClick={signOut}>Đăng xuất</Btn>
        </Modal>
      )}
      <ModalHost />
      {pwAsk && <ExportAuth onDone={(ok) => { pwAsk.resolve(ok); setPwAsk(null); }} />}
      {notifyOpen && <NotifyPanel data={notif.data} reload={notif.reload} onClose={() => setNotifyOpen(false)} go={go} />}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast${t.kind === 'err' ? ' err' : ''}`}><Icon name={t.kind === 'err' ? 'alert' : 'check'} /> <span>{t.text}</span></div>)}</div>
    </div>
  );
}

function ExportAuth({ onDone }) {
  const { rpc } = useApp();
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); setErr(''); try { await rpc('verify_my_password', { password: pw }); onDone(true); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Modal title="Xác thực trước khi xuất file" size="sm" onClose={() => onDone(false)}
      footer={<><Btn onClick={() => onDone(false)}>Hủy</Btn><Btn kind="primary" busy={busy} onClick={go}>Xuất file</Btn></>}>
      <Field label="Nhập lại mật khẩu đăng nhập"><Input type="password" value={pw} onChange={setPw} autoFocus autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && go()} /></Field>
      {err && <Note tone="bad">{err}</Note>}
    </Modal>
  );
}

function Gate() {
  const { session, backend } = useApp();
  // Lấy lại quyền Tổng quản trị / yêu cầu đổi mật khẩu mới nhất mỗi lần mở ứng dụng
  useEffect(() => { if (session) backend.refreshMe().catch(() => {}); }, [!!session]);
  // Link trong email mở khi ứng dụng đang mở sẵn ở tab này: chỉ phần sau # đổi
  const [linkKey, setLinkKey] = useState(() => (isLinkPage() ? location.hash : ''));
  // Tab chứng từ mở từ thao tác nhanh (giao / thu): ?doc=…
  const [docLink] = useState(readDocPage);
  // Trình sửa mẫu in mở ở tab riêng: ?mau-in=…
  const [editorLink] = useState(readEditorLink);
  useEffect(() => { const h = () => setLinkKey(isLinkPage() ? location.hash : ''); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  if (linkKey) return <LinkPage key={linkKey} />;
  if (!session) return <Login />;
  if (session.user?.must_change_password) return <ForcePassword />;
  if (docLink) return <DocStandalone link={docLink} />;
  if (editorLink) return <React.Suspense fallback={<div className="center-screen"><Loading text="Đang mở trình sửa mẫu in…" /></div>}><PrintEditorPage link={editorLink} /></React.Suspense>;
  return <Shell />;
}

export default function App() {
  const [backend] = useState(() => createApiBackend());
  return <AppProvider backend={backend}><Gate /></AppProvider>;
}
