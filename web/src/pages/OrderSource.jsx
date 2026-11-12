// Chọn nhanh nguồn hàng cho đơn đặt của khách: đặt xưởng sản xuất hoặc mua nhà cung cấp.
// Dùng ở chi tiết đơn (tạo ngay cho các dòng chưa đặt) và ở form tạo / sửa đơn (tạo ngay sau khi xác nhận đơn).
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useAction } from '../lib/store.jsx';
import { useSuppliers, useProducts } from '../lib/lookups.js';
import { qty as fq, todayVN } from '../lib/format.js';
import { Btn, Check, DateInput, Picker } from '../components/ui.jsx';

export const SOURCE_KINDS = [{ value: 'dat_sx', label: 'Đặt xưởng sản xuất', short: 'Đặt xưởng' }, { value: 'mua_san', label: 'Mua nhà cung cấp', short: 'Mua NCC' }];
const LAST_KEY = 'gomsu.source_supplier.';
const lastSupplier = (kind) => { try { return localStorage.getItem(LAST_KEY + kind) || ''; } catch (e) { return ''; } };
const rememberSupplier = (kind, id) => { try { localStorage.setItem(LAST_KEY + kind, id); } catch (e) { /* bỏ qua */ } };
const costOf = (p) => Math.round(p?.last_in_cost ?? p?.avg_cost ?? 0);

export const sourceReady = (s) => !!(s?.kind && s.supplier_id);
export const kindLabel = (kind) => (kind === 'dat_sx' ? 'đơn đặt xưởng' : 'đơn mua nhà cung cấp');

// Dữ liệu lưu đơn nhập gắn với đơn bán: mỗi dòng trỏ về dòng đơn bán để theo dõi tiến độ sản xuất / hàng về
export function sourcePoPayload({ order_id, source, lines, products }) {
  const pm = Object.fromEntries((products || []).map((p) => [p.id, p]));
  rememberSupplier(source.kind, source.supplier_id);
  return {
    mode: 'dat', kind: source.kind, supplier_id: source.supplier_id, order_date: todayVN(), expected_date: source.expected_date || null,
    sales_order_id: order_id, status: 'xac_nhan', discount: 0, note: null,
    lines: lines.map((l) => ({ product_id: l.product_id, qty: l.remaining_qty, unit_price: costOf(pm[l.product_id]), discount: 0, sales_order_line_id: l.id })),
  };
}

// Ô chọn: loại (xưởng / NCC), nơi đặt (nhớ nơi dùng lần trước), ngày hẹn nhận. allowNone: thêm lựa chọn "Chưa đặt".
export function SourceFields({ value, onChange, allowNone }) {
  const { open } = useApp();
  const suppliers = useSuppliers();
  const v = value || {};
  const pickKind = (kind) => {
    const last = kind && lastSupplier(kind);
    onChange({ ...v, kind, supplier_id: last && (suppliers.data || []).some((s) => s.id === last) ? last : (kind === v.kind ? v.supplier_id : '') });
  };
  // Lần đầu mở mà chưa chọn nơi đặt: lấy nơi dùng lần trước khi danh sách đã tải xong
  useEffect(() => { if (v.kind && !v.supplier_id && suppliers.data) pickKind(v.kind); }, [suppliers.data]);
  const kinds = allowNone ? [{ value: '', label: 'Chưa đặt' }, ...SOURCE_KINDS] : SOURCE_KINDS;
  return (
    <>
      <div className="seg" role="radiogroup" aria-label="Nguồn hàng">
        {kinds.map((k) => <button type="button" key={k.value} role="radio" aria-checked={v.kind === k.value} className={(v.kind || '') === k.value ? 'on' : ''} onClick={() => pickKind(k.value)} title={k.label}>{allowNone ? k.short || k.label : k.label}</button>)}
      </div>
      {v.kind && (
        <div className="src-row">
          <Picker items={suppliers.data || []} value={v.supplier_id} onChange={(id) => { onChange({ ...v, supplier_id: id }); }}
            placeholder={v.kind === 'dat_sx' ? 'Chọn xưởng sản xuất' : 'Chọn nhà cung cấp'}
            getLabel={(s) => s.name} getSub={(s) => `${s.code}${s.phone ? ' · ' + s.phone : ''}`} filterKeys={(s) => `${s.name} ${s.code} ${s.phone || ''}`}
            onCreate={(name) => open('party', { type: 'ncc', name, onSaved: (r) => onChange({ ...v, supplier_id: r.id }) })} createLabel="Thêm xưởng / nhà cung cấp mới" />
          <DateInput value={v.expected_date || ''} onChange={(d) => onChange({ ...v, expected_date: d })} min={todayVN()} placeholder="Hẹn nhận hàng" aria-label="Hẹn nhận hàng" />
        </div>
      )}
    </>
  );
}

// Trong chi tiết đơn: chọn dòng cần đặt (mặc định tất cả dòng chưa đặt), chọn nơi đặt rồi tạo luôn.
export function QuickSource({ order, lines }) {
  const { open } = useApp();
  const products = useProducts();
  const { run, busy } = useAction();
  const [source, setSource] = useState({ kind: 'dat_sx', supplier_id: '', expected_date: order.due_date || '' });
  const [off, setOff] = useState({});
  const picked = useMemo(() => lines.filter((l) => !off[l.id]), [lines, off]);
  const create = async () => {
    if (!sourceReady(source) || !picked.length) return;
    await run('save_purchase_order', sourcePoPayload({ order_id: order.id, source, lines: picked, products: products.data }),
      (x) => `Đã tạo ${kindLabel(source.kind)} ${x.code} cho ${picked.length} mặt hàng`);
  };
  const openFull = () => open('po-form', { kind: source.kind, supplier_id: source.supplier_id || undefined, sales_order_id: order.id,
    lines: picked.map((l) => ({ product_id: l.product_id, qty: l.remaining_qty, sales_order_line_id: l.id })) });
  return (
    <div className="src-pick card">
      <SourceFields value={source} onChange={setSource} />
      {lines.length > 1 && (
        <div className="src-lines">
          {lines.map((l) => <Check key={l.id} checked={!off[l.id]} onChange={(c) => setOff((s) => ({ ...s, [l.id]: !c }))}>{l.sku} · {l.product_name} × <b>{fq(l.remaining_qty)}</b> {l.unit}</Check>)}
        </div>
      )}
      <div className="row gap">
        <Btn kind="primary" icon="kiln" busy={busy} disabled={!sourceReady(source) || !picked.length || !products.data} onClick={create}>
          {source.kind === 'dat_sx' ? 'Đặt xưởng' : 'Đặt mua'} {picked.length < lines.length ? `${picked.length}/${lines.length} mặt hàng` : 'tất cả hàng chưa đặt'}</Btn>
        <button type="button" className="link-btn small" onClick={openFull}>Mở phiếu đầy đủ (giá, ghi chú, tiền cọc…)</button>
      </div>
      {!source.supplier_id && <div className="muted small">Chọn {source.kind === 'dat_sx' ? 'xưởng' : 'nhà cung cấp'} để đặt. Giá nhập tạm lấy theo giá nhập gần nhất, sửa sau trong đơn nhập.</div>}
    </div>
  );
}
