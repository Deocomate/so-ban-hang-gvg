import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, match, dmy, todayVN } from '../lib/format.js';
import { useProducts, productLabel, productSub, PRODUCT_TYPES, typeLabel } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { bookProfile } from '../lib/book-profile.js';
import { Btn, Icon, Pill, Field, Input, TextArea, Select, NumInput, Check, Search, Loading, ErrorBox, Note, Table, Modal, Picker, ListPage, FilterBox, RadioList, Tabs, KV, Section, ConfirmBtn } from '../components/ui.jsx';

const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } };
const dims = (p) => (p.width || p.length ? `${fq(p.width || 0)} × ${fq(p.length || 0)} ${p.dim_unit || 'cm'}` : '');
const CREATED = [{ value: '', label: 'Toàn thời gian' }, { value: '7', label: '7 ngày qua' }, { value: '30', label: '30 ngày qua' }, { value: '90', label: '90 ngày qua' }];
const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toISOString();

// Cột chọn được trên danh sách (giống KiotViet), lưu theo máy
const COLS = [
  { key: 'type', label: 'Loại hàng' }, { key: 'category', label: 'Nhóm hàng' }, { key: 'brand', label: 'Thương hiệu' }, { key: 'location', label: 'Vị trí' },
  { key: 'dims', label: 'Kích thước' }, { key: 'cost', label: 'Giá vốn' }, { key: 'prices', label: 'Giá bán' }, { key: 'on_hand', label: 'Tồn kho' },
  { key: 'reserved', label: 'Khách đặt' }, { key: 'available', label: 'Có thể bán' }, { key: 'days_left', label: 'Dự kiến hết hàng' },
  { key: 'low', label: 'Định mức tồn ít nhất' }, { key: 'max', label: 'Định mức tồn nhiều nhất' }, { key: 'created', label: 'Thời gian tạo' }, { key: 'state', label: 'Trạng thái' },
];
const DEF_COLS = ['cost', 'prices', 'on_hand', 'reserved', 'available', 'days_left'];

