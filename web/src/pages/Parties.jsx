import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN, match, short } from '../lib/format.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, Icon, Pill, StatusPill, DELIVERY, PAYMENT, RECEIVE, Field, Input, TextArea, Select, DateInput, NumInput, Check, Search, Tabs, Loading, ErrorBox, Note, Table, Modal, KV, Section, ListPage, FilterBox, RadioList } from '../components/ui.jsx';

export function PartiesPage({ type }) {
  const { open, can, settings } = useApp();
  const isKh = type === 'kh';
  const [search, setSearch] = useState(''); const [only, setOnly] = useState(''); const [tier, setTier] = useState('');
  const q = useQ(isKh ? 'customers' : 'suppliers', [], 'name', 5000);
  const pn = settings.price_names || [];
  const all = q.data || [];
  const debtKey = isKh ? 'receivable' : 'payable';
  const rows = useMemo(() => all.filter((c) => match(`${c.code} ${c.name} ${c.phone || ''} ${c.address || ''}`, search) && (!tier || String(c.price_tier) === tier)
    && (!only || (only === 'debt' && c[debtKey] > 0) || (only === 'over' && c.overdue > 0) || (only === 'pre' && c.prepaid > 0))), [all, search, only, tier]);
  const tot = (k) => rows.reduce((s, c) => s + (c[k] || 0), 0);
  return (
    <ListPage title={isKh ? 'Khách hàng' : 'Nhà cung cấp / xưởng'}
      sub={isKh ? 'Công nợ = nợ đầu kỳ + hàng đã giao − hàng trả lại − tiền khách đã trả. Tiền cọc hiện ở cột “trả trước”.' : 'Công nợ = nợ đầu kỳ + hàng đã nhận + chi phí ghi nợ − hàng trả lại − tiền đã trả.'}
      filters={<>
        <FilterBox title="Công nợ"><RadioList value={only} onChange={setOnly} options={[{ value: '', label: 'Tất cả', count: all.length },
          { value: 'debt', label: 'Còn nợ', count: all.filter((c) => c[debtKey] > 0).length }, { value: 'over', label: 'Quá hạn', count: all.filter((c) => c.overdue > 0).length },
          { value: 'pre', label: 'Có trả trước', count: all.filter((c) => c.prepaid > 0).length }]} /></FilterBox>
        {isKh && pn.length > 0 && <FilterBox title="Mức giá"><RadioList value={tier} onChange={setTier} options={[{ value: '', label: 'Tất cả' }, ...pn.map((n, i) => ({ value: String(i + 1), label: n }))]} /></FilterBox>}
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm tên, mã, số điện thoại…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx(isKh ? 'cong-no-khach-hang.xlsx' : 'cong-no-ncc.xlsx', [{ name: isKh ? 'Khách hàng' : 'Nhà cung cấp', rows, columns: [
          { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên' }, { key: 'phone', label: 'Điện thoại' }, { key: 'address', label: 'Địa chỉ' },
          ...(isKh ? [{ key: 'price_tier', label: 'Mức giá', get: (c) => pn[c.price_tier - 1] }] : []), { key: 'credit_days', label: 'Số ngày được nợ' },
          { key: 'opening', label: 'Nợ đầu kỳ' }, { key: debtKey, label: isKh ? 'Còn phải thu' : 'Còn phải trả' }, { key: 'prepaid', label: 'Trả trước' }, { key: 'overdue', label: 'Quá hạn' }, { key: 'max_overdue_days', label: 'Số ngày quá hạn' }] }])}>Xuất Excel</Btn>
        {can('owner') && <Btn icon="up" onClick={() => open('import', { kind: type })}>Nhập từ Excel</Btn>}
        {can('danh_muc') && <Btn kind="primary" icon="plus" onClick={() => open('party', { type })}>{isKh ? 'Thêm khách hàng' : 'Thêm nhà cung cấp'}</Btn>}
      </>}>
      <div className="kpis kpis-3">
        <div className="kpi"><span className="kpi-label">{isKh ? 'Tổng khách còn nợ' : 'Tổng mình còn nợ'}</span><span className="kpi-value">{short(tot(debtKey))}</span></div>
        <div className={`kpi ${tot('overdue') > 0 ? 'alertk' : ''}`}><span className="kpi-label">Quá hạn</span><span className="kpi-value">{short(tot('overdue'))}</span></div>
        <div className="kpi"><span className="kpi-label">{isKh ? 'Khách đã trả trước / cọc' : 'Mình đã trả trước'}</span><span className="kpi-value">{short(tot('prepaid'))}</span></div>
      </div>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} onRow={(c) => open('party-detail', { type, id: c.id })} rowClass={(c) => (c.overdue > 0 ? 'row-late' : '')}
        foot={rows.length ? { n: `${rows.length} ${isKh ? 'khách' : 'nhà cung cấp'}`, d: money(tot(debtKey)), o: money(tot('overdue')), p: money(tot('prepaid')) } : null} columns={[
        { key: 'n', label: 'Tên', render: (c) => <><div className="cell-main">{c.name}</div><div className="cell-sub">{c.code}{c.phone ? ' · ' + c.phone : ''}</div></> },
        ...(isKh ? [{ key: 't', label: 'Mức giá', render: (c) => <Pill tone="neutral">{pn[c.price_tier - 1]}</Pill> }] : []),
        { key: 'cd', label: 'Được nợ', align: 'right', render: (c) => (c.credit_days ? c.credit_days + ' ngày' : '—') },
        { key: 'd', label: isKh ? 'Còn phải thu' : 'Còn phải trả', align: 'right', render: (c) => (c[debtKey] > 0 ? <b>{money(c[debtKey])}</b> : '—') },
        { key: 'o', label: 'Quá hạn', align: 'right', render: (c) => (c.overdue > 0 ? <span className="bad strong">{money(c.overdue)}<div className="cell-sub">{c.max_overdue_days} ngày</div></span> : '—') },
        { key: 'p', label: 'Trả trước', align: 'right', render: (c) => (c.prepaid > 0 ? <span className="good">{money(c.prepaid)}</span> : '—') },
        { key: 'x', label: isKh ? 'Đơn chờ giao' : 'Đơn chờ hàng', align: 'right', render: (c) => (isKh ? c.open_orders : c.open_pos) || '—' },
      ]} />
    </ListPage>
  );
}

