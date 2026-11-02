// Báo giá: phân hệ độc lập. Chỉ khi bấm "Chuyển sang đơn" mới sao chép khách và dòng hàng sang màn tạo đơn.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, match, todayVN } from '../lib/format.js';
import { useProducts, useCustomers, tierPrice } from '../lib/lookups.js';
import { docSettings, DEFAULT_TEXTS, weightOf } from '../lib/docs/model.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, Icon, Pill, Field, Input, TextArea, Select, DateInput, NumInput, Check, Search, ErrorBox, Loading, Note, Table, Modal, Picker, KV, Section, ListPage, FilterBox, RadioList } from '../components/ui.jsx';

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
  const all = q.data || [];
  const rows = useMemo(() => all.filter((x) => (!st || x.status === st) && match(`${x.code} ${x.customer_name} ${x.site || ''}`, search)), [all, st, search]);
  return (
    <ListPage title="Báo giá" sub="Báo giá không giữ hàng và không ghi công nợ. Muốn lập đơn thì mở báo giá và bấm “Chuyển sang đơn”."
      filters={<FilterBox title="Trạng thái"><RadioList value={st} onChange={setSt} options={[{ value: '', label: 'Tất cả', count: all.length }, ...Object.entries(STATUS).map(([value, [label]]) => ({ value, label, count: all.filter((x) => x.status === value).length }))]} /></FilterBox>}
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

function LineRow({ l, mosaic, showNorm, onChange, onDel, pmap }) {
  const set = (patch) => {
    const n = { ...l, ...patch };
    if ('measure_unit' in patch && pmap[l.product_id]) n.norm = patch.measure_unit === 'm' ? pmap[l.product_id].norm_m : pmap[l.product_id].norm_m2;
    if (!mosaic && !('qty' in patch)) n.qty = autoQty(n);
    if (mosaic && 'measure' in patch) n.qty = n.measure;
    onChange(n);
  };
  return (
    <div className="q-line">
      <div className="q-line-main">
        <Input value={l.name} onChange={(v) => set({ name: v })} placeholder="Tên sản phẩm" aria-label="Tên sản phẩm" />
        <Input value={l.spec} onChange={(v) => set({ spec: v })} placeholder="Quy cách" aria-label="Quy cách" />
        <Input value={l.note} onChange={(v) => set({ note: v })} placeholder={mosaic ? 'Ghi chú: họa tiết tranh…' : 'Ghi chú dưới tên hàng'} aria-label="Ghi chú" />
      </div>
      <label className="q-mini"><span>Khối lượng</span><NumInput money={false} min={0} value={l.measure} onChange={(v) => set({ measure: v })} aria-label="Khối lượng" /></label>
      {!mosaic && <label className="q-mini q-unit"><span>Theo</span><Select value={l.measure_unit} onChange={(v) => set({ measure_unit: v })} options={[{ value: 'm2', label: 'm²' }, { value: 'm', label: 'm dài' }]} aria-label="Đơn vị khối lượng" /></label>}
      {!mosaic && showNorm && <label className="q-mini"><span>Định mức</span><NumInput money={false} min={0} value={l.norm} onChange={(v) => set({ norm: v })} aria-label="Định mức" /></label>}
      {!mosaic && <label className="q-mini"><span>Trừ diềm</span><NumInput money={false} min={0} value={l.deduct} onChange={(v) => set({ deduct: v })} aria-label="Trừ số viên diềm" /></label>}
      {!mosaic && <label className="q-mini"><span>Số lượng</span><NumInput money={false} min={0} value={l.qty} onChange={(v) => set({ qty: v })} aria-label="Số lượng" /></label>}
      <label className="q-mini q-unit"><span>ĐVT</span><Input value={l.unit} onChange={(v) => set({ unit: v })} aria-label="Đơn vị tính" /></label>
      <label className="q-mini"><span>Đơn giá</span><NumInput suffix={false} min={0} value={l.price} onChange={(v) => set({ price: v })} aria-label="Đơn giá" /></label>
      <div className="q-amount"><span>Thành tiền</span><b>{money((Number(l.qty) || 0) * (Number(l.price) || 0))}</b></div>
      <button className="icon-btn" onClick={onDel} aria-label="Xóa dòng"><Icon name="x" size={16} /></button>
    </div>
  );
}

export function QuoteForm({ id, onClose, onSaved }) {
  const { rpc, book, settings, toast, open } = useApp();
  const products = useProducts(); const customers = useCustomers();
  const { run, busy } = useAction();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const mosaicBook = book.short_name === 'AN';
  const textOf = (k) => ds.types.bao_gia.text?.[k] ?? DEFAULT_TEXTS[k];
  const [f, setF] = useState({ template: mosaicBook ? 'mosaic' : 'ngoi', customer_id: '', customer_name: '', address: '', site: '', quote_date: todayVN(), profile_id: ds.types.bao_gia.profile,
    groups: [{ key: ++seq, name: '', note: '', lines: [] }], vat_mode: 'them', vat_rate: settings.default_vat ?? 8, ship: { qty: null, unit: 'tấn', price: null }, terms: textOf(mosaicBook ? 'quote_mosaic' : 'quote_ngoi'), show_norm: false });
  const [loaded, setLoaded] = useState(!id);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => {
    if (!id) return;
    rpc('q', { view: 'quotes', filters: [['id', 'eq', id]] }).then(([q]) => {
      setF((s) => ({ ...s, ...q, ...q.body, address: q.address || '', site: q.site || '', customer_id: q.customer_id || '', groups: q.body.groups.map((g) => ({ ...g, key: ++seq, lines: g.lines.map((l) => ({ ...l, key: ++seq })) })) }));
      setLoaded(true);
    }).catch((e) => toast(e.message, 'err'));
  }, [id]);
  const mosaic = f.template === 'mosaic';
  const pmap = useMemo(() => Object.fromEntries((products.data || []).map((p) => [p.id, p])), [products.data]);
  const cust = customers.data?.find((c) => c.id === f.customer_id);
  const setGroup = (key, patch) => setF((s) => ({ ...s, groups: s.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)) }));
  const addProduct = (g, pid) => {
    const p = pmap[pid]; if (!p) return;
    const line = { ...newLine(), product_id: p.id, name: mosaic ? 'Tranh mosaic khảm trai' : p.name, spec: specOf(p), image: p.image_url || '', norm: p.norm_m2 || null, unit: String(p.unit || 'viên').toLowerCase(), price: tierPrice(p, cust?.price_tier || 1) };
    setGroup(g.key, { lines: [...g.lines, line] });
  };
  const goods = f.groups.reduce((s, g) => s + g.lines.reduce((t, l) => t + Math.round((Number(l.qty) || 0) * (Number(l.price) || 0)), 0), 0);
  const shipAmt = Math.round((Number(f.ship.qty) || 0) * (Number(f.ship.price) || 0));
  const vat = f.vat_mode === 'them' ? Math.round(goods * (Number(f.vat_rate) || 0) / 100) : 0;
  const kg = f.groups.reduce((s, g) => s + g.lines.reduce((t, l) => t + (weightOf(l.qty, pmap[l.product_id]) || 0), 0), 0);
  const save = async () => {
    const r = await run('save_quote', { id: id || null, template: f.template, customer_id: f.customer_id || null, customer_name: f.customer_name || cust?.name, address: f.address, site: f.site, quote_date: f.quote_date, profile_id: f.profile_id,
      body: { groups: f.groups, vat_mode: f.vat_mode, vat_rate: f.vat_rate, ship: f.ship, terms: f.terms, show_norm: f.show_norm } }, (x) => `Đã lưu báo giá ${x.code}`);
    if (r) { onSaved?.(r); onClose(); if (!id) open('quote', { id: r.id }); }
  };
  if (!loaded || !products.data || !customers.data) return <Modal title="Báo giá" onClose={onClose} size="xl"><Loading /></Modal>;
  return (
    <Modal title={id ? `Sửa báo giá ${f.code || ''}` : 'Tạo báo giá'} onClose={onClose} size="xl"
      footer={<><span className="strong">Tổng thanh toán: {money(goods + vat + shipAmt)} đ</span><span className="grow" /><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={save}>Lưu báo giá</Btn></>}>
      <div className="seg"><button className={!mosaic ? 'on' : ''} onClick={() => setF((s) => ({ ...s, template: 'ngoi', terms: textOf('quote_ngoi') }))}>Mẫu ngói / gốm xây dựng</button><button className={mosaic ? 'on' : ''} onClick={() => setF((s) => ({ ...s, template: 'mosaic', terms: textOf('quote_mosaic') }))}>Mẫu tranh mosaic</button></div>
      <div className="grid">
        <Field label="Khách hàng"><Picker items={customers.data} value={f.customer_id} onChange={(v) => { const c = customers.data.find((x) => x.id === v); setF((s) => ({ ...s, customer_id: v, customer_name: c?.name || '', address: s.address || c?.address || '' })); }}
          getLabel={(c) => c.name} getSub={(c) => c.phone || ''} placeholder="Chọn từ danh sách…" filterKeys={(c) => `${c.name} ${c.code} ${c.phone || ''}`} /></Field>
        <Field label="Kính gửi" required><Input value={f.customer_name} onChange={(v) => set('customer_name', v)} placeholder="Có thể gõ tên khách chưa có trong danh sách" /></Field>
        <Field label="Ngày báo giá"><DateInput value={f.quote_date} onChange={(v) => set('quote_date', v)} /></Field>
        <Field label="Địa chỉ"><Input value={f.address} onChange={(v) => set('address', v)} /></Field>
        <Field label="Địa điểm công trình"><Input value={f.site} onChange={(v) => set('site', v)} /></Field>
        <Field label="Đơn vị đứng tên"><Select value={f.profile_id} onChange={(v) => set('profile_id', v)} options={ds.profiles.map((p) => ({ value: p.id, label: p.legal_name || p.name }))} /></Field>
      </div>
      {f.groups.map((g, gi) => (
        <Section key={g.key} title={`Nhóm hàng ${gi + 1}`} actions={f.groups.length > 1 && <Btn small onClick={() => set('groups', f.groups.filter((x) => x.key !== g.key))}>Bỏ nhóm</Btn>}>
          <div className="grid">
            <Field label="Tên nhóm" hint="Báo giá ít sản phẩm có thể để trống"><Input value={g.name} onChange={(v) => setGroup(g.key, { name: v })} placeholder="vd. NGÓI ÂM DƯƠNG L XANH ĐỒNG HÀNG PHẨM CẤP" /></Field>
            <Field label="Ghi chú nhóm (in nghiêng)" wide><Input value={g.note} onChange={(v) => setGroup(g.key, { note: v })} /></Field>
          </div>
          {g.lines.map((l) => <LineRow key={l.key} l={l} mosaic={mosaic} showNorm={f.show_norm} pmap={pmap} onChange={(n) => setGroup(g.key, { lines: g.lines.map((x) => (x.key === l.key ? n : x)) })} onDel={() => setGroup(g.key, { lines: g.lines.filter((x) => x.key !== l.key) })} />)}
          <div className="row gap">
            <div className="grow" style={{ maxWidth: 420 }}><Picker items={products.data} value="" onChange={(v) => addProduct(g, v)} getLabel={(p) => `${p.sku} · ${p.name}`} getSub={(p) => specOf(p)} placeholder="Thêm từ danh sách hàng hóa…" filterKeys={(p) => `${p.sku} ${p.name} ${p.color || ''}`} /></div>
            <Btn small icon="plus" onClick={() => setGroup(g.key, { lines: [...g.lines, newLine()] })}>Thêm dòng tự nhập</Btn>
          </div>
        </Section>
      ))}
      <Btn small icon="plus" onClick={() => set('groups', [...f.groups, { key: ++seq, name: '', note: '', lines: [] }])}>Thêm nhóm hàng</Btn>
      <div className="grid">
        <Field label="VAT"><Select value={f.vat_mode} onChange={(v) => set('vat_mode', v)} options={[{ value: 'them', label: 'Cộng thêm VAT' }, { value: 'da_gom', label: 'Giá đã gồm VAT' }, { value: 'khong', label: 'Chưa gồm VAT, không tính' }]} /></Field>
        {f.vat_mode === 'them' && <Field label="Thuế suất"><NumInput money={false} min={0} max={100} suffix="%" value={f.vat_rate} onChange={(v) => set('vat_rate', v)} /></Field>}
        <Field label="Vận chuyển: khối lượng" hint={kg > 0 ? <button className="link-btn small" onClick={() => set('ship', { ...f.ship, qty: Math.round(kg / 10) / 100, unit: 'tấn' })}>Lấy theo trọng lượng hàng: {fq(kg / 1000)} tấn</button> : ''}><NumInput money={false} min={0} value={f.ship.qty} onChange={(v) => set('ship', { ...f.ship, qty: v })} /></Field>
        <Field label="Đơn vị"><Input value={f.ship.unit} onChange={(v) => set('ship', { ...f.ship, unit: v })} /></Field>
        <Field label="Đơn giá vận chuyển"><NumInput value={f.ship.price} onChange={(v) => set('ship', { ...f.ship, price: v })} /></Field>
      </div>
      {!mosaic && <Check checked={f.show_norm} onChange={(v) => set('show_norm', v)}>Hiện cột định mức khi xuất báo giá</Check>}
      <Field label="Lưu ý" wide><TextArea rows={9} value={f.terms} onChange={(v) => set('terms', v)} /></Field>
    </Modal>
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
