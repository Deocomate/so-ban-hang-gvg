// Sổ công nợ của một đơn hàng (thẻ "Sổ công nợ" trong chi tiết đơn): các đợt khách trả (tiền đặt cọc / khách chuyển thêm) và nút
// "Thêm đợt thanh toán". Đơn thanh toán theo tiến độ giao hàng có thêm số đến hạn từng chuyến, cấn trừ tiền cọc, đợt quyết toán và hai
// số chỉ xem trong sổ nội bộ (tiền cọc chưa sử dụng, giá trị hàng đã giao chưa đến hạn) — hai số này không in lên biên bản đối chiếu.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { Btn, Pill, Field, Input, Select, DateInput, NumInput, Note, Table, Section, ConfirmBtn } from '../components/ui.jsx';
import { isProgress, payRatio, payTermLabel, invoiceMoney, progressStatement, receipts } from '../lib/pay-term.js';
import { QUICK_FUND_KEY, readFund } from './Sales.jsx';

const PURPOSES = [{ value: 'coc', label: 'Tiền đặt cọc' }, { value: 'thanh_toan', label: 'Khách chuyển thêm (thanh toán)' }];

export function OrderLedger({ order: d, pays }) {
  const { open, can } = useApp();
  const progress = isProgress(d);
  const invs = useQ('order_invoices', [['order_id', 'eq', d.id]], 'delivery_date', 500, d.kind === 'dat_hang');
  const adjs = useQ('order_adjustments', [['order_id', 'eq', d.id]], 'adj_date', 500, progress);
  const { run, busy } = useAction();
  const [form, setForm] = useState(null); // 'pay' | 'can_tru_coc' | 'quyet_toan'
  const [cutoff, setCutoff] = useState(todayVN());
  const canPay = can('thu_chi') && d.status !== 'huy' && d.status !== 'nhap';
  const rows = useMemo(() => receipts(pays).map((r) => ({ ...r, key: `${r.payment_id}|${r.purpose}` })), [pays]);
  const st = useMemo(() => (progress ? progressStatement({ ratio: payRatio(d), invoices: invs.data || [], pays: pays || [], adjustments: adjs.data || [], cutoff }) : null),
    [progress, d.pay_ratio, invs.data, pays, adjs.data, cutoff]);
  const single = !progress && (d.kind !== 'dat_hang' || d.delivery_count === 1);
  const m = invoiceMoney(pays, { whole: true });
  // Đơn giao một lần: giá trị hóa đơn (đã trừ hàng trả) − tiền cọc − các đợt thanh toán
  const invValue = d.kind === 'dat_hang' ? d.delivered_value : d.net_total;
  const left = invValue - m.total;
  const delAdj = (a) => run('delete_order_adjustment', { id: a.id }, `Đã xóa ${a.kind_label.toLowerCase()} ${money(a.amount)} đ`);

  return (
    <>
      <Section title="Sổ công nợ của đơn" actions={canPay && <div className="row gap-s">
        <Btn small kind="primary" icon="plus" onClick={() => setForm('pay')}>Thêm đợt thanh toán</Btn>
        {progress && <Btn small onClick={() => setForm('can_tru_coc')}>Cấn trừ tiền cọc</Btn>}
        {progress && <Btn small onClick={() => setForm('quyet_toan')}>Lập đợt quyết toán</Btn>}
      </div>}>
        <div className="small muted">{payTermLabel(d)}</div>
        {form === 'pay' && <PaymentForm order={d} invoices={invs.data || []} onDone={() => setForm(null)} />}
        {(form === 'can_tru_coc' || form === 'quyet_toan') && st && <AdjustForm order={d} kind={form} onDone={() => setForm(null)} />}
        {progress && st ? (
          <>
            <div className="row gap-s"><span className="small">Lũy kế đến hết ngày</span><DateInput value={cutoff} onChange={(v) => v && setCutoff(v)} aria-label="Ngày chốt" /></div>
            <div className="totals">
              <span>Tổng giá trị đơn hàng</span><span className="r">{money(d.order_total)}</span>
              <span>Giá trị hàng đã giao ({st.trips.length} chuyến)</span><span className="r">{money(st.delivered)}</span>
              <span>Đến hạn theo các chuyến ({st.ratio}%)</span><span className="r">{money(st.dueTrips)}</span>
              {st.settled > 0 && <><span>Đến hạn bổ sung khi quyết toán</span><span className="r">{money(st.settled)}</span></>}
              <span className="strong">Tổng số tiền đã đến hạn (1)</span><span className="r strong">{money(st.due)}</span>
              <span>Khách chuyển thêm sau đặt cọc (2)</span><span className="r">{money(st.paid)}</span>
              <span>Tiền cọc đã cấn trừ (3)</span><span className="r">{money(st.offset)}</span>
              {st.remaining >= 0
                ? <><span className="strong bad">Còn phải thanh toán (1) − (2) − (3)</span><span className="r strong bad">{money(st.remaining)}</span></>
                : <><span className="strong good">Khách đã thanh toán dư</span><span className="r strong good">{money(-st.remaining)}</span></>}
            </div>
            <Note>
              <b>Chỉ trong sổ nội bộ</b> (không in lên biên bản): tiền cọc đã nhận {money(st.deposit)} · <b>tiền cọc chưa sử dụng {money(st.depositLeft)}</b> ·
              <b> giá trị hàng đã giao chưa đến hạn {money(st.notDue)}</b>.
            </Note>
            <Table dense rows={st.trips} empty="Chưa giao chuyến nào đến ngày này" columns={[
              { key: 'n', label: 'Chuyến', render: (t) => <><b>Chuyến {t.no}</b><div className="cell-sub">{t.code} · {dmy(t.date)}</div></> },
              { key: 'v', label: 'Giá trị thực giao', align: 'right', render: (t) => money(t.value) },
              { key: 'd', label: `Đến hạn (${st.ratio}%)`, align: 'right', render: (t) => <b>{money(t.due)}</b> },
              { key: 'k', label: 'Chưa đến hạn', align: 'right', render: (t) => <span className="muted">{money(t.value - t.due)}</span> },
            ]} />
            {(adjs.data || []).length > 0 && <Table dense rows={adjs.data} columns={[
              { key: 'k', label: 'Cấn trừ cọc / quyết toán', render: (a) => <><b>{a.kind_label}</b><div className="cell-sub">{dmy(a.adj_date)}{a.note ? ` · ${a.note}` : ''}{a.adj_date > cutoff ? ' · sau ngày đang xem' : ''}</div></> },
              { key: 'a', label: 'Số tiền', align: 'right', render: (a) => money(a.amount) },
              ...(canPay ? [{ key: 'x', label: '', render: (a) => <ConfirmBtn small busy={busy} onConfirm={() => delAdj(a)}>Xóa</ConfirmBtn> }] : []),
            ]} />}
          </>
        ) : (
          <div className="totals">
            {single && <><span>Tổng giá trị hóa đơn</span><span className="r">{money(invValue)}</span></>}
            <span>Tiền cọc đã nhận</span><span className="r">{money(m.deposit)}</span>
            <span>Các đợt thanh toán bổ sung</span><span className="r">{money(m.paid)}</span>
            {single && (left >= 0 ? <><span className="strong">Còn phải thanh toán</span><span className="r strong">{money(left)}</span></>
              : <><span className="strong good">Khách đã thanh toán dư</span><span className="r strong good">{money(-left)}</span></>)}
            {!single && d.kind === 'dat_hang' && d.delivery_count > 1 && <span className="muted small" style={{ gridColumn: '1 / -1' }}>Đơn đã giao nhiều chuyến: mỗi hóa đơn chỉ trừ tiền trả cho đúng hóa đơn đó; tiền cọc ghi riêng, trừ vào tổng công nợ của khách.</span>}
          </div>
        )}
        <Table dense rows={rows} rowKey="key" empty="Chưa có khoản thu" onRow={(r) => open('pay-detail', { id: r.payment_id })} columns={[
          { key: 'c', label: 'Phiếu thu', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.date)} · {r.fund_name}</div></> },
          { key: 'k', label: 'Loại', render: (r) => (r.amount < 0 ? <Pill tone="warn">Hoàn tiền</Pill> : r.purpose === 'coc' ? <Pill tone="accent">Đặt cọc</Pill> : 'Thanh toán') },
          { key: 'g', label: 'Mã giao dịch / ghi chú', render: (r) => <>{r.ref_no || '—'}{r.note && <div className="cell-sub">{r.note}</div>}</> },
          { key: 'i', label: 'Chuyến', render: (r) => r.invoice_code || '' },
          { key: 'a', label: 'Số tiền', align: 'right', render: (r) => <span className={r.amount < 0 ? 'bad' : ''}>{money(r.amount)}</span> },
        ]} />
      </Section>
    </>
  );
}

