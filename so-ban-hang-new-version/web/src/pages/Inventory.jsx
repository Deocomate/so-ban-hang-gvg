import React, { useMemo, useState } from 'react';
import { useApp, useQ, useAction, useRpcData } from '../lib/store.jsx';
import { money, qty as fq, dmy, todayVN, match } from '../lib/format.js';
import { useProducts, productLabel, productSub } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { PeriodPicker, usePeriod } from '../components/Period.jsx';
import { Btn, Icon, Pill, Field, Input, Select, DateInput, NumInput, Tabs, Search, Loading, ErrorBox, Note, Table, Modal, Picker, KV, Section } from '../components/ui.jsx';

const REASONS = [
  { value: 'vo', label: 'Hàng vỡ' }, { value: 'loi', label: 'Hàng lỗi' }, { value: 'that_thoat', label: 'Thất thoát / mất' },
  { value: 'kiem_ke', label: 'Kiểm kê (nhập số đếm thực tế)' }, { value: 'khac', label: 'Khác' },
];

export function InventoryPage() {
  const { open, can, settings } = useApp();
  const [tab, setTab] = useState('stock');
  const [search, setSearch] = useState(''); const [cat, setCat] = useState(''); const [only, setOnly] = useState('');
  const prods = useQ('products', [['is_kit', 'eq', 'false']], 'sku', 5000);
  const cost = can('xem_gia_von');
  const rows = useMemo(() => (prods.data || []).filter((p) => (!cat || p.category === cat) && match(`${p.sku} ${p.name} ${p.size || ''} ${p.color || ''}`, search)
    && (only === '' || (only === 'low' && p.is_low) || (only === 'reserved' && p.reserved > 0) || (only === 'incoming' && p.incoming > 0) || (only === 'zero' && p.on_hand <= 0))), [prods.data, cat, search, only]);
  const tot = rows.reduce((s, p) => s + (p.stock_value || 0), 0);
  return (
    <>
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Kho</h1><div className="page-sub">Tồn thực tế = tồn trong kho. Có thể bán = tồn thực tế − hàng đang giữ cho đơn đã xác nhận chưa giao.</div></div>
        {can('kho') && <Btn kind="soft" icon="edit" onClick={() => open('adjust', {})}>Điều chỉnh kho</Btn>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'stock', label: 'Tồn kho' }, { value: 'nxt', label: 'Nhập – xuất – tồn theo kỳ' }, { value: 'adj', label: 'Phiếu điều chỉnh' }]} />
      {tab === 'stock' && <>
        <div className="row gap">
          <Search value={search} onChange={setSearch} placeholder="Tìm SKU, tên, màu, cỡ…" />
          <Select value={cat} onChange={setCat} options={settings.categories || []} placeholder="Mọi chủng loại" style={{ maxWidth: 220 }} />
          <Select value={only} onChange={setOnly} placeholder="Tất cả" options={[{ value: 'low', label: 'Sắp hết / dưới tối thiểu' }, { value: 'reserved', label: 'Đang giữ cho đơn' }, { value: 'incoming', label: 'Đang về' }, { value: 'zero', label: 'Hết hàng' }]} style={{ maxWidth: 220 }} />
          <Btn icon="dl" onClick={() => exportXlsx('ton-kho.xlsx', [{ name: 'Tồn kho', rows, columns: [
            { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Tên' }, { key: 'category', label: 'Chủng loại' }, { key: 'size', label: 'Kích thước' }, { key: 'color', label: 'Màu' }, { key: 'unit', label: 'ĐVT' },
            { key: 'on_hand', label: 'Tồn thực tế' }, { key: 'reserved', label: 'Đang giữ' }, { key: 'available', label: 'Có thể bán' }, { key: 'incoming', label: 'Đang về' },
            ...(cost ? [{ key: 'avg_cost', label: 'Giá vốn BQ' }, { key: 'stock_value', label: 'Giá trị tồn' }] : []), { key: 'low_stock', label: 'Tồn tối thiểu' }] }])}>Xuất Excel</Btn>
        </div>
        <ErrorBox error={prods.error} />
        <Table rows={prods.data ? rows : null} onRow={(p) => open('stockcard', { product_id: p.id })} rowClass={(p) => (p.on_hand < 0 ? 'row-late' : p.is_low ? 'row-warn' : '')}
          foot={cost ? { v: money(tot), p: `${rows.length} mã` } : null} columns={[
            { key: 'p', label: 'Sản phẩm', render: (p) => <><div className="cell-main">{p.sku} · {p.name}</div><div className="cell-sub">{productSub(p)}</div></> },
            { key: 'oh', label: 'Tồn thực tế', align: 'right', render: (p) => <b>{fq(p.on_hand)}</b> },
            { key: 'rs', label: 'Đang giữ', align: 'right', render: (p) => (p.reserved ? fq(p.reserved) : '—') },
            { key: 'av', label: 'Có thể bán', align: 'right', render: (p) => <span className={p.available <= 0 ? 'bad strong' : p.is_low ? 'warn strong' : ''}>{fq(p.available)} {p.unit}</span> },
            { key: 'in', label: 'Đang về', align: 'right', render: (p) => (p.incoming ? fq(p.incoming) : '—') },
            ...(cost ? [{ key: 'c', label: 'Giá vốn BQ', align: 'right', render: (p) => money(p.avg_cost) }, { key: 'v', label: 'Giá trị tồn', align: 'right', render: (p) => money(p.stock_value) }] : []),
            { key: 'l', label: '', render: (p) => (p.on_hand < 0 ? <Pill tone="bad">âm kho</Pill> : p.is_low ? <Pill tone="warn">sắp hết</Pill> : null) },
          ]} />
      </>}
      {tab === 'nxt' && <StockReport />}
      {tab === 'adj' && <AdjList />}
    </>
  );
}

