// Bảo hành, sửa chữa: tra cứu hạn bảo hành theo hàng đã giao và quản lý phiếu tiếp nhận sửa chữa.
import React, { useState } from 'react';
import { useApp, useRpcData, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN } from '../lib/format.js';
import { useCustomers } from '../lib/lookups.js';
import { Btn, Field, Input, TextArea, DateInput, NumInput, Note, Table, Modal, Pill, Tabs, usePageTab, ErrorBox, Picker } from '../components/ui.jsx';

const STATUS = { tiep_nhan: ['Tiếp nhận', 'info'], dang_sua: ['Đang sửa', 'warn'], da_sua: ['Đã sửa xong', 'good'], da_tra: ['Đã trả khách', 'mute'], huy: ['Đã hủy', 'mute'] };
const NEXT = { tiep_nhan: ['dang_sua', 'da_sua', 'huy'], dang_sua: ['da_sua', 'huy'], da_sua: ['da_tra', 'dang_sua'], da_tra: [], huy: [] };

export function WarrantyPage(nav) {
  const [tab, setTab] = usePageTab(nav, 'phieu', ['phieu', 'tra-cuu']);
  const [form, setForm] = useState(null);
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Bảo hành, sửa chữa</h1><div className="page-sub">Hạn bảo hành tính từ ngày giao theo thời hạn khai ở từng hàng hóa.</div></div>
        <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Tiếp nhận sửa chữa</Btn></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'phieu', label: 'Phiếu sửa chữa' }, { value: 'tra-cuu', label: 'Tra cứu bảo hành' }]} />
      {tab === 'phieu' ? <Claims onEdit={setForm} /> : <Lookup onClaim={(r) => setForm({ customer_id: r.customer_id, delivery_line_id: r.delivery_line_id, _label: `${r.sku} · ${r.product_name} (giao ${dmy(r.delivery_date)})` })} />}
      {form && <ClaimForm claim={form} onClose={() => setForm(null)} />}
    </>
  );
}

function Claims({ onEdit }) {
  const [st, setSt] = useState('');
  const q = useRpcData('warranty_claims', { status: st || null });
  const { run } = useAction();
  return (
    <div className="stack">
      <div className="seg">{[['', 'Tất cả'], ...Object.entries(STATUS).map(([k, [l]]) => [k, l])].map(([k, l]) => <button key={k} className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{l}</button>)}</div>
      <ErrorBox error={q.error} />
      <Table rows={q.data} empty="Chưa có phiếu sửa chữa" columns={[
        { key: 'c', label: 'Mã phiếu', render: (x) => <><b>{x.code}</b><div className="cell-sub">{dmy(x.received_date)}</div></> },
        { key: 'k', label: 'Khách hàng', render: (x) => <>{x.customer_name}<div className="cell-sub">{x.phone}</div></> },
        { key: 'h', label: 'Hàng hóa / tình trạng', render: (x) => <>{x.sku ? `${x.sku} · ${x.product_name}` : '—'}<div className="cell-sub">{x.issue}</div></> },
        { key: 'b', label: 'Bảo hành', render: (x) => (x.in_warranty ? <Pill tone="good">Còn bảo hành</Pill> : <span className="small">Phí {money(x.fee)} đ</span>) },
        { key: 'p', label: 'Hẹn trả', render: (x) => (x.promise_date ? <span className={x.is_late ? 'bad strong' : ''}>{dmy(x.promise_date)}{x.is_late ? ' · trễ hẹn' : ''}</span> : '—') },
        { key: 's', label: 'Trạng thái', render: (x) => { const [l, t] = STATUS[x.status]; return <Pill tone={t}>{l}</Pill>; } },
        { key: 'a', label: '', render: (x) => <div className="row gap-s">{NEXT[x.status].map((n) => <Btn key={n} small onClick={() => run('set_warranty_status', { id: x.id, status: n }, `Đã chuyển sang “${STATUS[n][0]}”`)}>{STATUS[n][0]}</Btn>)}
          {!['da_tra', 'huy'].includes(x.status) && <Btn small icon="edit" onClick={() => onEdit(x)} aria-label="Sửa phiếu" />}</div> },
      ]} />
    </div>
  );
}

