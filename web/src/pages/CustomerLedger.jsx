// Trang chi tiết khách hàng: Sổ công nợ (mọi giao dịch theo thứ tự thực tế) và Chi tiết đơn; phiếu thu theo đợt trừ nợ cho nhiều đơn.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useRpcData, useAction } from '../lib/store.jsx';
import { money, dmy, dayTime, todayVN } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { TIME_PRESETS, presetRange } from '../components/DocFilters.jsx';
import { CustomerFiles } from './CustomerFiles.jsx';
import { DocsBoardMini } from './OrderDocs.jsx';
import { PaymentDetail } from './Cash.jsx';
import { SaleDetail } from './OrderInvoice.jsx';
import { Btn, Pill, StatusPill, DELIVERY, Field, Input, Select, DateInput, NumInput, Check, Tabs, Loading, ErrorBox, Note, Table, Modal } from '../components/ui.jsx';

const METHODS = ['Chuyển khoản', 'Tiền mặt', 'Quẹt thẻ', 'Bù trừ'];

// Trạng thái thanh toán của đơn so với số phải thu (hàng đã giao); đơn hủy / nháp: không có
export function orderPayState(o) {
  if (o.status === 'huy' || o.status === 'nhap') return null;
  if (o.delivered_value <= 0) return o.paid_net > 0 ? ['Đã đặt cọc', 'info'] : null;
  if (o.paid_net <= 0) return ['Chưa thu', 'warn'];
  if (o.paid_net >= o.delivered_value) return ['Đã thu đủ', 'good'];
  return ['Đã thu một phần', 'info'];
}

// Dư nợ âm = khách đang trả trước
const Balance = ({ v }) => (v < 0 ? <span className="good">{money(-v)}<div className="cell-sub">khách trả trước</div></span> : <span className={v > 0 ? 'bad' : ''}>{money(v)}</span>);

