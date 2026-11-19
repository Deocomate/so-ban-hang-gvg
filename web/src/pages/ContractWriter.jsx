// Soạn hợp đồng theo mẫu: chọn loại (kinh tế / cá nhân / nguyên tắc) → điền các trường (đã điền sẵn từ đơn, khách, đơn vị đứng tên)
// → xem trước đúng khổ A4 → sửa trực tiếp nội dung bằng trình soạn, hoặc gắn link Google Docs cho hợp đồng phức tạp → lưu, in, tải PDF.
import React, { useEffect, useMemo, useReducer, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { TextStyle, Color, BackgroundColor, FontFamily, FontSize } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import { useApp } from '../lib/store.jsx';
import { packView } from '../lib/book-profile.js';
import { todayVN } from '../lib/format.js';
import { saveFile } from '../lib/excel.js';
import { docSettings, loadDocData } from '../lib/docs/model.js';
import { FONT_CSS, sanitizeHtml } from '../lib/docs/templates.js';
import { useDocFonts } from '../lib/docs/fonts.js';
import { StyleAttr, TableX, HrX, PageBreak, TokenNode, toEditorHtml, fromEditorHtml } from '../lib/docs/editor-ext.js';
import { CONTRACT_KINDS, fieldsFor, contractDefaults, contractHtml, buildContractDoc, suggestKind } from '../lib/docs/contract-templates.js';
import { RichToolbar } from '../components/RichToolbar.jsx';
import { DocPreview } from './Documents.jsx';
import { googlePreview } from './OrderDocs.jsx';
import { Btn, Field, Input, TextArea, DateInput, ErrorBox, Loading, Note, Modal, Tabs } from '../components/ui.jsx';

const MODES = [{ value: 'form', label: 'Điền theo mẫu' }, { value: 'edit', label: 'Sửa trực tiếp' }, { value: 'gdoc', label: 'Google Docs' }];

export default function ContractWriter({ id: id0, order_id, onClose }) {
  useDocFonts();
  const { q, rpc, book, settings, can, toast, refresh } = useApp();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const [id, setId] = useState(id0 || null);
  const [data, setData] = useState(null); const [err, setErr] = useState(null);
  const [kind, setKind] = useState(null);
  const [fields, setFields] = useState({}); // chỉ các trường người dùng đã sửa (còn lại theo mặc định)
  const [body, setBody] = useState(null);    // nội dung sửa trực tiếp; null = dựng từ mẫu
  const [gdoc, setGdoc] = useState('');
  const [mode, setMode] = useState('form');
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const edit = can('ban_hang');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const src = id0 ? { kind: 'contract', id: id0 } : { kind: 'order', id: order_id };
        const d = await loadDocData(q, rpc, src);
        const dd = { ...d, prods: Object.fromEntries(Object.entries(d.prods || {}).map(([k, p]) => [k, packView(p, settings)])) };
        // Đơn đã có hợp đồng (mở từ đơn): sửa đúng hợp đồng đó
        const kid = id0 || dd.k?.id || null;
        const saved = kid ? await rpc('get_contract_doc', { id: kid }) : null;
        // Hợp đồng mới: số theo ngày ký đã có người dùng (hai hợp đồng ký cùng ngày) thì thêm hậu tố -2, -3…
        let start = {};
        if (!kid) {
          const k0 = suggestKind(dd.cust); const base = contractDefaults(k0, dd, ds).so_hd;
          const taken = new Set((await q('contracts', [], 'sign_date desc', 2000)).map((x) => x.code));
          if (taken.has(base)) { let n = 2; const [head, ...rest] = base.split('/'); while (taken.has([`${head}-${n}`, ...rest].join('/'))) n++; start = { so_hd: [`${head}-${n}`, ...rest].join('/') }; }
        }
        if (!alive) return;
        setData(dd); setId(kid);
        const hasSaved = saved && (Object.keys(saved.fields || {}).length || saved.body_html || saved.gdoc_url);
        setKind(hasSaved ? saved.kind : suggestKind(dd.cust));
        setFields(saved?.fields || start); setBody(saved?.body_html || null); setGdoc(saved?.gdoc_url || '');
        if (saved?.gdoc_url && !saved.body_html && !Object.keys(saved.fields || {}).length) setMode('gdoc');
      } catch (e) { if (alive) setErr(e.message); }
    })();
    return () => { alive = false; };
  }, [id0, order_id]);

  const defs = useMemo(() => (data && kind ? contractDefaults(kind, data, ds) : {}), [data, kind, ds]);
  const f = { ...defs, ...fields };
  const doc = useMemo(() => (data && kind ? buildContractDoc(kind, fields, data, ds, body) : null), [data, kind, fields, ds, body]);
  const setField = (k, v) => { setFields((s) => ({ ...s, [k]: v })); setDirty(true); };
  const changeKind = (k) => {
    if (k === kind) return;
    if (body && !window.confirm('Hợp đồng đang có nội dung sửa trực tiếp. Đổi loại sẽ dựng lại nội dung từ mẫu mới — tiếp tục?')) return;
    setKind(k); setBody(null); setDirty(true);
    // Giữ thông tin hai bên đã sửa, bỏ phần điều khoản riêng của loại cũ
    // Số hợp đồng giữ nguyên, chỉ đổi đuôi HĐKT ↔ HĐNT theo loại
    setFields((s) => {
      const keep = Object.fromEntries(Object.entries(s).filter(([x]) => /^(a_|b_|ngay_ky|noi_ky|dia_diem_ky)/.test(x)));
      if (s.so_hd) keep.so_hd = String(s.so_hd).replace(/HĐ(KT|NT)$/, k === 'nguyen_tac' ? 'HĐNT' : 'HĐKT');
      return keep;
    });
  };

  const save = async () => {
    if (!edit) return null;
    setBusy(true);
    try {
      let kid = id;
      if (!kid) {
        const r = await rpc('save_contract', { order_id, sign_date: f.ngay_ky || todayVN(), code: String(f.so_hd || '').trim() || null });
        kid = r.id; setId(kid);
      }
      await rpc('save_contract_doc', { id: kid, kind, fields, body_html: body, gdoc_url: gdoc.trim() || null });
      setDirty(false); refresh(); toast('Đã lưu hợp đồng');
      return kid;
    } catch (e) { toast(e.message, 'err'); return null; } finally { setBusy(false); }
  };
  const exportPdf = async () => {
    if (!doc) return;
    setBusy(true);
    try { const { pdfBlob } = await import('../lib/docs/pdf.js'); if (await saveFile(doc.filename, await pdfBlob(doc))) toast(`Đã tạo ${doc.filename}`); }
    catch (e) { toast('Không tạo được PDF: ' + e.message, 'err'); } finally { setBusy(false); }
  };
  const printNow = async () => { if (!doc) return; try { const { printDocs } = await import('../lib/docs/pdf.js'); await printDocs(doc); } catch (e) { toast('Không in được: ' + e.message, 'err'); } };
  const close = () => { if (dirty && !window.confirm('Hợp đồng chưa lưu. Đóng và bỏ thay đổi?')) return; onClose(); };

  const title = id ? `Hợp đồng ${f.so_hd || data?.k?.code || ''}` : 'Soạn hợp đồng';
  const sub = data ? `Đơn ${data.o.code} · ${data.o.customer_name || ''}` : null;
  return (
    <Modal title={title} subtitle={sub} onClose={close} size="xl"
      footer={<>
        <span className="muted small grow">{dirty ? 'Có thay đổi chưa lưu.' : body ? 'Nội dung đã sửa trực tiếp.' : 'Nội dung dựng từ mẫu theo các trường đã điền.'}</span>
        <Btn onClick={close}>Đóng</Btn>
        {edit && <Btn kind={dirty ? 'soft' : 'ghost'} busy={busy} disabled={!kind} onClick={save}>Lưu hợp đồng</Btn>}
        <Btn icon="print" disabled={!doc} onClick={printNow}>In</Btn>
        <Btn kind="primary" icon="dl" busy={busy} disabled={!doc} onClick={exportPdf}>Tải PDF</Btn>
      </>}>
      <ErrorBox error={err} />
      {!data || !kind ? !err && <Loading /> : <div className="stack">
        <div className="kind-cards">
          {Object.entries(CONTRACT_KINDS).map(([k, x]) => (
            <button key={k} type="button" className={`kind-card${k === kind ? ' on' : ''}`} disabled={!edit} onClick={() => changeKind(k)}>
              <b>{x.label}</b><span className="small muted">{x.sub}</span>
            </button>
          ))}
        </div>
        <Tabs value={mode} onChange={setMode} tabs={MODES} />
        {mode === 'form' && <div className="doc-wrap cw-wrap">
          <div className="doc-side cw-side">
            {body && <Note tone="warn">Hợp đồng đã được sửa trực tiếp nên các trường dưới đây không còn áp vào nội dung.
              {edit && <> <button className="link-btn" onClick={() => { if (window.confirm('Bỏ phần đã sửa trực tiếp và dựng lại từ mẫu theo các trường?')) { setBody(null); setDirty(true); } }}>Dựng lại từ mẫu</button></>}</Note>}
            {fieldsFor(kind).map((g) => (
              <details key={g.id} className="cw-group" open={g.id !== 'dieu_khoan' && g.id !== 'ben_b'}>
                <summary>{g.label}</summary>
                <div className="stack-s">
                  {g.fields.map((x) => (
                    <Field key={x.key} label={x.label} hint={x.hint}>
                      {x.type === 'area' ? <TextArea value={f[x.key] ?? ''} rows={x.rows || 3} onChange={(v) => setField(x.key, v)} disabled={!edit} />
                        : x.type === 'date' ? <DateInput value={f[x.key] || ''} onChange={(v) => setField(x.key, v)} />
                        : <Input value={f[x.key] ?? ''} onChange={(v) => setField(x.key, v)} disabled={!edit} />}
                    </Field>
                  ))}
                </div>
              </details>
            ))}
            <div className="muted small">Ô nhiều dòng: dòng bắt đầu "- " là gạch đầu dòng, "+ " là ý con, "# " là tiêu đề in đậm. Bảng hàng hóa lấy từ đơn hàng.</div>
          </div>
          <div className="doc-main"><DocPreview doc={doc} /></div>
        </div>}
        {mode === 'edit' && <DirectEditor key={kind} html={body ?? contractHtml(kind, f, data)} readOnly={!edit}
          onChange={(h) => { setBody(h); setDirty(true); }} edited={!!body} onReset={() => { setBody(null); setDirty(true); return contractHtml(kind, f, data); }} />}
        {mode === 'gdoc' && <GoogleDocTab url={gdoc} edit={edit} onChange={(v) => { setGdoc(v); setDirty(true); }} />}
      </div>}
    </Modal>
  );
}

