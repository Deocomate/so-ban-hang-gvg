import React, { useEffect, useMemo, useRef, useState } from 'react';
import { money, parseNum, qty as fq, match } from '../lib/format.js';
import {
  Amphora, ArrowDownToLine, ArrowUpFromLine, Banknote, Bell, BookOpen, Calculator, Calendar, ChartColumn, Check as CheckIcon, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Copy, Download, Ellipsis, Factory, FilePenLine, FileText, History, House, Info, Landmark, Link, LogOut, Package, PackagePlus, Pencil, Plus, Printer, QrCode, Receipt, ReceiptText, RefreshCw, Route, Search as SearchIcon, Settings, ShoppingCart, Smartphone, Tag, TriangleAlert, Truck, Undo2, Upload, Users, Wallet, X,
} from 'lucide-react';

// ---------- Biểu tượng ----------
const ICONS = {
  home: House,
  cart: ShoppingCart,
  order: ClipboardList,
  kiln: Factory,
  truck: Truck,
  box: Package,
  vase: Amphora,
  users: Users,
  cash: Banknote,
  receipt: Receipt,
  invoice: ReceiptText,
  chart: ChartColumn,
  gear: Settings,
  plus: Plus,
  x: X,
  search: SearchIcon,
  chev: ChevronRight,
  down: ChevronDown,
  info: Info,
  print: Printer,
  dl: Download,
  up: Upload,
  'in': ArrowDownToLine,
  out: ArrowUpFromLine,
  more: Ellipsis,
  alert: TriangleAlert,
  check: CheckIcon,
  back: ChevronLeft,
  return: Undo2,
  edit: Pencil,
  logout: LogOut,
  book: BookOpen,
  history: History,
  bell: Bell,
  qr: QrCode,
  route: Route,
  bank: Landmark,
  refresh: RefreshCw,
  copy: Copy,
  link: Link,
  phone: Smartphone,
  calendar: Calendar,
  quote: FileText,
  contract: FilePenLine,
  tag: Tag,
  tax: Calculator,
  import: PackagePlus,
  wallet: Wallet,
};
export function Icon({ name, size = 18, stroke = 1.75, className }) {
  const C = ICONS[name] || Info;
  return <C className={className} size={size} strokeWidth={stroke} aria-hidden="true" />;
}