// Thêm đợt thanh toán: loại tiền, ngày nhận, số tiền, mã giao dịch, ghi chú, quỹ nhận; chuyến giao tùy chọn (một lần chuyển có thể trả nhiều chuyến)
function PaymentForm({ order: d, invoices, onDone }) {
  const funds = useFunds();
  const { run, busy } = useAction();
  const [f, setF] = useState({ purpose: d.delivery_count === 0 && !(d.paid_net > 0) ? 'coc' : 'thanh_toan', date: todayVN(), amount: null, ref_no: '', note: '', delivery_id: '', fund_id: readFund() });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { if (funds.data?.length && !funds.data.some((x) => x.id === f.fund_id)) set('fund_id', funds.data[0].id); }, [funds.data]);
  const save = async () => {
    try { localStorage.setItem(QUICK_FUND_KEY, f.fund_id); } catch (e) { /* bỏ qua */ }
    const r = await run('add_order_payment', { order_id: d.id, ...f, delivery_id: f.delivery_id || null },
      (x) => `Đã ghi ${f.purpose === 'coc' ? 'tiền đặt cọc' : 'đợt thanh toán'} ${money(f.amount)} đ – phiếu ${x.code}`);
    if (r) onDone();
  };
  return (
    <div className="card stack-s">
      <b>Thêm đợt thanh toán</b>
      <div className="grid">
        <Field label="Loại tiền"><Select value={f.purpose} onChange={(v) => set('purpose', v || 'thanh_toan')} options={PURPOSES} aria-label="Loại tiền" /></Field>
        <Field label="Ngày nhận tiền"><DateInput value={f.date} max={todayVN()} onChange={(v) => v && set('date', v)} aria-label="Ngày nhận tiền" /></Field>
        <Field label="Số tiền" required><NumInput value={f.amount} onChange={(v) => set('amount', v)} min={0} aria-label="Số tiền" autoFocus /></Field>
        <Field label="Mã giao dịch" hint="Mỗi giao dịch chỉ ghi nhận một lần"><Input value={f.ref_no} onChange={(v) => set('ref_no', v)} placeholder="Mã giao dịch ngân hàng (nếu có)" aria-label="Mã giao dịch" /></Field>
        <Field label="Thu vào quỹ"><Select value={f.fund_id} onChange={(v) => set('fund_id', v)} options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} aria-label="Thu vào quỹ" /></Field>
        {invoices.length > 0 && <Field label="Chuyến giao (tùy chọn)"><Select value={f.delivery_id} onChange={(v) => set('delivery_id', v || '')}
          options={[{ value: '', label: 'Theo đơn hàng – không gắn chuyến' }, ...invoices.map((x, i) => ({ value: x.id, label: `Chuyến ${i + 1} · ${x.code} · ${dmy(x.delivery_date)}` }))]} aria-label="Chuyến giao" /></Field>}
        <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => set('note', v)} placeholder="Ghi chú (nếu có)" aria-label="Ghi chú" /></Field>
      </div>
      <div className="row gap-s">
        <Btn kind="primary" busy={busy} disabled={!(Number(f.amount) > 0) || !f.fund_id} onClick={save}>Lưu đợt thanh toán</Btn>
        <Btn onClick={onDone}>Thôi</Btn>
      </div>
    </div>
  );
}

