import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { money, qty as fq, dmy, dmyhm } from '../lib/format.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, Loading, ErrorBox, Note, Table, Modal } from '../components/ui.jsx';
import { OrderDetail, DeliverDialog, ReturnDialog } from './Sales.jsx';
import { PoForm, PoDetail, ReceiveDialog, SupplierReturnDialog } from './Purchases.jsx';
import { PaymentForm, PaymentDetail, ExpenseForm } from './Cash.jsx';
import { ProductForm } from './Products.jsx';
import { StockCard, AdjustForm } from './Inventory.jsx';
import { PartyForm, PartyDetail } from './Parties.jsx';
import { ImportDialog } from '../components/Import.jsx';
import { ShipmentForm, ShipmentDetail, CodSettleDialog, ShipImportDialog } from './Shipping.jsx';
import { BankTxnDialog, BankSimDialog } from './BankTxns.jsx';
import { QrBox } from './SettingsExtra.jsx';
import { DocDialog } from './Documents.jsx';
import { OrderPos } from './OrderPos.jsx';
import { DriverForm, TripForm, PayDriverDialog } from './Catalog.jsx';
import { QuoteForm, QuoteDetail } from './Quotes.jsx';
import { ContractForm, ContractDetail } from './Contracts.jsx';
import { TaxInvoiceForm } from './Tax.jsx';
import { orderTransferContent } from '../lib/vietqr.js';

const MAP = {
  'order-form': OrderPos, order: OrderDetail, deliver: DeliverDialog, return: ReturnDialog,
  'po-form': PoForm, po: PoDetail, receive: ReceiveDialog, 'po-return': SupplierReturnDialog,
  payment: PaymentForm, 'pay-detail': PaymentDetail, expense: ExpenseForm,
  product: ProductForm, stockcard: StockCard, adjust: AdjustForm,
  party: PartyForm, 'party-detail': PartyDetail, import: ImportDialog,
  drill: DrillDialog, print: PrintSlip, doc: DocDialog,
  ship: ShipmentDetail, 'ship-form': ShipmentForm, 'cod-settle': CodSettleDialog, 'ship-import': ShipImportDialog,
  'bank-txn': BankTxnDialog, 'bank-sim': BankSimDialog,
  driver: DriverForm, trip: TripForm, 'pay-driver': PayDriverDialog, 'quote-form': QuoteForm, quote: QuoteDetail,
  'contract-form': ContractForm, contract: ContractDetail, 'tax-invoice': TaxInvoiceForm,
};

export function ModalHost() {
  const { modals, closeKey } = useApp();
  return modals.map((m) => {
    const C = MAP[m.type];
    if (!C) return null;
    return <C key={m.key} {...m.props} onClose={() => closeKey(m.key)} />;
  });
}

// ---------- Xem chi tiết một con số trên Tổng quan ----------
function DrillDialog({ metric, label, how, from, to, onClose }) {
  const { rpc, open, toast } = useApp();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let r;
        if (metric === 'profit') {
          // Lợi nhuận sau chi phí = lãi gộp từng phiếu giao − từng khoản chi phí / hao hụt
          const [g, o] = await Promise.all([rpc('rpt_drill', { metric: 'gross_profit', from, to }), rpc('rpt_drill', { metric: 'opex', from, to })]);
          r = [...g, ...o.map((x) => ({ ...x, amount: -x.amount }))].sort((a, b) => String(a.date).localeCompare(String(b.date)));
        } else r = await rpc('rpt_drill', { metric, from, to });
        if (alive) setRows(r);
      } catch (e) { if (alive) setErr(e.message); }
    })();
    return () => { alive = false; };
  }, [metric, from, to]);
  const total = (rows || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  const isQty = metric === 'low_stock';
  const go = (x) => {
    const t = x.doc_type;
    if (t === 'giao' || t === 'tra_hang' || t === 'don_ban') open('order', { id: x.doc_id });
    else if (t === 'don_mua') open('po', { id: x.doc_id });
    else if (t === 'chi_phi') open('expense', { id: x.doc_id });
    else if (t === 'thu_chi') open('pay-detail', { id: x.doc_id });
    else if (t === 'khach_hang') open('party-detail', { type: 'kh', id: x.doc_id });
    else if (t === 'ncc') open('party-detail', { type: 'ncc', id: x.doc_id });
    else if (t === 'san_pham') open('stockcard', { product_id: x.doc_id });
    else toast('Dòng này không có chứng từ để mở', 'err');
  };
  return (
    <Modal title={label} subtitle={`${dmy(from)} – ${dmy(to)}`} onClose={onClose} size="xl"
      footer={<><span className="muted small grow">{rows ? `${rows.length} dòng · bấm vào dòng để mở chứng từ gốc` : ''}</span>
        <Btn icon="dl" disabled={!rows} onClick={() => exportXlsx(`chi-tiet_${metric}_${from}_${to}.xlsx`, [{ name: label, rows: rows || [], columns: [
          { key: 'date', label: 'Ngày', type: 'date' }, { key: 'code', label: 'Mã' }, { key: 'label', label: 'Diễn giải' }, { key: 'party', label: 'Đối tượng' }, { key: 'ref', label: 'Tham chiếu' },
          { key: 'amount', label: isQty ? 'Còn có thể bán' : 'Số tiền' }] }])}>Xuất Excel</Btn></>}>
      {how && <div className="formula"><b>Cách tính:</b> {how}</div>}
      <ErrorBox error={err} />
      <Table dense rows={err ? [] : rows} rowKey="__i" onRow={go} empty="Không có dòng nào trong kỳ"
        foot={isQty ? null : { a: <b>{money(total)}</b>, l: 'Cộng' }} columns={[
          { key: 'd', label: 'Ngày', render: (x) => (x.date ? dmy(x.date) : '') },
          { key: 'c', label: 'Mã', render: (x) => <b>{x.code}</b> },
          { key: 'l', label: 'Diễn giải', render: (x) => x.label },
          { key: 'p', label: 'Đối tượng', render: (x) => <>{x.party}{x.ref ? <div className="cell-sub">{x.ref}</div> : null}</> },
          { key: 'a', label: isQty ? 'Có thể bán / tối thiểu' : 'Số tiền', align: 'right', render: (x) => (isQty ? `${fq(x.amount)} / ${fq(x.qty)}` : <span className={x.amount < 0 ? 'bad' : ''}>{money(x.amount)}</span>) },
        ]} />
    </Modal>
  );
}

