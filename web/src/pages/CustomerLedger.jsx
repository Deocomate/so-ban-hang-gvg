// Trang chi tiết khách hàng: Sổ công nợ (mọi giao dịch theo thứ tự thực tế) và Chi tiết đơn; phiếu thu theo đợt trừ nợ cho nhiều đơn.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useRpcData, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { TIME_PRESETS, presetRange } from '../components/DocFilters.jsx';
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
const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

// Hộp chi tiết khách hàng mở đè lên danh sách: số liệu công nợ, tab Sổ công nợ / Chi tiết đơn, nút Ghi phiếu thu luôn ở chân hộp
export function CustomerDetail({ id, onClose }) {
  const { open, can, settings } = useApp();
  const seeLedger = can('xem_thu_chi');
  const cq = useQ('customers', [['id', 'eq', id]]);
  const led = useRpcData('customer_ledger', { customer_id: id }, seeLedger);
  const [tab, setTab] = useState(seeLedger ? 'ledger' : 'orders');
  const c = cq.data?.[0];
  if (!c) return <Modal title="Khách hàng" onClose={onClose} size="xl">{cq.error ? <ErrorBox error={cq.error} /> : cq.data ? <Note tone="warn">Không tìm thấy khách hàng này</Note> : <Loading />}</Modal>;
  const L = led.data;
  const nPay = L ? L.rows.filter((r) => r.type === 'thu').length : 0;
  return (
    <Modal title={c.name} subtitle={[c.code, c.phone, c.address].filter(Boolean).join(' · ') + (c.credit_days ? ` · cho nợ ${c.credit_days} ngày` : '')} onClose={onClose} size="xl"
      footer={<>
        {can('danh_muc') && <Btn icon="edit" onClick={() => open('party', { type: 'kh', id })}>Sửa thông tin</Btn>}
        {can('ban_hang') && <Btn icon="cart" onClick={() => open('order-form', { customer_id: id })}>Tạo đơn</Btn>}
        <span className="grow" />
        {can('thu_chi') && <Btn kind="primary" icon="plus" onClick={() => open('receipt', { customer_id: id, round: nPay + 1 })}>Ghi phiếu thu</Btn>}
      </>}>
      <div className={`kpis ${c.prepaid > 0 ? 'kpis-4' : 'kpis-3'}`}>
        {L && <div className="kpi"><span className="kpi-label">Tiền hàng</span><span className="kpi-value">{money(L.total_billed)}</span></div>}
        {L && <div className="kpi"><span className="kpi-label">Tổng đã thu</span><span className="kpi-value">{money(L.total_paid)}</span></div>}
        <div className={`kpi ${c.overdue > 0 ? 'alertk' : c.receivable > 0 ? 'key' : ''}`}><span className="kpi-label">Khách còn nợ</span><span className="kpi-value">{money(c.receivable)}</span>
          {c.overdue > 0 && <span className="kpi-sub bad">Quá hạn {money(c.overdue)}, lâu nhất {c.max_overdue_days} ngày</span>}</div>
        {c.prepaid > 0 && <div className="kpi"><span className="kpi-label">Khách trả trước</span><span className="kpi-value good">{money(c.prepaid)}</span></div>}
      </div>
      {(settings.points_on || c.supplier_id) && <div className="row gap-l small">
        {settings.points_on && <span><span className="muted">Điểm tích lũy: </span><PointsCell c={c} /></span>}
        {c.supplier_id && <span><span className="muted">Đồng thời là nhà cung cấp — </span><DualDebt c={c} /></span>}
      </div>}
      <ErrorBox error={led.error} />
      <Tabs value={tab} onChange={setTab} tabs={[...(seeLedger ? [{ value: 'ledger', label: 'Sổ công nợ' }] : []), { value: 'orders', label: 'Chi tiết đơn' }]} />
      {tab === 'ledger' && <LedgerTab id={id} />}
      {tab === 'orders' && <OrdersTab id={id} usablePrepaid={L?.usable_prepaid || 0} />}
    </Modal>
  );
}

// Một dòng sổ: mã chứng từ, ngày; phiếu thu bấm để mở rộng xem trừ vào những đơn nào
function LedgerCell({ r, open: isOpen, onOrder, onPay }) {
  if (r.mark) return <b>{r.mark}{r.date ? ` (${dmy(r.date)})` : ''}</b>;
  const pay = r.type === 'thu' || r.type === 'hoan';
  return (
    <div>
      <div className="cell-main">
        {pay && <span className="muted" aria-hidden>{isOpen ? '▾ ' : '▸ '}</span>}
        <b className={pay ? 'accent' : ''}>{r.code}</b>{r.title && <span>{' · ' + r.title}</span>}
      </div>
      <div className="cell-sub">{dmy(r.date)}{pay && r.method ? ' · ' + r.method : ''}{!pay && r.note ? ' · ' + r.note : ''}</div>
      {pay && isOpen && (
        <div className="ledger-more small">
          {r.note && <div>{r.note}</div>}
          {r.ref_no && <div className="muted">Mã giao dịch: {r.ref_no}</div>}
          {r.allocs.map((a) => (
            <div key={a.doc_id}>{a.doc_type === 'don_ban' ? <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOrder(a.doc_id); }}>{a.code}</a> : a.code} · {money(a.amount)} đ</div>
          ))}
          {r.prepaid > 0 && <div className="good">Khách trả trước · {money(r.prepaid)} đ</div>}
          <button type="button" className="link-btn small" onClick={stop(onPay)}>Xem phiếu {r.code}</button>
        </div>
      )}
    </div>
  );
}