export function ProductsPage() {
  const { open, can, settings } = useApp();
  const [search, setSearch] = useState(''); const [cat, setCat] = useState(''); const [state, setState] = useState('active');
  const [stock, setStock] = useState(''); const [type, setType] = useState(''); const [brand, setBrand] = useState(''); const [loc, setLoc] = useState('');
  const [direct, setDirect] = useState(''); const [created, setCreated] = useState('');
  const [cols, setCols0] = useState(() => lsGet('gomsu.product_cols') || DEF_COLS);
  const setCols = (c) => { setCols0(c); lsSet('gomsu.product_cols', c); };
  const q = useQ('products', [], 'sku', 5000);
  const pn = settings.price_names || ['Giá 1', 'Giá 2', 'Giá 3'];
  const prof = bookProfile(settings);
  const cost = can('xem_gia_von');
  const all = q.data || [];
  const since = created ? daysAgoIso(Number(created)) : '';
  const rows = useMemo(() => all.filter((p) => (state === 'all' || (state === 'active' ? p.active : !p.active)) && (!cat || p.category === cat)
    && (!type || p.product_type === type) && (!brand || p.brand === brand) && (!loc || p.location === loc)
    && (!direct || (direct === 'yes' ? p.sell_direct : !p.sell_direct)) && (!since || p.created_at >= since)
    && (!stock || (stock === 'low' && p.is_low) || (stock === 'in' && p.available > 0) || (stock === 'out' && p.available <= 0 && !p.is_service)
      || (stock === 'over' && p.max_stock > 0 && p.on_hand > p.max_stock))
    && match(`${p.sku} ${p.name} ${p.size || ''} ${p.color || ''} ${p.pattern || ''} ${p.brand || ''} ${p.location || ''}`, search)), [all, search, cat, state, stock, type, brand, loc, direct, since]);
  const uniq = (k) => [...new Set(all.map((p) => p[k]).filter(Boolean))].sort();
  const cats = [...new Set([...(settings.categories || []), ...uniq('category')])];
  const opt = (vals, k) => [{ value: '', label: 'Tất cả' }, ...vals.map((v) => ({ value: v, label: v, count: all.filter((p) => p[k] === v).length }))];
  const unitLc = (p) => String(p.unit || 'đv').toLowerCase();
  const pack = (p) => [prof.packaging && p.units_per_pack ? `${fq(p.units_per_pack)} ${unitLc(p)}/${p.pack_unit || 'hộp'}` : '',
    ...(p.units || []).map((u) => `1 ${u.name} = ${fq(u.conv)} ${unitLc(p)}`)].filter(Boolean).join(' · ');
  const show = (k) => cols.includes(k);
  const stockCell = (p, v) => (p.is_service ? <span className="muted">—</span> : v);
  return (
    <ListPage title="Hàng hóa" sub={`Mỗi biến thể (mẫu + kích thước + màu men) có một mã SKU riêng. ${pn.length} mức giá: ${pn.join(' / ')}.`}
      filters={<>
        <FilterBox title="Loại hàng"><RadioList value={type} onChange={setType} options={[{ value: '', label: 'Tất cả' }, ...PRODUCT_TYPES.map((t) => ({ ...t, count: all.filter((p) => p.product_type === t.value).length }))]} /></FilterBox>
        <FilterBox title="Nhóm hàng"><RadioList value={cat} onChange={setCat} options={opt(cats, 'category')} /></FilterBox>
        <FilterBox title="Tồn kho"><RadioList value={stock} onChange={setStock} options={[{ value: '', label: 'Tất cả' }, { value: 'low', label: 'Dưới định mức tồn', count: all.filter((p) => p.is_low).length },
          { value: 'over', label: 'Vượt định mức tồn', count: all.filter((p) => p.max_stock > 0 && p.on_hand > p.max_stock).length }, { value: 'in', label: 'Còn hàng' }, { value: 'out', label: 'Hết hàng' }]} /></FilterBox>
        {prof.has('brand') && uniq('brand').length > 0 && <FilterBox title="Thương hiệu"><RadioList value={brand} onChange={setBrand} options={opt(uniq('brand'), 'brand')} /></FilterBox>}
        {uniq('location').length > 0 && <FilterBox title="Vị trí"><RadioList value={loc} onChange={setLoc} options={opt(uniq('location'), 'location')} /></FilterBox>}
        <FilterBox title="Bán trực tiếp"><RadioList value={direct} onChange={setDirect} options={[{ value: '', label: 'Tất cả' }, { value: 'yes', label: 'Có' }, { value: 'no', label: 'Không' }]} /></FilterBox>
        <FilterBox title="Thời gian tạo"><RadioList value={created} onChange={setCreated} options={CREATED} /></FilterBox>
        <FilterBox title="Trạng thái"><RadioList value={state} onChange={setState} options={[{ value: 'active', label: 'Đang kinh doanh' }, { value: 'off', label: 'Ngừng kinh doanh' }, { value: 'all', label: 'Tất cả' }]} /></FilterBox>
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm SKU, tên, màu, kích thước, vị trí…" />}
      actions={<>
        <details className="col-pick">
          <summary className="btn btn-ghost" title="Chọn cột hiển thị"><Icon name="gear" /> Cột</summary>
          <div className="col-pick-menu">{COLS.filter((c) => (c.key !== 'cost' || cost) && prof.has(c.key)).map((c) => <Check key={c.key} checked={show(c.key)} onChange={(v) => setCols(v ? [...cols, c.key] : cols.filter((x) => x !== c.key))}>{c.label}</Check>)}</div>
        </details>
        <Btn icon="dl" onClick={() => exportXlsx('san-pham.xlsx', [{ name: 'Sản phẩm', rows: rows.map((p) => ({ ...p, type_label: typeLabel(p.product_type), sell_text: p.sell_direct ? 'Có' : 'Không', units_text: (p.units || []).map((u) => `${u.name}=${u.conv}`).join('; ') })), columns: [
          { key: 'sku', label: 'Mã SKU' }, { key: 'name', label: 'Tên hàng hóa' }, { key: 'type_label', label: 'Loại hàng' }, { key: 'category', label: 'Chủng loại' }, { key: 'brand', label: 'Thương hiệu' }, { key: 'pattern', label: 'Mẫu' }, { key: 'size', label: 'Kích thước' },
          { key: 'color', label: 'Màu sắc / men' }, { key: 'unit', label: 'ĐVT' }, { key: 'units_text', label: 'Đơn vị quy đổi' }, ...(cost ? [{ key: 'avg_cost', label: 'Giá vốn' }] : []),
          ...pn.map((label, i) => ({ key: `price${i + 1}`, label })), { key: 'on_hand', label: 'Số lượng tồn' }, { key: 'reserved', label: 'Khách đặt' }, { key: 'low_stock', label: 'Tồn tối thiểu' }, { key: 'max_stock', label: 'Tồn tối đa' },
          { key: 'location', label: 'Vị trí' }, { key: 'width', label: 'Rộng' }, { key: 'length', label: 'Dài' }, { key: 'dim_unit', label: 'Đơn vị kích thước' },
          { key: 'material', label: 'Chất liệu' }, { key: 'norm_m2', label: 'Định mức m2' }, { key: 'norm_m', label: 'Định mức m dài' }, { key: 'units_per_pack', label: 'Số viên/hộp' }, { key: 'pack_unit', label: 'Đơn vị đóng gói' }, { key: 'pack_weight', label: 'Trọng lượng/thùng (kg)' }, { key: 'unit_weight', label: 'Trọng lượng/viên (kg)' },
          { key: 'sell_text', label: 'Bán trực tiếp' }, { key: 'description', label: 'Mô tả' }, { key: 'order_note', label: 'Mẫu ghi chú' }, { key: 'note', label: 'Ghi chú' }].filter((c) => prof.has(c.key)) }])}>Xuất Excel</Btn>
        {can('owner') && <Btn icon="up" onClick={() => open('import', { kind: 'products' })}>Nhập từ Excel</Btn>}
        {can('danh_muc') && <Btn kind="primary" icon="plus" onClick={() => open('product', {})}>Thêm hàng hóa</Btn>}
      </>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} onRow={(p) => open('product-detail', { id: p.id })} empty={<span>Chưa có sản phẩm. {can('owner') && 'Bấm “Nhập từ Excel” để đưa toàn bộ hàng hóa vào một lần.'}</span>}
        foot={rows.length ? { p: `${rows.length} mã hàng` } : null} columns={[
        { key: 'img', label: '', width: 48, render: (p) => (p.image_url ? <img className="thumb" src={p.image_url} alt="" /> : <span className="thumb"><Icon name="vase" size={18} /></span>) },
        { key: 'p', label: 'Hàng hóa', render: (p) => <><div className="cell-main">{p.sku} · {p.name} {p.product_type !== 'hang' && <Pill tone="accent">{typeLabel(p.product_type)}</Pill>} {!p.active && <Pill tone="mute">ngừng bán</Pill>} {!p.sell_direct && <Pill tone="mute">không bán trực tiếp</Pill>}</div><div className="cell-sub">{[productSub(p), p.unit, pack(p)].filter(Boolean).join(' · ')}</div></> },
        ...(show('type') ? [{ key: 'type', label: 'Loại hàng', render: (p) => typeLabel(p.product_type) }] : []),
        ...(show('category') ? [{ key: 'category', label: 'Nhóm hàng' }] : []),
        ...(show('brand') && prof.has('brand') ? [{ key: 'brand', label: 'Thương hiệu' }] : []),
        ...(show('location') ? [{ key: 'location', label: 'Vị trí' }] : []),
        ...(show('dims') ? [{ key: 'dims', label: 'Kích thước', render: dims }] : []),
        ...(cost && show('cost') ? [{ key: 'c', label: 'Giá vốn', align: 'right', render: (p) => money(p.avg_cost) }] : []),
        ...(show('prices') ? pn.map((label, i) => ({ key: `p${i + 1}`, label, align: 'right', render: (p) => money(p[`price${i + 1}`]) })) : []),
        ...(show('on_hand') ? [{ key: 'oh', label: 'Tồn kho', align: 'right', render: (p) => stockCell(p, fq(p.on_hand)) }] : []),
        ...(show('reserved') ? [{ key: 'rs', label: 'Khách đặt', align: 'right', render: (p) => stockCell(p, fq(p.reserved)) }] : []),
        ...(show('available') ? [{ key: 'av', label: 'Có thể bán', align: 'right', render: (p) => stockCell(p, <span className={p.is_low ? 'warn strong' : ''}>{fq(p.available)}</span>) }] : []),
        ...(show('days_left') ? [{ key: 'dl', label: 'Dự kiến hết hàng', align: 'right', render: (p) => (p.days_left == null ? <span className="muted">—</span> : `${fq(p.days_left)} ngày`) }] : []),
        ...(show('low') ? [{ key: 'low', label: 'Tồn ít nhất', align: 'right', render: (p) => stockCell(p, fq(p.low_stock)) }] : []),
        ...(show('max') ? [{ key: 'max', label: 'Tồn nhiều nhất', align: 'right', render: (p) => stockCell(p, p.max_stock ? fq(p.max_stock) : '—') }] : []),
        ...(show('created') ? [{ key: 'cr', label: 'Thời gian tạo', render: (p) => dmy(p.created_at?.slice(0, 10)) }] : []),
        ...(show('state') ? [{ key: 'st', label: 'Trạng thái', render: (p) => (p.active ? 'Đang kinh doanh' : 'Ngừng kinh doanh') }] : []),
      ]} />
    </ListPage>
  );
}

// ---------- CHI TIẾT HÀNG HÓA ----------
export function ProductDetail({ id, onClose }) {
  const { open, can, settings } = useApp();
  const q = useQ('products', [['id', 'eq', id]]);
  const { run, busy } = useAction();
  const [tab, setTab] = useState('info');
  const [img, setImg] = useState(0);
  const p = q.data?.[0];
  const pn = settings.price_names || [];
  const prof = bookProfile(settings);
  const cost = can('xem_gia_von');
  if (!p) return <Modal title="Hàng hóa" onClose={onClose}>{q.error ? <ErrorBox error={q.error} /> : q.data ? <Note>Không tìm thấy hàng hóa</Note> : <Loading />}</Modal>;
  const images = p.images?.length ? p.images : p.image_url ? [p.image_url] : [];
  const comps = p.is_kit ? p.components : p.product_type === 'san_xuat' ? p.bom : [];
  const svc = p.is_service;
  return (
    <Modal title={`${p.sku} · ${p.name}`} subtitle={[typeLabel(p.product_type), p.category, productSub(p)].filter(Boolean).join(' · ')} onClose={onClose} size="xl"
      footer={<>
        {can('danh_muc') && <ConfirmBtn icon="trash" busy={busy} confirmText="Bấm lần nữa để xóa hẳn" onConfirm={async () => { if (await run('delete_product', { id: p.id }, `Đã xóa ${p.sku}`)) onClose(); }}>Xóa</ConfirmBtn>}
        {can('danh_muc') && <Btn icon="copy" onClick={() => { onClose(); open('product', { copy_of: p.id }); }}>Sao chép</Btn>}
        {can('danh_muc') && <Btn busy={busy} onClick={() => run('save_product', { ...p, thumb: p.image_url, active: !p.active }, p.active ? `Đã ngừng kinh doanh ${p.sku}` : `${p.sku} kinh doanh trở lại`)}>{p.active ? 'Ngừng kinh doanh' : 'Kinh doanh lại'}</Btn>}
        <span className="grow" />
        {!svc && !p.is_kit && <Btn icon="history" onClick={() => open('stockcard', { product_id: p.id })}>Thẻ kho</Btn>}
        {!svc && !p.is_kit && can('nhap_hang') && <Btn icon="truck" onClick={() => open('po-form', { mode: 'nhap', product_id: p.id })}>Nhập hàng</Btn>}
        {can('danh_muc') && <Btn kind="primary" icon="edit" onClick={() => open('product', { id: p.id })}>Chỉnh sửa</Btn>}
      </>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'info', label: 'Thông tin' }, { value: 'desc', label: 'Mô tả, ghi chú' }, ...(comps?.length ? [{ value: 'comp', label: 'Hàng thành phần', count: comps.length }] : [])]} />
      {tab === 'info' && <div className="row gap" style={{ alignItems: 'flex-start', marginTop: 12 }}>
        <div className="stack" style={{ gap: 6, width: 200 }}>
          {images.length ? <img src={images[img] || images[0]} alt="" style={{ width: 200, height: 200, objectFit: 'cover', borderRadius: 10 }} /> : <span className="thumb" style={{ width: 200, height: 200 }}><Icon name="vase" size={48} /></span>}
          {images.length > 1 && <div className="row gap-s">{images.map((u, i) => <button key={i} className="img-mini" onClick={() => setImg(i)}><img className="thumb" src={u} alt="" style={{ outline: i === img ? '2px solid var(--accent)' : 'none' }} /></button>)}</div>}
          <div className="row gap-s" style={{ flexWrap: 'wrap' }}><Pill>{typeLabel(p.product_type)}</Pill>{p.sell_direct ? <Pill tone="good">Bán trực tiếp</Pill> : <Pill tone="mute">Không bán trực tiếp</Pill>}{!p.active && <Pill tone="mute">Ngừng kinh doanh</Pill>}</div>
        </div>
        <div className="grow stack">
          <KV items={[
            ['Mã hàng', p.sku], ['Nhóm hàng', p.category || '—'], prof.has('brand') && ['Thương hiệu', p.brand || '—'],
            ...(svc ? [] : [['Tồn kho', `${fq(p.on_hand)} ${p.unit}`], ['Khách đặt', fq(p.reserved)], ['Có thể bán', fq(p.available), p.is_low ? 'warn strong' : ''],
              ['Định mức tồn', `${fq(p.low_stock)} – ${p.max_stock ? fq(p.max_stock) : 'không giới hạn'}`], ['Dự kiến hết hàng', p.days_left == null ? '—' : `${fq(p.days_left)} ngày (bán ${fq(p.sold_30d)} trong 30 ngày)`]]),
            cost && ['Giá vốn', money(p.avg_cost)], cost && p.last_in_cost != null && ['Giá nhập cuối', money(p.last_in_cost)],
            ...pn.map((label, i) => [label, money(p[`price${i + 1}`])]),
            !svc && ['Vị trí', p.location || '—'], ['Kích thước', dims(p) || p.size || '—'],
            ['Trọng lượng', p.weight_per_unit ? `${fq(p.weight_per_unit)} kg/${String(p.unit).toLowerCase()}` : '—'],
            ['Mẫu / màu men', [p.pattern, p.color].filter(Boolean).join(' · ') || '—'], prof.has('material') && ['Chất liệu', p.material || '—'],
            prof.has('norm') && (p.norm_m2 || p.norm_m) && ['Định mức', [p.norm_m2 && `${fq(p.norm_m2)}/m²`, p.norm_m && `${fq(p.norm_m)}/m dài`].filter(Boolean).join(' · ')],
            ['Ngày tạo', dmy(p.created_at?.slice(0, 10))],
          ]} />
          <Section title="Đơn vị tính">
            <Table dense rows={[{ id: 'base', name: p.unit, conv: 1, prices: [], sell_direct: p.sell_direct }, ...(p.units || [])]} columns={[
              { key: 'n', label: 'Đơn vị', render: (u) => <b>{u.name}{u.id === 'base' ? ' (cơ bản)' : ''}</b> },
              { key: 'c', label: 'Quy đổi', align: 'right', render: (u) => `${fq(u.conv)} ${p.unit}` },
              ...pn.map((label, i) => ({ key: `p${i}`, label, align: 'right', render: (u) => money(u.prices?.[i] ?? p[`price${i + 1}`] * u.conv) })),
              { key: 'd', label: 'Bán trực tiếp', render: (u) => (u.sell_direct ? 'Có' : 'Không') },
            ]} />
            {prof.packaging && p.units_per_pack ? <div className="muted small">Quy cách in trên chứng từ: {fq(p.units_per_pack)} {String(p.unit).toLowerCase()}/{p.pack_unit || 'hộp'}</div> : null}
          </Section>
        </div>
      </div>}
      {tab === 'desc' && <div className="stack" style={{ marginTop: 12 }}>
        <Section title="Mô tả"><div className="pre-wrap">{p.description || <span className="muted">Chưa có mô tả</span>}</div></Section>
        <Section title="Mẫu ghi chú (hóa đơn, đặt hàng)"><div className="pre-wrap">{p.order_note || <span className="muted">Chưa có</span>}</div></Section>
        <Section title="Ghi chú nội bộ"><div className="pre-wrap">{p.note || <span className="muted">Chưa có</span>}</div></Section>
      </div>}
      {tab === 'comp' && <Table dense rows={comps} rowKey="product_id" columns={[
        { key: 's', label: 'Mã hàng', render: (c) => c.sku }, { key: 'n', label: 'Tên hàng thành phần', render: (c) => c.name },
        { key: 'q', label: 'Số lượng', align: 'right', render: (c) => `${fq(c.qty)} ${c.unit || ''}` },
      ]} />}
    </Modal>
  );
}

