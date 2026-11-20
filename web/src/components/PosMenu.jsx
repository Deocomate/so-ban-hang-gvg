// Nút ☰ góc trên bên phải các màn hình tạo đơn (bán hàng, báo giá, nhập hàng) — như KiotViet:
// mở thêm việc khác (lập phiếu thu, xử lý đặt hàng, trả hàng, báo cáo cuối ngày…) mà không mất đơn đang làm.
// Việc nào phải rời màn hình (Quản lý, Thiết lập, Đăng xuất) mà đơn đang dở thì hỏi lại một lần.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useQ } from '../lib/store.jsx';
import { money, dmy, match } from '../lib/format.js';
import { Icon, Modal, Table, Search, ErrorBox, StatusPill, DELIVERY, PAYMENT } from './ui.jsx';
import { EndOfDayReport } from '../pages/Reports.jsx';

// screen: 'sale' | 'quote' | 'purchase'; dirty: đang có dòng hàng chưa lưu; onImport(file): thêm dòng từ file Excel
export function PosMenu({ screen = 'sale', dirty, onClose, onImport, keys = [] }) {
  const { session, setSession, backend, can, open } = useApp();
  const [show, setShow] = useState(false);
  const [armed, setArmed] = useState(null);
  const [side, setSide] = useState('dd-right'); // menu mở sang phải hay trái tùy chỗ trống (thanh trên bị xuống dòng ở màn hẹp)
  const ref = useRef(null); const fileRef = useRef(null);
  useEffect(() => {
    if (!show) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target)) setShow(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setShow(false); } };
    document.addEventListener('mousedown', down); window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', esc, true); };
  }, [show]);
  useEffect(() => { if (!show) setArmed(null); }, [show]);

  const run = (fn) => () => { setShow(false); fn(); };
  // Rời màn hình tạo đơn: đơn đang dở thì bấm lần nữa mới rời
  const leave = (key, after) => () => {
    if (dirty && armed !== key) { setArmed(key); return; }
    setShow(false); onClose(); after?.();
  };
  const goPage = (hash) => () => { location.hash = hash; };
  const userName = session?.user?.name || session?.user?.email || 'Tài khoản';
  const isBuy = screen === 'purchase';
  const tasks = isBuy ? [
    can('nhap_hang') && { key: 'tra-nhap', icon: 'return', label: 'Trả hàng nhập', on: run(() => open('po-return', {})) },
    can('thu_chi') && { key: 'phieu-chi', icon: 'contract', label: 'Lập phiếu chi trả nhà cung cấp', on: run(() => open('payment', { kind: 'tra_ncc' })) },
  ] : [
    can('ban_hang') && { key: 'dat-hang', icon: 'bag', label: 'Xử lý đặt hàng', on: run(() => open('pos-pick-order', { mode: 'process' })) },
    can('ban_hang') && { key: 'tra-hang', icon: 'return', label: 'Chọn hóa đơn trả hàng', on: run(() => open('pos-pick-order', { mode: 'return' })) },
    can('thu_chi') && { key: 'phieu-thu', icon: 'contract', label: 'Lập phiếu thu', on: run(() => open('payment', { kind: 'thu_khach' })) },
  ];
  if (onImport) tasks.push({ key: 'import', icon: 'file-in', label: 'Import file', on: run(() => fileRef.current?.click()) });
  const item = (x) => x && (
    <button key={x.key} type="button" role="menuitem" className={`dd-item${x.danger ? ' pos-menu-danger' : ''}${armed === x.key ? ' armed' : ''}`} onClick={x.on}>
      <Icon name={x.icon} size={19} />{armed === x.key ? 'Bỏ đơn đang làm? Bấm lần nữa' : x.label}
    </button>
  );
  return (
    <div className="pos-menu" ref={ref}>
      <button type="button" className={`pos-close${show ? ' on' : ''}`} title="Thêm chức năng" aria-label="Thêm chức năng" aria-haspopup="menu" aria-expanded={show}
        onClick={() => { setSide((ref.current?.getBoundingClientRect().right || 0) < 340 ? 'dd-left' : 'dd-right'); setShow((v) => !v); }}>
        <Icon name="menu" />
      </button>
      {onImport && <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />}
      {show && (
        <div className={`dd-menu ${side} pos-menu-list`} role="menu">
          <div className="pos-menu-user"><Icon name="users" size={20} /><b>{userName}</b></div>
          <div className="pos-menu-tiles">
            <button type="button" role="menuitem" className={armed === 'quan-ly' ? 'armed' : ''} onClick={leave('quan-ly')}>
              <span className="pos-menu-tile tile-a"><Icon name="dashboard" size={20} /></span>{armed === 'quan-ly' ? 'Bấm lần nữa để rời' : 'Quản lý'}
            </button>
            {can('xem_bao_cao') && <button type="button" role="menuitem" onClick={run(() => open('pos-eod', {}))}>
              <span className="pos-menu-tile tile-b"><Icon name="pie" size={20} /></span>Báo cáo cuối ngày
            </button>}
          </div>
          <div className="pos-menu-sep" />
          {tasks.filter(Boolean).map(item)}
          <div className="pos-menu-sep" />
          {item({ key: 'thiet-lap', icon: 'sliders', label: 'Thiết lập & Hiển thị', on: leave('thiet-lap', goPage(isBuy ? '#cai-dat/mua-hang' : '#cai-dat/don-hang')) })}
          {item({ key: 'phim-tat', icon: 'keyboard', label: 'Phím tắt', on: run(() => open('pos-keys', { keys })) })}
          <div className="pos-menu-sep" />
          {item({ key: 'dang-xuat', icon: 'logout', label: 'Đăng xuất', danger: true, on: leave('dang-xuat', () => backend.signOut().then(() => setSession(null))) })}
        </div>
      )}
    </div>
  );
}

