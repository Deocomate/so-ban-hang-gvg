// Trình sửa mẫu in mở ở tab riêng (giống "Chỉnh sửa mẫu in" của KiotViet):
// trái là trình soạn trực quan (hoặc mã nguồn HTML), phải là bản xem trước đúng khổ giấy với dữ liệu mẫu hoặc chứng từ thật.
// Địa chỉ: ?mau-in=<loại>&tpl=<mã mẫu | new>&book=<sổ>
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { TextStyle, Color, BackgroundColor, FontFamily, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import {
  Bold, Italic, Underline, Strikethrough, Subscript as SubIcon, Superscript as SupIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered,
  Undo2, Redo2, ImagePlus, Table as TableIcon, Minus, Code, Baseline, Highlighter, Copy, Scissors, ClipboardPaste, Grid3x3, RemoveFormatting, Printer, Save,
  RotateCcw, X, Braces, SeparatorHorizontal, ZoomIn, ZoomOut, Search, ChevronDown, Plus, Trash2, PaintBucket, TableCellsMerge, TableCellsSplit,
  BetweenHorizontalStart, BetweenHorizontalEnd, BetweenVerticalStart, BetweenVerticalEnd, SquareDashed, Square, Pilcrow, TriangleAlert,
} from 'lucide-react';
import { useApp } from '../lib/store.jsx';
import { packView } from '../lib/book-profile.js';
import { Loading, Note } from '../components/ui.jsx';
import { DOC_TYPES, docSettings, loadDocData, defaults, currentInfo } from '../lib/docs/model.js';
import { groupsFor, tokenValues, sampleData } from '../lib/docs/tokens.js';
import { PAPERS, DEFAULT_MARGIN, FONT_CSS, pageSize, marginOf, defaultTemplate, renderTemplate, unknownTokens, sanitizeHtml, fitTables, contentWidthPx, suggestedTemplates } from '../lib/docs/templates.js';
import { editorUrl, announceTemplates } from '../lib/docs/editor-link.js';
import { useDocFonts } from '../lib/docs/fonts.js';
import { StyleAttr, TableX, HrX, PageBreak, TokenNode, toEditorHtml, fromEditorHtml, beautify, parseStyle } from '../lib/docs/editor-ext.js';

const SOURCE_KIND = (type) => (type === 'phieu_thu' ? 'payment' : type === 'bao_gia' ? 'quote' : ['de_nghi_tam_ung', 'doi_chieu_sl', 'doi_chieu_tt', 'de_nghi_tt'].includes(type) ? 'contract' : 'order');
const SOURCE_VIEW = { order: 'sales_orders', payment: 'payments', contract: 'contracts', quote: 'quotes' };
const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const FONT_SIZES = [7, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32];
const LINE_HEIGHTS = ['1', '1.1', '1.2', '1.35', '1.5', '1.75', '2'];
const PX_PER_MM = 96 / 25.4;

// ---------- Trang đứng riêng ----------
export function PrintEditorPage({ link }) {
  const { books, book, setBookId, bootError, can, toasts } = useApp();
  useEffect(() => { if (link.book && books?.some((b) => b.id === link.book) && book?.id !== link.book) setBookId(link.book); }, [books, link.book]);
  useEffect(() => { document.title = `Sửa mẫu in · ${DOC_TYPES[link.type].label}`; }, [link.type]);
  if (bootError) return <div className="center-screen"><Note tone="warn">{bootError}</Note></div>;
  if (!books || !book || (link.book && books.some((b) => b.id === link.book) && book.id !== link.book)) return <div className="center-screen"><Loading text="Đang mở trình sửa mẫu in…" /></div>;
  if (!can('owner')) return <div className="center-screen"><Note tone="warn">Chỉ quản lý sổ được sửa mẫu in.</Note></div>;
  return (
    <>
      <TemplateEditor key={`${book.id}:${link.type}:${link.tpl}`} type={link.type} tplId={link.tpl} />
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast${t.kind === 'err' ? ' err' : ''}`}><span>{t.text}</span></div>)}</div>
    </>
  );
}

// ---------- Nút thanh công cụ ----------
function TB({ icon: I, title, on, disabled, onClick, children, className = '' }) {
  return (
    <button type="button" className={`te-btn${on ? ' on' : ''} ${className}`} title={title} aria-label={title} aria-pressed={on ? 'true' : undefined} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {I && <I size={16} strokeWidth={1.9} />}{children}
    </button>
  );
}
// Menu thả xuống nhỏ (bảng, đoạn văn…)
function Drop({ icon, title, label, children, wide }) {
  const [open, setOpen] = useState(false); const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <span className="te-drop" ref={ref}>
      <TB icon={icon} title={title} on={open} onClick={() => setOpen((x) => !x)}>{label}<ChevronDown size={12} /></TB>
      {open && <div className={`te-menu${wide ? ' wide' : ''}`} onMouseDown={(e) => { if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') e.preventDefault(); }} onClick={(e) => { if (e.target.closest('[data-close]')) setOpen(false); }}>{children}</div>}
    </span>
  );
}
const MI = ({ icon: I, children, onClick, disabled, danger }) => (
  <button type="button" className={`te-mi${danger ? ' danger' : ''}`} data-close disabled={disabled} onClick={onClick}>{I ? <I size={15} /> : <span style={{ width: 15 }} />}<span>{children}</span></button>
);

// Chọn số dòng × cột khi chèn bảng
function GridPicker({ onPick }) {
  const [hv, setHv] = useState([0, 0]);
  return (
    <div className="te-grid">
      <div className="te-grid-cells" onMouseLeave={() => setHv([0, 0])}>
        {Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => (
          <button type="button" key={`${r}-${c}`} data-close className={r < hv[0] && c < hv[1] ? 'on' : ''} onMouseEnter={() => setHv([r + 1, c + 1])} onClick={() => onPick(r + 1, c + 1)} aria-label={`${r + 1} dòng × ${c + 1} cột`} />
        )))}
      </div>
      <div className="small muted">{hv[0] ? `${hv[0]} dòng × ${hv[1]} cột` : 'Chọn kích thước bảng'}</div>
    </div>
  );
}

// ---------- Bảng chèn thông tin (biến) ----------
function TokenPanel({ type, onInsert, onClose }) {
  const groups = groupsFor(type); const [g, setG] = useState(groups[0].id); const [qs, setQs] = useState('');
  const [copied, setCopied] = useState('');
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  const list = qs.trim() ? groups.flatMap((x) => x.tokens.map((t) => ({ ...t, gl: x.label, item: x.item }))).filter((t) => norm(`${t.label} ${t.k} ${t.desc}`).includes(norm(qs.trim())))
    : groups.find((x) => x.id === g).tokens.map((t) => ({ ...t, item: groups.find((x) => x.id === g).item }));
  const copy = async (k) => { try { await navigator.clipboard.writeText(`{${k}}`); setCopied(k); setTimeout(() => setCopied(''), 1200); } catch (e) { /* bỏ qua */ } };
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, []);
  return (
    <div className="te-pop-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="te-pop" role="dialog" aria-label="Chèn thông tin">
        <div className="te-pop-head">
          <b>Thông tin</b>
          <label className="te-search"><Search size={15} /><input autoFocus placeholder="Tìm tất cả thông tin" value={qs} onChange={(e) => setQs(e.target.value)} /></label>
          <TB icon={X} title="Đóng" onClick={onClose} />
        </div>
        <div className={`te-pop-body${qs.trim() ? ' flat' : ''}`}>
          {!qs.trim() && <nav className="te-cats">{groups.map((x) => <button type="button" key={x.id} className={x.id === g ? 'on' : ''} onClick={() => setG(x.id)}>{x.label}</button>)}</nav>}
          <div className="te-toks">
            {g === 'hang_hoa' && !qs.trim() && <div className="te-hint small">Đặt biến hàng hóa trong một dòng của bảng: dòng đó sẽ tự lặp lại cho từng mặt hàng.</div>}
            <table>
              <thead><tr><th>Tên thông tin</th><th>Giải thích</th><th style={{ width: 130 }}>Thao tác</th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.k}>
                    <td><span className={`tk${t.item ? ' tk-item' : ''}`}>{t.label}</span><div className="te-code">{`{${t.k}}`}</div></td>
                    <td className="small">{t.desc}{t.gl && <div className="muted">{t.gl}</div>}</td>
                    <td><button type="button" className="link-btn small" onClick={() => onInsert(t.k)}>Chèn</button>{'  '}<button type="button" className="link-btn small" onClick={() => copy(t.k)}>{copied === t.k ? 'Đã chép' : 'Sao chép'}</button></td>
                  </tr>
                ))}
                {!list.length && <tr><td colSpan={3} className="muted small">Không tìm thấy thông tin phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ảnh chèn vào mẫu: thu nhỏ tối đa 900px, lưu PNG (ảnh trong suốt) hoặc JPEG (ảnh chụp) để PDF đọc được
async function loadImage(file) {
  if (!/^image\//.test(file.type)) throw new Error('Chọn tệp ảnh (PNG, JPG)');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new window.Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Không đọc được ảnh')); i.src = url; });
    const k = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const png = /png|gif|webp|svg/.test(file.type);
    if (!png) { g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
    const data = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86);
    if (data.length > 450000) throw new Error('Ảnh quá lớn sau khi thu nhỏ — chọn ảnh khác nhỏ hơn');
    return { src: data, width: Math.min(c.width, 240) };
  } finally { URL.revokeObjectURL(url); }
}

// ---------- Trình sửa ----------
function TemplateEditor({ type, tplId }) {
  useDocFonts();
  const { book, settings, rpc, q, loadBooks, toast } = useApp();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const saved = ds.templates[type] || [];
  // Mẫu đang sửa: mẫu đã lưu, mẫu mới (từ mẫu mặc định) hoặc mẫu mặc định chưa lưu lần nào
  const start = useMemo(() => {
    const def = defaultTemplate(type, ds);
    if (tplId === 'new') return { ...def, id: newId(), name: `Mẫu ${DOC_TYPES[type].label.toLowerCase()} ${saved.length + 1}`, builtin: false, is_default: !saved.length, isNew: true };
    const t = saved.find((x) => x.id === tplId) || (tplId ? null : saved.find((x) => x.is_default) || saved[0]);
    if (t) return { ...t, margin: marginOf(t) };
    return { ...def, is_default: true, isNew: true };
  }, []);
  const [meta, setMeta] = useState(() => ({ id: start.id, name: start.name, paper: start.paper || 'A4', orient: start.orient || 'portrait', margin: { ...start.margin }, sep: start.sep || ',', is_default: !!start.is_default }));
  const [isNew, setIsNew] = useState(!!start.isNew);
  const [html, setHtml] = useState(start.html); // HTML lưu trữ ({Bien}) — cập nhật khi soạn
  const base = useRef({ meta, html: null }); // trạng thái đã lưu gần nhất, để "Đặt lại" và báo thay đổi chưa lưu
  const [source, setSource] = useState(null); // chuỗi mã nguồn khi đang ở chế độ Source
  const [grid, setGrid] = useState(true);
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slash, setSlash] = useState(null); // { from, query, x, y, i }
  const slashRef = useRef(null); slashRef.current = slash;
  const fileRef = useRef(null);

  const insertToken = useCallback((ed, k, range) => {
    const c = ed.chain().focus(); if (range) c.deleteRange(range);
    c.insertContent([{ type: 'token', attrs: { name: k } }, { type: 'text', text: ' ' }]).run();
  }, []);

  const [, repaint] = useReducer((x) => x + 1, 0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ horizontalRule: false, code: false, codeBlock: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      TextStyle, Color, BackgroundColor, FontFamily, FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }), Subscript, Superscript,
      Image.configure({ inline: true, allowBase64: true }),
      TableX.configure({ resizable: true, lastColumnResizable: false, cellMinWidth: 24 }), TableRow, TableHeader, TableCell,
      HrX, PageBreak, TokenNode, StyleAttr,
    ],
    content: toEditorHtml(start.html),
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'tpl te-doc', spellcheck: 'false' },
      handleKeyDown: (view, e) => {
        const s = slashRef.current; if (!s) return false;
        const items = slashItems(type, s.query); if (!items.length) return false;
        if (e.key === 'ArrowDown') { setSlash({ ...s, i: Math.min(items.length - 1, s.i + 1) }); return true; }
        if (e.key === 'ArrowUp') { setSlash({ ...s, i: Math.max(0, s.i - 1) }); return true; }
        if (e.key === 'Enter' || e.key === 'Tab') { const t = items[s.i]; if (t) { insertToken(editorRef.current, t.k, { from: s.from, to: view.state.selection.from }); setSlash(null); return true; } return false; }
        if (e.key === 'Escape') { setSlash(null); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => { setHtml(fromEditorHtml(ed.getHTML())); detectSlash(ed); },
    onSelectionUpdate: ({ editor: ed }) => detectSlash(ed),
    // Vẽ lại thanh công cụ theo vị trí con trỏ (đậm / nghiêng đang bật, đang ở trong bảng…)
    onTransaction: () => repaint(),
  });
  const editorRef = useRef(null); editorRef.current = editor;
  // Gõ "/" để chèn thông tin: tìm "/từ khóa" ngay trước con trỏ
  function detectSlash(ed) {
    const { state, view } = ed; const sel = state.selection;
    if (!sel.empty) { if (slashRef.current) setSlash(null); return; }
    const $f = sel.$from; const before = $f.parent.textBetween(Math.max(0, $f.parentOffset - 40), $f.parentOffset, '\n', '￼');
    const m = before.match(/(?:^|[\s(])\/([^/{}\n]{0,30})$/);
    if (m && (/\s{2}|^\s/.test(m[1]) || !slashItems(type, m[1]).length)) { if (slashRef.current) setSlash(null); return; }
    if (!m) { if (slashRef.current) setSlash(null); return; }
    const from = sel.from - m[1].length - 1; const c = view.coordsAtPos(sel.from);
    setSlash((old) => ({ from, query: m[1], x: c.left, y: c.bottom, i: old && old.from === from ? Math.min(old.i, Math.max(0, slashItems(type, m[1]).length - 1)) : 0 }));
  }
  // HTML ban đầu chuẩn hóa qua trình soạn (để so sánh thay đổi cho đúng)
  useEffect(() => { if (editor && !editor.isDestroyed && base.current.html === null) { const h = fromEditorHtml(editor.getHTML()); base.current = { meta, html: h }; setHtml(h); } }, [editor]);

  const dirty = isNew || base.current.html === null || html !== base.current.html || JSON.stringify(meta) !== JSON.stringify(base.current.meta) || source !== null && source !== beautify(html);
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // ---------- Dữ liệu xem trước ----------
  const kind = SOURCE_KIND(type);
  const [recs, setRecs] = useState([]);
  const [srcId, setSrcId] = useState('');
  const [real, setReal] = useState(null); const [realErr, setRealErr] = useState(null);
  useEffect(() => { q(SOURCE_VIEW[kind], [], 'created_at desc', 30).then((r) => setRecs(r || [])).catch(() => setRecs([])); }, [kind]);
  useEffect(() => {
    if (!srcId) { setReal(null); setRealErr(null); return undefined; }
    let alive = true;
    loadDocData(q, rpc, { kind, id: srcId }).then((d) => alive && setReal({ ...d, prods: Object.fromEntries(Object.entries(d.prods || {}).map(([k, p]) => [k, packView(p, settings)])) }))
      .catch((e) => alive && setRealErr(e.message));
    return () => { alive = false; };
  }, [srcId]);
  const sample = useMemo(() => sampleData(type), [type]);
  const pdata = srcId && real ? real : sample;
  const pinfo = useMemo(() => ({ ...defaults(type, pdata, ds), ...(srcId && real ? currentInfo(type, pdata) || {} : {}) }), [pdata, ds]);
  const liveHtml = source !== null ? source : html;
  const [shown, setShown] = useState(liveHtml);
  useEffect(() => { const t = setTimeout(() => setShown(liveHtml), 180); return () => clearTimeout(t); }, [liveHtml]);
  const rendered = useMemo(() => {
    try { return { html: fitTables(renderTemplate(shown, tokenValues(type, pdata, ds, pinfo, meta.sep)), contentWidthPx(meta)) }; } catch (e) { return { error: e.message }; }
  }, [shown, pdata, pinfo, meta.sep, meta.paper, meta.orient, meta.margin, ds]);
  const unknown = useMemo(() => unknownTokens(liveHtml), [liveHtml]);

  // ---------- Khổ giấy, thu phóng ----------
  const size = pageSize(meta); const mg = meta.margin;
  const paperStyle = { width: `${size.w}mm`, minHeight: size.h ? `${size.h}mm` : '60mm', padding: `${mg.top}mm ${mg.right}mm ${mg.bottom}mm ${mg.left}mm`, fontFamily: FONT_CSS[ds.font] };
  const pvRef = useRef(null); const [fit, setFit] = useState(1); const [zoom, setZoom] = useState(null);
  useEffect(() => {
    const el = pvRef.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setFit(Math.min(1.5, Math.max(0.3, (el.clientWidth - 32) / (size.w * PX_PER_MM)))));
    ro.observe(el); return () => ro.disconnect();
  }, [size.w]);
  const z = zoom ?? Math.min(1, fit);

  // ---------- Thao tác ----------
  const setM = (k, v) => setMeta((m) => ({ ...m, [k]: v }));
  const applySource = () => { if (source === null || !editor) return; editor.commands.setContent(toEditorHtml(sanitizeHtml(source)), { emitUpdate: true }); setHtml(fromEditorHtml(editor.getHTML())); setSource(null); };
  const toggleSource = () => { if (source === null) setSource(beautify(html)); else applySource(); };
  const loadContent = (h) => { setSource(null); editor.commands.setContent(toEditorHtml(h), { emitUpdate: true }); setHtml(fromEditorHtml(editor.getHTML())); };
  const reset = () => {
    if (dirty && !window.confirm('Bỏ mọi thay đổi chưa lưu và quay lại mẫu đã lưu?')) return;
    setMeta(base.current.meta); loadContent(base.current.html ?? start.html);
  };
  const suggest = (v) => {
    if (!v) return;
    const t = v === '__default' ? defaultTemplate(type, ds) : v.startsWith('__s:') ? suggestedTemplates(type).find((x) => x.id === v.slice(4)) : saved.find((x) => x.id === v);
    if (!t || !window.confirm(`Thay nội dung đang soạn bằng "${t.name}"? Nội dung hiện tại sẽ mất nếu chưa lưu.`)) return;
    loadContent(t.html); setMeta((m) => ({ ...m, paper: t.paper || 'A4', orient: t.orient || 'portrait', margin: marginOf(t), sep: t.sep || m.sep }));
  };
  const currentDoc = () => ({ html: rendered.html || '', font: ds.font, paper: meta.paper, orient: meta.orient, margin: meta.margin, title: DOC_TYPES[type].label, code: 'in thử' });
  const testPrint = async () => {
    if (source !== null) applySource();
    try { const { printDocs } = await import('../lib/docs/pdf.js'); await printDocs(currentDoc()); } catch (e) { toast('Không in được: ' + e.message, 'err'); }
  };
  const save = async () => {
    let h = html;
    if (source !== null) { editor.commands.setContent(toEditorHtml(sanitizeHtml(source))); h = fromEditorHtml(editor.getHTML()); setHtml(h); setSource(null); }
    if (!meta.name.trim()) { toast('Đặt tên cho mẫu in', 'err'); return; }
    if (unknownTokens(h).length && !window.confirm(`Mẫu có thông tin không nhận ra: ${unknownTokens(h).map((k) => `{${k}}`).join(', ')}. Khi in sẽ giữ nguyên chữ. Vẫn lưu?`)) return;
    setBusy(true);
    try {
      const me = { ...meta, name: meta.name.trim(), html: h, updated_at: new Date().toISOString() };
      const cur = (docSettings(book, settings).templates[type] || []).filter((t) => t.id !== me.id);
      const old = saved.findIndex((t) => t.id === me.id);
      const list = old >= 0 ? [...cur.slice(0, old), me, ...cur.slice(old)] : [...cur, me];
      const out = list.map((t) => ({ ...t, is_default: me.is_default ? t.id === me.id : (t.id === me.id ? false : t.is_default) }));
      await rpc('save_print_templates', { doc_type: type, templates: out.map(({ builtin, isNew: _n, ...t }) => t) });
      base.current = { meta: { ...meta, name: me.name }, html: h }; setMeta((m) => ({ ...m, name: me.name })); setIsNew(false);
      history.replaceState(null, '', editorUrl({ book: book.id, type, tpl: me.id }));
      await loadBooks(); announceTemplates(book.id); toast('Đã lưu mẫu in');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!busy) save(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  const close = () => { if (dirty && !window.confirm('Mẫu chưa lưu. Đóng tab và bỏ thay đổi?')) return; window.close(); setTimeout(() => { location.href = location.pathname + '#cai-dat/mau-in'; }, 200); };

  if (!editor || editor.isDestroyed) return <div className="center-screen"><Loading /></div>;
  const inTable = editor.isActive('table');
  const imgSel = editor.isActive('image');
  const ts = editor.getAttributes('textStyle');
  // Cỡ chữ hiện tại: lấy theo định dạng chữ, không có thì đo chữ trên trang
  let curSize = ts.fontSize ? parseFloat(ts.fontSize) * (/px$/.test(ts.fontSize) ? 0.75 : 1) : null;
  if (!curSize) { try { const dom = editor.view.domAtPos(editor.state.selection.from).node; const el = dom.nodeType === 3 ? dom.parentElement : dom; curSize = Math.round(parseFloat(getComputedStyle(el).fontSize) * 0.75 * 2) / 2; } catch (e) { curSize = 10; } }
  if (!Number.isFinite(curSize) || curSize <= 0) curSize = 10;
  const curFont = /tinos|times/i.test(ts.fontFamily || '') ? 'Tinos' : /arimo|arial/i.test(ts.fontFamily || '') ? 'Arimo' : '';
  const setSize = (pt) => { const v = Math.max(5, Math.min(72, Math.round(pt * 2) / 2)); editor.chain().focus().setFontSize(`${v}pt`).run(); };
  const pStyle = parseStyle(editor.getAttributes('paragraph').style);
  const tblBorder = editor.getAttributes('table').border !== '0';
  const imgW = imgSel ? parseFloat(parseStyle(editor.getAttributes('image').style).width) || null : null;
  const setImgW = (w) => editor.chain().focus().updateAttributes('image', { style: w ? `width: ${w}px` : null }).run();
  const ch = () => editor.chain().focus();
  const items = slash ? slashItems(type, slash.query) : [];

  return (
    <div className="te">
      <header className="te-top">
        <b className="te-title">Chỉnh sửa mẫu in</b>
        <span className="te-type">{DOC_TYPES[type].label}</span>
        <input className="input te-name" value={meta.name} onChange={(e) => setM('name', e.target.value)} maxLength={120} aria-label="Tên mẫu in" placeholder="Tên mẫu in" />
        <select className="input te-suggest" value="" onChange={(e) => suggest(e.target.value)} aria-label="Chọn mẫu gợi ý">
          <option value="">Chọn mẫu gợi ý</option>
          <option value="__default">Mẫu gốc của hệ thống</option>
          {suggestedTemplates(type).map((t) => <option key={t.id} value={`__s:${t.id}`}>{t.name}</option>)}
          {saved.filter((t) => t.id !== meta.id).map((t) => <option key={t.id} value={t.id}>Sao chép từ: {t.name}</option>)}
        </select>
        <label className="te-check"><input type="checkbox" checked={meta.is_default} onChange={(e) => setM('is_default', e.target.checked)} /> Mẫu mặc định</label>
        <span className="grow" />
        {dirty && <span className="small muted">Chưa lưu</span>}
        <button type="button" className="btn btn-ghost" onClick={reset}><RotateCcw size={16} /> Đặt lại</button>
        <button type="button" className="btn btn-ghost" onClick={testPrint}><Printer size={16} /> In thử</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}><Save size={16} /> {busy ? 'Đang lưu…' : 'Lưu mẫu'}</button>
        <TB icon={X} title="Đóng" onClick={close} />
      </header>

      <div className="te-main">
        <section className="te-left">
          <div className="te-bar">
            <div className="te-row">
              <TB icon={Code} title={source === null ? 'Xem mã nguồn HTML' : 'Quay lại chế độ trực quan'} on={source !== null} onClick={toggleSource}>Source</TB>
              <span className="te-sep" />
              <select className="te-sel" disabled={source !== null} value={curFont} onChange={(e) => { const v = e.target.value; if (v) ch().setFontFamily(FONT_CSS[v]).run(); else ch().unsetFontFamily().run(); }} aria-label="Phông chữ">
                <option value="">Phông mặc định</option><option value="Arimo">Arial</option><option value="Tinos">Times New Roman</option>
              </select>
              <TB icon={Minus} title="Giảm cỡ chữ" disabled={source !== null} onClick={() => setSize(curSize - (curSize > 12 ? 1 : 0.5))} />
              <select className="te-sel te-size" disabled={source !== null} value={FONT_SIZES.includes(curSize) ? curSize : ''} onChange={(e) => setSize(Number(e.target.value))} aria-label="Cỡ chữ (pt)">
                {!FONT_SIZES.includes(curSize) && <option value="">{curSize}</option>}
                {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <TB icon={Plus} title="Tăng cỡ chữ" disabled={source !== null} onClick={() => setSize(curSize + (curSize >= 12 ? 1 : 0.5))} />
              <span className="te-sep" />
              <TB icon={ImagePlus} title="Chèn ảnh" disabled={source !== null} onClick={() => fileRef.current?.click()} />
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
                try { const im = await loadImage(f); ch().setImage({ src: im.src }).updateAttributes('image', { style: `width: ${im.width}px` }).run(); } catch (x) { toast(x.message, 'err'); } }} />
              <Drop icon={TableIcon} title="Bảng" wide>
                {!inTable ? <GridPicker onPick={(r, c) => ch().insertTable({ rows: r, cols: c, withHeaderRow: false }).run()} /> : <>
                  <MI icon={BetweenHorizontalStart} onClick={() => ch().addRowBefore().run()}>Thêm dòng phía trên</MI>
                  <MI icon={BetweenHorizontalEnd} onClick={() => ch().addRowAfter().run()}>Thêm dòng phía dưới</MI>
                  <MI icon={BetweenVerticalStart} onClick={() => ch().addColumnBefore().run()}>Thêm cột bên trái</MI>
                  <MI icon={BetweenVerticalEnd} onClick={() => ch().addColumnAfter().run()}>Thêm cột bên phải</MI>
                  <MI icon={TableCellsMerge} disabled={!editor.can().mergeCells()} onClick={() => ch().mergeCells().run()}>Gộp ô</MI>
                  <MI icon={TableCellsSplit} disabled={!editor.can().splitCell()} onClick={() => ch().splitCell().run()}>Tách ô</MI>
                  <MI icon={tblBorder ? SquareDashed : Square} onClick={() => ch().updateAttributes('table', { border: tblBorder ? '0' : '1' }).run()}>{tblBorder ? 'Bỏ viền bảng' : 'Kẻ viền bảng'}</MI>
                  <div className="te-mi-row"><PaintBucket size={15} /> Nền ô
                    {['', '#f2f2f2', '#fff2cc', '#deebf7', '#e2f0d9', '#fbe5d6'].map((c) => <button type="button" key={c || 'none'} data-close className="te-swatch" style={{ background: c || '#fff' }} title={c || 'Không màu'} onClick={() => ch().setCellStyle('background-color', c || null).run()}>{c ? '' : '×'}</button>)}
                  </div>
                  <div className="te-mi-row">Căn dọc ô
                    {[['top', 'Trên'], ['middle', 'Giữa'], ['bottom', 'Dưới']].map(([v, l]) => <button type="button" key={v} data-close className="te-chip" onClick={() => ch().setCellStyle('vertical-align', v).run()}>{l}</button>)}
                  </div>
                  <MI icon={Trash2} danger onClick={() => ch().deleteRow().run()}>Xóa dòng</MI>
                  <MI icon={Trash2} danger onClick={() => ch().deleteColumn().run()}>Xóa cột</MI>
                  <MI icon={Trash2} danger onClick={() => ch().deleteTable().run()}>Xóa bảng</MI>
                </>}
              </Drop>
              <Drop icon={SeparatorHorizontal} title="Kẻ ngang, ngắt trang">
                <MI icon={Minus} onClick={() => ch().setHorizontalRule().run()}>Đường kẻ ngang</MI>
                <MI icon={Minus} onClick={() => ch().insertContent({ type: 'horizontalRule', attrs: { kind: 'rule' } }).run()}>Dải màu đầu trang</MI>
                <MI icon={SeparatorHorizontal} onClick={() => ch().insertPageBreak().run()}>Ngắt trang</MI>
              </Drop>
              <span className="grow" />
              <span className="small muted te-slash-hint">Gõ <kbd>/</kbd> để <button type="button" className="link-btn small" onClick={() => setPanel(true)}>chèn thông tin</button></span>
            </div>
            <div className="te-row">
              <TB icon={Undo2} title="Hoàn tác (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => ch().undo().run()} />
              <TB icon={Redo2} title="Làm lại (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => ch().redo().run()} />
              <span className="te-sep" />
              <TB icon={Copy} title="Sao chép (Ctrl+C)" onClick={() => { editor.view.focus(); document.execCommand('copy'); }} />
              <TB icon={Scissors} title="Cắt (Ctrl+X)" onClick={() => { editor.view.focus(); document.execCommand('cut'); }} />
              <TB icon={ClipboardPaste} title="Dán chữ (Ctrl+V)" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) ch().insertContent(t).run(); } catch (e) { toast('Trình duyệt chặn đọc bộ nhớ tạm — hãy bấm Ctrl+V', 'err'); } }} />
              <span className="te-sep" />
              <TB icon={Bold} title="Đậm (Ctrl+B)" on={editor.isActive('bold')} onClick={() => ch().toggleBold().run()} />
              <TB icon={Italic} title="Nghiêng (Ctrl+I)" on={editor.isActive('italic')} onClick={() => ch().toggleItalic().run()} />
              <TB icon={Underline} title="Gạch dưới (Ctrl+U)" on={editor.isActive('underline')} onClick={() => ch().toggleUnderline().run()} />
              <TB icon={Strikethrough} title="Gạch ngang" on={editor.isActive('strike')} onClick={() => ch().toggleStrike().run()} />
              <TB icon={SubIcon} title="Chỉ số dưới" on={editor.isActive('subscript')} onClick={() => ch().toggleSubscript().run()} />
              <TB icon={SupIcon} title="Chỉ số trên" on={editor.isActive('superscript')} onClick={() => ch().toggleSuperscript().run()} />
              <span className="te-sep" />
              <label className="te-btn te-color" title="Màu chữ"><Baseline size={16} /><i style={{ background: ts.color || '#000' }} />
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(ts.color || '') ? ts.color : '#000000'} onChange={(e) => ch().setColor(e.target.value).run()} /></label>
              <label className="te-btn te-color" title="Màu nền chữ"><Highlighter size={16} /><i style={{ background: ts.backgroundColor || 'transparent' }} />
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(ts.backgroundColor || '') ? ts.backgroundColor : '#ffff00'} onChange={(e) => ch().setBackgroundColor(e.target.value).run()} /></label>
              <TB icon={RemoveFormatting} title="Xóa định dạng chữ" onClick={() => ch().unsetAllMarks().run()} />
              <span className="te-sep" />
              <TB icon={AlignLeft} title="Căn trái" on={editor.isActive({ textAlign: 'left' })} onClick={() => ch().setTextAlign('left').run()} />
              <TB icon={AlignCenter} title="Căn giữa" on={editor.isActive({ textAlign: 'center' })} onClick={() => ch().setTextAlign('center').run()} />
              <TB icon={AlignRight} title="Căn phải" on={editor.isActive({ textAlign: 'right' })} onClick={() => ch().setTextAlign('right').run()} />
              <TB icon={AlignJustify} title="Căn đều hai bên" on={editor.isActive({ textAlign: 'justify' })} onClick={() => ch().setTextAlign('justify').run()} />
              <TB icon={List} title="Danh sách dấu chấm" on={editor.isActive('bulletList')} onClick={() => ch().toggleBulletList().run()} />
              <TB icon={ListOrdered} title="Danh sách đánh số" on={editor.isActive('orderedList')} onClick={() => ch().toggleOrderedList().run()} />
              <Drop icon={Pilcrow} title="Đoạn văn: giãn dòng, khoảng cách, thụt lề" wide>
                <div className="te-form">
                  <label>Giãn dòng<select value={pStyle['line-height'] || ''} onChange={(e) => ch().setBlockStyle('line-height', e.target.value || null).run()}>
                    <option value="">Mặc định</option>{LINE_HEIGHTS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
                  <label>Cách trên (pt)<input type="number" min="0" max="72" step="1" value={parseFloat(pStyle['margin-top']) || ''} onChange={(e) => ch().setBlockStyle('margin-top', e.target.value ? `${e.target.value}pt` : null).run()} /></label>
                  <label>Cách dưới (pt)<input type="number" min="0" max="72" step="1" value={parseFloat(pStyle['margin-bottom']) || ''} onChange={(e) => ch().setBlockStyle('margin-bottom', e.target.value ? `${e.target.value}pt` : null).run()} /></label>
                  <label>Thụt lề trái (pt)<input type="number" min="0" max="200" step="2" value={parseFloat(pStyle['margin-left']) || ''} onChange={(e) => ch().setBlockStyle('margin-left', e.target.value ? `${e.target.value}pt` : null).run()} /></label>
                  <label>Thụt dòng đầu (pt)<input type="number" min="0" max="100" step="2" value={parseFloat(pStyle['text-indent']) || ''} onChange={(e) => ch().setBlockStyle('text-indent', e.target.value ? `${e.target.value}pt` : null).run()} /></label>
                </div>
              </Drop>
              <span className="te-sep" />
              <TB icon={Grid3x3} title="Hiện đường lưới của bảng không viền" on={grid} onClick={() => setGrid((x) => !x)} />
              <TB icon={Braces} title="Chèn thông tin" onClick={() => setPanel(true)} />
              {imgSel && <span className="te-imgw">Rộng ảnh <input type="number" min="16" max="800" value={imgW || ''} onChange={(e) => setImgW(Number(e.target.value) || null)} /> px</span>}
            </div>
          </div>
          <div className={`te-canvas${grid ? ' grid' : ''}`}>
            {source !== null ? (
              <div className="te-source">
                <textarea value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} aria-label="Mã nguồn HTML của mẫu" />
                <div className="te-source-foot small muted">
                  <span className="grow">Viết biến dạng <code>{'{Ten_Bien}'}</code>. Thẻ HTML không hỗ trợ sẽ bị lược bỏ khi quay lại chế độ trực quan.</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSource(beautify(source))}>Beautify</button>
                  <button type="button" className="btn btn-soft btn-sm" onClick={applySource}>Áp dụng</button>
                </div>
              </div>
            ) : (
              <div className="te-paper" style={paperStyle}><EditorContent editor={editor} /></div>
            )}
          </div>
        </section>

        <section className="te-right">
          <div className="te-pv-head">
            <b>Xem trước mẫu in</b>
            <select className="te-sel" value={srcId} onChange={(e) => setSrcId(e.target.value)} aria-label="Dữ liệu xem trước">
              <option value="">Dữ liệu mẫu</option>
              {recs.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.customer_name || r.party_name || ''}</option>)}
            </select>
            <span className="grow" />
            <select className="te-sel" value={meta.paper} onChange={(e) => setM('paper', e.target.value)} aria-label="Khổ giấy">
              {Object.entries(PAPERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
            {!PAPERS[meta.paper].roll && <div className="te-seg" role="group" aria-label="Hướng giấy">
              <button type="button" className={meta.orient === 'portrait' ? 'on' : ''} onClick={() => setM('orient', 'portrait')}>Khổ dọc</button>
              <button type="button" className={meta.orient === 'landscape' ? 'on' : ''} onClick={() => setM('orient', 'landscape')}>Khổ ngang</button>
            </div>}
            <Drop label="Lề & số" title="Lề giấy, dấu phân cách hàng nghìn" wide>
              <div className="te-form">
                {[['top', 'Lề trên'], ['bottom', 'Lề dưới'], ['left', 'Lề trái'], ['right', 'Lề phải']].map(([k, l]) => (
                  <label key={k}>{l} (mm)<input type="number" min="0" max="50" step="1" value={meta.margin[k]} onChange={(e) => setM('margin', { ...meta.margin, [k]: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} /></label>
                ))}
                <label>Phân cách nghìn<select value={meta.sep} onChange={(e) => setM('sep', e.target.value)}><option value=",">24,000,000</option><option value=".">24.000.000</option></select></label>
                <button type="button" className="link-btn small" onClick={() => setM('margin', PAPERS[meta.paper].roll ? { top: 3, right: 3, bottom: 3, left: 3 } : { ...DEFAULT_MARGIN })}>Lề mặc định</button>
              </div>
            </Drop>
          </div>
          {(realErr || unknown.length > 0) && <div className="te-warn">
            {realErr && <div><TriangleAlert size={14} /> {realErr}</div>}
            {unknown.length > 0 && <div><TriangleAlert size={14} /> Không nhận ra: {unknown.map((k) => `{${k}}`).join(', ')} — kiểm tra lại tên thông tin.</div>}
          </div>}
          <div className="te-pv" ref={pvRef}>
            <div className="te-pv-zoom" style={{ zoom: z }}>
              <div className="te-paper te-shadow" style={paperStyle}>
                {rendered.error ? <Note tone="bad">{rendered.error}</Note> : <div className="tpl" dangerouslySetInnerHTML={{ __html: rendered.html }} />}
              </div>
            </div>
          </div>
          <div className="te-zoom">
            <TB icon={ZoomOut} title="Thu nhỏ" onClick={() => setZoom(Math.max(0.3, Math.round((z - 0.1) * 10) / 10))} />
            <button type="button" className="te-btn" onClick={() => setZoom(null)} title="Vừa khung">{Math.round(z * 100)}%</button>
            <TB icon={ZoomIn} title="Phóng to" onClick={() => setZoom(Math.min(2, Math.round((z + 0.1) * 10) / 10))} />
          </div>
        </section>
      </div>

      {slash && items.length > 0 && (
        <div className="te-slash" style={{ left: Math.min(slash.x, window.innerWidth - 330), top: Math.min(slash.y + 4, window.innerHeight - 290) }} onMouseDown={(e) => e.preventDefault()}>
          {items.map((t, i) => (
            <button type="button" key={t.k} className={i === slash.i ? 'on' : ''} onMouseEnter={() => setSlash({ ...slash, i })}
              onClick={() => { insertToken(editor, t.k, { from: slash.from, to: editor.state.selection.from }); setSlash(null); }}>
              <span className={`tk${t.item ? ' tk-item' : ''}`}>{t.label}</span><span className="small muted">{t.gl}</span>
            </button>
          ))}
        </div>
      )}
      {panel && <TokenPanel type={type} onClose={() => setPanel(false)} onInsert={(k) => { setPanel(false); if (source !== null) { setSource((s) => `${s}{${k}}`); } else insertToken(editor, k); }} />}
    </div>
  );
}

// Gợi ý khi gõ "/": lọc theo tên, mã biến (không dấu)
function slashItems(type, query) {
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[_\s]+/g, '');
  const qn = norm(query || '');
  const all = groupsFor(type).flatMap((g) => g.tokens.map((t) => ({ ...t, gl: g.label, item: !!g.item })));
  return (qn ? all.filter((t) => norm(t.label).includes(qn) || norm(t.k).includes(qn)) : all).slice(0, 12);
}