// Cấn trừ tiền cọc (dùng tiền cọc đã nhận, không tạo khoản thu mới) / lập đợt quyết toán (đưa phần chưa đến hạn vào số đến hạn)
function AdjustForm({ order: d, kind, onDone }) {
  const { run, busy } = useAction();
  const [f, setF] = useState({ date: todayVN(), amount: null, note: '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const offset = kind === 'can_tru_coc';
  const save = async () => {
    const r = await run('add_order_adjustment', { order_id: d.id, kind, ...f }, `Đã ghi ${offset ? 'cấn trừ tiền cọc' : 'đợt quyết toán'} ${money(f.amount)} đ`);
    if (r) onDone();
  };
  return (
    <div className="card stack-s">
      <b>{offset ? 'Cấn trừ tiền cọc' : 'Lập đợt quyết toán'}</b>
      <div className="small muted">{offset
        ? 'Dùng một phần hoặc toàn bộ số dư tiền cọc. Không vượt quá số dư cọc và số tiền còn phải thu tại ngày cấn trừ.'
        : 'Đưa phần giá trị hàng đã giao chưa đến hạn vào số tiền đến hạn. Mỗi khoản chỉ được tính một lần.'}</div>
      <div className="grid">
        <Field label={offset ? 'Ngày cấn trừ' : 'Ngày quyết toán'}><DateInput value={f.date} max={todayVN()} onChange={(v) => v && set('date', v)} aria-label="Ngày" /></Field>
        <Field label="Số tiền" required><NumInput value={f.amount} onChange={(v) => set('amount', v)} min={0} aria-label="Số tiền" autoFocus /></Field>
        <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => set('note', v)} placeholder="Ghi chú (nếu có)" aria-label="Ghi chú" /></Field>
      </div>
      <div className="row gap-s">
        <Btn kind="primary" busy={busy} disabled={!(Number(f.amount) > 0)} onClick={save}>Lưu</Btn>
        <Btn onClick={onDone}>Thôi</Btn>
      </div>
    </div>
  );
}
