import React, { useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmyhm, match, short } from '../lib/format.js';
import { useCustomers } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { orderTransferContent } from '../lib/vietqr.js';
import { Btn, Icon, Pill, Field, Input, NumInput, Tabs, Search, ErrorBox, Note, Table, Modal, KV, Picker, Section } from '../components/ui.jsx';

const ST = { cho_xu_ly: ['Chờ xử lý', 'warn'], da_ghi: ['Đã ghi vào sổ', 'good'], bo_qua: ['Bỏ qua', 'mute'] };
const StP = ({ s }) => { const [t, tone] = ST[s] || [s, 'neutral']; return <Pill tone={tone}>{t}</Pill>; };

export function BankPage() {
  const { open, settings, book } = useApp();
  const q = useQ('bank_txns', [], 'txn_at desc', 2000);
  const [tab, setTab] = useState('cho_xu_ly'); const [search, setSearch] = useState('');
  const rows = (q.data || []).filter((t) => t.direction === 'in' || tab === 'all');
  const list = useMemo(() => rows.filter((t) => (tab === 'all' || t.status === tab)).filter((t) => match(`${t.content || ''} ${t.counter_name || ''} ${t.order_code || ''} ${t.amount}`, search)), [rows, tab, search]);
  const pending = rows.filter((t) => t.status === 'cho_xu_ly');
  const bank = settings.bank;
  return (
    <>
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Tiền về tài khoản</h1>
          <div className="page-sub">{bank ? `${bank.bank_name || 'Ngân hàng'} · ${bank.account_no} · ${bank.account_name}. ` : ''}Khách chuyển khoản ghi nội dung <b>{orderTransferContent(book, 'DH00012')}</b> (mã sổ + mã đơn) thì phần mềm tự gạch nợ đúng đơn. Các khoản không có mã đơn nằm ở “Chờ xử lý”.</div></div>
        <Btn icon="dl" onClick={() => exportXlsx('tien-ve-tai-khoan.xlsx', [{ name: 'Tiền về', rows: list, columns: [
          { key: 'txn_at', label: 'Thời gian', get: (t) => dmyhm(t.txn_at) }, { key: 'amount', label: 'Số tiền' }, { key: 'direction', label: 'Chiều', get: (t) => (t.direction === 'in' ? 'Vào' : 'Ra') },
          { key: 'content', label: 'Nội dung' }, { key: 'counter_name', label: 'Người chuyển' }, { key: 'status', label: 'Trạng thái', get: (t) => ST[t.status]?.[0] },
          { key: 'order_code', label: 'Đơn' }, { key: 'payment_codes', label: 'Phiếu thu', get: (t) => (t.payment_codes || []).join(', ') }, { key: 'match_note', label: 'Ghi chú' }] }])}>Xuất Excel</Btn>
        {book.is_demo && <Btn icon="plus" onClick={() => open('bank-sim', {})}>Giả lập tiền về</Btn>}
      </div>
      {!bank && <Note tone="warn">Sổ này chưa khai báo tài khoản nhận tiền. Vào <b>Cài đặt → Tài khoản nhận tiền</b> để in mã QR theo đơn và nhận giao dịch tự động.</Note>}
      <div className="kpis kpis-3">
        <button className={`kpi ${pending.length ? 'alertk' : ''}`} onClick={() => setTab('cho_xu_ly')}><span className="kpi-label">Chờ xử lý</span><span className="kpi-value">{pending.length}</span><span className="kpi-sub">{money(pending.reduce((s, t) => s + Number(t.amount), 0))} đ</span></button>
        <button className="kpi" onClick={() => setTab('da_ghi')}><span className="kpi-label">Đã ghi vào sổ (30 gần nhất)</span><span className="kpi-value">{rows.filter((t) => t.status === 'da_ghi').slice(0, 30).length}</span></button>
        <button className="kpi" onClick={() => setTab('all')}><span className="kpi-label">Tổng tiền vào đã nhận</span><span className="kpi-value">{short(rows.filter((t) => t.direction === 'in' && t.status === 'da_ghi').reduce((s, t) => s + Number(t.amount), 0))}</span></button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'cho_xu_ly', label: 'Chờ xử lý', count: pending.length }, { value: 'da_ghi', label: 'Đã ghi' }, { value: 'bo_qua', label: 'Bỏ qua' }, { value: 'all', label: 'Tất cả (cả tiền ra)' }]} />
      <div className="row gap"><Search value={search} onChange={setSearch} placeholder="Tìm nội dung, người chuyển, mã đơn, số tiền…" /></div>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? list : null} onRow={(t) => open('bank-txn', { txn: t })} empty={tab === 'cho_xu_ly' ? 'Không có khoản nào cần xử lý' : 'Chưa có giao dịch'} columns={[
        { key: 'a', label: 'Số tiền', align: 'right', render: (t) => <b className={t.direction === 'out' ? 'bad' : 'good'}>{t.direction === 'out' ? '−' : '+'}{money(t.amount)}</b> },
        { key: 't', label: 'Thời gian', render: (t) => dmyhm(t.txn_at) },
        { key: 'c', label: 'Nội dung chuyển khoản', render: (t) => <><div className="small">{t.content}</div>{t.counter_name && <div className="cell-sub">{t.counter_name}</div>}</> },
        { key: 's', label: 'Xử lý', render: (t) => <><StP s={t.status} />{t.order_code && <div className="cell-sub">đơn {t.order_code}</div>}{t.status !== 'da_ghi' && t.match_note && <div className="cell-sub">{t.match_note}</div>}</> },
      ]} />
    </>
  );
}

