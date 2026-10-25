import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN, match, short } from '../lib/format.js';
import { useCustomers, useSuppliers, useFunds } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { PeriodPicker, usePeriod } from '../components/Period.jsx';
import { cats, groupOf, GROUP_HINT, GROUP_COLORS } from '../lib/expenseCats.js';
import {
  Btn, Icon, Pill, Field, Input, TextArea, Select, DateInput, NumInput, Check, Tabs, Search, Loading, ErrorBox, Note, Table, Modal, ConfirmBtn, Picker, KV, Section,
} from '../components/ui.jsx';

export const PAY_KINDS = [
  { value: 'thu_khach', label: 'Thu tiền khách hàng', dir: 'thu', party: 'kh' },
  { value: 'ncc_hoan', label: 'Nhà cung cấp hoàn tiền', dir: 'thu', party: 'ncc' },
  { value: 'thu_khac', label: 'Thu khác', dir: 'thu' },
  { value: 'gop_von', label: 'Chủ góp vốn', dir: 'thu', owner: true },
  { value: 'tra_ncc', label: 'Trả tiền nhà cung cấp / xưởng', dir: 'chi', party: 'ncc' },
  { value: 'hoan_khach', label: 'Hoàn tiền cho khách', dir: 'chi', party: 'kh' },
  { value: 'chi_phi', label: 'Trả chi phí đã ghi', dir: 'chi' },
  { value: 'chi_khac', label: 'Chi khác', dir: 'chi' },
  { value: 'rut_von', label: 'Chủ rút vốn', dir: 'chi', owner: true },
  { value: 'chuyen_quy', label: 'Chuyển tiền giữa các quỹ', dir: 'chuyen', owner: true },
];
const DOC_LABEL = { don_ban: 'Đơn bán', don_mua: 'Đơn nhập', chi_phi: 'Chi phí', no_dau_ky: 'Nợ đầu kỳ' };

