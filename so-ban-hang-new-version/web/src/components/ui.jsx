import React, { useEffect, useMemo, useRef, useState } from 'react';
import { money, parseNum, qty as fq, match } from '../lib/format.js';

// ---------- Biểu tượng ----------
const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01',
  order: 'M8 3h8l1 3h3v15H4V6h3zM9 11h6M9 15h6',
  kiln: 'M4 21V10l8-6 8 6v11M9 21v-6a3 3 0 0 1 6 0v6M12 4V2',
  truck: 'M2 6h12v10H2zM14 9h4l3 3v4h-7M6 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
  box: 'M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8',
  vase: 'M9 3h6M10 3v3c-3 2-5 5-5 9a6 6 0 0 0 14 0c0-4-2-7-5-9V3',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v6M18 9v6',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  chev: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6', info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z', dl: 'M12 3v12M7 10l5 5 5-5M4 21h16', up: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  in: 'M12 3v12M7 10l5 5 5-5M3 21h18', out: 'M12 21V9M7 14l5-5 5 5M3 3h18', more: 'M5 12h.01M12 12h.01M19 12h.01',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01', check: 'M5 12l5 5 9-10', back: 'M15 6l-6 6 6 6', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10', book: 'M4 4h11a3 3 0 0 1 3 3v14H7a3 3 0 0 1-3-3zM4 18a3 3 0 0 1 3-3h11',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4z',
  route: 'M6 19a2 2 0 1 0 0-.01M18 7a2 2 0 1 0 0-.01M6 17V9a3 3 0 0 1 3-3h3M18 9v6a3 3 0 0 1-3 3h-3',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  phone: 'M7 2h10v20H7zM11 18h2',
};
export function Icon({ name, size = 18, stroke = 1.8, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name] || P.info} /></svg>
  );
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
export function Select({ value, onChange, options, placeholder, ...rest }) {
  return (
    <select className="inp" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
    </select>
  );
}
export function DateInput({ value, onChange, ...rest }) {
  return <input type="date" className="inp" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
// Ô số tiền / số lượng: hiển thị 1,500,000 ngay khi gõ; vẫn hiểu "1,5tr", "200k", "1.500.000"
const groupDigits = (d) => d.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function NumInput({ value, onChange, money: isMoney = true, placeholder, className = '', ...rest }) {
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
  return (
    <input ref={ref} className={`inp num ${className}`} inputMode={isMoney ? 'numeric' : 'decimal'} value={txt} placeholder={placeholder}
      onFocus={(e) => { setFocus(true); setTimeout(() => e.target.select(), 0); }}
      onBlur={() => { setFocus(false); const n = parseNum(txt); onChange(n === null || Number.isNaN(n) ? null : n); setTxt(show(n === null || Number.isNaN(n) ? null : n)); }}
      onChange={handle}
      {...rest} />
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

export function Section({ title, actions, children, className = '' }) {
  return (
    <section className={`section ${className}`}>
      {(title || actions) && <div className="section-head"><h3>{title}</h3><div className="row gap-s">{actions}</div></div>}
      {children}
    </section>
  );
}
