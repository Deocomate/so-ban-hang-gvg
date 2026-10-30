// Ô chọn ngày / tháng / danh sách tự vẽ: hiển thị kiểu Việt Nam (dd/mm/yyyy, T2 đầu tuần), gõ phím được,
// khung chọn nổi lên trên cùng (không bị hộp thoại cắt mất). Giá trị vẫn là chuỗi như ô gốc: 'yyyy-mm-dd', 'yyyy-mm', value của option.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dmy, todayVN, addDays, norm } from '../lib/format.js';
import { Icon } from './ui.jsx';

// Máy cảm ứng (điện thoại, máy tính bảng): dùng bàn phím/khung chọn gốc của máy cho quen tay
export const isTouch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

// ---------- Khung nổi gắn dưới (hoặc trên) ô nhập ----------
function Popover({ anchor, open, onClose, width, className = '', children }) {
  const ref = useRef(null);
  const close = useRef(onClose); close.current = onClose;
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const r = anchor.current?.getBoundingClientRect(); if (!r) return;
      const h = ref.current?.offsetHeight || 320;
      const w = Math.min(Math.max(width || 0, r.width), window.innerWidth - 16);
      const below = window.innerHeight - r.bottom - 8;
      const up = below < Math.min(h, 300) && r.top > below;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      setPos(up ? { left, width: w, bottom: window.innerHeight - r.top + 4, maxHeight: r.top - 12 } : { left, width: w, top: r.bottom + 4, maxHeight: below - 4 });
    };
    place();
    const raf = requestAnimationFrame(place);
    const down = (e) => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) close.current(); };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('mousedown', down);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('mousedown', down); };
  }, [open, width]);
  if (!open) return null;
  return createPortal(<div ref={ref} className={`pop ${className}`} style={{ position: 'fixed', ...(pos || { opacity: 0, top: 0, left: 0 }) }}>{children}</div>, document.body);
}

// ---------- Ngày ----------
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validIso = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
// Hiểu "30/10/2026", "30/10/26", "30-10", "30102026", "301026", "3010" (thiếu năm thì lấy năm của ngày đang chọn)
export function parseDmy(s, baseIso) {
  const t = String(s || '').trim(); if (!t) return '';
  let d, m, y;
  const parts = t.split(/[^\d]+/).filter(Boolean);
  if (parts.length >= 2) [d, m, y] = parts;
  else if (/^\d{4}$|^\d{6}$|^\d{8}$/.test(t)) { d = t.slice(0, 2); m = t.slice(2, 4); y = t.slice(4) || undefined; }
  else return null;
  const by = Number((baseIso || todayVN()).slice(0, 4));
  let yy = y === undefined ? by : Number(y);
  if (y !== undefined && y.length <= 2) yy = 2000 + yy;
  const dd = Number(d), mm = Number(m);
  return validIso(yy, mm, dd) ? isoOf(yy, mm, dd) : null;
}
// Tự chèn dấu "/" khi gõ liền các chữ số
const maskDate = (raw) => { const g = raw.replace(/\D/g, '').slice(0, 8); return g.length > 4 ? `${g.slice(0, 2)}/${g.slice(2, 4)}/${g.slice(4)}` : g.length > 2 ? `${g.slice(0, 2)}/${g.slice(2)}` : g; };

const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
function Calendar({ value, min, max, onPick }) {
  const today = todayVN();
  const [view, setView] = useState((value || today).slice(0, 7));
  const [mode, setMode] = useState('day');
  const y = Number(view.slice(0, 4)), m = Number(view.slice(5, 7));
  const shift = (n) => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); setView(`${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`); };
  const out = (iso) => (min && iso < min) || (max && iso > max);
  const first = new Date(Date.UTC(y, m - 1, 1)); const lead = (first.getUTCDay() + 6) % 7;
  const start = addDays(isoOf(y, m, 1), -lead);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="cal" onMouseDown={(e) => e.preventDefault()}>
      <div className="cal-head">
        <button type="button" className="cal-nav" onClick={() => (mode === 'day' ? shift(-1) : shift(-12))} aria-label={mode === 'day' ? 'Tháng trước' : 'Năm trước'}><Icon name="back" size={16} /></button>
        <button type="button" className="cal-title" onClick={() => setMode(mode === 'day' ? 'month' : 'day')}>{mode === 'day' ? `Tháng ${m}, ${y}` : `Năm ${y}`}</button>
        <button type="button" className="cal-nav" onClick={() => (mode === 'day' ? shift(1) : shift(12))} aria-label={mode === 'day' ? 'Tháng sau' : 'Năm sau'}><Icon name="chev" size={16} /></button>
      </div>
      {mode === 'day' ? (
        <div className="cal-grid" role="grid">
          {WD.map((w) => <span key={w} className="cal-wd">{w}</span>)}
          {cells.map((iso) => (
            <button type="button" key={iso} disabled={out(iso)} onClick={() => onPick(iso)} aria-label={dmy(iso)} aria-pressed={iso === value}
              className={`cal-day${iso.slice(0, 7) !== view ? ' other' : ''}${iso === today ? ' today' : ''}${iso === value ? ' on' : ''}`}>{Number(iso.slice(8))}</button>
          ))}
        </div>
      ) : (
        <div className="cal-months">
          {Array.from({ length: 12 }, (_, i) => (
            <button type="button" key={i} className={`cal-month${i + 1 === m ? ' on' : ''}`} onClick={() => { setView(`${y}-${pad(i + 1)}`); setMode('day'); }}>Th {i + 1}</button>
          ))}
        </div>
      )}
      <div className="cal-foot">
        <button type="button" className="link-btn small" disabled={out(today)} onClick={() => onPick(today)}>Hôm nay</button>
        {value && <span className="muted small">{dmy(value)}</span>}
      </div>
    </div>
  );
}

