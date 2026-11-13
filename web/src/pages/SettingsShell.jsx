// Khung trang Thiết lập kiểu KiotViet: cột trái danh mục theo nhóm, giữa là các thẻ thiết lập, phải là mục lục "Trên trang này".
// Tên và mô tả từng dòng lấy từ lib/settings-nav.js để cột trái, mục lục và ô tìm kiếm luôn khớp với nội dung.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ALL_SECTIONS, findRow, searchSettings } from '../lib/settings-nav.js';
import { useApp } from '../lib/store.jsx';
import { Btn, Icon, Input, Modal } from '../components/ui.jsx';

const SecCtx = createContext({ sec: null, flash: '' });

export function SettingsLayout({ groups, sec, onPick, flash, children }) {
  const visible = groups.flatMap((g) => g.items);
  return (
    <div className="set-page">
      <div className="set-top">
        <h1 className="page-title">Thiết lập</h1>
        <SettingsSearch sections={visible} onPick={onPick} />
      </div>
      <div className="set-grid">
        <nav className="set-nav" aria-label="Danh mục thiết lập">
          {groups.map((g) => (
            <div key={g.title} className="set-nav-group">
              <div className="set-nav-title">{g.title}</div>
              {g.items.map((s) => (
                <button key={s.id} type="button" className={`set-nav-item${s.id === sec.id ? ' on' : ''}`} aria-current={s.id === sec.id ? 'page' : undefined} onClick={() => onPick(s.id)}>
                  <Icon name={s.icon} size={18} /><span>{s.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="set-main">
          <SecCtx.Provider value={{ sec: sec.id, flash }}>{children}</SecCtx.Provider>
        </div>
        <Toc sec={sec} />
      </div>
    </div>
  );
}

// Mục lục bên phải: bấm để cuộn tới thẻ; thẻ đang xem được tô theo vị trí cuộn
function Toc({ sec }) {
  const [on, setOn] = useState(sec.cards[0]?.id);
  useEffect(() => {
    setOn(sec.cards[0]?.id);
    const h = () => {
      let cur = sec.cards[0]?.id;
      for (const c of sec.cards) { const el = document.getElementById(`card-${c.id}`); if (el && el.getBoundingClientRect().top < 160) cur = c.id; }
      setOn(cur);
    };
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, [sec.id]);
  if (sec.cards.length < 2) return <aside className="set-toc" />;
  return (
    <aside className="set-toc" aria-label="Trên trang này">
      <div className="set-toc-in">
        <div className="set-toc-title">Trên trang này</div>
        {sec.cards.map((c) => (
          <button key={c.id} type="button" className={`set-toc-item${on === c.id ? ' on' : ''}`} onClick={() => { scrollToId(`card-${c.id}`); setOn(c.id); }}>{c.title}</button>
        ))}
      </div>
    </aside>
  );
}

export function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  const top = el.getBoundingClientRect().top + window.scrollY - 120;
  window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return true;
}

// Ô tìm kiếm: tìm trong tên, mô tả của mọi thiết lập người dùng được xem (không phân biệt dấu); Enter mở kết quả đầu tiên
function SettingsSearch({ sections, onPick }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const res = searchSettings(q, sections);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const pick = (r) => { if (!r) return; onPick(r.sec.id, r.row.id, r.card.id); setOpen(false); setQ(''); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, res.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(res[hi]); }
    else if (e.key === 'Escape') { setQ(''); setOpen(false); }
  };
  return (
    <div className="set-search" ref={ref}>
      <Icon name="search" size={17} className="set-search-icon" />
      <Input value={q} onChange={(v) => { setQ(v); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={key} placeholder="Tìm kiếm thiết lập" aria-label="Tìm kiếm thiết lập" />
      {open && q.trim() && (
        <div className="set-search-menu" role="listbox">
          {res.length === 0 && <div className="set-search-empty">Không có thiết lập nào khớp “{q}”</div>}
          {res.map((r, i) => (
            <button key={`${r.sec.id}/${r.row.id}`} type="button" role="option" aria-selected={i === hi} className={`set-search-item${i === hi ? ' on' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(r)}>
              <Icon name={r.sec.icon} size={16} />
              <span className="grow"><span className="set-search-t">{r.row.title}</span><span className="set-search-p">{r.sec.label} › {r.card.title}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Một thẻ: tiêu đề lấy từ danh mục
export function Card({ id, children }) {
  const { sec } = useContext(SecCtx);
  const card = ALL_SECTIONS.find((s) => s.id === sec)?.cards.find((c) => c.id === id);
  return (
    <section className="set-card" id={`card-${id}`} aria-labelledby={`card-${id}-t`}>
      <h2 className="set-card-title" id={`card-${id}-t`}>{card?.title || id}</h2>
      <div className="set-card-body">
        {children}
      </div>
    </section>
  );
}

// Một dòng thiết lập: tên + mô tả bên trái; bên phải là công tắc (toggle), giá trị kèm › (onClick mở hộp thoại) hoặc nút tùy ý (control).
// children: phần mở rộng hiện dưới dòng (vd. ô tick con khi công tắc bật).
export function Row({ id, value, onClick, toggle, control, children }) {
  const { sec, flash } = useContext(SecCtx);
  const r = findRow(sec, id) || { title: id, desc: '' };
  const text = <div className="set-row-text"><div className="set-row-title">{r.title}</div>{r.desc && <div className="set-row-desc">{r.desc}</div>}</div>;
  const right = (
    <>
      {control}
      {value !== undefined && value !== null && <span className="set-row-val">{value}</span>}
      {toggle && <Switch checked={toggle.checked} onChange={toggle.onChange} busy={toggle.busy} label={r.title} />}
      {onClick && <Icon name="chev" size={18} className="set-row-chev" />}
    </>
  );
  return (
    <div id={`set-${id}`} className={`set-row${flash === id ? ' flash' : ''}`}>
      {onClick
        ? <button type="button" className="set-row-head click" onClick={onClick}>{text}<div className="set-row-ctl">{right}</div></button>
        : <div className="set-row-head">{text}<div className="set-row-ctl">{right}</div></div>}
      {children && <div className="set-row-body">{children}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, busy, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={busy} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="switch-knob" />
    </button>
  );
}

// Hộp thoại sửa một thiết lập: Hủy / Lưu như KiotViet
export function EditModal({ title, subtitle, onClose, onSave, busy, size = 'sm', children }) {
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} size={size}
      footer={<><Btn onClick={onClose}>Hủy</Btn>{onSave && <Btn kind="primary" busy={busy} onClick={onSave}>Lưu</Btn>}</>}>
      {children}
    </Modal>
  );
}

// Sửa một danh sách chọn (đơn vị tính, nhóm hàng, kênh bán…): thêm bằng Enter, đổi thứ tự, bỏ từng mục
export function ListEditor({ values, onChange, placeholder = 'Thêm…', ordered }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !values.includes(t)) onChange([...values, t]); setV(''); };
  const move = (i, d) => { const a = [...values]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <div className="stack-s">
      <div className="row gap-s">
        <div className="grow"><Input value={v} onChange={setV} placeholder={placeholder} aria-label={placeholder} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} /></div>
        <Btn icon="plus" onClick={add}>Thêm</Btn>
      </div>
      {values.length === 0 ? <div className="muted small">Chưa có mục nào.</div> : (
        <ul className="list-edit">
          {values.map((x, i) => (
            <li key={x}>
              {ordered && <span className="list-edit-n">{i + 1}</span>}
              <span className="grow">{x}</span>
              {ordered && <><button type="button" className="icon-btn" aria-label={`Đưa ${x} lên`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={15} /></button>
                <button type="button" className="icon-btn" aria-label={`Đưa ${x} xuống`} disabled={i === values.length - 1} onClick={() => move(i, 1)}><Icon name="dl" size={15} /></button></>}
              <button type="button" className="icon-btn" aria-label={`Bỏ ${x}`} onClick={() => onChange(values.filter((y) => y !== x))}><Icon name="x" size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Lưu một phần cài đặt của sổ (gộp với cài đặt hiện có ở máy chủ)
export function useSaveSettings() {
  const { rpc, loadBooks, toast, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const save = async (settings, name) => {
    setBusy(true);
    try { await rpc('update_book_settings', { settings, name }); await loadBooks(); refresh(); toast('Đã lưu cài đặt'); return true; }
    catch (e) { toast(e.message, 'err'); return false; } finally { setBusy(false); }
  };
  return { save, busy };
}

// Công tắc lưu ngay khi bật/tắt (invert: mặc định là bật khi chưa có khóa)
export function useToggle(key, { invert } = {}) {
  const { settings } = useApp();
  const { save, busy } = useSaveSettings();
  const raw = settings[key];
  const checked = invert ? raw !== false : !!raw;
  return { checked, busy, onChange: (v) => save({ [key]: v }) };
}