export function PartyForm({ type, id, name, onClose, onSaved }) {
  const { settings, rpc } = useApp();
  const { run, busy } = useAction();
  const isKh = type === 'kh';
  const [f, setF] = useState({ code: '', name: name || '', phone: '', address: '', contact: '', kind: '', price_tier: 1, credit_days: 0, credit_limit: 0, note: '', active: true });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => { if (id) rpc('q', { view: isKh ? 'customers' : 'suppliers', filters: [['id', 'eq', id]] }).then(([c]) => setF((s) => ({ ...s, ...c }))); }, [id]);
  const pn = settings.price_names || [];
  return (
    <Modal title={id ? `Sửa ${f.name}` : isKh ? 'Thêm khách hàng' : 'Thêm nhà cung cấp'} onClose={onClose} size="md"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('save_party', { ...f, type, id: id || null, price_tier: Number(f.price_tier) }, (x) => 'Đã lưu ' + (x.code || f.name));
        if (r) { onSaved?.(r); onClose(); }
      }}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Tên" required wide><Input value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
        <Field label="Mã" hint={id ? '' : 'Để trống: tự cấp'}><Input value={f.code} onChange={(v) => set('code', v)} /></Field>
        <Field label="Điện thoại"><Input value={f.phone} onChange={(v) => set('phone', v)} inputMode="tel" /></Field>
        <Field label="Người liên hệ"><Input value={f.contact} onChange={(v) => set('contact', v)} /></Field>
        <Field label="Địa chỉ" wide><Input value={f.address} onChange={(v) => set('address', v)} /></Field>
        {isKh && <Field label="Mức giá áp dụng"><Select value={String(f.price_tier)} onChange={(v) => set('price_tier', Number(v))} options={pn.map((n, i) => ({ value: String(i + 1), label: n }))} /></Field>}
        {isKh && <Field label="Loại khách"><Input value={f.kind} onChange={(v) => set('kind', v)} placeholder="Đại lý, khách lẻ, công trình, CTV…" /></Field>}
        <Field label="Số ngày được nợ" hint="Hạn trả = ngày giao/nhận + số ngày này"><NumInput money={false} value={f.credit_days} onChange={(v) => set('credit_days', v || 0)} /></Field>
        {isKh && <Field label="Hạn mức nợ" hint="0 = không giới hạn"><NumInput value={f.credit_limit} onChange={(v) => set('credit_limit', v || 0)} /></Field>}
        <Field label="Ghi chú" wide><TextArea value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>
      {id && <Check checked={f.active} onChange={(v) => set('active', v)}>Đang giao dịch</Check>}
    </Modal>
  );
}

