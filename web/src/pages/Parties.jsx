import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN, addDays, match, short } from '../lib/format.js';
import { TimeFilter, useTimeFilter } from '../components/DocFilters.jsx';
import { CustomerPage } from './CustomerLedger.jsx';
import { exportXlsx } from '../lib/excel.js';
import { CustomerFields } from './CustomerFields.jsx';
import { Btn, Icon, Pill, StatusPill, DELIVERY, PAYMENT, RECEIVE, Field, Input, TextArea, Select, DateInput, NumInput, Check, Search, Tabs, Loading, ErrorBox, Note, Table, Modal, KV, Section, ListPage, FilterBox, RadioList } from '../components/ui.jsx';

// Mốc "quá hạn bao lâu" (theo khoản quá hạn lâu nhất), giống cách KiotViet chia tuổi nợ
const OVERDUE_BANDS = [
  { value: '1-30', label: '1 – 30 ngày', min: 1, max: 30 }, { value: '31-90', label: '31 – 90 ngày', min: 31, max: 90 },
  { value: '91-180', label: '91 – 180 ngày', min: 91, max: 180 }, { value: '181-365', label: '181 – 365 ngày', min: 181, max: 365 },
  { value: '365+', label: 'Trên 1 năm', min: 366, max: Infinity },
];
const inNum = (v, [lo, hi]) => (lo === null || lo === undefined || v >= lo) && (hi === null || hi === undefined || v <= hi);
const isActive = (c) => c.active !== false && c.active !== 0;

// Ô lọc "từ – đến" cho một số tiền
function RangeBox({ title, value, onChange }) {
  return (
    <FilterBox title={title}>
      <div className="tf-range">
        <NumInput value={value[0]} onChange={(v) => onChange([v, value[1]])} placeholder="Từ" aria-label={`${title} từ`} />
        <NumInput value={value[1]} onChange={(v) => onChange([value[0], v])} placeholder="Đến" aria-label={`${title} đến`} />
      </div>
    </FilterBox>
  );
}

// Khách hàng: bấm một khách mở trang chi tiết #khach-hang/<id> (nút quay lại của trình duyệt về danh sách)
export const openCustomer = (id) => { location.hash = '#khach-hang/' + id; };

