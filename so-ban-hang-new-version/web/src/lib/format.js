// Số hiển thị dạng 1,000,000 (dấu phẩy ngăn hàng nghìn, dấu chấm thập phân) — giống mẫu hóa đơn của cửa hàng
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const money = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? '—' : nf.format(Math.round(Number(v))));
export const moneyD = (v) => (v === null || v === undefined || v === '' ? '—' : nf.format(Math.round(Number(v))) + ' đ');
export const qty = (v) => (v === null || v === undefined || v === '' ? '—' : nf2.format(Number(v)));
export const pct = (v) => (v === null || v === undefined ? '—' : nf2.format(Number(v) * 100) + '%');
export const short = (v) => {
  if (v === null || v === undefined) return '—';
  const n = Number(v), a = Math.abs(n);
  if (a >= 1e9) return nf2.format(n / 1e9) + ' tỷ';
  if (a >= 1e6) return nf2.format(Math.round(n / 1e5) / 10) + ' tr';
  if (a >= 1e3) return nf.format(Math.round(n / 1e3)) + 'k';
  return nf.format(n);
};

export function dmy(d) {
  if (!d) return '';
  const s = String(d).slice(0, 10);
  const [y, m, dd] = s.split('-');
  return dd && m && y ? `${dd}/${m}/${y}` : s;
}
export function dmyhm(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Ngày theo giờ Việt Nam, dạng yyyy-mm-dd
export function todayVN() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function monthStart(iso) { return iso.slice(0, 8) + '01'; }
export function monthEnd(iso) {
  const d = new Date(iso.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10);
}
export function addMonths(iso, n) {
  const d = new Date(iso.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10);
}
export const monthLabel = (iso) => `T${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;

// Đọc số người dùng gõ: "1.500.000", "1,5tr", "200k"
export function parseNum(s) {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') return s;
  let t = String(s).trim().toLowerCase().replace(/\s|đ|vnd/g, '');
  if (t === '') return null;
  let mul = 1;
  if (/(tr|triệu)$/.test(t)) { mul = 1e6; t = t.replace(/(tr|triệu)$/, ''); }
  else if (/(k|nghìn|ngàn)$/.test(t)) { mul = 1e3; t = t.replace(/(k|nghìn|ngàn)$/, ''); }
  else if (/tỷ$/.test(t)) { mul = 1e9; t = t.replace(/tỷ$/, ''); }
  if (mul > 1) t = t.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n * mul : NaN;
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
}));

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export const match = (text, q) => !q || norm(text).includes(norm(q));
