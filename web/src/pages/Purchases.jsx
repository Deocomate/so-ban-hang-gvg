import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, todayVN, match, dmyhm } from '../lib/format.js';
import { useProducts, useSuppliers, useFunds, productLabel, productSub, KIND_LABEL } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import {
  Btn, Icon, Pill, StatusPill, RECEIVE, Field, Input, TextArea, Select, DateInput, NumInput, Check, Tabs, Search, Loading,
  ErrorBox, Note, Table, Modal, ConfirmBtn, Picker, KV, Section, ListPage, FilterBox, RadioList,
} from '../components/ui.jsx';

export function PurchasesPage() {
  const { open } = useApp();
  const [tab, setTab] = useState('open');
  const [search, setSearch] = useState('');
  const { data, error } = useQ('purchase_orders', [], 'created_at desc', 3000);
  const rows = useMemo(() => (data || []).filter((o) => {
    if (!match(`${o.code} ${o.supplier_name} ${o.sales_order_code || ''} ${o.note || ''}`, search)) return false;
    switch (tab) {
      case 'open': return o.status === 'xac_nhan' && o.remaining_qty > 0;
      case 'sx': return o.kind === 'dat_sx' && o.status === 'xac_nhan' && o.remaining_qty > 0;
      case 'draft': return o.status === 'nhap';
      case 'debt': return o.payable > 0;
      case 'done': return o.status === 'xac_nhan' && o.remaining_qty === 0;
      case 'cancel': return o.status === 'huy';
      default: return true;
    }
  }), [data, tab, search]);
  const count = (f) => (data || []).filter(f).length;
  const sum = (k) => rows.reduce((s, o) => s + (o[k] || 0), 0);
  return (
    <ListPage title="Nhập hàng / đặt xưởng" sub="Đơn đặt chưa làm tăng tồn kho. Tồn chỉ tăng khi lập phiếu nhận hàng thực tế."
      filters={<FilterBox title="Trạng thái"><RadioList value={tab} onChange={setTab} options={[
        { value: 'open', label: 'Chờ hàng về', count: count((o) => o.status === 'xac_nhan' && o.remaining_qty > 0) },
        { value: 'sx', label: 'Đang đặt xưởng', count: count((o) => o.kind === 'dat_sx' && o.status === 'xac_nhan' && o.remaining_qty > 0) },
        { value: 'draft', label: 'Nháp', count: count((o) => o.status === 'nhap') },
        { value: 'debt', label: 'Còn nợ NCC', count: count((o) => o.payable > 0) },
        { value: 'done', label: 'Đã nhận đủ' }, { value: 'cancel', label: 'Đã hủy' }, { value: 'all', label: 'Tất cả' },
      ]} /></FilterBox>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã đơn, xưởng, đơn bán liên quan…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('don-nhap.xlsx', [{ name: 'Đơn nhập', rows, columns: [
          { key: 'code', label: 'Mã' }, { key: 'order_date', label: 'Ngày', type: 'date' }, { key: 'supplier_name', label: 'NCC / xưởng' }, { key: 'kind', label: 'Loại', get: (r) => KIND_LABEL[r.kind] },
          { key: 'progress', label: 'Tiến độ' }, { key: 'expected_date', label: 'Hẹn nhận', type: 'date' }, { key: 'order_total', label: 'Tổng đơn' }, { key: 'received_value', label: 'Đã nhận (giá trị)' },
          { key: 'paid_net', label: 'Đã trả' }, { key: 'payable', label: 'Còn nợ' }] }])}>Xuất Excel</Btn>
        <Btn kind="primary" icon="plus" onClick={() => open('po-form', {})}>Tạo đơn nhập</Btn>
      </>}>
      <ErrorBox error={error} />
      <Table rows={data ? rows : null} onRow={(o) => open('po', { id: o.id })} rowClass={(o) => (o.is_late ? 'row-late' : '')}
        foot={rows.length ? { c: `${rows.length} đơn`, t: money(sum('order_total')), d: money(sum('payable')) } : null} columns={[
        { key: 'c', label: 'Đơn nhập', render: (o) => <><div className="cell-main">{o.code}</div><div className="cell-sub">{dmy(o.order_date)} · {KIND_LABEL[o.kind]}</div></> },
        { key: 's', label: 'Xưởng / NCC', render: (o) => <><div>{o.supplier_name}</div>{o.sales_order_code && <div className="cell-sub">cho đơn {o.sales_order_code} · {o.sales_customer_name}</div>}</> },
        { key: 'p', label: 'Tiến độ', render: (o) => <div className="row gap-s"><Pill tone={o.receive_status === 'da_nhan_du' ? 'good' : o.status === 'huy' ? 'mute' : o.receive_status === 'nhan_mot_phan' ? 'info' : 'warn'}>{o.progress}</Pill>{o.is_late && <Pill tone="bad">trễ hẹn</Pill>}</div> },
        { key: 'e', label: 'Hẹn nhận', render: (o) => dmy(o.expected_date) },
        { key: 't', label: 'Tổng đơn', align: 'right', render: (o) => money(o.order_total) },
        { key: 'd', label: 'Còn nợ', align: 'right', render: (o) => (o.payable > 0 ? <b className={o.overdue_days > 0 ? 'bad' : ''}>{money(o.payable)}</b> : o.prepaid > 0 ? <span className="muted small">đã cọc {money(o.prepaid)}</span> : '—') },
      ]} />
    </ListPage>
  );
}

