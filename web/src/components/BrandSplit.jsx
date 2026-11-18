// Chia 1 khoản chi phí cho nhiều thương hiệu (mỗi thương hiệu là 1 sổ): kéo thẻ thương hiệu vào thanh, kéo vạch ngăn để đổi %,
// kéo đoạn ra khỏi thanh (hoặc bấm ×) để bỏ. Giá trị: [{book_id, pct}] cộng đủ 100; rỗng = sổ đang mở chịu hết.
import React, { useRef, useState } from 'react';
import { GripVertical, X } from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { money } from '../lib/format.js';

export const BRAND_COLORS = { TH: '#115462', VG: '#6b2f17', AN: '#0d6b4b' };
const FALLBACK = ['#5a6778', '#6b4fa0', '#9a5b00', '#2f7f9a'];
const LOGOS = { TH: 'th', VG: 'vg', AN: 'an' };
export const brandColor = (b, i = 0) => BRAND_COLORS[b?.short_name] || FALLBACK[i % FALLBACK.length];

// Làm tròn tỷ lệ về số nguyên, phần lẻ dồn vào phần cuối để luôn đủ 100
function fix(list) {
  let left = 100;
  return list.map((x, i) => {
    const pct = i === list.length - 1 ? Math.round(left * 100) / 100 : Math.round(x.pct);
    left -= pct;
    return { ...x, pct };
  });
}
const even = (ids) => fix(ids.map((id) => ({ book_id: id, pct: 100 / ids.length })));

// Thương hiệu người dùng được ghi chi phí (cùng loại sổ thật / sổ mẫu với sổ đang mở)
export function useSplitBooks() {
  const { books, book } = useApp();
  return (books || []).filter((b) => b.is_demo === book?.is_demo && (b.role === 'owner' || b.perms?.chi_phi));
}

export function BrandLogo({ b, size = 22 }) {
  const l = LOGOS[b?.short_name];
  return l ? <img className="bs-logo" src={`/logos/${l}.png`} alt="" style={{ width: size, height: size }} />
    : <span className="bs-logo bs-logo-txt" style={{ width: size, height: size }}>{b?.short_name}</span>;
}

// Thanh nhỏ chỉ để xem (danh sách)
export function SplitMini({ split }) {
  const all = useApp().books || [];
  if (!split?.length) return null;
  return (
    <span className="bs-mini" title={split.map((x) => `${all.find((b) => b.id === x.book_id)?.short_name ?? '?'} ${x.pct}%`).join(' · ')}>
      {split.map((x, i) => <i key={x.book_id} style={{ width: `${x.pct}%`, background: brandColor(all.find((b) => b.id === x.book_id), i) }} />)}
    </span>
  );
}