// ---------- In phiếu ----------
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function read3(n, full) {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10; const w = [];
  if (full || h) w.push(DIGITS[h], 'trăm');
  if (t > 1) { w.push(DIGITS[t], 'mươi'); if (u === 1) w.push('mốt'); else if (u === 5) w.push('lăm'); else if (u) w.push(DIGITS[u]); }
  else if (t === 1) { w.push('mười'); if (u === 5) w.push('lăm'); else if (u) w.push(DIGITS[u]); }
  else if (u) { if (full || h) w.push('linh'); w.push(DIGITS[u]); }
  return w.join(' ');
}
export function moneyWords(v) {
  let n = Math.round(Math.abs(Number(v) || 0));
  if (!n) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']; const parts = []; let i = 0;
  const groups = []; while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  for (i = groups.length - 1; i >= 0; i--) { const g = groups[i]; if (!g) continue; parts.push(read3(g, i < groups.length - 1) + (units[i] ? ' ' + units[i] : '')); }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}

function PrintSlip({ kind, id, onClose }) {
  const { q, book, settings } = useApp();
  const [d, setD] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        if (kind === 'order') { const [o] = await q('sales_orders', [['id', 'eq', id]]); const lines = await q('sales_order_lines', [['order_id', 'eq', id]], 'line_no'); setD({ o, lines }); }
        else if (kind === 'delivery') { const [o] = await q('deliveries', [['id', 'eq', id]]); const lines = await q('delivery_lines', [['delivery_id', 'eq', id]]); const [so] = await q('sales_orders', [['id', 'eq', o.order_id]]); setD({ o, lines, so }); }
        else { const [o] = await q('payments', [['id', 'eq', id]]); setD({ o }); }
      } catch (e) { setErr(e.message); }
    })();
  }, [kind, id]);
  const title = kind === 'order' ? 'ĐƠN HÀNG' : kind === 'delivery' ? 'PHIẾU GIAO HÀNG' : d?.o?.direction === 'thu' ? 'PHIẾU THU' : 'PHIẾU CHI';
  const doPrint = () => { try { window.print(); } catch (e) { /* bỏ qua */ } };
  return (
    <Modal title={`In ${title.toLowerCase()}`} onClose={onClose} size="lg"
      footer={<><span className="grow" /><Btn onClick={onClose}>Đóng</Btn><Btn kind="primary" icon="print" onClick={doPrint}>In</Btn></>}>
      <ErrorBox error={err} />
      {!d ? !err && <Loading /> : (
        <div className="slip">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div><b style={{ fontSize: 15 }}>{book.name}</b>{settings.shop_address && <div>{settings.shop_address}</div>}{settings.shop_phone && <div>ĐT: {settings.shop_phone}</div>}</div>
            <div style={{ textAlign: 'right' }}>Số: <b>{d.o.code}</b><div>Ngày: {dmy(d.o.order_date || d.o.delivery_date || d.o.pay_date)}</div></div>
          </div>
          <h2>{title}</h2>
          {kind !== 'payment' ? <SlipGoods kind={kind} d={d} /> : <SlipPayment p={d.o} />}
          {kind !== 'payment' && settings.bank && (() => { const so = kind === 'order' ? d.o : d.so; const due = Math.max(0, (so?.net_total || 0) - (so?.paid_net || 0));
            return due > 0 && so?.status !== 'huy' ? <div className="slip-qr"><QrBox amount={due} content={orderTransferContent(book, so.code)} size={132} />
              <div className="small">Quét mã để chuyển khoản <b>{money(due)} đ</b> còn phải trả.<br />Vui lòng giữ nguyên nội dung <b>{orderTransferContent(book, so.code)}</b> để cửa hàng tự xác nhận.</div></div> : null; })()}
          {settings.slip_note && <div style={{ marginTop: 10, fontStyle: 'italic' }}>{settings.slip_note}</div>}
          <div className="sign">
            <div><b>{kind === 'payment' ? 'Người nộp / nhận tiền' : 'Khách hàng'}</b><div className="small">(ký, ghi rõ họ tên)</div></div>
            <div><b>{kind === 'delivery' ? 'Người giao hàng' : 'Người lập phiếu'}</b><div className="small">(ký, ghi rõ họ tên)</div></div>
            <div><b>Chủ cửa hàng</b><div className="small">(ký, ghi rõ họ tên)</div></div>
          </div>
          <div className="small" style={{ marginTop: 16, color: '#666' }}>In lúc {dmyhm(new Date().toISOString())}</div>
        </div>
      )}
    </Modal>
  );
}

