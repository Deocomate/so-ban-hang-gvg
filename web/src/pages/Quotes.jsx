// Báo giá: phân hệ độc lập. Chỉ khi bấm "Chuyển sang đơn" mới sao chép khách và dòng hàng sang màn tạo đơn.
// Màn lập báo giá toàn màn hình giống màn tạo hóa đơn: ô tìm hàng ở trên, dòng hàng theo nhóm bên trái, khách và tổng tiền bên phải.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, match, norm, todayVN } from '../lib/format.js';
import { ProductSearch } from './OrderPos.jsx';
import { useProducts, useCustomers, priceOf, usePriceBooks, booksFor, autoBookFor } from '../lib/lookups.js';
import { docSettings, DEFAULT_TEXTS, weightOf } from '../lib/docs/model.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, Icon, Pill, Input, TextArea, Select, DateInput, NumInput, Check, Search, ErrorBox, Loading, Note, Table, Modal, Picker, KV, ListPage, FilterBox, RadioList } from '../components/ui.jsx';
import { useTimeFilter, TimeFilter } from '../components/DocFilters.jsx';

const STATUS = { nhap: ['Nháp', 'neutral'], da_gui: ['Đã gửi khách', 'info'], chot: ['Đã chốt', 'good'], huy: ['Đã hủy', 'mute'] };
const QStatus = ({ v }) => <Pill tone={STATUS[v]?.[1]}>{STATUS[v]?.[0]}</Pill>;
let seq = 0;
const newLine = () => ({ key: ++seq, product_id: null, name: '', spec: '', image: '', note: '', measure: null, measure_unit: 'm2', norm: null, deduct: null, qty: null, unit: 'viên', price: 0, manual: false });

// Quy cách gộp từ danh mục: kích thước, cân nặng, chất liệu, màu sắc
const specOf = (p) => [p.size, p.weight_per_unit ? `${fq(p.weight_per_unit)} kg` : '', p.material, p.color].filter(Boolean).join(', ');
// Số lượng = khối lượng × định mức − phần diềm trừ đi
const autoQty = (l) => (l.measure && l.norm ? Math.round(Number(l.measure) * Number(l.norm) - (Number(l.deduct) || 0)) : l.qty);

