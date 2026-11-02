import { OrderShipments } from './Shipping.jsx';
import { QrBox } from './SettingsExtra.jsx';
import { orderTransferContent } from '../lib/vietqr.js';
import { CARRIERS, carrier as carrierInfo, lastCarrier, rememberCarrier } from '../lib/carriers.js';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, moneyD, qty as fq, dmy, todayVN, match, pct } from '../lib/format.js';
import { useProducts, useCustomers, useFunds, tierPrice, productLabel, productSub, KIND_LABEL } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { packing, weightOf, fmtKg } from '../lib/docs/model.js';
import {
  Btn, Icon, Pill, StatusPill, DELIVERY, PAYMENT, Field, Input, TextArea, Select, DateInput, NumInput, Check, Tabs, Search, Loading,
  ErrorBox, Note, Table, Modal, ConfirmBtn, Picker, KV, Section, Empty, ListPage, FilterBox, RadioList,
} from '../components/ui.jsx';

// ===================== DANH SÁCH ĐƠN BÁN =====================
export function SalesPage() {
  const { open, can, settings } = useApp();
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const { data, error } = useQ('sales_orders', [], 'created_at desc', 3000);
  const rows = useMemo(() => (data || []).filter((o) => {
    if (channel && o.channel !== channel) return false;
    if (!match(`${o.code} ${o.customer_name} ${o.customer_phone || ''} ${o.note || ''}`, search)) return false;
    switch (tab) {
      case 'open': return o.status === 'xac_nhan' && o.remaining_qty > 0;
      case 'draft': return o.status === 'nhap';
      case 'debt': return o.receivable > 0;
      case 'refund': return o.payment_status === 'thua_tien' && (o.status === 'huy' || o.remaining_qty === 0);
      case 'done': return o.status === 'xac_nhan' && o.remaining_qty === 0;
      case 'cancel': return o.status === 'huy';
      default: return true;
    }
  }), [data, tab, search, channel]);
  const count = (f) => (data || []).filter(f).length;
  const cols = [
    { key: 'code', label: 'Đơn', render: (o) => <div><div className="cell-main">{o.code}</div><div className="cell-sub">{dmy(o.order_date)}{o.kind === 'dat_hang' ? ' · đặt riêng' : ''}</div></div> },
    { key: 'customer', label: 'Khách hàng', render: (o) => <div><div>{o.customer_name}</div><div className="cell-sub">{o.channel || ''}</div></div> },
    { key: 'total', label: 'Tổng đơn', align: 'right', render: (o) => money(o.order_total) },
    { key: 'paid', label: 'Đã thu', align: 'right', render: (o) => money(o.paid_net) },
    { key: 'due', label: 'Khách còn nợ', align: 'right', render: (o) => o.receivable > 0 ? <span className={o.overdue_days > 0 ? 'bad strong' : 'strong'}>{money(o.receivable)}</span> : o.prepaid > 0 ? <span className="muted small">cọc {money(o.prepaid)}</span> : '—' },
    { key: 'ds', label: 'Giao hàng', render: (o) => <div className="row gap-s"><StatusPill map={DELIVERY} value={o.delivery_status} />{o.is_late && <Pill tone="bad">trễ hẹn</Pill>}</div> },
    { key: 'ps', label: 'Thanh toán', render: (o) => <StatusPill map={PAYMENT} value={o.payment_status} /> },
  ];
  const sum = (k) => rows.reduce((s, o) => s + (o[k] || 0), 0);
  return (
    <ListPage title="Hóa đơn" sub="Đơn nháp không ảnh hưởng tồn kho hay doanh thu. Doanh thu ghi nhận khi giao hàng."
      filters={<>
        <FilterBox title="Trạng thái">
          <RadioList value={tab} onChange={setTab} options={[
            { value: 'open', label: 'Chờ giao', count: count((o) => o.status === 'xac_nhan' && o.remaining_qty > 0) },
            { value: 'draft', label: 'Nháp', count: count((o) => o.status === 'nhap') },
            { value: 'debt', label: 'Khách còn nợ', count: count((o) => o.receivable > 0) },
            { value: 'refund', label: 'Cần hoàn tiền', count: count((o) => o.payment_status === 'thua_tien' && (o.status === 'huy' || o.remaining_qty === 0)) },
            { value: 'done', label: 'Đã giao đủ' }, { value: 'cancel', label: 'Đã hủy' }, { value: 'all', label: 'Tất cả' },
          ]} />
        </FilterBox>
        {(settings.channels || []).length > 0 && <FilterBox title="Kênh bán"><Select value={channel} onChange={setChannel} options={settings.channels || []} placeholder="Mọi kênh bán" aria-label="Kênh bán" /></FilterBox>}
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã đơn, khách, SĐT…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('don-ban.xlsx', [{ name: 'Đơn bán', rows, columns: [
          { key: 'code', label: 'Mã đơn' }, { key: 'order_date', label: 'Ngày', type: 'date' }, { key: 'customer_name', label: 'Khách hàng' }, { key: 'channel', label: 'Kênh' },
          { key: 'order_total', label: 'Tổng đơn' }, { key: 'delivered_value', label: 'Đã giao (doanh thu)' }, { key: 'paid_net', label: 'Đã thu' }, { key: 'receivable', label: 'Còn nợ' },
          { key: 'prepaid', label: 'Trả trước' }, { key: 'delivery_status', label: 'Giao hàng', get: (o) => DELIVERY[o.delivery_status]?.[0] }, { key: 'payment_status', label: 'Thanh toán', get: (o) => PAYMENT[o.payment_status]?.[0] }] }])}>Xuất Excel</Btn>
        {can('ban_hang') && <Btn kind="primary" icon="plus" onClick={() => open('order-form', {})}>Tạo hóa đơn</Btn>}
      </>}>
      <ErrorBox error={error} />
      <Table columns={cols} rows={data ? rows : null} onRow={(o) => open('order', { id: o.id })} rowClass={(o) => (o.is_late || o.overdue_days > 0 ? 'row-late' : '')}
        foot={rows.length ? { code: `${rows.length} đơn`, total: money(sum('order_total')), paid: money(sum('paid_net')), due: money(sum('receivable')) } : null}
        empty={tab === 'open' ? 'Không có đơn nào đang chờ giao' : 'Không có đơn phù hợp'} />
    </ListPage>
  );
}