export function Btn({ kind = 'ghost', icon, children, busy, small, className = '', ...rest }) {
  return (
    <button type="button" className={`btn btn-${kind}${small ? ' btn-sm' : ''} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy ? <span className="spin" /> : icon ? <Icon name={icon} size={small ? 15 : 17} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}

export function Pill({ tone = 'neutral', children, title }) {
  return <span className={`pill pill-${tone}`} title={title}>{children}</span>;
}

export const DELIVERY = {
  nhap: ['Nháp', 'neutral'], chua_giao: ['Chưa giao', 'warn'], giao_mot_phan: ['Giao một phần', 'info'], da_giao_du: ['Đã giao đủ', 'good'], da_huy: ['Đã hủy', 'mute'],
};
export const PAYMENT = {
  chua_thanh_toan: ['Chưa thu', 'warn'], da_dat_coc: ['Đã cọc', 'info'], thanh_toan_mot_phan: ['Thu một phần', 'info'],
  da_thanh_toan_du: ['Đã thu đủ', 'good'], thua_tien: ['Thu dư – cần hoàn', 'bad'],
};
export const RECEIVE = {
  nhap: ['Nháp', 'neutral'], chua_nhan: ['Chưa nhận', 'warn'], nhan_mot_phan: ['Nhận một phần', 'info'], da_nhan_du: ['Đã nhận đủ', 'good'], da_huy: ['Đã hủy', 'mute'],
};
export const StatusPill = ({ map, value }) => { const [t, tone] = map[value] || [value, 'neutral']; return <Pill tone={tone}>{t}</Pill>; };

export function Field({ label, hint, error, children, wide, required }) {
  return (
    <label className={`field${wide ? ' field-wide' : ''}`}>
      {label && <span className="field-label">{label}{required && <b className="req"> *</b>}</span>}
      {children}
      {error ? <span className="field-err">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ value, onChange, ...rest }) {
  return <input className="inp" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export function TextArea({ value, onChange, rows = 2, ...rest }) {
  return <textarea className="inp" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
export { Select, DateInput, MonthInput } from './Pickers.jsx';
// Ô số tiền / số lượng: hiển thị 1,500,000 ngay khi gõ; vẫn hiểu "1,5tr", "200k", "1.500.000".
// Phím ↑/↓ tăng giảm theo step (giữ Shift: gấp 10). suffix: đơn vị hiện cuối ô (tiền mặc định "đ", truyền false để ẩn).
// stepper: hiện nút −/+ hai bên (dùng cho ô số lượng).
const groupDigits = (d) => d.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function NumInput({ value, onChange, money: isMoney = true, placeholder, className = '', suffix, step, min, max, stepper, style, ...rest }) {
  const show = (v) => (v === null || v === undefined || v === '' ? '' : isMoney ? money(v) : fq(v));
  const [txt, setTxt] = useState(show(value));
  const [focus, setFocus] = useState(false);
  const ref = useRef(null); const caret = useRef(null);
  useEffect(() => { if (!focus) setTxt(show(value)); }, [value, focus, isMoney]);
  // giữ con trỏ đúng chỗ sau khi tự chèn dấu phẩy
  React.useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    const want = caret.current; caret.current = null; let pos = 0; let seen = 0;
    while (pos < txt.length && seen < want) { if (/\d/.test(txt[pos])) seen++; pos++; }
    try { ref.current.setSelectionRange(pos, pos); } catch (e) { /* bỏ qua */ }
  }, [txt]);
  const handle = (e) => {
    const raw = e.target.value;
    // Chỉ có chữ số và dấu phân cách (không phải kiểu "1,5tr") → tự nhóm hàng nghìn bằng dấu phẩy
    if (isMoney && /^[\d.,\s]*$/.test(raw)) {
      const digits = raw.replace(/\D/g, '');
      const before = raw.slice(0, e.target.selectionStart ?? raw.length).replace(/\D/g, '').length;
      const f = groupDigits(digits);
      caret.current = Math.min(before, digits.replace(/^0+(?=\d)/, '').length);
      setTxt(f);
      onChange(digits === '' ? null : Number(digits));
      return;
    }
    setTxt(raw); const n = parseNum(raw);
    if (n !== null && !Number.isNaN(n)) onChange(n); else if (raw === '') onChange(null);
  };
  const inc = step ?? (isMoney ? 1000 : 1);
  const bump = (dir, big) => {
    const cur = parseNum(txt); let n = (cur === null || Number.isNaN(cur) ? 0 : cur) + dir * inc * (big ? 10 : 1);
    n = Math.round(n * 1e6) / 1e6;
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    setTxt(show(n)); onChange(n);
  };
  const unit = suffix === undefined ? (isMoney ? 'đ' : null) : suffix || null;
  const input = (
    <input ref={ref} className={`inp num ${className}`} inputMode={isMoney ? 'numeric' : 'decimal'} value={txt} placeholder={placeholder}
      onFocus={(e) => { setFocus(true); setTimeout(() => e.target.select(), 0); }}
      onBlur={() => { setFocus(false); const n = parseNum(txt); onChange(n === null || Number.isNaN(n) ? null : n); setTxt(show(n === null || Number.isNaN(n) ? null : n)); }}
      onKeyDown={(e) => { if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !rest.disabled && !rest.readOnly) { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey); } }}
      onChange={handle}
      style={unit ? { paddingRight: 16 + String(unit).length * 7.5 } : stepper ? undefined : style}
      {...rest} />
  );
  if (!unit && !stepper) return input;
  const atMin = min !== undefined && Number(value) <= min; const atMax = max !== undefined && Number(value) >= max;
  return (
    <div className={`ninp${stepper ? ' has-step' : ''}${unit ? ' has-unit' : ''}`} style={style}>
      {stepper && <button type="button" className="ninp-step" tabIndex={-1} disabled={rest.disabled || atMin} onClick={() => bump(-1)} aria-label="Giảm">−</button>}
      <span className="ninp-field">{input}{unit && <span className="ninp-unit" aria-hidden="true">{unit}</span>}</span>
      {stepper && <button type="button" className="ninp-step" tabIndex={-1} disabled={rest.disabled || atMax} onClick={() => bump(1)} aria-label="Tăng">+</button>}
    </div>
  );
}

export function Check({ checked, onChange, children }) {
  return <label className="check"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /> <span>{children}</span></label>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab${value === t.value ? ' on' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}{t.count !== undefined && t.count !== null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Search({ value, onChange, placeholder = 'Tìm…' }) {
  return (
    <div className="search">
      <Icon name="search" size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button className="search-x" onClick={() => onChange('')} aria-label="Xóa"><Icon name="x" size={14} /></button>}
    </div>
  );
}

export function Loading({ text = 'Đang tải…' }) { return <div className="loading"><span className="spin" /> {text}</div>; }
export function ErrorBox({ error }) { return error ? <div className="alert alert-bad"><Icon name="alert" /> <span>{error}</span></div> : null; }
export function Empty({ title, children, action }) {
  return <div className="empty"><div className="empty-title">{title}</div>{children && <div className="empty-text">{children}</div>}{action}</div>;
}
export function Note({ tone = 'info', children }) { return <div className={`alert alert-${tone}`}><Icon name={tone === 'bad' || tone === 'warn' ? 'alert' : 'info'} /> <div>{children}</div></div>; }

// Bảng dữ liệu: cột {key,label,align,render,width,className}
export function Table({ columns, rows, onRow, empty = 'Chưa có dữ liệu', rowKey = 'id', foot, dense, rowClass }) {
  if (!rows) return <Loading />;
  return (
    <div className="table-wrap">
      <table className={`tbl${dense ? ' dense' : ''}`}>
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : ''} style={c.width ? { width: c.width } : null}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="tbl-empty">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} onClick={onRow ? () => onRow(r) : undefined} className={`${onRow ? 'clickable' : ''} ${rowClass ? rowClass(r) || '' : ''}`}>
              {columns.map((c) => <td key={c.key} className={`${c.align === 'right' ? 'r num' : c.align === 'center' ? 'c' : ''} ${c.className || ''}`}>{c.render ? c.render(r, i) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && <tfoot><tr>{columns.map((c) => <td key={c.key} className={c.align === 'right' ? 'r num' : ''}>{foot[c.key] ?? ''}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size = 'md', subtitle }) {
  const ref = useRef(null);
  useEffect(() => {
    // Chỉ hộp thoại trên cùng phản ứng với phím Esc
    const h = (e) => { if (e.key !== 'Escape') return; const all = document.querySelectorAll('.overlay'); if (all[all.length - 1] === ref.current) onClose?.(); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" ref={ref} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><div className="modal-title">{title}</div>{subtitle && <div className="modal-sub">{subtitle}</div>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Xác nhận 2 bước ngay trên nút (trình xem không cho dùng hộp thoại confirm)
export function ConfirmBtn({ children, confirmText = 'Bấm lần nữa để xác nhận', onConfirm, kind = 'ghost', icon, busy, small }) {
  const [arm, setArm] = useState(false);
  useEffect(() => { if (!arm) return; const t = setTimeout(() => setArm(false), 4000); return () => clearTimeout(t); }, [arm]);
  return <Btn kind={arm ? 'danger' : kind} icon={icon} busy={busy} small={small} onClick={() => (arm ? (setArm(false), onConfirm()) : setArm(true))}>{arm ? confirmText : children}</Btn>;
}

// Ô chọn có tìm kiếm (khách hàng, sản phẩm…)
export function Picker({ items, value, onChange, getLabel, getSub, placeholder = 'Chọn…', renderItem, onCreate, createLabel, autoFocus, filterKeys }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const sel = items?.find((x) => x.id === value);
  const list = useMemo(() => (items || []).filter((x) => match((filterKeys ? filterKeys(x) : getLabel(x) + ' ' + (getSub ? getSub(x) : '')), q)).slice(0, 60), [items, q, getLabel, getSub, filterKeys]);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const pick = (x) => { onChange(x.id, x); setOpen(false); setQ(''); };
  return (
    <div className="picker" ref={ref}>
      <div className={`inp picker-box${open ? ' open' : ''}`} onClick={() => setOpen(true)}>
        {open ? (
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder={sel ? getLabel(sel) : placeholder}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); if (list[hi]) pick(list[hi]); }
              else if (e.key === 'Escape') setOpen(false);
            }} />
        ) : (
          <button type="button" className="picker-val" autoFocus={autoFocus}>{sel ? getLabel(sel) : <span className="muted">{placeholder}</span>}</button>
        )}
        <Icon name="down" size={15} />
      </div>
      {open && (
        <div className="picker-menu">
          {list.length === 0 && <div className="picker-empty">Không tìm thấy</div>}
          {list.map((x, i) => (
            <button type="button" key={x.id} className={`picker-item${i === hi ? ' hi' : ''}${x.id === value ? ' sel' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(x)}>
              {renderItem ? renderItem(x) : <><span>{getLabel(x)}</span>{getSub && <span className="muted small">{getSub(x)}</span>}</>}
            </button>
          ))}
          {onCreate && <button type="button" className="picker-item picker-create" onClick={() => { setOpen(false); onCreate(q); }}><Icon name="plus" size={15} /> {createLabel || 'Thêm mới'}{q ? ` “${q}”` : ''}</button>}
        </div>
      )}
    </div>
  );
}

