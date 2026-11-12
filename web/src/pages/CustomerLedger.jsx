// Trang chi tiết khách hàng: Sổ công nợ (mọi giao dịch theo thứ tự thực tế) và Chi tiết đơn; phiếu thu theo đợt cấn cho nhiều đơn.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useRpcData, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { TIME_PRESETS, presetRange } from '../components/DocFilters.jsx';
import { Btn, Icon, Pill, StatusPill, DELIVERY, Field, Input, Select, DateInput, NumInput, Tabs, Loading, ErrorBox, Note, Table, Modal } from '../components/ui.jsx';

const TYPE_TONE = { ban_hang: 'info', tra_hang: 'warn', thu: 'good', hoan: 'warn', no_dau_ky: 'neutral' };
const METHODS = ['Chuyển khoản', 'Tiền mặt', 'Thẻ / POS', 'Bù trừ'];

// Trạng thái thanh toán của đơn so với số phải thu (hàng đã giao); đơn hủy / nháp: không có
export function orderPayState(o) {
  if (o.status === 'huy' || o.status === 'nhap') return null;
  if (o.delivered_value <= 0) return o.paid_net > 0 ? ['Đã cọc', 'info'] : null;
  if (o.paid_net <= 0) return ['Chưa thu', 'warn'];
  if (o.paid_net >= o.delivered_value) return ['Đã thu đủ', 'good'];
  return ['Đã thu một phần', 'info'];
}

const Balance = ({ v }) => (v < 0 ? <span className="good">{money(-v)}<div className="cell-sub">khách trả trước</div></span> : <b>{money(v)}</b>);

export function CustomerPage({ id, onBack }) {
  const { open, can } = useApp();
  const seeLedger = can('xem_thu_chi');
  const cq = useQ('customers', [['id', 'eq', id]]);
  const led = useRpcData('customer_ledger', { customer_id: id }, seeLedger);
  const [tab, setTab] = useState(seeLedger ? 'ledger' : 'orders');
  const c = cq.data?.[0];
  if (!c) return <div className="stack">{cq.error ? <ErrorBox error={cq.error} /> : cq.data ? <Note tone="warn">Không tìm thấy khách hàng</Note> : <Loading />}<div><Btn icon="back" onClick={onBack}>Danh sách khách hàng</Btn></div></div>;
  const L = led.data;
  const nPay = L ? L.rows.filter((r) => r.type === 'thu').length : 0;
  const receipt = () => open('receipt', { customer_id: id, round: nPay + 1 });
  return (
    <div className="stack">
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Quay lại danh sách khách hàng"><Icon name="back" /></button>
        <div className="grow">
          <h1 className="page-title">{c.name}</h1>
          <div className="page-sub">{[c.code, c.phone, c.address].filter(Boolean).join(' · ')}{c.credit_days ? ` · được nợ ${c.credit_days} ngày` : ''}</div>
        </div>
        {can('danh_muc') && <Btn icon="edit" onClick={() => open('party', { type: 'kh', id })}>Sửa thông tin</Btn>}
        {can('ban_hang') && <Btn icon="cart" onClick={() => open('order-form', { customer_id: id })}>Tạo đơn</Btn>}
        {can('thu_chi') && <Btn kind="primary" icon="plus" onClick={receipt}>Ghi phiếu thu</Btn>}
      </div>
      <div className={`kpis ${c.prepaid > 0 ? 'kpis-4' : 'kpis-3'}`}>
        {L && <div className="kpi"><span className="kpi-label">Tổng phải thu</span><span className="kpi-value">{money(L.total_billed)}</span></div>}
        {L && <div className="kpi"><span className="kpi-label">Tổng đã thu</span><span className="kpi-value">{money(L.total_paid)}</span></div>}
        <div className={`kpi ${c.overdue > 0 ? 'alertk' : c.receivable > 0 ? 'key' : ''}`}><span className="kpi-label">Khách còn nợ</span><span className="kpi-value">{money(c.receivable)}</span>
          {c.overdue > 0 && <span className="kpi-sub bad">quá hạn {money(c.overdue)} · lâu nhất {c.max_overdue_days} ngày</span>}</div>
        {c.prepaid > 0 && <div className="kpi"><span className="kpi-label">Tiền khách trả trước</span><span className="kpi-value good">{money(c.prepaid)}</span></div>}
      </div>
      <ErrorBox error={led.error} />
      <Tabs value={tab} onChange={setTab} tabs={[...(seeLedger ? [{ value: 'ledger', label: 'Sổ công nợ' }] : []), { value: 'orders', label: 'Chi tiết đơn' }]} />
      {tab === 'ledger' && <LedgerTab id={id} />}
      {tab === 'orders' && <OrdersTab id={id} usablePrepaid={L?.usable_prepaid || 0} />}
    </div>
  );
}