function LedgerTab({ id }) {
  const { open } = useApp();
  const [preset, setPreset] = useState('all'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [newest, setNewest] = useState(true);
  const [openKeys, setOpenKeys] = useState(() => new Set());
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
  const toggle = (k) => setOpenKeys((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const onRow = (r) => (r.payment_id ? toggle(r.key) : r.order_id ? open('order', { id: r.order_id }) : null);
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
        rowClass={(r) => (r.mark ? 'row-strong' : openKeys.has(r.key) ? 'row-top' : '')} onRow={onRow}
        foot={L && L.rows.length ? { d: `${L.rows.length} giao dịch`, n: money(sum('debt')), p: money(sum('paid')), b: <Balance v={L.closing} /> } : null}
        columns={[
          { key: 'd', label: 'Giao dịch', className: 'col-fill', render: (r) => <LedgerCell r={r} open={openKeys.has(r.key)} onOrder={(oid) => open('order', { id: oid })} onPay={() => open('pay-detail', { id: r.payment_id })} /> },
          { key: 'n', label: 'Phát sinh nợ', align: 'right', width: 140, render: (r) => (r.mark ? '' : r.debt ? <span className={r.debt < 0 ? 'good' : ''}>{money(r.debt)}</span> : '—') },
          { key: 'p', label: 'Đã thu', align: 'right', width: 140, render: (r) => (r.mark ? '' : r.paid ? <span className={r.paid < 0 ? 'bad' : ''}>{money(r.paid)}</span> : '—') },
          { key: 'b', label: 'Dư nợ', align: 'right', width: 140, render: (r) => <Balance v={r.balance} /> },
        ]} />
    </div>
  );
}

function OrdersTab({ id, usablePrepaid }) {
  const { open, can } = useApp();
  const { run, busy } = useAction();
  const [only, setOnly] = useState('');
  const q = useQ('sales_orders', [['customer_id', 'eq', id]], 'order_date desc', 5000);
  const all = q.data || [];
  const owing = all.filter((o) => o.receivable > 0);
  const rows = q.data ? (only === 'debt' ? owing : all) : null;
  const tot = (k) => (rows || []).reduce((s, o) => s + (o.status === 'huy' ? 0 : o[k] || 0), 0);
  return (
    <div className="stack">
      <div className="row gap">
        <div className="seg" role="group" aria-label="Lọc đơn">
          <button type="button" className={only ? '' : 'on'} onClick={() => setOnly('')}>Tất cả ({all.length})</button>
          <button type="button" className={only === 'debt' ? 'on' : ''} onClick={() => setOnly('debt')}>Còn nợ ({owing.length})</button>
        </div>
        <span className="grow" />
        {can('thu_chi') && usablePrepaid > 0 && owing.length > 0 && (
          <Btn kind="soft" busy={busy} onClick={() => run('apply_prepaid', { customer_id: id }, (r) => `Đã trừ ${money(r.used)} đ tiền khách trả trước vào ${r.docs.join(', ')}`)}>
            Trừ {money(usablePrepaid)} đ khách trả trước vào đơn còn nợ</Btn>)}
      </div>
      <ErrorBox error={q.error} />
      <Table rows={rows} onRow={(o) => open('order', { id: o.id })} rowClass={(o) => (o.status === 'huy' ? 'row-void' : o.overdue_days > 0 ? 'row-late' : '')}
        empty={only ? 'Không có đơn nào còn nợ' : 'Khách chưa có đơn nào'}
        foot={rows?.length ? { c: `${rows.length} đơn`, t: money(tot('net_total')), r: money(tot('delivered_value')), p: money(tot('paid_net')), d: money(tot('receivable')) } : null}
        columns={[
          { key: 'c', label: 'Mã đơn', width: 120, render: (o) => <b>{o.code}</b> },
          { key: 'dt', label: 'Ngày', width: 100, render: (o) => dmy(o.order_date) },
          { key: 't', label: 'Tổng tiền', align: 'right', width: 120, render: (o) => money(o.net_total) },
          { key: 'r', label: 'Phải thu', align: 'right', width: 116, render: (o) => (o.delivered_value > 0 ? money(o.delivered_value) : '—') },
          { key: 'p', label: 'Đã thu', align: 'right', width: 116, render: (o) => (o.paid_net ? money(o.paid_net) : '—') },
          { key: 'd', label: 'Còn nợ', align: 'right', width: 116, render: (o) => (o.receivable > 0 ? <b className={o.overdue_days > 0 ? 'bad' : ''}>{money(o.receivable)}</b> : '—') },
          { key: 'h', label: 'Hạn thanh toán', width: 124, render: (o) => (o.pay_due_date ? <>{dmy(o.pay_due_date)}{o.overdue_days > 0 && <div className="cell-sub bad">Quá hạn {o.overdue_days} ngày</div>}</> : '—') },
          { key: 'g', label: 'Giao hàng', width: 120, render: (o) => <StatusPill map={DELIVERY} value={o.delivery_status} /> },
          { key: 's', label: 'Thanh toán', width: 128, render: (o) => { const s = orderPayState(o); return s ? <Pill tone={s[1]}>{s[0]}</Pill> : '—'; } },
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