export function StockReport() {
  const { can } = useApp();
  const [period, setPeriod] = usePeriod('30d');
  const r = useRpcData('rpt_stock', { from: period.from, to: period.to });
  const cost = can('xem_gia_von');
  const rows = (r.data || []).filter((x) => x.open_qty || x.in_qty || x.sold_qty || x.adj_qty || x.close_qty);
  const sum = (k) => rows.reduce((s, x) => s + (x[k] || 0), 0);
  return (
    <div className="stack">
      <div className="row gap"><PeriodPicker value={period} onChange={setPeriod} />
        <Btn icon="dl" onClick={() => exportXlsx(`nhap-xuat-ton_${period.from}_${period.to}.xlsx`, [{ name: 'Nhập xuất tồn', rows, columns: [
          { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Tên' }, { key: 'unit', label: 'ĐVT' }, { key: 'open_qty', label: 'Tồn đầu kỳ' }, { key: 'in_qty', label: 'Nhập (thuần)' },
          { key: 'sold_qty', label: 'Xuất bán (thuần)' }, { key: 'adj_qty', label: 'Điều chỉnh ±' }, { key: 'close_qty', label: 'Tồn cuối kỳ' },
          ...(cost ? [{ key: 'open_value', label: 'GT đầu kỳ' }, { key: 'in_value', label: 'GT nhập' }, { key: 'sold_value', label: 'Giá vốn xuất bán' }, { key: 'adj_value', label: 'GT điều chỉnh' }, { key: 'close_value', label: 'GT cuối kỳ' }] : [])] }])}>Xuất Excel</Btn></div>
      <div className="muted small">Tồn đầu kỳ gồm cả phiếu “Tồn đầu kỳ” khi bắt đầu dùng phần mềm. Nhập = nhận hàng − trả NCC. Xuất bán = giao − khách trả lại. Điều chỉnh = vỡ, lỗi, kiểm kê.</div>
      <ErrorBox error={r.error} />
      <Table dense rows={r.data ? rows : null} foot={cost ? { ov: money(sum('open_value')), iv: money(sum('in_value')), sv: money(sum('sold_value')), av: money(sum('adj_value')), cv: money(sum('close_value')) } : null} columns={[
        { key: 'p', label: 'Sản phẩm', render: (x) => <><b>{x.sku}</b> · {x.name}</> },
        { key: 'o', label: 'Đầu kỳ', align: 'right', render: (x) => fq(x.open_qty) },
        { key: 'i', label: 'Nhập', align: 'right', render: (x) => fq(x.in_qty) },
        { key: 's', label: 'Xuất bán', align: 'right', render: (x) => fq(x.sold_qty) },
        { key: 'a', label: 'Điều chỉnh', align: 'right', render: (x) => fq(x.adj_qty) },
        { key: 'c', label: 'Cuối kỳ', align: 'right', render: (x) => <b>{fq(x.close_qty)}</b> },
        ...(cost ? [
          { key: 'ov', label: 'GT đầu', align: 'right', render: (x) => money(x.open_value) }, { key: 'iv', label: 'GT nhập', align: 'right', render: (x) => money(x.in_value) },
          { key: 'sv', label: 'Giá vốn bán', align: 'right', render: (x) => money(x.sold_value) }, { key: 'av', label: 'GT đ.chỉnh', align: 'right', render: (x) => money(x.adj_value) },
          { key: 'cv', label: 'GT cuối', align: 'right', render: (x) => <b>{money(x.close_value)}</b> }] : []),
      ]} />
    </div>
  );
}

function AdjList() {
  const q = useQ('adjustments', [], 'created_at desc', 1000);
  const { can } = useApp();
  return <Table rows={q.data} empty="Chưa có phiếu điều chỉnh" columns={[
    { key: 'c', label: 'Phiếu', render: (a) => <><b>{a.code}</b><div className="cell-sub">{dmy(a.adj_date)}</div></> },
    { key: 'r', label: 'Lý do', render: (a) => <><Pill tone={a.reason === 'dau_ky' ? 'info' : a.reason === 'kiem_ke' ? 'neutral' : 'warn'}>{a.reason_label}</Pill><div className="cell-sub">{a.note}</div></> },
    { key: 'l', label: 'Hàng', render: (a) => <span className="small">{(a.lines || []).slice(0, 6).map((x) => `${x.sku} ${x.qty > 0 ? '+' : ''}${fq(x.qty)}`).join('; ')}{(a.lines || []).length > 6 ? ` … (+${a.lines.length - 6})` : ''}</span> },
    ...(can('xem_gia_von') ? [{ key: 'v', label: 'Giá trị', align: 'right', render: (a) => money(a.value) }] : []),
  ]} />;
}

export function StockCard({ product_id, onClose }) {
  const { open, can } = useApp();
  const p = useQ('products', [['id', 'eq', product_id]]);
  const moves = useQ('stock_moves', [['product_id', 'eq', product_id]], 'id desc', 1000);
  const d = p.data?.[0];
  const cost = can('xem_gia_von');
  const openDoc = (m) => {
    if (m.order_id) return open('order', { id: m.order_id });
    if (m.po_id) return open('po', { id: m.po_id });
    return null;
  };
  return (
    <Modal title={d ? `Thẻ kho · ${d.sku}` : 'Thẻ kho'} subtitle={d ? `${d.name} · ${productSub(d)}` : ''} onClose={onClose} size="xl"
      footer={d && <>
        {can('danh_muc') && <Btn icon="edit" onClick={() => open('product', { id: product_id })}>Sửa sản phẩm</Btn>}
        <span className="grow" />
        {can('kho') && !d.is_kit && <Btn onClick={() => open('adjust', { product_id })}>Điều chỉnh</Btn>}
        {can('nhap_hang') && !d.is_kit && <Btn kind="soft" icon="truck" onClick={() => open('po-form', { product_id })}>Đặt thêm</Btn>}
      </>}>
      {!d ? <Loading /> : <>
        <div className="kpis">
          <div className="kpi"><span className="kpi-label">Tồn thực tế</span><span className="kpi-value">{fq(d.on_hand)} {d.unit}</span></div>
          <div className="kpi"><span className="kpi-label">Đang giữ cho đơn</span><span className="kpi-value">{fq(d.reserved)}</span></div>
          <div className="kpi"><span className="kpi-label">Có thể bán</span><span className={`kpi-value ${d.is_low ? 'warn' : ''}`}>{fq(d.available)}</span><span className="kpi-sub">tối thiểu {fq(d.low_stock)}</span></div>
          <div className="kpi"><span className="kpi-label">Đang về</span><span className="kpi-value">{fq(d.incoming)}</span></div>
          {cost && <div className="kpi"><span className="kpi-label">Giá vốn bình quân</span><span className="kpi-value">{money(d.avg_cost)}</span><span className="kpi-sub">giá trị tồn {money(d.stock_value)}</span></div>}
        </div>
        {d.is_kit && <Note>Đây là bộ sản phẩm — không có tồn riêng. Khi bán, hệ thống trừ từng thành phần: {(d.components || []).map((c) => `${c.sku} × ${fq(c.qty)}`).join(', ')}.</Note>}
        <Section title="Lịch sử biến động (mới nhất trước)">
          <Table dense rows={moves.data} empty="Chưa có biến động" onRow={openDoc} columns={[
            { key: 'd', label: 'Ngày', render: (m) => dmy(m.move_date) },
            { key: 'doc', label: 'Chứng từ', render: (m) => <><b>{m.doc_code}</b> · {m.doc_label}{m.adj_reason && m.adj_reason !== 'dau_ky' ? ` (${REASONS.find((r) => r.value === m.adj_reason)?.label || m.adj_reason})` : ''}<div className="cell-sub">{[m.order_code, m.party_name, m.note].filter(Boolean).join(' · ')}</div></> },
            { key: 'q', label: 'Nhập / xuất', align: 'right', render: (m) => <span className={m.qty > 0 ? 'good strong' : m.qty < 0 ? 'bad strong' : ''}>{m.qty > 0 ? '+' : ''}{fq(m.qty)}</span> },
            ...(cost ? [{ key: 'u', label: 'Đơn giá vốn', align: 'right', render: (m) => money(m.unit_cost) }, { key: 'v', label: 'Giá trị', align: 'right', render: (m) => money(m.value) }] : []),
            { key: 'b', label: 'Tồn sau', align: 'right', render: (m) => <b>{fq(m.balance_qty)}</b> },
            ...(cost ? [{ key: 'bv', label: 'Giá trị tồn sau', align: 'right', render: (m) => money(m.balance_value) }] : []),
          ]} />
        </Section>
      </>}
    </Modal>
  );
}

let seq = 0;
export function AdjustForm({ product_id, onClose }) {
  const { can } = useApp();
  const products = useProducts();
  const { run, busy } = useAction();
  const [reason, setReason] = useState('vo'); const [date, setDate] = useState(todayVN()); const [note, setNote] = useState('');
  const [lines, setLines] = useState([{ key: ++seq, product_id: product_id || '', qty: null, count: null, unit_cost: null }]);
  const pmap = useMemo(() => Object.fromEntries((products.data || []).map((p) => [p.id, p])), [products.data]);
  const setL = (k, patch) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const delta = (l) => {
    const p = pmap[l.product_id]; if (!p) return 0;
    if (reason === 'kiem_ke') return l.count === null || l.count === undefined ? 0 : Number(l.count) - p.on_hand;
    if (reason === 'khac') return Number(l.qty) || 0;
    return -(Math.abs(Number(l.qty) || 0));
  };
  return (
    <Modal title="Điều chỉnh kho" onClose={onClose} size="lg" subtitle="Ghi hàng vỡ, lỗi, thất thoát hoặc kết quả kiểm kê. Phiếu có lý do, không sửa thẳng số tồn."
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const ls = lines.filter((l) => l.product_id && delta(l) !== 0).map((l) => ({ product_id: l.product_id, qty_delta: delta(l), unit_cost: delta(l) > 0 ? l.unit_cost : null }));
        const r = await run('adjust_stock', { date, reason, note, lines: ls }, (x) => 'Đã lập phiếu ' + x.code);
        if (r) onClose();
      }}>Lưu phiếu</Btn></>}>
      <div className="grid">
        <Field label="Lý do"><Select value={reason} onChange={setReason} options={REASONS} /></Field>
        <Field label="Ngày"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        <Field label="Ghi chú" hint={reason === 'kiem_ke' || reason === 'khac' ? 'Bắt buộc' : ''}><Input value={note} onChange={setNote} placeholder="vd. Rơi vỡ khi dỡ hàng" /></Field>
      </div>
      {['vo', 'loi', 'that_thoat'].includes(reason) && <Note>Số lượng nhập là số bị mất/hỏng. Giá trị theo giá vốn bình quân được tính vào “hao hụt kho” trong chi phí vận hành.</Note>}
      <div className="stack">
        {lines.map((l) => {
          const p = pmap[l.product_id];
          return (
            <div key={l.key} className="row gap" style={{ alignItems: 'flex-end' }}>
              <div className="grow" style={{ minWidth: 220 }}><Field label="Sản phẩm"><Picker items={(products.data || []).filter((x) => !x.is_kit)} value={l.product_id} onChange={(v) => setL(l.key, { product_id: v })}
                getLabel={productLabel} getSub={(x) => `${productSub(x)} · tồn ${fq(x.on_hand)}`} /></Field></div>
              {reason === 'kiem_ke'
                ? <Field label={`Số đếm thực tế${p ? ` (sổ: ${fq(p.on_hand)})` : ''}`}><NumInput money={false} value={l.count} onChange={(v) => setL(l.key, { count: v })} style={{ maxWidth: 140 }} /></Field>
                : <Field label={reason === 'khac' ? 'Số lượng ± (âm = giảm)' : 'Số lượng mất / hỏng'}><NumInput money={false} value={l.qty} onChange={(v) => setL(l.key, { qty: v })} style={{ maxWidth: 140 }} /></Field>}
              {p && <span className="muted small" style={{ paddingBottom: 10 }}>chênh {delta(l) > 0 ? '+' : ''}{fq(delta(l))} → còn {fq(p.on_hand + delta(l))}</span>}
              {delta(l) > 0 && can('xem_gia_von') && <Field label="Giá vốn (để trống = bình quân)"><NumInput value={l.unit_cost} onChange={(v) => setL(l.key, { unit_cost: v })} style={{ maxWidth: 140 }} /></Field>}
            </div>
          );
        })}
        <div><Btn small icon="plus" onClick={() => setLines((ls) => [...ls, { key: ++seq, product_id: '', qty: null, count: null }])}>Thêm dòng</Btn></div>
      </div>
    </Modal>
  );
}