export function PaymentForm({ kind: kind0 = 'thu_khach', party_id: party0, alloc, onClose }) {
  const { can, open, toast } = useApp();
  const customers = useCustomers(); const suppliers = useSuppliers(); const funds = useFunds();
  const { run, busy } = useAction();
  const [kind, setKind] = useState(kind0);
  const [party, setParty] = useState(party0 || '');
  const [amount, setAmount] = useState(alloc?.amount > 0 ? alloc.amount : null);
  const [fee, setFee] = useState(null);
  const [fund, setFund] = useState(''); const [toFund, setToFund] = useState('');
  const [date, setDate] = useState(todayVN()); const [method, setMethod] = useState('Chuyển khoản'); const [note, setNote] = useState('');
  const [al, setAl] = useState(alloc ? { [alloc.doc_id]: alloc.amount > 0 ? alloc.amount : null } : {});
  const def = PAY_KINDS.find((k) => k.value === kind);
  const docTypes = kind === 'thu_khach' || kind === 'hoan_khach' ? ['don_ban', 'no_dau_ky'] : kind === 'tra_ncc' || kind === 'ncc_hoan' ? ['don_mua', 'no_dau_ky', 'chi_phi'] : kind === 'chi_phi' ? ['chi_phi'] : [];
  const docsQ = useQ('open_docs', kind === 'chi_phi' ? [['doc_type', 'eq', 'chi_phi'], ['party_id', 'is_null']] : [['party_id', 'eq', party || '00000000-0000-0000-0000-000000000000']], 'doc_date', 500, docTypes.length > 0 && (!!party || kind === 'chi_phi'));
  const refund = kind === 'hoan_khach' || kind === 'ncc_hoan';
  const docs = useMemo(() => (docsQ.data || []).filter((d) => docTypes.includes(d.doc_type)).map((d) => ({
    ...d, limit: refund ? (d.doc_type === 'no_dau_ky' ? -d.remaining_total : d.paid_net - d.due_now) : d.remaining_total,
  })).filter((d) => d.limit > 0 && (refund || d.status !== 'huy') || al[d.doc_id]), [docsQ.data, kind, al]);
  useEffect(() => { if (!fund && funds.data?.length) setFund(funds.data[0].id); }, [funds.data]);
  useEffect(() => { if (!alloc) setAl({}); }, [kind, party]);
  const allocated = Object.values(al).reduce((s, v) => s + (Number(v) || 0), 0);
  const autoFill = () => {
    let left = Number(amount) || 0; const next = {};
    const order = [...docs].sort((a, b) => (a.doc_date < b.doc_date ? -1 : 1));
    for (const pass of ['due', 'total']) for (const d of order) {
      if (left <= 0) break;
      const cap = pass === 'due' && !refund ? Math.min(d.limit, Math.max(0, d.remaining_due)) : d.limit;
      const already = next[d.doc_id] || 0; const a = Math.min(cap - already, left);
      if (a > 0) { next[d.doc_id] = already + a; left -= a; }
    }
    setAl(next);
  };
  const partyList = def?.party === 'kh' ? customers.data : def?.party === 'ncc' ? suppliers.data : null;
  const partyRow = partyList?.find((p) => p.id === party);
  const submit = async () => {
    const allocations = Object.entries(al).filter(([, v]) => Number(v) > 0).map(([doc_id, v]) => ({ doc_id, doc_type: docs.find((d) => d.doc_id === doc_id)?.doc_type || alloc?.doc_type, amount: Number(v) }));
    const r = await run('create_payment', { kind, date, fund_id: fund, to_fund_id: toFund || null, party_id: party || null, amount, fee, method, note, allocations },
      (x) => `Đã lập ${def.dir === 'thu' ? 'phiếu thu' : def.dir === 'chi' ? 'phiếu chi' : 'phiếu chuyển quỹ'} ${x.code}`);
    if (r) onClose();
  };
  const kinds = PAY_KINDS.filter((k) => !k.owner || can('owner'));
  return (
    <Modal title={def?.dir === 'thu' ? 'Thu tiền' : def?.dir === 'chi' ? 'Chi tiền' : 'Chuyển quỹ'} onClose={onClose} size="lg"
      subtitle="Mỗi khoản thu/chi gắn đúng đối tượng và chứng từ để công nợ tự cập nhật."
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={submit} icon={def?.dir === 'thu' ? 'in' : 'out'}>Lưu phiếu</Btn></>}>
      <div className="grid">
        <Field label="Loại phiếu"><Select value={kind} onChange={(v) => { setKind(v); if (PAY_KINDS.find((k) => k.value === v)?.party !== def?.party) setParty(''); }}
          options={kinds.map((k) => ({ value: k.value, label: (k.dir === 'thu' ? 'Thu · ' : k.dir === 'chi' ? 'Chi · ' : '') + k.label }))} /></Field>
        {def?.party && <Field label={def.party === 'kh' ? 'Khách hàng' : 'Nhà cung cấp'} required hint={partyRow ? (def.party === 'kh' ? `Đang nợ ${money(partyRow.receivable)} · trả trước ${money(partyRow.prepaid)}` : `Mình đang nợ ${money(partyRow.payable)} · đã trả trước ${money(partyRow.prepaid)}`) : null}>
          <Picker items={partyList || []} value={party} onChange={setParty} getLabel={(p) => p.name} getSub={(p) => p.code + (p.phone ? ' · ' + p.phone : '')} />
        </Field>}
        <Field label="Số tiền" required><NumInput value={amount} onChange={setAmount} placeholder="0" /></Field>
        {kind === 'thu_khach' && <Field label="Phí sàn / thu hộ bị trừ" hint="vd. TikTok trừ phí trước khi chuyển tiền. Ghi tự động vào chi phí."><NumInput value={fee} onChange={setFee} placeholder="0" /></Field>}
        <Field label={def?.dir === 'thu' ? 'Vào quỹ' : 'Từ quỹ'}><Select value={fund} onChange={setFund} options={(funds.data || []).map((f) => ({ value: f.id, label: `${f.name} (${money(f.balance)})` }))} /></Field>
        {kind === 'chuyen_quy' && <Field label="Sang quỹ"><Select value={toFund} onChange={setToFund} placeholder="Chọn quỹ nhận" options={(funds.data || []).filter((f) => f.id !== fund).map((f) => ({ value: f.id, label: f.name }))} /></Field>}
        <Field label="Ngày"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        <Field label="Hình thức"><Select value={method} onChange={setMethod} options={['Tiền mặt', 'Chuyển khoản', 'Thẻ / POS', 'TikTok Shop', 'COD', 'Bù trừ']} /></Field>
        <Field label="Nội dung" wide><Input value={note} onChange={setNote} placeholder="vd. Đại lý chuyển khoản đợt 2" /></Field>
      </div>
      {kind === 'thu_khach' && fee > 0 && <Note>Tiền thực vào quỹ: {money((amount || 0) - fee)} đ. Công nợ của khách giảm đủ {money(amount)} đ; phí {money(fee)} đ ghi vào chi phí "Phí sàn".</Note>}
      {docTypes.length > 0 && (party || kind === 'chi_phi') && (
        <Section title="Gắn vào chứng từ" actions={<Btn small onClick={autoFill}>Tự phân bổ (cũ trước)</Btn>}>
          {!docsQ.data ? <Loading /> : docs.length === 0 ? <div className="muted small">Không có chứng từ nào đang mở{refund ? ' có tiền trả dư' : ''}. {kind === 'thu_khach' ? 'Toàn bộ số tiền sẽ tính là khách trả trước.' : ''}</div> : (
            <Table dense rows={docs} rowKey="doc_id" columns={[
              { key: 'c', label: 'Chứng từ', render: (d) => <><b>{d.code}</b><div className="cell-sub">{DOC_LABEL[d.doc_type]} · {dmy(d.doc_date)}{d.due_date ? ' · hạn ' + dmy(d.due_date) : ''}</div></> },
              { key: 't', label: 'Tổng', align: 'right', render: (d) => money(d.total) },
              { key: 'p', label: 'Đã trả', align: 'right', render: (d) => money(d.paid_net) },
              { key: 'r', label: refund ? 'Có thể hoàn' : 'Còn phải trả', align: 'right', render: (d) => <>{money(d.limit)}{!refund && d.remaining_due > 0 && d.remaining_due < d.limit && <div className="cell-sub">đến hạn {money(d.remaining_due)}</div>}</> },
              { key: 'a', label: 'Gắn', align: 'right', render: (d) => <NumInput value={al[d.doc_id]} onChange={(v) => setAl((s) => ({ ...s, [d.doc_id]: v }))} style={{ maxWidth: 130 }} /> },
            ]} />
          )}
          <div className={`small ${allocated > (Number(amount) || 0) ? 'bad' : 'muted'}`}>Đã gắn {money(allocated)} / {money(amount || 0)}.{' '}
            {(Number(amount) || 0) - allocated > 0 && (kind === 'thu_khach' ? `Phần còn lại ${money((amount || 0) - allocated)} tính là khách trả trước chung.` : kind === 'tra_ncc' ? `Phần còn lại tính là trả trước cho NCC.` : '')}
            {allocated > (Number(amount) || 0) && ' Tổng gắn vượt số tiền phiếu.'}</div>
        </Section>
      )}
      {kind === 'chi_phi' && <Note>Chi phí mới hãy ghi ở mục <b>Chi phí</b> (có tùy chọn trả ngay). Mục này để trả các chi phí đã ghi nhưng chưa trả.</Note>}
    </Modal>
  );
}

