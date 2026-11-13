// Kết ca làm việc: mở ca với tiền đầu ca, cuối ca đếm tiền mặt và đối chiếu với tiền thu / chi trong ca.
import React, { useState } from 'react';
import { useApp, useRpcData, useAction } from '../lib/store.jsx';
import { money, dmyhm } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { Btn, Field, Select, NumInput, Input, Note, Table, Section, KV, ErrorBox, Loading } from '../components/ui.jsx';

export function ShiftsPage() {
  const cur = useRpcData('current_shift', {});
  const list = useRpcData('shift_list', {});
  const funds = useFunds();
  const { run, busy } = useAction();
  const cash = (funds.data || []).find((f) => /mặt/i.test(f.name)) || (funds.data || [])[0];
  const [fund, setFund] = useState(''); const [open, setOpen] = useState(0); const [counted, setCounted] = useState(null); const [note, setNote] = useState('');
  const s = cur.data;
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Kết ca</h1><div className="page-sub">Tiền dự kiến = tiền đầu ca + tiền mặt thu − tiền mặt chi do chính bạn lập trong ca.</div></div></div>
      <ErrorBox error={cur.error} />
      {cur.loading && !s ? <Loading /> : s ? (
        <Section title={`Ca ${s.code} · mở lúc ${dmyhm(s.opened_at)}`}>
          <KV items={[['Quỹ', s.fund_name], ['Tiền đầu ca', `${money(s.opening_cash)} đ`], ['Tiền mặt thu trong ca', `${money(s.cash_in)} đ`], ['Tiền mặt chi trong ca', `${money(s.cash_out)} đ`],
            ['Tiền mặt dự kiến', <b key="e">{money(s.expected_cash)} đ</b>]]} />
          <div className="grid">
            <Field label="Tiền mặt đếm được" required><NumInput min={0} value={counted} onChange={setCounted} suffix="đ" /></Field>
            <Field label="Ghi chú bàn giao" wide><Input value={note} onChange={setNote} /></Field>
          </div>
          {counted != null && <Note tone={counted === s.expected_cash ? 'good' : 'warn'}>{counted === s.expected_cash ? 'Khớp tiền dự kiến.' : `Lệch ${money(counted - s.expected_cash)} đ so với dự kiến.`}</Note>}
          <div><Btn kind="primary" busy={busy} disabled={counted == null} onClick={async () => { if (await run('close_shift', { id: s.id, counted_cash: counted, note }, (r) => `Đã kết ca ${r.code}`)) { setCounted(null); setNote(''); } }}>Kết ca</Btn></div>
        </Section>
      ) : (
        <Section title="Mở ca mới">
          <div className="grid">
            <Field label="Quỹ tiền mặt"><Select value={fund || cash?.id || ''} onChange={setFund} options={(funds.data || []).map((f) => ({ value: f.id, label: f.name }))} /></Field>
            <Field label="Tiền đầu ca"><NumInput min={0} value={open} onChange={(v) => setOpen(v || 0)} suffix="đ" /></Field>
          </div>
          <div><Btn kind="primary" busy={busy} onClick={() => run('open_shift', { fund_id: fund || cash?.id, opening_cash: open }, (r) => `Đã mở ca ${r.code}`)}>Mở ca</Btn></div>
        </Section>
      )}
      <Section title="Các ca đã kết">
        <Table rows={(list.data || []).filter((x) => x.closed_at)} empty="Chưa có ca nào" columns={[
          { key: 'c', label: 'Ca', render: (x) => <><b>{x.code}</b><div className="cell-sub">{x.user_name}</div></> },
          { key: 't', label: 'Thời gian', render: (x) => <>{dmyhm(x.opened_at)}<div className="cell-sub">đến {dmyhm(x.closed_at)}</div></> },
          { key: 'o', label: 'Đầu ca', align: 'right', render: (x) => money(x.opening_cash) },
          { key: 'i', label: 'Thu / chi', align: 'right', render: (x) => <>{money(x.cash_in)}<div className="cell-sub">−{money(x.cash_out)}</div></> },
          { key: 'e', label: 'Dự kiến', align: 'right', render: (x) => money(x.expected_cash) },
          { key: 'n', label: 'Đếm được', align: 'right', render: (x) => money(x.counted_cash) },
          { key: 'd', label: 'Lệch', align: 'right', render: (x) => <b className={x.diff ? (x.diff > 0 ? 'good' : 'bad') : 'muted'}>{x.diff ? money(x.diff) : '0'}</b> },
          { key: 'g', label: 'Ghi chú', render: (x) => <span className="small">{x.note}</span> },
        ]} />
      </Section>
    </>
  );
}
