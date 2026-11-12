// Bộ lọc dùng chung cho các trang danh sách chứng từ, theo cách của KiotViet:
// "Thời gian" (mặc định Tháng này, chọn nhanh hoặc tùy chỉnh từ ngày – đến ngày) và "Trạng thái" chọn nhiều (mặc định bỏ Đã hủy).
import React, { useMemo, useState } from 'react';
import { todayVN, addDays, monthStart, monthEnd, addMonths } from '../lib/format.js';
import { FilterBox } from './ui.jsx';
import { Select, DateInput } from './Pickers.jsx';

export const TIME_PRESETS = [
  { value: 'today', label: 'Hôm nay' }, { value: 'yesterday', label: 'Hôm qua' },
  { value: 'week', label: 'Tuần này' }, { value: 'last_week', label: 'Tuần trước' }, { value: '7d', label: '7 ngày qua' },
  { value: 'month', label: 'Tháng này' }, { value: 'last_month', label: 'Tháng trước' }, { value: '30d', label: '30 ngày qua' },
  { value: 'quarter', label: 'Quý này' }, { value: 'last_quarter', label: 'Quý trước' },
  { value: 'year', label: 'Năm nay' }, { value: 'last_year', label: 'Năm trước' }, { value: 'all', label: 'Toàn thời gian' },
];

// Khoảng ngày [từ, đến] (yyyy-mm-dd, giờ Việt Nam) của một lựa chọn nhanh; "Toàn thời gian" là [null, null]. Tuần bắt đầu thứ Hai.
export function presetRange(preset, today = todayVN()) {
  const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const weekStart = addDays(today, -dow);
  const q0 = `${today.slice(0, 5)}${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  const y = today.slice(0, 4);
  switch (preset) {
    case 'today': return [today, today];
    case 'yesterday': { const d = addDays(today, -1); return [d, d]; }
    case 'week': return [weekStart, addDays(weekStart, 6)];
    case 'last_week': return [addDays(weekStart, -7), addDays(weekStart, -1)];
    case '7d': return [addDays(today, -6), today];
    case 'month': return [monthStart(today), monthEnd(today)];
    case 'last_month': { const m = addMonths(today, -1); return [m, monthEnd(m)]; }
    case '30d': return [addDays(today, -29), today];
    case 'quarter': return [q0, monthEnd(addMonths(q0, 2))];
    case 'last_quarter': { const p = addMonths(q0, -3); return [p, monthEnd(addMonths(p, 2))]; }
    case 'year': return [`${y}-01-01`, `${y}-12-31`];
    case 'last_year': return [`${Number(y) - 1}-01-01`, `${Number(y) - 1}-12-31`];
    default: return [null, null];
  }
}

// Trạng thái bộ lọc thời gian của một trang: { mode: 'preset' | 'custom', preset, from, to } và hàm kiểm tra một ngày có nằm trong khoảng
export function useTimeFilter(def = 'month') {
  const [time, setTime] = useState({ mode: 'preset', preset: def, from: '', to: '' });
  const [from, to] = useMemo(() => (time.mode === 'custom' ? [time.from || null, time.to || null] : presetRange(time.preset)), [time]);
  const inRange = (d) => {
    if (!from && !to) return true;
    const x = String(d || '').slice(0, 10);
    if (!x) return false;
    return (!from || x >= from) && (!to || x <= to);
  };
  return { time, setTime, inRange, from, to };
}

// Điều kiện ngày gửi lên máy chủ (useQ) cho cột `col`; "Toàn thời gian" thì không giới hạn
export const dateFilters = (col, { from, to }) => [...(from ? [[col, 'gte', from]] : []), ...(to ? [[col, 'lte', to]] : [])];

export function TimeFilter({ filter, title = 'Thời gian' }) {
  const { time, setTime } = filter;
  const custom = time.mode === 'custom';
  return (
    <FilterBox title={title}>
      <div className="tf">
        <label className={`tf-row${custom ? '' : ' on'}`}>
          <input type="radio" checked={!custom} onChange={() => setTime({ ...time, mode: 'preset' })} />
          <Select value={time.preset} options={TIME_PRESETS} aria-label="Chọn nhanh thời gian"
            onChange={(v) => setTime({ ...time, mode: 'preset', preset: v || 'month' })} />
        </label>
        <label className={`tf-row${custom ? ' on' : ''}`}>
          <input type="radio" checked={custom} onChange={() => setTime({ ...time, mode: 'custom' })} />
          <span>Tùy chỉnh</span>
        </label>
        {custom && (
          <div className="tf-range">
            <DateInput value={time.from} onChange={(v) => setTime({ ...time, from: v || '' })} placeholder="Từ ngày" aria-label="Từ ngày" />
            <DateInput value={time.to} onChange={(v) => setTime({ ...time, to: v || '' })} placeholder="Đến ngày" aria-label="Đến ngày" />
          </div>
        )}
      </div>
    </FilterBox>
  );
}

// Chọn nhiều trạng thái (ô tích), kèm số lượng từng trạng thái
export function CheckList({ value, onChange, options }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="clist">
      {options.map((o) => (
        <label key={o.value} className={`cl-item${value.includes(o.value) ? ' on' : ''}`}>
          <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
          <span className="rl-label">{o.label}</span>
          {o.count !== undefined && o.count !== null && <span className="rl-count">{o.count}</span>}
        </label>
      ))}
    </div>
  );
}

// Bộ lọc trạng thái: options [{value, label, test(row)}]; mặc định chọn mọi trạng thái trừ những giá trị trong `off` (thường là Đã hủy)
export function useStatusFilter(options, off = ['huy']) {
  const [sel, setSel] = useState(() => options.map((o) => o.value).filter((v) => !off.includes(v)));
  const statusOf = (row) => options.find((o) => o.test(row))?.value;
  const pass = (row) => sel.includes(statusOf(row));
  return { sel, setSel, pass, statusOf, options };
}

export function StatusFilter({ filter, rows, title = 'Trạng thái' }) {
  const { sel, setSel, statusOf, options } = filter;
  const count = (v) => (rows ? rows.filter((r) => statusOf(r) === v).length : undefined);
  return (
    <FilterBox title={title}>
      <CheckList value={sel} onChange={setSel} options={options.map((o) => ({ value: o.value, label: o.label, count: count(o.value) }))} />
    </FilterBox>
  );
}
