// Chứng từ dựng từ mẫu HTML (templates.js) → tệp PDF bằng pdfmake, và in thẳng bằng trình duyệt.
// Bộ chuyển chỉ cần hiểu tập thẻ mà trình sửa mẫu tạo ra: đoạn văn, chữ đậm/nghiêng/gạch, cỡ chữ, màu, bảng (gộp ô, độ rộng cột, có / không viền),
// ảnh, kẻ ngang, ngắt trang, danh sách. Phông Arimo (≈ Arial) và Tinos (≈ Times New Roman) – giấy phép Apache 2.0 – được nhúng nên chữ chọn / sao chép được.
import ArimoR from '../../assets/fonts/Arimo-Regular.ttf?url';
import ArimoB from '../../assets/fonts/Arimo-Bold.ttf?url';
import ArimoI from '../../assets/fonts/Arimo-Italic.ttf?url';
import ArimoBI from '../../assets/fonts/Arimo-BoldItalic.ttf?url';
import TinosR from '../../assets/fonts/Tinos-Regular.ttf?url';
import TinosB from '../../assets/fonts/Tinos-Bold.ttf?url';
import TinosI from '../../assets/fonts/Tinos-Italic.ttf?url';
import TinosBI from '../../assets/fonts/Tinos-BoldItalic.ttf?url';
import { pageSize, TPL_CSS, FONT_CSS } from './templates.js';

const FONT_URLS = {
  Arimo: { normal: ArimoR, bold: ArimoB, italics: ArimoI, bolditalics: ArimoBI },
  Tinos: { normal: TinosR, bold: TinosB, italics: TinosI, bolditalics: TinosBI },
};
const cache = {};
let pdfMakeP = null;