export function QuotesPage() {
  const { open, can } = useApp();
  const q = useQ('quotes', [], 'created_at desc', 2000);
  const [search, setSearch] = useState(''); const [st, setSt] = useState('');
  const time = useTimeFilter('month');
  const all = useMemo(() => (q.data || []).filter((x) => time.inRange(x.quote_date)), [q.data, time.time]);
  const rows = useMemo(() => all.filter((x) => (!st || x.status === st) && match(`${x.code} ${x.customer_name} ${x.site || ''}`, search)), [all, st, search]);
  return (
    <ListPage title="Báo giá"
      filters={<><TimeFilter filter={time} /><FilterBox title="Trạng thái"><RadioList value={st} onChange={setSt} options={[{ value: '', label: 'Tất cả', count: all.length }, ...Object.entries(STATUS).map(([value, [label]]) => ({ value, label, count: all.filter((x) => x.status === value).length }))]} /></FilterBox></>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã, khách, công trình…" />}
      actions={can('ban_hang') && <Btn kind="primary" icon="plus" onClick={() => open('quote-form', {})}>Tạo báo giá</Btn>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} empty="Chưa có báo giá" onRow={(x) => open('quote', { id: x.id })} columns={[
        { key: 'c', label: 'Báo giá', render: (x) => <><b>{x.code}</b><div className="cell-sub">{dmy(x.quote_date)}</div></> },
        { key: 'k', label: 'Khách hàng', render: (x) => <><div>{x.customer_name}</div><div className="cell-sub">{x.site || ''}</div></> },
        { key: 't', label: 'Mẫu', render: (x) => (x.template === 'mosaic' ? 'Tranh mosaic' : 'Ngói / gốm') },
        { key: 'v', label: 'Tổng thanh toán', align: 'right', render: (x) => money(x.total) },
        { key: 's', label: 'Trạng thái', render: (x) => <div className="row gap-s"><QStatus v={x.status} />{x.status === 'da_gui' && x.age_days > 3 && <Pill tone="warn">cần chăm sóc</Pill>}</div> },
        { key: 'o', label: 'Đơn', render: (x) => x.order_code || '—' },
      ]} />
    </ListPage>
  );
}

// Ô tên sản phẩm có gợi ý: gõ một phần tên / mã (không cần dấu, không cần đúng thứ tự từ) → hiện tên đầy đủ để chọn.
// Không chọn gợi ý thì giữ nguyên tên tự gõ (dòng tự nhập).
function ProductNameInput({ value, onChange, onPick, products }) {
  const [open, setOpen] = useState(false); const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const q = String(value || '').trim();
  const list = useMemo(() => (open && q.length >= 2 ? (products || []).filter((p) => match(`${p.sku} ${p.name} ${p.color || ''} ${p.size || ''}`, q)).slice(0, 12) : []), [open, q, products]);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const pick = (p) => { setOpen(false); onPick(p); };
  return (
    <div className="picker" ref={ref}>
      <input className="inp" value={value ?? ''} placeholder="Tên sản phẩm — gõ để tìm trong danh mục" aria-label="Tên sản phẩm" autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!list.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(list[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {list.length > 0 && (
        <div className="picker-menu">
          {list.map((p, i) => (
            <button type="button" key={p.id} className={`picker-item${i === hi ? ' hi' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              <span>{p.name}</span><span className="muted small">{[p.sku, specOf(p)].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Trừ diềm tự động (theo MẪU BÁO GIÁ.xlsx của TH Ceramics) ----------
// Diềm âm / dương = số m × định mức. Ngói âm = số m² × định mức − số lượng Diềm âm cùng nhóm hàng;
// Ngói dương trừ Diềm dương; ngói âm dương (tính theo cặp) trừ diềm âm dương. Các loại khác = khối lượng × định mức.
const isEdge = (name) => norm(name).trim().startsWith('diem');
const isTile = (name) => norm(name).trim().startsWith('ngoi');
function sideOf(name) {
  const w = norm(name).split(/[^a-z0-9]+/);
  const am = w.includes('am'); const du = w.includes('duong');
  return am && du ? 'cap' : am ? 'am' : du ? 'duong' : null;
}
// Tính lại số lượng diềm, phần trừ diềm và số lượng ngói của một nhóm hàng (dòng đã sửa tay giữ nguyên)
function recalcLines(lines, mosaic) {
  if (mosaic) return lines.map((l) => (l.qty_manual ? l : { ...l, qty: l.measure ?? l.qty }));
  const withEdges = lines.map((l) => (isEdge(l.name) && !l.qty_manual ? { ...l, qty: autoQty(l) } : l));
  return withEdges.map((l) => {
    if (isEdge(l.name)) return l;
    let n = l;
    if (isTile(l.name) && !l.deduct_manual) {
      const s = sideOf(l.name);
      const d = s ? withEdges.filter((x) => x !== l && isEdge(x.name) && sideOf(x.name) === s).reduce((t, x) => t + (Number(x.qty) || 0), 0) : 0;
      n = { ...n, deduct: d || null };
    }
    return n.qty_manual ? n : { ...n, qty: autoQty(n) };
  });
}
// Báo giá đã lưu: dòng nào số lượng / trừ diềm khác công thức thì coi là đã sửa tay để không bị tính đè khi mở lại
function markManual(lines, mosaic) {
  const auto = recalcLines(lines.map((l) => ({ ...l, qty_manual: false, deduct_manual: false })), mosaic);
  return lines.map((l, i) => ({ ...l, deduct_manual: (Number(l.deduct) || 0) !== (Number(auto[i].deduct) || 0), qty_manual: (Number(l.qty) || 0) !== (Number(auto[i].qty) || 0) }));
}

// Một dòng hàng của báo giá, cùng kiểu dòng hàng ở màn tạo hóa đơn
function QuoteLine({ l, i, mosaic, showNorm, onChange, onDel, pmap, products, onPick }) {
  const p = pmap[l.product_id];
  const set = (patch) => {
    const n = { ...l, ...patch };
    if ('measure_unit' in patch && p) n.norm = patch.measure_unit === 'm' ? p.norm_m : p.norm_m2;
    if ('measure' in patch || 'norm' in patch || 'measure_unit' in patch) n.qty_manual = false;
    onChange(n);
  };
  const amount = (Number(l.qty) || 0) * (Number(l.price) || 0);
  const auto = !mosaic && isTile(l.name) && sideOf(l.name);
  return (
    <div className="pos-line qline" data-line={l.key}>
      <div className="pos-line-no">{i + 1}</div>
      <button className="pos-line-del" onClick={onDel} aria-label="Xóa dòng" title="Xóa dòng"><Icon name="x" size={16} /></button>
      <div className="pos-line-info">
        {p && <span className="small muted">{p.sku}</span>}
        <ProductNameInput value={l.name} onChange={(v) => set({ name: v })} onPick={onPick} products={products} />
        <input className="pos-note qline-spec" value={l.spec || ''} onChange={(e) => set({ spec: e.target.value })} placeholder="Quy cách (kích thước, cân nặng, chất liệu, màu)" aria-label="Quy cách" />
        <input className="pos-note" value={l.note || ''} onChange={(e) => set({ note: e.target.value })} placeholder={mosaic ? 'Ghi chú: họa tiết tranh…' : 'Ghi chú dưới tên hàng'} aria-label="Ghi chú" maxLength={300} />
      </div>
      <div className="pos-line-total">{money(amount)}</div>
      <div className="qline-calc">
        <label className="q-mini"><span>Khối lượng</span><NumInput money={false} min={0} value={l.measure} onChange={(v) => set({ measure: v })} aria-label="Khối lượng" /></label>
        {!mosaic && <label className="q-mini q-unit"><span>Theo</span><Select value={l.measure_unit || 'm2'} onChange={(v) => set({ measure_unit: v })} options={[{ value: 'm2', label: 'm²' }, { value: 'm', label: 'm' }]} aria-label="Đơn vị khối lượng (m² hoặc mét dài)" /></label>}
        {!mosaic && <label className="q-mini"><span title={showNorm ? 'In ra báo giá' : 'Không in ra báo giá'}>Định mức</span><NumInput money={false} min={0} value={l.norm} onChange={(v) => set({ norm: v })} aria-label="Định mức" /></label>}
        {!mosaic && !isEdge(l.name) && <label className="q-mini"><span>Trừ diềm{auto && !l.deduct_manual ? ' (tự)' : ''}</span>
          <NumInput money={false} min={0} value={l.deduct} onChange={(v) => set({ deduct: v, deduct_manual: v != null, qty_manual: false })} aria-label="Trừ số lượng diềm"
            title={auto ? 'Tự lấy số lượng diềm cùng loại trong nhóm; xóa số đã gõ để tính lại' : 'Số lượng trừ đi'} /></label>}
        <label className="q-mini"><span>Số lượng{l.qty_manual && l.measure ? ' (tay)' : ''}</span><NumInput money={false} min={0} value={l.qty} onChange={(v) => set({ qty: v, qty_manual: v != null })} aria-label="Số lượng" /></label>
        <label className="q-mini q-unit"><span>ĐVT</span><Input value={l.unit} onChange={(v) => set({ unit: v })} aria-label="Đơn vị tính" /></label>
        <label className="q-mini qline-price"><span>Đơn giá</span><NumInput suffix={false} min={0} value={l.price} onChange={(v) => set({ price: v })} aria-label="Đơn giá" /></label>
      </div>
    </div>
  );
}

export function QuoteForm({ id, onClose, onSaved }) {
  const { rpc, book, settings, toast, open, session } = useApp();
  const products = useProducts(); const customers = useCustomers(); const priceBooks = usePriceBooks();
  const { run, busy } = useAction();
  const searchRef = useRef(null); const rootRef = useRef(null);
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const mosaicBook = book.short_name === 'AN';
  const textOf = (k) => ds.types.bao_gia.text?.[k] ?? DEFAULT_TEXTS[k];
  const [f, setF] = useState({ template: mosaicBook ? 'mosaic' : 'ngoi', customer_id: '', customer_name: '', address: '', site: '', quote_date: todayVN(), profile_id: ds.types.bao_gia.profile,
    groups: [{ key: ++seq, name: '', note: '', lines: [] }], vat_mode: 'them', vat_rate: settings.default_vat ?? 8, ship: { qty: null, unit: 'tấn', price: null }, terms: textOf(mosaicBook ? 'quote_mosaic' : 'quote_ngoi'), show_norm: false });
  const [loaded, setLoaded] = useState(!id);
  const [active, setActive] = useState(null);   // nhóm nhận hàng chọn ở ô tìm kiếm
  const [armClose, setArmClose] = useState(false); const [showTerms, setShowTerms] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!id) return;
    rpc('q', { view: 'quotes', filters: [['id', 'eq', id]] }).then(([q]) => {
      const mosaic = q.template === 'mosaic';
      setF((s) => ({ ...s, ...q, ...q.body, address: q.address || '', site: q.site || '', customer_id: q.customer_id || '',
        groups: q.body.groups.map((g) => ({ ...g, key: ++seq, lines: markManual(g.lines.map((l) => ({ ...l, key: ++seq })), mosaic) })) }));
      setLoaded(true);
    }).catch((e) => toast(e.message, 'err'));
  }, [id]);
  const mosaic = f.template === 'mosaic';
  const pmap = useMemo(() => Object.fromEntries((products.data || []).map((p) => [p.id, p])), [products.data]);
  const cust = customers.data?.find((c) => c.id === f.customer_id);
  const myBooks = booksFor(priceBooks.data, cust, session?.user?.id);
  const pbook = myBooks.find((b) => b.id === f.price_book_id) || null;
  // Chọn khách: tự chọn bảng giá của nhóm khách (báo giá đang sửa giữ bảng đã lưu)
  useEffect(() => {
    if (id || !priceBooks.data || !cust) return;
    const own = autoBookFor(myBooks, cust);
    setF((s) => ({ ...s, price_book_id: own ? own.id : myBooks.some((b) => b.id === s.price_book_id) ? s.price_book_id : '' }));
  }, [cust?.id, cust?.kind, priceBooks.data]);
  // Mọi thay đổi dòng hàng đi qua đây để số lượng diềm / trừ diềm / ngói luôn tính lại theo cả nhóm
  const setLines = (gkey, fn) => setF((s) => ({ ...s, groups: s.groups.map((g) => (g.key === gkey ? { ...g, lines: recalcLines(fn(g.lines), s.template === 'mosaic') } : g)) }));
  const setGroup = (key, patch) => setF((s) => ({ ...s, groups: s.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));
  // Dòng hàng lấy từ danh mục: tên đầy đủ, quy cách, ảnh, định mức theo m² (diềm theo mét dài), đơn vị, giá theo khách / bảng giá
  const fromProduct = (p) => {
    if (pbook && pbook.items[p.id] == null && !pbook.allow_others) { toast(`“${p.name}” không có trong bảng giá ${pbook.name}`, 'err'); return null; }
    const byM = isEdge(p.name) || (!p.norm_m2 && !!p.norm_m);
    return { product_id: p.id, name: mosaic ? 'Tranh mosaic khảm trai' : p.name, spec: specOf(p), image: p.image_url || '', measure_unit: byM ? 'm' : 'm2', norm: (byM ? p.norm_m : p.norm_m2) || null,
      unit: String(p.unit || 'viên').toLowerCase(), price: priceOf(p, { tier: cust?.price_tier || 1, book: pbook }) };
  };
  const groupKey = f.groups.some((g) => g.key === active) ? active : f.groups[f.groups.length - 1].key;
  const addProduct = (p) => {
    const x = fromProduct(p); if (!x) return;
    setLines(groupKey, (ls) => [...ls, { ...newLine(), ...x }]);
  };
  const pickInto = (gkey, l, p) => { const x = fromProduct(p); if (x) setLines(gkey, (ls) => ls.map((y) => (y.key === l.key ? { ...l, ...x, qty_manual: false } : y))); };
  const switchTemplate = (t) => setF((s) => ({ ...s, template: t, terms: textOf(t === 'mosaic' ? 'quote_mosaic' : 'quote_ngoi'),
    groups: s.groups.map((g) => ({ ...g, lines: recalcLines(g.lines, t === 'mosaic') })) }));

  const lineCount = f.groups.reduce((s, g) => s + g.lines.length, 0);
  const goods = f.groups.reduce((s, g) => s + g.lines.reduce((t, l) => t + Math.round((Number(l.qty) || 0) * (Number(l.price) || 0)), 0), 0);
  const shipAmt = Math.round((Number(f.ship.qty) || 0) * (Number(f.ship.price) || 0));
  const vat = f.vat_mode === 'them' ? Math.round(goods * (Number(f.vat_rate) || 0) / 100) : 0;
  const kg = f.groups.reduce((s, g) => s + g.lines.reduce((t, l) => t + (weightOf(l.qty, pmap[l.product_id]) || 0), 0), 0);

  // F3: ô tìm hàng; đóng khi còn dòng hàng phải bấm hai lần
  useEffect(() => {
    const h = (e) => { const all = document.querySelectorAll('.overlay, .pos-overlay'); if (all[all.length - 1] !== rootRef.current) return; if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  const ready = loaded && !!products.data && !!customers.data;
  useEffect(() => { if (ready && !id) setTimeout(() => searchRef.current?.focus(), 50); }, [ready]);
  useEffect(() => { if (!armClose) return undefined; const t = setTimeout(() => setArmClose(false), 4000); return () => clearTimeout(t); }, [armClose]);
  const tryClose = () => { if (lineCount && !armClose) { setArmClose(true); return; } onClose(); };

  const save = async (print) => {
    if (!lineCount) { toast('Báo giá chưa có sản phẩm — gõ tên hàng vào ô tìm kiếm', 'err'); searchRef.current?.focus(); return; }
    const r = await run('save_quote', { id: id || null, template: f.template, customer_id: f.customer_id || null, customer_name: f.customer_name || cust?.name, address: f.address, site: f.site, quote_date: f.quote_date, profile_id: f.profile_id,
      body: { groups: f.groups, vat_mode: f.vat_mode, vat_rate: f.vat_rate, ship: f.ship, terms: f.terms, show_norm: f.show_norm, price_book_id: f.price_book_id || null } }, (x) => `Đã lưu báo giá ${x.code}`);
    if (!r) return;
    onSaved?.(r); onClose();
    if (print) open('doc', { kind: 'quote', id: r.id }); else if (!id) open('quote', { id: r.id });
  };

  if (!ready) return <div className="pos-overlay" ref={rootRef}><div className="pos-top"><span className="grow" /><button className="pos-close" onClick={onClose}><Icon name="x" /></button></div><Loading /></div>;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return (
    <div className="pos-overlay" ref={rootRef} role="dialog" aria-modal="true" aria-label="Báo giá">
      <div className="pos-top">
        <ProductSearch products={products.data} tier={cust?.price_tier || 1} book={pbook} onPick={addProduct} inputRef={searchRef} />
        <div className="pos-tab"><Icon name="quote" size={17} /><b>{id ? `Sửa báo giá ${f.code || ''}` : 'Báo giá mới'}</b></div>
        <span className="grow" />
        <div className="seg pos-kind">
          <button className={!mosaic ? 'on' : ''} onClick={() => switchTemplate('ngoi')}>Ngói / gốm xây dựng</button>
          <button className={mosaic ? 'on' : ''} onClick={() => switchTemplate('mosaic')}>Tranh mosaic</button>
        </div>
        <button className={`pos-close${armClose ? ' armed' : ''}`} onClick={tryClose} title="Đóng">{armClose ? <span className="small">Bỏ báo giá đang làm? Bấm lần nữa</span> : <Icon name="x" />}</button>
      </div>
      {showTerms && <Modal title="Lưu ý cuối báo giá" onClose={() => setShowTerms(false)} size="lg" footer={<><button className="link-btn small" onClick={() => set('terms', textOf(mosaic ? 'quote_mosaic' : 'quote_ngoi'))}>Dùng nội dung mặc định</button><span className="grow" /><Btn kind="primary" onClick={() => setShowTerms(false)}>Xong</Btn></>}>
        <TextArea rows={16} value={f.terms} onChange={(v) => set('terms', v)} />
      </Modal>}
      <div className="pos-body">
        <div className="pos-left">
          <div className="pos-lines">
            {f.groups.map((g, gi) => (
              <div key={g.key} className={`qgroup${g.key === groupKey ? ' on' : ''}`} onFocusCapture={() => setActive(g.key)} onMouseDown={() => setActive(g.key)}>
                <div className="qgroup-head">
                  <span className="qgroup-no">{ROMAN[gi] || gi + 1}</span>
                  <div className="qgroup-text">
                    <input className="qgroup-name" value={g.name} onChange={(e) => setGroup(g.key, { name: e.target.value })} placeholder="Tên nhóm hàng (vd. NGÓI ÂM DƯƠNG L XANH ĐỒNG HÀNG PHẨM CẤP) — ít sản phẩm có thể để trống" />
                    <input className="pos-note" value={g.note} onChange={(e) => setGroup(g.key, { note: e.target.value })} placeholder="Ghi chú nhóm (in nghiêng)" />
                  </div>
                  {g.key === groupKey && f.groups.length > 1 && <span className="small muted qgroup-hint">hàng chọn ở ô tìm kiếm vào nhóm này</span>}
                  {f.groups.length > 1 && <button className="pos-line-del" onClick={() => set('groups', f.groups.filter((x) => x.key !== g.key))} aria-label="Bỏ nhóm" title="Bỏ nhóm"><Icon name="x" size={16} /></button>}
                </div>
                {g.lines.length === 0 && <div className="muted small qgroup-empty">Gõ tên hoặc mã hàng ở ô tìm kiếm phía trên để thêm vào nhóm này, hoặc thêm dòng tự nhập.</div>}
                {g.lines.map((l, i) => <QuoteLine key={l.key} l={l} i={i} mosaic={mosaic} showNorm={f.show_norm} pmap={pmap} products={products.data}
                  onPick={(p) => pickInto(g.key, l, p)} onChange={(n) => setLines(g.key, (ls) => ls.map((x) => (x.key === l.key ? n : x)))} onDel={() => setLines(g.key, (ls) => ls.filter((x) => x.key !== l.key))} />)}
                <div className="row gap-s"><button className="link-btn small" onClick={() => { setActive(g.key); setLines(g.key, (ls) => [...ls, newLine()]); }}>+ Thêm dòng tự nhập</button></div>
              </div>
            ))}
            <div><Btn small icon="plus" onClick={() => { const key = ++seq; setActive(key); set('groups', [...f.groups, { key, name: '', note: '', lines: [] }]); }}>Thêm nhóm hàng</Btn></div>
          </div>
        </div>

        <div className="pos-right">
          <div className="pos-meta">
            <Select value={f.profile_id} onChange={(v) => set('profile_id', v)} options={ds.profiles.map((p) => ({ value: p.id, label: p.legal_name || p.name }))} aria-label="Đơn vị đứng tên" />
            <DateInput value={f.quote_date} onChange={(v) => set('quote_date', v)} />
          </div>
          <div className="pos-cust">
            <Picker items={customers.data} value={f.customer_id} placeholder="Chọn khách hàng (không bắt buộc)"
              onChange={(v) => { const c = customers.data.find((x) => x.id === v); setF((s) => ({ ...s, customer_id: v, customer_name: c?.name || '', address: s.address || c?.address || '' })); }}
              getLabel={(c) => c.name} getSub={(c) => `${c.code}${c.phone ? ' · ' + c.phone : ''}`} filterKeys={(c) => `${c.name} ${c.code} ${c.phone || ''}`}
              onCreate={(name) => open('party', { type: 'kh', name, onSaved: (r) => set('customer_id', r.id) })} createLabel="Thêm khách mới" />
            <button className="pos-cust-add" title="Thêm khách mới" onClick={() => open('party', { type: 'kh', onSaved: (r) => set('customer_id', r.id) })}><Icon name="plus" size={18} /></button>
          </div>
          <input className="pos-staff" value={f.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="Kính gửi (có thể gõ tên khách chưa có trong danh sách)" aria-label="Kính gửi" />
          <input className="pos-staff" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="Địa chỉ" aria-label="Địa chỉ" />
          <input className="pos-staff" value={f.site} onChange={(e) => set('site', e.target.value)} placeholder="Địa điểm công trình" aria-label="Địa điểm công trình" />
          {myBooks.length > 0 && <Select value={f.price_book_id || ''} onChange={(v) => set('price_book_id', v)} aria-label="Bảng giá"
            options={[{ value: '', label: 'Bảng giá chung (mức giá của khách)' }, ...myBooks.map((b) => ({ value: b.id, label: 'Bảng giá: ' + b.name }))]} />}

          <div className="pos-sum">
            <span>Tiền hàng <span className="pos-count">{lineCount} dòng</span></span><b className="r">{money(goods)}</b>
            <Select value={f.vat_mode} onChange={(v) => set('vat_mode', v)} aria-label="VAT" options={[{ value: 'them', label: 'Cộng thêm VAT' }, { value: 'da_gom', label: 'Giá đã gồm VAT' }, { value: 'khong', label: 'Chưa gồm VAT, không tính' }]} />
            {f.vat_mode === 'them' ? <NumInput money={false} min={0} max={100} suffix="%" value={f.vat_rate} onChange={(v) => set('vat_rate', v)} className="pos-uline" aria-label="Thuế suất VAT" /> : <span />}
            {vat > 0 && <><span className="muted small">VAT {fq(f.vat_rate)}%</span><span className="r muted small">{money(vat)}</span></>}
          </div>
          <div className="qship">
            <span className="small strong">Vận chuyển</span>
            <div className="qship-row">
              <NumInput money={false} min={0} value={f.ship.qty} onChange={(v) => set('ship', { ...f.ship, qty: v })} placeholder="Khối lượng" aria-label="Khối lượng vận chuyển" />
              <Input value={f.ship.unit} onChange={(v) => set('ship', { ...f.ship, unit: v })} aria-label="Đơn vị vận chuyển" />
              <NumInput suffix={false} min={0} value={f.ship.price} onChange={(v) => set('ship', { ...f.ship, price: v })} placeholder="Đơn giá" aria-label="Đơn giá vận chuyển" />
            </div>
            {kg > 0 && <button className="link-btn small" onClick={() => set('ship', { ...f.ship, qty: Math.round(kg / 10) / 100, unit: 'tấn' })}>Lấy theo trọng lượng hàng: {fq(kg / 1000)} tấn</button>}
          </div>
          <div className="pos-sum">
            {shipAmt > 0 && <><span>Tiền vận chuyển</span><b className="r">{money(shipAmt)}</b></>}
            <b>Tổng thanh toán</b><b className="r pos-due-amt">{money(goods + vat + shipAmt)}</b>
          </div>
          {!mosaic && <Check checked={f.show_norm} onChange={(v) => set('show_norm', v)}>Hiện cột định mức khi xuất báo giá</Check>}
          <button className="link-btn pos-charge" onClick={() => setShowTerms(true)}>Lưu ý cuối báo giá ›</button>
          <div className="small muted qterms">{String(f.terms || '').split('\n')[0]}</div>

          <span className="grow" />
          <div className="pos-actions">
            <button className="pos-btn pos-btn-print" disabled={busy} onClick={() => save(true)} title="Lưu và xuất báo giá PDF">IN</button>
            <button className="pos-btn pos-btn-main" disabled={busy} onClick={() => save(false)}>{busy ? <span className="spin" /> : 'LƯU BÁO GIÁ'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuoteDetail({ id, onClose }) {
  const { open, can } = useApp();
  const q = useQ('quotes', [['id', 'eq', id]]);
  const { run, busy } = useAction();
  const d = q.data?.[0];
  if (!d) return <Modal title="Báo giá" onClose={onClose}>{q.error ? <ErrorBox error={q.error} /> : <Loading />}</Modal>;
  const lines = d.body.groups.flatMap((g) => g.lines);
  const noProduct = lines.filter((l) => !l.product_id).length;
  const excel = () => exportXlsx(`bao-gia_${d.code}.xlsx`, [{ name: 'Báo giá', rows: lines, columns: [{ key: 'name', label: 'Tên sản phẩm' }, { key: 'spec', label: 'Quy cách' }, { key: 'note', label: 'Ghi chú' }, { key: 'measure', label: 'Khối lượng' }, { key: 'qty', label: 'Số lượng' }, { key: 'unit', label: 'ĐVT' }, { key: 'price', label: 'Đơn giá' }, { key: 'amount', label: 'Thành tiền' }] }]);
  return (
    <Modal title={`Báo giá ${d.code}`} subtitle={<span className="row gap-s">{dmy(d.quote_date)} · <QStatus v={d.status} /></span>} onClose={onClose} size="lg"
      footer={<>
        <Btn icon="dl" onClick={() => open('doc', { kind: 'quote', id })}>Xuất PDF</Btn><Btn icon="dl" onClick={excel}>Xuất Excel</Btn>
        <span className="grow" />
        {can('ban_hang') && !d.order_id && <Btn icon="edit" onClick={() => { onClose(); open('quote-form', { id }); }}>Sửa</Btn>}
        {can('ban_hang') && d.status === 'nhap' && <Btn kind="soft" busy={busy} onClick={() => run('set_quote_status', { id, status: 'da_gui' }, 'Đã đánh dấu gửi khách')}>Đã gửi khách</Btn>}
        {can('ban_hang') && !d.order_id && d.status !== 'huy' && <Btn busy={busy} onClick={() => run('set_quote_status', { id, status: 'huy' }, 'Đã hủy báo giá')}>Hủy</Btn>}
        {can('ban_hang') && !d.order_id && d.status !== 'huy' && <Btn kind="primary" icon="cart" onClick={() => { onClose(); open('order-form', { quote_id: id, kind: 'dat_hang' }); }}>Chuyển sang đơn</Btn>}
      </>}>
      {noProduct > 0 && !d.order_id && <Note tone="warn">Có {noProduct} dòng tự nhập, không gắn hàng hóa trong danh mục. Khi chuyển sang đơn các dòng này sẽ bị bỏ qua.</Note>}
      <KV items={[['Kính gửi', d.customer_name], ['Địa chỉ', d.address || '—'], ['Công trình', d.site || '—'], d.order_code && ['Đơn đã lập', <a href="#" onClick={(e) => { e.preventDefault(); open('order', { id: d.order_id }); }}>{d.order_code}</a>]]} />
      <Table dense rows={lines} rowKey="name" columns={[
        { key: 'n', label: 'Sản phẩm', render: (l) => <><div className="cell-main">{l.name}</div><div className="cell-sub">{l.spec}</div></> },
        { key: 'q', label: 'Số lượng', align: 'right', render: (l) => `${fq(l.qty)} ${l.unit}` }, { key: 'p', label: 'Đơn giá', align: 'right', render: (l) => money(l.price) }, { key: 'a', label: 'Thành tiền', align: 'right', render: (l) => money(l.amount) },
      ]} />
      <div className="card"><div className="totals">
        <span>Tiền hàng</span><span className="r">{money(d.body.goods)}</span>
        {d.body.ship?.amount > 0 && <><span>Vận chuyển</span><span className="r">{money(d.body.ship.amount)}</span></>}
        {d.body.vat > 0 && <><span>VAT {fq(d.body.vat_rate)}%</span><span className="r">{money(d.body.vat)}</span></>}
        <span className="strong">Tổng thanh toán</span><span className="r strong">{money(d.total)}</span>
      </div></div>
    </Modal>
  );
}
