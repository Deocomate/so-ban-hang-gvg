import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useAction } from '../lib/store.jsx';
import { useOpenReceipts } from '../lib/lookups.js';
import { packView } from '../lib/book-profile.js';
import { dmy, money } from '../lib/format.js';
import { saveFile } from '../lib/excel.js';
import { Btn, Loading, ErrorBox, Note, Modal, Field, Input, TextArea, Select, DateInput, NumInput, Check, Section, Tabs, ConfirmBtn } from '../components/ui.jsx';
import { DOC_TYPES, DEFAULT_TEXTS, docSettings, loadDocData, defaults, currentInfo, editableFields, infoRef, profileFor, profileFromBook, PER_DELIVERY, RECONCILE, isCompany, OFFSET_KEY, pendingOffset, offsetDate, HEADER_FIELDS, headerKey, BASE_SIZES, DEFAULT_BASE } from '../lib/docs/model.js';
import { VatReminder, VatReminderPopup } from '../components/VatReminder.jsx';
import { buildPrintDoc, templatesFor, PAPERS, applyExportOpts, EXPORT_SCALES, pageSize } from '../lib/docs/templates.js';
import { openTemplateEditor } from '../lib/docs/editor-link.js';
import { colKey } from '../lib/docs/col-fit.js';
import { sampleData } from '../lib/docs/tokens.js';

import { useDocFonts } from '../lib/docs/fonts.js';
import { TextSizeEditor, withCustomText } from '../components/TextSizeEditor.jsx';
import { SignatureLibrary, SignLayers, SIGN_DRAG } from '../components/Signatures.jsx';

// Thẻ xếp theo trình tự công việc: bán hàng → đóng & giao hàng → đối chiếu sau giao
const TYPES_FOR = { quote: ['bao_gia'], contract: ['de_nghi_tam_ung', 'doi_chieu_sl', 'doi_chieu_tt', 'de_nghi_tt'],
  order: ['hoa_don', 'don_dat_hang', 'yeu_cau_vat', 'phieu_dong_hang', 'bien_ban', 'phieu_xuat_kho', 'hd_van_chuyen', 'cn_xuat_xuong', 'doi_chieu_tt', 'doi_chieu_sl'],
  delivery: ['hoa_don', 'don_dat_hang', 'yeu_cau_vat', 'phieu_dong_hang', 'bien_ban', 'phieu_xuat_kho', 'hd_van_chuyen', 'cn_xuat_xuong'], payment: ['phieu_thu'],
  invoices: ['doi_chieu_tt', 'doi_chieu_sl'] };
// Giai đoạn của từng loại chứng từ: thẻ khác giai đoạn được tách bằng một vạch ngăn
const TAB_STAGE = { hoa_don: 'ban', don_dat_hang: 'ban', yeu_cau_vat: 'ban', bao_gia: 'ban', phieu_thu: 'thu', phieu_dong_hang: 'giao', bien_ban: 'giao', phieu_xuat_kho: 'giao', hd_van_chuyen: 'giao',
  cn_xuat_xuong: 'giao', doi_chieu_tt: 'doi_chieu', doi_chieu_sl: 'doi_chieu', de_nghi_tam_ung: 'hop_dong', de_nghi_tt: 'hop_dong' };
const STAGE_LABEL = { ban: 'Bán hàng', thu: 'Sổ quỹ', giao: 'Đóng & giao hàng', doi_chieu: 'Đối chiếu sau giao hàng', hop_dong: 'Hợp đồng' };
// Chứng từ không lập theo một đơn / phiếu giao (không đổi được "Lập theo")
const STANDALONE = ['payment', 'contract', 'quote', 'invoices'];