export function BankTxnDialog({ txn, onClose }) {
  const { open, can, book } = useApp();
  const orders = useQ('sales_orders', [['status', 'eq', 'xac_nhan']], 'order_date desc', 1000);
  const customers = useCustomers();
  const { run, busy } = useAction();
  const [mode, setMode] = useState(null); const [orderId, setOrderId] = useState(''); const [cust, setCust] = useState(''); const [reason, setReason] = useState('');
  const t = txn;
  const open_orders = (orders.data || []).filter((o) => o.remaining_to_pay > 0)
    .sort((a, b) => (Math.abs(a.remaining_to_pay - t.amount) - Math.abs(b.remaining_to_pay - t.amount)));
  const done = async (r) => { if (r) onClose(); };
  return (
    <Modal title={`${t.direction === 'out' ? 'Tiền ra' : 'Tiền về'} ${money(t.amount)} đ`} subtitle={<span className="row gap-s"><StP s={t.status} /> {dmyhm(t.txn_at)}</span>} onClose={onClose} size="lg">
      <KV items={[['Nội dung', t.content || '—'], ['Người chuyển', t.counter_name || '—'], ['Tài khoản', t.account_no], ['Mã giao dịch', `${t.provider} · ${t.ext_id}`],
        t.ref && ['Mã tham chiếu NH', t.ref], t.match_note && ['Ghi chú', t.match_note], t.order_code && ['Đơn', t.order_code],
        t.payment_codes?.length > 0 && ['Phiếu thu', t.payment_codes.join(', ')], t.handled_by_name && ['Người xử lý', `${t.handled_by_name} · ${dmyhm(t.handled_at)}`]]} />
      {t.status === 'da_ghi' && <Note>Muốn sửa: mở phiếu thu ở mục Thu chi và hủy phiếu (có lý do) — giao dịch sẽ quay lại “Chờ xử lý” để ghi lại.</Note>}
      {t.status === 'cho_xu_ly' && can('thu_chi') && (
        <Section title="Ghi khoản tiền này vào sổ">
          <div className="row gap">
            <Btn kind={mode === 'order' ? 'soft' : 'ghost'} icon="order" onClick={() => setMode('order')}>Vào 1 đơn hàng</Btn>
            <Btn kind={mode === 'cust' ? 'soft' : 'ghost'} icon="users" onClick={() => setMode('cust')}>Vào công nợ 1 khách</Btn>
            <Btn kind="ghost" icon="route" onClick={() => { onClose(); open('cod-settle', { bank_txn: t }); }}>Tiền COD từ SPX / BEST</Btn>
            <Btn kind={mode === 'ignore' ? 'soft' : 'ghost'} icon="x" onClick={() => setMode('ignore')}>Bỏ qua</Btn>
          </div>
          {mode === 'order' && <>
            <Picker items={open_orders} value={orderId} onChange={setOrderId} placeholder="Chọn đơn (đơn có số còn phải trả gần với số tiền được xếp trước)…"
              getLabel={(o) => `${o.code} · ${o.customer_name}`} getSub={(o) => `còn phải trả ${money(o.remaining_to_pay)}${o.remaining_to_pay === t.amount ? ' · KHỚP SỐ TIỀN' : ''}`} />
            <div className="muted small">Nếu tiền về lớn hơn số còn phải trả, phần dư tính là khách trả trước.</div>
            <div><Btn kind="primary" busy={busy} disabled={!orderId} onClick={async () => done(await run('assign_bank_txn', { id: t.id, order_id: orderId }, (x) => `Đã ghi phiếu thu ${x.payment_code}`))}>Ghi vào đơn</Btn></div>
          </>}
          {mode === 'cust' && <>
            <Picker items={customers.data} value={cust} onChange={setCust} getLabel={(c) => c.name} getSub={(c) => `nợ ${money(c.receivable)}`} placeholder="Chọn khách hàng…" />
            <div className="muted small">Tự trừ vào các khoản nợ cũ nhất của khách trước; còn dư thì tính là trả trước.</div>
            <div><Btn kind="primary" busy={busy} disabled={!cust} onClick={async () => done(await run('assign_bank_txn', { id: t.id, customer_id: cust }, (x) => `Đã ghi phiếu thu ${x.payment_code}`))}>Ghi vào công nợ khách</Btn></div>
          </>}
          {mode === 'ignore' && <div className="row gap"><Input value={reason} onChange={setReason} placeholder="Lý do (vd. tiền cá nhân, chuyển giữa tài khoản)" style={{ maxWidth: 380 }} />
            <Btn kind="danger" busy={busy} onClick={async () => done(await run('ignore_bank_txn', { id: t.id, reason }, 'Đã bỏ qua'))}>Bỏ qua</Btn></div>}
        </Section>
      )}
    </Modal>
  );
}