export function DateInput({ value, onChange, min, max, disabled, placeholder = 'dd/mm/yyyy', className = '', style, id, ...rest }) {
  const [txt, setTxt] = useState(dmy(value));
  const [focus, setFocus] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef(null); const inp = useRef(null);
  const touch = isTouch();
  useEffect(() => { if (!focus) setTxt(dmy(value)); }, [value, focus]);
  const clamp = (iso) => (iso && min && iso < min ? min : iso && max && iso > max ? max : iso);
  const commit = (iso) => { const v = clamp(iso); setTxt(dmy(v)); if (v !== (value || '')) onChange(v); };
  const pick = (iso) => { commit(iso); setOpen(false); inp.current?.focus(); };
  const finish = () => { const iso = parseDmy(txt, value); if (iso === null) setTxt(dmy(value)); else commit(iso); };
  const onKey = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (e.altKey) { setOpen(true); return; }
      const base = parseDmy(txt, value) || value || todayVN();
      commit(addDays(base, e.key === 'ArrowUp' ? 1 : -1));
    } else if (e.key === 'Enter') { finish(); setOpen(false); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
    else if (e.key === 'F4') { e.preventDefault(); setOpen((v) => !v); }
    else if (e.key === 'Tab') setOpen(false);
  };
  return (
    <div className={`dinp${disabled ? ' off' : ''}`} ref={box} style={style}>
      <input ref={inp} id={id} className={`inp ${className}`} value={txt} placeholder={placeholder} disabled={disabled} readOnly={touch}
        inputMode="numeric" autoComplete="off" aria-haspopup="dialog" aria-expanded={open}
        onChange={(e) => { const raw = e.target.value; setTxt(e.target.selectionStart === raw.length && /^[\d/]*$/.test(raw) && raw.length > txt.length ? maskDate(raw) : raw); }}
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); if (!touch) finish(); }}
        onClick={() => !disabled && setOpen(true)} onKeyDown={onKey} {...rest} />
      <button type="button" className="dinp-btn" tabIndex={-1} disabled={disabled} onClick={() => { setOpen((v) => !v); inp.current?.focus(); }} aria-label="Mở lịch"><Icon name="calendar" size={16} /></button>
      <Popover anchor={box} open={open} onClose={() => setOpen(false)} width={276} className="pop-cal">
        <Calendar value={value} min={min} max={max} onPick={pick} />
      </Popover>
    </div>
  );
}

// ---------- Tháng (giá trị 'yyyy-mm') ----------
export function MonthInput({ value, onChange, min, max, disabled, style, ...rest }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number((value || todayVN()).slice(0, 4)));
  const box = useRef(null);
  useEffect(() => { if (open) setYear(Number((value || todayVN()).slice(0, 4))); }, [open]);
  const label = value ? `Tháng ${Number(value.slice(5, 7))}/${value.slice(0, 4)}` : 'Chọn tháng';
  return (
    <div className="dinp" ref={box} style={style}>
      <button type="button" className="inp sel-btn" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }} {...rest}>
        <span className="sel-val">{label}</span><Icon name="calendar" size={16} />
      </button>
      <Popover anchor={box} open={open} onClose={() => setOpen(false)} width={240} className="pop-cal">
        <div className="cal" onMouseDown={(e) => e.preventDefault()}>
          <div className="cal-head">
            <button type="button" className="cal-nav" onClick={() => setYear(year - 1)} aria-label="Năm trước"><Icon name="back" size={16} /></button>
            <span className="cal-title">Năm {year}</span>
            <button type="button" className="cal-nav" onClick={() => setYear(year + 1)} aria-label="Năm sau"><Icon name="chev" size={16} /></button>
          </div>
          <div className="cal-months">
            {Array.from({ length: 12 }, (_, i) => {
              const v = `${year}-${pad(i + 1)}`;
              return <button type="button" key={v} disabled={(min && v < min) || (max && v > max)} className={`cal-month${v === value ? ' on' : ''}`} onClick={() => { onChange(v); setOpen(false); }}>Th {i + 1}</button>;
            })}
          </div>
        </div>
      </Popover>
    </div>
  );
}