export function BrandSplit({ value, onChange, amount }) {
  const { book } = useApp();
  const brands = useSplitBooks();
  const barRef = useRef(null);
  const [over, setOver] = useState(false);
  const on = (value || []).length > 0;
  const list = on ? value : [{ book_id: book.id, pct: 100 }];
  const bOf = (id) => brands.find((b) => b.id === id);
  const free = brands.filter((b) => !list.some((x) => x.book_id === b.id));
  const set = (l) => onChange(l.length === 1 && l[0].book_id === book.id ? [] : l);
  const amt = (pct, i) => {
    if (!amount) return null;
    const head = list.slice(0, -1).reduce((s, x) => s + Math.round((amount * x.pct) / 100), 0);
    return i === list.length - 1 ? amount - head : Math.round((amount * pct) / 100);
  };

  // Thêm thương hiệu: các phần cũ co lại theo tỷ lệ, phần mới nhận 1/(n+1)
  const add = (id, at = list.length) => {
    if (!id || list.some((x) => x.book_id === id)) return;
    const n = list.length + 1; const k = (n - 1) / n;
    const next = list.map((x) => ({ ...x, pct: x.pct * k }));
    next.splice(at, 0, { book_id: id, pct: 100 / n });
    set(fix(next));
  };
  // Bỏ thương hiệu: phần của nó nhập vào phần bên cạnh
  const remove = (i) => {
    if (list.length <= 1) return;
    const next = list.filter((_, j) => j !== i);
    next[Math.max(0, i - 1)] = { ...next[Math.max(0, i - 1)], pct: next[Math.max(0, i - 1)].pct + list[i].pct };
    set(fix(next));
  };
  const setPct = (i, v) => {
    // Nhập tay: phần kế bên (hoặc phần trước nếu là phần cuối) bù cho đủ 100
    const j = i < list.length - 1 ? i + 1 : i - 1;
    if (j < 0) return;
    const p = Math.max(0, Math.min(list[i].pct + list[j].pct, Number(v) || 0));
    const next = list.map((x, k) => (k === i ? { ...x, pct: p } : k === j ? { ...x, pct: Math.round((list[i].pct + list[j].pct - p) * 100) / 100 } : x));
    set(next.filter((x) => x.pct > 0));
  };

  // Kéo vạch ngăn giữa phần i và i+1 (chuột hoặc ngón tay), bước 1%
  const startHandle = (i) => (ev) => {
    ev.preventDefault();
    const el = ev.currentTarget; el.setPointerCapture?.(ev.pointerId);
    const rect = barRef.current.getBoundingClientRect();
    const before = list.slice(0, i).reduce((s, x) => s + x.pct, 0);
    const pair = list[i].pct + list[i + 1].pct;
    const move = (e) => {
      const at = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const p = Math.max(1, Math.min(pair - 1, at - before));
      onChange(list.map((x, k) => (k === i ? { ...x, pct: p } : k === i + 1 ? { ...x, pct: Math.round((pair - p) * 100) / 100 } : x)));
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };

  // Vị trí chèn khi thả thẻ thương hiệu vào thanh
  const dropAt = (clientX) => {
    const r = barRef.current.getBoundingClientRect(); const x = ((clientX - r.left) / r.width) * 100;
    let acc = 0;
    for (let i = 0; i < list.length; i++) { if (x < acc + list[i].pct / 2) return i; acc += list[i].pct; }
    return list.length;
  };

  if (brands.length < 2) return null;
  return (
    <div className="bs">
      <div className="bs-head">
        <span className="field-label">Phân bổ cho thương hiệu</span>
        <span className="muted small">{on ? 'Kéo vạch ngăn để đổi tỷ lệ · kéo đoạn ra ngoài để bỏ' : `Đang tính 100% cho ${book.name}`}</span>
        <span className="grow" />
        {on && <button type="button" className="link-btn small" onClick={() => set(even(list.map((x) => x.book_id)))}>Chia đều</button>}
        {on && <button type="button" className="link-btn small" onClick={() => onChange([])}>Bỏ phân bổ</button>}
        {!on && <button type="button" className="link-btn small" onClick={() => set(even(brands.map((b) => b.id)))}>Chia đều {brands.length} thương hiệu</button>}
      </div>
      <div className="bs-palette" onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { const i = list.findIndex((x) => x.book_id === e.dataTransfer.getData('text/bs-seg')); if (i >= 0) remove(i); }}>
        {free.length ? free.map((b) => (
          <button key={b.id} type="button" className="bs-chip" draggable onDragStart={(e) => { e.dataTransfer.setData('text/bs-brand', b.id); e.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => add(b.id)} title="Kéo vào thanh bên dưới, hoặc bấm để thêm" style={{ '--bc': brandColor(b) }}>
            <GripVertical size={14} /><BrandLogo b={b} size={18} />{b.name}<b>+</b>
          </button>)) : <span className="muted small">Đã chia cho tất cả thương hiệu — kéo một đoạn lên đây để bỏ</span>}
      </div>
      <div ref={barRef} className={`bs-bar${over ? ' over' : ''}`}
        onDragOver={(e) => { if ([...e.dataTransfer.types].includes('text/bs-brand')) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { setOver(false); const id = e.dataTransfer.getData('text/bs-brand'); if (id) add(id, dropAt(e.clientX)); }}>
        {list.map((x, i) => {
          const b = bOf(x.book_id);
          return (
            <React.Fragment key={x.book_id}>
              <div className="bs-seg" style={{ width: `${x.pct}%`, background: brandColor(b, i) }} draggable={list.length > 1}
                onDragStart={(e) => { e.dataTransfer.setData('text/bs-seg', x.book_id); e.dataTransfer.effectAllowed = 'move'; }}>
                <BrandLogo b={b} size={20} />
                <span className="bs-seg-txt"><b>{x.pct}%</b><small>{b?.short_name}</small></span>
                {list.length > 1 && <button type="button" className="bs-x" onClick={() => remove(i)} aria-label={`Bỏ ${b?.name}`}><X size={12} /></button>}
              </div>
              {i < list.length - 1 && <div className="bs-handle" role="slider" aria-label={`Ranh giới ${b?.short_name} / ${bOf(list[i + 1].book_id)?.short_name}`}
                aria-valuenow={x.pct} tabIndex={0} onPointerDown={startHandle(i)}
                onKeyDown={(e) => { if (e.key === 'ArrowLeft' && x.pct > 1) setPct(i, x.pct - 1); if (e.key === 'ArrowRight' && list[i + 1].pct > 1) setPct(i, x.pct + 1); }}><i /></div>}
            </React.Fragment>
          );
        })}
        {over && <div className="bs-drop">Thả để thêm thương hiệu</div>}
      </div>
      {on && <div className="bs-rows">
        {list.map((x, i) => {
          const b = bOf(x.book_id);
          return (
            <div key={x.book_id} className="bs-row">
              <i className="bs-dot" style={{ background: brandColor(b, i) }} /><span className="bs-name">{b?.name ?? 'Thương hiệu'}{x.book_id === book.id && <small className="muted"> (trả tiền)</small>}</span>
              <input className="inp bs-pct" type="number" min="0" max="100" step="1" value={x.pct} onChange={(e) => setPct(i, e.target.value)} aria-label={`Tỷ lệ ${b?.name}`} /><span className="muted">%</span>
              <span className="bs-amt">{amount ? money(amt(x.pct, i)) + ' đ' : ''}</span>
            </div>
          );
        })}
        {!list.some((x) => x.book_id === book.id) && <div className="muted small">{book.name} trả tiền nhưng không tính chi phí này vào lãi lỗ.</div>}
      </div>}
    </div>
  );
}