// Bản chạy thử: giả lập 1 khoản tiền về (như SePay báo sang)
export function BankSimDialog({ onClose }) {
  const { book, rpc, refresh, toast } = useApp();
  const orders = useQ('sales_orders', [['status', 'eq', 'xac_nhan']], 'order_date desc', 200);
  const [amount, setAmount] = useState(null); const [content, setContent] = useState(''); const [name, setName] = useState('NGUYEN VAN A'); const [busy, setBusy] = useState(false);
  const pick = (orders.data || []).filter((o) => o.remaining_to_pay > 0).slice(0, 6);
  return (
    <Modal title="Giả lập tiền chuyển khoản về" subtitle="Chỉ có trong bản chạy thử — bản thật nhận từ SePay" onClose={onClose} size="md"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} disabled={!(amount > 0)} onClick={async () => {
        setBusy(true);
        try { const r = await rpc('demo_simulate', { what: 'bank', amount, content, counter_name: name }); refresh();
          toast(r.status === 'da_ghi' ? `Tự gạch nợ đơn ${r.order_code} · phiếu ${r.payment_code}` : 'Chưa khớp đơn — xem “Chờ xử lý”'); onClose(); }
        catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
      }}>Gửi giả lập</Btn></>}>
      <div className="muted small">Bấm một đơn để điền sẵn nội dung đúng mã:</div>
      <div className="row gap-s">{pick.map((o) => <Btn small key={o.id} onClick={() => { setAmount(o.remaining_to_pay); setContent(`${name} chuyen tien ${orderTransferContent(book, o.code)}`); }}>{o.code} · {money(o.remaining_to_pay)}</Btn>)}</div>
      <div className="grid">
        <Field label="Số tiền"><NumInput value={amount} onChange={setAmount} /></Field>
        <Field label="Người chuyển"><Input value={name} onChange={setName} /></Field>
        <Field label="Nội dung chuyển khoản" wide><Input value={content} onChange={setContent} placeholder="vd. chuyen tien THDH00012, SPX COD 14/10 hoặc BEST EXPRESS TT COD" /></Field>
      </div>
    </Modal>
  );
}
