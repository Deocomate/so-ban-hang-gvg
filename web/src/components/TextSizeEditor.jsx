// Chỉnh cỡ chữ từng phần của một chứng từ trước khi In / Tải PDF / Tải ảnh: bôi đen chữ rồi bấm A− / A+ hoặc chọn cỡ.
// Chỉ đổi lần xuất này (không đổi mẫu in). Mỗi đoạn đã chỉnh được bọc <span data-fs style="font-size:…pt">, bộ dựng PDF đọc được.
import React, { useEffect, useRef, useState } from 'react';
import { TPL_CSS, FONT_CSS, contentWidthPx, withBaseSize } from '../lib/docs/templates.js';
import { Btn } from './ui.jsx';

export const TEXT_SIZES = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36];

// Nội dung để chỉnh: mọi cỡ chữ đã nâng theo cỡ chữ cơ bản và ghi rõ, để chữ thu nhỏ khi xuất không bị nâng lại (chứng từ chỉnh xong có base = 0)
export const editableHtml = (doc) => (doc.base ? `<div style="font-size:${doc.base}pt">${withBaseSize(doc.html, doc.base)}</div>` : String(doc.html || ''));
// Chứng từ dùng phần đã chỉnh
export const withCustomText = (doc, html) => ({ ...doc, html, base: 0 });

const ptOf = (el) => Math.round((parseFloat(getComputedStyle(el).fontSize) || 13.333) * 0.75 * 2) / 2;
// Đoạn chữ đầu tiên của vùng chọn (đầu vùng chọn có thể là thẻ bao ngoài)
function firstText(range, root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() && range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  return walker.nextNode();
}

// Các đoạn chữ nằm trong vùng chọn; cắt phần đầu / cuối nằm ngoài vùng chọn
function selectedTexts(range, root) {
  const list = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() && range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  while (walker.nextNode()) list.push(walker.currentNode);
  const out = [];
  for (let n of list) {
    const len = n.nodeValue.length;
    const s = n === range.startContainer ? range.startOffset : 0;
    const e = n === range.endContainer ? range.endOffset : len;
    if (e <= s) continue;
    if (e < len) n.splitText(e);
    if (s > 0) n = n.splitText(s);
    if (n.nodeValue.trim()) out.push(n);
  }
  return out;
}

// value: nội dung đã chỉnh (null = chưa chỉnh); onChange(html | null)
export function TextSizeEditor({ doc, value, onChange, onDone }) {
  const box = useRef(null); const saved = useRef(null);
  const [cur, setCur] = useState(null);
  useEffect(() => { box.current.innerHTML = value ?? editableHtml(doc); }, []);
  // Nhớ vùng chọn trong trang (bấm danh sách cỡ chữ làm mất vùng chọn) và cỡ chữ đang chọn
  useEffect(() => {
    const on = () => {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed || !box.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
      saved.current = sel.getRangeAt(0).cloneRange();
      const first = firstText(saved.current, box.current);
      if (first) setCur(ptOf(first.parentElement));
    };
    document.addEventListener('selectionchange', on);
    return () => document.removeEventListener('selectionchange', on);
  }, []);
  const apply = (fn) => {
    const range = saved.current; if (!range || !box.current) return;
    const nodes = selectedTexts(range, box.current); if (!nodes.length) return;
    const spans = nodes.map((n) => {
      const p = n.parentElement; const size = Math.min(72, Math.max(5, Math.round(fn(ptOf(p)) * 2) / 2));
      if (p.dataset.fs !== undefined && p.childNodes.length === 1) { p.style.fontSize = `${size}pt`; return p; }
      const sp = document.createElement('span'); sp.dataset.fs = ''; sp.style.fontSize = `${size}pt`;
      n.replaceWith(sp); sp.appendChild(n); return sp;
    });
    // Giữ vùng chọn để bấm tiếp A+ / A−
    const r = document.createRange(); r.setStartBefore(spans[0]); r.setEndAfter(spans[spans.length - 1]);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); saved.current = r.cloneRange();
    setCur(ptOf(spans[0]));
    onChange(box.current.innerHTML);
  };
  const reset = () => { box.current.innerHTML = editableHtml(doc); saved.current = null; setCur(null); onChange(null); };
  const keep = (e) => e.preventDefault(); // bấm nút không làm mất vùng chọn
  return (
    <div className="doc-preview">
      <style>{TPL_CSS}</style>
      <div className="doc-preview-bar text-size-bar">
        <Btn small onMouseDown={keep} onClick={() => apply((v) => v - 1)} title="Thu nhỏ chữ đang bôi đen 1 cỡ" aria-label="Thu nhỏ chữ">A−</Btn>
        <Btn small onMouseDown={keep} onClick={() => apply((v) => v + 1)} title="Phóng to chữ đang bôi đen 1 cỡ" aria-label="Phóng to chữ">A+</Btn>
        <select className="input" value={cur ?? ''} aria-label="Cỡ chữ của phần đang bôi đen" onChange={(e) => { const v = Number(e.target.value); if (v) apply(() => v); }}>
          <option value="">Cỡ chữ…</option>
          {[...new Set([...TEXT_SIZES, ...(cur ? [cur] : [])])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} pt</option>)}
        </select>
        <span className="muted small grow">Bôi đen phần chữ cần đổi, rồi bấm A− / A+ hoặc chọn cỡ.</span>
        {value && <button type="button" className="link-btn small" onClick={reset}>Bỏ hết phần đã chỉnh</button>}
        <Btn small kind="primary" onClick={onDone}>Xong, xem bản in</Btn>
      </div>
      <div className="doc-scroll text-size-scroll">
        <div ref={box} className="tpl text-size-page" style={{ width: contentWidthPx(doc), fontFamily: FONT_CSS[doc.font] || FONT_CSS.Tinos }} />
      </div>
    </div>
  );
}