function b64(buf) {
  const bytes = new Uint8Array(buf); let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
async function fontVfs(family) {
  if (!cache[family]) {
    cache[family] = (async () => {
      const vfs = {}; const def = {};
      await Promise.all(Object.entries(FONT_URLS[family]).map(async ([style, url]) => {
        const r = await fetch(url); if (!r.ok) throw new Error('Không tải được phông chữ');
        const name = `${family}-${style}.ttf`; vfs[name] = b64(await r.arrayBuffer()); def[style] = name;
      }));
      return { vfs, def };
    })().catch((e) => { delete cache[family]; throw e; });
  }
  return cache[family];
}

// ---------- Đơn vị và kiểu chữ ----------
const MM = 72 / 25.4;
// Phông Arimo / Tinos cao tự nhiên ≈ 1,15 cỡ chữ; CSS line-height tính theo cỡ chữ nên chia lại để PDF giãn dòng giống bản xem trước
const NATURAL_LH = 1.15;
function toPt(v, base = 10) {
  const m = String(v || '').trim().match(/^(-?[\d.]+)\s*(pt|px|mm|cm|em|rem|%)?$/i); if (!m) return null;
  const n = parseFloat(m[1]); const u = (m[2] || 'px').toLowerCase();
  return u === 'pt' ? n : u === 'px' ? n * 0.75 : u === 'mm' ? n * MM : u === 'cm' ? n * MM * 10 : u === 'em' || u === 'rem' ? n * base : u === '%' ? (n / 100) * base : null;
}
function styleOf(el) {
  const out = {}; const s = el.getAttribute?.('style'); if (!s) return out;
  for (const part of s.split(';')) { const i = part.indexOf(':'); if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim().replace(/\s*!important$/, ''); }
  return out;
}
const fontOf = (fam) => (/times|tinos|serif/i.test(fam) && !/sans-serif/i.test(fam) ? 'Tinos' : /arial|arimo|helvetica|sans/i.test(fam) ? 'Arimo' : null);
function colorOf(c) {
  if (!c) return undefined; const v = c.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v.length === 4 ? '#' + [...v.slice(1)].map((x) => x + x).join('') : v.slice(0, 7);
  const m = v.match(/^rgba?\((\d+)\D+(\d+)\D+(\d+)/i); if (m) return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  return /^[a-z]+$/i.test(v) ? v : undefined;
}
// Kiểu chữ thừa hưởng: thẻ cha → con
function inherit(ctx, el) {
  const c = { ...ctx }; const tag = el.tagName; const st = styleOf(el);
  if (tag === 'STRONG' || tag === 'B') c.bold = true;
  if (tag === 'EM' || tag === 'I') c.italics = true;
  if (tag === 'U') c.decoration = 'underline';
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') c.decoration = 'lineThrough';
  if (tag === 'SUP') c.sup = true;
  if (tag === 'SUB') c.sub = true;
  if (tag === 'MARK') c.background = '#ffff00';
  if (st['font-size']) { const v = toPt(st['font-size'], ctx.fontSize); if (v) c.fontSize = v; }
  if (st['font-weight']) c.bold = /bold|[6-9]00/.test(st['font-weight']);
  if (st['font-style']) c.italics = /italic|oblique/.test(st['font-style']);
  if (st['text-decoration'] || st['text-decoration-line']) { const d = st['text-decoration'] || st['text-decoration-line']; c.decoration = /underline/.test(d) ? 'underline' : /line-through/.test(d) ? 'lineThrough' : undefined; }
  if (st.color) c.color = colorOf(st.color) ?? c.color;
  if (st['background-color'] && tag !== 'TD' && tag !== 'TH' && tag !== 'TABLE') c.background = colorOf(st['background-color']);
  if (st['font-family']) c.font = fontOf(st['font-family']) || c.font;
  if (st['line-height']) { const n = parseFloat(st['line-height']); if (n) c.lineHeight = /^[\d.]+$/.test(st['line-height']) ? n : (toPt(st['line-height'], c.fontSize) || n * c.fontSize) / c.fontSize; }
  if (st['text-align']) c.align = st['text-align'].replace('start', 'left').replace('end', 'right');
  return c;
}
const runOf = (text, c) => ({ text, bold: c.bold || undefined, italics: c.italics || undefined, decoration: c.decoration, fontSize: c.fontSize, color: c.color, background: c.background, font: c.font, sup: c.sup || undefined, sub: c.sub || undefined });
const isBlockTag = (t) => /^(P|DIV|H[1-6]|TABLE|UL|OL|LI|HR|BLOCKQUOTE)$/.test(t);
const okImage = (src) => /^data:image\/(png|jpe?g);base64,/i.test(src || '');

// Ảnh: độ rộng theo style / thuộc tính width (px → pt), không vượt quá chỗ trống
function imageOf(el, c, maxW) {
  const src = el.getAttribute('src'); if (!okImage(src)) return null;
  const st = styleOf(el); let w = toPt(st.width) || (el.getAttribute('width') ? Number(el.getAttribute('width')) * 0.75 : null);
  if (!w || w > maxW) w = Math.min(maxW, w || maxW);
  return { image: src, width: w, alignment: c.align };
}

// Nội dung chữ của một khối (đoạn văn): mảng run; ảnh nằm giữa chữ tách thành dòng riêng
function inlineParts(node, ctx, maxW, parts = [[]]) {
  for (const ch of node.childNodes) {
    if (ch.nodeType === 3) { const t = ch.nodeValue.replace(/[ \t\r\n]+/g, ' '); if (t) parts[parts.length - 1].push(runOf(t, ctx)); continue; }
    if (ch.nodeType !== 1) continue;
    if (ch.tagName === 'BR') { parts[parts.length - 1].push(runOf('\n', ctx)); continue; }
    if (ch.tagName === 'IMG') { const im = imageOf(ch, ctx, maxW); if (im) { parts.push(im, []); } continue; }
    if (isBlockTag(ch.tagName)) { parts.push({ block: ch }, []); continue; }
    inlineParts(ch, inherit(ctx, ch), maxW, parts);
  }
  return parts;
}
function marginOfEl(st, c) {
  const m = { l: toPt(st['margin-left'], c.fontSize) || 0, t: toPt(st['margin-top'], c.fontSize) || 0, r: toPt(st['margin-right'], c.fontSize) || 0, b: toPt(st['margin-bottom'], c.fontSize) || 0 };
  if (st['padding-left']) m.l += toPt(st['padding-left'], c.fontSize) || 0;
  return [m.l, m.t, m.r, m.b];
}
function paragraph(el, ctx, maxW) {
  const c = inherit(ctx, el); const st = styleOf(el); const margin = marginOfEl(st, c);
  const indent = toPt(st['text-indent'], c.fontSize) || 0;
  const out = [];
  for (const part of inlineParts(el, c, maxW - margin[0] - margin[2])) {
    if (Array.isArray(part)) {
      // Bỏ khoảng trắng đầu/cuối đoạn như trình duyệt
      while (part.length && part[0].text !== '\n' && !part[0].text.trim()) part.shift();
      if (part.length) part[0] = { ...part[0], text: part[0].text.replace(/^ +/, '') };
      if (part.length) out.push({ text: part, alignment: c.align || 'left', lineHeight: (c.lineHeight || 1.2) / NATURAL_LH, fontSize: c.fontSize, ...(indent ? { leadingIndent: indent } : {}) });
    } else if (part.block) out.push(...blockOf(part.block, c, maxW - margin[0] - margin[2]));
    else out.push(part);
  }
  // Đoạn trống vẫn chiếm một dòng (giống min-height trên bản xem trước)
  if (!out.length) out.push({ text: ' ', fontSize: c.fontSize, lineHeight: (c.lineHeight || 1.2) / NATURAL_LH });
  return [out.length === 1 ? { ...out[0], margin } : { stack: out, margin }];
}

// Bảng: độ rộng cột lấy từ <colgroup> (px); cột không ghi độ rộng là cột co giãn
function tableOf(el, ctx, maxW) {
  const c = inherit(ctx, el); const st = styleOf(el); const border = el.getAttribute('data-border') === '1' || el.getAttribute('border') === '1';
  const rows = [...el.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr')];
  if (!rows.length) return [];
  let ncol = 0; for (const r of rows) ncol = Math.max(ncol, [...r.children].reduce((s, td) => s + (Number(td.getAttribute('colspan')) || 1), 0));
  const cols = [...el.querySelectorAll(':scope > colgroup > col')].map((col) => toPt(styleOf(col).width) || (col.getAttribute('width') ? Number(col.getAttribute('width')) * 0.75 : null));
  // Ô ghi data-colwidth / colwidth (trình soạn) khi không có colgroup
  if (!cols.length && rows[0]) for (const td of rows[0].children) { const w = String(td.getAttribute('colwidth') || '').split(',').map(Number); for (let i = 0; i < (Number(td.getAttribute('colspan')) || 1); i++) cols.push(w[i] ? w[i] * 0.75 : null); }
  while (cols.length < ncol) cols.push(null);
  cols.length = ncol;
  const padX = border ? 4 : 2; const padY = border ? 3 : 1;
  const fixed = cols.filter(Boolean).reduce((s, w) => s + w, 0); const flex = cols.filter((w) => !w).length;
  // Bảng luôn rộng hết trang (giống CSS width:100%): toàn cột cố định thì chia theo tỷ lệ; tổng vượt trang thì thu nhỏ
  const scale = !flex || fixed > maxW - flex * 20 ? (maxW - flex * 20) / (fixed || 1) : 1;
  const widths = cols.map((w) => (w ? Math.max(8, w * scale - 2 * padX) : '*'));
  const innerW = (i, span) => { let w = 0; for (let k = i; k < i + span; k++) w += typeof widths[k] === 'number' ? widths[k] + 2 * padX : Math.max(20, (maxW - fixed * scale) / Math.max(flex, 1)); return w - 2 * padX; };
  const grid = rows.map(() => Array(ncol).fill(undefined));
  rows.forEach((tr, ri) => {
    const rc = inherit(c, tr); let ci = 0;
    for (const td of tr.children) {
      while (ci < ncol && grid[ri][ci] !== undefined) ci++;
      if (ci >= ncol) break;
      const cs = Math.min(Number(td.getAttribute('colspan')) || 1, ncol - ci); const rs = Number(td.getAttribute('rowspan')) || 1;
      const tc = inherit(rc, td); const tst = styleOf(td);
      if (td.tagName === 'TH') tc.bold = true;
      const stack = blocksOf(td, tc, innerW(ci, cs));
      const cell = { stack: stack.length ? stack : [{ text: '' }] };
      if (cs > 1) cell.colSpan = cs; if (rs > 1) cell.rowSpan = rs;
      const bg = colorOf(tst['background-color'] || tst.background); if (bg) cell.fillColor = bg;
      for (let r = ri; r < Math.min(ri + rs, rows.length); r++) for (let k = ci; k < ci + cs; k++) grid[r][k] = (r === ri && k === ci) ? cell : {};
      ci += cs;
    }
  });
  const body = grid.map((r) => r.map((x) => x || {}));
  // Dòng đầu toàn chữ đậm (tiêu đề cột) lặp lại khi bảng sang trang
  const first = rows[0]; const headerRows = border && rows.length > 2 && first.textContent.trim() && [...first.querySelectorAll('td,th')].every((td) => !td.textContent.trim() || td.tagName === 'TH' || td.querySelector('strong,b')) ? 1 : 0;
  const margin = marginOfEl(st, c);
  return [{ table: { widths, body, dontBreakRows: true, headerRows }, layout: border ? 'tplBorder' : 'tplPlain', margin, fontSize: c.fontSize }];
}

function blockOf(el, ctx, maxW) {
  const tag = el.tagName;
  if (tag === 'TABLE') return tableOf(el, ctx, maxW);
  if (tag === 'HR') {
    if (el.getAttribute('data-kind') === 'rule') return [{ canvas: [{ type: 'rect', x: 0, y: 0, w: maxW, h: 3, color: '#1f3864' }, { type: 'line', x1: 0, y1: 6, x2: maxW, y2: 6, lineWidth: 0.6, lineColor: '#8ea2c6' }], margin: [0, 0, 0, 8] }];
    const st = styleOf(el); const w = toPt((st['border-top'] || '').split(/\s+/)[0]) || 1;
    return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: maxW, y2: 0, lineWidth: w, lineColor: colorOf((st['border-top'] || '').split(/\s+/)[2]) || '#000' }], margin: [0, 4, 0, 4] }];
  }
  if (tag === 'DIV' && el.hasAttribute('data-page-break')) return [{ text: '', pageBreak: 'after' }];
  if (tag === 'UL' || tag === 'OL') {
    const c = inherit(ctx, el);
    const items = [...el.children].filter((li) => li.tagName === 'LI').map((li) => { const s = blocksOf(li, inherit(c, li), maxW - 14); return s.length === 1 ? s[0] : { stack: s }; });
    return [{ [tag === 'UL' ? 'ul' : 'ol']: items, margin: [4, 0, 0, 0] }];
  }
  if (tag === 'IMG') { const im = imageOf(el, ctx, maxW); return im ? [im] : []; }
  if (/^(DIV|BLOCKQUOTE|LI)$/.test(tag) && [...el.childNodes].some((n) => n.nodeType === 1 && isBlockTag(n.tagName))) return blocksOf(el, inherit(ctx, el), maxW);
  return paragraph(el, ctx, maxW);
}
// Các khối con của một phần tử (thân trang, ô bảng, mục danh sách); chữ rời gom thành đoạn
function blocksOf(el, ctx, maxW) {
  const out = []; let loose = null;
  const flush = () => { if (loose) { out.push(...paragraph(loose, ctx, maxW)); loose = null; } };
  for (const ch of [...el.childNodes]) {
    if (ch.nodeType === 1 && isBlockTag(ch.tagName)) { flush(); out.push(...blockOf(ch, ctx, maxW)); continue; }
    if (ch.nodeType === 3 && !ch.nodeValue.trim()) continue;
    if (!loose) loose = el.ownerDocument.createElement('p');
    loose.appendChild(ch.cloneNode(true));
  }
  flush();
  return out;
}