export function PartyDetail({ type, id, onClose }) {
  const { open, can, settings } = useApp();
  const isKh = type === 'kh';
  const q = useQ(isKh ? 'customers' : 'suppliers', [['id', 'eq', id]]);
  const orders = useQ(isKh ? 'sales_orders' : 'purchase_orders', [[isKh ? 'customer_id' : 'supplier_id', 'eq', id]], 'order_date desc', 500, isKh || can('nhap_hang'));
  const pays = useQ('payments', [['party_id', 'eq', id]], 'pay_date desc', 500, can('thu_chi'));
  const debts = useQ('opening_debts', [['party_id', 'eq', id]], 'debt_date');
  const [tab, setTab] = useState('orders');
  const [addDebt, setAddDebt] = useState(false);
  const c = q.data?.[0];
  if (!c) return <Modal title="Đối tượng" onClose={onClose}>{q.error ? <ErrorBox error={q.error} /> : <Loading />}</Modal>;
  const debtKey = isKh ? 'receivable' : 'payable';
  return (
    <Modal title={c.name} subtitle={`${c.code}${c.phone ? ' · ' + c.phone : ''}${c.address ? ' · ' + c.address : ''}`} onClose={onClose} size="xl"
      footer={<>
        {can('danh_muc') && <Btn icon="edit" onClick={() => open('party', { type, id })}>Sửa thông tin</Btn>}
        <span className="grow" />
        {isKh && can('ban_hang') && <Btn icon="cart" onClick={() => open('order-form', { customer_id: id })}>Tạo đơn</Btn>}
        {can('thu_chi') && (isKh
          ? <><Btn kind="soft" icon="in" onClick={() => open('payment', { kind: 'thu_khach', party_id: id })}>Thu tiền</Btn>{c.prepaid > 0 && <Btn icon="out" onClick={() => open('payment', { kind: 'hoan_khach', party_id: id })}>Hoàn tiền</Btn>}</>
          : <Btn kind="soft" icon="out" onClick={() => open('payment', { kind: 'tra_ncc', party_id: id })}>Trả tiền</Btn>)}
      </>}>
      <div className="kpis">
        <div className={`kpi ${c[debtKey] > 0 ? 'key' : ''}`}><span className="kpi-label">{isKh ? 'Khách còn nợ' : 'Mình còn nợ'}</span><span className="kpi-value">{money(c[debtKey])}</span></div>
        <div className={`kpi ${c.overdue > 0 ? 'alertk' : ''}`}><span className="kpi-label">Quá hạn</span><span className="kpi-value">{money(c.overdue)}</span><span className="kpi-sub">{c.max_overdue_days ? `lâu nhất ${c.max_overdue_days} ngày` : 'không có'}</span></div>
        <div className="kpi"><span className="kpi-label">{isKh ? 'Khách trả trước / cọc' : 'Đã trả trước'}</span><span className="kpi-value">{money(c.prepaid)}</span></div>
        <div className="kpi"><span className="kpi-label">{isKh ? 'Tổng đã mua' : 'Tổng đã nhận'}</span><span className="kpi-value">{short(isKh ? c.total_bought : c.received)}</span><span className="kpi-sub">{isKh ? `Mức giá: ${(settings.price_names || [])[c.price_tier - 1]}` : ''} · được nợ {c.credit_days} ngày</span></div>
      </div>
      <KV items={[['Số dư công nợ', `${money(c.opening)} (đầu kỳ) + ${money(c.delivered ?? c.received)} (${isKh ? 'đã giao' : 'đã nhận'}) − ${money(c.paid)} (đã trả) = ${money(c.balance)}`],
        c.credit_limit > 0 && ['Hạn mức nợ', money(c.credit_limit) + (c.receivable > c.credit_limit ? ' — ĐÃ VƯỢT' : '')], c.note && ['Ghi chú', c.note]]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'orders', label: isKh ? 'Đơn hàng' : 'Đơn nhập' }, ...(can('thu_chi') ? [{ value: 'pays', label: 'Thu / chi' }] : []), { value: 'debts', label: 'Nợ đầu kỳ' }]} />
      {tab === 'orders' && <Table dense rows={orders.data} onRow={(o) => open(isKh ? 'order' : 'po', { id: o.id })} rowClass={(o) => (o.overdue_days > 0 ? 'row-late' : '')} columns={[
        { key: 'c', label: 'Đơn', render: (o) => <><b>{o.code}</b><div className="cell-sub">{dmy(o.order_date)}</div></> },
        { key: 't', label: 'Tổng', align: 'right', render: (o) => money(o.order_total) },
        { key: 'p', label: 'Đã trả', align: 'right', render: (o) => money(o.paid_net) },
        { key: 'd', label: 'Còn nợ', align: 'right', render: (o) => { const v = isKh ? o.receivable : o.payable; return v > 0 ? <b className={o.overdue_days > 0 ? 'bad' : ''}>{money(v)}</b> : '—'; } },
        { key: 'h', label: 'Hạn trả', render: (o) => (o.pay_due_date ? dmy(o.pay_due_date) + (o.overdue_days > 0 ? ` (quá ${o.overdue_days} ngày)` : '') : '—') },
        { key: 's', label: 'Trạng thái', render: (o) => (isKh ? <div className="row gap-s"><StatusPill map={DELIVERY} value={o.delivery_status} /><StatusPill map={PAYMENT} value={o.payment_status} /></div> : <StatusPill map={RECEIVE} value={o.receive_status} />) },
      ]} />}
      {tab === 'pays' && <Table dense rows={pays.data} onRow={(p) => open('pay-detail', { id: p.id })} rowClass={(p) => (p.voided ? 'row-void' : '')} columns={[
        { key: 'c', label: 'Phiếu', render: (p) => <><b>{p.code}</b><div className="cell-sub">{dmy(p.pay_date)} · {p.fund_name}</div></> },
        { key: 'k', label: 'Loại', render: (p) => p.kind_label },
        { key: 'al', label: 'Gắn chứng từ', render: (p) => (p.allocations || []).map((a) => a.doc_code).join(', ') || <span className="muted">trả trước chung</span> },
        { key: 'a', label: 'Số tiền', align: 'right', render: (p) => money(p.amount) },
      ]} />}
      {tab === 'debts' && <div className="stack">
        <Table dense rows={debts.data} empty="Không có nợ đầu kỳ" columns={[
          { key: 'c', label: 'Mã', render: (d) => <><b>{d.code}</b><div className="cell-sub">{dmy(d.debt_date)}</div></> },
          { key: 'a', label: 'Số tiền', align: 'right', render: (d) => money(d.amount) },
          { key: 'p', label: 'Đã trả', align: 'right', render: (d) => money(d.paid_net) },
          { key: 'r', label: 'Còn lại', align: 'right', render: (d) => money(d.remaining) },
          { key: 'h', label: 'Hạn', render: (d) => (d.due_date ? dmy(d.due_date) : '—') + (d.overdue_days > 0 ? ` (quá ${d.overdue_days} ngày)` : '') },
          { key: 'n', label: 'Ghi chú', render: (d) => d.note },
        ]} />
        {can('owner') && (addDebt ? <OpeningDebtForm type={type} partyId={id} onDone={() => setAddDebt(false)} /> : <div><Btn small icon="plus" onClick={() => setAddDebt(true)}>Thêm nợ đầu kỳ</Btn></div>)}
      </div>}
    </Modal>
  );
}

