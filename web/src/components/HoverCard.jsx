// Ô bảng sửa nhanh: rê chuột vào (hoặc bấm, trên máy cảm ứng) thì khung nhỏ nổi lên ngay dưới ô.
// Khung tự đóng khi rời chuột; khi người dùng đã bấm/gõ trong khung thì giữ mở tới khi bấm ra ngoài, nhấn Esc hoặc lưu xong.
// Mỗi lúc chỉ mở một khung; khung đang được sửa dở thì rê sang ô khác không bật khung mới.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui.jsx';

const OPEN_DELAY = 220;
const CLOSE_DELAY = 200;
let active = null; // { id, close, pinned }

export function HoverCard({ trigger, children, width = 300, label }) {
  const anchor = useRef(null);
  const box = useRef(null);
  const me = useRef({ id: Symbol('hc'), pinned: false });
  const timer = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);

  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  const close = () => { clear(); me.current.pinned = false; if (active?.id === me.current.id) active = null; setOpen(false); };
  me.current.close = close;
  const show = (pin) => {
    clear();
    if (active && active.id !== me.current.id) { if (active.pinned && !pin) return; active.close(); }
    active = me.current;
    if (pin) me.current.pinned = true;
    setOpen(true);
  };
  const enter = (e) => {
    if (e.pointerType !== 'mouse') return;
    clear();
    if (!open) timer.current = setTimeout(() => show(false), OPEN_DELAY);
  };
  const leave = (e) => {
    if (e.pointerType !== 'mouse') return;
    clear();
    if (open && !me.current.pinned) timer.current = setTimeout(close, CLOSE_DELAY);
  };
  const pin = () => { clear(); me.current.pinned = true; };

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = () => {
      const r = anchor.current?.getBoundingClientRect(); if (!r) return;
      const h = box.current?.offsetHeight || 260;
      const w = Math.min(width, window.innerWidth - 16);
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      // Ưu tiên dưới ô; không đủ chỗ thì lên trên; cả hai đều chật thì đẩy lên vừa khít mép dưới màn hình
      let top = r.bottom + 6; let origin = 'top left';
      if (top + h > vh - 8) {
        if (r.top - 6 - h >= 8) { top = r.top - 6 - h; origin = 'bottom left'; } else top = Math.max(8, vh - 8 - h);
      }
      setPos({ left, width: w, top, maxHeight: vh - 16, origin });
    };
    place();
    const raf = requestAnimationFrame(place);
    // Nội dung khung cao lên (mở ô nhập số tiền…) thì đặt lại cho khỏi tràn mép màn hình
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (box.current) ro?.observe(box.current);
    const down = (e) => { if (!box.current?.contains(e.target) && !anchor.current?.contains(e.target) && !e.target.closest?.('.pop')) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf); ro?.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key);
    };
  }, [open, width]);
  useEffect(() => () => { clear(); if (active?.id === me.current.id) active = null; }, []);

  // Khung gắn vào body nhưng sự kiện React vẫn nổi lên dòng bảng → chặn để không mở chi tiết đơn
  const stop = (e) => e.stopPropagation();
  return (
    <>
      <div ref={anchor} className={`hc-trigger${open ? ' on' : ''}`} role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded={open} aria-label={label}
        onPointerEnter={enter} onPointerLeave={leave}
        onClick={(e) => { stop(e); if (open && me.current.pinned) close(); else show(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop(e); show(true); } }}>
        {trigger}
        <Icon name="edit" size={13} className="hc-hint" />
      </div>
      {open && createPortal(
        <div ref={box} className="pop hc-card" role="dialog" aria-label={label}
          style={{ position: 'fixed', ...(pos || { opacity: 0, top: 0, left: 0, width }), transformOrigin: pos?.origin }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') clear(); }} onPointerLeave={leave}
          onMouseDown={pin} onFocus={pin} onClick={stop}>
          {children({ close })}
        </div>, document.body)}
    </>
  );
}