// Chi tiết khách hàng như KiotViet: thẻ Thông tin (các trường của khách + vài số công nợ gọn), Lịch sử bán / trả hàng,
// Nợ cần thu từ khách, Giấy tờ, Tài liệu. Nút ở chân đổi theo thẻ đang xem.
export function CustomerDetail({ id, onClose }) {
  const { open, can, settings } = useApp();
  const seeLedger = can('xem_thu_chi');
  const cq = useQ('customers', [['id', 'eq', id]]);
  const led = useRpcData('customer_ledger', { customer_id: id }, seeLedger);
  const [tab, setTab] = useState('info');
  const c = cq.data?.[0];
  if (!c) return <Modal title="Khách hàng" onClose={onClose} size="xl">{cq.error ? <ErrorBox error={cq.error} /> : cq.data ? <Note tone="warn">Không tìm thấy khách hàng này</Note> : <Loading />}</Modal>;
  const L = led.data;
  const nPay = L ? L.rows.filter((r) => r.type === 'thu').length : 0;
  const x = c.extra || {};
  const priceName = (settings.price_names || [])[c.price_tier - 1];
  const payBtn = can('thu_chi') && <Btn kind="primary" icon="in" onClick={() => open('receipt', { customer_id: id, round: nPay + 1 })}>Thanh toán</Btn>;
  const orderBtn = can('ban_hang') && <Btn icon="cart" onClick={() => open('order-form', { customer_id: id })}>Tạo đơn</Btn>;
  const footer = tab === 'info' ? <>{orderBtn}<span className="grow" />{can('danh_muc') && <Btn kind="primary" icon="edit" onClick={() => open('party', { type: 'kh', id })}>Cập nhật</Btn>}</>
    : tab === 'orders' ? <>{orderBtn}<span className="grow" />{payBtn}</>
      : tab === 'ledger' ? <><span className="grow" />{payBtn}</> : null;
  const field = (label, value) => <label key={label}><span>{label}</span><b>{value || ''}</b></label>;
  return (
    <Modal title={c.name} subtitle={<span className="row gap-s">{c.code}{c.active === false && <Pill tone="mute">Ngừng giao dịch</Pill>}{c.overdue > 0 && <Pill tone="bad">Quá hạn {money(c.overdue)}</Pill>}</span>}
      onClose={onClose} size="xl" footer={footer}>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'info', label: 'Thông tin' },
        { value: 'orders', label: 'Lịch sử bán / trả hàng' },
        ...(seeLedger ? [{ value: 'ledger', label: 'Nợ cần thu từ khách' }] : []),
        { value: 'docs', label: 'Giấy tờ đơn hàng' },
        { value: 'files', label: 'Tài liệu' },
      ]} />
      {tab === 'info' && <>
        <div className="od-info cust-info">
          {field('Mã khách hàng', c.code)}
          {field('Tên khách', c.name)}
          {field('Điện thoại', c.phone)}
          {field('Nhóm khách', c.kind)}
          {field('Ngày sinh', x.birthday ? dmy(x.birthday) : '')}
          {field('Giới tính', x.gender)}
          {field('Email', x.email)}
          {field('Facebook', x.facebook)}
          {field('Địa chỉ', c.address)}
          {field('Khu vực', x.province)}
          {field('Phường/Xã', x.ward)}
          {field('Người liên hệ', c.contact)}
          {field('Mức giá', priceName)}
          {field('Được nợ', c.credit_days ? `${c.credit_days} ngày` : '')}
          {field('Hạn mức nợ', c.credit_limit > 0 ? money(c.credit_limit) : '')}
          {field('Ngày tạo', c.created_at ? dmy(String(c.created_at).slice(0, 10)) : '')}
          {(x.tax_code || x.tax_name) && field('Mã số thuế', x.tax_code)}
          {(x.tax_code || x.tax_name) && field('Tên đơn vị', x.tax_name)}
          {x.ship_address && field('Giao hàng đến', [x.ship_name, x.ship_phone, x.ship_address].filter(Boolean).join(' · '))}
        </div>
        {c.note && <div className="cust-note"><span className="muted small">Ghi chú</span><div>{c.note}</div></div>}
        <div className="cust-sum">
          <span>Nợ hiện tại <b className={c.receivable > 0 ? 'bad' : ''}>{money(c.receivable)}</b></span>
          {c.overdue > 0 && <span>Quá hạn <b className="bad">{money(c.overdue)}</b> · lâu nhất {c.max_overdue_days} ngày</span>}
          {c.prepaid > 0 && <span>Trả trước <b className="good">{money(c.prepaid)}</b></span>}
          <span>Tổng bán <b>{money(c.total_bought || 0)}</b></span>
          {L && <span>Tổng đã thu <b>{money(L.total_paid)}</b></span>}
          {settings.points_on && <span>Điểm <PointsCell c={c} /></span>}
          {c.supplier_id && <span>Đồng thời là nhà cung cấp · <DualDebt c={c} /></span>}
        </div>
        <ErrorBox error={led.error} />
      </>}
      {tab === 'orders' && <OrdersTab id={id} />}
      {tab === 'ledger' && <LedgerTab id={id} />}
      {tab === 'docs' && <CustomerDocsTab id={id} />}
      {tab === 'files' && <CustomerFiles customerId={id} customerName={c.name} />}
    </Modal>
  );
}

