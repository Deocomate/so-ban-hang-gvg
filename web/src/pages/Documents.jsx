import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { packView } from '../lib/book-profile.js';
import { dmy } from '../lib/format.js';
import { saveFile } from '../lib/excel.js';
import { Btn, Loading, ErrorBox, Note, Modal, Field, Input, TextArea, Select, DateInput, NumInput, Check, Section, Tabs, ConfirmBtn } from '../components/ui.jsx';
import { DOC_TYPES, DEFAULT_TEXTS, docSettings, loadDocData, defaults, currentInfo, editableFields, infoRef, profileFor, profileFromBook, PER_DELIVERY } from '../lib/docs/model.js';
import { buildPrintDoc, templatesFor, pageSize, PAPERS, FONT_CSS } from '../lib/docs/templates.js';
import { openTemplateEditor } from '../lib/docs/editor-link.js';
import { sampleData } from '../lib/docs/tokens.js';

import { useDocFonts } from '../lib/docs/fonts.js';

const TYPES_FOR = { quote: ['bao_gia'], contract: ['de_nghi_tam_ung', 'doi_chieu_sl', 'doi_chieu_tt', 'de_nghi_tt'], order: ['hoa_don', 'don_dat_hang', 'bien_ban', 'phieu_xuat_kho', 'hd_van_chuyen'], delivery: ['bien_ban', 'hoa_don', 'hd_van_chuyen', 'phieu_xuat_kho', 'don_dat_hang'], payment: ['phieu_thu'] };