export function PaymentDetail({ id, onClose }) {
  const { can, open } = useApp();
  const q = useQ('payments', [['id', 'eq', id]]);
  const { run, busy } = useAction();
  const [reason, setReason] = useState('');
  const p = q.data?.[0];
  if (!p) return <Modal title="Phiếu" onClose={onClose}>{q.error ? <ErrorBox error={q.error} /> : <Loading />}</Modal>;
  return (
    <Modal title={`${p.direction === 'thu' ? 'Phiếu thu' : p.direction === 'chi' ? 'Phiếu chi' : 'Chuyển quỹ'} ${p.code}`} onClose={onClose} size="md"
      subtitle={<span className="row gap-s">{p.kind_label} · {dmy(p.pay_date)} {p.voided && <Pill tone="bad">Đã hủy</Pill>}</span>}
      footer={<Btn icon="dl" onClick={() => open('doc', { kind: 'payment', id })}>Xuất phiếu PDF</Btn>}>
      <KV items={[
        ['Số tiền', <b>{money(p.amount)} đ</b>], p.fee > 0 && ['Phí sàn bị trừ', money(p.fee) + ' đ'], p.fee > 0 && ['Thực vào quỹ', money(p.cash_amount) + ' đ'],
        ['Quỹ', p.fund_name + (p.to_fund_name ? ' → ' + p.to_fund_name : '')], ['Đối tượng', p.party_name || '—'], ['Hình thức', p.method || '—'], ['Nội dung', p.note || '—'],
        ['Gắn vào', (p.allocations || []).map((a) => `${a.doc_code}: ${money(a.amount)}`).join('; ') || '—'],
        p.unallocated > 0 && p.party_type && ['Chưa gắn chứng từ', money(p.unallocated) + ' đ (tính là trả trước chung)'],
        p.voided && ['Lý do hủy', p.void_reason],
      ]} />
      {can('owner') && !p.voided && (
        <Section title="Hủy phiếu">
          <div className="muted small">Phiếu hủy vẫn giữ trong lịch sử, chỉ không còn tính vào quỹ và công nợ. Ghi nhầm thì hủy rồi lập phiếu mới.</div>
          <div className="row gap"><Input value={reason} onChange={setReason} placeholder="Lý do hủy (bắt buộc)" style={{ maxWidth: 320 }} />
            <ConfirmBtn kind="danger" busy={busy} onConfirm={async () => { if (await run('void_payment', { id, reason }, 'Đã hủy phiếu ' + p.code)) onClose(); }}>Hủy phiếu</ConfirmBtn></div>
        </Section>
      )}
    </Modal>
  );
}

