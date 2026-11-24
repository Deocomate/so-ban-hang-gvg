// Chi tiết một hóa đơn HD lập từ đơn đặt hàng (một đợt giao): đúng dòng hàng, số tiền, đã thu / còn nợ của riêng hóa đơn đó (như KiotViet),
// không phải cả đơn. Mở từ danh sách Hóa đơn và lịch sử bán / trả hàng của khách; nút "Mở đơn" sang chi tiết đơn đặt hàng.
import React from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, todayVN } from '../lib/format.js';
import { Btn, Pill, ErrorBox, Loading, Table, Modal, DateInput, ConfirmBtn } from '../components/ui.jsx';
import { OrderDetail } from './Sales.jsx';

export function OrderInvoiceDetail({ id, onClose }) {
  const { open, can } = useApp();
  const iq = useQ('order_invoices', [['id', 'eq', id]]);
  const lq = useQ('delivery_lines', [['delivery_id', 'eq', id]], 'id', 500);
  const { run, busy } = useAction();
  const inv = iq.data?.[0];
  if (!inv) return <Modal title="Hóa đơn" onClose={onClose} size="lg">{iq.error ? <ErrorBox error={iq.error} /> : <Loading />}</Modal>;
  const lines = lq.data || [];
  const live = inv.order_status !== 'huy';
  const canSell = can('ban_hang') && live;
  const goods = lines.reduce((s, l) => s + (l.revenue || 0), 0);
  const back = lines.reduce((s, l) => s + (l.qty ? (l.returned_qty * l.revenue) / l.qty : 0), 0);
  const vat = Math.max(0, inv.total - goods - inv.shipping_fee + Math.round(back) + Math.round((back * (inv.vat_rate || 0)) / 100));
  const openOrder = () => { onClose(); open('order', { id: inv.order_id }); };
  return (
    <Modal title={inv.customer_name} onClose={onClose} size="xl"
      subtitle={<span className="row gap-s">{inv.code} · Hóa đơn của đơn đặt hàng {inv.order_code}
        <Pill tone={inv.debt > 0 ? (inv.paid > 0 ? 'warn' : 'bad') : 'good'}>{inv.debt > 0 ? (inv.paid > 0 ? 'Thanh toán một phần' : 'Chưa thanh toán') : 'Đã thanh toán đủ'}</Pill>
        {!live && <Pill tone="bad">Đơn đã hủy</Pill>}</span>}
      footer={<>
        <Btn icon="order" onClick={openOrder}>Mở đơn {inv.order_code}</Btn>
        {canSell && <ConfirmBtn icon="trash" busy={busy} onConfirm={async () => { if (await run('cancel_delivery', { id }, `Đã hủy hóa đơn ${inv.code} — hàng đã nhập lại kho`)) onClose(); }}>Hủy hóa đơn</ConfirmBtn>}
        <span className="grow" />
        {can('thu_chi') && live && inv.debt > 0 && <Btn kind="soft" icon="in" onClick={() => open('payment', { kind: 'thu_khach', party_id: inv.customer_id,
          alloc: { doc_type: 'hoa_don', doc_id: id, code: inv.code, amount: inv.debt } })}>Thu tiền</Btn>}
        <Btn kind="primary" icon="print" onClick={() => open('doc', { kind: 'delivery', id, type: 'hoa_don' })}>In / xuất chứng từ</Btn>
      </>}>
      <div className="od-info">
        <label><span>Ngày hóa đơn</span>{canSell
          ? <DateInput value={inv.delivery_date} max={todayVN()} aria-label="Ngày hóa đơn"
            onChange={(v) => v && v !== inv.delivery_date && run('set_delivery_date', { id, date: v }, `Đã đổi ngày hóa đơn ${inv.code} sang ${dmy(v)}`)} />
          : <b>{dmy(inv.delivery_date)}</b>}</label>
        <label><span>Đơn đặt hàng</span><a href="#" onClick={(e) => { e.preventDefault(); openOrder(); }}>{inv.order_code}</a></label>
        <label><span>Khách hàng</span><a href="#" onClick={(e) => { e.preventDefault(); open('party-detail', { type: 'kh', id: inv.customer_id }); }}>{inv.customer_name}{inv.customer_code ? ` (${inv.customer_code})` : ''}</a></label>
        {inv.staff && <label><span>Người bán</span><b>{inv.staff}</b></label>}
        {inv.note && <label><span>Ghi chú</span><b>{inv.note}</b></label>}
      </div>
      <ErrorBox error={lq.error} />
      <Table dense rows={lq.data} empty="Hóa đơn không có dòng hàng" columns={[
        { key: 'sku', label: 'Mã hàng', render: (l) => <a href="#" onClick={(e) => { e.preventDefault(); open('product-detail', { id: l.product_id }); }}>{l.sku}</a> },
        { key: 'n', label: 'Tên hàng', render: (l) => <>{l.product_name}{l.unit ? ` (${l.unit})` : ''}</> },
        { key: 'q', label: 'Số lượng', align: 'right', render: (l) => <>{fq(l.qty)}{l.returned_qty > 0 && <div className="cell-sub">trả {fq(l.returned_qty)}</div>}</> },
        { key: 'p', label: 'Giá bán', align: 'right', render: (l) => money(l.unit_price_net) },
        { key: 't', label: 'Thành tiền', align: 'right', render: (l) => <b>{money(l.revenue)}</b> },
      ]} />
      <div className="od-foot">
        <div />
        <div className="totals od-totals">
          <span>Tổng tiền hàng ({lines.length})</span><span className="r">{money(goods)}</span>
          {inv.shipping_fee > 0 && <><span>Phí vận chuyển</span><span className="r">{money(inv.shipping_fee)}</span></>}
          {inv.vat_rate > 0 && <><span>VAT {fq(inv.vat_rate)}%</span><span className="r">{money(vat)}</span></>}
          {back > 0 && <><span>Khách trả lại hàng</span><span className="r">{money(Math.round(back))}</span></>}
          <span>Khách cần trả</span><span className="r strong">{money(inv.total)}</span>
          <span>Khách đã trả{inv.deposit_used > 0 ? ` (trừ cọc ${money(inv.deposit_used)})` : ''}</span><span className="r strong">{money(inv.paid)}</span>
          {inv.debt > 0 && <><span className="strong bad">Khách còn nợ</span><span className="r strong bad">{money(inv.debt)}</span></>}
          {inv.overdue_days > 0 && <><span className="bad">Quá hạn thanh toán</span><span className="r bad">{inv.overdue_days} ngày</span></>}
        </div>
      </div>
    </Modal>
  );
}

// Mở đúng chi tiết: hóa đơn HD của đơn đặt hàng (deliveryId) thì chi tiết hóa đơn đó; còn lại chi tiết đơn
export function SaleDetail({ orderId, deliveryId, onClose }) {
  return deliveryId ? <OrderInvoiceDetail id={deliveryId} onClose={onClose} /> : <OrderDetail id={orderId} onClose={onClose} />;
}
