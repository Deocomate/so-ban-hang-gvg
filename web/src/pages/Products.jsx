import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, match } from '../lib/format.js';
import { useProducts, productLabel, productSub } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, Icon, Pill, Field, Input, TextArea, Select, NumInput, Check, Search, Loading, ErrorBox, Note, Table, Modal, Picker } from '../components/ui.jsx';

export function ProductsPage() {
  const { open, can, settings } = useApp();
  const [search, setSearch] = useState(''); const [cat, setCat] = useState(''); const [showOff, setShowOff] = useState(false);
  const q = useQ('products', [], 'sku', 5000);
  const pn = settings.price_names || ['Giá 1', 'Giá 2', 'Giá 3'];
  const cost = can('xem_gia_von');
  const rows = useMemo(() => (q.data || []).filter((p) => (showOff || p.active) && (!cat || p.category === cat) && match(`${p.sku} ${p.name} ${p.size || ''} ${p.color || ''} ${p.pattern || ''}`, search)), [q.data, search, cat, showOff]);
  return (
    <>
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Sản phẩm</h1><div className="page-sub">Mỗi biến thể (mẫu + kích thước + màu men + ĐVT) có một mã SKU riêng. 3 mức giá: {pn.join(' / ')}.</div></div>
        <Btn icon="dl" onClick={() => exportXlsx('san-pham.xlsx', [{ name: 'Sản phẩm', rows, columns: [
          { key: 'sku', label: 'Mã SKU' }, { key: 'name', label: 'Tên hàng hóa' }, { key: 'category', label: 'Chủng loại' }, { key: 'pattern', label: 'Mẫu' }, { key: 'size', label: 'Kích thước' },
          { key: 'color', label: 'Màu sắc / men' }, { key: 'unit', label: 'ĐVT' }, ...(cost ? [{ key: 'avg_cost', label: 'Giá vốn' }] : []),
          { key: 'price1', label: pn[0] }, { key: 'price2', label: pn[1] }, { key: 'price3', label: pn[2] }, { key: 'on_hand', label: 'Số lượng tồn' }, { key: 'low_stock', label: 'Tồn tối thiểu' }, { key: 'note', label: 'Ghi chú' }] }])}>Xuất Excel</Btn>
        {can('owner') && <Btn icon="up" onClick={() => open('import', { kind: 'products' })}>Nhập từ Excel</Btn>}
        {can('danh_muc') && <Btn kind="primary" icon="plus" onClick={() => open('product', {})}>Thêm sản phẩm</Btn>}
      </div>
      <div className="row gap">
        <Search value={search} onChange={setSearch} placeholder="Tìm SKU, tên, màu, kích thước…" />
        <Select value={cat} onChange={setCat} options={settings.categories || []} placeholder="Mọi chủng loại" style={{ maxWidth: 220 }} />
        <Check checked={showOff} onChange={setShowOff}>Hiện cả mã ngừng bán</Check>
      </div>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} onRow={(p) => open('stockcard', { product_id: p.id })} empty={<span>Chưa có sản phẩm. {can('owner') && 'Bấm “Nhập từ Excel” để đưa toàn bộ hàng hóa vào một lần.'}</span>} columns={[
        { key: 'img', label: '', width: 48, render: (p) => (p.image_url ? <img className="thumb" src={p.image_url} alt="" /> : <span className="thumb"><Icon name="vase" size={18} /></span>) },
        { key: 'p', label: 'Sản phẩm', render: (p) => <><div className="cell-main">{p.sku} · {p.name} {p.is_kit && <Pill tone="accent">Bộ</Pill>} {!p.active && <Pill tone="mute">ngừng bán</Pill>}</div><div className="cell-sub">{[p.category, productSub(p), p.unit].filter(Boolean).join(' · ')}</div></> },
        ...(cost ? [{ key: 'c', label: 'Giá vốn', align: 'right', render: (p) => money(p.avg_cost) }] : []),
        { key: 'p1', label: pn[0], align: 'right', render: (p) => money(p.price1) },
        { key: 'p2', label: pn[1], align: 'right', render: (p) => money(p.price2) },
        { key: 'p3', label: pn[2], align: 'right', render: (p) => money(p.price3) },
        { key: 'oh', label: 'Có thể bán', align: 'right', render: (p) => <span className={p.is_low ? 'warn strong' : ''}>{fq(p.available)}</span> },
      ]} />
    </>
  );
}