export function CashPage() {
  const { open, can } = useApp();
  const [period, setPeriod] = usePeriod('30d');
  const [tab, setTab] = useState('all'); const [search, setSearch] = useState(''); const [fundF, setFundF] = useState('');
  const funds = useFunds();
  const pays = useQ('payments', [['pay_date', 'gte', period.from], ['pay_date', 'lte', period.to]], 'created_at desc', 5000);
  const rows = useMemo(() => (pays.data || []).filter((p) => {
    if (fundF && p.fund_id !== fundF && p.to_fund_id !== fundF) return false;
    if (!match(`${p.code} ${p.party_name || ''} ${p.note || ''} ${p.kind_label}`, search)) return false;
    if (tab === 'thu') return p.direction === 'thu' && !p.voided;
    if (tab === 'chi') return p.direction === 'chi' && !p.voided;
    if (tab === 'void') return p.voided;
    return true;
  }), [pays.data, tab, search, fundF]);
  const sum = (d) => rows.filter((p) => p.direction === d && !p.voided).reduce((s, p) => s + p.cash_amount, 0);
  return (
    <>
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Thu chi</h1><div className="page-sub">Tiền thực vào – ra từng quỹ. Mỗi phiếu gắn đúng khách / NCC và chứng từ.</div></div>
        <Btn icon="dl" onClick={() => exportXlsx('thu-chi.xlsx', [{ name: 'Thu chi', rows, columns: [
          { key: 'code', label: 'Số phiếu' }, { key: 'pay_date', label: 'Ngày', type: 'date' }, { key: 'kind_label', label: 'Loại' }, { key: 'party_name', label: 'Đối tượng' },
          { key: 'fund_name', label: 'Quỹ' }, { key: 'amount', label: 'Số tiền' }, { key: 'fee', label: 'Phí sàn' }, { key: 'cash_amount', label: 'Tiền thực' }, { key: 'note', label: 'Nội dung' },
          { key: 'voided', label: 'Đã hủy', get: (p) => (p.voided ? 'Có' : '') }] }])}>Xuất Excel</Btn>
        <Btn kind="soft" icon="in" onClick={() => open('payment', { kind: 'thu_khach' })}>Thu tiền</Btn>
        <Btn kind="soft" icon="out" onClick={() => open('payment', { kind: 'tra_ncc' })}>Chi tiền</Btn>
      </div>
      <div className="kpis">
        {(funds.data || []).map((f) => <button key={f.id} className={`kpi${fundF === f.id ? ' key' : ''}`} onClick={() => setFundF(fundF === f.id ? '' : f.id)}><span className="kpi-label">{f.name}</span><span className="kpi-value">{money(f.balance)}</span><span className="kpi-sub">Số dư hiện tại · đầu sổ {short(f.opening_balance)}</span></button>)}
      </div>
      <div className="row gap"><PeriodPicker value={period} onChange={setPeriod} /></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'Tất cả' }, { value: 'thu', label: 'Thu' }, { value: 'chi', label: 'Chi' }, { value: 'void', label: 'Đã hủy' }]} />
      <div className="row gap"><Search value={search} onChange={setSearch} placeholder="Tìm số phiếu, khách, nội dung…" /><span className="muted">Thu <b className="good">{money(sum('thu'))}</b> · Chi <b className="bad">{money(sum('chi'))}</b> · Chênh lệch <b>{money(sum('thu') - sum('chi'))}</b></span></div>
      <ErrorBox error={pays.error} />
      <Table rows={pays.data ? rows : null} onRow={(p) => open('pay-detail', { id: p.id })} rowClass={(p) => (p.voided ? 'row-void' : '')} columns={[
        { key: 'c', label: 'Phiếu', render: (p) => <><div className="cell-main">{p.code}</div><div className="cell-sub">{dmy(p.pay_date)}</div></> },
        { key: 'k', label: 'Loại', render: (p) => <>{p.kind_label}<div className="cell-sub">{p.fund_name}{p.to_fund_name ? ' → ' + p.to_fund_name : ''}</div></> },
        { key: 'p', label: 'Đối tượng / nội dung', render: (p) => <>{p.party_name || '—'}<div className="cell-sub">{p.note}</div></> },
        { key: 'al', label: 'Gắn chứng từ', render: (p) => <span className="small">{(p.allocations || []).map((a) => a.doc_code).join(', ') || (p.party_type ? <span className="muted">trả trước chung</span> : '')}</span> },
        { key: 'a', label: 'Số tiền', align: 'right', render: (p) => <span className={p.direction === 'thu' ? 'good strong' : p.direction === 'chi' ? 'bad strong' : ''}>{p.direction === 'chi' ? '−' : p.direction === 'thu' ? '+' : ''}{money(p.cash_amount)}{p.fee > 0 && <div className="cell-sub">phí sàn {money(p.fee)}</div>}</span> },
      ]} />
    </>
  );
}

