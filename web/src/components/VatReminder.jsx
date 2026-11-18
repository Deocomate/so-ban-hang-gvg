// Nhắc xuất hóa đơn VAT cho khách là công ty: hóa đơn VAT lập ở phần mềm hóa đơn điện tử khác nên hay bị quên.
// Hiện ở hộp chứng từ (sau khi in biên bản giao hàng), chi tiết đơn và Tổng quan → Cần xử lý.
import React from 'react';
import { useApp, useRpcData, useAction } from '../lib/store.jsx';
import { money } from '../lib/format.js';
import { Btn, Modal, Note } from './ui.jsx';

// Mở hộp ghi nhận hóa đơn đầu ra đã xuất, điền sẵn theo đơn
export function recordVatInvoice(open, r, rate) {
  open('tax-invoice', { direction: 'ra', preset: { order_id: r.id, order_code: r.code, party_name: r.tax_name || r.customer_name, party_tax: r.tax_code || '', amount: r.missing, vat_rate: rate ?? r.vat_rate } });
}

export const vatText = (r) => (r.state === 'thieu'
  ? `Đơn ${r.code} mới ghi nhận hóa đơn VAT ${money(r.invoiced)} đ, còn thiếu ${money(r.missing)} đ (trước thuế) so với hàng đã giao.`
  : `Đơn ${r.code} đã giao ${money(r.need)} đ (trước thuế) cho ${r.tax_name || r.customer_name} nhưng chưa ghi nhận hóa đơn VAT.`);

// Các nút xử lý: xem phiếu yêu cầu, ghi nhận đã xuất, khách không lấy hóa đơn
function Actions({ r, onShowRequest }) {
  const { open, can } = useApp();
  const { run, busy } = useAction();
  return (
    <div className="row gap-s" style={{ flexWrap: 'wrap', marginTop: 6 }}>
      {onShowRequest && <Btn small kind="soft" icon="invoice" onClick={onShowRequest}>Xem phiếu yêu cầu xuất hóa đơn</Btn>}
      {can('ban_hang') && <Btn small icon="check" onClick={() => recordVatInvoice(open, r)}>Ghi nhận đã xuất hóa đơn</Btn>}
      {can('ban_hang') && <Btn small busy={busy} onClick={() => run('save_doc_info', { ref_type: 'order', ref_id: r.id, data: { vat_skip: '1' } }, `Đã tắt nhắc hóa đơn VAT cho đơn ${r.code}`)}>Khách không lấy hóa đơn</Btn>}
    </div>
  );
}

// Thẻ nhắc trong một đơn (trống nếu đơn không cần xuất / đã xuất đủ)
export function VatReminder({ orderId, onShowRequest }) {
  const { can } = useApp();
  const res = useRpcData('vat_invoice_todo', { order_id: orderId }, !!orderId && can('xem_ban_hang'));
  const r = res.data?.[0];
  if (!r) return null;
  return (
    <Note tone="warn">
      <b>Nhớ xuất hóa đơn VAT — khách là công ty.</b> {vatText(r)} Hóa đơn VAT lập trên phần mềm hóa đơn điện tử; xuất xong hãy ghi nhận số hóa đơn vào sổ để hết nhắc.
      <Actions r={r} onShowRequest={onShowRequest} />
    </Note>
  );
}

// Hộp nhắc bật lên ngay sau khi in / tải biên bản giao hàng
export function VatReminderPopup({ orderId, onShowRequest, onClose }) {
  const res = useRpcData('vat_invoice_todo', { order_id: orderId }, !!orderId);
  const r = res.data?.[0];
  if (!r) return null;
  return (
    <Modal title="Bước tiếp theo: xuất hóa đơn VAT" onClose={onClose} footer={<Btn onClick={onClose}>Để sau</Btn>}>
      <p>Biên bản giao hàng đã xong. <b>{r.tax_name || r.customer_name}</b>{r.tax_code ? ` (MST ${r.tax_code})` : ''} là khách công ty, cần xuất hóa đơn VAT cho lần giao này.</p>
      <p className="small muted">{vatText(r)} In phiếu yêu cầu xuất hóa đơn gửi kế toán (đủ thông tin như một hóa đơn VAT), xuất trên phần mềm hóa đơn điện tử rồi ghi nhận lại số hóa đơn.</p>
      <Actions r={r} onShowRequest={onShowRequest && (() => { onClose(); onShowRequest(); })} />
    </Modal>
  );
}