let seq = 0;
const nl = (p = {}) => ({ key: ++seq, product_id: '', qty: 1, unit_cost: null, ...p });

export function PoForm({ id, kind: kind0, sales_order_id, supplier_id: sup0, lines: lines0, product_id, onClose }) {
  const { settings, open, can, rpc, toast } = useApp();
  const products = useProducts();
  const suppliers = useSuppliers();
  const funds = useFunds(can('thu_chi'));
  const so = useQ('sales_orders', [['status', 'eq', 'xac_nhan']], 'created_at desc', 500);
  const { run, busy } = useAction();
  const [loaded, setLoaded] = useState(!id);
  const [f, setF] = useState({
    kind: kind0 || 'mua_san', supplier_id: sup0 || '', order_date: todayVN(), expected_date: '', sales_order_id: sales_order_id || '', note: '',
    prod_step: '', lines: lines0?.length ? lines0.map((l) => nl(l)) : [nl(product_id ? { product_id } : {})], pay: { amount: null, fund_id: '', method: 'Chuyển khoản' },
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const pmap = useMemo(() => Object.fromEntries((products.data || []).map((p) => [p.id, p])), [products.data]);
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [o] = await rpc('q', { view: 'purchase_orders', filters: [['id', 'eq', id]] });
      const ls = await rpc('q', { view: 'purchase_order_lines', filters: [['po_id', 'eq', id]], order: 'line_no' });
      setF((s) => ({ ...s, code: o.code, kind: o.kind, supplier_id: o.supplier_id, order_date: o.order_date, expected_date: o.expected_date || '', sales_order_id: o.sales_order_id || '',
        note: o.note || '', lines: ls.map((l) => nl({ id: l.id, product_id: l.product_id, qty: l.qty, unit_cost: l.unit_cost, sales_order_line_id: l.sales_order_line_id })) }));
      setLoaded(true);
    })().catch((e) => toast(e.message, 'err'));
  }, [id]);
  useEffect(() => { if (!f.pay.fund_id && funds.data?.length) setF((s) => ({ ...s, pay: { ...s.pay, fund_id: funds.data[0].id } })); }, [funds.data]);
  useEffect(() => { // điền giá nhập gần nhất (giá vốn bình quân) khi chưa có
    if (!products.data) return;
    setF((s) => ({ ...s, lines: s.lines.map((l) => (l.product_id && (l.unit_cost === null || l.unit_cost === undefined) && pmap[l.product_id]?.avg_cost ? { ...l, unit_cost: Math.round(pmap[l.product_id].avg_cost) } : l)) }));
  }, [products.data]);
  const setLine = (key, patch) => setF((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const total = f.lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.unit_cost) || 0)), 0);
  const submit = async (mode) => {
    const lines = f.lines.filter((l) => l.product_id);
    if (!lines.length) { toast('Đơn nhập chưa có sản phẩm', 'err'); return; }
    const amt = Number(f.pay.amount) || 0;
    const r = await run('save_purchase_order', {
      id: id || null, kind: f.kind, supplier_id: f.supplier_id, order_date: f.order_date, expected_date: f.expected_date || null, sales_order_id: f.sales_order_id || null,
      note: f.note, prod_step: f.prod_step || null, status: mode === 'draft' ? 'nhap' : 'xac_nhan', receive_now: mode === 'receive',
      lines: lines.map((l) => ({ id: l.id || null, product_id: l.product_id, qty: Number(l.qty), unit_cost: l.unit_cost, sales_order_line_id: l.sales_order_line_id || null })),
      deposit: amt > 0 ? { amount: amt, fund_id: f.pay.fund_id, method: f.pay.method } : null,
    }, (x) => `Đã lưu đơn nhập ${x.code}${x.receipt_code ? ' · đã nhập kho ' + x.receipt_code : ''}${x.payment_code ? ' · phiếu chi ' + x.payment_code : ''}`);
    if (r) { onClose(); if (!id) open('po', { id: r.id }); }
  };
  if (!loaded || !products.data || !suppliers.data) return <Modal title="Đơn nhập" onClose={onClose} size="xl"><Loading /></Modal>;
  const steps = settings.prod_steps || [];
  return (
    <Modal title={id ? `Sửa đơn nhập ${f.code}` : f.kind === 'dat_sx' ? 'Đặt xưởng sản xuất' : 'Nhập hàng / đặt nhà cung cấp'} onClose={onClose} size="xl"
      subtitle="Đơn đặt chưa tăng tồn. Chọn “Nhập kho ngay” khi hàng đã về đủ ngay lúc lập."
      footer={<>
        <Btn busy={busy} onClick={() => submit('draft')}>Lưu nháp</Btn>
        <Btn kind="soft" busy={busy} onClick={() => submit('confirm')}>{f.kind === 'dat_sx' ? 'Gửi đặt xưởng' : 'Xác nhận đặt hàng'}</Btn>
        {f.kind === 'mua_san' && <Btn kind="primary" icon="in" busy={busy} onClick={() => submit('receive')}>Nhập kho ngay</Btn>}
      </>}>
      <div className="grid">
        <Field label="Loại"><Select value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'mua_san', label: 'Mua hàng có sẵn' }, { value: 'dat_sx', label: 'Đặt xưởng sản xuất' }]} /></Field>
        <Field label="Xưởng / nhà cung cấp" required>
          <Picker items={suppliers.data} value={f.supplier_id} onChange={(v) => set('supplier_id', v)} getLabel={(s) => s.name} getSub={(s) => `${s.code} · đang nợ ${money(s.payable)}`}
            onCreate={(name) => open('party', { type: 'ncc', name, onSaved: (r) => set('supplier_id', r.id) })} createLabel="Thêm nhà cung cấp" />
        </Field>
        <Field label="Ngày đặt"><DateInput value={f.order_date} onChange={(v) => set('order_date', v)} max={todayVN()} /></Field>
        <Field label="Ngày hẹn nhận"><DateInput value={f.expected_date} onChange={(v) => set('expected_date', v)} /></Field>
        {f.kind === 'dat_sx' && !id && <Field label="Trạng thái sản xuất ban đầu"><Select value={f.prod_step} onChange={(v) => set('prod_step', v)} options={steps} placeholder={steps[0] || ''} /></Field>}
        <Field label="Cho đơn bán (nếu có)"><Select value={f.sales_order_id} onChange={(v) => set('sales_order_id', v)} placeholder="(nhập về kho để bán)"
          options={(so.data || []).filter((o) => o.remaining_qty > 0).map((o) => ({ value: o.id, label: `${o.code} · ${o.customer_name}` }))} /></Field>
      </div>
      {f.sales_order_id && f.lines.some((l) => l.sales_order_line_id) && <Note>Hàng nhận về của các dòng gắn với đơn bán sẽ được tự động giữ cho khách đó.</Note>}
      <div className="lines">
        <div className="line line-head" style={{ gridTemplateColumns: 'minmax(0,2.4fr) 100px 140px 140px 32px' }}><span>Sản phẩm</span><span className="r">Số lượng</span><span className="r">Giá nhập</span><span className="r">Thành tiền</span><span /></div>
        {f.lines.map((l) => (
          <div className="line" key={l.key} style={{ gridTemplateColumns: 'minmax(0,2.4fr) 100px 140px 140px 32px' }}>
            <div className="stack" style={{ gap: 2 }}>
              <Picker items={(products.data || []).filter((p) => !p.is_kit)} value={l.product_id} placeholder="Tìm sản phẩm…" getLabel={productLabel}
                filterKeys={(p) => `${p.sku} ${p.name} ${p.size || ''} ${p.color || ''}`}
                onChange={(v, p) => setLine(l.key, { product_id: v, unit_cost: p.avg_cost ? Math.round(p.avg_cost) : l.unit_cost })}
                renderItem={(p) => <><span><b>{p.sku}</b> · {p.name}</span><span className="muted small">{productSub(p)} · tồn {fq(p.on_hand)}{p.avg_cost ? ` · giá vốn ${money(p.avg_cost)}` : ''}</span></>} />
              {l.sales_order_line_id && <span className="stockhint">Gắn với dòng đơn bán</span>}
            </div>
            <NumInput money={false} min={0} value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} aria-label="Số lượng" />
            <NumInput value={l.unit_cost} onChange={(v) => setLine(l.key, { unit_cost: v })} />
            <span className="total">{money((Number(l.qty) || 0) * (Number(l.unit_cost) || 0))}</span>
            <button className="icon-btn" onClick={() => setF((s) => ({ ...s, lines: s.lines.length > 1 ? s.lines.filter((x) => x.key !== l.key) : [nl()] }))} aria-label="Xóa dòng"><Icon name="x" /></button>
          </div>
        ))}
        <div><Btn small icon="plus" onClick={() => setF((s) => ({ ...s, lines: [...s.lines, nl()] }))}>Thêm dòng</Btn></div>
      </div>
      <div className="grid-2">
        <Field label="Ghi chú"><TextArea value={f.note} onChange={(v) => set('note', v)} rows={3} /></Field>
        <div className="stack">
          <div className="card"><div className="totals"><span className="strong">Tổng tiền đơn nhập</span><span className="r big">{money(total)} đ</span></div></div>
          {can('thu_chi') && <Section title={f.kind === 'dat_sx' ? 'Đặt cọc cho xưởng' : 'Trả tiền ngay'} actions={<Btn small onClick={() => setF((s) => ({ ...s, pay: { ...s.pay, amount: total } }))}>Trả đủ</Btn>}>
            <div className="grid">
              <Field label="Số tiền"><NumInput value={f.pay.amount} onChange={(v) => setF((s) => ({ ...s, pay: { ...s.pay, amount: v } }))} placeholder="0" /></Field>
              <Field label="Từ quỹ"><Select value={f.pay.fund_id} onChange={(v) => setF((s) => ({ ...s, pay: { ...s.pay, fund_id: v } }))} options={(funds.data || []).map((x) => ({ value: x.id, label: `${x.name} (${money(x.balance)})` }))} /></Field>
            </div>
          </Section>}
        </div>
      </div>
    </Modal>
  );
}