async function resizeImage(file, max = 360) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export function ProductForm({ id, onClose, onSaved }) {
  const { settings, rpc, toast, can } = useApp();
  const all = useProducts();
  const { run, busy } = useAction();
  const [f, setF] = useState({ sku: '', name: '', category: '', pattern: '', size: '', color: '', unit: (settings.units || ['Cái'])[0], price1: null, price2: null, price3: null,
    low_stock: 0, is_kit: false, active: true, note: '', image_url: '', components: [], units_per_pack: null, pack_unit: 'hộp' });
  const [loaded, setLoaded] = useState(!id);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const pn = settings.price_names || ['Giá 1', 'Giá 2', 'Giá 3'];
  useEffect(() => {
    if (!id) return;
    rpc('q', { view: 'products', filters: [['id', 'eq', id]] }).then(([p]) => {
      setF({ ...p, components: (p.components || []).map((c) => ({ product_id: c.product_id, qty: c.qty })) }); setLoaded(true);
    }).catch((e) => toast(e.message, 'err'));
  }, [id]);
  const kitCost = f.is_kit && all.data ? f.components.reduce((s, c) => s + (all.data.find((p) => p.id === c.product_id)?.avg_cost || 0) * (Number(c.qty) || 0), 0) : null;
  if (!loaded) return <Modal title="Sản phẩm" onClose={onClose}><Loading /></Modal>;
  return (
    <Modal title={id ? `Sửa ${f.sku}` : 'Thêm sản phẩm'} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('save_product', { ...f, id: id || null }, (x) => 'Đã lưu ' + x.sku);
        if (r) { onSaved?.(r); onClose(); }
      }}>Lưu</Btn></>}>
      {!id && <Note>Giá vốn và số lượng tồn ban đầu được ghi qua phiếu “Tồn đầu kỳ” (nhập Excel) hoặc khi nhận hàng — không nhập tay ở đây để số liệu luôn có chứng từ.</Note>}
      <div className="row gap" style={{ alignItems: 'flex-start' }}>
        <label className="stack" style={{ alignItems: 'center', cursor: 'pointer', gap: 4 }}>
          {f.image_url ? <img src={f.image_url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10 }} /> : <span className="thumb" style={{ width: 96, height: 96 }}><Icon name="vase" size={32} /></span>}
          <span className="small" style={{ color: 'var(--accent)' }}>{f.image_url ? 'Đổi ảnh' : 'Thêm ảnh'}</span>
          <input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) set('image_url', await resizeImage(file)); }} />
          {f.image_url && <button className="icon-btn small" onClick={(e) => { e.preventDefault(); set('image_url', ''); }}>Xóa ảnh</button>}
        </label>
        <div className="grid grow">
          <Field label="Mã SKU" hint={id ? '' : 'Để trống: hệ thống tự cấp'}><Input value={f.sku} onChange={(v) => set('sku', v)} placeholder="vd. NAD-L-DO" /></Field>
          <Field label="Tên sản phẩm" required wide><Input value={f.name} onChange={(v) => set('name', v)} /></Field>
          <Field label="Chủng loại"><Input value={f.category} onChange={(v) => set('category', v)} list="cats" /><datalist id="cats">{(settings.categories || []).map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Mẫu"><Input value={f.pattern} onChange={(v) => set('pattern', v)} /></Field>
          <Field label="Kích thước"><Input value={f.size} onChange={(v) => set('size', v)} /></Field>
          <Field label="Màu sắc / men"><Input value={f.color} onChange={(v) => set('color', v)} /></Field>
          <Field label="Đơn vị tính"><Input value={f.unit} onChange={(v) => set('unit', v)} list="units" /><datalist id="units">{(settings.units || []).map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label={`Quy cách: số ${String(f.unit || 'cái').toLowerCase()} / ${f.pack_unit || 'hộp'}`} hint="Để in “4 hộp x 140 viên + 40 viên” trên hóa đơn, biên bản"><NumInput money={false} value={f.units_per_pack} onChange={(v) => set('units_per_pack', v)} placeholder="vd. 140" /></Field>
          <Field label="Đơn vị đóng gói"><Input value={f.pack_unit} onChange={(v) => set('pack_unit', v)} list="packs" /><datalist id="packs">{['hộp', 'thùng', 'kiện', 'bao', 'pallet'].map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="Cảnh báo khi còn ≤"><NumInput money={false} value={f.low_stock} onChange={(v) => set('low_stock', v)} /></Field>
        </div>
      </div>
      <div className="grid">
        {[1, 2, 3].map((i) => <Field key={i} label={pn[i - 1]}><NumInput value={f['price' + i]} onChange={(v) => set('price' + i, v)} /></Field>)}
      </div>
      <div className="row gap"><Check checked={f.is_kit} onChange={(v) => set('is_kit', v)}>Đây là bộ sản phẩm (bán theo bộ, trừ kho từng thành phần)</Check><Check checked={f.active} onChange={(v) => set('active', v)}>Đang bán</Check></div>
      {f.is_kit && (
        <div className="stack">
          {f.components.map((c, i) => (
            <div className="row gap" key={i}>
              <div className="grow" style={{ minWidth: 220 }}><Picker items={(all.data || []).filter((p) => !p.is_kit && p.id !== id)} value={c.product_id} getLabel={productLabel} getSub={productSub}
                onChange={(v) => setF((s) => ({ ...s, components: s.components.map((x, j) => (j === i ? { ...x, product_id: v } : x)) }))} /></div>
              <NumInput money={false} value={c.qty} onChange={(v) => setF((s) => ({ ...s, components: s.components.map((x, j) => (j === i ? { ...x, qty: v } : x)) }))} style={{ maxWidth: 100 }} />
              <button className="icon-btn" onClick={() => setF((s) => ({ ...s, components: s.components.filter((_, j) => j !== i) }))}><Icon name="x" /></button>
            </div>
          ))}
          <div className="row gap"><Btn small icon="plus" onClick={() => setF((s) => ({ ...s, components: [...s.components, { product_id: '', qty: 1 }] }))}>Thêm thành phần</Btn>
            {can('xem_gia_von') && kitCost !== null && <span className="muted small">Giá vốn bộ hiện tại ≈ {money(kitCost)} đ</span>}</div>
        </div>
      )}
      <Field label="Ghi chú"><TextArea value={f.note} onChange={(v) => set('note', v)} /></Field>
    </Modal>
  );
}
