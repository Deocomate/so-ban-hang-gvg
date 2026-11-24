// Chữ ký trên chứng từ: mẫu chữ ký lưu theo sổ (settings.doc_signatures), kéo vào trang xem trước để đặt, kéo để dời, kéo góc để đổi cỡ.
// Vị trí đặt lưu theo chứng từ (thông tin chứng từ signs_<loại>) và được vẽ vào tệp PDF / bản in / ảnh.
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../lib/store.jsx';
import { Btn, Icon, Input, ConfirmBtn } from './ui.jsx';

export const SIGN_DRAG = 'application/x-gomsu-sign';
const MAX_SIDE = 640; const MAX_LEN = 380000;

// Ảnh chữ ký (chụp / quét trên giấy trắng) → PNG nền trong suốt, cắt sát nét chữ. Trả { img, ar } (ar = cao / rộng)
export async function prepareSignature(file) {
  if (!/^image\//.test(file.type)) throw new Error('Chọn tệp ảnh (PNG, JPG)');
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Không đọc được ảnh')); i.src = url; });
    const k = Math.min(1, 1400 / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
    const data = g.getImageData(0, 0, c.width, c.height); const px = data.data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let i = 0; i < px.length; i += 4) {
      // Nền sáng → trong suốt, nét đậm giữ nguyên, phần giữa mờ dần
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const a = Math.round((px[i + 3] / 255) * (lum >= 225 ? 0 : lum <= 150 ? 255 : (255 * (225 - lum)) / 75));
      px[i + 3] = a;
      if (a > 24) { const p = i / 4; const x = p % c.width; const y = (p - x) / c.width; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) throw new Error('Không thấy nét chữ ký trong ảnh — chụp chữ ký trên nền giấy trắng');
    g.putImageData(data, 0, 0);
    const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
    const w = x1 - x0 + 1; const h = y1 - y0 + 1;
    for (let side = MAX_SIDE; side >= 160; side = Math.round(side * 0.8)) {
      const s = Math.min(1, side / Math.max(w, h));
      const o = document.createElement('canvas'); o.width = Math.max(1, Math.round(w * s)); o.height = Math.max(1, Math.round(h * s));
      o.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
      const img = o.toDataURL('image/png');
      if (img.length <= MAX_LEN) return { img, ar: Math.round((o.height / o.width) * 1000) / 1000 };
    }
    throw new Error('Ảnh chữ ký quá lớn');
  } finally { URL.revokeObjectURL(url); }
}

// Thư viện mẫu chữ ký (cột trái hộp in / xuất). onAdd(id): đặt nhanh vào trang 1 (khi không kéo thả được, vd. màn hình cảm ứng)
export function SignatureLibrary({ onAdd, placedCount, onClear }) {
  const { settings, can, rpc, loadBooks, toast } = useApp();
  const list = settings?.doc_signatures || [];
  const owner = can('owner');
  const input = useRef(null);
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (next, msg) => {
    setBusy(true);
    try { await rpc('update_book_settings', { settings: { doc_signatures: next } }); await loadBooks(); toast(msg); return true; } catch (e) { toast(e.message, 'err'); return false; } finally { setBusy(false); }
  };
  const upload = async (file) => {
    try {
      const { img, ar } = await prepareSignature(file);
      const n = name.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 80);
      if (await save([...list, { id: 's' + Date.now().toString(36), name: n, img, ar }], `Đã lưu mẫu chữ ký "${n}"`)) setName('');
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="stack-s sig-lib">
      {list.length ? <div className="muted small">Kéo chữ ký thả vào trang xem trước (khổ PDF / In). Kéo chữ ký trên trang để dời, kéo góc dưới phải để đổi cỡ.</div>
        : <div className="muted small">{owner ? 'Chưa có mẫu chữ ký. Tải ảnh chữ ký (ký trên giấy trắng rồi chụp / quét) để lưu làm mẫu.' : 'Chưa có mẫu chữ ký — chủ sổ tải lên ở đây.'}</div>}
      {list.length > 0 && <div className="sig-list">{list.map((x) => (
        <div key={x.id} className="sig-item" draggable onDragStart={(e) => { e.dataTransfer.setData(SIGN_DRAG, x.id); e.dataTransfer.effectAllowed = 'copy'; }} title={`Kéo "${x.name}" vào trang`}>
          <img src={x.img} alt={`Chữ ký ${x.name}`} draggable={false} />
          <span className="sig-name ellipsis">{x.name}</span>
          <span className="row gap-xs">
            <Btn small icon="plus" className="btn-ico btn-ico-xs" title="Đặt vào trang 1" aria-label={`Đặt chữ ký ${x.name} vào trang 1`} onClick={() => onAdd(x.id)} />
            {owner && <ConfirmBtn small icon="x" className="btn-ico btn-ico-xs" title="Xóa mẫu chữ ký" confirmText="Xóa?" onConfirm={() => save(list.filter((y) => y.id !== x.id), 'Đã xóa mẫu chữ ký')} />}
          </span>
        </div>))}</div>}
      {owner && <div className="row gap-xs">
        <Input value={name} onChange={setName} placeholder="Tên mẫu (vd. Giám đốc)" maxLength={80} aria-label="Tên mẫu chữ ký" />
        <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
        <Btn small icon="up" busy={busy} onClick={() => input.current?.click()}>Tải chữ ký</Btn>
      </div>}
      {placedCount > 0 && <div className="small">Đã đặt {placedCount} chữ ký trên chứng từ này · <button type="button" className="link-btn small" onClick={onClear}>Bỏ hết</button></div>}
    </div>
  );
}

// Lớp chữ ký trên một trang xem trước. sheet: { el, page, wPt }; signs: chữ ký đã đặt (kèm img, ar, idx); onChange(idx, patch | null)
function SignLayer({ sheet, signs, onChange }) {
  const k = sheet.el.clientWidth / sheet.wPt;
  const [drag, setDrag] = useState(null); // { idx, mode, x0, y0, s } — vị trí tạm trong lúc kéo
  const start = (e, s, mode) => {
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* bỏ qua */ }
    setDrag({ idx: s.idx, mode, x0: e.clientX, y0: e.clientY, s: { x: s.x, y: s.y, w: s.w }, cur: { x: s.x, y: s.y, w: s.w } });
  };
  const move = (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x0) / k; const dy = (e.clientY - drag.y0) / k;
    const cur = drag.mode === 'move' ? { ...drag.s, x: drag.s.x + dx, y: drag.s.y + dy } : { ...drag.s, w: Math.max(20, Math.min(500, drag.s.w + dx)) };
    setDrag({ ...drag, cur });
  };
  const end = () => { if (!drag) return; const { idx, cur } = drag; setDrag(null); onChange(idx, { x: Math.round(cur.x * 10) / 10, y: Math.round(cur.y * 10) / 10, w: Math.round(cur.w * 10) / 10 }); };
  return signs.map((s) => {
    const p = drag?.idx === s.idx ? { ...s, ...drag.cur } : s;
    return (
      <div key={s.idx} className="sig-placed" style={{ left: p.x * k, top: p.y * k, width: p.w * k, height: p.w * s.ar * k }}
        onPointerDown={(e) => start(e, s, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="Kéo để dời chữ ký">
        <img src={s.img} alt="" draggable={false} />
        <button type="button" className="sig-x" aria-label="Bỏ chữ ký này" title="Bỏ chữ ký này" onPointerDown={(e) => e.stopPropagation()} onClick={() => onChange(s.idx, null)}><Icon name="x" size={12} /></button>
        <span className="sig-resize" title="Kéo để đổi cỡ" onPointerDown={(e) => start(e, s, 'size')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      </div>
    );
  });
}

// Các lớp chữ ký cho mọi trang đang hiện (gắn vào từng trang bằng portal)
export function SignLayers({ sheets, signs, onChange }) {
  return sheets.map((sh) => createPortal(<SignLayer sheet={sh} signs={signs.filter((s) => s.p === sh.page)} onChange={onChange} />, sh.el, `sig-${sh.page}`));
}