const LAYOUTS = {
  tplBorder: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#000', vLineColor: () => '#000', paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3 },
  tplPlain: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1, paddingBottom: () => 1 },
};

// doc: { html, font, paper, orient, margin(mm), title, code } → định nghĩa pdfmake
export function toPdfDef(doc) {
  const size = pageSize(doc); const m = doc.margin || {};
  const W = size.w * MM; const marg = [m.left ?? 14, m.top ?? 10, m.right ?? 14, m.bottom ?? 10].map((x) => x * MM);
  const body = new DOMParser().parseFromString(`<body>${doc.html}</body>`, 'text/html').body;
  const content = blocksOf(body, { fontSize: 10, font: doc.font || 'Arimo', lineHeight: 1.2 }, W - marg[0] - marg[2]);
  return {
    pageSize: size.h ? { width: W, height: size.h * MM } : { width: W, height: 'auto' }, pageMargins: marg, content,
    info: { title: `${doc.title} ${doc.code || ''}`.trim(), creator: 'Sổ bán hàng gốm sứ' },
    defaultStyle: { font: doc.font || 'Arimo', fontSize: 10, lineHeight: 1.2 / NATURAL_LH },
  };
}

// Một hoặc nhiều chứng từ → một tệp PDF; mỗi chứng từ bắt đầu ở trang mới (khổ giấy theo chứng từ đầu)
export async function pdfBlob(docOrList) {
  const docs = Array.isArray(docOrList) ? docOrList : [docOrList];
  if (!pdfMakeP) pdfMakeP = import('pdfmake/build/pdfmake').then((m) => m.default || m);
  const [pdfMake, a, t] = await Promise.all([pdfMakeP, fontVfs('Arimo'), fontVfs('Tinos')]);
  const def = toPdfDef(docs[0]);
  for (const d of docs.slice(1)) def.content.push({ text: '', pageBreak: 'after' }, ...toPdfDef(d).content);
  if (docs.length > 1) def.info.title = docs.map((d) => d.title).join(', ') + ' ' + (docs[0].code || '');
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf(def, LAYOUTS, { Arimo: a.def, Tinos: t.def }, { ...a.vfs, ...t.vfs }).getBlob((b) => resolve(b)); } catch (e) { reject(e); }
  });
}

