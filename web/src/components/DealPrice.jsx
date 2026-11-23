// Nút "Giá riêng" trên dòng hàng (đơn bán, báo giá): mở danh sách giá của hàng này ở mọi mức giá / bảng giá để chọn,
// hoặc tự nhập giá; dòng đang có giá riêng thì thêm lựa chọn bỏ giá riêng, quay về bảng giá đang chọn của đơn.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { money } from '../lib/format.js';
import { Icon } from './ui.jsx';

export function DealPriceButton({ deal, price, choices, onPick, onCustom, onReset }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null); const menu = useRef(null);
  useEffect(() => {
    if (!pos) return undefined;
    const close = () => setPos(null);
    const down = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('mousedown', down); window.addEventListener('keydown', esc, true);
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', esc, true); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [pos]);
  // Menu nổi gắn vào body theo vị trí nút (dòng hàng có nền mờ và danh sách có thanh cuộn riêng nên không đặt menu bên trong); thiếu chỗ bên dưới thì mở lên trên
  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btn.current.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    setPos(window.innerHeight - r.bottom < 320 && r.top > window.innerHeight - r.bottom ? { right, bottom: window.innerHeight - r.top + 4 } : { right, top: r.bottom + 4 });
  };
  const pick = (fn) => () => { setPos(null); fn(); };
  return (
    <>
      <button ref={btn} type="button" className={`pos-deal-btn${deal ? ' on' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={!!pos}
        title="Chọn giá của hàng này theo bảng giá khác, hoặc tự nhập giá riêng (khách deal giá) — đổi bảng giá của đơn không ghi đè">
        <Icon name="tag" size={13} />Giá riêng<Icon name="down" size={12} /></button>
      {pos && createPortal(
        <div ref={menu} className="dd-menu deal-menu" role="menu" style={{ position: 'fixed', ...pos }}>
          {choices.length > 0 && <div className="deal-menu-head small muted">Lấy giá theo bảng giá</div>}
          {choices.map((c) => (
            <button key={c.value} type="button" role="menuitem" className={`dd-item deal-opt${deal && Number(price) === c.price ? ' on' : ''}`} onClick={pick(() => onPick(c.price))}>
              <span className="deal-opt-name">{c.label}</span><b className="deal-opt-price">{money(c.price)}</b>
            </button>
          ))}
          <div className="pos-menu-sep" />
          <button type="button" role="menuitem" className="dd-item" onClick={pick(onCustom)}><Icon name="edit" size={16} />Tự nhập giá riêng</button>
          {deal && <button type="button" role="menuitem" className="dd-item" onClick={pick(onReset)}><Icon name="refresh" size={16} />Bỏ giá riêng, theo bảng giá của đơn</button>}
        </div>, document.body,
      )}
    </>
  );
}