function LedgerTab({ id }) {
  const [preset, setPreset] = useState('all'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [newest, setNewest] = useState(true);
  const [f, t] = preset === 'custom' ? [from || null, to || null] : presetRange(preset);
  const led = useRpcData('customer_ledger', { customer_id: id, from: f, to: t });
  const L = led.data;
  const filtered = !!(f || t);
  const rows = useMemo(() => {
    if (!L) return null;
    const list = [...L.rows];
    if (filtered) { list.unshift({ key: 'open', mark: 'Dư nợ đầu kỳ', date: f, balance: L.opening }); list.push({ key: 'close', mark: 'Dư nợ cuối kỳ', date: t, balance: L.closing }); }
    return newest ? list.reverse() : list;
  }, [L, newest, filtered]);
  const sum = (k) => (L ? L.rows.reduce((s, r) => s + r[k], 0) : 0);
  return (
    <div className="stack">
      <div className="row gap">
        <Select value={preset} onChange={(v) => setPreset(v || 'all')} options={[...TIME_PRESETS.filter((p) => p.value !== 'all'), { value: 'all', label: 'Toàn thời gian' }, { value: 'custom', label: 'Chọn ngày…' }]}
          aria-label="Khoảng thời gian" style={{ minWidth: 170 }} />
        {preset === 'custom' && <><DateInput value={from} onChange={(v) => setFrom(v || '')} placeholder="Từ ngày" aria-label="Từ ngày" /><DateInput value={to} onChange={(v) => setTo(v || '')} placeholder="Đến ngày" aria-label="Đến ngày" /></>}
        <span className="grow" />
        <div className="seg" role="group" aria-label="Thứ tự">
          <button type="button" className={newest ? 'on' : ''} onClick={() => setNewest(true)}>Mới nhất</button>
          <button type="button" className={newest ? '' : 'on'} onClick={() => setNewest(false)}>Cũ nhất</button>
        </div>
      </div>
      {filtered && L && <div className="small muted">Dư nợ đầu kỳ <b>{money(L.opening)}</b> · phát sinh {money(sum('debt'))} · đã thu {money(sum('paid'))} · dư nợ cuối kỳ <b>{money(L.closing)}</b></div>}
      <ErrorBox error={led.error} />
      <Table rows={rows} rowKey="key" empty={filtered ? 'Không có giao dịch nào trong thời gian này' : 'Khách chưa có giao dịch nào'}
        rowClass={(r) => (r.mark ? 'row-strong' : '')}
        expand={(r, close) => (r.payment_id ? <PaymentDetail id={r.payment_id} onClose={close} /> : r.order_id ? <SaleDetail orderId={r.order_id} deliveryId={r.delivery_id} onClose={close} /> : null)}
        foot={L && L.rows.length ? { c: `${L.rows.length} giao dịch`, v: money(sum('debt') - sum('paid')), b: <Balance v={L.closing} /> } : null}
        columns={[
          { key: 'c', label: 'Mã phiếu', render: (r) => (r.mark ? <b>{r.mark}</b> : <b className={r.payment_id ? 'accent' : ''}>{r.code}</b>) },
          { key: 'd', label: 'Thời gian', className: 'nowrap', render: (r) => (r.date ? dmy(r.date) : '') },
          { key: 'k', label: 'Loại', className: 'col-clip', render: (r) => (r.mark ? '' : <span title={[r.title, r.note].filter(Boolean).join(' · ')}>{r.title || (r.payment_id ? 'Thanh toán' : 'Bán hàng')}{r.method ? ` · ${r.method}` : ''}</span>) },
          { key: 'v', label: 'Giá trị', align: 'right', render: (r) => { if (r.mark) return ''; const v = (r.debt || 0) - (r.paid || 0); return <span className={v < 0 ? 'good' : ''}>{money(v)}</span>; } },
          { key: 'b', label: 'Dư nợ khách hàng', align: 'right', render: (r) => <Balance v={r.balance} /> },
        ]} />
    </div>
  );
}

// Lịch sử bán / trả hàng (như KiotViet): chỉ hóa đơn HD và phiếu trả hàng của khách, theo ngày bán / ngày trả, mới nhất trước.
// Đơn đặt hàng (DH) không phải hóa đơn nên không hiện; mỗi đợt giao của đơn đặt là một hóa đơn HD riêng (như trang Hóa đơn).
// Mỗi hóa đơn có số đã thu / còn nợ riêng như KiotViet (v_order_invoices).
// Đơn đã hủy không hiện. Bấm một dòng là chi tiết đơn xổ ra ngay dưới dòng.
// Hóa đơn của khách: đơn bán ngay (chính đơn là hóa đơn) và hóa đơn HD lập khi giao đơn đặt hàng; đơn đã hủy không có.
// inv: khóa hóa đơn dùng khi lập bảng đối chiếu gộp ("o:<đơn>" / "d:<phiếu giao>").
function useCustomerInvoices(id) {
  const q = useQ('sales_orders', [['customer_id', 'eq', id]], 'order_date desc', 5000);
  const dq = useQ('order_invoices', [['customer_id', 'eq', id]], 'delivery_date desc', 5000);
  const all = useMemo(() => {
    if (!q.data || !dq.data) return null;
    const direct = q.data.filter((o) => o.kind !== 'dat_hang' && o.status !== 'huy')
      .map((o) => ({ ...o, key: o.id, inv: `o:${o.id}`, type: 'ban', day: o.order_date, at: o.created_at, order_id: o.id }));
    const fromOrders = dq.data.filter((d) => d.order_status !== 'huy').map((d) => ({ key: 'dl-' + d.id, inv: `d:${d.id}`, delivery_id: d.id, type: 'ban', from_order: true, code: d.code,
      order_code: d.order_code, order_id: d.order_id, day: d.delivery_date, at: d.created_at, staff: d.staff, net_total: d.total, paid_net: d.paid,
      receivable: d.debt, overdue_days: d.overdue_days, status: 'xac_nhan', delivery_status: 'da_giao_du', delivered_value: d.total }));
    return [...direct, ...fromOrders];
  }, [q.data, dq.data]);
  return { all, error: q.error || dq.error };
}

function OrdersTab({ id }) {
  const [only, setOnly] = useState('');
  const iq = useCustomerInvoices(id);
  const rq = useQ('sales_returns', [['customer_id', 'eq', id]], 'return_date desc', 2000);
  const all = iq.all || [];
  const owing = all.filter((o) => o.receivable > 0);
  const rows = useMemo(() => {
    if (!iq.all || !rq.data) return null;
    const rets = only === 'debt' ? [] : rq.data.map((r) => ({ key: r.id, type: 'tra', code: r.code, day: r.return_date, at: r.created_at, order_id: r.order_id, order_code: r.invoice_code || r.order_code, revenue: r.revenue, status: 'xac_nhan' }));
    return [...(only === 'debt' ? owing : all), ...rets].sort((a, b) => String(b.day).localeCompare(String(a.day)) || String(b.at).localeCompare(String(a.at)));
  }, [all, rq.data, only]);
  const tot = (k) => (rows || []).reduce((s, o) => s + (o.type !== 'ban' ? 0 : o[k] || 0), 0);
  return (
    <div className="stack">
      <div className="row gap">
        <div className="seg" role="group" aria-label="Lọc đơn">
          <button type="button" className={only ? '' : 'on'} onClick={() => setOnly('')}>Tất cả ({all.length + (rq.data?.length || 0)})</button>
          <button type="button" className={only === 'debt' ? 'on' : ''} onClick={() => setOnly('debt')}>Còn nợ ({owing.length})</button>
        </div>
        <span className="grow" />
      </div>
      <ErrorBox error={iq.error || rq.error} />
      <Table rows={rows} rowKey="key" expand={(o, close) => <SaleDetail orderId={o.order_id} deliveryId={o.delivery_id} onClose={close} />}
        rowClass={(o) => (o.overdue_days > 0 ? 'row-late' : '')}
        empty={only ? 'Không có đơn nào còn nợ' : 'Khách chưa mua hàng'}
        foot={rows?.length ? { c: `${rows.length} chứng từ`, t: money(tot('net_total')), p: money(tot('paid_net')), d: money(tot('receivable')) } : null}
        columns={[
          { key: 'c', label: 'Mã chứng từ', render: (o) => <><b>{o.code}</b>{o.type === 'tra' ? <span className="muted small"> · trả từ {o.order_code}</span> : o.from_order && <div className="cell-sub">từ đặt hàng {o.order_code}</div>}</> },
          { key: 'dt', label: 'Thời gian', className: 'nowrap', render: (o) => dayTime(o.day, o.at) },
          { key: 'k', label: 'Loại', render: (o) => (o.type === 'tra' ? <Pill tone="warn">Trả hàng</Pill> : 'Hóa đơn') },
          { key: 'st', label: 'Người bán', render: (o) => o.staff || '' },
          { key: 't', label: 'Tổng cộng', align: 'right', render: (o) => (o.type === 'tra' ? <span className="bad">−{money(o.revenue)}</span> : money(o.net_total)) },
          { key: 'p', label: 'Đã thu', align: 'right', render: (o) => (o.type === 'ban' && o.paid_net ? money(o.paid_net) : '') },
          { key: 'd', label: 'Còn nợ', align: 'right', render: (o) => (o.receivable > 0 ? <b className={o.overdue_days > 0 ? 'bad' : ''}>{money(o.receivable)}</b> : '') },
          { key: 's', label: 'Trạng thái', render: (o) => {
            if (o.type === 'tra') return 'Đã trả hàng';
            const pay = orderPayState(o);
            return <span className="row gap-s"><StatusPill map={DELIVERY} value={o.delivery_status} />{pay && <Pill tone={pay[1]}>{pay[0]}</Pill>}</span>;
          } },
        ]} />
    </div>
  );
}

// ---------- Thẻ Giấy tờ đơn hàng ----------
// Hai phần: lập bảng đối chiếu công nợ / số lượng gộp nhiều hóa đơn, và bảng theo dõi giấy tờ của từng đơn (nhớ phần xem lần trước).
const DOCS_VIEW_KEY = 'gomsu.cust_docs_view';
function CustomerDocsTab({ id }) {
  const [view, setView0] = useState(() => { try { return localStorage.getItem(DOCS_VIEW_KEY) === 'track' ? 'track' : 'reconcile'; } catch (e) { return 'reconcile'; } });
  const setView = (v) => { setView0(v); try { localStorage.setItem(DOCS_VIEW_KEY, v); } catch (e) { /* bỏ qua */ } };
  return (
    <div className="stack">
      <div className="seg" role="group" aria-label="Giấy tờ đơn hàng">
        <button type="button" className={view === 'reconcile' ? 'on' : ''} onClick={() => setView('reconcile')}>Đối chiếu nhiều hóa đơn</button>
        <button type="button" className={view === 'track' ? 'on' : ''} onClick={() => setView('track')}>Theo dõi giấy tờ từng đơn</button>
      </div>
      {view === 'reconcile' ? <ReconcilePicker id={id} /> : <DocsBoardMini params={{ customer_id: id }} showCustomer={false} />}
    </div>
  );
}

// Chọn các hóa đơn của khách rồi lập một bảng đối chiếu công nợ / đối chiếu số lượng chung cho tất cả hóa đơn đã chọn.
// Hóa đơn đã chọn vẫn được giữ khi đổi bộ lọc; nút lập bảng dùng mọi hóa đơn đã chọn.
function ReconcilePicker({ id }) {
  const { open } = useApp();
  const iq = useCustomerInvoices(id);
  const [only, setOnly] = useState('');
  const [preset, setPreset] = useState('all'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [f, t] = preset === 'custom' ? [from || null, to || null] : presetRange(preset);
  const all = useMemo(() => (iq.all || []).filter((o) => o.status !== 'nhap'), [iq.all]);
  const rows = useMemo(() => (iq.all ? all.filter((o) => (!only || o.receivable > 0) && (!f || o.day >= f) && (!t || o.day <= t))
    .sort((a, b) => String(b.day).localeCompare(String(a.day)) || String(b.at).localeCompare(String(a.at))) : null), [all, only, f, t]);
  const chosen = all.filter((o) => sel.has(o.inv));
  const hidden = chosen.filter((o) => !(rows || []).includes(o)).length;
  const allOn = !!rows?.length && rows.every((o) => sel.has(o.inv));
  const toggle = (k) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setShown = (on) => setSel((s) => { const n = new Set(s); for (const o of rows || []) if (on) n.add(o.inv); else n.delete(o.inv); return n; });
  const sum = (k) => chosen.reduce((s, o) => s + (o[k] || 0), 0);
  const make = (type) => open('doc', { kind: 'invoices', id, keys: chosen.map((o) => o.inv), type });
  const owing = all.filter((o) => o.receivable > 0).length;
  return (
    <div className="stack">
      <div className="row gap wrap">
        <div className="seg" role="group" aria-label="Lọc hóa đơn">
          <button type="button" className={only ? '' : 'on'} onClick={() => setOnly('')}>Tất cả ({all.length})</button>
          <button type="button" className={only === 'debt' ? 'on' : ''} onClick={() => setOnly('debt')}>Còn nợ ({owing})</button>
        </div>
        <Select value={preset} onChange={(v) => setPreset(v || 'all')} options={[{ value: 'all', label: 'Toàn thời gian' }, ...TIME_PRESETS.filter((p) => p.value !== 'all'), { value: 'custom', label: 'Chọn ngày…' }]}
          aria-label="Ngày hóa đơn" style={{ minWidth: 170 }} />
        {preset === 'custom' && <><DateInput value={from} onChange={(v) => setFrom(v || '')} placeholder="Từ ngày" aria-label="Từ ngày" /><DateInput value={to} onChange={(v) => setTo(v || '')} placeholder="Đến ngày" aria-label="Đến ngày" /></>}
      </div>
      <div className="card recon-bar">
        <span className="small">{chosen.length
          ? <>Đã chọn <b>{chosen.length}</b> hóa đơn{hidden ? ` (${hidden} không hiện theo bộ lọc)` : ''} · tổng <b>{money(sum('net_total'))}</b> · đã thu {money(sum('paid_net'))} · còn nợ <b className={sum('receivable') > 0 ? 'bad' : ''}>{money(sum('receivable'))}</b>
            {' '}<button type="button" className="link-btn small" onClick={() => setSel(new Set())}>Bỏ chọn</button></>
          : 'Tích chọn các hóa đơn cần đối chiếu, rồi bấm lập bảng: một bảng chung cho tất cả hóa đơn đã chọn.'}</span>
        <span className="row gap-s">
          <Btn icon="print" disabled={!chosen.length} onClick={() => make('doi_chieu_sl')}>Đối chiếu số lượng</Btn>
          <Btn kind="primary" icon="print" disabled={!chosen.length} onClick={() => make('doi_chieu_tt')}>Đối chiếu công nợ</Btn>
        </span>
      </div>
      <ErrorBox error={iq.error} />
      <Table dense rows={rows} rowKey="inv" onRow={(o) => toggle(o.inv)} rowClass={(o) => (sel.has(o.inv) ? 'row-picked' : '')}
        empty={only || f || t ? 'Không có hóa đơn nào khớp bộ lọc' : 'Khách chưa có hóa đơn nào'}
        columns={[
          { key: 'x', width: 36, label: <span title={allOn ? 'Bỏ chọn các hóa đơn đang hiện' : 'Chọn mọi hóa đơn đang hiện'}><Check checked={allOn} disabled={!rows?.length} onChange={setShown} /></span>,
            render: (o) => <span onClick={(e) => e.stopPropagation()}><Check checked={sel.has(o.inv)} onChange={() => toggle(o.inv)} /></span> },
          { key: 'c', label: 'Mã hóa đơn', render: (o) => <><b>{o.code}</b>{o.from_order && <div className="cell-sub">từ đặt hàng {o.order_code}</div>}</> },
          { key: 'dt', label: 'Ngày', className: 'nowrap', render: (o) => dmy(o.day) },
          { key: 't', label: 'Tổng cộng', align: 'right', render: (o) => money(o.net_total) },
          { key: 'p', label: 'Đã thu', align: 'right', render: (o) => (o.paid_net ? money(o.paid_net) : '') },
          { key: 'd', label: 'Còn nợ', align: 'right', render: (o) => (o.receivable > 0 ? <b className={o.overdue_days > 0 ? 'bad' : ''}>{money(o.receivable)}</b> : '') },
        ]} />
    </div>
  );
}

// ---------- Ghi phiếu thu theo đợt ----------
// Phiếu thu của khách: chỉ ghi số tiền theo ngày và trừ vào tổng công nợ của khách, không tự chia vào các đơn / hóa đơn
// (chia tự động khó theo dõi). Muốn trả cho một hóa đơn cụ thể thì bấm "Thu tiền" ngay ở hóa đơn đó.
export function ReceiptForm({ customer_id, round = 1, onClose }) {
  const funds = useFunds();
  const cq = useQ('customers', [['id', 'eq', customer_id]]);
  const { run, busy } = useAction();
  const [date, setDate] = useState(todayVN());
  const [amount, setAmount] = useState(null);
  const [method, setMethod] = useState('Chuyển khoản');
  const [fund, setFund] = useState('');
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState(`Thanh toán công nợ đợt ${round}`);
  const c = cq.data?.[0];
  // Quỹ theo hình thức thu: tiền mặt vào quỹ tiền mặt, còn lại vào tài khoản ngân hàng
  useEffect(() => {
    const list = funds.data || []; if (!list.length) return;
    const cash = list.find((x) => /mặt/i.test(x.name)); const bank = list.find((x) => !/mặt/i.test(x.name));
    setFund(((method === 'Tiền mặt' ? cash : bank) || list[0]).id);
  }, [funds.data, method]);
  const after = c ? (c.balance || 0) - (Number(amount) || 0) : 0;
  const submit = async () => {
    const r = await run('record_receipt', { customer_id, date, amount, fund_id: fund, method, ref_no: refNo, note }, (x) => `Đã ghi phiếu thu ${x.code}`);
    if (r) onClose();
  };
  return (
    <Modal title="Ghi phiếu thu" subtitle={c ? `${c.name} · ${c.code} · đang nợ ${money(c.receivable)} đ${c.prepaid > 0 ? ` · trả trước ${money(c.prepaid)} đ` : ''}` : ''} onClose={onClose}
      footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" icon="in" busy={busy} disabled={!(amount > 0) || !c} onClick={submit}>Lưu phiếu thu</Btn></>}>
      <div className="grid">
        <Field label="Ngày nhận tiền" required><DateInput value={date} onChange={(v) => setDate(v || todayVN())} max={todayVN()} /></Field>
        <Field label="Số tiền" required><NumInput value={amount} onChange={setAmount} placeholder="0" /></Field>
        <Field label="Hình thức"><Select value={method} onChange={setMethod} options={METHODS} /></Field>
        <Field label="Vào quỹ"><Select value={fund} onChange={setFund} options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Mã giao dịch" hint="Mã trên sao kê ngân hàng, nếu có"><Input value={refNo} onChange={setRefNo} /></Field>
        <Field label="Nội dung"><Input value={note} onChange={setNote} /></Field>
      </div>
      <Note>Phiếu ghi theo ngày nhận tiền và trừ vào tổng công nợ của khách, không chia vào hóa đơn nào. Muốn trả cho một hóa đơn cụ thể thì bấm <b>Thu tiền</b> ngay ở hóa đơn đó.</Note>
      {c && (
        <div className="card"><div className="totals">
          <span>Khách đang nợ</span><span className="r">{money(c.receivable)}</span>
          {c.prepaid > 0 && <><span>Khách đang trả trước</span><span className="r good">{money(c.prepaid)}</span></>}
          <span>Nhận lần này</span><span className="r">{money(Number(amount) || 0)}</span>
          <span className="strong">Khách còn nợ sau phiếu này</span><span className={`r strong ${after > 0 ? 'bad' : ''}`}>{money(Math.max(after, 0))}</span>
          {after < 0 && <><span>Khách trả trước sau phiếu này</span><span className="r good">{money(-after)}</span></>}
        </div></div>
      )}
    </Modal>
  );
}

// Khách kiêm nhà cung cấp: hiện phải trả NCC để bù trừ với phải thu khách
function DualDebt({ c }) {
  const s = useQ('suppliers', [['id', 'eq', c.supplier_id]]).data?.[0];
  if (!s) return '…';
  const net = (c.receivable || 0) - (c.prepaid || 0) - (s.payable || 0);
  return <span>{s.name}: mình nợ {money(s.payable || 0)} · <b>bù trừ: {net >= 0 ? `khách còn nợ ${money(net)}` : `mình còn nợ ${money(-net)}`}</b></span>;
}

function PointsCell({ c }) {
  const { can } = useApp();
  const { run } = useAction();
  const [n, setN] = useState(null);
  return (
    <span className="row gap-s" style={{ display: 'inline-flex' }}><b>{money(c.points || 0)} điểm</b>
      {can('owner') && <><span style={{ width: 110 }}><NumInput money={false} value={n} onChange={setN} placeholder="+/− điểm" aria-label="Điều chỉnh điểm" /></span>
        <Btn small disabled={!n} onClick={async () => { if (await run('adjust_points', { customer_id: c.id, points: n, note: 'Điều chỉnh tay' }, 'Đã điều chỉnh điểm')) setN(null); }}>Điều chỉnh</Btn></>}
    </span>
  );
}