// ---------- In bằng trình duyệt ----------
const abs = (u) => new URL(u, location.href).href;
const FACES = () => [['Arimo', ArimoR, 400, 'normal'], ['Arimo', ArimoB, 700, 'normal'], ['Arimo', ArimoI, 400, 'italic'], ['Arimo', ArimoBI, 700, 'italic'],
  ['Tinos', TinosR, 400, 'normal'], ['Tinos', TinosB, 700, 'normal'], ['Tinos', TinosI, 400, 'italic'], ['Tinos', TinosBI, 700, 'italic']]
  .map(([f, u, w, s]) => `@font-face{font-family:"${f}";src:url("${abs(u)}") format("truetype");font-weight:${w};font-style:${s}}`).join('\n');
// Trang HTML in được (dùng cho In / In thử): mỗi chứng từ một trang mới
export function printableHtml(docOrList) {
  const docs = Array.isArray(docOrList) ? docOrList : [docOrList]; const d0 = docs[0];
  const size = pageSize(d0); const m = d0.margin || {};
  // Giấy cuộn (K80/K58): không ép khổ, để máy in nhiệt tự cắt theo độ dài nội dung
  const page = `${size.h ? `size: ${size.w}mm ${size.h}mm; ` : ''}margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;`;
  const body = docs.map((d, i) => `<div class="tpl" style="font-family:${FONT_CSS[d.font] || FONT_CSS.Arimo}${i ? ';break-before:page' : ''}">${d.html}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${(d0.title + ' ' + (d0.code || '')).replace(/</g, '')}</title><style>${FACES()}
@page { ${page} } html, body { margin: 0; background: #fff; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }${size.h ? '' : ` body { width: ${size.w - (m.left || 0) - (m.right || 0)}mm; }`}
${TPL_CSS}</style></head><body>${body}</body></html>`;
}
// In qua khung ẩn (không mở cửa sổ mới); chờ phông và ảnh tải xong rồi mới gọi hộp thoại in
export function printDocs(docOrList) {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const w = f.contentWindow; const d = w.document;
    d.open(); d.write(printableHtml(docOrList)); d.close();
    const go = async () => {
      try {
        await Promise.race([d.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]);
        await Promise.all([...d.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = r; im.onerror = r; }))));
        w.focus(); w.print(); resolve();
      } catch (e) { reject(e); } finally { setTimeout(() => f.remove(), 1500); }
    };
    if (d.readyState === 'complete') go(); else f.onload = go;
  });
}
