// Chi phí nhập hàng (Thiết lập → Mua hàng): các khoản phí cộng vào giá vốn khi nhận hàng.
// payer 'ncc': nhà cung cấp thu hộ (cộng vào công nợ NCC); 'khac': trả bên khác (ghi phiếu chi riêng).
import React from 'react';
import { useApp } from '../lib/store.jsx';
import { money } from '../lib/format.js';
import { Btn, Input, NumInput, Select } from './ui.jsx';

export function ExtraCosts({ value, onChange }) {
  const { settings } = useApp();
  if (!settings.po_costs) return null;
  const list = value || [];
  const names = settings.po_cost_names || [];
  const set = (i, k, v) => onChange(list.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return (
    <div className="stack-s extra-costs">
      <div className="row gap-s"><b className="grow small">Chi phí nhập hàng{total ? ` · ${money(total)} đ` : ''}</b>
        <Btn small icon="plus" onClick={() => onChange([...list, { name: names[0] || '', amount: null, payer: 'ncc' }])}>Thêm chi phí</Btn></div>
      {list.map((x, i) => (
        <div key={i} className="row gap-s">
          <div className="grow"><Input value={x.name} onChange={(v) => set(i, 'name', v)} list="po-cost-names" placeholder="Tên chi phí" aria-label="Tên chi phí" /></div>
          <div style={{ width: 130 }}><NumInput min={0} value={x.amount} onChange={(v) => set(i, 'amount', v)} aria-label="Số tiền" /></div>
          <div style={{ width: 150 }}><Select value={x.payer} onChange={(v) => set(i, 'payer', v)} options={[{ value: 'ncc', label: 'NCC thu hộ' }, { value: 'khac', label: 'Trả bên khác' }]} aria-label="Ai thu" /></div>
          <button type="button" className="icon-btn" aria-label="Bỏ chi phí" onClick={() => onChange(list.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <datalist id="po-cost-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      {list.length > 0 && <div className="muted small">Chia vào giá vốn từng dòng theo giá trị hàng. Phần “Trả bên khác” hãy ghi phiếu chi ở Sổ quỹ.</div>}
    </div>
  );
}
