// Phần mở rộng TipTap cho trình sửa mẫu in:
// - TokenNode: biến {Ten_Bien} hiện dạng thẻ có nút ×, khi lưu đổi lại thành chữ {Ten_Bien}
// - StyleAttr: giữ thuộc tính style (cỡ chữ, khoảng cách, nền ô…) của đoạn văn, bảng, ô — để mẫu sửa đi sửa lại không mất định dạng
// - TableX: bảng có / không viền (data-border); HrX: kẻ ngang thường / dải đầu trang; PageBreak: ngắt trang
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { ALL_TOKENS } from './tokens.js';

// ---------- Kiểu (style) ----------
export function parseStyle(s) {
  const out = {}; for (const part of String(s || '').split(';')) { const i = part.indexOf(':'); if (i > 0) { const k = part.slice(0, i).trim().toLowerCase(); const v = part.slice(i + 1).trim(); if (k && v) out[k] = v; } }
  return out;
}
export const styleText = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`).join('; ') || null;
export function setStyleProp(style, prop, value) { const o = parseStyle(style); if (value === null || value === undefined || value === '') delete o[prop]; else o[prop] = value; return styleText(o); }
// Thuộc tính đã có phần mở rộng riêng lo (căn lề, độ rộng bảng) thì không giữ trùng ở đây
const OWNED = { '*': ['text-align'], TABLE: ['width', 'min-width'], TD: ['width', 'min-width'], TH: ['width', 'min-width'] };
function cleanStyle(el) {
  const o = parseStyle(el.getAttribute('style'));
  for (const k of [...OWNED['*'], ...(OWNED[el.tagName] || [])]) delete o[k];
  return styleText(o);
}
export const StyleAttr = Extension.create({
  name: 'styleAttr',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'table', 'tableRow', 'tableCell', 'tableHeader', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'image'],
      attributes: { style: { default: null, parseHTML: (el) => cleanStyle(el), renderHTML: (a) => (a.style ? { style: a.style } : {}) } },
    }];
  },
  addCommands() {
    return {
      // Đặt một thuộc tính style cho các đoạn văn đang chọn (giãn dòng, khoảng cách trên/dưới, thụt lề)
      setBlockStyle: (prop, value) => ({ tr, state, dispatch }) => {
        const { from, to } = state.selection; let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === 'paragraph' || node.type.name === 'heading') { tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: setStyleProp(node.attrs.style, prop, value) }); changed = true; }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      },
      // Đặt style cho ô bảng đang chọn (màu nền, căn dọc)
      setCellStyle: (prop, value) => ({ tr, state, dispatch }) => {
        const { from, to } = state.selection; let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') { tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: setStyleProp(node.attrs.style, prop, value) }); changed = true; return false; }
          return true;
        });
        if (!changed) { // con trỏ đứng trong một ô
          const $p = state.selection.$from;
          for (let d = $p.depth; d > 0; d--) { const n = $p.node(d); if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') { tr.setNodeMarkup($p.before(d), undefined, { ...n.attrs, style: setStyleProp(n.attrs.style, prop, value) }); changed = true; break; } }
        }
        if (changed && dispatch) dispatch(tr);
        return changed;
      },
    };
  },
});

// ---------- Bảng có / không viền ----------
export const TableX = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      border: {
        default: '1',
        parseHTML: (el) => { const d = el.getAttribute('data-border'); if (d !== null) return d === '0' ? '0' : '1'; const b = el.getAttribute('border'); return b === null || b === '0' ? (b === '0' ? '0' : '1') : '1'; },
        renderHTML: (a) => ({ 'data-border': a.border === '0' ? '0' : '1' }),
      },
    };
  },
});

// ---------- Kẻ ngang: thường / dải màu đầu trang ----------
export const HrX = HorizontalRule.extend({
  addAttributes() { return { kind: { default: null, parseHTML: (el) => el.getAttribute('data-kind'), renderHTML: (a) => (a.kind ? { 'data-kind': a.kind } : {}) } }; },
});

// ---------- Ngắt trang ----------
export const PageBreak = Node.create({
  name: 'pageBreak', group: 'block', atom: true, selectable: true,
  parseHTML() { return [{ tag: 'div[data-page-break]' }]; },
  renderHTML() { return ['div', { 'data-page-break': 'true', class: 'page-break' }]; },
  addCommands() { return { insertPageBreak: () => ({ commands }) => commands.insertContent({ type: this.name }) }; },
});

// ---------- Biến ----------
export const TokenNode = Node.create({
  name: 'token', group: 'inline', inline: true, atom: true, selectable: true,
  addAttributes() { return { name: { default: '', parseHTML: (el) => el.getAttribute('data-token'), renderHTML: (a) => ({ 'data-token': a.name }) } }; },
  parseHTML() { return [{ tag: 'span[data-token]' }]; },
  renderHTML({ node, HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'tk' }), ALL_TOKENS[node.attrs.name]?.label || node.attrs.name]; },
  renderText({ node }) { return `{${node.attrs.name}}`; },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const t = ALL_TOKENS[node.attrs.name];
      const dom = document.createElement('span');
      dom.className = `tk${t?.item ? ' tk-item' : ''}${t ? '' : ' tk-bad'}`; dom.contentEditable = 'false';
      dom.title = t ? `{${node.attrs.name}} — ${t.desc}` : `{${node.attrs.name}} — biến không có trong danh mục`;
      const label = document.createElement('span'); label.textContent = t?.label || node.attrs.name; dom.appendChild(label);
      const x = document.createElement('button'); x.type = 'button'; x.className = 'tk-x'; x.textContent = '×'; x.title = 'Bỏ biến này'; x.tabIndex = -1;
      x.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); const pos = getPos(); if (typeof pos === 'number') editor.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run(); });
      dom.appendChild(x);
      return { dom, ignoreMutation: () => true };
    };
  },
});

// ---------- Đổi qua lại giữa HTML lưu trữ ({Bien}) và HTML của trình soạn (thẻ biến) ----------
const TOKEN_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
// Mẫu lưu → trình soạn: chữ {Bien} thành <span data-token>, độ rộng cột trong <colgroup> chép vào từng ô
export function toEditorHtml(html) {
  const d = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
  const walker = d.createTreeWalker(d.body, 4); const texts = []; while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) {
    const s = t.nodeValue; if (!s.includes('{')) continue;
    const frag = d.createDocumentFragment(); let i = 0; let m; TOKEN_RE.lastIndex = 0; let hit = false;
    while ((m = TOKEN_RE.exec(s))) {
      if (!ALL_TOKENS[m[1]]) continue;
      hit = true; if (m.index > i) frag.appendChild(d.createTextNode(s.slice(i, m.index)));
      const sp = d.createElement('span'); sp.setAttribute('data-token', m[1]); sp.textContent = m[1]; frag.appendChild(sp);
      i = m.index + m[0].length;
    }
    if (!hit) continue;
    if (i < s.length) frag.appendChild(d.createTextNode(s.slice(i)));
    t.replaceWith(frag);
  }
  for (const tbl of d.body.querySelectorAll('table')) {
    const cols = [...tbl.querySelectorAll(':scope > colgroup > col')].map((c) => { const w = parseStyle(c.getAttribute('style')).width || c.getAttribute('width'); const n = parseFloat(w); return n && !/%/.test(w) ? Math.round(/pt$/.test(w) ? n * 4 / 3 : n) : 0; });
    if (!cols.some(Boolean)) continue;
    for (const tr of tbl.querySelectorAll(':scope > tbody > tr, :scope > tr')) {
      let ci = 0;
      for (const td of tr.children) {
        const span = Number(td.getAttribute('colspan')) || 1;
        if (!td.hasAttribute('colwidth')) { const ws = cols.slice(ci, ci + span); if (ws.every(Boolean)) td.setAttribute('colwidth', ws.join(',')); }
        ci += span;
      }
    }
  }
  return d.body.innerHTML;
}
// Trình soạn → mẫu lưu: thẻ biến thành chữ {Bien}
export function fromEditorHtml(html) {
  return String(html || '').replace(/<span[^>]*data-token="([A-Za-z0-9_]+)"[^>]*>[\s\S]*?<\/span>/g, '{$1}');
}

// Làm đẹp mã HTML cho chế độ mã nguồn: mỗi thẻ khối một dòng, thụt lề theo cấp
export function beautify(html) {
  const BLOCK = /^(table|colgroup|col|tbody|thead|tr|td|th|p|div|ul|ol|li|h[1-6]|hr|blockquote)$/i;
  const parts = String(html || '').replace(/>\s+</g, '><').split(/(<[^>]+>)/).filter((x) => x !== '');
  let depth = 0; let out = ''; let inline = false;
  for (const p of parts) {
    const m = p.match(/^<(\/?)([a-z0-9]+)/i);
    if (m && BLOCK.test(m[2])) {
      const closing = m[1] === '/'; const selfClose = /^(col|hr)$/i.test(m[2]) || /\/>$/.test(p);
      if (closing) depth = Math.max(0, depth - 1);
      if (closing && inline) { out += p; inline = false; continue; }
      out += `${out ? '\n' : ''}${'  '.repeat(depth)}${p}`;
      if (!closing && !selfClose) { depth++; inline = /^(p|li|h[1-6]|td|th)$/i.test(m[2]); }
    } else { out += p; inline = true; }
  }
  return out.trim();
}