export function PartiesPage({ type, sub }) {
  const { open, can, settings } = useApp();
  const isKh = type === 'kh';
  const [search, setSearch] = useState(''); const [only, setOnly] = useState(''); const [tier, setTier] = useState(''); const [grp, setGrp] = useState('');
  const [status, setStatus] = useState('on');
  const [od, setOd] = useState(''); const [odFrom, setOdFrom] = useState(''); const [odTo, setOdTo] = useState('');
  const [debtR, setDebtR] = useState([null, null]); const [soldR, setSoldR] = useState([null, null]);
  const lastTx = useTimeFilter('all'); const created = useTimeFilter('all');
  const q = useQ(isKh ? 'customers' : 'suppliers', [], 'name', 5000);
  const pn = settings.price_names || [];
  const all = q.data || [];
  const debtKey = isKh ? 'receivable' : 'payable';
  const soldKey = isKh ? 'total_bought' : 'received';
  const today = todayVN();
  // Ngày bắt đầu quá hạn của khoản nợ quá hạn lâu nhất (= hạn trả của khoản đó)
  const overdueSince = (c) => (c.overdue > 0 ? addDays(today, -c.max_overdue_days) : null);
  const passOd = (c) => {
    if (!od) return true;
    if (!(c.overdue > 0)) return false;
    if (od === 'custom') { const d = overdueSince(c); return (!odFrom || d >= odFrom) && (!odTo || d <= odTo); }
    const b = OVERDUE_BANDS.find((x) => x.value === od);
    return c.max_overdue_days >= b.min && c.max_overdue_days <= b.max;
  };
  // Mọi bộ lọc trừ "Công nợ", để số đếm cạnh từng lựa chọn công nợ khớp với danh sách đang xem
  const base = useMemo(() => all.filter((c) => match(`${c.code} ${c.name} ${c.phone || ''} ${c.address || ''}`, search)
    && (status === 'all' || (status === 'on') === isActive(c))
    && (!tier || String(c.price_tier) === tier) && (!grp || (grp === '-' ? !c.kind : c.kind === grp))
    && passOd(c) && inNum(c[debtKey] || 0, debtR) && inNum(c[soldKey] || 0, soldR)
    && lastTx.inRange(c.last_order_date) && created.inRange(c.created_at)),
  [all, search, status, tier, grp, od, odFrom, odTo, debtR, soldR, lastTx.from, lastTx.to, created.from, created.to]);
  const debtTest = { debt: (c) => c[debtKey] > 0, over: (c) => c.overdue > 0, pre: (c) => c.prepaid > 0 };
  const rows = useMemo(() => {
    const r = only ? base.filter(debtTest[only]) : base;
    return only === 'over' || od ? [...r].sort((a, b) => b.max_overdue_days - a.max_overdue_days || b.overdue - a.overdue) : r;
  }, [base, only, od]);
  const groups = isKh ? [...new Set([...(settings.customer_groups || []), ...all.map((c) => c.kind).filter(Boolean)])] : [];
  const tot = (k) => rows.reduce((s, c) => s + (c[k] || 0), 0);
  const nOver = rows.filter((c) => c.overdue > 0).length;
  const allTime = { mode: 'preset', preset: 'all', from: '', to: '' };
  const clearAll = () => { setOnly(''); setTier(''); setGrp(''); setStatus('on'); setOd(''); setOdFrom(''); setOdTo(''); setDebtR([null, null]); setSoldR([null, null]); lastTx.setTime(allTime); created.setTime(allTime); };
  const filtered = only || tier || grp || status !== 'on' || od || [...debtR, ...soldR].some((v) => v !== null && v !== undefined) || lastTx.from || lastTx.to || created.from || created.to;
  const who = isKh ? 'khách' : 'nhà cung cấp';
  if (isKh && sub) return <CustomerPage id={sub} onBack={() => { location.hash = '#khach-hang'; }} />;
  return (
    <ListPage title={isKh ? 'Khách hàng' : 'Nhà cung cấp / xưởng'}
      filters={<>
        <FilterBox title="Công nợ"><RadioList value={only} onChange={setOnly} options={[{ value: '', label: 'Tất cả', count: base.length },
          { value: 'debt', label: 'Còn nợ', count: base.filter(debtTest.debt).length }, { value: 'over', label: 'Quá hạn', count: base.filter(debtTest.over).length },
          { value: 'pre', label: 'Có trả trước', count: base.filter(debtTest.pre).length }]} /></FilterBox>
        <FilterBox title="Thời gian quá hạn">
          <RadioList value={od} onChange={setOd} options={[{ value: '', label: 'Tất cả' },
            ...OVERDUE_BANDS.map((b) => ({ value: b.value, label: b.label, count: all.filter((c) => c.overdue > 0 && c.max_overdue_days >= b.min && c.max_overdue_days <= b.max).length })),
            { value: 'custom', label: 'Chọn khoảng hạn thanh toán' }]} />
          {od === 'custom' && <div className="tf-range">
            <DateInput value={odFrom} onChange={(v) => setOdFrom(v || '')} max={today} placeholder="Từ ngày" aria-label="Hạn thanh toán từ ngày" />
            <DateInput value={odTo} onChange={(v) => setOdTo(v || '')} max={today} placeholder="Đến ngày" aria-label="Hạn thanh toán đến ngày" />
          </div>}
        </FilterBox>
        <RangeBox title={isKh ? 'Nợ hiện tại' : 'Mình còn nợ'} value={debtR} onChange={setDebtR} />
        {isKh && groups.length > 0 && <FilterBox title="Nhóm khách"><RadioList value={grp} onChange={setGrp} options={[{ value: '', label: 'Tất cả' },
          ...groups.map((g) => ({ value: g, label: g, count: all.filter((c) => c.kind === g).length })), { value: '-', label: 'Chưa có nhóm', count: all.filter((c) => !c.kind).length }]} /></FilterBox>}
        <TimeFilter filter={lastTx} title={isKh ? 'Lần mua gần nhất' : 'Lần nhập gần nhất'} />
        <RangeBox title={isKh ? 'Tổng bán' : 'Tổng nhận'} value={soldR} onChange={setSoldR} />
        {isKh && pn.length > 0 && <FilterBox title="Mức giá"><RadioList value={tier} onChange={setTier} options={[{ value: '', label: 'Tất cả' }, ...pn.map((n, i) => ({ value: String(i + 1), label: n }))]} /></FilterBox>}
        <TimeFilter filter={created} title="Ngày tạo" />
        <FilterBox title="Trạng thái"><RadioList value={status} onChange={setStatus} options={[{ value: 'on', label: 'Đang giao dịch', count: all.filter(isActive).length },
          { value: 'off', label: 'Ngừng giao dịch', count: all.filter((c) => !isActive(c)).length }, { value: 'all', label: 'Tất cả' }]} /></FilterBox>
        {filtered && <button type="button" className="link-btn small" onClick={clearAll}>Xóa bộ lọc</button>}
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm tên, mã, số điện thoại…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx(isKh ? 'cong-no-khach-hang.xlsx' : 'cong-no-ncc.xlsx', [{ name: isKh ? 'Khách hàng' : 'Nhà cung cấp', rows, columns: [
          { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên' }, { key: 'phone', label: 'Điện thoại' }, { key: 'address', label: 'Địa chỉ' }, { key: 'contact', label: 'Người liên hệ' },
          ...(isKh ? [{ key: 'kind', label: 'Loại khách' }, { key: 'price_tier', label: 'Mức giá', get: (c) => pn[c.price_tier - 1] }] : []), { key: 'credit_days', label: 'Số ngày được nợ' },
          ...(isKh ? [{ key: 'credit_limit', label: 'Hạn mức nợ' }] : []), { key: 'note', label: 'Ghi chú' },
          { key: 'opening', label: 'Nợ đầu kỳ' }, { key: debtKey, label: isKh ? 'Còn phải thu' : 'Còn phải trả' }, { key: 'prepaid', label: 'Trả trước' }, { key: 'overdue', label: 'Quá hạn' }, { key: 'max_overdue_days', label: 'Số ngày quá hạn' },
          { key: 'overdue_since', label: 'Quá hạn từ ngày', get: (c) => (overdueSince(c) ? dmy(overdueSince(c)) : '') },
          { key: soldKey, label: isKh ? 'Tổng bán' : 'Tổng nhận' }, { key: 'last_order_date', label: isKh ? 'Lần mua gần nhất' : 'Lần nhập gần nhất', get: (c) => (c.last_order_date ? dmy(c.last_order_date) : '') }] }])}>Xuất Excel</Btn>
        {can('owner') && <Btn icon="up" onClick={() => open('import', { kind: type })}>Nhập từ Excel</Btn>}
        {can('danh_muc') && <Btn kind="primary" icon="plus" onClick={() => open('party', { type })}>{isKh ? 'Thêm khách hàng' : 'Thêm nhà cung cấp'}</Btn>}
      </>}>
      <div className="kpis kpis-3">
        <div className="kpi"><span className="kpi-label">{isKh ? 'Tổng khách còn nợ' : 'Tổng mình còn nợ'}</span><span className="kpi-value">{short(tot(debtKey))}</span></div>
        <div className={`kpi ${tot('overdue') > 0 ? 'alertk' : ''}`}><span className="kpi-label">Quá hạn</span><span className="kpi-value">{short(tot('overdue'))}</span>
          <span className="kpi-sub">{nOver ? `${money(nOver)} ${who}` : 'không có'}</span></div>
        <div className="kpi"><span className="kpi-label">{isKh ? 'Khách đã trả trước / cọc' : 'Mình đã trả trước'}</span><span className="kpi-value">{short(tot('prepaid'))}</span></div>
      </div>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} onRow={(c) => (isKh ? openCustomer(c.id) : open('party-detail', { type, id: c.id }))} rowClass={(c) => (c.overdue > 0 ? 'row-late' : '')}
        empty={all.length ? `Không có ${who} nào khớp bộ lọc` : `Chưa có ${who} nào`}
        foot={rows.length ? { n: `${money(rows.length)} ${who}`, d: money(tot(debtKey)), o: money(tot('overdue')), p: money(tot('prepaid')), s: money(tot(soldKey)) } : null} columns={[
        { key: 'c', label: isKh ? 'Mã KH' : 'Mã NCC', width: 100, render: (c) => c.code },
        { key: 'n', label: isKh ? 'Tên khách hàng' : 'Tên nhà cung cấp', className: 'col-fill', render: (c) => <><div className="cell-main" title={c.name}>{c.name}</div>{(c.kind || c.address) && <div className="cell-sub" title={c.address || ''}>{[c.kind, c.address].filter(Boolean).join(' · ')}</div>}</> },
        { key: 'ph', label: 'Điện thoại', width: 116, className: 'col-clip', render: (c) => <span title={c.phone || ''}>{c.phone || '—'}</span> },
        { key: 'd', label: isKh ? 'Nợ hiện tại' : 'Còn phải trả', align: 'right', width: 124, render: (c) => (c[debtKey] > 0 ? <b>{money(c[debtKey])}</b> : '—') },
        { key: 'o', label: 'Quá hạn', align: 'right', width: 124, render: (c) => (c.overdue > 0 ? <span className="bad strong">{money(c.overdue)}</span> : '—') },
        { key: 'od', label: 'Số ngày quá hạn', align: 'right', width: 92, render: (c) => (c.overdue > 0 ? <span className="bad" title={`Quá hạn từ ${dmy(overdueSince(c))}`}>{money(c.max_overdue_days)}</span> : '—') },
        { key: 'p', label: 'Trả trước', align: 'right', width: 108, render: (c) => (c.prepaid > 0 ? <span className="good">{money(c.prepaid)}</span> : '—') },
        { key: 's', label: isKh ? 'Tổng bán' : 'Tổng nhận', align: 'right', width: 128, render: (c) => (c[soldKey] > 0 ? money(c[soldKey]) : '—') },
        { key: 'l', label: isKh ? 'Mua gần nhất' : 'Nhập gần nhất', align: 'center', width: 104, render: (c) => (c.last_order_date ? dmy(c.last_order_date) : '—') },
      ]} />
    </ListPage>
  );
}

