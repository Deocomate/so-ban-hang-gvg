// Ô chọn lái xe (danh sách lái xe đang hợp tác) kèm nút "+" thêm nhanh lái xe mới rồi chọn luôn.
import React from 'react';
import { useApp, useQ } from '../lib/store.jsx';
import { Btn, Select } from './ui.jsx';

export const driverLabel = (d) => [d.name, d.phone, d.plate].filter(Boolean).join(' · ');

export function DriverSelect({ value, onChange, placeholder = 'Chọn lái xe', style }) {
  const { open, can } = useApp();
  const drivers = useQ('drivers', [['active', 'eq', 'true']], 'name');
  return (
    <div className="row gap-s" style={style}>
      <div className="grow"><Select value={value || ''} onChange={onChange} placeholder={placeholder} aria-label="Lái xe"
        options={(drivers.data || []).map((d) => ({ value: d.id, label: driverLabel(d) }))} /></div>
      {can('ban_hang') && <Btn small icon="plus" title="Thêm lái xe mới" aria-label="Thêm lái xe mới" onClick={() => open('driver', { onSaved: (r) => onChange(r.id) })} />}
    </div>
  );
}
