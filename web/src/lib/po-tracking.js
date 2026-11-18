// Theo dõi tiến độ giao của đơn đặt NCC / xưởng: giao được bao nhiêu, còn bao nhiêu ngày tới hạn, có chậm so với kế hoạch không.
// Dùng chung cho danh sách đơn nhập trong hộp nhà cung cấp và tệp PDF theo dõi.
import { todayVN } from './format.js';

export const SOON_DAYS = 7; // còn ≤ 7 ngày tới hạn giao thì coi là "sắp đến hạn"

const dayDiff = (a, b) => Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000);

// Thứ tự gấp: quá hạn → sắp hạn → còn hạn → chưa hẹn ngày → đã giao đủ → phiếu tạm → đã hủy
export const TRACK_RANK = { late: 0, soon: 1, ok: 2, nodate: 3, done: 4, nhap: 5, huy: 6 };

export function trackOf(o, today = todayVN()) {
  const eff = Number(o.eff_qty) || 0;
  const got = Math.min(Number(o.received_qty) || 0, eff);
  const left = Math.max(Number(o.remaining_qty) || 0, 0);
  const pct = eff > 0 ? got / eff : 0;
  const open = o.status === 'xac_nhan' && left > 0;
  const base = { eff, got, left, pct, open };
  if (o.status === 'huy') return { ...base, key: 'huy', label: 'Đã hủy' };
  if (o.status === 'nhap') return { ...base, key: 'nhap', label: 'Phiếu tạm' };
  if (!open) return { ...base, key: 'done', label: 'Đã giao đủ' };
  if (!o.expected_date) return { ...base, key: 'nodate', label: 'Chưa hẹn ngày giao' };
  const days = dayDiff(o.expected_date, today);
  // Tiến độ thời gian: đã trôi qua bao nhiêu phần khoảng "ngày đặt → hạn giao"; giao chậm hơn nhịp đó > 20% thì báo chậm
  const span = dayDiff(o.expected_date, o.order_date);
  const timePct = span > 0 ? Math.min(Math.max(dayDiff(today, o.order_date) / span, 0), 1) : 1;
  const behind = days >= 0 && timePct - pct > 0.2;
  const perDay = days > 0 ? Math.ceil(left / days) : null;
  if (days < 0) return { ...base, key: 'late', days, timePct, behind: true, perDay, label: `Quá hạn ${-days} ngày` };
  const key = days <= SOON_DAYS ? 'soon' : 'ok';
  return { ...base, key, days, timePct, behind, perDay, label: days === 0 ? 'Đến hạn hôm nay' : `Còn ${days} ngày` };
}

// Phần trăm làm tròn xuống: 99,6% chưa phải 100%
export const pctText = (p) => `${Math.floor((p || 0) * 100)}%`;
