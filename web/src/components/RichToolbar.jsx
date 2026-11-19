// Thanh công cụ soạn thảo dùng chung (trình sửa mẫu in, trình soạn hợp đồng): phông, cỡ chữ, ảnh, bảng, định dạng, căn lề, danh sách, đoạn văn.
import React, { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Subscript as SubIcon, Superscript as SupIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered,
  Undo2, Redo2, ImagePlus, Table as TableIcon, Minus, Baseline, Highlighter, Copy, Scissors, ClipboardPaste, Grid3x3, RemoveFormatting,
  SeparatorHorizontal, ChevronDown, Plus, Trash2, PaintBucket, TableCellsMerge, TableCellsSplit,
  BetweenHorizontalStart, BetweenHorizontalEnd, BetweenVerticalStart, BetweenVerticalEnd, SquareDashed, Square, Pilcrow,
} from 'lucide-react';
import { FONT_CSS } from '../lib/docs/templates.js';
import { parseStyle } from '../lib/docs/editor-ext.js';

export const FONT_SIZES = [7, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32];
export const LINE_HEIGHTS = ['1', '1.1', '1.2', '1.35', '1.5', '1.75', '2'];

// ---------- Nút thanh công cụ ----------
export function TB({ icon: I, title, on, disabled, onClick, children, className = '' }) {
  return (
    <button type="button" className={`te-btn${on ? ' on' : ''} ${className}`} title={title} aria-label={title} aria-pressed={on ? 'true' : undefined} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {I && <I size={16} strokeWidth={1.9} />}{children}
    </button>
  );
}
// Menu thả xuống nhỏ (bảng, đoạn văn…)
export function Drop({ icon, title, label, children, wide }) {
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
export const MI = ({ icon: I, children, onClick, disabled, danger }) => (
  <button type="button" className={`te-mi${danger ? ' danger' : ''}`} data-close disabled={disabled} onClick={onClick}>{I ? <I size={15} /> : <span style={{ width: 15 }} />}<span>{children}</span></button>
);

// Chọn số dòng × cột khi chèn bảng
export function GridPicker({ onPick }) {
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

// Ảnh chèn vào mẫu: thu nhỏ tối đa 900px, lưu PNG (ảnh trong suốt) hoặc JPEG (ảnh chụp) để PDF đọc được
export async function loadImage(file) {
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

// Hai hàng công cụ. off: tắt khi đang xem mã nguồn; lead / tail1 / tail2: nút riêng của từng trình soạn
export function RichToolbar({ editor, off = false, toast, grid, onGrid, lead = null, tail1 = null, tail2 = null }) {
  const fileRef = useRef(null);
  const inTable = editor.isActive('table');
  const imgSel = editor.isActive('image');
  const ts = editor.getAttributes('textStyle');
  // Cỡ chữ hiện tại: lấy theo định dạng chữ, không có thì đo chữ trên trang
  let curSize = ts.fontSize ? parseFloat(ts.fontSize) * (/px$/.test(ts.fontSize) ? 0.75 : 1) : null;
  if (!curSize) { try { const dom = editor.view.domAtPos(editor.state.selection.from).node; const el = dom.nodeType === 3 ? dom.parentElement : dom; curSize = Math.round(parseFloat(getComputedStyle(el).fontSize) * 0.75 * 2) / 2; } catch (e) { curSize = 10; } }
  if (!Number.isFinite(curSize) || curSize <= 0) curSize = 10;
  const curFont = /tinos|times/i.test(ts.fontFamily || '') ? 'Tinos' : /arimo|arial/i.test(ts.fontFamily || '') ? 'Arimo' : '';
  const ch = () => editor.chain().focus();
  const setSize = (pt) => { const v = Math.max(5, Math.min(72, Math.round(pt * 2) / 2)); ch().setFontSize(`${v}pt`).run(); };
  const pStyle = parseStyle(editor.getAttributes('paragraph').style);
  const tblBorder = editor.getAttributes('table').border !== '0';
  const imgW = imgSel ? parseFloat(parseStyle(editor.getAttributes('image').style).width) || null : null;
  const setImgW = (w) => ch().updateAttributes('image', { style: w ? `width: ${w}px` : null }).run();
  return (
          <div className="te-bar">
            <div className="te-row">
              {lead}
              <select className="te-sel" disabled={off} value={curFont} onChange={(e) => { const v = e.target.value; if (v) ch().setFontFamily(FONT_CSS[v]).run(); else ch().unsetFontFamily().run(); }} aria-label="Phông chữ">
                <option value="">Phông mặc định</option><option value="Arimo">Arial</option><option value="Tinos">Times New Roman</option>
              </select>
              <TB icon={Minus} title="Giảm cỡ chữ" disabled={off} onClick={() => setSize(curSize - (curSize > 12 ? 1 : 0.5))} />
              <select className="te-sel te-size" disabled={off} value={FONT_SIZES.includes(curSize) ? curSize : ''} onChange={(e) => setSize(Number(e.target.value))} aria-label="Cỡ chữ (pt)">
                {!FONT_SIZES.includes(curSize) && <option value="">{curSize}</option>}
                {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <TB icon={Plus} title="Tăng cỡ chữ" disabled={off} onClick={() => setSize(curSize + (curSize >= 12 ? 1 : 0.5))} />
              <span className="te-sep" />
              <TB icon={ImagePlus} title="Chèn ảnh" disabled={off} onClick={() => fileRef.current?.click()} />
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
              {tail1}
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
              <TB icon={Grid3x3} title="Hiện đường lưới của bảng không viền" on={grid} onClick={() => onGrid(!grid)} />
              {tail2}
              {imgSel && <span className="te-imgw">Rộng ảnh <input type="number" min="16" max="800" value={imgW || ''} onChange={(e) => setImgW(Number(e.target.value) || null)} /> px</span>}
            </div>
          </div>
  );
}