export function PartyForm({ type, id, name, onClose, onSaved }) {
  const { settings, rpc } = useApp();
  const { run, busy } = useAction();
  const isKh = type === 'kh';
  const [f, setF] = useState({ code: '', name: name || '', phone: '', address: '', contact: '', kind: '', price_tier: 1, credit_days: 0, credit_limit: 0, note: '', active: true, stage: 'moi', extra: {} });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => { if (id) rpc('q', { view: isKh ? 'customers' : 'suppliers', filters: [['id', 'eq', id]] }).then(([c]) => setF((s) => ({ ...s, ...c }))); }, [id]);
  return (
    <Modal title={id ? `Sửa ${f.name}` : isKh ? 'Thêm khách hàng' : 'Thêm nhà cung cấp'} onClose={onClose} size={isKh ? 'xl' : 'md'}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('save_party', { ...f, type, id: id || null, price_tier: Number(f.price_tier) }, (x) => 'Đã lưu ' + (x.code || f.name));
        if (r) { onSaved?.(r); onClose(); }
      }}>Lưu</Btn></>}>
      {isKh ? <CustomerFields f={f} set={set} id={id} /> : <div className="grid">
        <Field label="Tên" required wide><Input value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
        <Field label="Mã" hint={id ? '' : 'Để trống: tự cấp'}><Input value={f.code} onChange={(v) => set('code', v)} /></Field>
        <Field label="Điện thoại"><Input value={f.phone} onChange={(v) => set('phone', v)} inputMode="tel" /></Field>
        <Field label="Người liên hệ"><Input value={f.contact} onChange={(v) => set('contact', v)} /></Field>
        <Field label="Địa chỉ" wide><Input value={f.address} onChange={(v) => set('address', v)} /></Field>
        <Field label="Số ngày được nợ" hint="Hạn trả = ngày giao/nhận + số ngày này"><NumInput money={false} min={0} suffix="ngày" value={f.credit_days} onChange={(v) => set('credit_days', v || 0)} /></Field>
        <Field label="Ghi chú" wide><TextArea value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>}
      {id && <Check checked={f.active} onChange={(v) => set('active', v)}>Đang giao dịch</Check>}
    </Modal>
  );
}