export function PoDetail({ id, onClose }) {
  const { open, can, settings } = useApp();
  const o = useQ('purchase_orders', [['id', 'eq', id]]);
  const lines = useQ('purchase_order_lines', [['po_id', 'eq', id]], 'line_no');
  const recs = useQ('receipts', [['po_id', 'eq', id]], 'created_at');
  const rets = useQ('supplier_returns', [['po_id', 'eq', id]], 'created_at');
  const pays = useQ('doc_payments', [['doc_id', 'eq', id]], 'pay_date');
  const { run, busy } = useAction();
  const [cancel, setCancel] = useState(null); const [reason, setReason] = useState('');
  const d = o.data?.[0];
  if (!d) return <Modal title="Đơn nhập" onClose={onClose} size="lg">{o.error ? <ErrorBox error={o.error} /> : <Loading />}</Modal>;
  const steps = settings.prod_steps || [];
  const curIdx = steps.indexOf(d.prod_step);
  const payKind = d.prepaid > 0 && d.remaining_to_pay < 0 ? 'ncc_hoan' : 'tra_ncc';
  return (
    <Modal title={`Đơn nhập ${d.code}`} onClose={onClose} size="xl"
      subtitle={<span className="row gap-s">{KIND_LABEL[d.kind]} · {d.supplier_name} · {dmy(d.order_date)} <StatusPill map={RECEIVE} value={d.receive_status} /> {d.is_late && <Pill tone="bad">trễ hẹn nhận</Pill>}</span>}
      footer={<>
        <span className="grow" />
        {d.status !== 'huy' && d.receive_status !== 'da_nhan_du' && d.received_qty === 0 && <Btn icon="edit" onClick={() => { onClose(); open('po-form', { id }); }}>Sửa</Btn>}
        {d.status === 'nhap' && <Btn kind="soft" busy={busy} onClick={() => run('confirm_purchase_order', { id }, 'Đã xác nhận đơn nhập')}>Xác nhận</Btn>}
        {can('thu_chi') && d.status !== 'nhap' && (d.remaining_to_pay > 0 || payKind === 'ncc_hoan') && <Btn kind="soft" icon="out" onClick={() => open('payment', { kind: payKind, party_id: d.supplier_id,
          alloc: { doc_type: 'don_mua', doc_id: d.id, code: d.code, amount: payKind === 'tra_ncc' ? d.remaining_to_pay : d.paid_net - d.received_value } })}>{payKind === 'tra_ncc' ? (d.received_value === 0 ? 'Đặt cọc / trả tiền' : 'Trả tiền NCC') : 'NCC hoàn tiền'}</Btn>}
        {d.received_value > 0 && <Btn icon="return" onClick={() => open('po-return', { po: d })}>Trả hàng NCC</Btn>}
        {d.status === 'xac_nhan' && d.remaining_qty > 0 && <Btn kind="primary" icon="in" onClick={() => open('receive', { po: d })}>Nhận hàng</Btn>}
      </>}>
      {d.kind === 'dat_sx' && d.status === 'xac_nhan' && d.remaining_qty > 0 && (
        <Section title="Tiến độ sản xuất" actions={d.prod_step_at && <span className="muted small">cập nhật {dmyhm(d.prod_step_at)}</span>}>
          <div className="steps">
            {steps.map((s, i) => <button key={s} className={`step${i < curIdx ? ' done' : i === curIdx ? ' cur' : ''}`} disabled={busy} onClick={() => run('set_prod_step', { id, step: s }, 'Đã cập nhật: ' + s)}>{i < curIdx && <Icon name="check" size={13} />}{s}</button>)}
            <span className={`step${d.received_qty > 0 ? ' cur' : ''}`} style={{ cursor: 'default' }}>{d.received_qty > 0 ? 'Đã nhận một phần' : 'Nhận hàng (tự động)'}</span>
          </div>
          <div className="muted small">Bấm vào bước để cập nhật khi xưởng báo. “Đã nhận một phần / đã nhận đủ” tự chuyển khi lập phiếu nhận hàng.</div>
        </Section>
      )}
      <div className="grid-2">
        <KV items={[
          ['Xưởng / NCC', <a href="#" onClick={(e) => { e.preventDefault(); open('party-detail', { type: 'ncc', id: d.supplier_id }); }}>{d.supplier_name}</a>],
          ['Điện thoại', d.supplier_phone || '—'], ['Hẹn nhận', d.expected_date ? dmy(d.expected_date) : '—'], ['Tiến độ', d.progress],
          d.sales_order_code && ['Cho đơn bán', <a href="#" onClick={(e) => { e.preventDefault(); open('order', { id: d.sales_order_id }); }}>{d.sales_order_code} · {d.sales_customer_name}</a>],
          d.note && ['Ghi chú', <span style={{ whiteSpace: 'pre-wrap' }}>{d.note}</span>], d.cancel_reason && ['Lý do hủy', d.cancel_reason],
        ]} />
        <div className="card"><div className="totals">
          <span>Tổng đơn</span><span className="r strong">{money(d.order_total)}</span>
          <span>Đã nhận (giá trị)</span><span className="r">{money(d.received_value)}</span>
          <span>Đã trả NCC</span><span className="r">{money(d.paid_net)}</span>
          <span className="strong">Còn nợ NCC</span><span className={`r strong ${d.payable > 0 ? 'bad' : ''}`}>{money(d.payable)}</span>
          {d.prepaid > 0 && <><span>Đã cọc / trả trước</span><span className="r good">{money(d.prepaid)}</span></>}
          {d.pay_due_date && <><span>Hạn trả</span><span className={`r ${d.overdue_days > 0 ? 'bad' : ''}`}>{dmy(d.pay_due_date)}{d.overdue_days > 0 ? ` (quá ${d.overdue_days} ngày)` : ''}</span></>}
        </div></div>
      </div>
      <Section title="Hàng đặt">
        <Table dense rows={lines.data} columns={[
          { key: 'p', label: 'Sản phẩm', render: (l) => <><div className="cell-main">{l.sku} · {l.product_name}</div>{l.sales_order_code && <div className="cell-sub">giữ cho đơn {l.sales_order_code}</div>}</> },
          { key: 'q', label: 'SL đặt', align: 'right', render: (l) => <>{fq(l.eff_qty)}{l.cancelled_qty > 0 && <div className="cell-sub">hủy {fq(l.cancelled_qty)}</div>}</> },
          { key: 'c', label: 'Giá nhập', align: 'right', render: (l) => money(l.unit_cost) },
          { key: 'r', label: 'Đã nhận', align: 'right', render: (l) => <>{fq(l.received_qty)}{l.returned_qty > 0 && <div className="cell-sub">trả {fq(l.returned_qty)}</div>}</> },
          { key: 'rm', label: 'Còn chờ', align: 'right', render: (l) => (l.remaining_qty > 0 ? <b>{fq(l.remaining_qty)}</b> : '—') },
        ]} />
      </Section>
      <div className="grid-2">
        <Section title="Phiếu nhận hàng">
          <Table dense rows={recs.data} empty="Chưa nhận hàng" columns={[
            { key: 'c', label: 'Phiếu', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.receipt_date)}</div></> },
            { key: 'l', label: 'Hàng', render: (r) => (r.lines || []).map((x) => `${x.sku} × ${fq(x.qty)}`).join('; ') },
            { key: 'v', label: 'Giá trị', align: 'right', render: (r) => money(r.value) },
          ]} />
          {(rets.data || []).length > 0 && <Table dense rows={rets.data} columns={[
            { key: 'c', label: 'Trả NCC', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.return_date)} · {r.reason}</div></> },
            { key: 'v', label: 'Giá trị', align: 'right', render: (r) => money(r.value) },
          ]} />}
        </Section>
        <Section title="Thanh toán">
          <Table dense rows={pays.data} empty="Chưa trả tiền" columns={[
            { key: 'c', label: 'Phiếu', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.pay_date)} · {r.fund_name}</div></> },
            { key: 'a', label: 'Số tiền', align: 'right', render: (r) => money(r.signed_amount) },
          ]} />
        </Section>
      </div>
      {d.status !== 'huy' && (
        <Section title="Hủy">
          {!cancel ? <div className="row gap">
            {d.received_qty === 0 && <Btn onClick={() => setCancel('all')}>Hủy đơn nhập</Btn>}
            {d.received_qty > 0 && d.remaining_qty > 0 && <Btn onClick={() => setCancel('rest')}>Hủy phần chưa nhận</Btn>}
            <span className="muted small">Hàng đã nhận không xóa được — dùng “Trả hàng NCC”.</span>
          </div> : <div className="row gap">
            <Input value={reason} onChange={setReason} placeholder="Lý do (bắt buộc)" style={{ maxWidth: 360 }} />
            <ConfirmBtn kind="danger" busy={busy} onConfirm={async () => { if (await run(cancel === 'all' ? 'cancel_purchase_order' : 'cancel_po_remaining', { id, reason }, 'Đã hủy')) setCancel(null); }}>Xác nhận hủy</ConfirmBtn>
            <Btn onClick={() => setCancel(null)}>Thôi</Btn>
          </div>}
        </Section>
      )}
    </Modal>
  );
}