// ---------- FORM TẠO / SỬA ----------
async function resizeImage(file, max = 480) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

// Ảnh đại diện cho danh sách và màn bán hàng: thu nhỏ ảnh đầu về 128px (ảnh đầy đủ chỉ tải khi xem chi tiết)
async function thumbOf(dataUrl) {
  if (!dataUrl) return null;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const s = Math.min(1, 128 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

const ATTRS = [{ key: 'pattern', label: 'Mẫu' }, { key: 'size', label: 'Kích thước' }, { key: 'color', label: 'Màu sắc / men' }, { key: 'material', label: 'Chất liệu' }];
const splitVals = (s) => [...new Set(String(s || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];
function cartesian(lists) { return lists.reduce((acc, l) => acc.flatMap((a) => l.map((v) => [...a, v])), [[]]); }
const EMPTY = { sku: '', name: '', product_type: 'hang', category: '', brand: '', pattern: '', size: '', color: '', material: '', unit: '', price1: null, price2: null, price3: null, price4: null, price5: null,
  cost: null, opening_qty: null, low_stock: 0, max_stock: null, location: '', width: null, length: null, dim_unit: 'cm', active: true, sell_direct: true,
  note: '', description: '', order_note: '', images: [], components: [], bom: [], units: [], units_per_pack: null, pack_unit: 'hộp', pack_weight: null, unit_weight: null, norm_m2: null, norm_m: null };

function CompTable({ rows, items, onChange, cost }) {
  const pmap = Object.fromEntries((items || []).map((p) => [p.id, p]));
  const setRow = (i, patch) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const total = rows.reduce((s, c) => s + (pmap[c.product_id]?.avg_cost || 0) * (Number(c.qty) || 0), 0);
  return (
    <div className="stack">
      {rows.map((c, i) => {
        const p = pmap[c.product_id];
        return (
          <div className="row gap" key={i}>
            <div className="grow" style={{ minWidth: 220 }}><Picker items={items} value={c.product_id} getLabel={productLabel} getSub={productSub} onChange={(v) => setRow(i, { product_id: v })} placeholder="Thêm hàng thành phần" /></div>
            <NumInput money={false} min={0} value={c.qty} onChange={(v) => setRow(i, { qty: v })} style={{ maxWidth: 130 }} aria-label="Số lượng" suffix={p?.unit || false} />
            {cost && <span className="muted small" style={{ minWidth: 140, textAlign: 'right' }}>{p ? `${money(p.avg_cost)} × ${fq(c.qty || 0)} = ${money((p.avg_cost || 0) * (Number(c.qty) || 0))}` : ''}</span>}
            <button className="icon-btn" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Xóa dòng"><Icon name="x" /></button>
          </div>
        );
      })}
      <div className="row gap"><Btn small icon="plus" onClick={() => onChange([...rows, { product_id: '', qty: 1 }])}>Thêm hàng thành phần</Btn>
        {cost && rows.length > 0 && <span className="muted small">Tổng giá vốn thành phần ≈ {money(total)} đ</span>}</div>
    </div>
  );
}

export function ProductForm({ id, copy_of, type: type0, onClose, onSaved }) {
  const { settings, rpc, toast, can, open } = useApp();
  const all = useProducts();
  const { run, busy } = useAction();
  const [f, setF] = useState({ ...EMPTY, product_type: type0 || 'hang', unit: (settings.units || ['Cái'])[0] });
  const [tab, setTab] = useState('info');
  const [loaded, setLoaded] = useState(!id && !copy_of);
  const [variants, setVariants] = useState(null);   // {attrs: {pattern: 'a, b'}, rows: [...]}
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const pn = settings.price_names || ['Giá 1', 'Giá 2', 'Giá 3'];
  const prof = bookProfile(settings);
  const shownAttrs = ATTRS.filter((a) => prof.has(a.key));
  const src = id || copy_of;
  useEffect(() => {
    if (!src) return;
    rpc('q', { view: 'products', filters: [['id', 'eq', src]] }).then(([p]) => {
      const base = { ...EMPTY, ...p, cost: p.product_type === 'dich_vu' ? p.last_cost : null,
        components: (p.components || []).map((c) => ({ product_id: c.product_id, qty: c.qty })), bom: (p.bom || []).map((c) => ({ product_id: c.product_id, qty: c.qty })),
        units: (p.units || []).map((u) => ({ name: u.name, conv: u.conv, prices: u.prices || [], sell_direct: !!u.sell_direct })), images: p.images || [] };
      setF(copy_of ? { ...base, id: undefined, sku: '', name: `${p.name} (bản sao)`, opening_qty: null, cost: p.product_type === 'dich_vu' ? p.last_cost : p.avg_cost } : base);
      setLoaded(true);
    }).catch((e) => toast(e.message, 'err'));
  }, [src]);
  const t = f.product_type;
  const svc = t === 'dich_vu'; const kit = t === 'combo'; const mfg = t === 'san_xuat';
  const stocked = !svc && !kit;
  const isNew = !id;
  const brands = [...new Set((all.data || []).map((p) => p.brand).filter(Boolean))];
  const locs = [...new Set([...(settings.locations || []), ...(all.data || []).map((p) => p.location).filter(Boolean)])];
  const compItems = (all.data || []).filter((p) => !p.is_kit && !p.is_service && p.id !== id);
  const unitLc = String(f.unit || 'cái').toLowerCase();

  const genVariants = (attrs) => {
    const keys = ATTRS.filter((a) => splitVals(attrs[a.key]).length);
    if (!keys.length) return [];
    return cartesian(keys.map((a) => splitVals(attrs[a.key]))).map((vals) => {
      const o = Object.fromEntries(keys.map((a, i) => [a.key, vals[i]]));
      const old = variants?.rows?.find((r) => keys.every((a) => r[a.key] === o[a.key]));
      return old || { ...o, name: [f.name, ...vals].filter(Boolean).join(' '), sku: '', price1: f.price1, cost: f.cost, opening_qty: null };
    });
  };
  const setAttr = (k, v) => setVariants((s) => { const attrs = { ...(s?.attrs || {}), [k]: v }; return { attrs, rows: genVariants(attrs) }; });
  const setVar = (i, patch) => setVariants((s) => ({ ...s, rows: s.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  const payload0 = () => ({ ...f, id: id || null, cost: f.cost, opening_qty: isNew ? f.opening_qty : null,
    units: f.units.map((u) => ({ ...u, prices: (u.prices || []).map((x) => (x === '' ? null : x)) })),
    components: kit ? f.components.filter((c) => c.product_id) : [], bom: mfg ? f.bom.filter((c) => c.product_id) : [] });
  const save = async (again) => {
    let r;
    const thumb = await thumbOf(f.images?.[0]).catch(() => null);
    const payload = () => ({ ...payload0(), thumb });
    if (isNew && variants?.rows?.length) {
      const base = payload();
      r = await run('create_product_variants', { base, variants: variants.rows.map((v) => ({ ...v })) }, (x) => `Đã tạo ${x.created.length} mã hàng`);
      if (r) r = r.created[0];
    } else r = await run('save_product', payload(), (x) => 'Đã lưu ' + x.sku);
    if (!r) return;
    onSaved?.(r);
    onClose();
    if (again) open('product', { type: t });
  };

  if (!loaded) return <Modal title="Hàng hóa" onClose={onClose}><Loading /></Modal>;
  const title = id ? `Sửa ${typeLabel(t).toLowerCase()} ${f.sku}` : `Tạo ${typeLabel(t).toLowerCase()}`;
  return (
    <Modal title={title} onClose={onClose} size="xl"
      footer={<>
        <Check checked={f.sell_direct} onChange={(v) => set('sell_direct', v)}>Bán trực tiếp</Check>
        <Check checked={f.active} onChange={(v) => set('active', v)}>Đang kinh doanh</Check>
        <span className="grow" />
        <Btn onClick={onClose}>Bỏ qua</Btn>
        {isNew && <Btn busy={busy} onClick={() => save(true)}>Lưu & tạo thêm</Btn>}
        <Btn kind="primary" busy={busy} onClick={() => save(false)}>Lưu</Btn>
      </>}>
      <div className="row gap" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'info', label: 'Thông tin' }, { value: 'desc', label: 'Mô tả' }]} />
        <div className="seg">{PRODUCT_TYPES.map((x) => <button key={x.value} className={t === x.value ? 'on' : ''} onClick={() => set('product_type', x.value)}>{x.label}</button>)}</div>
      </div>

      {tab === 'desc' && <div className="stack" style={{ marginTop: 12 }}>
        <Field label="Mô tả" hint="Hiện ở chi tiết hàng hóa và xuất Excel"><TextArea rows={6} value={f.description} onChange={(v) => set('description', v)} /></Field>
        <Field label="Mẫu ghi chú (hóa đơn, đặt hàng)" hint="Tự điền vào ghi chú của dòng hàng khi thêm hàng này vào đơn"><TextArea rows={3} value={f.order_note} onChange={(v) => set('order_note', v)} /></Field>
        <Field label="Ghi chú nội bộ"><TextArea value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>}

      {tab === 'info' && <div className="stack" style={{ marginTop: 12 }}>
        <div className="row gap" style={{ alignItems: 'flex-start' }}>
          <div className="grid grow">
            <Field label="Mã hàng" hint={id ? '' : 'Để trống: hệ thống tự cấp'}><Input value={f.sku} onChange={(v) => set('sku', v)} placeholder="Tự động" disabled={isNew && !!variants?.rows?.length} /></Field>
            <Field label="Tên hàng" required wide><Input value={f.name} onChange={(v) => set('name', v)} placeholder="Bắt buộc" /></Field>
            <Field label="Nhóm hàng"><Input value={f.category} onChange={(v) => set('category', v)} list="cats" /><datalist id="cats">{[...new Set([...(settings.categories || []), ...(all.data || []).map((p) => p.category).filter(Boolean)])].map((c) => <option key={c} value={c} />)}</datalist></Field>
            {prof.has('brand') && <Field label="Thương hiệu"><Input value={f.brand} onChange={(v) => set('brand', v)} list="brands" /><datalist id="brands">{brands.map((c) => <option key={c} value={c} />)}</datalist></Field>}
          </div>
          <div className="stack" style={{ width: 220, gap: 6 }}>
            <div className="row gap-s" style={{ flexWrap: 'wrap' }}>
              {f.images.map((u, i) => (
                <span key={i} className="img-cell"><img src={u} alt="" className="thumb" style={{ width: 64, height: 64 }} />
                  <button className="img-x" onClick={() => set('images', f.images.filter((_, j) => j !== i))} aria-label="Xóa ảnh"><Icon name="x" size={12} /></button></span>
              ))}
              {f.images.length < 5 && <label className="thumb img-add" style={{ width: 64, height: 64, cursor: 'pointer' }} title="Thêm ảnh">
                <Icon name="plus" size={20} />
                <input type="file" accept="image/*" multiple hidden onChange={async (e) => {
                  const files = [...(e.target.files || [])].slice(0, 5 - f.images.length);
                  const big = files.filter((x) => x.size > 2 * 1024 * 1024);
                  if (big.length) toast('Mỗi ảnh không quá 2 MB', 'err');
                  const urls = await Promise.all(files.filter((x) => x.size <= 2 * 1024 * 1024).map((x) => resizeImage(x)));
                  setF((s) => ({ ...s, images: [...s.images, ...urls].slice(0, 5) })); e.target.value = '';
                }} />
              </label>}
            </div>
            <span className="muted small">Tối đa 5 ảnh, mỗi ảnh không quá 2 MB. Ảnh đầu tiên là ảnh đại diện.</span>
          </div>
        </div>

        {(kit || mfg) && <Section title="Hàng thành phần">
          <CompTable rows={kit ? f.components : f.bom} items={compItems} cost={can('xem_gia_von')} onChange={(rows) => set(kit ? 'components' : 'bom', rows)} />
          <div className="muted small">{kit ? 'Combo không có tồn riêng: khi bán, kho trừ từng hàng thành phần theo số lượng trên.' : 'Định mức cho 1 đơn vị thành phẩm. Phiếu Sản xuất tự điền thành phần theo định mức này.'}</div>
        </Section>}

        <Section title={svc ? 'Giá vốn, giá bán' : kit || mfg ? 'Giá bán' : 'Giá vốn, giá bán'}>
          <div className="grid">
            {can('xem_gia_von') && (svc || (isNew && t === 'hang'))
              && <Field label="Giá vốn" hint={svc ? 'Tính vào giá vốn mỗi lần bán dịch vụ' : 'Giá vốn của tồn kho ban đầu'}><NumInput min={0} value={f.cost} onChange={(v) => set('cost', v)} /></Field>}
            {can('xem_gia_von') && !isNew && stocked && <Field label="Giá vốn bình quân" hint="Tự tính theo nhập xuất kho"><Input value={money(f.avg_cost)} onChange={() => {}} disabled /></Field>}
            {pn.map((label, i) => <Field key={label} label={label}><NumInput min={0} value={f[`price${i + 1}`]} onChange={(v) => set(`price${i + 1}`, v)} /></Field>)}
          </div>
        </Section>

        {stocked && <Section title="Tồn kho">
          <div className="muted small">Quản lý số lượng tồn kho và định mức tồn. Khi tồn chạm định mức, hàng hiện ở mục “Sắp hết hàng”.</div>
          <div className="grid">
            {isNew && !mfg && <Field label="Tồn kho ban đầu" hint={can('owner') ? 'Tự lập phiếu Tồn đầu kỳ theo giá vốn' : 'Chỉ chủ cửa hàng nhập tồn đầu kỳ'}>
              <NumInput money={false} min={0} value={f.opening_qty} onChange={(v) => set('opening_qty', v)} disabled={!can('owner') || !!variants?.rows?.length} suffix={f.unit} /></Field>}
            <Field label="Định mức tồn thấp nhất"><NumInput money={false} min={0} value={f.low_stock} onChange={(v) => set('low_stock', v)} /></Field>
            <Field label="Định mức tồn cao nhất" hint="Để trống: không giới hạn"><NumInput money={false} min={0} value={f.max_stock} onChange={(v) => set('max_stock', v)} /></Field>
          </div>
        </Section>}

        <Section title={svc ? 'Kích thước, trọng lượng' : 'Vị trí, trọng lượng, kích thước'}>
          <div className="grid">
            {!svc && <Field label="Vị trí"><Input value={f.location} onChange={(v) => set('location', v)} list="locs" placeholder="vd. Kệ A1, Kho sau" /><datalist id="locs">{locs.map((c) => <option key={c} value={c} />)}</datalist></Field>}
            <Field label={`Trọng lượng 1 ${unitLc} (kg)`} hint="Dùng để tính tổng trọng lượng đơn"><NumInput money={false} min={0} step={0.05} suffix="kg" value={f.unit_weight} onChange={(v) => set('unit_weight', v)} /></Field>
            <Field label="Kích thước (rộng × dài)">
              <div className="dim-row">
                <NumInput money={false} min={0} value={f.width} onChange={(v) => set('width', v)} placeholder="Rộng" aria-label="Rộng" />
                <NumInput money={false} min={0} value={f.length} onChange={(v) => set('length', v)} placeholder="Dài" aria-label="Dài" />
                <Select value={f.dim_unit} onChange={(v) => set('dim_unit', v)} options={['cm', 'm']} aria-label="Đơn vị kích thước" />
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Thuộc tính">
          {isNew && <Check checked={!!variants} onChange={(v) => setVariants(v ? { attrs: {}, rows: [] } : null)}>Tạo nhiều biến thể cùng lúc (mỗi tổ hợp thuộc tính là một mã hàng)</Check>}
          {!variants && <div className="grid">
            {shownAttrs.map((a) => <Field key={a.key} label={a.label}><Input value={f[a.key]} onChange={(v) => set(a.key, v)} placeholder={a.key === 'material' ? 'Gốm, sứ…' : ''} /></Field>)}
            {prof.has('norm_m2') && <Field label="Định mức theo m²" hint="vd. 27 cặp/m². Dùng để tính số lượng khi báo giá"><NumInput money={false} min={0} value={f.norm_m2} onChange={(v) => set('norm_m2', v)} /></Field>}
            {prof.has('norm_m') && <Field label="Định mức theo mét dài" hint="vd. 5 cặp/m diềm"><NumInput money={false} min={0} value={f.norm_m} onChange={(v) => set('norm_m', v)} /></Field>}
          </div>}
          {variants && <div className="stack">
            <div className="grid">{shownAttrs.map((a) => <Field key={a.key} label={a.label} hint="Nhiều giá trị cách nhau dấu phẩy"><Input value={variants.attrs[a.key] || ''} onChange={(v) => setAttr(a.key, v)} placeholder="vd. Đỏ, Nâu, Xanh" /></Field>)}</div>
            {variants.rows.length > 0 && <Table dense rowKey="name" rows={variants.rows} columns={[
              { key: 'n', label: 'Tên hàng', render: (r, i) => <Input value={r.name} onChange={(v) => setVar(i, { name: v })} /> },
              { key: 's', label: 'Mã hàng', render: (r, i) => <Input value={r.sku} onChange={(v) => setVar(i, { sku: v })} placeholder="Tự động" style={{ maxWidth: 130 }} /> },
              { key: 'p', label: pn[0], align: 'right', render: (r, i) => <NumInput min={0} value={r.price1} onChange={(v) => setVar(i, { price1: v })} style={{ maxWidth: 130 }} /> },
              ...(t === 'hang' && can('xem_gia_von') ? [{ key: 'c', label: 'Giá vốn', align: 'right', render: (r, i) => <NumInput min={0} value={r.cost} onChange={(v) => setVar(i, { cost: v })} style={{ maxWidth: 120 }} /> }] : []),
              ...(t === 'hang' && can('owner') ? [{ key: 'q', label: 'Tồn ban đầu', align: 'right', render: (r, i) => <NumInput money={false} min={0} value={r.opening_qty} onChange={(v) => setVar(i, { opening_qty: v })} style={{ maxWidth: 100 }} /> }] : []),
              { key: 'x', label: '', render: (r, i) => <button className="icon-btn" onClick={() => setVariants((s) => ({ ...s, rows: s.rows.filter((_, j) => j !== i) }))} aria-label="Bỏ biến thể"><Icon name="x" /></button> },
            ]} />}
            {variants.rows.length > 0 && <div className="muted small">Sẽ tạo {variants.rows.length} mã hàng. Các ô khác của form (nhóm hàng, giá các mức, đơn vị, định mức…) áp dụng chung.</div>}
          </div>}
        </Section>

        <Section title="Đơn vị tính">
          <div className="muted small">Thêm đơn vị bán hoặc nhập như hộp, thùng, pallet. Ví dụ: 1 hộp = 140 viên. Kho luôn tính theo đơn vị cơ bản.</div>
          <div className="grid">
            <Field label="Đơn vị cơ bản"><Input value={f.unit} onChange={(v) => set('unit', v)} list="units" /><datalist id="units">{(settings.units || []).map((c) => <option key={c} value={c} />)}</datalist></Field>
            {stocked && prof.packaging && <Field label={`Quy cách in: số ${unitLc} / ${f.pack_unit || 'hộp'}`} hint="Để in “4 hộp x 140 viên + 40 viên” trên hóa đơn, biên bản"><NumInput money={false} min={1} value={f.units_per_pack} onChange={(v) => set('units_per_pack', v)} placeholder="vd. 140" /></Field>}
            {stocked && prof.packaging && <Field label="Đơn vị đóng gói"><Input value={f.pack_unit} onChange={(v) => set('pack_unit', v)} list="packs" /><datalist id="packs">{['hộp', 'thùng', 'kiện', 'bao', 'pallet'].map((c) => <option key={c} value={c} />)}</datalist></Field>}
            {stocked && prof.packaging && <Field label={`Trọng lượng 1 ${f.pack_unit || 'hộp'} (kg)`}><NumInput money={false} min={0} step={0.5} suffix="kg" value={f.pack_weight} onChange={(v) => set('pack_weight', v)} placeholder="vd. 28" /></Field>}
          </div>
          {f.units.map((u, i) => {
            const setU = (patch) => set('units', f.units.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div className="unit-row" key={i}>
                <Field label="Tên đơn vị"><Input value={u.name} onChange={(v) => setU({ name: v })} placeholder="vd. Hộp" /></Field>
                <Field label={`Quy đổi (${f.unit})`}><NumInput money={false} min={0} value={u.conv} onChange={(v) => setU({ conv: v })} suffix={f.unit} /></Field>
                {pn.map((label, k) => <Field key={label} label={label} hint={`Trống: ${money((f[`price${k + 1}`] || 0) * (Number(u.conv) || 0))}`}>
                  <NumInput min={0} value={u.prices?.[k] ?? null} onChange={(v) => { const pr = [...(u.prices || [])]; pr[k] = v; setU({ prices: pr }); }} /></Field>)}
                <Check checked={u.sell_direct !== false} onChange={(v) => setU({ sell_direct: v })}>Bán trực tiếp</Check>
                <button className="icon-btn" onClick={() => set('units', f.units.filter((_, j) => j !== i))} aria-label="Xóa đơn vị"><Icon name="trash" /></button>
              </div>
            );
          })}
          <div><Btn small icon="plus" onClick={() => set('units', [...f.units, { name: f.units.length ? '' : f.pack_unit || 'Hộp', conv: f.units.length ? null : f.units_per_pack, prices: [], sell_direct: true }])}>Thêm đơn vị</Btn></div>
        </Section>
      </div>}
    </Modal>
  );
}
