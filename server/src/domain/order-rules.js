// Quy tắc giao dịch theo Thiết lập → Đơn hàng: không cho đổi thời gian giao dịch, giới hạn thời gian trả hàng,
// chặn sửa / hủy đơn đã phát hành hóa đơn điện tử.
import { fail, one, all, today, dmy, daysBetween } from '../lib/context.js';
import { bookSettings } from './access.js';

export const TXN_KINDS = { ban_hang: 'Đơn bán, giao hàng', tra_hang: 'Khách trả hàng', nhap_hang: 'Nhập hàng', tra_ncc: 'Trả hàng nhập', thu_chi: 'Phiếu thu, chi', kho: 'Điều chỉnh kho, xuất hủy, sản xuất' };

// Loại giao dịch đã khóa thời gian: ngày chứng từ phải là hôm nay; sửa chứng từ thì không đổi được ngày
export function checkTxnDate(b, kind, date, oldDate = null) {
  const s = bookSettings(b);
  if (!s.lock_txn_time || !(s.lock_txn_kinds || []).includes(kind)) return;
  if (oldDate != null) { if (date !== oldDate) fail(`Sổ không cho đổi thời gian giao dịch ${TXN_KINDS[kind].toLowerCase()} (Thiết lập → Đơn hàng)`); return; }
  if (date !== today()) fail(`Sổ không cho ghi ${TXN_KINDS[kind].toLowerCase()} khác ngày hôm nay (Thiết lập → Đơn hàng)`);
}

// Khách chỉ được trả hàng trong số ngày cho phép kể từ ngày giao
export function checkReturnLimit(b, returnId, date) {
  const s = bookSettings(b);
  const days = Number(s.return_limit_days) || 0;
  if (!s.return_limit || days <= 0) return;
  for (const r of all(`select d.delivery_date, d.code from sales_return_lines l join delivery_lines x on x.id = l.delivery_line_id
      join deliveries d on d.id = x.delivery_id where l.return_id = ?`, returnId)) {
    if (daysBetween(date, r.delivery_date) > days) fail(`Phiếu giao ${r.code} ngày ${dmy(r.delivery_date)} đã quá ${days} ngày được trả hàng`);
  }
}

// Đơn đã phát hành hóa đơn điện tử: không sửa, không hủy (muốn sửa phải hủy hóa đơn điện tử trước)
export function checkEinvoiceLock(o) {
  if (!bookSettings(o.book_id).einvoice_lock) return;
  const inv = one(`select inv_no from tax_invoices where order_id = ? and direction = 'ra' and voided = 0 limit 1`, o.id);
  if (inv) fail(`Đơn ${o.code} đã phát hành hóa đơn điện tử số ${inv.inv_no} — không sửa / hủy được. Hãy hủy hóa đơn điện tử trước.`);
}