export function PartyDetail({ type, id, onClose }) {
  const { open, can, settings, closeAll } = useApp();
  const isKh = type === 'kh';
  // Khách hàng có trang riêng (sổ công nợ + chi tiết đơn); hộp thoại này còn dùng cho nhà cung cấp
  useEffect(() => { if (isKh) { closeAll(); openCustomer(id); } }, [isKh, id]);
  const q = useQ(isKh ? 'customers' : 'suppliers', [['id', 'eq', id]]);
  const orders = useQ(isKh ? 'sales_orders' : 'purchase_orders', [[isKh ? 'customer_id' : 'supplier_id', 'eq', id]], 'order_date desc', 500, can(isKh ? 'xem_ban_hang' : 'xem_nhap_hang'));
  const pays = useQ('payments', [['party_id', 'eq', id]], 'pay_date desc', 500, can('xem_thu_chi'));
  const debts = useQ('opening_debts', [['party_id', 'eq', id]], 'debt_date');
  const [tab, setTab] = useState('orders');
  const [addDebt, setAddDebt] = useState(false);
  const c = q.data?.[0];
  if (isKh) return null;
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
        { key: 'h', label: 'Hạn thanh toán', render: (o) => (o.pay_due_date ? dmy(o.pay_due_date) + (o.overdue_days > 0 ? ` (quá hạn ${o.overdue_days} ngày)` : '') : '—') },
        { key: 's', label: 'Trạng thái', render: (o) => (isKh ? <div className="row gap-s"><StatusPill map={DELIVERY} value={o.delivery_status} /><StatusPill map={PAYMENT} value={o.payment_status} /></div> : <StatusPill map={RECEIVE} value={o.receive_status} />) },
      ]} />}
      {tab === 'pays' && <Table dense rows={pays.data} onRow={(p) => open('pay-detail', { id: p.id })} rowClass={(p) => (p.voided ? 'row-void' : '')} columns={[
        { key: 'c', label: 'Phiếu', render: (p) => <><b>{p.code}</b><div className="cell-sub">{dmy(p.pay_date)} · {p.fund_name}</div></> },
        { key: 'k', label: 'Loại', render: (p) => p.kind_label },
        { key: 'al', label: 'Trả cho', render: (p) => (p.allocations || []).map((a) => a.doc_code).join(', ') || <span className="muted">trả trước</span> },
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