// ---------- Danh sách chọn ----------
// Cùng cách dùng với <select>: options là chuỗi hoặc {value, label, disabled}; placeholder = dòng "trống" đầu danh sách.
export function Select({ value, onChange, options, placeholder, style, className = '', disabled, id, ...rest }) {
  const opts = useMemo(() => [
    ...(placeholder !== undefined ? [{ value: '', label: placeholder, ph: true }] : []),
    ...options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
  ], [options, placeholder]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const box = useRef(null); const btn = useRef(null); const list = useRef(null); const search = useRef(null);
  const cur = opts.find((o) => String(o.value) === String(value ?? ''));
  const searchable = opts.length > 8;
  // Tìm theo từng từ, không dấu: "tra nha" khớp "Trả tiền nhà cung cấp"
  const shown = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return words.length ? opts.filter((o) => !o.ph && words.every((w) => norm(o.label).includes(w))) : opts;
  }, [opts, q]);
  useEffect(() => {
    if (!open) return undefined;
    setQ(''); setHi(Math.max(0, opts.indexOf(cur)));
    const t = setTimeout(() => search.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => { list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }); }, [hi, open, shown]);
  if (isTouch()) {
    return (
      <select className={`inp ${className}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={style} disabled={disabled} id={id} {...rest}>
        {opts.map((o) => <option key={String(o.value)} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
    );
  }
  const choose = (o) => { if (!o || o.disabled) return; setOpen(false); btn.current?.focus(); if (String(o.value) !== String(value ?? '')) onChange(String(o.value)); };
  const move = (d) => {
    if (!shown.length) return;
    let i = hi;
    for (let n = 0; n < shown.length; n++) { i = (i + d + shown.length) % shown.length; if (!shown[i].disabled) break; }
    setHi(i);
  };
  const onKey = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'F4'].includes(e.key)) { e.preventDefault(); setOpen(true); }
      else if (e.key.length === 1 && /\S/.test(e.key)) { // gõ chữ cái đầu để nhảy tới lựa chọn
        const i = opts.findIndex((o) => !o.ph && !o.disabled && norm(o.label).startsWith(norm(e.key)));
        if (i >= 0) choose(opts[i]);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0); }
    else if (e.key === 'End') { e.preventDefault(); setHi(shown.length - 1); }
    else if (e.key === 'Enter' || (e.key === ' ' && e.target === btn.current)) { e.preventDefault(); choose(shown[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
    else if (!searchable && e.key.length === 1 && /\S/.test(e.key)) {
      const i = shown.findIndex((o) => !o.ph && !o.disabled && norm(o.label).startsWith(norm(e.key)));
      if (i >= 0) setHi(i);
    }
  };
  return (
    <div className={`sel ${className}`} ref={box} style={style}>
      <button type="button" ref={btn} id={id} className="inp sel-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} onKeyDown={onKey} {...rest}>
        <span className={`sel-val${!cur || cur.ph ? ' muted' : ''}`}>{cur ? cur.label : (placeholder ?? 'Chọn…')}</span><Icon name="down" size={15} />
      </button>
      <Popover anchor={box} open={open} onClose={() => setOpen(false)} width={200} className="pop-sel">
        {searchable && (
          <div className="sel-search"><Icon name="search" size={15} />
            <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey} placeholder="Tìm…" aria-label="Tìm trong danh sách" />
          </div>
        )}
        <div className="sel-list" role="listbox" ref={list}>
          {shown.length === 0 && <div className="picker-empty">Không tìm thấy</div>}
          {shown.map((o, i) => {
            const on = String(o.value) === String(value ?? '');
            return (
              <button type="button" key={String(o.value)} data-i={i} role="option" aria-selected={on} disabled={o.disabled}
                className={`sel-opt${i === hi ? ' hi' : ''}${on ? ' on' : ''}${o.ph ? ' ph' : ''}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
                <span>{o.label}</span>{on && <Icon name="check" size={15} />}
              </button>
            );
          })}
        </div>
      </Popover>
    </div>
  );
}
