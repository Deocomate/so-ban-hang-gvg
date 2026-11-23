// Trang chi tiết khách hàng: Sổ công nợ (mọi giao dịch theo thứ tự thực tế) và Chi tiết đơn; phiếu thu theo đợt trừ nợ cho nhiều đơn.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useRpcData, useAction } from '../lib/store.jsx';
import { money, dmy, dayTime, todayVN } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { TIME_PRESETS, presetRange } from '../components/DocFilters.jsx';
import { CustomerFiles } from './CustomerFiles.jsx';
import { DocsBoardMini } from './OrderDocs.jsx';
import { PaymentDetail } from './Cash.jsx';
import { OrderDetail } from './Sales.jsx';
import { Btn, Pill, StatusPill, DELIVERY, Field, Input, Select, DateInput, NumInput, Tabs, Loading, ErrorBox, Note, Table, Modal } from '../components/ui.jsx';

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
      {tab === 'orders' && <OrdersTab id={id} usablePrepaid={L?.usable_prepaid || 0} />}
      {tab === 'ledger' && <LedgerTab id={id} />}
      {tab === 'docs' && <DocsBoardMini params={{ customer_id: id }} showCustomer={false} />}
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
        expand={(r, close) => (r.payment_id ? <PaymentDetail id={r.payment_id} onClose={close} /> : r.order_id ? <OrderDetail id={r.order_id} onClose={close} /> : null)}
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