export function ReceiveDialog({ po, onClose }) {
  const lines = useQ('purchase_order_lines', [['po_id', 'eq', po.id]], 'line_no');
  const { run, busy } = useAction();
  const [q, setQ] = useState({}); const [c, setC] = useState({});
  const [date, setDate] = useState(todayVN()); const [note, setNote] = useState('');
  useEffect(() => { if (lines.data) { setQ(Object.fromEntries(lines.data.filter((l) => l.remaining_qty > 0).map((l) => [l.id, l.remaining_qty]))); setC(Object.fromEntries(lines.data.map((l) => [l.id, l.unit_cost]))); } }, [lines.data]);
  const total = (lines.data || []).reduce((s, l) => s + (Number(q[l.id]) || 0) * (Number(c[l.id]) || 0), 0);
  return (
    <Modal title={`Nhận hàng – ${po.code}`} subtitle={po.supplier_name} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" icon="in" busy={busy} onClick={async () => {
        const r = await run('receive', { po_id: po.id, date, note, lines: Object.entries(q).map(([k, v]) => ({ po_line_id: k, qty: Number(v) || 0, unit_cost: c[k] })) }, (x) => `Đã nhập kho – phiếu ${x.code}`);
        if (r) onClose();
      }}>Nhập kho</Btn></>}>
      <Note>Nhập theo số lượng thực nhận (có thể nhận nhiều đợt). Giá vốn bình quân của từng mã được tính lại ngay sau khi nhập.</Note>
      {!lines.data ? <Loading /> : <Table dense rows={lines.data.filter((l) => l.remaining_qty > 0)} columns={[
        { key: 'p', label: 'Sản phẩm', render: (l) => <div className="cell-main">{l.sku} · {l.product_name}</div> },
        { key: 'r', label: 'Còn chờ', align: 'right', render: (l) => fq(l.remaining_qty) },
        { key: 'q', label: 'Thực nhận', align: 'right', render: (l) => <NumInput money={false} stepper min={0} value={q[l.id]} onChange={(v) => setQ((s) => ({ ...s, [l.id]: v }))} style={{ maxWidth: 150, marginLeft: 'auto' }} aria-label="Thực nhận" /> },
        { key: 'c', label: 'Giá nhập', align: 'right', render: (l) => <NumInput value={c[l.id]} onChange={(v) => setC((s) => ({ ...s, [l.id]: v }))} style={{ maxWidth: 130 }} /> },
      ]} />}
      <div className="grid">
        <Field label="Ngày nhận"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        <Field label="Ghi chú"><Input value={note} onChange={setNote} placeholder="vd. Đợt 1, 2 viên nứt đã trả lại xưởng" /></Field>
        <Field label="Giá trị nhập lần này (tăng nợ NCC)"><Input value={money(total)} readOnly /></Field>
      </div>
    </Modal>
  );
}