// ---------- Bản xem trước: vẽ từ chính tệp PDF sẽ tải / in, nên chia trang và xuống dòng giống hệt đầu ra ----------
// "PDF / In": từng trang theo khổ giấy; "Ảnh": cả chứng từ trên một trang dài như khi Tải ảnh.
// opts / setOpt (tùy chọn xuất): có thì kéo được đường kẻ giữa hai cột của bảng có viền để chỉnh độ rộng cột
const PREVIEW_KEY = 'gomsu.preview_mode';
const ZOOM_KEY = 'gomsu.preview_zoom';
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
// Bề rộng trang trên màn hình: khổ thật (pt → px) nhân tỷ lệ; vừa khung thì không vượt bề rộng khung xem
function applyZoom(el, zoom) {
  const px = Number(el.dataset.px) || 794;
  el.style.width = `${zoom === 'fit' ? px : px * zoom}px`; el.style.maxWidth = zoom === 'fit' ? '100%' : 'none';
}
// extra: nút thêm ở thanh trên của bản xem trước
// signs / onSign / onDropSign: chữ ký đặt trên trang (chỉ ở chế độ PDF / In) — sửa vị trí, bỏ, thả mẫu chữ ký mới vào trang
export function DocPreview({ doc, opts, setOpt, extra, signs, onSign, onDropSign }) {
  useDocFonts(); // phông dùng khi đo độ rộng cột
  const [mode, setModeState] = useState(() => { try { return localStorage.getItem(PREVIEW_KEY) === 'image' ? 'image' : 'pdf'; } catch (e) { return 'pdf'; } });
  const setMode = (v) => { setModeState(v); try { localStorage.setItem(PREVIEW_KEY, v); } catch (e) { /* bỏ qua */ } };
  const boxRef = React.useRef(null); const zoomRef = React.useRef('fit'); const geo = React.useRef({ tables: [] });
  const [st, setSt] = useState({ busy: true, error: null, pages: 0 });
  // Thu phóng: 'fit' = vừa khung (không to hơn khổ thật), số = tỷ lệ so với khổ thật
  const [zoom, setZoomState] = useState(() => { try { const v = Number(localStorage.getItem(ZOOM_KEY)); return ZOOMS.includes(v) ? v : 'fit'; } catch (e) { return 'fit'; } });
  const setZoom = (v) => { setZoomState(v); try { localStorage.setItem(ZOOM_KEY, String(v)); } catch (e) { /* bỏ qua */ } };
  const zi = zoom === 'fit' ? -1 : ZOOMS.indexOf(zoom);
  const stepZoom = (d) => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (zi < 0 ? ZOOMS.indexOf(1) : zi) + d))]);
  const [sheets, setSheets] = useState([]); // { el, page, wPt } của các trang đang hiện — để gắn lớp chữ ký
  useEffect(() => {
    let alive = true; setSt((s) => ({ ...s, busy: true, error: null }));
    // Chờ người dùng gõ xong một chút rồi mới dựng lại tệp
    const timer = setTimeout(async () => {
      try {
        const [{ pdfPreview }, { pdfPages }] = await Promise.all([import('../lib/docs/pdf.js'), import('../lib/docs/image.js')]);
        const { blob, tables } = await pdfPreview(doc, { onePage: mode === 'image' });
        const canvases = await pdfPages(blob, () => 2);
        if (!alive || !boxRef.current) return;
        const sheets = canvases.map((c, i) => {
          const w = document.createElement('div'); w.className = 'pdf-sheet'; w.dataset.page = String(i + 1);
          w.dataset.px = String((Number(c.dataset.w) * 4) / 3); if (canvases.length > 1) w.dataset.label = `Trang ${i + 1} / ${canvases.length}`;
          c.className = 'pdf-sheet-canvas'; c.setAttribute('aria-label', `Trang ${i + 1}`);
          w.appendChild(c); return w;
        });
        for (const w of sheets) applyZoom(w, zoomRef.current);
        boxRef.current.replaceChildren(...sheets);
        setSheets(sheets.map((el, i) => ({ el, page: i + 1, wPt: Number(canvases[i].dataset.w) })));
        geo.current = { tables };
        setSt({ busy: false, error: null, pages: canvases.length });
      } catch (e) { if (alive) setSt({ busy: false, error: e.message, pages: 0 }); }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [doc, mode]);
  zoomRef.current = zoom;
  useEffect(() => { for (const sh of sheets) applyZoom(sh.el, zoom); }, [sheets, zoom]);
  // Lưu độ rộng (tỷ lệ) của bảng thứ ti cho loại chứng từ + mẫu + hướng giấy đang xem
  const saveRef = React.useRef(null);
  saveRef.current = (ti, ws) => {
    const key = colKey(doc); const total = ws.reduce((a, b) => a + b, 0); const all = opts?.cols || {};
    setOpt('cols', { ...all, [key]: { ...(all[key] || {}), [ti]: { n: ws.length, w: ws.map((w) => Math.round((w / total) * 10000) / 10000) } } });
  };
  useColumnDrag(!!setOpt, boxRef, geo, saveRef);
  return (
    <div className="doc-preview">
      <div className="doc-preview-bar">
        <div className="seg" role="group" aria-label="Xem như">
          <button type="button" className={mode === 'pdf' ? 'on' : ''} onClick={() => setMode('pdf')} title="Từng trang theo khổ giấy, giống tệp PDF và bản in">PDF / In</button>
          <button type="button" className={mode === 'image' ? 'on' : ''} onClick={() => setMode('image')} title="Cả chứng từ trên một trang dài, giống ảnh khi bấm Tải ảnh">Ảnh</button>
        </div>
        <div className="zoom-ctl" role="group" aria-label="Thu phóng">
          <button type="button" className="icon-btn" onClick={() => stepZoom(-1)} disabled={zi === 0} aria-label="Thu nhỏ" title="Thu nhỏ">−</button>
          <button type="button" className="zoom-val" onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')} title={zoom === 'fit' ? 'Xem đúng khổ thật (100%)' : 'Vừa khung xem'}>{zoom === 'fit' ? 'Vừa khung' : `${Math.round(zoom * 100)}%`}</button>
          <button type="button" className="icon-btn" onClick={() => stepZoom(1)} disabled={zi === ZOOMS.length - 1} aria-label="Phóng to" title="Phóng to">+</button>
        </div>
        <span className="muted small doc-preview-status">{st.busy ? <><span className="spin-dot" aria-hidden="true" />Đang dựng…</> : mode === 'image' ? 'Một trang dài' : `${st.pages} trang`}</span>
        {extra && <><span className="grow" />{extra}</>}
      </div>
      {st.error && <ErrorBox error={'Không xem trước được: ' + st.error} />}
      <div className={`doc-scroll pdf-sheets${zoom === 'fit' ? '' : ' is-zoomed'}${st.busy ? ' is-busy' : ''}${setOpt ? ' doc-resizable' : ''}`} ref={boxRef}
        onDragOver={(e) => { if (onDropSign && mode === 'pdf' && e.dataTransfer.types.includes(SIGN_DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(SIGN_DRAG); const el = e.target.closest?.('.pdf-sheet');
          if (!id || !el || !onDropSign || mode !== 'pdf') return;
          e.preventDefault();
          const sh = sheets.find((x) => x.el === el); if (!sh) return;
          const r = el.getBoundingClientRect(); const k = r.width / sh.wPt;
          onDropSign(id, sh.page, (e.clientX - r.left) / k, (e.clientY - r.top) / k);
        }} />
      {signs && mode === 'pdf' && !st.busy && <SignLayers sheets={sheets} signs={signs} onChange={onSign} />}
      {signs?.length > 0 && mode !== 'pdf' && <div className="muted small">Chữ ký đã đặt có trong ảnh tải về; chuyển sang "PDF / In" để dời hoặc bỏ chữ ký.</div>}
    </div>
  );
}

// Kéo đường kẻ dọc giữa hai cột của bảng trên trang PDF: hai cột kề nhau đổi độ rộng cho nhau (tổng bảng giữ nguyên);
// thả chuột thì lưu và dựng lại tệp với độ rộng mới. Vị trí bảng (pt) lấy từ pdfPreview().
const MIN_COL_PT = 12;
function useColumnDrag(on, boxRef, geo, saveRef) {
  useEffect(() => {
    const box = boxRef.current; if (!on || !box) return undefined;
    let drag = null; let guide = null;
    const showGuide = (sheet, xPt, band, k) => {
      if (!guide) { guide = document.createElement('div'); guide.className = 'col-guide'; }
      if (guide.parentNode !== sheet) sheet.appendChild(guide);
      guide.hidden = false;
      guide.style.left = `${xPt * k - 1}px`; guide.style.top = `${band.top * k}px`; guide.style.height = `${(band.bottom - band.top) * k}px`;
    };
    const hideGuide = () => { if (guide) guide.hidden = true; };
    // Đường kẻ cột gần con trỏ trên trang đang trỏ
    const find = (e, tol) => {
      const sheet = e.target.closest?.('.pdf-sheet'); if (!sheet || !box.contains(sheet)) return null;
      const c = sheet.querySelector('canvas'); const r = c.getBoundingClientRect(); const k = r.width / Number(c.dataset.w);
      const page = Number(sheet.dataset.page); const x = (e.clientX - r.left) / k; const y = (e.clientY - r.top) / k;
      for (const [ti, t] of geo.current.tables.entries()) {
        const band = t.pages?.[page];
        if (!t.cols || t.cols.length < 2 || !band || y < band.top - 4 || y > band.bottom + 4) continue;
        let b = t.left;
        for (let i = 0; i < t.cols.length - 1; i++) { b += t.cols[i]; if (Math.abs(x - b) * k <= tol) return { ti, t, i, b, band, k, sheet }; }
      }
      return null;
    };
    const move = (e) => {
      if (drag) {
        const { t, i, b, band, k, sheet } = drag; const pair = t.cols[i] + t.cols[i + 1];
        drag.a = Math.min(pair - MIN_COL_PT, Math.max(MIN_COL_PT, t.cols[i] + (e.clientX - drag.x0) / k));
        showGuide(sheet, b + drag.a - t.cols[i], band, k); return;
      }
      const h = find(e, 5);
      box.style.cursor = h ? 'col-resize' : '';
      if (h) showGuide(h.sheet, h.b, h.band, h.k); else hideGuide();
    };
    const down = (e) => {
      if (e.button !== 0) return;
      const h = find(e, e.pointerType === 'touch' ? 12 : 5); if (!h) return;
      e.preventDefault(); drag = { ...h, x0: e.clientX, a: h.t.cols[h.i] };
      try { box.setPointerCapture(e.pointerId); } catch (x) { /* bỏ qua */ }
      showGuide(h.sheet, h.b, h.band, h.k);
    };
    const up = () => {
      if (!drag) return;
      const { ti, t, i, a } = drag; drag = null;
      const ws = [...t.cols]; const pair = ws[i] + ws[i + 1]; ws[i] = a; ws[i + 1] = pair - a;
      if (Math.abs(a - t.cols[i]) >= 0.5) saveRef.current(ti, ws); else hideGuide();
    };
    const leave = () => { if (!drag) { box.style.cursor = ''; hideGuide(); } };
    box.addEventListener('pointermove', move); box.addEventListener('pointerdown', down);
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up); box.addEventListener('pointerleave', leave);
    return () => {
      box.removeEventListener('pointermove', move); box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); box.removeEventListener('pointerleave', leave);
    };
  }, [on]);
}

// ---------- Tùy chọn xuất: hướng giấy + cỡ chữ tổng thể + độ rộng cột đã kéo (nhớ trên máy này, áp cho xem trước, In, Tải PDF / ảnh) ----------
const OPTS_KEY = 'gomsu.export_opts';
export function useExportOpts() {
  const [opts, setOpts] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(OPTS_KEY) || 'null');
      return { orient: v?.orient || '', scale: EXPORT_SCALES.includes(v?.scale) ? v.scale : 1, cols: v?.cols && typeof v.cols === 'object' ? v.cols : {} };
    } catch (e) { return { orient: '', scale: 1, cols: {} }; }
  });
  const set = (k, v) => setOpts((s) => { const n = { ...s, [k]: v }; try { localStorage.setItem(OPTS_KEY, JSON.stringify(n)); } catch (e) { /* bỏ qua */ } return n; });
  return [opts, set];
}
// doc: chứng từ đang xem — có bảng có viền thì hiện cách chỉnh độ rộng cột và nút dùng lại độ rộng tự động
export function ExportOpts({ opts, set, roll, doc }) {
  const hasTable = !!doc && !doc.error && String(doc.html || '').includes('data-border="1"');
  const key = hasTable ? colKey(doc) : null; const custom = !!(key && opts.cols?.[key]);
  return (
    <div className="stack-s">
      <Field label="Hướng giấy khi xuất">
        <Select value={roll ? '' : opts.orient} disabled={roll} onChange={(v) => set('orient', v)}
          options={[{ value: '', label: roll ? 'Giấy cuộn (theo mẫu)' : 'Theo mẫu in' }, { value: 'portrait', label: 'Khổ dọc' }, { value: 'landscape', label: 'Khổ ngang' }]} />
      </Field>
      <Field label="Cỡ chữ tổng thể">
        <Select value={String(opts.scale)} onChange={(v) => set('scale', Number(v))}
          options={EXPORT_SCALES.map((k) => ({ value: String(k), label: k === 1 ? '100% (theo mẫu)' : `${Math.round(k * 100)}%` }))} />
      </Field>
      {hasTable && <div className="muted small">
        Độ rộng cột: <b>{custom ? 'đã chỉnh tay' : 'tự động theo nội dung'}</b>. Kéo đường kẻ dọc giữa hai cột trên bản xem trước để chỉnh (nhớ riêng khổ dọc / khổ ngang).
        {custom && <> <button className="link-btn small" onClick={() => { const rest = { ...opts.cols }; delete rest[key]; set('cols', rest); }}>Dùng lại độ rộng tự động</button></>}
      </div>}
    </div>
  );
}