function SlipGoods({ kind, d }) {
  const o = kind === 'order' ? d.o : d.so;
  const isOrder = kind === 'order';
  const lines = isOrder ? d.lines.filter((l) => l.eff_qty > 0) : d.lines;
  const goods = isOrder ? o.goods_total : lines.reduce((s, l) => s + Number(l.revenue || 0), 0);
  const ship = isOrder ? o.shipping_fee : d.o.shipping_fee;
  const total = isOrder ? o.order_total : goods + Number(ship || 0);
  return (
    <>
      <div>Khách hàng: <b>{o.customer_name}</b>{o.customer_phone ? ` · ĐT: ${o.customer_phone}` : ''}</div>
      {o.customer_address && <div>Địa chỉ: {o.customer_address}</div>}
      {!isOrder && <div>Theo đơn: {o.code} ngày {dmy(o.order_date)}</div>}
      {isOrder && o.due_date && <div>Ngày hẹn giao: {dmy(o.due_date)}</div>}
      <table>
        <thead><tr><th>#</th><th>Mã</th><th>Tên hàng</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th>{isOrder && <th>CK</th>}<th>Thành tiền</th></tr></thead>
        <tbody>{lines.map((l, i) => (
          <tr key={l.id}><td>{i + 1}</td><td>{l.sku}</td><td>{l.product_name}</td><td>{l.unit}</td><td style={{ textAlign: 'right' }}>{fq(isOrder ? l.eff_qty : l.qty)}</td>
            <td style={{ textAlign: 'right' }}>{money(isOrder ? l.unit_price : l.unit_price_net)}</td>{isOrder && <td style={{ textAlign: 'right' }}>{l.discount_pct ? `${fq(l.discount_pct)}%` : ''}</td>}
            <td style={{ textAlign: 'right' }}>{money(isOrder ? l.line_total : l.revenue)}</td></tr>))}</tbody>
      </table>
      <table style={{ marginTop: 6 }}><tbody>
        {isOrder && o.discount > 0 && <tr><td>Chiết khấu đơn</td><td style={{ textAlign: 'right' }}>−{money(o.discount)}</td></tr>}
        {ship > 0 && <tr><td>Phí vận chuyển</td><td style={{ textAlign: 'right' }}>{money(ship)}</td></tr>}
        <tr><td><b>Tổng cộng</b></td><td style={{ textAlign: 'right' }}><b>{money(total)} đ</b></td></tr>
        {isOrder && <tr><td>Đã thanh toán / đặt cọc</td><td style={{ textAlign: 'right' }}>{money(o.paid_net)}</td></tr>}
        {isOrder && <tr><td><b>Còn phải trả</b></td><td style={{ textAlign: 'right' }}><b>{money(Math.max(0, o.net_total - o.paid_net))} đ</b></td></tr>}
      </tbody></table>
      <div style={{ marginTop: 6 }}><i>Tổng cộng bằng chữ: {moneyWords(total)}</i></div>
      {(isOrder ? o.note : d.o.note) && <div>Ghi chú: {isOrder ? o.note : d.o.note}</div>}
    </>
  );
}

function SlipPayment({ p }) {
  return (
    <>
      <div>{p.direction === 'thu' ? 'Người nộp tiền' : 'Người nhận tiền'}: <b>{p.party_name || '—'}</b></div>
      <div>Nội dung: {p.kind_label}{p.note ? ' — ' + p.note : ''}</div>
      {(p.allocations || []).length > 0 && <div>Cho chứng từ: {p.allocations.map((a) => `${a.doc_code} (${money(a.amount)})`).join(', ')}</div>}
      <div>Quỹ: {p.fund_name}{p.method ? ' · ' + p.method : ''}</div>
      <div style={{ fontSize: 16, marginTop: 8 }}>Số tiền: <b>{money(p.amount)} đ</b></div>
      <div><i>Bằng chữ: {moneyWords(p.amount)}</i></div>
      {p.fee > 0 && <div>Phí sàn bị trừ: {money(p.fee)} đ · Thực nhận: {money(p.cash_amount)} đ</div>}
      {p.voided && <div style={{ color: '#b3261e', fontWeight: 700 }}>PHIẾU ĐÃ HỦY</div>}
    </>
  );
}