function OpeningDebtForm({ type, partyId, onDone }) {
  const { run, busy } = useAction();
  const [amount, setAmount] = useState(null); const [date, setDate] = useState(todayVN()); const [due, setDue] = useState(''); const [note, setNote] = useState('');
  return (
    <div className="section">
      <Note>Chỉ dùng cho nợ phát sinh TRƯỚC khi bắt đầu dùng phần mềm. Số dương = {type === 'kh' ? 'khách còn nợ mình' : 'mình còn nợ NCC'}; số âm = đã trả trước.</Note>
      <div className="grid">
        <Field label="Số tiền"><NumInput value={amount} onChange={setAmount} /></Field>
        <Field label="Ngày ghi nợ"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        <Field label="Hạn trả"><DateInput value={due} onChange={setDue} /></Field>
        <Field label="Ghi chú"><Input value={note} onChange={setNote} /></Field>
      </div>
      <div className="row gap"><Btn kind="primary" busy={busy} onClick={async () => { if (await run('save_opening_debt', { party_type: type, party_id: partyId, amount, debt_date: date, due_date: due || null, note }, 'Đã ghi nợ đầu kỳ')) onDone(); }}>Lưu</Btn><Btn onClick={onDone}>Thôi</Btn></div>
    </div>
  );
}