// ===================== ĐƠN ĐẶT RIÊNG (bảng tiến độ) =====================
export function SpecialPage() {
  const { open, can } = useApp();
  const { data, error } = useQ('sales_orders', [['kind', 'eq', 'dat_hang']], 'due_date', 2000);
  const [showDone, setShowDone] = useState(false);
  const cols = [
    { id: 'Mới nhận', title: 'Mới nhận (nháp)' },
    { id: 'Đã xác nhận', title: 'Đã xác nhận – chưa đặt xưởng' },
    { id: 'Đang sản xuất / chờ hàng về', title: 'Đang sản xuất / chờ hàng về' },
    { id: 'Hàng về – chờ giao', title: 'Hàng về – chờ giao' },
    { id: 'Giao một phần', title: 'Giao một phần' },
    { id: 'Đã giao đủ – chờ thu tiền', title: 'Đã giao – chờ thu tiền' },
    ...(showDone ? [{ id: 'Hoàn tất', title: 'Hoàn tất' }, { id: 'Đã hủy', title: 'Đã hủy' }] : []),
  ];
  return (
    <>
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Đặt hàng</h1>
          <div className="page-sub">Mới nhận → Xác nhận → Sản xuất / đặt NCC → Hàng về → Giao một phần / giao đủ → Hoàn tất. Các bước tự chuyển theo đơn đặt xưởng, phiếu nhận, phiếu giao và tiền thu.</div></div>
        <Check checked={showDone} onChange={setShowDone}>Hiện đơn đã xong / đã hủy</Check>
        {can('ban_hang') && <Btn kind="primary" icon="plus" onClick={() => open('order-form', { kind: 'dat_hang' })}>Tạo đơn đặt hàng</Btn>}
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <div className="board">
          {cols.map((c) => {
            const items = data.filter((o) => o.progress === c.id);
            return (
              <div className="board-col" key={c.id}>
                <h4><span>{c.title}</span><span className="muted">{items.length}</span></h4>
                {items.length === 0 && <div className="muted small">—</div>}
                {items.map((o) => (
                  <button key={o.id} className={`ticket${o.is_late ? ' late' : ''}`} onClick={() => open('order', { id: o.id })}>
                    <div className="row gap-s"><b>{o.code}</b><span className="grow" />{o.is_late ? <Pill tone="bad">trễ {-o.days_to_due} ngày</Pill> : o.days_to_due !== null && o.days_to_due <= 3 && o.remaining_qty > 0 ? <Pill tone="warn">còn {o.days_to_due} ngày</Pill> : null}</div>
                    <div>{o.customer_name}</div>
                    <div className="small muted">Hẹn giao {o.due_date ? dmy(o.due_date) : 'chưa hẹn'} · {money(o.order_total)} đ</div>
                    {o.po_summary && <div className="small"><Icon name="kiln" size={13} /> {o.po_summary}</div>}
                    <div className="row gap-s small"><span>Cọc/đã thu {money(o.paid_net)}</span>{o.eff_qty > 0 && <span className="grow"><div className="prog"><i style={{ width: `${Math.min(100, (o.delivered_qty / o.eff_qty) * 100)}%` }} /></div></span>}</div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ===================== FORM TẠO / SỬA ĐƠN BÁN =====================
// Tổng số thùng / trọng lượng của các dòng hàng (theo quy cách khai trong sản phẩm)
function OrderWeight({ lines }) {
  const products = useProducts();
  if (!lines?.length || !products.data) return null;
  const pm = Object.fromEntries(products.data.map((p) => [p.id, p]));
  let kg = 0; let miss = 0; let boxes = 0; const units = new Set();
  for (const l of lines) {
    const p = pm[l.product_id]; const q = Number(l.eff_qty) || 0; if (!q) continue;
    const w = weightOf(q, p); if (w === null) miss++; else kg += w;
    if (p?.units_per_pack) { boxes += packing(q, p.units_per_pack, p.pack_unit, p.unit).boxes; units.add(p.pack_unit || 'hộp'); }
  }
  if (!kg && !boxes) return null;
  return <div className="small" style={{ marginTop: 6 }}>{boxes > 0 && <><b>{fq(boxes)} {units.size === 1 ? [...units][0] : 'kiện'}</b> · </>}{kg > 0 && <>Tổng trọng lượng <b>{fmtKg(kg)}</b></>}{miss > 0 && <span className="muted"> (chưa gồm {miss} mặt hàng chưa khai trọng lượng)</span>}</div>;
}

// ===================== CHI TIẾT ĐƠN BÁN =====================
export function OrderDetail({ id, onClose }) {
  const { open, can, settings, book } = useApp();
  const o = useQ('sales_orders', [['id', 'eq', id]]);
  const lines = useQ('sales_order_lines', [['order_id', 'eq', id]], 'line_no');
  const dels = useQ('deliveries', [['order_id', 'eq', id]], 'created_at');
  const rets = useQ('sales_returns', [['order_id', 'eq', id]], 'created_at');
  const pays = useQ('doc_payments', [['doc_id', 'eq', id]], 'pay_date');
  const pos = useQ('purchase_orders', [['sales_order_id', 'eq', id]], 'created_at', 50, can('nhap_hang'));
  const audit = useQ('audit', [['row_id', 'eq', id]], 'at desc', 50, can('owner'));
  const contract = useQ('contracts', [['order_id', 'eq', id]]);
  const { run, busy } = useAction();
  const [cancelMode, setCancelMode] = useState(null);
  const [reason, setReason] = useState('');
  const d = o.data?.[0];
  if (!d) return <Modal title="Đơn hàng" onClose={onClose} size="lg">{o.error ? <ErrorBox error={o.error} /> : <Loading />}</Modal>;
  const canSell = can('ban_hang');
  const unlinked = (lines.data || []).filter((l) => !l.po_line_id && l.remaining_qty > 0 && !l.is_kit);
  const payKind = d.payment_status === 'thua_tien' ? 'hoan_khach' : 'thu_khach';
  return (
    <Modal title={`Đơn ${d.code}`} onClose={onClose} size="xl"
      subtitle={<span className="row gap-s">{KIND_LABEL[d.kind]} · {dmy(d.order_date)} · <StatusPill map={DELIVERY} value={d.delivery_status} /> <StatusPill map={PAYMENT} value={d.payment_status} /> {d.kind === 'dat_hang' && <Pill tone="accent">{d.progress}</Pill>} {d.is_late && <Pill tone="bad">trễ hẹn giao</Pill>}</span>}
      footer={<>
        <Btn icon="dl" onClick={() => open('doc', { kind: 'order', id })}>Xuất PDF</Btn>
        {contract.data?.[0] ? <Btn icon="receipt" onClick={() => open('contract', { id: contract.data[0].id })}>Hợp đồng {contract.data[0].code}</Btn>
          : canSell && d.status !== 'huy' && d.kind === 'dat_hang' && <Btn icon="receipt" onClick={() => open('contract-form', { order_id: id })}>Lập hợp đồng</Btn>}
        <span className="grow" />
        {canSell && d.status === 'nhap' && <Btn onClick={() => { onClose(); open('order-form', { id }); }} icon="edit">Sửa</Btn>}
        {canSell && d.status === 'xac_nhan' && d.delivery_count === 0 && <Btn onClick={() => { onClose(); open('order-form', { id }); }} icon="edit">Sửa</Btn>}
        {canSell && d.status === 'nhap' && <Btn kind="soft" busy={busy} onClick={() => run('confirm_sales_order', { id }, (r) => (r.warnings?.length ? 'Đã xác nhận. Lưu ý: ' + r.warnings.join('; ') : 'Đã xác nhận đơn – hàng đã được giữ'))}>Xác nhận đơn</Btn>}
        {can('thu_chi') && d.status !== 'nhap' && (d.remaining_to_pay > 0 || d.payment_status === 'thua_tien') && (
          <Btn kind="soft" icon={payKind === 'thu_khach' ? 'in' : 'out'} onClick={() => open('payment', { kind: payKind, party_id: d.customer_id,
            alloc: { doc_type: 'don_ban', doc_id: d.id, code: d.code, amount: payKind === 'thu_khach' ? d.remaining_to_pay : d.paid_net - d.delivered_value } })}>
            {payKind === 'thu_khach' ? (d.delivered_value === 0 ? 'Nhận cọc / thu tiền' : 'Thu tiền') : 'Hoàn tiền cho khách'}</Btn>
        )}
        {canSell && d.delivered_value > 0 && <Btn icon="return" onClick={() => open('return', { order: d })}>Trả hàng</Btn>}
        {canSell && d.status === 'xac_nhan' && d.remaining_qty > 0 && <Btn kind="primary" icon="truck" onClick={() => open('deliver', { order: d })}>Giao hàng</Btn>}
      </>}>
      <div className="grid-2">
        <KV items={[
          ['Khách hàng', <a href="#" onClick={(e) => { e.preventDefault(); open('party-detail', { type: 'kh', id: d.customer_id }); }}>{d.customer_name}</a>],
          ['Điện thoại', d.customer_phone || '—'], ['Địa chỉ', d.customer_address || '—'], ['Kênh bán', d.channel || '—'],
          ['Hẹn giao', d.due_date ? dmy(d.due_date) + (d.is_late ? ` (trễ ${-d.days_to_due} ngày)` : '') : '—'], ['Phụ trách', d.staff || '—'],
          d.note && ['Ghi chú', <span style={{ whiteSpace: 'pre-wrap' }}>{d.note}</span>], d.cancel_reason && ['Lý do hủy', d.cancel_reason],
        ]} />
        <div className="card"><div className="totals">
          <span>Tổng đơn</span><span className="r strong">{money(d.order_total)}</span>
          {d.vat_rate > 0 && <><span className="muted">Gồm VAT {fq(d.vat_rate)}%</span><span className="r muted">{money(d.vat_total)}</span></>}
          <span>Đã giao (doanh thu)</span><span className="r">{money(d.delivered_value + d.returned_value)}</span>
          {d.returned_value > 0 && <><span>− Khách trả lại</span><span className="r">{money(d.returned_value)}</span></>}
          <span>Đã thu (thuần)</span><span className="r">{money(d.paid_net)}</span>
          <span className="strong">Khách còn nợ (hàng đã giao)</span><span className={`r strong ${d.receivable > 0 ? 'bad' : ''}`}>{money(d.receivable)}</span>
          {d.prepaid > 0 && <><span>Khách trả trước / cọc</span><span className="r good strong">{money(d.prepaid)}</span></>}
          <span>Còn phải trả cả đơn</span><span className="r">{money(d.remaining_to_pay)}</span>
          {d.cogs !== null && d.cogs !== undefined && <><span className="muted">Giá vốn hàng đã giao</span><span className="r muted">{money(d.cogs)}</span>
            <span className="muted">Lợi nhuận gộp (sau thuế ước tính)</span><span className="r muted">{money(d.gross_profit)}</span></>}
          {d.overdue_days > 0 && <><span className="bad">Quá hạn thanh toán</span><span className="r bad">{d.overdue_days} ngày</span></>}
        </div></div>
      </div>
      {d.status === 'xac_nhan' && d.eff_qty > 0 && <div className="deliv-bar"><span>Đã giao <b>{fq(d.delivered_qty)}</b> / {fq(d.eff_qty)}</span><div className="prog grow"><i style={{ width: `${Math.min(100, (d.delivered_qty / d.eff_qty) * 100)}%` }} /></div><b>{fq((d.delivered_qty / d.eff_qty) * 100)}%</b><span>Còn phải giao <b className="warn">{fq(d.remaining_qty)}</b></span></div>}
      <Section title="Hàng trong đơn">
        <Table dense rows={lines.data} columns={[
          { key: 'p', label: 'Sản phẩm', render: (l) => <div><div className="cell-main">{l.sku} · {l.product_name}{l.is_kit ? ' (bộ)' : ''}</div>{l.note && <div className="cell-sub"><i>{l.note}</i></div>}{l.po_code && <div className="cell-sub"><Icon name="kiln" size={12} /> {l.po_code}: {l.po_step || 'đã đặt'} · đã về {fq(l.po_received)}</div>}</div> },
          { key: 'q', label: 'SL đặt', align: 'right', render: (l) => <>{fq(l.eff_qty)}{l.cancelled_qty > 0 && <div className="cell-sub">hủy {fq(l.cancelled_qty)}</div>}</> },
          { key: 'pr', label: 'Đơn giá', align: 'right', render: (l) => <>{money(l.unit_price)}{l.discount_pct > 0 && <div className="cell-sub">CK {fq(l.discount_pct)}%</div>}</> },
          { key: 't', label: 'Thành tiền', align: 'right', render: (l) => money(l.line_total) },
          { key: 'dq', label: 'Đã giao', align: 'right', render: (l) => <>{fq(l.delivered_qty)}{l.returned_qty > 0 && <div className="cell-sub">trả {fq(l.returned_qty)}</div>}</> },
          { key: 'rq', label: 'Còn phải giao', align: 'right', render: (l) => l.remaining_qty > 0 ? <b>{fq(l.remaining_qty)}</b> : '—' },
        ]} />
        <OrderWeight lines={lines.data} />
        {d.discount > 0 && <div className="muted small">Giảm giá cả đơn {money(d.discount)} đ được chia vào giá từng dòng theo tỷ lệ tiền hàng khi giao.</div>}
      </Section>
      {d.kind === 'dat_hang' && can('nhap_hang') && d.status !== 'huy' && (
        <Section title="Sản xuất / đặt nhà cung cấp" actions={unlinked.length > 0 && d.status === 'xac_nhan' && <Btn small kind="soft" icon="kiln" onClick={() => open('po-form', { kind: 'dat_sx', sales_order_id: d.id,
          lines: unlinked.map((l) => ({ product_id: l.product_id, qty: l.remaining_qty, sales_order_line_id: l.id })) })}>Tạo đơn đặt xưởng</Btn>}>
          {d.status === 'nhap' && <Note>Xác nhận đơn trước khi đặt xưởng.</Note>}
          <Table dense rows={pos.data} empty="Chưa đặt xưởng / nhà cung cấp cho đơn này" onRow={(r) => open('po', { id: r.id })} columns={[
            { key: 'code', label: 'Đơn nhập', render: (r) => <b>{r.code}</b> }, { key: 's', label: 'Xưởng / NCC', render: (r) => r.supplier_name },
            { key: 'st', label: 'Tiến độ', render: (r) => <Pill tone={r.receive_status === 'da_nhan_du' ? 'good' : r.is_late ? 'bad' : 'info'}>{r.progress}</Pill> },
            { key: 'e', label: 'Hẹn nhận', render: (r) => dmy(r.expected_date) },
          ]} />
        </Section>
      )}
      <OrderShipments order={d} />
      {settings.bank && d.status !== 'huy' && d.remaining_to_pay > 0 && (
        <Section title="Chuyển khoản cho đơn này">
          <div className="row gap" style={{ alignItems: 'flex-start' }}>
            <QrBox amount={d.remaining_to_pay} content={orderTransferContent(book, d.code)} size={150} />
            <div className="small" style={{ maxWidth: 380 }}>Gửi mã này cho khách (chụp màn hình hoặc in phiếu). Khách quét bằng app ngân hàng là đủ số tiền <b>{money(d.remaining_to_pay)} đ</b> và nội dung <b>{orderTransferContent(book, d.code)}</b>. Khi tiền về, phần mềm tự ghi phiếu thu cho đơn này và báo lên điện thoại.</div>
          </div>
        </Section>
      )}
      <div className="grid-2">
        <Section title="Các đợt giao hàng" actions={canSell && d.status === 'xac_nhan' && d.remaining_qty > 0 && <Btn small icon="plus" onClick={() => open('deliver', { order: d })}>Tạo đợt giao tiếp theo</Btn>}>
          <Table dense rows={dels.data} empty="Chưa giao" columns={[
            { key: 'c', label: 'Đợt', render: (r) => <><b>Đợt {dels.data.indexOf(r) + 1}</b><div className="cell-sub">{r.code} · {dmy(r.delivery_date)}</div></> },
            { key: 'v', label: 'Tiền đợt này', align: 'right', render: (r) => money(r.total) },
            { key: 'g', label: 'Giá vốn', align: 'right', render: (r) => (r.cogs === null || r.cogs === undefined ? '—' : money(r.cogs)) },
            { key: 'p', label: 'Chứng từ', render: (r) => <div className="row gap-s">{[['hoa_don', 'Hóa đơn'], ['bien_ban', 'Biên bản'], ['hd_van_chuyen', 'HĐVC']].map(([t, l]) => <Btn small key={t} onClick={() => open('doc', { kind: 'delivery', id: r.id, type: t })}>{l}</Btn>)}{canSell && <Btn small onClick={() => open('trip', { order_id: id, delivery_id: r.id })}>Lái xe</Btn>}</div> },
          ]} />
          {(rets.data || []).length > 0 && <Table dense rows={rets.data} columns={[
            { key: 'c', label: 'Phiếu trả', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.return_date)} · {r.reason}</div></> },
            { key: 'l', label: 'Hàng', render: (r) => (r.lines || []).map((x) => `${x.sku} × ${fq(x.qty)}${x.restock ? '' : ' (lỗi, không nhập kho)'}`).join('; ') },
            { key: 'v', label: 'Giảm doanh thu', align: 'right', render: (r) => money(r.revenue) },
          ]} />}
        </Section>
        <Section title="Thanh toán & đặt cọc">
          {d.paid_net > 0 && <div className="totals"><span>Đã nhận</span><span className="r">{money(d.paid_net)}</span><span>Đã khấu trừ vào hóa đơn</span><span className="r">{money(d.deposit_used)}</span><span className="strong">Cọc còn lại</span><span className="r strong good">{money(Math.max(d.paid_net - d.deposit_used, 0))}</span></div>}
          <Table dense rows={pays.data} empty="Chưa có khoản thu" columns={[
            { key: 'c', label: 'Phiếu', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.pay_date)} · {r.fund_name}</div></> },
            { key: 'k', label: 'Loại', render: (r) => (r.kind === 'hoan_khach' ? <Pill tone="warn">Hoàn tiền</Pill> : d.delivery_count === 0 || r.pay_date < (d.last_delivery_date || '9999') ? 'Cọc / trả trước' : 'Thu tiền') },
            { key: 'a', label: 'Số tiền', align: 'right', render: (r) => <span className={r.signed_amount < 0 ? 'bad' : ''}>{money(r.signed_amount)}</span> },
          ]} />
        </Section>
      </div>
      {canSell && d.status !== 'huy' && (
        <Section title="Hủy">
          {!cancelMode ? (
            <div className="row gap">
              {d.delivery_count === 0 && <Btn onClick={() => setCancelMode('all')}>Hủy đơn</Btn>}
              {d.status === 'xac_nhan' && d.delivery_count > 0 && d.remaining_qty > 0 && <Btn onClick={() => setCancelMode('rest')}>Hủy phần chưa giao</Btn>}
              <span className="muted small">{d.delivery_count > 0 ? 'Đơn đã giao không xóa được. Hàng đã giao muốn hủy thì dùng "Trả hàng" để ghi đảo doanh thu, giá vốn, công nợ.' : 'Hủy đơn chưa giao sẽ nhả hàng đang giữ. Tiền cọc (nếu có) chuyển thành tiền cần hoàn cho khách.'}</span>
            </div>
          ) : (
            <div className="row gap">
              <Input value={reason} onChange={setReason} placeholder="Lý do (bắt buộc)" style={{ maxWidth: 360 }} />
              <ConfirmBtn kind="danger" busy={busy} onConfirm={async () => {
                const r = await run(cancelMode === 'all' ? 'cancel_sales_order' : 'cancel_remaining', { id, reason }, cancelMode === 'all' ? 'Đã hủy đơn' : 'Đã hủy phần chưa giao');
                if (r) { setCancelMode(null); setReason(''); }
              }}>{cancelMode === 'all' ? 'Xác nhận hủy đơn' : 'Xác nhận hủy phần chưa giao'}</ConfirmBtn>
              <Btn onClick={() => setCancelMode(null)}>Thôi</Btn>
            </div>
          )}
        </Section>
      )}
      {can('owner') && audit.data && audit.data.length > 0 && (
        <details><summary className="muted small">Nhật ký chỉnh sửa đơn ({audit.data.length})</summary>
          <div className="small muted">{audit.data.map((a) => <div key={a.id}>{new Date(a.at).toLocaleString('vi-VN')} · {a.user_name || 'hệ thống'} · {a.op === 'INSERT' ? 'tạo' : a.op === 'UPDATE' ? 'sửa' : 'xóa'}</div>)}</div>
        </details>
      )}
    </Modal>
  );
}

// ===================== GIAO HÀNG =====================
export function DeliverDialog({ order, onClose }) {
  const { can, settings, book, open, rpc, toast, refresh } = useApp();
  const lines = useQ('sales_order_lines', [['order_id', 'eq', order.id]], 'line_no');
  const products = useProducts();
  const funds = useFunds(can('thu_chi'));
  const { run, busy } = useAction();
  const [qtys, setQtys] = useState({});
  const [date, setDate] = useState(todayVN());
  const [ship, setShip] = useState(Math.max(0, order.shipping_fee - order.ship_billed));
  const [note, setNote] = useState('');
  const [deposit, setDeposit] = useState(null);
  const depositLeft = Math.max(order.paid_net - (order.deposit_used || 0), 0);
  const [collect, setCollect] = useState(false);
  const [fund, setFund] = useState('');
  const [override, setOverride] = useState(false);
  const [viaSpx, setViaSpx] = useState(false); const [tracking, setTracking] = useState(''); const [cod, setCod] = useState(null); const [cr, setCr] = useState(lastCarrier());
  const pmap = useMemo(() => Object.fromEntries((products.data || []).map((p) => [p.id, p])), [products.data]);
  useEffect(() => { if (lines.data) setQtys(Object.fromEntries(lines.data.filter((l) => l.remaining_qty > 0).map((l) => [l.id, l.remaining_qty]))); }, [lines.data]);
  useEffect(() => { if (!fund && funds.data?.length) setFund(funds.data[0].id); }, [funds.data]);
  const allowOver = book.role === 'owner' && settings.allow_oversell;
  const submit = async () => {
    const r = await run('deliver', { order_id: order.id, date, shipping_fee: ship, note, override, deposit_used: deposit || 0, lines: Object.entries(qtys).map(([k, v]) => ({ order_line_id: k, qty: Number(v) || 0 })) },
      (x) => `Đã giao – phiếu ${x.code}`);
    if (!r) return;
    if (collect) {
      try {
        const [o2] = await rpc('q', { view: 'sales_orders', filters: [['id', 'eq', order.id]] });
        const due = o2?.receivable || 0;
        if (due > 0) await rpc('create_payment', { request_id: crypto.randomUUID?.() || String(Date.now()), kind: 'thu_khach', date, fund_id: fund, party_id: order.customer_id, amount: due,
          allocations: [{ doc_type: 'don_ban', doc_id: order.id, amount: due }], note: 'Thu khi giao ' + r.code });
        if (due > 0) toast('Đã thu ' + money(due) + ' đ'); refresh();
      } catch (e) { toast('Đã giao nhưng chưa thu được tiền: ' + e.message, 'err'); }
    }
    if (viaSpx && tracking.trim()) {
      try {
        let codAmt = cod;
        if (codAmt === null || codAmt === undefined || codAmt === '') { const [o3] = await rpc('q', { view: 'sales_orders', filters: [['id', 'eq', order.id]] }); codAmt = Math.max(0, o3?.receivable || 0); }
        const sh = await rpc('create_shipment', { request_id: crypto.randomUUID?.() || String(Date.now()), order_id: order.id, delivery_id: r.id, carrier: cr, tracking_no: tracking, cod_amount: codAmt });
        rememberCarrier(cr);
        toast(`Đã gắn vận đơn ${carrierInfo(cr).short} ${sh.tracking_no}${codAmt > 0 ? ' · COD ' + money(codAmt) + ' đ' : ''}`); refresh();
      } catch (e) { toast('Đã giao nhưng chưa tạo được vận đơn: ' + e.message, 'err'); }
    }
    onClose(); open('doc', { kind: 'delivery', id: r.id, type: 'bien_ban' });
  };
  return (
    <Modal title={`Giao hàng – đơn ${order.code}`} subtitle={order.customer_name} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" icon="truck" busy={busy} onClick={submit}>Ghi nhận đã giao</Btn></>}>
      <Note>Khi lưu: trừ tồn kho, ghi doanh thu và giá vốn của phần hàng giao. Có thể giao nhiều đợt.</Note>
      {!lines.data ? <Loading /> : (
        <Table dense rows={lines.data.filter((l) => l.remaining_qty > 0)} columns={[
          { key: 'p', label: 'Sản phẩm', render: (l) => <><div className="cell-main">{l.sku} · {l.product_name}</div><div className="cell-sub">Tồn {fq(pmap[l.product_id]?.on_hand)} · còn bán {fq(pmap[l.product_id]?.available)} (đã tính hàng giữ cho đơn này)</div></> },
          { key: 'r', label: 'Còn phải giao', align: 'right', render: (l) => fq(l.remaining_qty) },
          { key: 'q', label: 'Giao lần này', align: 'right', render: (l) => <NumInput money={false} stepper min={0} value={qtys[l.id]} onChange={(v) => setQtys((s) => ({ ...s, [l.id]: v }))} style={{ maxWidth: 150, marginLeft: 'auto' }} aria-label="Giao lần này" /> },
        ]} />
      )}
      <div className="grid">
        <Field label="Ngày giao"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        <Field label="Phí vận chuyển tính khách" hint={`Đã tính ${money(order.ship_billed)} / ${money(order.shipping_fee)} theo đơn`}><NumInput value={ship} onChange={setShip} /></Field>
        <Field label="Ghi chú"><Input value={note} onChange={setNote} placeholder="vd. Giao đợt 1, xe anh Đức" /></Field>
        {depositLeft > 0 && <Field label="Khấu trừ tiền cọc vào đợt này" hint={`Cọc còn lại ${money(depositLeft)} đ`}><NumInput min={0} max={depositLeft} value={deposit} onChange={setDeposit} /></Field>}
      </div>
      <div className="row gap"><Check checked={viaSpx} onChange={(v) => { setViaSpx(v); if (v) setCollect(false); }}>Gửi qua đơn vị vận chuyển</Check>
        {viaSpx && <Select value={cr} onChange={setCr} options={CARRIERS.map((c) => ({ value: c.code, label: c.name }))} style={{ maxWidth: 170 }} aria-label="Đơn vị vận chuyển" />}
        {viaSpx && <><Input value={tracking} onChange={(v) => setTracking(v.toUpperCase())} placeholder={`Mã vận đơn ${carrierInfo(cr).short === 'Khác' ? '' : carrierInfo(cr).short}`.trim() + '…'} style={{ maxWidth: 220 }} />
          <NumInput value={cod} onChange={setCod} placeholder="COD: tự tính = khách còn nợ" style={{ maxWidth: 230 }} aria-label="Tiền thu hộ COD" /></>}</div>
      {viaSpx && <div className="muted small">COD để trống = số khách còn nợ sau lần giao này; nhập 0 nếu khách đã chuyển khoản. Tiền COD được theo dõi ở mục Vận chuyển cho tới khi hãng chuyển về tài khoản.</div>}
      {can('thu_chi') && !viaSpx && <div className="row gap"><Check checked={collect} onChange={setCollect}>Thu luôn số khách còn nợ sau lần giao này</Check>
        {collect && <Select value={fund} onChange={setFund} options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} style={{ maxWidth: 220 }} />}</div>}
      {allowOver && <Check checked={override} onChange={setOverride}>Cho phép giao vượt số lượng có thể bán (chỉ chủ cửa hàng)</Check>}
    </Modal>
  );
}

// ===================== TRẢ HÀNG =====================
export function ReturnDialog({ order, onClose }) {
  const { can } = useApp();
  const dl = useQ('delivery_lines', [['order_id', 'eq', order.id]], 'delivery_date');
  const funds = useFunds(can('thu_chi'));
  const { run, busy } = useAction();
  const [q, setQ] = useState({}); const [rs, setRs] = useState({});
  const [date, setDate] = useState(todayVN()); const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(null); const [fund, setFund] = useState('');
  useEffect(() => { if (!fund && funds.data?.length) setFund(funds.data[0].id); }, [funds.data]);
  const value = (dl.data || []).reduce((s, l) => s + (l.qty ? (Number(q[l.id]) || 0) * (l.revenue / l.qty) : 0), 0);
  const canRefund = Math.max(0, Math.min(Math.round(value), Math.round(order.paid_net - (order.delivered_value - value))));
  useEffect(() => { setRefund(canRefund || null); }, [canRefund]);
  return (
    <Modal title={`Trả hàng – đơn ${order.code}`} subtitle={order.customer_name} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('sales_return', { order_id: order.id, date, reason, lines: Object.entries(q).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ delivery_line_id: k, qty: Number(v), restock: rs[k] !== false })),
          refund: refund > 0 ? { amount: refund, fund_id: fund } : null }, (x) => `Đã lập phiếu trả ${x.code}${x.refund_code ? ' · hoàn tiền ' + x.refund_code : ''}`);
        if (r) onClose();
      }}>Ghi nhận trả hàng</Btn></>}>
      <Note>Một phiếu trả xử lý cùng lúc: nhận hàng về kho (theo đúng giá vốn lúc giao), giảm doanh thu và giá vốn, giảm công nợ của khách, và hoàn tiền nếu khách đã trả.</Note>
      {!dl.data ? <Loading /> : (
        <Table dense rows={dl.data.filter((l) => l.returnable_qty > 0)} empty="Không còn hàng nào có thể trả" columns={[
          { key: 'p', label: 'Hàng đã giao', render: (l) => <><div className="cell-main">{l.sku} · {l.product_name}</div><div className="cell-sub">{l.delivery_code} · {dmy(l.delivery_date)} · giá {money(l.unit_price_net)}</div></> },
          { key: 'r', label: 'Có thể trả', align: 'right', render: (l) => fq(l.returnable_qty) },
          { key: 'q', label: 'Số trả', align: 'right', render: (l) => <NumInput money={false} stepper min={0} max={l.returnable_qty} value={q[l.id]} onChange={(v) => setQ((s) => ({ ...s, [l.id]: v }))} style={{ maxWidth: 150, marginLeft: 'auto' }} aria-label="Số trả" /> },
          { key: 's', label: 'Nhập lại kho?', render: (l) => <Check checked={rs[l.id] !== false} onChange={(v) => setRs((s) => ({ ...s, [l.id]: v }))}>{rs[l.id] === false ? 'Hàng lỗi – ghi hao hụt' : 'Nhập lại để bán'}</Check> },
        ]} />
      )}
      <div className="grid">
        <Field label="Ngày trả"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        <Field label="Lý do"><Input value={reason} onChange={setReason} placeholder="vd. Vỡ khi vận chuyển" /></Field>
        <Field label="Giá trị hàng trả (giảm doanh thu)"><Input value={money(value)} readOnly /></Field>
      </div>
      {can('thu_chi') && <div className="grid">
        <Field label="Hoàn tiền cho khách" hint={`Tối đa ${money(canRefund)} (phần khách đã trả vượt giá trị hàng còn giữ). Để 0 nếu trừ vào công nợ.`}><NumInput value={refund} onChange={setRefund} /></Field>
        <Field label="Chi từ quỹ"><Select value={fund} onChange={setFund} options={(funds.data || []).map((x) => ({ value: x.id, label: `${x.name} (${money(x.balance)})` }))} /></Field>
      </div>}
    </Modal>
  );
}
