import React from 'react';
import { todayVN, addDays, monthStart, monthEnd, addMonths } from '../lib/format.js';
import { DateInput } from './ui.jsx';

export function presetRange(key) {
  const t = todayVN();
  switch (key) {
    case 'today': return [t, t];
    case '7d': return [addDays(t, -6), t];
    case '30d': return [addDays(t, -29), t];
    case 'month': return [monthStart(t), t];
    case 'lastmonth': { const s = addMonths(t, -1); return [s, monthEnd(s)]; }
    case 'year': return [t.slice(0, 4) + '-01-01', t];
    default: return [addDays(t, -29), t];
  }
}
const PRESETS = [['today', 'Hôm nay'], ['7d', '7 ngày'], ['30d', '30 ngày'], ['month', 'Tháng này'], ['lastmonth', 'Tháng trước'], ['year', 'Năm nay']];

export function usePeriod(initial = '30d') {
  const [state, setState] = React.useState(() => {
    let k = initial; try { k = localStorage.getItem('gomsu.period') || initial; } catch (e) { /* bỏ qua */ }
    const [from, to] = k === 'custom' ? presetRange(initial) : presetRange(k);
    return { key: k === 'custom' ? initial : k, from, to };
  });
  const set = (key, from, to) => {
    if (key !== 'custom') [from, to] = presetRange(key);
    try { localStorage.setItem('gomsu.period', key); } catch (e) { /* bỏ qua */ }
    setState({ key, from, to });
  };
  return [state, set];
}

export function PeriodPicker({ value, onChange }) {
  return (
    <div className="period">
      {PRESETS.map(([k, l]) => <button key={k} className={`chip${value.key === k ? ' on' : ''}`} onClick={() => onChange(k)}>{l}</button>)}
      <DateInput value={value.from} onChange={(v) => v && onChange('custom', v, value.to < v ? v : value.to)} aria-label="Từ ngày" />
      <span className="muted">–</span>
      <DateInput value={value.to} onChange={(v) => v && onChange('custom', value.from > v ? v : value.from, v)} aria-label="Đến ngày" />
    </div>
  );
}