// ---------- Mở chứng từ ở tab mới (trang riêng, không có menu) ----------
// ?doc=<kind>:<id>&type=<loại>&pay=<phiếu thu kèm>&book=<sổ>
export function docPageUrl({ book, kind, id, type, pay }) {
  const u = new URLSearchParams({ doc: `${kind}:${id}` });
  if (type) u.set('type', type);
  if (pay) u.set('pay', pay);
  if (book) u.set('book', book);
  return `${location.pathname}?${u.toString()}`;
}
export function readDocPage() {
  try {
    const u = new URLSearchParams(location.search); const [kind, id] = String(u.get('doc') || '').split(':');
    return kind && id && TYPES_FOR[kind] && kind !== 'invoices' ? { kind, id, type: u.get('type') || undefined, pay: u.get('pay') || undefined, book: u.get('book') || undefined } : null;
  } catch (e) { return null; }
}
// Mở sẵn tab trống ngay lúc bấm (trình duyệt chỉ cho mở tab mới trong lúc người dùng bấm),
// lưu xong thì chuyển tab đó tới chứng từ; lỗi thì đóng lại. Bị chặn popup thì trả về null.
export function reserveTab() {
  let w = null;
  try { w = window.open('', '_blank'); } catch (e) { w = null; }
  if (w) { try { w.document.title = 'Đang lập chứng từ…'; w.document.body.innerHTML = '<p style="font:15px sans-serif;padding:24px;color:#555">Đang lập chứng từ…</p>'; } catch (e) { /* bỏ qua */ } }
  return {
    go(params) { if (w && !w.closed) { w.location.href = docPageUrl(params); return true; } return false; },
    cancel() { try { if (w && !w.closed) w.close(); } catch (e) { /* bỏ qua */ } },
  };
}