// ---------- Bản xem trước: chứng từ dựng từ mẫu in (HTML), đúng khổ giấy và lề ----------
export function DocPreview({ doc }) {
  useDocFonts();
  const size = pageSize(doc); const m = doc.margin || {};
  // Thu nhỏ trang cho vừa khung (điện thoại, hộp thoại hẹp)
  const ref = React.useRef(null); const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { const w = el.clientWidth - 16; setZoom(Math.min(1, Math.max(0.3, w / (size.w * 96 / 25.4)))); });
    ro.observe(el); return () => ro.disconnect();
  }, [size.w]);
  return (
    <div className="doc-scroll" ref={ref}>
      <div className="doc-page" style={{ fontFamily: FONT_CSS[doc.font], zoom, width: `${size.w}mm`, minHeight: size.h ? `${size.h}mm` : 'auto', padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm` }}>
        <div className="tpl" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
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
    return kind && id && TYPES_FOR[kind] ? { kind, id, type: u.get('type') || undefined, pay: u.get('pay') || undefined, book: u.get('book') || undefined } : null;
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
const BATCH_TYPES = [['hd_van_chuyen', 'Hợp đồng vận chuyển'], ['hoa_don', 'Hóa đơn bán hàng'], ['bien_ban', 'Biên bản giao hàng']];
const BATCH_KEY = 'gomsu.doc_batch';
function readBatch() { try { const v = JSON.parse(localStorage.getItem(BATCH_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
function BatchExport({ deliveryId, pay, ds, beforeExport }) {
  const { q, rpc, settings, toast, can } = useApp();
  const opts = [...BATCH_TYPES, ...(pay ? [['phieu_thu', 'Phiếu thu']] : [])];
  const saved = readBatch();
  const [pick, setPick] = useState(() => Object.fromEntries(opts.map(([t]) => [t, saved?.pick?.[t] ?? true])));
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
      const docs = chosen.map((t) => { const data = t === 'phieu_thu' ? pd : dd; return buildPrintDoc(t, data, ds, { ...defaults(t, data, ds), ...(currentInfo(t, data) || {}) }); });
      const { pdfBlob, printDocs } = await import('../lib/docs/pdf.js');
      if (asImage === 'print') { await printDocs(docs); return; }
      const { pdfToImageBlob } = asImage ? await import('../lib/docs/image.js') : {};
      const out = async (list) => { const b = await pdfBlob(list); return asImage ? pdfToImageBlob(b) : b; };
      const ext = asImage ? 'png' : 'pdf'; const what = asImage ? 'ảnh' : 'tệp PDF';
      if (merge && docs.length > 1) {
        const name = `chung-tu-giao-hang_${dd.d.code}.${ext}`;
        if (await saveFile(name, await out(docs))) toast(`Đã tạo ${name} (${docs.length} chứng từ)`);
      } else {
        for (const doc of docs) await saveFile(doc.filename.replace(/\.pdf$/i, '.' + ext), await out(doc));
        toast(`Đã tạo ${docs.length} ${what}`);
      }
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

// ---------- Hộp thoại xuất chứng từ ----------
// pay: phiếu thu lập cùng lúc với đợt giao (giao + thu) → thêm thẻ "Phiếu thu" vào cùng hộp thoại.
// page: hiện toàn trang (tab mới) thay cho hộp thoại.
export function DocDialog({ kind, id, type: type0, pay, page, onClose }) {
  const { q, rpc, book, settings, can, toast } = useApp();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const withPay = !!pay && kind !== 'payment';
  const types = withPay ? ['phieu_thu', ...TYPES_FOR[kind]] : TYPES_FOR[kind];
  const [type, setType] = useState(type0 && types.includes(type0) ? type0 : types[0]);
  const [src, setSrc] = useState(withPay && (type0 ? type0 === 'phieu_thu' : true) ? { kind: 'payment', id: pay } : { kind, id });
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  const [edit, setEdit] = useState({}); const [busy, setBusy] = useState(false); const [reload, setReload] = useState(0);
  const [showForm, setShowForm] = useState(true);
  // Mẫu in chọn cho từng loại chứng từ (nhớ lần chọn trước trên máy này)
  const [tplPick, setTplPick] = useState(() => { try { return JSON.parse(localStorage.getItem('gomsu.tpl_pick') || '{}') || {}; } catch (e) { return {}; } });
  const pickTpl = (t, v) => setTplPick((s) => { const n = { ...s, [t]: v }; try { localStorage.setItem('gomsu.tpl_pick', JSON.stringify(n)); } catch (e) { /* bỏ qua */ } return n; });
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
    if (!data || data.srcKey !== srcKey || ['payment', 'contract', 'quote'].includes(data.kind)) return;
    if (!perDelivery && src.kind === 'delivery') setSrc({ kind: 'order', id: data.o.id });
  }, [type, data]);
  useEffect(() => { setEdit({}); }, [type, src.kind, src.id]);

  // Đề nghị thanh toán chỉ lập sau khi đã hoàn tất đối chiếu
  const tabTypes = types.filter((t) => t !== 'de_nghi_tt' || data?.k?.reconciled_at);
  // Chỉ dựng khi dữ liệu đã nạp khớp với thẻ đang chọn (đổi thẻ Phiếu thu ↔ Biên bản phải chờ nạp lại)
  const ready = data && data.srcKey === srcKey && (type === 'phieu_thu') === (data.kind === 'payment')
    && (['payment', 'contract', 'quote'].includes(data.kind) || !(perDelivery ? false : src.kind === 'delivery'));
  const fields = ready ? editableFields(type, data) : [];
  const saved = ready ? currentInfo(type, data) || {} : {};
  const info = ready ? { ...defaults(type, data, ds), ...saved, ...edit } : null;
  const doc = useMemo(() => { if (!ready) return null; try { return buildPrintDoc(type, data, ds, info, tplPick[type]); } catch (e) { return { error: e.message }; } }, [ready, type, data, ds, JSON.stringify(info), tplPick[type]]);
  const tpls = templatesFor(ds, type);
  const dirty = Object.keys(edit).length > 0;
  const canSave = data?.kind === 'payment' ? can('thu_chi') : can('ban_hang');
  const subtitle = !data ? null : data.kind === 'payment' ? `Phiếu ${data.p.code}` : data.kind === 'quote' ? `Báo giá ${data.q.code} · ${data.q.customer_name}` : data.kind === 'contract' ? `Hợp đồng ${data.k.code} · ${data.o.customer_name}` : null;

  const save = async () => {
    if (!dirty || !canSave) return true;
    const ref = infoRef(type, data);
    try {
      await rpc('save_doc_info', { ...ref, data: Object.fromEntries(Object.entries(edit).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])) });
      setEdit({}); setReload((x) => x + 1); return true;
    } catch (e) { toast(e.message, 'err'); return false; }
  };
  const download = async () => {
    if (!doc || doc.error) return;
    setBusy(true);
    try {
      await save();
      const { pdfBlob } = await import('../lib/docs/pdf.js');
      const blob = await pdfBlob(doc);
      const ok = await saveFile(doc.filename, blob);
      if (ok) toast(`Đã tạo ${doc.filename}`);
    } catch (e) { toast('Không tạo được PDF: ' + e.message, 'err'); } finally { setBusy(false); }
  };

  const printNow = async () => {
    if (!doc || doc.error) return;
    setBusy(true);
    try { await save(); const { printDocs } = await import('../lib/docs/pdf.js'); await printDocs(doc); } catch (e) { toast('Không in được: ' + e.message, 'err'); } finally { setBusy(false); }
  };

  // Chỉ quản trị (chủ sổ) xuất được ảnh PNG để gửi khách
  const downloadImage = async () => {
    if (!doc || doc.error) return;
    setBusy(true);
    try {
      await save();
      const [{ pdfBlob }, { pdfToImageBlob }] = await Promise.all([import('../lib/docs/pdf.js'), import('../lib/docs/image.js')]);
      const name = doc.filename.replace(/\.pdf$/i, '') + '.png';
      if (await saveFile(name, await pdfToImageBlob(await pdfBlob(doc)))) toast(`Đã tạo ${name}`);
    } catch (e) { toast('Không tạo được ảnh: ' + e.message, 'err'); } finally { setBusy(false); }
  };

  const dels = data?.dels || [];
  const title = withPay ? 'Phiếu thu & chứng từ giao hàng' : 'In / xuất chứng từ';
  const sub = subtitle ?? (data?.o ? `Đơn ${data.o.code} · ${data.o.customer_name || ''}` : '');
  const footer = <>
    <span className="muted small grow">{dirty ? 'Có thay đổi chưa lưu — bấm In / Tải PDF sẽ tự lưu.' : `${PAPERS[doc?.paper]?.label || 'Khổ A4'} · chữ trong PDF chọn và sao chép được.`}</span>
    <Btn onClick={onClose}>Đóng</Btn>
    {canSave && <Btn disabled={!dirty} onClick={async () => { if (await save()) toast('Đã lưu thông tin chứng từ'); }}>Lưu thông tin</Btn>}
    {can('owner') && <Btn icon="dl" busy={busy} disabled={!doc || !!doc?.error} onClick={downloadImage}>Tải ảnh</Btn>}
    <Btn icon="print" busy={busy} disabled={!doc || !!doc?.error} onClick={printNow}>In</Btn>
    <Btn kind="primary" icon="dl" busy={busy} disabled={!doc || !!doc?.error} onClick={download}>Tải PDF</Btn>
  </>;
  const content = (
    <>
      {types.length > 1 && <Tabs value={type} onChange={setType} tabs={tabTypes.map((t) => ({ value: t, label: DOC_TYPES[t].label }))} />}
      <ErrorBox error={err || doc?.error} />
      {!data ? !err && <Loading /> : (
        <div className="doc-wrap">
          <div className="doc-side">
            {kind === 'delivery' && <BatchExport deliveryId={id} pay={withPay ? pay : null} ds={ds} beforeExport={save} />}
            {perDelivery && !['payment', 'contract', 'quote'].includes(data.kind) && (
              <Field label="Lập theo">
                <Select value={src.kind === 'delivery' ? src.id : ''} onChange={(v) => setSrc(v ? { kind: 'delivery', id: v } : { kind: 'order', id: data.o.id })}
                  options={[{ value: '', label: 'Cả đơn (hàng còn trong đơn)' }, ...dels.map((d) => ({ value: d.id, label: `Phiếu giao ${d.code} · ${dmy(d.delivery_date)}` }))]} />
              </Field>
            )}
            {ready && (tpls.length > 1 || can('owner')) && (
              <Field label="Mẫu in">
                {tpls.length > 1 && <Select value={doc?.tplId || ''} onChange={(v) => pickTpl(type, v)} options={tpls.map((t) => ({ value: t.id, label: `${t.name}${t.is_default ? ' (mặc định)' : ''}` }))} />}
                {can('owner') && <button className="link-btn small" onClick={() => openTemplateEditor({ book: book.id, type, tpl: (ds.templates[type] || []).length ? doc?.tplId : '' })}>Sửa mẫu in này (mở tab mới)</button>}
              </Field>
            )}
            <button className="link-btn small" onClick={() => setShowForm((x) => !x)}>{showForm ? '▾' : '▸'} Thông tin trên chứng từ</button>
            {showForm && ready && <div className="stack-s">
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
                    {f.kind === 'date' ? <DateInput value={v || ''} onChange={set} />
                      : f.kind === 'money' ? <NumInput value={v === '' || v === undefined ? null : Number(v)} onChange={(x) => set(x === null ? '0' : String(x))} />
                      : f.kind === 'num' ? <Input value={v} onChange={(x) => set(x.replace(/[^\d]/g, ''))} inputMode="numeric" />
                      : <Input value={v} onChange={set} maxLength={500} />}
                  </Field>
                );
              })}
              {!canSave && <div className="muted small">Bạn không có quyền lưu thay đổi; nội dung sửa ở đây chỉ dùng cho lần tải này.</div>}
              {type === 'hoa_don' && <div className="muted small">Nợ cũ tự tính = công nợ hiện tại của khách trừ phần của đơn này. Tổng số hộp tự tính từ quy cách đóng gói của sản phẩm (hộp lẻ tính 1 hộp).</div>}
              <div className="muted small">Đơn vị phát hành, logo, nội dung và cách trình bày: Cài đặt → Mẫu in.</div>
            </div>}
          </div>
          <div className="doc-main">{doc && !doc.error ? <DocPreview doc={doc} /> : !doc?.error && <Loading />}</div>
        </div>
      )}
    </>
  );
  if (!page) return <Modal title={title} subtitle={sub} onClose={onClose} size="xl" footer={footer}>{content}</Modal>;
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
  ['website', 'Website'], ['tax_code', 'Mã số thuế'], ['bank_line', 'Dòng số tài khoản (sau chữ “STK:”)', true], ['representative', 'Người đại diện'], ['rep_title', 'Chức danh người đại diện'],
];
// Nhóm loại chứng từ ở cột trái (giống "Quản lý mẫu in" của KiotViet)
const TYPE_GROUPS = [
  ['Bán hàng', ['hoa_don', 'don_dat_hang', 'bao_gia']],
  ['Giao hàng', ['bien_ban', 'phieu_xuat_kho', 'hd_van_chuyen']],
  ['Hợp đồng', ['de_nghi_tam_ung', 'doi_chieu_sl', 'doi_chieu_tt', 'de_nghi_tt']],
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
  profiles: f.profiles, font: f.font,
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
  const doc = useMemo(() => { try { return buildPrintDoc(type, data, ds, defaults(type, data, ds), cur.id); } catch (e) { return { error: e.message }; } }, [type, ds, cur.id, data]);
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
    setF({ profiles: ds.profiles.map((p) => ({ ...p })), types, font: ds.font });
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