function LedgerTab({ id }) {
  const { open } = useApp();
  const [preset, setPreset] = useState('all'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [newest, setNewest] = useState(true);
  const [f, t] = preset === 'custom' ? [from || null, to || null] : presetRange(preset);
  const led = useRpcData('customer_ledger', { customer_id: id, from: f, to: t });
  const L = led.data;
  const filtered = !!(f || t);
  const rows = useMemo(() => {
    if (!L) return null;
    const list = [...L.rows];
    if (filtered) { list.unshift({ key: 'open', mark: 'Số dư đầu kỳ', date: f, balance: L.opening }); list.push({ key: 'close', mark: 'Số dư cuối kỳ', date: t, balance: L.closing }); }
    return newest ? list.reverse() : list;
  }, [L, newest, filtered]);
  const sum = (k) => (L ? L.rows.reduce((s, r) => s + r[k], 0) : 0);
  return (
    <div className="stack">
      <div className="row gap">
        <Select value={preset} onChange={(v) => setPreset(v || 'all')} options={[...TIME_PRESETS.filter((p) => p.value !== 'all'), { value: 'all', label: 'Toàn thời gian' }, { value: 'custom', label: 'Tùy chỉnh…' }]}
          aria-label="Khoảng thời gian" style={{ minWidth: 170 }} />
        {preset === 'custom' && <><DateInput value={from} onChange={(v) => setFrom(v || '')} placeholder="Từ ngày" aria-label="Từ ngày" /><DateInput value={to} onChange={(v) => setTo(v || '')} placeholder="Đến ngày" aria-label="Đến ngày" /></>}
        <span className="grow" />
        <div className="seg" role="group" aria-label="Thứ tự">
          <button type="button" className={newest ? 'on' : ''} onClick={() => setNewest(true)}>Mới nhất trước</button>
          <button type="button" className={newest ? '' : 'on'} onClick={() => setNewest(false)}>Cũ nhất trước</button>
        </div>
      </div>
      {filtered && L && <div className="small muted">Số dư đầu kỳ <b>{money(L.opening)}</b> · phát sinh tăng {money(sum('inc'))} · giảm {money(sum('dec'))} · số dư cuối kỳ <b>{money(L.closing)}</b></div>}
      <ErrorBox error={led.error} />
      <Table rows={rows} rowKey="key" empty={filtered ? 'Không có giao dịch trong khoảng này' : 'Khách chưa có giao dịch'}
        rowClass={(r) => (r.mark ? 'row-strong' : '')}
        onRow={(r) => (r.payment_id ? open('pay-detail', { id: r.payment_id }) : r.order_id ? open('order', { id: r.order_id }) : null)}
        foot={L && L.rows.length ? { dt: `${L.rows.length} giao dịch`, i: money(sum('inc')), x: money(sum('dec')), b: <Balance v={L.closing} /> } : null}
        columns={[
          { key: 'dt', label: 'Ngày', width: 104, render: (r) => (r.date ? dmy(r.date) : '—') },
          { key: 'd', label: 'Chứng từ và diễn giải', className: 'col-fill', render: (r) => (r.mark ? <b>{r.mark}</b> : <>
            <div className="cell-main row gap-s"><b>{r.code}</b><Pill tone={TYPE_TONE[r.type]}>{r.type_label}</Pill></div>
            {r.desc && <div className="cell-sub" title={r.desc}>{r.desc}</div>}</>) },
          { key: 'i', label: 'Tăng công nợ', align: 'right', width: 132, render: (r) => (r.inc ? money(r.inc) : r.mark ? '' : '—') },
          { key: 'x', label: 'Giảm công nợ', align: 'right', width: 132, render: (r) => (r.dec ? <span className="good">{money(r.dec)}</span> : r.mark ? '' : '—') },
          { key: 'b', label: 'Số dư sau giao dịch', align: 'right', width: 150, render: (r) => <Balance v={r.balance} /> },
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
          <Btn kind="soft" busy={busy} onClick={() => run('apply_prepaid', { customer_id: id }, (r) => `Đã cấn ${money(r.used)} tiền trả trước vào ${r.docs.join(', ')}`)}>
            Cấn {money(usablePrepaid)} tiền trả trước vào đơn còn nợ</Btn>)}
      </div>
      <ErrorBox error={q.error} />
      <Table rows={rows} onRow={(o) => open('order', { id: o.id })} rowClass={(o) => (o.status === 'huy' ? 'row-void' : o.overdue_days > 0 ? 'row-late' : '')}
        empty={only ? 'Không có đơn còn nợ' : 'Khách chưa có đơn'}
        foot={rows?.length ? { c: `${rows.length} đơn`, t: money(tot('net_total')), r: money(tot('delivered_value')), p: money(tot('paid_net')), d: money(tot('receivable')) } : null}
        columns={[
          { key: 'c', label: 'Mã đơn', width: 120, render: (o) => <b>{o.code}</b> },
          { key: 'dt', label: 'Ngày đơn', width: 100, render: (o) => dmy(o.order_date) },
          { key: 't', label: 'Tổng tiền đơn', align: 'right', width: 120, render: (o) => money(o.net_total) },
          { key: 'r', label: 'Phải thu', align: 'right', width: 116, render: (o) => (o.delivered_value > 0 ? money(o.delivered_value) : '—') },
          { key: 'p', label: 'Đã thanh toán', align: 'right', width: 120, render: (o) => (o.paid_net ? money(o.paid_net) : '—') },
          { key: 'd', label: 'Còn nợ', align: 'right', width: 116, render: (o) => (o.receivable > 0 ? <b className={o.overdue_days > 0 ? 'bad' : ''}>{money(o.receivable)}</b> : '—') },
          { key: 'h', label: 'Hạn trả', width: 116, render: (o) => (o.pay_due_date ? <>{dmy(o.pay_due_date)}{o.overdue_days > 0 && <div className="cell-sub bad">Quá hạn {o.overdue_days} ngày</div>}</> : '—') },
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
  // Quỹ theo hình thức thu: tiền mặt → quỹ tiền mặt, còn lại → tài khoản ngân hàng
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
    <Modal title="Ghi phiếu thu" subtitle={c ? `${c.name} · ${c.code} · đang nợ ${money(c.receivable)}${c.prepaid > 0 ? ` · trả trước ${money(c.prepaid)}` : ''}` : ''} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" icon="in" busy={busy} disabled={!!err || !(amount > 0) || !plan} onClick={submit}>Lưu phiếu thu</Btn></>}>
      <div className="grid">
        <Field label="Ngày nhận tiền" required><DateInput value={date} onChange={(v) => setDate(v || todayVN())} max={todayVN()} /></Field>
        <Field label="Số tiền nhận" required><NumInput value={amount} onChange={setAmount} placeholder="0" autoFocus /></Field>
        <Field label="Hình thức thu"><Select value={method} onChange={setMethod} options={METHODS} /></Field>
        <Field label="Vào quỹ"><Select value={fund} onChange={setFund} options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Mã giao dịch" hint="Nếu có, vd. mã chuyển khoản ngân hàng"><Input value={refNo} onChange={setRefNo} /></Field>
        <Field label="Nội dung thu"><Input value={note} onChange={setNote} /></Field>
      </div>
      <div className="row gap">
        <div className="seg" role="group" aria-label="Cách cấn đơn">
          <button type="button" className={mode === 'auto' ? 'on' : ''} onClick={() => setMode('auto')}>Cấn đơn cũ trước</button>
          <button type="button" className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>Chọn đơn thủ công</button>
        </div>
        <span className="muted small">{mode === 'auto' ? 'Cấn hết số nợ của đơn ghi nhận nợ sớm nhất rồi sang đơn tiếp theo.' : 'Nhập số tiền cấn cho từng đơn khách chỉ định.'}</span>
      </div>
      {!plan ? <Loading /> : docs.length === 0 ? <Note>Khách không còn đơn nào đang nợ. {amount > 0 ? 'Toàn bộ số tiền sẽ là tiền khách trả trước, dùng cấn cho đơn phát sinh sau.' : ''}</Note> : (
        <Table dense rows={shown} rowKey="doc_id" empty="Nhập số tiền nhận để xem đơn được cấn" columns={[
          { key: 'c', label: 'Đơn', render: (d) => <><b>{d.code}</b><div className="cell-sub">ghi nợ {dmy(d.debt_date)}{d.due_date ? ' · hạn ' + dmy(d.due_date) : ''}</div></> },
          { key: 'b', label: 'Còn nợ', align: 'right', render: (d) => money(d.before) },
          { key: 'a', label: 'Cấn lần này', align: 'right', render: (d) => (mode === 'manual'
            ? <div className="row gap-s" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                <NumInput value={manual[d.doc_id] ?? null} onChange={(v) => setManual((s) => ({ ...s, [d.doc_id]: v }))} style={{ maxWidth: 130 }} aria-label={`Cấn cho ${d.code}`} />
                <button type="button" className="link-btn small" onClick={() => setManual((s) => ({ ...s, [d.doc_id]: d.before }))}>Đủ</button></div>
            : <b>{money(d.amount)}</b>) },
          { key: 'r', label: 'Còn nợ sau khi cấn', align: 'right', render: (d) => (d.after > 0 ? money(d.after) : <Pill tone="good">Đã thu đủ</Pill>) },
        ]} />
      )}
      {plan && (
        <div className="card"><div className="totals">
          {prepaidUsed > 0 && <><span>Dùng tiền khách trả trước có sẵn<div className="cell-sub">cấn {[...new Set(plan.prepaid_use.map((u) => u.code))].join(', ')} trước khi cấn tiền nhận lần này</div></span><span className="r">{money(prepaidUsed)}</span></>}
          <span>Cấn vào đơn</span><span className="r">{money(plan.allocated)}</span>
          {plan.excess > 0 && <><span>Tiền khách trả trước (chưa cấn)</span><span className="r good strong">{money(plan.excess)}</span></>}
          <span className="strong">Tổng khách còn nợ sau khi thu</span><span className={`r strong ${plan.debt_after > 0 ? 'bad' : ''}`}>{money(plan.debt_after)}</span>
          {plan.prepaid_after > 0 && <><span>Tiền khách trả trước sau khi thu</span><span className="r good">{money(plan.prepaid_after)}</span></>}
        </div></div>
      )}
      {err && <Note tone="warn">{err}</Note>}
    </Modal>
  );
}