// Trang chứng từ đứng riêng ở tab mới: chọn đúng sổ rồi hiện khung sửa + xem trước + tải PDF
export function DocStandalone({ link }) {
  const { books, book, setBookId, toasts, bootError } = useApp();
  useEffect(() => { if (link.book && books?.some((b) => b.id === link.book) && book?.id !== link.book) setBookId(link.book); }, [books, link.book]);
  if (bootError) return <div className="center-screen"><Note tone="warn">{bootError}</Note></div>;
  if (!books || !book || (link.book && books.some((b) => b.id === link.book) && book.id !== link.book)) return <div className="center-screen"><Loading text="Đang mở chứng từ…" /></div>;
  return (
    <>
      <DocDialog key={book.id} page kind={link.kind} id={link.id} type={link.type} pay={link.pay} onClose={() => { window.close(); }} />
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast${t.kind === 'err' ? ' err' : ''}`}><span>{t.text}</span></div>)}</div>
    </>
  );
}

// ---------- Chọn chứng từ của một đợt giao để tải cùng lúc ----------
// Sau khi giao: hợp đồng vận chuyển, hóa đơn bán hàng, biên bản giao hàng (và phiếu thu nếu thu luôn) — chọn 1 hoặc nhiều,
// gộp vào một tệp PDF (mỗi chứng từ một trang mới) hoặc tải từng tệp. Dùng thông tin đã lưu của từng chứng từ.
// Khách là công ty: thêm phiếu yêu cầu xuất hóa đơn VAT để gửi kế toán.
const BATCH_TYPES = [['phieu_dong_hang', 'Phiếu đóng hàng'], ['hd_van_chuyen', 'Hợp đồng vận chuyển'], ['hoa_don', 'Hóa đơn bán hàng'], ['bien_ban', 'Biên bản giao hàng']];
// Chưa từng chọn thì tích sẵn mọi chứng từ, trừ phiếu đóng hàng (chỉ cho kho, không gửi khách)
const BATCH_OFF = ['phieu_dong_hang'];
const BATCH_KEY = 'gomsu.doc_batch';
function readBatch() { try { const v = JSON.parse(localStorage.getItem(BATCH_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
function BatchExport({ deliveryId, pay, ds, beforeExport, company, onDone, xopts }) {
  const { q, rpc, settings, toast, can } = useApp();
  const opts = [...BATCH_TYPES, ...(company ? [['yeu_cau_vat', 'Phiếu yêu cầu xuất hóa đơn VAT']] : []), ...(pay ? [['phieu_thu', 'Phiếu thu']] : [])];
  const saved = readBatch();
  const [pick, setPick] = useState(() => Object.fromEntries(opts.map(([t]) => [t, saved?.pick?.[t] ?? !BATCH_OFF.includes(t)])));
  const [merge, setMerge] = useState(saved?.merge ?? true);
  const [busy, setBusy] = useState(false); const [imgBusy, setImgBusy] = useState(false);
  const chosen = opts.filter(([t]) => pick[t]).map(([t]) => t);
  const load = async (src) => { const d = await loadDocData(q, rpc, src); return { ...d, prods: Object.fromEntries(Object.entries(d.prods || {}).map(([k, p]) => [k, packView(p, settings)])) }; };
  const run = async (asImage) => {
    if (!chosen.length) return;
    try { localStorage.setItem(BATCH_KEY, JSON.stringify({ pick, merge })); } catch (e) { /* bỏ qua */ }
    (asImage ? setImgBusy : setBusy)(true);
    try {
      if (beforeExport && !(await beforeExport())) return;
      const [dd, pd] = await Promise.all([load({ kind: 'delivery', id: deliveryId }), pay && chosen.includes('phieu_thu') ? load({ kind: 'payment', id: pay }) : null]);
      const docs = chosen.map((t) => { const data = t === 'phieu_thu' ? pd : dd; return applyExportOpts(buildPrintDoc(t, data, ds, { ...defaults(t, data, ds), ...(currentInfo(t, data) || {}) }), xopts); });
      const { pdfBlob, printDocs } = await import('../lib/docs/pdf.js');
      if (asImage === 'print') { await printDocs(docs); onDone?.(chosen); return; }
      const { pdfToImageBlob } = asImage ? await import('../lib/docs/image.js') : {};
      const out = async (list) => { const b = await pdfBlob(list, { onePage: !!asImage }); return asImage ? pdfToImageBlob(b) : b; };
      const ext = asImage ? 'png' : 'pdf'; const what = asImage ? 'ảnh' : 'tệp PDF';
      if (merge && docs.length > 1) {
        const name = `chung-tu-giao-hang_${dd.d.code}.${ext}`;
        if (await saveFile(name, await out(docs))) toast(`Đã tạo ${name} (${docs.length} chứng từ)`);
      } else {
        for (const doc of docs) await saveFile(doc.filename.replace(/\.pdf$/i, '.' + ext), await out(doc));
        toast(`Đã tạo ${docs.length} ${what}`);
      }
      onDone?.(chosen);
    } catch (e) { toast(`Không ${asImage === 'print' ? 'in được' : `tạo được ${asImage ? 'ảnh' : 'PDF'}`}: ` + e.message, 'err'); } finally { setBusy(false); setImgBusy(false); }
  };
  return (
    <div className="card doc-batch">
      <b>Xuất chứng từ giao hàng</b>
      <div className="small muted">Chọn chứng từ cần in (1 hoặc nhiều). Sửa thông tin từng loại ở các thẻ bên trên trước khi tải.</div>
      <div className="doc-batch-list">
        {opts.map(([t, label]) => <Check key={t} checked={!!pick[t]} onChange={(v) => setPick((s) => ({ ...s, [t]: v }))}>{label}</Check>)}
      </div>
      {chosen.length > 1 && <Check checked={merge} onChange={setMerge}>Gộp vào một tệp (PDF / ảnh)</Check>}
      <div className="row">
        <Btn kind="primary" icon="dl" busy={busy} disabled={!chosen.length || imgBusy} onClick={() => run(false)}>
          {chosen.length ? `Tải ${chosen.length} chứng từ` : 'Chọn chứng từ'}</Btn>
        <Btn icon="print" disabled={!chosen.length || busy || imgBusy} onClick={() => run('print')}>In</Btn>
        {can('owner') && <Btn icon="dl" busy={imgBusy} disabled={!chosen.length || busy} onClick={() => run(true)}>Tải ảnh</Btn>}
      </div>
    </div>
  );
}

// ---------- Bộ hồ sơ đối chiếu sau nhiều đợt giao ----------
// Giống tệp gửi khách: bảng đối chiếu công nợ, bảng đối chiếu số lượng, rồi biên bản bàn giao của từng đợt (theo ngày giao).
// Chọn phần cần in, gộp một tệp PDF hoặc tải từng tệp. Dùng thông tin đã lưu của từng chứng từ.
const PACK_KEY = 'gomsu.reconcile_pack';
function ReconcilePack({ src, dels, ds, beforeExport, xopts }) {
  const { q, rpc, settings, toast } = useApp();
  const list = [...dels].sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date)) || String(a.code).localeCompare(String(b.code)));
  const saved = (() => { try { return JSON.parse(localStorage.getItem(PACK_KEY) || 'null') || {}; } catch (e) { return {}; } })();
  const [pick, setPick] = useState({ doi_chieu_tt: saved.doi_chieu_tt ?? true, doi_chieu_sl: saved.doi_chieu_sl ?? true, bien_ban: saved.bien_ban ?? true });
  const [merge, setMerge] = useState(saved.merge ?? true);
  const [busy, setBusy] = useState(false);
  const opts = [['doi_chieu_tt', 'Bảng đối chiếu công nợ'], ['doi_chieu_sl', 'Bảng đối chiếu số lượng giao hàng'], ['bien_ban', `Biên bản bàn giao (${list.length} đợt)`]];
  const count = (pick.doi_chieu_tt ? 1 : 0) + (pick.doi_chieu_sl ? 1 : 0) + (pick.bien_ban ? list.length : 0);
  const load = async (s) => { const d = await loadDocData(q, rpc, s); return { ...d, prods: Object.fromEntries(Object.entries(d.prods || {}).map(([k, p]) => [k, packView(p, settings)])) }; };
  const build = (t, d) => applyExportOpts(buildPrintDoc(t, d, ds, { ...defaults(t, d, ds), ...(currentInfo(t, d) || {}) }), xopts);
  const run = async (print) => {
    if (!count) return;
    try { localStorage.setItem(PACK_KEY, JSON.stringify({ ...pick, merge })); } catch (e) { /* bỏ qua */ }
    setBusy(true);
    try {
      if (beforeExport && !(await beforeExport())) return;
      const main = await load(src);
      const docs = RECONCILE.slice().reverse().filter((t) => pick[t]).map((t) => build(t, main));
      if (pick.bien_ban) for (const d of await Promise.all(list.map((x) => load({ kind: 'delivery', id: x.id })))) docs.push(build('bien_ban', d));
      const { pdfBlob, printDocs } = await import('../lib/docs/pdf.js');
      if (print) { await printDocs(docs); return; }
      const code = String(main.k?.code || main.o.code).replace(/[\/:*?"<>|]+/g, '-');
      if (merge && docs.length > 1) {
        const name = `ho-so-doi-chieu-giao-hang_${code}.pdf`;
        if (await saveFile(name, await pdfBlob(docs))) toast(`Đã tạo ${name} (${docs.length} trang chứng từ)`);
      } else {
        for (const doc of docs) await saveFile(doc.filename, await pdfBlob(doc));
        toast(`Đã tạo ${docs.length} tệp PDF`);
      }
    } catch (e) { toast(`Không ${print ? 'in được' : 'tạo được PDF'}: ` + e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="card doc-batch">
      <b>Bộ hồ sơ đối chiếu & giao hàng</b>
      <div className="small muted">Gửi khách sau khi giao xong: đối chiếu công nợ, đối chiếu số lượng và biên bản từng đợt giao.</div>
      <div className="doc-batch-list">
        {opts.map(([t, label]) => <Check key={t} checked={!!pick[t]} onChange={(v) => setPick((s) => ({ ...s, [t]: v }))}>{label}</Check>)}
      </div>
      {count > 1 && <Check checked={merge} onChange={setMerge}>Gộp vào một tệp PDF</Check>}
      <div className="row">
        <Btn kind="primary" icon="dl" busy={busy} disabled={!count} onClick={() => run(false)}>{count ? `Tải bộ hồ sơ (${count})` : 'Chọn chứng từ'}</Btn>
        <Btn icon="print" disabled={!count || busy} onClick={() => run(true)}>In</Btn>
      </div>
    </div>
  );
}

// ---------- Đầu trang (header) sửa riêng cho chứng từ này ----------
// Mỗi lần xuất có thể cần đầu trang khác (địa chỉ chi nhánh, SĐT người phụ trách…): sửa ở đây, lưu theo chứng từ, không đổi cài đặt đơn vị.
function HeaderEditor({ type, prof, info, setEdit }) {
  const keys = [...HEADER_FIELDS.map(([k]) => k), 'logo'];
  const changed = keys.filter((k) => info[headerKey(type, k)]).length;
  const set = (k, v) => setEdit((s) => ({ ...s, [headerKey(type, k)]: v }));
  return (
    <SideGroup title="Đầu trang (header)" badge={changed ? `đã sửa ${changed}` : null}>
        <div className="muted small">Chỉ đổi đầu trang của chứng từ này. Để trống = theo đơn vị phát hành; gõ dấu "-" để bỏ dòng đó.</div>
        {HEADER_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}><Input value={info[headerKey(type, k)] || ''} placeholder={prof[k] || '(trống)'} onChange={(v) => set(k, k === 'name' ? v.toUpperCase() : v)} maxLength={500} /></Field>
        ))}
        {prof.logo && <Check checked={info[headerKey(type, 'logo')] === '-'} onChange={(v) => set('logo', v ? '-' : '')}>Không in logo</Check>}
        {changed > 0 && <button className="link-btn small" onClick={() => setEdit((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [headerKey(type, k), ''])) }))}>Dùng lại đầu trang theo đơn vị phát hành</button>}
    </SideGroup>
  );
}

// Một nhóm thu gọn được ở cột tùy chọn bên trái của hộp thoại in
// Biên bản đối chiếu của một đơn: phiếu thu của khách còn phần chưa phân bổ (phiếu chỉ gắn với khách) đến hết ngày chốt.
// Chọn phiếu và số tiền để phân bổ vào đơn — lưu vào chính phiếu thu đó; biên bản chỉ tính phần đã phân bổ cho đơn này.
function ReceiptAlloc({ order, cutoff, canPay, onDone }) {
  const open = useOpenReceipts(order.customer_id, canPay);
  const list = open.filter((p) => !cutoff || p.pay_date <= cutoff);
  const later = open.length - list.length;
  const { run, busy } = useAction();
  const [amt, setAmt] = useState({});
  if (!canPay || !open.length) return null;
  const give = async (p) => {
    const amount = amt[p.id] ?? p.unallocated;
    const r = await run('allocate_receipt', { order_id: order.id, payment_id: p.id, amount }, `Đã phân bổ ${money(amount)} đ của phiếu ${p.code} vào đơn ${order.code}`);
    if (r) { setAmt((s) => { const n = { ...s }; delete n[p.id]; return n; }); onDone(); }
  };
  return (
    <SideGroup title="Phiếu thu chưa phân bổ vào đơn" open badge={list.length ? String(list.length) : null}>
      <div className="muted small">Phiếu thu của {order.customer_name} chưa gắn với đơn nào. Biên bản chỉ tính phần đã phân bổ cho đơn {order.code}.</div>
      {list.map((p) => (
        <div key={p.id} className="stack-s" style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          <div className="small"><b>{p.code}</b> · {dmy(p.pay_date)} · phiếu {money(p.amount)} đ{p.note ? ` · ${p.note}` : ''}</div>
          <div className="row gap-s">
            <NumInput value={amt[p.id] ?? p.unallocated} onChange={(v) => setAmt((s) => ({ ...s, [p.id]: v }))} min={0} max={p.unallocated} aria-label={`Số tiền phân bổ từ phiếu ${p.code}`} />
            <Btn small kind="primary" busy={busy} disabled={!(Number(amt[p.id] ?? p.unallocated) > 0) || Number(amt[p.id] ?? p.unallocated) > p.unallocated} onClick={() => give(p)}>Phân bổ vào đơn</Btn>
          </div>
        </div>
      ))}
      {!list.length && <div className="small">Không có phiếu nào đến ngày chốt.</div>}
      {later > 0 && <div className="muted small">{later} phiếu nhận sau ngày chốt không tính vào biên bản này.</div>}
    </SideGroup>
  );
}

function SideGroup({ title, badge, open = false, children }) {
  return (
    <details className="doc-group" open={open}>
      <summary><span className="grow">{title}</span>{badge && <span className="doc-group-badge">{badge}</span>}</summary>
      <div className="doc-group-body">{children}</div>
    </details>
  );
}

// ---------- Hộp thoại xuất chứng từ ----------
// pay: phiếu thu lập cùng lúc với đợt giao (giao + thu) → thêm thẻ "Phiếu thu" vào cùng hộp thoại.
// page: hiện toàn trang (tab mới) thay cho hộp thoại.
// Chọn lái xe có sẵn (tự điền SĐT, biển số, CCCD); vẫn gõ tay được nếu người vận chuyển chưa có trong danh sách
function DriverPick({ value, drivers, onPick, onText }) {
  const hit = drivers.find((d) => d.name === value);
  return (
    <div className="stack" style={{ gap: 6 }}>
      {drivers.length > 0 && <Select value={hit ? hit.id : ''} onChange={(id) => { const d = drivers.find((x) => x.id === id); if (d) onPick(d); }}
        options={[{ value: '', label: '— Chọn lái xe —' }, ...drivers.map((d) => ({ value: d.id, label: `${d.name}${d.plate ? ` · ${d.plate}` : ''}` }))]} />}
      <Input value={value} onChange={onText} maxLength={500} placeholder="Hoặc gõ tên" />
    </div>
  );
}

// kind 'invoices': bảng đối chiếu gộp các hóa đơn keys của khách id
export function DocDialog({ kind, id, keys, type: type0, pay, page, onClose }) {
  const { q, rpc, book, settings, can, toast } = useApp();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const withPay = !!pay && kind !== 'payment';
  const types = withPay ? ['phieu_thu', ...TYPES_FOR[kind]] : TYPES_FOR[kind];
  const [type, setType] = useState(type0 && types.includes(type0) ? type0 : types[0]);
  const [src, setSrc] = useState(withPay && (type0 ? type0 === 'phieu_thu' : true) ? { kind: 'payment', id: pay } : { kind, id, keys });
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  const [edit, setEdit] = useState({}); const [busy, setBusy] = useState(false); const [reload, setReload] = useState(0);
  const [drivers, setDrivers] = useState([]);   // lái xe khai ở module vận chuyển, để chọn thay vì gõ tay
  useEffect(() => { q('drivers', [], 'name').then((r) => setDrivers((r || []).filter((x) => x.active !== 0 && x.active !== false))).catch(() => {}); }, []);
  const [remindVat, setRemindVat] = useState(false);   // hộp nhắc xuất hóa đơn VAT sau khi in biên bản giao hàng
  // Mẫu in chọn cho từng loại chứng từ (nhớ lần chọn trước trên máy này)
  const [tplPick, setTplPick] = useState(() => { try { return JSON.parse(localStorage.getItem('gomsu.tpl_pick') || '{}') || {}; } catch (e) { return {}; } });
  const pickTpl = (t, v) => setTplPick((s) => { const n = { ...s, [t]: v }; try { localStorage.setItem('gomsu.tpl_pick', JSON.stringify(n)); } catch (e) { /* bỏ qua */ } return n; });
  const [opts, setOpt] = useExportOpts();
  const srcKey = `${src.kind}:${src.id}`;
  useEffect(() => {
    let alive = true; setErr(null);
    loadDocData(q, rpc, src).then((d) => alive && setData({ ...d, srcKey, prods: Object.fromEntries(Object.entries(d.prods || {}).map(([id, p]) => [id, packView(p, settings)])) })).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [src.kind, src.id, reload]);
  // Biên bản / phiếu xuất kho theo từng lần giao; hóa đơn / đơn đặt hàng theo cả đơn
  const perDelivery = PER_DELIVERY.includes(type);
  useEffect(() => {
    // Thẻ Phiếu thu đọc phiếu thu; các thẻ còn lại quay về đợt giao / đơn ban đầu
    if (withPay && type === 'phieu_thu') { if (src.kind !== 'payment') setSrc({ kind: 'payment', id: pay }); return; }
    if (withPay && src.kind === 'payment') { setSrc({ kind, id }); return; }
    if (!data || data.srcKey !== srcKey || STANDALONE.includes(data.kind)) return;
    if (!perDelivery && src.kind === 'delivery') setSrc({ kind: 'order', id: data.o.id });
  }, [type, data]);
  useEffect(() => { setEdit({}); }, [type, src.kind, src.id]);

  // Đề nghị thanh toán chỉ lập sau khi đã hoàn tất đối chiếu
  const company = !!data?.o && data.kind !== 'invoices' && isCompany(data.cust, settings);
  // Bảng đối chiếu chỉ lập khi đơn đã có ít nhất một đợt giao
  const delivered = (data?.dels || []).length > 0;
  const tabTypes = types.filter((t) => (t !== 'de_nghi_tt' || data?.k?.reconciled_at) && (t !== 'yeu_cau_vat' || company) && (!RECONCILE.includes(t) || ['contract', 'invoices'].includes(data?.kind) || delivered));
  // In / tải xong biên bản giao hàng của khách công ty → nhắc bước xuất hóa đơn VAT
  const afterExport = (done) => { if (company && done.includes('bien_ban')) setRemindVat(true); };
  // Chỉ dựng khi dữ liệu đã nạp khớp với thẻ đang chọn (đổi thẻ Phiếu thu ↔ Biên bản phải chờ nạp lại)
  const ready = data && data.srcKey === srcKey && (type === 'phieu_thu') === (data.kind === 'payment')
    && (STANDALONE.includes(data.kind) || !(perDelivery ? false : src.kind === 'delivery'));
  const saved = ready ? currentInfo(type, data) || {} : {};
  const info = ready ? { ...defaults(type, data, ds), ...saved, ...edit } : null;
  const fields = ready ? editableFields(type, data, info) : [];
  // Chữ ký đặt trên chứng từ (signs_<loại>): không đưa vào phần dựng nội dung để dời chữ ký không phải dựng lại bản xem trước
  const signKey = `signs_${type}`;
  const docInfo = info && Object.fromEntries(Object.entries(info).filter(([k]) => !k.startsWith('signs_')));
  const doc = useMemo(() => { if (!ready) return null; try { return applyExportOpts(buildPrintDoc(type, data, ds, docInfo, tplPick[type]), opts); } catch (e) { return { error: e.message }; } }, [ready, type, data, ds, JSON.stringify(docInfo), tplPick[type], opts]);
  const sigLib = settings?.doc_signatures || [];
  const placed = (() => { try { const v = JSON.parse(info?.[signKey] || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
  const signs = placed.map((p, idx) => { const g = sigLib.find((x) => x.id === p.s); return g && { ...p, idx, img: g.img, ar: g.ar }; }).filter(Boolean);
  const setPlaced = (list) => setEdit((s) => ({ ...s, [signKey]: list.length ? JSON.stringify(list) : '' }));
  const pagePt = doc && !doc.error ? (() => { const z = pageSize(doc); return { w: z.w * 72 / 25.4, h: (z.h || 297) * 72 / 25.4 }; })() : { w: 595, h: 842 };
  const addSign = (id, page, cx, cy) => {
    const g = sigLib.find((x) => x.id === id); if (!g) return;
    const w = 110; const h = w * g.ar;
    // Thả vào trang: tâm chữ ký ở chỗ thả; bấm "+" thì đặt ở góc dưới phải trang 1
    const x = cx === undefined ? pagePt.w - w - 70 : cx - w / 2; const y = cy === undefined ? pagePt.h * 0.72 : cy - h / 2;
    setPlaced([...placed, { s: id, p: page || 1, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w }]);
  };
  const changeSign = (idx, patch) => setPlaced(patch ? placed.map((p, i) => (i === idx ? { ...p, ...patch } : p)) : placed.filter((_, i) => i !== idx));
  // Cỡ chữ chỉnh riêng từng phần cho lần xuất này: { from: nội dung chứng từ lúc bắt đầu chỉnh, html }; chứng từ đổi nội dung thì bỏ
  const [custom, setCustom] = useState(null); const [editText, setEditText] = useState(false);
  const customOn = !!(custom?.html && doc && !doc.error && custom.from === doc.html);
  useEffect(() => {
    if (!custom || !doc || doc.error || custom.from === doc.html) return;
    setCustom(null); setEditText(false);
    if (custom.html) toast('Chứng từ vừa thay đổi nên phần chỉnh cỡ chữ đã được bỏ — chỉnh lại nếu cần');
  }, [doc]);
  const shownDoc = useMemo(() => (customOn ? withCustomText(doc, custom.html) : doc), [doc, custom, customOn]);
  // Tệp tải / in / ảnh: kèm chữ ký đã đặt
  const outDoc = useMemo(() => (shownDoc && !shownDoc.error && signs.length ? { ...shownDoc, signs: signs.map((s) => ({ img: s.img, page: s.p, x: s.x, y: s.y, w: s.w })) } : shownDoc),
    [shownDoc, JSON.stringify(placed), sigLib]);
  const tpls = templatesFor(ds, type);
  // Bảng gộp nhiều hóa đơn: ngày đối chiếu chỉ dùng cho lần xuất này (mặc định hôm nay), không lưu vào hồ sơ khách
  const localOnly = (k) => data?.kind === 'invoices' && k.startsWith('date_');
  // Tiền cọc cấn trừ không lưu vào thông tin chứng từ: chỉ bấm "Lưu thông tin" mới ghi thành khoản cấn trừ của đơn
  const offsetNow = type === 'doi_chieu_tt' && data?.payBase && fields.some((f) => f.key === OFFSET_KEY) ? pendingOffset(edit) : 0;
  const stored = (k) => !localOnly(k) && k !== OFFSET_KEY;
  const dirty = offsetNow > 0 || Object.keys(edit).some(stored);
  const canSave = data?.kind === 'payment' ? can('thu_chi') : can('ban_hang');
  const subtitle = !data ? null : data.kind === 'payment' ? `Phiếu ${data.p.code}` : data.kind === 'quote' ? `Báo giá ${data.q.code} · ${data.q.customer_name}` : data.kind === 'contract' ? `Hợp đồng ${data.k.code} · ${data.o.customer_name}` : data.kind === 'invoices' ? `${data.cust.name} · ${data.invs.length} hóa đơn` : null;

  // record: bấm "Lưu thông tin" → ghi cả tiền cọc cấn trừ đã nhập; In / Tải PDF tự lưu nhưng không ghi cấn trừ
  const save = async (record = false) => {
    if (!dirty || !canSave) return true;
    const ref = infoRef(type, data);
    const keep = (k) => !stored(k) && !(record && k === OFFSET_KEY);
    try {
      const rows = Object.entries(edit).filter(([k]) => stored(k));
      if (rows.length) {
        await rpc('save_doc_info', { ...ref, data: Object.fromEntries(rows.map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])) });
        setEdit((s) => Object.fromEntries(Object.entries(s).filter(([k]) => !stored(k)))); setReload((x) => x + 1);
      }
      if (record && offsetNow > 0) {
        await rpc('add_order_adjustment', { order_id: data.o.id, kind: 'can_tru_coc', date: offsetDate(info), amount: offsetNow, note: 'Cấn trừ trên bảng đối chiếu công nợ' });
        setEdit((s) => Object.fromEntries(Object.entries(s).filter(([k]) => keep(k)))); setReload((x) => x + 1);
      }
      return true;
    } catch (e) { toast(e.message, 'err'); return false; }
  };
  const download = async () => {
    if (!doc || doc.error) return;
    setBusy(true);
    try {
      await save();
      const { pdfBlob } = await import('../lib/docs/pdf.js');
      const blob = await pdfBlob(outDoc);
      const ok = await saveFile(doc.filename, blob);
      if (ok) { toast(`Đã tạo ${doc.filename}`); afterExport([type]); }
    } catch (e) { toast('Không tạo được PDF: ' + e.message, 'err'); } finally { setBusy(false); }
  };

  const printNow = async () => {
    if (!doc || doc.error) return;
    setBusy(true);
    try { await save(); const { printDocs } = await import('../lib/docs/pdf.js'); await printDocs(outDoc); afterExport([type]); } catch (e) { toast('Không in được: ' + e.message, 'err'); } finally { setBusy(false); }
  };

  // Chỉ quản trị (chủ sổ) xuất được ảnh PNG để gửi khách
  const downloadImage = async () => {
    if (!doc || doc.error) return;
    setBusy(true);
    try {
      await save();
      const [{ pdfBlob }, { pdfToImageBlob }] = await Promise.all([import('../lib/docs/pdf.js'), import('../lib/docs/image.js')]);
      const name = doc.filename.replace(/\.pdf$/i, '') + '.png';
      if (await saveFile(name, await pdfToImageBlob(await pdfBlob(outDoc, { onePage: true })))) { toast(`Đã tạo ${name}`); afterExport([type]); }
    } catch (e) { toast('Không tạo được ảnh: ' + e.message, 'err'); } finally { setBusy(false); }
  };

  const dels = data?.dels || [];
  const title = withPay ? 'Phiếu thu & chứng từ giao hàng' : 'In / xuất chứng từ';
  const sub = subtitle ?? (data?.o ? `Đơn ${data.o.code} · ${data.o.customer_name || ''}` : '');
  const footer = <>
    <span className="muted small grow">{offsetNow > 0 ? `Tiền cọc cấn trừ ${money(offsetNow)} đ chỉ được ghi khi bấm Lưu thông tin.` : dirty ? 'Có thay đổi chưa lưu — bấm In / Tải PDF sẽ tự lưu.' : `${PAPERS[doc?.paper]?.label || 'Khổ A4'}${PAPERS[doc?.paper]?.roll ? '' : doc?.orient === 'landscape' ? ' ngang' : ' dọc'}${opts.scale !== 1 ? ` · chữ ${Math.round(opts.scale * 100)}%` : ''} · chữ trong PDF chọn và sao chép được.`}</span>
    <Btn onClick={onClose}>Đóng</Btn>
    {canSave && <Btn disabled={!dirty} onClick={async () => { if (await save(true)) toast(offsetNow > 0 ? `Đã lưu và ghi cấn trừ tiền cọc ${money(offsetNow)} đ` : 'Đã lưu thông tin chứng từ'); }}>Lưu thông tin</Btn>}
    {can('owner') && <Btn icon="dl" busy={busy} disabled={!doc || !!doc?.error} onClick={downloadImage}>Tải ảnh</Btn>}
    <Btn icon="print" busy={busy} disabled={!doc || !!doc?.error} onClick={printNow}>In</Btn>
    <Btn kind="primary" icon="dl" busy={busy} disabled={!doc || !!doc?.error} onClick={download}>Tải PDF</Btn>
  </>;
  const content = (
    <div className="doc-shell">
      {types.length > 1 && <Tabs value={type} onChange={setType} tabs={tabTypes.map((t, i) => ({ value: t, label: DOC_TYPES[t].label, gap: i > 0 && TAB_STAGE[t] !== TAB_STAGE[tabTypes[i - 1]], title: STAGE_LABEL[TAB_STAGE[t]] }))} />}
      <div className="doc-alerts">
        <ErrorBox error={err || doc?.error} />
        {company && <VatReminder orderId={data.o.id} onShowRequest={type === 'yeu_cau_vat' ? null : () => setType('yeu_cau_vat')} />}
      </div>
      {remindVat && <VatReminderPopup orderId={data?.o?.id} onShowRequest={() => setType('yeu_cau_vat')} onClose={() => setRemindVat(false)} />}
      {!data ? !err && <Loading /> : (
        <div className="doc-wrap">
          <div className="doc-side">
            {kind === 'delivery' && <BatchExport deliveryId={id} pay={withPay ? pay : null} ds={ds} beforeExport={save} company={company} onDone={afterExport} xopts={opts} />}
            {RECONCILE.includes(type) && delivered && ['order', 'contract', 'invoices'].includes(kind) && <ReconcilePack src={{ kind, id, keys }} dels={data.dels} ds={ds} beforeExport={save} xopts={opts} />}
            {kind === 'invoices' && data.invs && <div className="muted small">Gộp {data.invs.length} hóa đơn: {data.invs.map((iv) => iv.code).join(', ')}.</div>}
            {RECONCILE.includes(type) && kind === 'order' && !data?.k && <div className="muted small">Đơn chưa có hợp đồng: bảng ghi "Theo đơn hàng số {data?.o?.code}".</div>}
            {ready && <SideGroup title="Thông tin trên chứng từ" open badge={dirty ? 'chưa lưu' : null}>
              {perDelivery && !STANDALONE.includes(data.kind) && (
                <Field label="Lập theo">
                  <Select value={src.kind === 'delivery' ? src.id : ''} onChange={(v) => setSrc(v ? { kind: 'delivery', id: v } : { kind: 'order', id: data.o.id })}
                    options={[{ value: '', label: 'Cả đơn (hàng còn trong đơn)' }, ...dels.map((d) => ({ value: d.id, label: `Phiếu giao ${d.code} · ${dmy(d.delivery_date)}` }))]} />
                </Field>
              )}
              {ds.profiles.length > 1 && (
                <Field label="Đơn vị đứng tên">
                  <Select value={profileFor(ds, type, info).id} onChange={(v) => setEdit((s) => ({ ...s, [`profile_${type}`]: v }))}
                    options={ds.profiles.map((p) => ({ value: p.id, label: p.legal_name || p.name }))} />
                </Field>
              )}
              {fields.map((f) => {
                const v = info[f.key];
                const set = (x) => setEdit((s) => ({ ...s, [f.key]: x }));
                return (
                  <Field key={f.key} label={f.label}>
                    {f.kind === 'driver' ? <DriverPick value={v || ''} drivers={drivers} onPick={(d) => setEdit((s) => ({ ...s, driver_name: d.name, driver_phone: d.phone || '', vehicle: d.plate || '', id_no: d.id_no || '' }))} onText={set} />
                      : f.kind === 'date' ? <DateInput value={v || ''} onChange={set} />
                      : f.kind === 'money' ? <NumInput value={v === '' || v === undefined ? null : Number(v)} onChange={(x) => set(x === null ? (f.blank ? '' : '0') : String(x))} />
                      : f.kind === 'select' ? <Select value={v || ''} onChange={(x) => set(x || '')} options={f.options} aria-label={f.label} />
                      : f.kind === 'num' ? <Input value={v} onChange={(x) => set(x.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder={f.placeholder} />
                      : <Input value={v} onChange={set} maxLength={500} />}
                  </Field>
                );
              })}
              {!canSave && <div className="muted small">Bạn không có quyền lưu thay đổi; nội dung sửa ở đây chỉ dùng cho lần tải này.</div>}
              {type === 'yeu_cau_vat' && <div className="muted small">Thông tin bên mua lấy từ thẻ "Thông tin xuất hóa đơn" của khách. Đơn giá là giá trước thuế; cước vận chuyển và chiết khấu của đơn được thêm thành dòng riêng.</div>}
              {type === 'hoa_don' && <div className="muted small">Nợ cũ tự tính = công nợ hiện tại của khách trừ phần của đơn này. Tổng số hộp tự tính từ quy cách đóng gói của sản phẩm (hộp lẻ tính 1 hộp).</div>}
            </SideGroup>}
            {ready && type === 'doi_chieu_tt' && data.payBase && data.o && <ReceiptAlloc order={data.o} cutoff={String(info.date_doi_chieu_tt || '').slice(0, 10)}
              canPay={can('thu_chi')} onDone={() => setReload((x) => x + 1)} />}
            {ready && <SideGroup title="Mẫu in & khổ giấy" badge={opts.orient || opts.scale !== 1 ? 'đã chỉnh' : null}>
              {(tpls.length > 1 || can('owner')) && (
                <Field label="Mẫu in">
                  {tpls.length > 1 && <Select value={doc?.tplId || ''} onChange={(v) => pickTpl(type, v)} options={tpls.map((t) => ({ value: t.id, label: `${t.name}${t.is_default ? ' (mặc định)' : ''}` }))} />}
                  {can('owner') && <button className="link-btn small" onClick={() => openTemplateEditor({ book: book.id, type, tpl: (ds.templates[type] || []).length ? doc?.tplId : '' })}>Sửa mẫu in này (mở tab mới)</button>}
                </Field>
              )}
              <ExportOpts opts={opts} set={setOpt} roll={!!PAPERS[doc?.paper]?.roll} doc={doc} />
              <div className="muted small">Đơn vị phát hành, logo, nội dung và cách trình bày: Cài đặt → Mẫu in.</div>
            </SideGroup>}
            {ready && <SideGroup title="Chữ ký" badge={signs.length ? `${signs.length} đã đặt` : null} open={signs.length > 0}>
              <SignatureLibrary onAdd={(id) => addSign(id, 1)} placedCount={signs.length} onClear={() => setPlaced([])} />
            </SideGroup>}
            {ready && <HeaderEditor type={type} prof={profileFor(ds, type, { ...info, ...Object.fromEntries(HEADER_FIELDS.map(([k]) => [headerKey(type, k), ''])), [headerKey(type, 'logo')]: '' })} info={info} setEdit={setEdit} />}
          </div>
          <div className="doc-main">{doc && !doc.error ? (editText
            ? <TextSizeEditor key={`${type}:${srcKey}`} doc={doc} value={customOn ? custom.html : null} onChange={(html) => setCustom(html ? { from: doc.html, html } : null)} onDone={() => setEditText(false)} />
            : <DocPreview doc={shownDoc} opts={customOn ? null : opts} setOpt={customOn ? null : setOpt} signs={signs} onSign={changeSign} onDropSign={addSign} extra={<span className="row gap-s">
              {customOn && <span className="small accent">Đã chỉnh cỡ chữ riêng · <button type="button" className="link-btn small" onClick={() => setCustom(null)}>Bỏ</button></span>}
              <Btn small icon="edit" onClick={() => setEditText(true)} title="Bôi đen phần chữ rồi phóng to / thu nhỏ riêng phần đó (chỉ cho lần xuất này)">Cỡ chữ từng phần</Btn></span>} />)
            : !doc?.error && <Loading />}</div>
        </div>
      )}
    </div>
  );
  if (!page) return <Modal title={title} subtitle={sub} onClose={onClose} size="xl" className="modal-doc" footer={footer}>{content}</Modal>;
  return (
    <div className="doc-pageview">
      <div className="doc-pageview-head"><div className="modal-title">{title}</div>{sub && <div className="modal-sub">{sub}</div>}</div>
      <div className="doc-pageview-body">{content}</div>
      <div className="doc-pageview-foot">{footer}</div>
    </div>
  );
}

function FontLoader() { useDocFonts(); return null; }

// ---------- Cài đặt → Mẫu in ----------
const PROFILE_FIELDS = [
  ['name', 'Tên in đầu trang (IN HOA)', true], ['legal_name', 'Tên dùng trong nội dung', true], ['address', 'Địa chỉ', true], ['phone', 'Điện thoại'], ['email', 'Email'],
  ['website', 'Website'], ['short_name', 'Tên viết tắt (đầu bảng đối chiếu, vd. CÔNG TY TNHH SX&TM THANH HẢI)', true], ['tax_code', 'Mã số thuế'], ['bank_line', 'Dòng số tài khoản (sau chữ “STK:”)', true], ['representative', 'Người đại diện'], ['rep_title', 'Chức danh người đại diện'],
];
// Nhóm loại chứng từ ở cột trái (giống "Quản lý mẫu in" của KiotViet)
const TYPE_GROUPS = [
  ['Bán hàng', ['hoa_don', 'don_dat_hang', 'bao_gia', 'yeu_cau_vat']],
  ['Giao hàng', ['phieu_dong_hang', 'bien_ban', 'phieu_xuat_kho', 'hd_van_chuyen', 'cn_xuat_xuong']],
  ['Đối chiếu sau giao hàng', ['doi_chieu_tt', 'doi_chieu_sl']],
  ['Hợp đồng', ['de_nghi_tam_ung', 'de_nghi_tt']],
  ['Sổ quỹ', ['phieu_thu']],
];
const QUOTE_TEXTS = [['quote_ngoi', 'Lưu ý mặc định - báo giá mẫu ngói', 8], ['quote_mosaic', 'Lưu ý mặc định - báo giá tranh mosaic', 8]];

async function resizeLogo(file) {
  if (!/^image\//.test(file.type)) throw new Error('Chọn tệp ảnh (PNG, JPG)');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Không đọc được ảnh')); i.src = url; });
    const k = Math.min(1, 360 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
// Phần "docs" gửi lên máy chủ (không kèm mẫu in — mẫu lưu riêng nên không bị ghi đè)
const docsPayload = (f) => ({
  profiles: f.profiles, font: f.font, font_set: true, base_size: f.base,
  types: Object.fromEntries(Object.entries(f.types).map(([k, t]) => [k, { profile: t.profile, sep: t.sep, show_price: t.show_price, show_form: t.show_form,
    text: Object.fromEntries(Object.entries(t.text || {}).filter(([, v]) => v !== undefined && v !== null)) }])),
});

export function DocTemplateSettings() {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('gomsu.tpl_tab') || 'mau'; } catch (e) { return 'mau'; } });
  const pick = (v) => { setTab(v); try { localStorage.setItem('gomsu.tpl_tab', v); } catch (e) { /* bỏ qua */ } };
  return (
    <div className="stack-l">
      <Tabs value={tab} onChange={pick} tabs={[{ value: 'mau', label: 'Quản lý mẫu in' }, { value: 'don-vi', label: 'Đơn vị phát hành & phông chữ' }]} />
      {tab === 'mau' ? <TemplateManager /> : <IssuerSettings />}
    </div>
  );
}

// Danh sách mẫu theo loại chứng từ + xem trước + sửa (tab mới), nhân bản, đặt mặc định, xóa
function TemplateManager() {
  const { book, settings, rpc, loadBooks, toast } = useApp();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const [type, setType] = useState(() => { try { const t = localStorage.getItem('gomsu.tpl_type'); return DOC_TYPES[t] ? t : 'hoa_don'; } catch (e) { return 'hoa_don'; } });
  const chooseType = (t) => { setType(t); setSel(null); try { localStorage.setItem('gomsu.tpl_type', t); } catch (e) { /* bỏ qua */ } };
  const saved = ds.templates[type] || [];
  const list = templatesFor(ds, type);
  const [sel, setSel] = useState(null);
  const cur = list.find((t) => t.id === sel) || list.find((t) => t.is_default) || list[0];
  const [busy, setBusy] = useState(false);
  const data = useMemo(() => sampleData(type), [type]);
  const doc = useMemo(() => { try { return applyExportOpts(buildPrintDoc(type, data, ds, defaults(type, data, ds), cur.id)); } catch (e) { return { error: e.message }; } }, [type, ds, cur.id, data]);
  const persist = async (next, msg) => {
    setBusy(true);
    try { await rpc('save_print_templates', { doc_type: type, templates: next }); await loadBooks(); toast(msg); return true; } catch (e) { toast(e.message, 'err'); return false; } finally { setBusy(false); }
  };
  const strip = ({ builtin, ...t }) => t;
  // Mẫu gốc chưa lưu lần nào: lưu nó vào danh sách trước khi nhân bản / thêm mẫu khác
  const base = saved.length ? saved : [strip(cur)];
  const duplicate = async () => {
    const id = 't' + Date.now().toString(36);
    if (await persist([...base, { ...strip(cur), id, name: `${cur.name} (bản sao)`, is_default: false }], 'Đã nhân bản mẫu in')) setSel(id);
  };
  const makeDefault = () => persist(base.map((t) => ({ ...t, is_default: t.id === cur.id })), `Đã đặt "${cur.name}" làm mẫu mặc định`);
  const remove = () => persist(saved.filter((t) => t.id !== cur.id), saved.length > 1 ? 'Đã xóa mẫu in' : 'Đã xóa — dùng lại mẫu gốc của hệ thống').then((ok) => ok && setSel(null));
  const edit = (tpl) => openTemplateEditor({ book: book.id, type, tpl });
  const setProfile = async (v) => {
    try {
      const f = { profiles: ds.profiles, font: ds.font, types: { ...ds.types, [type]: { ...ds.types[type], profile: v } } };
      await rpc('update_book_settings', { settings: { docs: docsPayload(f) } }); await loadBooks(); toast('Đã đổi đơn vị phát hành');
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="tm">
      <nav className="tm-nav" aria-label="Loại chứng từ">
        {TYPE_GROUPS.map(([g, ts]) => (
          <div key={g} className="tm-group">
            <div className="tm-glabel">{g}</div>
            {ts.map((t) => <button type="button" key={t} className={`tm-item${t === type ? ' on' : ''}`} onClick={() => chooseType(t)}>
              <span>{DOC_TYPES[t].label}</span>{(ds.templates[t] || []).length > 0 && <span className="tm-count">{ds.templates[t].length}</span>}
            </button>)}
          </div>
        ))}
      </nav>
      <div className="tm-main">
        <div className="tm-head">
          <div className="tm-tabs" role="tablist">
            {list.map((t) => <button type="button" role="tab" aria-selected={t.id === cur.id} key={t.id} className={t.id === cur.id ? 'on' : ''} onClick={() => setSel(t.id)}>
              {t.name}{t.is_default && list.length > 1 && <span className="pill pill-ok tm-def">Mặc định</span>}{t.builtin && <span className="muted small"> · mẫu gốc</span>}
            </button>)}
          </div>
          <Btn small kind="soft" icon="plus" onClick={() => edit('new')}>Tạo mẫu in</Btn>
        </div>
        <div className="tm-actions">
          <Btn kind="primary" icon="edit" onClick={() => edit(saved.length ? cur.id : '')}>Sửa</Btn>
          <Btn icon="copy" busy={busy} onClick={duplicate}>Nhân bản</Btn>
          {list.length > 1 && !cur.is_default && <Btn icon="check" busy={busy} onClick={makeDefault}>Đặt làm mặc định</Btn>}
          {!cur.builtin && <ConfirmBtn icon="trash" confirmText={saved.length > 1 ? 'Bấm lần nữa để xóa mẫu' : 'Xóa và dùng lại mẫu gốc?'} onConfirm={remove}>Xóa</ConfirmBtn>}
          <span className="grow" />
          <span className="small muted">{PAPERS[cur.paper || 'A4']?.label} · {cur.orient === 'landscape' ? 'khổ ngang' : 'khổ dọc'}</span>
          {ds.profiles.length > 1 && <label className="tm-profile small">Đơn vị phát hành
            <select className="input" value={ds.types[type].profile} onChange={(e) => setProfile(e.target.value)}>{ds.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>}
        </div>
        <div className="small muted">Xem trước với dữ liệu mẫu. Bấm <b>Sửa</b> để mở trình sửa mẫu ở tab mới: sửa chữ trực tiếp, chèn thông tin, bảng, ảnh, chọn khổ giấy rồi bấm Lưu mẫu.</div>
        {doc.error ? <ErrorBox error={doc.error} /> : <DocPreview doc={doc} />}
      </div>
    </div>
  );
}

// Đơn vị phát hành (tên, địa chỉ, logo…), phông chữ chung, lưu ý mặc định của báo giá mới
function IssuerSettings() {
  const { book, settings, rpc, loadBooks, refresh, toast } = useApp();
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  useEffect(() => {
    const ds = docSettings(book, settings);
    const types = {};
    for (const k of Object.keys(DOC_TYPES)) types[k] = { ...ds.types[k], text: { ...(ds.types[k].text || {}) } };
    setF({ profiles: ds.profiles.map((p) => ({ ...p })), types, font: ds.font, base: ds.base });
  }, [book.id]);
  if (!f) return <Loading />;
  const setP = (i, k, v) => setF((s) => ({ ...s, profiles: s.profiles.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  const setTxt = (t, k, v) => setF((s) => ({ ...s, types: { ...s.types, [t]: { ...s.types[t], text: { ...s.types[t].text, [k]: v } } } }));
  const addProfile = () => setF((s) => ({ ...s, profiles: [...s.profiles, { ...profileFromBook(book, settings), id: 'p' + Date.now().toString(36), name: 'ĐƠN VỊ MỚI' }] }));
  const delProfile = (i) => setF((s) => {
    const gone = s.profiles[i].id; const profiles = s.profiles.filter((_, j) => j !== i);
    const types = Object.fromEntries(Object.entries(s.types).map(([k, t]) => [k, t.profile === gone ? { ...t, profile: profiles[0].id } : t]));
    return { ...s, profiles, types };
  });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      if (JSON.stringify(f).length > 900000) throw new Error('Logo quá lớn — chọn ảnh nhỏ hơn');
      await rpc('update_book_settings', { settings: { docs: docsPayload(f) } });
      await loadBooks(); refresh(); toast('Đã lưu đơn vị phát hành và phông chữ');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack-l" style={{ maxWidth: 920 }}>
      <Note>Thông tin đơn vị phát hành được chèn vào mẫu in qua các thông tin như <b>Tên đơn vị</b>, <b>Địa chỉ đơn vị</b>, <b>Logo đơn vị</b>. Mỗi loại chứng từ chọn một đơn vị phát hành ở thẻ Quản lý mẫu in (ví dụ hóa đơn do hộ kinh doanh xuất, biên bản bàn giao do công ty xuất).</Note>
      <ErrorBox error={err} />
      <Section title="Đơn vị phát hành" actions={<Btn small kind="soft" icon="plus" onClick={addProfile}>Thêm đơn vị</Btn>}>
        <div className="stack-l">
          {f.profiles.map((p, i) => (
            <div key={p.id} className="card stack-s">
              <div className="row gap-s" style={{ alignItems: 'center' }}>
                <b className="grow">{p.name || 'Đơn vị'}</b>
                {f.profiles.length > 1 && <ConfirmBtn small icon="x" onConfirm={() => delProfile(i)}>Xóa</ConfirmBtn>}
              </div>
              <div className="grid">
                {PROFILE_FIELDS.map(([k, label, wide]) => <Field key={k} label={label} wide={wide}><Input value={p[k] || ''} onChange={(v) => setP(i, k, k === 'name' ? v.toUpperCase() : v)} /></Field>)}
                <Field label="Logo (in ở đầu trang chứng từ)" wide>
                  <div className="row gap-s" style={{ alignItems: 'center' }}>
                    {p.logo ? <img src={p.logo} alt="Logo" style={{ height: 56, border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }} /> : <span className="muted small">Chưa có logo</span>}
                    <label className="btn btn-ghost btn-sm"><input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                      try { setP(i, 'logo', await resizeLogo(file)); } catch (x) { toast(x.message, 'err'); } }} />Chọn ảnh…</label>
                    {p.logo && <Btn small onClick={() => setP(i, 'logo', '')}>Bỏ logo</Btn>}
                  </div>
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <FontLoader />
      <Section title="Phông chữ">
        <div className="grid">
          <Field label="Phông chữ mặc định của mẫu in" hint="Dùng cho chữ chưa chọn phông riêng trong mẫu. Phông được nhúng sẵn trong PDF nên máy nào mở cũng giống nhau.">
            <Select value={f.font} onChange={(v) => setF((s) => ({ ...s, font: v }))} options={[{ value: 'Arimo', label: 'Arial (Arimo) — chữ không chân' }, { value: 'Tinos', label: 'Times New Roman (Tinos) — chữ có chân' }]} />
          </Field>
          <Field label="Cỡ chữ cơ bản" hint="Chữ nhỏ hơn cỡ này trong mẫu được nâng lên; tiêu đề lớn giữ nguyên. Giấy cuộn K80/K58 giữ cỡ của mẫu.">
            <Select value={String(f.base)} onChange={(v) => setF((s) => ({ ...s, base: Number(v) }))}
              options={[...BASE_SIZES.map((n) => ({ value: String(n), label: `${n} pt${n === DEFAULT_BASE ? ' (mặc định)' : ''}` })), { value: '0', label: 'Giữ đúng cỡ chữ trong mẫu' }]} />
          </Field>
          <div className="row gap" style={{ alignItems: 'center' }}>
            <span style={{ fontFamily: 'Arimo, Arial, sans-serif', fontSize: 16, opacity: f.font === 'Arimo' ? 1 : .45 }}>Hóa đơn bán hàng</span>
            <span style={{ fontFamily: 'Tinos, "Times New Roman", serif', fontSize: 16, opacity: f.font === 'Tinos' ? 1 : .45 }}>Hóa đơn bán hàng</span>
          </div>
        </div>
      </Section>
      <Section title="Lưu ý mặc định của báo giá mới">
        <div className="stack-s">
          {QUOTE_TEXTS.map(([tk, label, rows]) => {
            const cur = f.types.bao_gia.text?.[tk];
            return (
              <Field key={tk} label={label} hint="Tự điền vào ô Lưu ý khi tạo báo giá mới. Bọc chữ trong **hai dấu sao** để in đậm." wide>
                <TextArea rows={rows} value={cur ?? DEFAULT_TEXTS[tk]} onChange={(v) => setTxt('bao_gia', tk, v)} />
                {cur !== undefined && cur !== DEFAULT_TEXTS[tk] && <button className="link-btn small" onClick={() => setTxt('bao_gia', tk, undefined)}>Dùng lại nội dung mặc định</button>}
              </Field>
            );
          })}
        </div>
      </Section>
      <div><Btn kind="primary" busy={busy} onClick={save}>Lưu</Btn></div>
    </div>
  );
}
