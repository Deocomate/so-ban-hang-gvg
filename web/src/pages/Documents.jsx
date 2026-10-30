import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { dmy } from '../lib/format.js';
import { saveFile } from '../lib/excel.js';
import { Btn, Loading, ErrorBox, Note, Modal, Field, Input, TextArea, Select, DateInput, NumInput, Check, Section, Tabs, ConfirmBtn } from '../components/ui.jsx';
import { DOC_TYPES, DEFAULT_TEXTS, docSettings, loadDocData, buildDoc, defaults, currentInfo, editableFields, infoRef, profileFromBook } from '../lib/docs/model.js';

// Nạp phông nhúng trong PDF cho bản xem trước, để xem trước và tệp PDF giống hệt nhau
import ArimoR from '../assets/fonts/Arimo-Regular.ttf?url';
import ArimoB from '../assets/fonts/Arimo-Bold.ttf?url';
import ArimoI from '../assets/fonts/Arimo-Italic.ttf?url';
import ArimoBI from '../assets/fonts/Arimo-BoldItalic.ttf?url';
import TinosR from '../assets/fonts/Tinos-Regular.ttf?url';
import TinosB from '../assets/fonts/Tinos-Bold.ttf?url';
import TinosI from '../assets/fonts/Tinos-Italic.ttf?url';
import TinosBI from '../assets/fonts/Tinos-BoldItalic.ttf?url';
let fontsInjected = false;
function useDocFonts() {
  useEffect(() => {
    if (fontsInjected) return; fontsInjected = true;
    const face = (fam, url, w, st) => `@font-face{font-family:"${fam}";src:url("${url}") format("truetype");font-weight:${w};font-style:${st};font-display:swap}`;
    const el = document.createElement('style');
    el.textContent = [face('Arimo', ArimoR, 400, 'normal'), face('Arimo', ArimoB, 700, 'normal'), face('Arimo', ArimoI, 400, 'italic'), face('Arimo', ArimoBI, 700, 'italic'),
      face('Tinos', TinosR, 400, 'normal'), face('Tinos', TinosB, 700, 'normal'), face('Tinos', TinosI, 400, 'italic'), face('Tinos', TinosBI, 700, 'italic')].join('\n');
    document.head.appendChild(el);
  }, []);
}

const TYPES_FOR = { order: ['hoa_don', 'don_dat_hang', 'bien_ban', 'phieu_xuat_kho'], delivery: ['bien_ban', 'phieu_xuat_kho', 'hoa_don', 'don_dat_hang'], payment: ['phieu_thu'] };
const FONT_CSS = { Arimo: 'Arimo, Arial, "Helvetica Neue", sans-serif', Tinos: 'Tinos, "Times New Roman", Times, serif' };