export function SupplierReturnDialog({ po, onClose }) {
  const { can } = useApp();
  const recs = useQ('receipts', [['po_id', 'eq', po.id]], 'created_at');
  const funds = useFunds(can('thu_chi'));
  const { run, busy } = useAction();
  const [q, setQ] = useState({}); const [date, setDate] = useState(todayVN()); const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(null); const [fund, setFund] = useState('');
  useEffect(() => { if (!fund && funds.data?.length) setFund(funds.data[0].id); }, [funds.data]);
  const rl = (recs.data || []).flatMap((r) => (r.lines || []).map((l) => ({ ...l, code: r.code, date: r.receipt_date })));
  const value = rl.reduce((s, l) => s + (Number(q[l.id]) || 0) * l.unit_cost, 0);
  return (
    <Modal title={`Trả hàng nhà cung cấp – ${po.code}`} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('supplier_return', { po_id: po.id, date, reason, lines: Object.entries(q).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ receipt_line_id: k, qty: Number(v) })),
          refund: refund > 0 ? { amount: refund, fund_id: fund } : null }, (x) => 'Đã lập phiếu trả ' + x.code);
        if (r) onClose();
      }}>Ghi nhận trả hàng</Btn></>}>
      <Note>Hàng trả xuất khỏi kho theo đúng giá đã nhập và giảm nợ phải trả NCC. Nếu NCC trả lại tiền, ghi số tiền hoàn.</Note>
      <Table dense rows={recs.data ? rl.filter((l) => l.qty - l.returned_qty > 0) : null} empty="Không còn hàng nào có thể trả" columns={[
        { key: 'p', label: 'Hàng đã nhận', render: (l) => <><div className="cell-main">{l.sku} · {l.name}</div><div className="cell-sub">{l.code} · {dmy(l.date)} · giá {money(l.unit_cost)}</div></> },
        { key: 'r', label: 'Có thể trả', align: 'right', render: (l) => fq(l.qty - l.returned_qty) },
        { key: 'q', label: 'Số trả', align: 'right', render: (l) => <NumInput money={false} stepper min={0} max={l.returnable_qty ?? undefined} value={q[l.id]} onChange={(v) => setQ((s) => ({ ...s, [l.id]: v }))} style={{ maxWidth: 150, marginLeft: 'auto' }} aria-label="Số trả" /> },
      ]} />
      <div className="grid">
        <Field label="Ngày trả"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        <Field label="Lý do"><Input value={reason} onChange={setReason} placeholder="vd. Men lỗi, sai màu" /></Field>
        <Field label="Giá trị hàng trả"><Input value={money(value)} readOnly /></Field>
        {can('thu_chi') && <Field label="NCC hoàn tiền (nếu có)"><NumInput value={refund} onChange={setRefund} /></Field>}
        {can('thu_chi') && refund > 0 && <Field label="Vào quỹ"><Select value={fund} onChange={setFund} options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} /></Field>}
      </div>
    </Modal>
  );
}