// Chọn đơn để xử lý tiếp: đặt hàng còn phải giao, hoặc hóa đơn đã giao để trả hàng
export function PickOrderDialog({ mode, onClose }) {
  const { open } = useApp();
  const [search, setSearch] = useState('');
  const { data, error } = useQ('sales_orders', [], 'created_at desc', 3000);
  const isReturn = mode === 'return';
  const rows = useMemo(() => (data || []).filter((o) => o.status !== 'huy'
    && (isReturn ? o.delivered_value > 0 : o.kind === 'dat_hang' && (o.status === 'nhap' || o.remaining_qty > 0))
    && match(`${o.code} ${o.customer_name} ${o.customer_phone || ''} ${o.note || ''}`, search)), [data, search, isReturn]);
  const pick = (o) => { onClose(); open(isReturn ? 'return' : 'order', isReturn ? { order: o } : { id: o.id }); };
  return (
    <Modal title={isReturn ? 'Chọn hóa đơn trả hàng' : 'Xử lý đặt hàng'} onClose={onClose} size="lg">
      <div className="stack">
        <div className="row gap"><Search value={search} onChange={setSearch} placeholder="Tìm mã đơn, khách, số điện thoại…" /></div>
        <ErrorBox error={error} />
        <Table dense rows={data ? rows.slice(0, 200) : null} onRow={pick}
          empty={isReturn ? 'Không có hóa đơn đã giao phù hợp' : 'Không có đơn đặt hàng nào đang chờ xử lý'}
          columns={[
            { key: 'c', label: 'Mã đơn', render: (o) => <><b>{o.code}</b><div className="cell-sub">{dmy(o.order_date)}</div></> },
            { key: 'k', label: 'Khách hàng', render: (o) => <>{o.customer_name}{o.customer_phone && <div className="cell-sub">{o.customer_phone}</div>}</> },
            { key: 't', label: 'Tổng đơn', align: 'right', render: (o) => money(o.order_total) },
            { key: 's', label: isReturn ? 'Thanh toán' : 'Giao hàng', render: (o) => (isReturn ? <StatusPill map={PAYMENT} value={o.payment_status} /> : <StatusPill map={DELIVERY} value={o.delivery_status} />) },
          ]} />
        {rows.length > 200 && <div className="muted small">Đang hiện 200 đơn mới nhất — gõ tìm để thu hẹp.</div>}
      </div>
    </Modal>
  );
}

export function EodDialog({ onClose }) {
  return <Modal title="Báo cáo cuối ngày" onClose={onClose} size="xl"><EndOfDayReport /></Modal>;
}

export function KeysDialog({ keys = [], onClose }) {
  const all = [...keys, ['↑ / ↓, Enter', 'Chọn hàng trong danh sách tìm kiếm'], ['Esc', 'Đóng danh sách tìm kiếm / hộp thoại đang mở']];
  return (
    <Modal title="Phím tắt" onClose={onClose} size="sm">
      <dl className="kv">{all.map(([k, v]) => <React.Fragment key={k}><dt><kbd className="kbd">{k}</kbd></dt><dd>{v}</dd></React.Fragment>)}</dl>
    </Modal>
  );
}