// ---------- Bản xem trước (vẽ cùng danh sách khối với tệp PDF) ----------
const runEl = (r, i) => <span key={i} style={{ fontWeight: r.b ? 700 : undefined, fontStyle: r.i ? 'italic' : undefined, color: r.color }}>{r.text}</span>;
function cellEl(c, i, size, tall) {
  if (!c || (c.text === undefined && !c.runs && !c.colSpan)) return null;
  return (
    <td key={i} colSpan={c.colSpan || undefined} style={{ textAlign: c.align || 'left', fontWeight: c.b ? 700 : undefined, fontStyle: c.i ? 'italic' : undefined, verticalAlign: tall ? 'middle' : 'top' }}>
      {c.runs ? c.runs.map(runEl) : c.sub ? <>{c.text}<div style={{ fontStyle: 'italic', fontSize: `${size - 0.5}pt` }}>{c.sub}</div></> : c.text}
    </td>
  );
}
export function DocPreview({ doc }) {
  useDocFonts();
  // Thu nhỏ trang A4 cho vừa màn hình điện thoại
  const ref = React.useRef(null); const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { const w = el.clientWidth - 16; setZoom(Math.min(1, Math.max(0.3, w / 794))); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return (
    <div className="doc-scroll" ref={ref}>
      <div className="doc-page" style={{ fontFamily: FONT_CSS[doc.font], zoom }}>
        {doc.blocks.map((b, k) => {
          if (b.t === 'letterhead') {
            const lines = <div>{b.lines.map((l, i) => <div key={i} style={{ fontWeight: l.b ? 700 : 400, fontSize: `${l.size || b.size}pt`, marginBottom: `${b.gap ?? 2}pt` }}>{l.text}</div>)}</div>;
            return <div key={k}>{b.rule && <div className="doc-rule" />}{b.logo ? <div className="doc-lh"><img src={b.logo} alt="" />{lines}</div> : lines}</div>;
          }
          if (b.t === 'cols') return <div key={k} className="doc-cols">{b.cols.map((c, i) => <div key={i} style={{ flex: c.width === '*' ? 1 : `0 0 ${c.width}pt`, textAlign: c.align || 'left' }}>
            {c.lines.map((l, j) => <div key={j} style={{ fontWeight: l.b ? 700 : 400, fontStyle: l.i ? 'italic' : undefined, fontSize: `${l.size || b.size}pt` }}>{l.text}</div>)}</div>)}</div>;
          if (b.t === 'title') return <div key={k} style={{ fontWeight: 700, fontSize: `${b.size}pt`, textAlign: 'center', marginTop: `${b.mt || 0}pt`, marginBottom: `${b.mb || 2}pt` }}>{b.text}</div>;
          if (b.t === 'p') return <div key={k} style={{ fontSize: `${b.size}pt`, textAlign: b.align || 'left', lineHeight: b.lh || 1.2, marginTop: `${b.mt || 0}pt`, marginBottom: `${b.mb || 0}pt`, paddingLeft: `${b.indent || 0}pt`, color: b.color }}>{b.runs.map(runEl)}</div>;
          if (b.t === 'table') {
            const star = b.widths.includes('*');
            return (
              <table key={k} className="doc-table" style={{ fontSize: `${b.size}pt` }}>
                <colgroup>{b.widths.map((w, i) => <col key={i} style={{ width: w === '*' ? undefined : `${w}pt` }} />)}</colgroup>
                <thead><tr>{b.head.map((h, i) => cellEl(h, i, b.size))}</tr></thead>
                <tbody>{b.body.map((row, r) => { const tall = row.some((c) => c && c.sub); return <tr key={r}>{row.map((c, i) => cellEl(c, i, b.size, tall))}</tr>; })}</tbody>
              </table>
            );
          }
          if (b.t === 'sign') return (
            <div key={k} style={{ marginTop: `${b.mt || 0}pt`, fontSize: `${b.size}pt` }}>
              <div className="doc-sign">{b.cols.map((c, i) => <div key={i}><b>{c.title}</b>{c.note && <div style={{ fontStyle: 'italic', fontSize: `${b.size - 1}pt` }}>{c.note}</div>}</div>)}</div>
              <div className="doc-sign" style={{ marginTop: `${b.space || 48}pt` }}>{b.cols.map((c, i) => <div key={i}><b>{c.name || ' '}</b></div>)}</div>
            </div>
          );
          return null;
        })}
      </div>
    </div>
  );
}

// ---------- Hộp thoại xuất chứng từ ----------
export function DocDialog({ kind, id, type: type0, onClose }) {
  const { q, rpc, book, settings, can, toast } = useApp();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const types = TYPES_FOR[kind];
  const [type, setType] = useState(type0 && types.includes(type0) ? type0 : types[0]);
  const [src, setSrc] = useState({ kind, id });
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  const [edit, setEdit] = useState({}); const [busy, setBusy] = useState(false); const [reload, setReload] = useState(0);
  const [showForm, setShowForm] = useState(true);
  useEffect(() => {
    let alive = true; setErr(null);
    loadDocData(q, rpc, src).then((d) => alive && setData(d)).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [src.kind, src.id, reload]);
  // Biên bản / phiếu xuất kho theo từng lần giao; hóa đơn / đơn đặt hàng theo cả đơn
  const perDelivery = type === 'bien_ban' || type === 'phieu_xuat_kho';
  useEffect(() => {
    if (!data || data.kind === 'payment') return;
    if (!perDelivery && src.kind === 'delivery') setSrc({ kind: 'order', id: data.o.id });
  }, [type, data]);
  useEffect(() => { setEdit({}); }, [type, src.kind, src.id]);

  const ready = data && (data.kind === 'payment' || !(perDelivery ? false : src.kind === 'delivery'));
  const fields = ready ? editableFields(type, data) : [];
  const saved = ready ? currentInfo(type, data) || {} : {};
  const info = ready ? { ...defaults(type, data, ds), ...saved, ...edit } : null;
  const doc = useMemo(() => { if (!ready) return null; try { return buildDoc(type, data, ds, info); } catch (e) { return { error: e.message }; } }, [ready, type, data, ds, JSON.stringify(info)]);
  const dirty = Object.keys(edit).length > 0;
  const canSave = data?.kind === 'payment' ? can('thu_chi') : can('ban_hang');

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

  const dels = data?.dels || [];
  const orderId = data?.o?.id;
  return (
    <Modal title="Xuất chứng từ PDF" subtitle={data ? (data.kind === 'payment' ? `Phiếu ${data.p.code}` : `Đơn ${data.o.code} · ${data.o.customer_name || ''}`) : ''} onClose={onClose} size="xl"
      footer={<>
        <span className="muted small grow">{dirty ? 'Có thay đổi chưa lưu — bấm Tải PDF sẽ tự lưu.' : 'Khổ A4 · chữ trong PDF chọn và sao chép được.'}</span>
        <Btn onClick={onClose}>Đóng</Btn>
        {canSave && <Btn disabled={!dirty} onClick={async () => { if (await save()) toast('Đã lưu thông tin chứng từ'); }}>Lưu thông tin</Btn>}
        <Btn kind="primary" icon="dl" busy={busy} disabled={!doc || !!doc?.error} onClick={download}>Tải PDF</Btn>
      </>}>
      {types.length > 1 && <Tabs value={type} onChange={setType} tabs={types.map((t) => ({ value: t, label: DOC_TYPES[t].label }))} />}
      <ErrorBox error={err || doc?.error} />
      {!data ? !err && <Loading /> : (
        <div className="doc-wrap">
          <div className="doc-side">
            {perDelivery && data.kind !== 'payment' && (
              <Field label="Lập theo">
                <Select value={src.kind === 'delivery' ? src.id : ''} onChange={(v) => setSrc(v ? { kind: 'delivery', id: v } : { kind: 'order', id: orderId })}
                  options={[{ value: '', label: 'Cả đơn (hàng còn trong đơn)' }, ...dels.map((d) => ({ value: d.id, label: `Phiếu giao ${d.code} · ${dmy(d.delivery_date)}` }))]} />
              </Field>
            )}
            <button className="link-btn small" onClick={() => setShowForm((x) => !x)}>{showForm ? '▾' : '▸'} Thông tin trên chứng từ</button>
            {showForm && ready && <div className="stack-s">
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
              <div className="muted small">Đơn vị phát hành, logo, ghi chú chính sách: Cài đặt → Mẫu chứng từ.</div>
            </div>}
          </div>
          <div className="doc-main">{doc && !doc.error ? <DocPreview doc={doc} /> : !doc?.error && <Loading />}</div>
        </div>
      )}
    </Modal>
  );
}

function FontLoader() { useDocFonts(); return null; }

// ---------- Cài đặt → Mẫu chứng từ ----------
const PROFILE_FIELDS = [
  ['name', 'Tên in đầu trang (IN HOA)', true], ['legal_name', 'Tên dùng trong nội dung', true], ['address', 'Địa chỉ', true], ['phone', 'Điện thoại'], ['email', 'Email'],
  ['website', 'Website'], ['bank_line', 'Dòng số tài khoản (sau chữ “STK:”)', true], ['representative', 'Người đại diện'], ['rep_title', 'Chức danh người đại diện'],
];
const TEXT_FIELDS = {
  hoa_don: [['invoice_notes', 'Ghi chú / chính sách đổi trả (in cuối hóa đơn)', 12, 'Mỗi dòng một ý. Bọc chữ trong **hai dấu sao** để in đậm. Thụt đầu dòng bằng dấu cách để lùi vào.']],
  don_dat_hang: [['order_footer', 'Dòng cuối đơn đặt hàng', 2]],
  bien_ban: [['handover_closing', 'Đoạn cam kết cuối biên bản', 3], ['goods_condition', 'Tình trạng hàng hóa mặc định', 1]],
  phieu_xuat_kho: [['form_xuat', 'Mẫu số (góc phải)', 3]],
  phieu_thu: [['form_thu', 'Mẫu số phiếu thu', 3], ['form_chi', 'Mẫu số phiếu chi', 3]],
};

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

export function DocTemplateSettings() {
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
  const setT = (t, k, v) => setF((s) => ({ ...s, types: { ...s.types, [t]: { ...s.types[t], [k]: v } } }));
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
      const size = JSON.stringify(f).length;
      if (size > 900000) throw new Error('Logo quá lớn — chọn ảnh nhỏ hơn');
      const types = Object.fromEntries(Object.entries(f.types).map(([k, t]) => [k, { profile: t.profile, sep: t.sep, show_price: t.show_price, show_form: t.show_form,
        text: Object.fromEntries(Object.entries(t.text || {}).filter(([, v]) => v !== undefined && v !== null)) }]));
      await rpc('update_book_settings', { settings: { docs: { profiles: f.profiles, types, font: f.font } } });
      await loadBooks(); refresh(); toast('Đã lưu mẫu chứng từ');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack-l" style={{ maxWidth: 920 }}>
      <Note>Hóa đơn bán hàng, đơn đặt hàng, biên bản bàn giao, phiếu xuất kho và phiếu thu/chi được xuất ra PDF khổ A4 từ màn hình chi tiết đơn hàng, phiếu giao và phiếu thu. Mỗi loại chứng từ chọn một <b>đơn vị phát hành</b> (ví dụ hóa đơn do hộ kinh doanh xuất, biên bản bàn giao do công ty xuất).</Note>
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
                <Field label="Logo (in ở góc trái biên bản / đầu trang)" wide>
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
          <Field label="Phông chữ cho tất cả chứng từ" hint="Hóa đơn, đơn đặt hàng, biên bản, phiếu xuất kho và phiếu thu/chi dùng chung phông này. Phông được nhúng sẵn trong PDF nên máy nào mở cũng giống nhau.">
            <Select value={f.font} onChange={(v) => setF((s) => ({ ...s, font: v }))} options={[{ value: 'Arimo', label: 'Arial (Arimo) — chữ không chân' }, { value: 'Tinos', label: 'Times New Roman (Tinos) — chữ có chân' }]} />
          </Field>
          <div className="row gap" style={{ alignItems: 'center' }}>
            <span style={{ fontFamily: 'Arimo, Arial, sans-serif', fontSize: 16, opacity: f.font === 'Arimo' ? 1 : .45 }}>Hóa đơn bán hàng</span>
            <span style={{ fontFamily: 'Tinos, "Times New Roman", serif', fontSize: 16, opacity: f.font === 'Tinos' ? 1 : .45 }}>Hóa đơn bán hàng</span>
          </div>
        </div>
      </Section>
      <Section title="Từng loại chứng từ">
        <div className="stack-l">
          {Object.entries(DOC_TYPES).map(([k, t]) => (
            <div key={k} className="card stack-s">
              <b>{t.label}</b>
              <div className="grid">
                <Field label="Đơn vị phát hành"><Select value={f.types[k].profile} onChange={(v) => setT(k, 'profile', v)} options={f.profiles.map((p) => ({ value: p.id, label: p.name }))} /></Field>
                <Field label="Dấu phân cách hàng nghìn"><Select value={f.types[k].sep} onChange={(v) => setT(k, 'sep', v)} options={[{ value: ',', label: '24,000,000 (dấu phẩy)' }, { value: '.', label: '24.000.000 (dấu chấm)' }]} /></Field>
              </div>
              {k === 'phieu_xuat_kho' && <Check checked={f.types[k].show_price} onChange={(v) => setT(k, 'show_price', v)}>In đơn giá và thành tiền trên phiếu xuất kho</Check>}
              {(k === 'phieu_xuat_kho' || k === 'phieu_thu') && <Check checked={f.types[k].show_form} onChange={(v) => setT(k, 'show_form', v)}>In dòng “Mẫu số … Thông tư 88/2021/TT-BTC” ở góc phải</Check>}
              {(TEXT_FIELDS[k] || []).map(([tk, label, rows, hint]) => {
                const cur = f.types[k].text?.[tk];
                return (
                  <Field key={tk} label={label} hint={hint} wide>
                    <TextArea rows={rows} value={cur ?? DEFAULT_TEXTS[tk]} onChange={(v) => setTxt(k, tk, v)} />
                    {cur !== undefined && cur !== DEFAULT_TEXTS[tk] && <button className="link-btn small" onClick={() => setTxt(k, tk, undefined)}>Dùng lại nội dung mặc định</button>}
                  </Field>
                );
              })}
            </div>
          ))}
        </div>
      </Section>
      <div><Btn kind="primary" busy={busy} onClick={save}>Lưu mẫu chứng từ</Btn></div>
    </div>
  );
}