function Lookup({ onClaim }) {
  const [q, setQ] = useState(''); const [term, setTerm] = useState('');
  const r = useRpcData('warranty_lookup', { q: term });
  return (
    <div className="stack">
      <div className="row gap"><div className="grow" style={{ maxWidth: 420 }}><Input value={q} onChange={setQ} placeholder="Tên khách, điện thoại, mã đơn hoặc mã hàng" onKeyDown={(e) => e.key === 'Enter' && setTerm(q)} aria-label="Tìm hàng đã bán" /></div><Btn icon="search" onClick={() => setTerm(q)}>Tìm</Btn></div>
      <ErrorBox error={r.error} />
      <Table rows={r.data} rowKey="delivery_line_id" empty="Không có hàng có bảo hành / bảo trì khớp" columns={[
        { key: 'k', label: 'Khách hàng', render: (x) => <>{x.customer_name}<div className="cell-sub">{x.phone}</div></> },
        { key: 'h', label: 'Hàng hóa', render: (x) => <>{x.sku} · {x.product_name}<div className="cell-sub">Đơn {x.order_code} · giao {dmy(x.delivery_date)} · {money(x.qty)}</div></> },
        { key: 'w', label: 'Bảo hành đến', render: (x) => (x.warranty_end ? <Pill tone={x.in_warranty ? 'good' : 'mute'}>{dmy(x.warranty_end)}</Pill> : '—') },
        { key: 'm', label: 'Bảo trì lần tới', render: (x) => (x.next_maintenance ? dmy(x.next_maintenance) : '—') },
        { key: 'a', label: '', render: (x) => <Btn small onClick={() => onClaim(x)}>Tiếp nhận</Btn> },
      ]} />
    </div>
  );
}

function ClaimForm({ claim, onClose }) {
  const custs = useCustomers();
  const { run, busy } = useAction();
  const [f, setF] = useState({ received_date: todayVN(), promise_date: '', fee: 0, issue: '', note: '', ...claim });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => { if (await run('save_warranty_claim', { ...f, id: f.id || null }, (r) => `Đã lưu phiếu ${r.code}${r.in_warranty ? ' (còn bảo hành)' : ''}`)) onClose(); };
  return (
    <Modal title={f.id ? `Sửa phiếu ${f.code}` : 'Tiếp nhận sửa chữa'} onClose={onClose} size="md" footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" busy={busy} onClick={save}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Khách hàng" wide required><Picker items={custs.data} value={f.customer_id} onChange={(v) => set('customer_id', v)} getLabel={(c) => c.name} getSub={(c) => c.code + (c.phone ? ' · ' + c.phone : '')} placeholder="Chọn khách…" /></Field>
        {f._label && <Field label="Hàng đã mua" wide><Input value={f._label} onChange={() => {}} disabled /></Field>}
        <Field label="Ngày tiếp nhận"><DateInput value={f.received_date} onChange={(v) => set('received_date', v)} max={todayVN()} /></Field>
        <Field label="Hẹn trả khách"><DateInput value={f.promise_date} onChange={(v) => set('promise_date', v)} /></Field>
        <Field label="Tình trạng / yêu cầu" wide required><TextArea value={f.issue} onChange={(v) => set('issue', v)} rows={3} /></Field>
        <Field label="Phí sửa chữa" hint="Hàng còn bảo hành tự miễn phí"><NumInput min={0} value={f.fee} onChange={(v) => set('fee', v || 0)} /></Field>
        <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>
      {!f.delivery_line_id && <Note>Tiếp nhận từ tab <b>Tra cứu bảo hành</b> để phần mềm tự kiểm tra hàng còn hạn bảo hành không.</Note>}
    </Modal>
  );
}