// Lịch sử bán / trả hàng (như KiotViet): hóa đơn và phiếu trả hàng của khách theo ngày bán / ngày trả, mới nhất trước.
// Đơn đã hủy không hiện.
// Bấm một dòng là chi tiết hóa đơn xổ ra ngay dưới dòng.
function OrdersTab({ id, usablePrepaid }) {
  const { can } = useApp();
  const { run, busy } = useAction();
  const [only, setOnly] = useState('');
  const q = useQ('sales_orders', [['customer_id', 'eq', id]], 'order_date desc', 5000);
  const rq = useQ('sales_returns', [['customer_id', 'eq', id]], 'return_date desc', 2000);
  const all = (q.data || []).filter((o) => o.status !== 'huy');
  const owing = all.filter((o) => o.receivable > 0);
  const rows = useMemo(() => {
    if (!q.data || !rq.data) return null;
    const sales = (only === 'debt' ? owing : all).map((o) => ({ ...o, key: o.id, type: 'ban', day: o.order_date, at: o.created_at, order_id: o.id }));
    const rets = only === 'debt' ? [] : rq.data.map((r) => ({ key: r.id, type: 'tra', code: r.code, day: r.return_date, at: r.created_at, order_id: r.order_id, order_code: r.order_code, revenue: r.revenue, status: 'xac_nhan' }));
    return [...sales, ...rets].sort((a, b) => String(b.day).localeCompare(String(a.day)) || String(b.at).localeCompare(String(a.at)));
  }, [q.data, rq.data, only]);
  const tot = (k) => (rows || []).reduce((s, o) => s + (o.type !== 'ban' ? 0 : o[k] || 0), 0);
  return (
    <div className="stack">
      <div className="row gap">
        <div className="seg" role="group" aria-label="Lọc đơn">
          <button type="button" className={only ? '' : 'on'} onClick={() => setOnly('')}>Tất cả ({all.length + (rq.data?.length || 0)})</button>
          <button type="button" className={only === 'debt' ? 'on' : ''} onClick={() => setOnly('debt')}>Còn nợ ({owing.length})</button>
        </div>
        <span className="grow" />
        {can('thu_chi') && usablePrepaid > 0 && owing.length > 0 && (
          <Btn kind="soft" busy={busy} onClick={() => run('apply_prepaid', { customer_id: id }, (r) => `Đã trừ ${money(r.used)} đ tiền khách trả trước vào ${r.docs.join(', ')}`)}>
            Trừ {money(usablePrepaid)} đ khách trả trước vào đơn còn nợ</Btn>)}
      </div>
      <ErrorBox error={q.error || rq.error} />
      <Table rows={rows} rowKey="key" expand={(o, close) => <OrderDetail id={o.order_id} onClose={close} />}
        rowClass={(o) => (o.overdue_days > 0 ? 'row-late' : '')}
        empty={only ? 'Không có đơn nào còn nợ' : 'Khách chưa mua hàng'}
        foot={rows?.length ? { c: `${rows.length} chứng từ`, t: money(tot('net_total')), p: money(tot('paid_net')), d: money(tot('receivable')) } : null}
        columns={[
          { key: 'c', label: 'Mã chứng từ', render: (o) => <><b>{o.code}</b>{o.type === 'tra' && <span className="muted small"> · trả từ {o.order_code}</span>}</> },
          { key: 'dt', label: 'Thời gian', className: 'nowrap', render: (o) => dayTime(o.day, o.at) },
          { key: 'k', label: 'Loại', render: (o) => (o.type === 'tra' ? <Pill tone="warn">Trả hàng</Pill> : o.kind === 'dat_hang' ? 'Đặt hàng' : 'Hóa đơn') },
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

// ---------- Ghi phiếu thu theo đợt ----------
export function ReceiptForm({ customer_id, round = 1, onClose }) {
  const { rpc } = useApp();
  const funds = useFunds();
  const cq = useQ('customers', [['id', 'eq', customer_id]]);
  const { run, busy } = useAction();
  const [date, setDate] = useState(todayVN());
  const [amount, setAmount] = useState(null);
  const [method, setMethod] = useState('Chuyển khoản');
  const [fund, setFund] = useState('');
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState(`Thanh toán công nợ đợt ${round}`);
  const [mode, setMode] = useState('auto');
  const [manual, setManual] = useState({});
  const [plan, setPlan] = useState(null); const [planErr, setPlanErr] = useState(null);
  const c = cq.data?.[0];
  // Quỹ theo hình thức thu: tiền mặt vào quỹ tiền mặt, còn lại vào tài khoản ngân hàng
  useEffect(() => {
    const list = funds.data || []; if (!list.length) return;
    const cash = list.find((x) => /mặt/i.test(x.name)); const bank = list.find((x) => !/mặt/i.test(x.name));
    setFund(((method === 'Tiền mặt' ? cash : bank) || list[0]).id);
  }, [funds.data, method]);
  const manualList = Object.entries(manual).filter(([, v]) => Number(v) > 0).map(([doc_id, v]) => ({ doc_id, amount: Number(v) }));
  const planKey = JSON.stringify([amount, mode, manualList]);
  useEffect(() => {
    let alive = true;
    const h = setTimeout(() => rpc('preview_receipt', { customer_id, amount: amount || 0, mode, allocations: manualList })
      .then((r) => { if (alive) { setPlan(r); setPlanErr(null); } }).catch((e) => alive && setPlanErr(e.message)), 200);
    return () => { alive = false; clearTimeout(h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);
  const docs = plan?.docs || [];
  const shown = mode === 'auto' ? docs.filter((d) => d.amount > 0) : docs;
  const prepaidUsed = (plan?.prepaid_use || []).reduce((s, u) => s + u.amount, 0);
  const err = planErr || plan?.error;
  const submit = async () => {
    const r = await run('record_receipt', { customer_id, date, amount, fund_id: fund, method, ref_no: refNo, note, mode,
      allocations: mode === 'manual' ? manualList : [], expect: plan?.allocations }, (x) => `Đã ghi phiếu thu ${x.code}`);
    if (r) onClose();
  };
  return (
    <Modal title="Ghi phiếu thu" subtitle={c ? `${c.name} · ${c.code} · đang nợ ${money(c.receivable)} đ${c.prepaid > 0 ? ` · trả trước ${money(c.prepaid)} đ` : ''}` : ''} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" icon="in" busy={busy} disabled={!!err || !(amount > 0) || !plan} onClick={submit}>Lưu phiếu thu</Btn></>}>
      <div className="grid">
        <Field label="Ngày nhận tiền" required><DateInput value={date} onChange={(v) => setDate(v || todayVN())} max={todayVN()} /></Field>
        <Field label="Số tiền" required><NumInput value={amount} onChange={setAmount} placeholder="0" /></Field>
        <Field label="Hình thức"><Select value={method} onChange={setMethod} options={METHODS} /></Field>
        <Field label="Vào quỹ"><Select value={fund} onChange={setFund} options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Mã giao dịch" hint="Mã trên sao kê ngân hàng, nếu có"><Input value={refNo} onChange={setRefNo} /></Field>
        <Field label="Nội dung"><Input value={note} onChange={setNote} /></Field>
      </div>
      <div className="row gap">
        <div className="seg" role="group" aria-label="Cách trừ nợ">
          <button type="button" className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}>Trừ đơn cũ trước</button>
          <button type="button" className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>Tự chọn đơn</button>
        </div>
        <span className="muted small">{mode === 'auto' ? 'Trả hết đơn cũ nhất rồi mới sang đơn tiếp theo.' : 'Nhập số tiền trả cho từng đơn theo ý khách.'}</span>
      </div>
      {!plan ? <Loading /> : docs.length === 0 ? <Note>Khách không còn đơn nào đang nợ.{amount > 0 ? ' Số tiền này sẽ ghi là khách trả trước và được trừ vào các đơn sau.' : ''}</Note> : (
        <Table dense rows={shown} rowKey="doc_id" empty="Nhập số tiền để xem tiền được trừ vào những đơn nào" columns={[
          { key: 'c', label: 'Đơn', render: (d) => <><b>{d.code}</b><div className="cell-sub">{dmy(d.debt_date)}{d.due_date ? ' · hạn ' + dmy(d.due_date) : ''}</div></> },
          { key: 'b', label: 'Đang nợ', align: 'right', render: (d) => money(d.before) },
          { key: 'a', label: 'Trả lần này', align: 'right', render: (d) => (mode === 'manual'
            ? <div className="row gap-s" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                <NumInput value={manual[d.doc_id] ?? null} onChange={(v) => setManual((s) => ({ ...s, [d.doc_id]: v }))} style={{ maxWidth: 130 }} aria-label={`Số tiền trả cho ${d.code}`} />
                <button type="button" className="link-btn small" onClick={() => setManual((s) => ({ ...s, [d.doc_id]: d.before }))}>Trả hết</button></div>
            : <b>{money(d.amount)}</b>) },
          { key: 'r', label: 'Còn nợ', align: 'right', render: (d) => (d.after > 0 ? money(d.after) : <Pill tone="good">Đã thu đủ</Pill>) },
        ]} />
      )}
      {plan && (
        <div className="card"><div className="totals">
          {prepaidUsed > 0 && <><span>Trừ tiền khách trả trước còn dư<div className="cell-sub">vào {[...new Set(plan.prepaid_use.map((u) => u.code))].join(', ')}</div></span><span className="r">{money(prepaidUsed)}</span></>}
          <span>Trừ vào đơn</span><span className="r">{money(plan.allocated)}</span>
          {plan.excess > 0 && <><span>Tiền thừa, ghi là khách trả trước</span><span className="r good strong">{money(plan.excess)}</span></>}
          <span className="strong">Khách còn nợ sau phiếu này</span><span className={`r strong ${plan.debt_after > 0 ? 'bad' : ''}`}>{money(plan.debt_after)}</span>
          {plan.prepaid_after > 0 && <><span>Khách trả trước sau phiếu này</span><span className="r good">{money(plan.prepaid_after)}</span></>}
        </div></div>
      )}
      {err && <Note tone="warn">{err}</Note>}
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