// ===================== CHI PHÍ =====================
export function ExpenseForm({ id, onClose }) {
  const { settings, can, rpc } = useApp();
  const suppliers = useSuppliers(); const funds = useFunds(can('thu_chi'));
  const { run, busy } = useAction();
  const tree = cats(settings);
  const [f, setF] = useState({ date: todayVN(), group: tree[0].group, category: tree[0].items[0], custom: '', description: '', amount: null, alloc_months: 1,
    supplier_id: '', note: '', payNow: true, fund_id: '', method: 'Tiền mặt' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => { if (!f.fund_id && funds.data?.length) set('fund_id', funds.data[0].id); }, [funds.data]);
  useEffect(() => {
    if (id) rpc('q', { view: 'expenses', filters: [['id', 'eq', id]] }).then(([e]) => {
      const g = e.expense_group || groupOf(settings, e.category) || tree[0].group;
      const known = tree.find((x) => x.group === g)?.items.includes(e.category);
      setF((s) => ({ ...s, date: e.exp_date, group: g, category: known ? e.category : '__other', custom: known ? '' : e.category, description: e.description || '',
        amount: e.amount, alloc_months: e.alloc_months || 1, supplier_id: e.supplier_id || '', note: e.note || '', payNow: false }));
    });
  }, [id]);
  const items = tree.find((x) => x.group === f.group)?.items || [];
  const category = f.category === '__other' ? f.custom.trim() : f.category;
  const perMonth = f.amount && f.alloc_months > 1 ? Math.round(f.amount / f.alloc_months) : null;
  return (
    <Modal title={id ? 'Sửa chi phí' : 'Ghi chi phí'} onClose={onClose} size="lg" subtitle="Chi phí vận hành tính vào lợi nhuận theo ngày phát sinh. Tiền nhập hàng KHÔNG ghi ở đây (đã nằm trong giá vốn)."
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('save_expense', { id: id || null, date: f.date, expense_group: f.group, category, description: f.description, amount: f.amount,
          alloc_months: Number(f.alloc_months) || 1, supplier_id: f.supplier_id || null, note: f.note,
          pay_now: f.payNow && can('thu_chi') ? { fund_id: f.fund_id, method: f.method } : null }, (x) => `Đã ghi chi phí ${x.code} · ${x.expense_group}${x.payment_code ? ' · phiếu chi ' + x.payment_code : ''}`);
        if (r) onClose();
      }}>Lưu</Btn></>}>
      <div className="stack" style={{ gap: 6 }}>
        <div className="field-label">Nhóm chi phí</div>
        <div className="row gap-s">{tree.map((g) => <button key={g.group} type="button" className={`chip${f.group === g.group ? ' on' : ''}`}
          onClick={() => setF((s) => ({ ...s, group: g.group, category: g.items[0] || '__other', custom: '' }))}>{g.group}</button>)}</div>
        {GROUP_HINT[f.group] && <div className="muted small">{GROUP_HINT[f.group]}</div>}
      </div>
      <div className="grid">
        <Field label="Khoản mục" required><Select value={f.category} onChange={(v) => set('category', v)} options={[...items.map((x) => ({ value: x, label: x })), { value: '__other', label: '+ Khoản khác (tự ghi)…' }]} /></Field>
        {f.category === '__other' && <Field label="Tên khoản mục"><Input value={f.custom} onChange={(v) => set('custom', v)} placeholder="vd. Phí đăng ký mã vạch" autoFocus /></Field>}
        <Field label="Số tiền" required><NumInput value={f.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Ngày phát sinh"><DateInput value={f.date} onChange={(v) => set('date', v)} max={todayVN()} /></Field>
        <Field label="Phân bổ vào lãi lỗ" hint={perMonth ? `≈ ${money(perMonth)} đ / tháng trong ${f.alloc_months} tháng` : 'Tính hết vào tháng phát sinh'}>
          <Select value={String(f.alloc_months)} onChange={(v) => set('alloc_months', Number(v))} options={[1, 2, 3, 6, 12, 18, 24, 36].map((n) => ({ value: String(n), label: n === 1 ? 'Không phân bổ (1 tháng)' : `Chia đều ${n} tháng` }))} /></Field>
        <Field label="Diễn giải" wide><Input value={f.description} onChange={(v) => set('description', v)} placeholder="vd. Tiền thuê showroom tháng 10 / Quảng cáo video bình hút lộc" /></Field>
        <Field label="Ghi nợ nhà cung cấp dịch vụ (nếu chưa trả)" wide><Select value={f.supplier_id} onChange={(v) => set('supplier_id', v)} placeholder="(không)" options={(suppliers.data || []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
      </div>
      {f.alloc_months > 1 && <Note>Tiền vẫn trả 1 lần {f.amount ? money(f.amount) + ' đ' : ''} (quỹ giảm ngay); chỉ phần tính vào lãi lỗ được chia đều {f.alloc_months} tháng, từ tháng {f.date.slice(5, 7)}/{f.date.slice(0, 4)}.</Note>}
      {!id && can('thu_chi') && <div className="row gap"><Check checked={f.payNow} onChange={(v) => set('payNow', v)}>Đã trả ngay</Check>
        {f.payNow && <Select value={f.fund_id} onChange={(v) => set('fund_id', v)} options={(funds.data || []).map((x) => ({ value: x.id, label: `${x.name} (${money(x.balance)})` }))} style={{ maxWidth: 260 }} />}</div>}
      {!f.payNow && <div className="muted small">Chưa trả: chi phí vẫn tính vào lợi nhuận đúng kỳ; khi trả tiền, lập phiếu chi gắn vào khoản này (không bị tính 2 lần).</div>}
    </Modal>
  );
}

export function ExpensesPage() {
  const { open, can, settings } = useApp();
  const [period, setPeriod] = usePeriod('month');
  const [grp, setGrp] = useState(''); const [search, setSearch] = useState('');
  const q = useQ('expenses', [['exp_date', 'gte', period.from], ['exp_date', 'lte', period.to]], 'exp_date desc', 5000);
  const { run, busy } = useAction();
  const [voidId, setVoidId] = useState(null); const [reason, setReason] = useState('');
  const tree = cats(settings);
  const live = (q.data || []).filter((e) => !e.voided);
  const byGrp = {}; for (const e of live) { const g = e.expense_group || 'Quản lý & khác'; byGrp[g] = (byGrp[g] || 0) + e.amount; }
  const order = [...tree.map((g) => g.group), ...Object.keys(byGrp).filter((g) => !tree.some((t) => t.group === g))];
  const rows = (q.data || []).filter((e) => (!grp || (e.expense_group || 'Quản lý & khác') === grp) && match(`${e.code} ${e.category} ${e.description || ''} ${e.supplier_name || ''}`, search));
  const total = rows.filter((e) => !e.voided).reduce((s, e) => s + e.amount, 0);
  const all = live.reduce((s, e) => s + e.amount, 0);
  return (
    <>
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Chi phí vận hành</h1><div className="page-sub">Chia theo nhóm: mặt bằng, điện nước, công cụ dụng cụ, marketing, chi phí bán hàng, nhân sự, quản lý. Đã trả hay chưa đều tính vào lợi nhuận đúng kỳ; khoản phân bổ chia đều theo tháng.</div></div>
        <Btn icon="dl" onClick={() => exportXlsx('chi-phi.xlsx', [{ name: 'Chi phí', rows, columns: [{ key: 'code', label: 'Mã' }, { key: 'exp_date', label: 'Ngày', type: 'date' }, { key: 'expense_group', label: 'Nhóm' },
          { key: 'category', label: 'Khoản mục' }, { key: 'description', label: 'Diễn giải' }, { key: 'amount', label: 'Số tiền' }, { key: 'alloc_months', label: 'Phân bổ (tháng)' },
          { key: 'paid', label: 'Đã trả' }, { key: 'unpaid', label: 'Chưa trả' }, { key: 'supplier_name', label: 'Nợ NCC' }] }])}>Xuất Excel</Btn>
        {can('chi_phi') && <Btn kind="primary" icon="plus" onClick={() => open('expense', {})}>Ghi chi phí</Btn>}
      </div>
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="exp-groups">
        <button className={`exp-card${!grp ? ' on' : ''}`} onClick={() => setGrp('')}><span>Tất cả</span><b>{short(all)}</b><i style={{ width: '100%' }} /></button>
        {order.map((g, idx) => (
          <button key={g} className={`exp-card${grp === g ? ' on' : ''}`} onClick={() => setGrp(grp === g ? '' : g)}>
            <span>{g}</span><b>{byGrp[g] ? short(byGrp[g]) : '—'}</b>
            <i style={{ width: `${all ? Math.max(2, ((byGrp[g] || 0) / all) * 100) : 0}%`, background: GROUP_COLORS[idx % GROUP_COLORS.length] }} />
          </button>))}
      </div>
      <div className="muted small">Số trên thẻ là tiền các khoản ghi trong kỳ (theo ngày phát sinh). Số tính vào lãi lỗ từng tháng (đã chia phân bổ) xem ở Báo cáo → Chi phí.</div>
      <div className="row gap"><Search value={search} onChange={setSearch} placeholder="Tìm khoản mục, diễn giải…" /></div>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} rowClass={(e) => (e.voided ? 'row-void' : '')} foot={{ a: money(total) }} empty="Chưa có chi phí trong kỳ" columns={[
        { key: 'c', label: 'Mã', render: (e) => <><div className="cell-main">{e.code}</div><div className="cell-sub">{dmy(e.exp_date)}</div></> },
        { key: 'g', label: 'Nhóm · khoản mục', render: (e) => <><div className="cell-main">{e.category}</div><div className="cell-sub">{e.expense_group}</div></> },
        { key: 'd', label: 'Diễn giải', render: (e) => <>{e.description}{e.alloc_months > 1 && <div><Pill tone="info">Phân bổ {e.alloc_months} tháng · đến {e.alloc_end ? `${e.alloc_end.slice(5, 7)}/${e.alloc_end.slice(0, 4)}` : ''}</Pill></div>}
          {e.settled_payment_code && <div className="cell-sub">trừ vào phiếu thu {e.settled_payment_code}</div>}{e.supplier_name && <div className="cell-sub">nợ {e.supplier_name}</div>}</> },
        { key: 's', label: 'Trạng thái', render: (e) => (e.voided ? <Pill tone="mute">Đã hủy</Pill> : e.unpaid > 0 ? <Pill tone="warn">Chưa trả {money(e.unpaid)}</Pill> : <Pill tone="good">Đã trả</Pill>) },
        { key: 'a', label: 'Số tiền', align: 'right', render: (e) => <>{money(e.amount)}{e.alloc_months > 1 && <div className="cell-sub">≈ {money(Math.round(e.amount / e.alloc_months))}/tháng</div>}</> },
        { key: 'x', label: '', render: (e) => !e.voided && <div className="row gap-s" onClick={(ev) => ev.stopPropagation()}>
          {e.unpaid > 0 && can('thu_chi') && <Btn small onClick={() => open('payment', { kind: e.supplier_id ? 'tra_ncc' : 'chi_phi', party_id: e.supplier_id, alloc: { doc_type: 'chi_phi', doc_id: e.id, code: e.code, amount: e.unpaid } })}>Trả</Btn>}
          {e.paid === 0 && !e.settled_payment_id && can('chi_phi') && <Btn small onClick={() => open('expense', { id: e.id })}>Sửa</Btn>}
          {can('owner') && e.paid === 0 && !e.settled_payment_id && (voidId === e.id
            ? <><Input value={reason} onChange={setReason} placeholder="Lý do" style={{ width: 140 }} /><ConfirmBtn small kind="danger" busy={busy} onConfirm={async () => { if (await run('void_expense', { id: e.id, reason }, 'Đã hủy chi phí')) setVoidId(null); }}>Hủy</ConfirmBtn></>
            : <Btn small onClick={() => { setVoidId(e.id); setReason(''); }}>Hủy</Btn>)}
        </div> },
      ]} />
    </>
  );
}