export function KV({ items }) {
  return <dl className="kv">{items.filter(Boolean).map(([k, v, cls]) => <React.Fragment key={k}><dt>{k}</dt><dd className={cls || ''}>{v}</dd></React.Fragment>)}</dl>;
}

// Trang danh sách: cột lọc bên trái (tiêu đề + các ô lọc), bên phải là thanh tìm kiếm / nút thao tác và bảng.
// Điện thoại: cột lọc nằm trên, các lựa chọn trượt ngang.
export function ListPage({ title, sub, filters, search, actions, children }) {
  const [more, setMore] = useState(false);
  return (
    <div className="lp">
      <aside className="lp-side">
        <div className="lp-head"><h1 className="page-title">{title}</h1>{sub && <div className="page-sub">{sub}</div>}</div>
        <div className={`lp-filters${more ? ' more' : ''}`}>{filters}</div>
        <button type="button" className="link-btn small lp-more" onClick={() => setMore((v) => !v)}>{more ? 'Thu gọn bộ lọc' : 'Bộ lọc khác'}</button>
      </aside>
      <div className="lp-main">
        {(search || actions) && <div className="lp-bar">{search}<div className="lp-actions">{actions}</div></div>}
        {children}
      </div>
    </div>
  );
}
export function FilterBox({ title, children }) {
  return <div className="fbox"><div className="fbox-title">{title}</div><div className="fbox-body">{children}</div></div>;
}
// Danh sách chọn một (thay cho thẻ tab): {value, label, count}
export function RadioList({ value, onChange, options }) {
  return (
    <div className="rlist" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} className={`rl-item${value === o.value ? ' on' : ''}`} onClick={() => onChange(o.value)}>
          <span className="rl-dot" /><span className="rl-label">{o.label}</span>{o.count !== undefined && o.count !== null && <span className="rl-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, actions, children, className = '' }) {
  return (
    <section className={`section ${className}`}>
      {(title || actions) && <div className="section-head"><h3>{title}</h3><div className="row gap-s">{actions}</div></div>}
      {children}
    </section>
  );
}