// Trình soạn văn bản chuẩn (TipTap) trên trang A4: sửa tự do mọi chữ, bảng, định dạng của hợp đồng
function DirectEditor({ html, onChange, readOnly, edited, onReset }) {
  const { toast } = useApp();
  const [grid, setGrid] = useState(true);
  const [, repaint] = useReducer((x) => x + 1, 0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ horizontalRule: false, code: false, codeBlock: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      TextStyle, Color, BackgroundColor, FontFamily, FontSize, TextAlign.configure({ types: ['heading', 'paragraph'] }), Subscript, Superscript,
      Image.configure({ inline: true, allowBase64: true }),
      TableX.configure({ resizable: true, lastColumnResizable: false, cellMinWidth: 24 }), TableRow, TableHeader, TableCell,
      HrX, PageBreak, TokenNode, StyleAttr,
    ],
    content: toEditorHtml(sanitizeHtml(html)),
    editable: !readOnly,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'tpl te-doc', spellcheck: 'false' } },
    onUpdate: ({ editor: ed }) => onChange(fromEditorHtml(ed.getHTML())),
    onTransaction: () => repaint(),
  });
  if (!editor || editor.isDestroyed) return <Loading />;
  return (
    <div className="cw-editor">
      {!readOnly && <RichToolbar editor={editor} toast={toast} grid={grid} onGrid={setGrid}
        tail1={<><span className="grow" />{edited && <button type="button" className="link-btn small" onClick={() => { if (window.confirm('Bỏ mọi chỗ đã sửa trực tiếp và dựng lại từ mẫu?')) { const h = onReset(); editor.commands.setContent(toEditorHtml(sanitizeHtml(h)), { emitUpdate: false }); } }}>Dựng lại từ mẫu</button>}</>} />}
      <div className={`te-canvas cw-canvas${grid ? ' grid' : ''}`}>
        <div className="te-paper te-shadow" style={{ width: '210mm', minHeight: '297mm', padding: '15mm 15mm 15mm 20mm', fontFamily: FONT_CSS.Tinos }}><EditorContent editor={editor} /></div>
      </div>
    </div>
  );
}

// Hợp đồng phức tạp soạn trên Google Docs: gắn link, xem nhúng ngay trong phần mềm
function GoogleDocTab({ url, edit, onChange }) {
  const pv = googlePreview(url);
  return (
    <div className="stack-s">
      <Field label="Link Google Docs của hợp đồng" hint="Chia sẻ tài liệu cho người cần xem. Khi có link, hợp đồng vẫn in được theo mẫu nếu cần.">
        <div className="row gap-s"><Input value={url} onChange={onChange} placeholder="https://docs.google.com/document/d/…/edit" disabled={!edit} />
          {url && <a className="btn btn-ghost" href={url} target="_blank" rel="noopener noreferrer">Mở để sửa</a>}</div>
      </Field>
      {pv ? <iframe className="doc-frame" src={pv} title="Hợp đồng trên Google Docs" />
        : url ? <Note tone="warn">Link chưa phải tài liệu Google Docs / Drive nên không xem trước được.</Note>
        : <Note>Dán link Google Docs để xem hợp đồng ngay tại đây. Dùng cho hợp đồng nhiều phụ lục, nhiều bên cùng sửa.</Note>}
    </div>
  );
}
