// Hợp đồng: giấy tờ của một đơn đặt hàng. Đợt giao, cọc, công nợ dùng chung với đơn; đề nghị tạm ứng và các biên bản sinh từ đây.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, match, todayVN } from '../lib/format.js';
import { docSettings } from '../lib/docs/model.js';
import { saveFile } from '../lib/excel.js';
import { Btn, Icon, Pill, Field, Input, TextArea, Select, DateInput, NumInput, Check, Search, ErrorBox, Loading, Note, Table, Modal, KV, Section, ConfirmBtn, ListPage, FilterBox, RadioList } from '../components/ui.jsx';

const STATUS = { moi_ky: ['Mới ký', 'info'], dang_giao: ['Đang giao', 'warn'], cho_thanh_toan: ['Chờ thanh toán', 'accent'], hoan_tat: ['Hoàn tất', 'good'], huy: ['Đã hủy', 'mute'] };
const KStatus = ({ v }) => <Pill tone={STATUS[v]?.[1]}>{STATUS[v]?.[0]}</Pill>;

// Tệp đính kèm dùng chung (bản scan hợp đồng, hóa đơn đầu vào…)
export function Attachments({ refType, refId }) {
  const { rpc, can, toast, refresh } = useApp();
  const q = useQ('attachments', [['ref_type', 'eq', refType], ['ref_id', 'eq', refId]], 'created_at');
  const { run, busy } = useAction();
  const input = useRef(null); const [up, setUp] = useState(false);
  const upload = async (file) => {
    setUp(true);
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Không đọc được tệp')); r.readAsDataURL(file); });
      await rpc('upload_attachment', { ref_type: refType, ref_id: refId, name: file.name, mime: file.type, base64 });
      toast('Đã tải lên ' + file.name); refresh();
    } catch (e) { toast(e.message, 'err'); } finally { setUp(false); }
  };
  const download = async (a) => {
    try {
      const f = await rpc('get_attachment', { id: a.id });
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      await saveFile(f.name, new Blob([bytes], { type: f.mime || 'application/octet-stream' }));
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="stack-s">
      {(q.data || []).map((a) => (
        <div className="row gap-s" key={a.id}>
          <Icon name="receipt" size={16} /><a href="#" className="grow" onClick={(e) => { e.preventDefault(); download(a); }}>{a.name}</a>
          <span className="muted small">{Math.max(1, Math.round(a.size / 1024))} KB · {dmy(a.created_at?.slice(0, 10))}</span>
          {can('ban_hang') && <ConfirmBtn small icon="x" busy={busy} onConfirm={() => run('delete_attachment', { id: a.id }, 'Đã xóa tệp')}>Xóa</ConfirmBtn>}
        </div>
      ))}
      {q.data?.length === 0 && <div className="muted small">Chưa có tệp đính kèm</div>}
      {can('ban_hang') && <div><input ref={input} type="file" hidden accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
        <Btn small icon="up" busy={up} onClick={() => input.current?.click()}>Tải tài liệu (scan / PDF, tối đa 15 MB)</Btn></div>}
    </div>
  );
}

export function ContractsPage() {
  const { open, can } = useApp();
  const q = useQ('contracts', [], 'sign_date desc', 2000);
  const [search, setSearch] = useState(''); const [st, setSt] = useState('');
  const all = q.data || [];
  const rows = useMemo(() => all.filter((k) => (!st || k.contract_status === st) && match(`${k.code} ${k.customer_name} ${k.order_code}`, search)), [all, st, search]);
  return (
    <ListPage title="Hợp đồng" sub="Mỗi hợp đồng gắn với một đơn đặt hàng, dùng chung đợt giao, tiền cọc và tồn kho của đơn đó."
      filters={<FilterBox title="Trạng thái"><RadioList value={st} onChange={setSt} options={[{ value: '', label: 'Tất cả', count: all.length }, ...Object.entries(STATUS).map(([value, [label]]) => ({ value, label, count: all.filter((k) => k.contract_status === value).length }))]} /></FilterBox>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm số hợp đồng, khách, đơn…" />}
      actions={can('ban_hang') && <Btn kind="primary" icon="plus" onClick={() => open('order-form', { kind: 'dat_hang', then_contract: true })}>Tạo hợp đồng</Btn>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} empty="Chưa có hợp đồng" onRow={(k) => open('contract', { id: k.id })} columns={[
        { key: 'c', label: 'Số hợp đồng', render: (k) => <><b>{k.code}</b><div className="cell-sub">Ký {dmy(k.sign_date)} · đơn {k.order_code}</div></> },
        { key: 'k', label: 'Khách hàng', render: (k) => k.customer_name },
        { key: 'v', label: 'Giá trị', align: 'right', render: (k) => money(k.order_total) },
        { key: 'p', label: 'Đã thu', align: 'right', render: (k) => money(k.paid_net) },
        { key: 'g', label: 'Tiến độ giao', render: (k) => <div className="row gap-s"><span className="small">{fq(k.delivered_qty)}/{fq(k.eff_qty)}</span><div className="prog grow"><i style={{ width: `${k.eff_qty ? Math.min(100, (k.delivered_qty / k.eff_qty) * 100) : 0}%` }} /></div></div> },
        { key: 's', label: 'Trạng thái', render: (k) => <div className="row gap-s"><KStatus v={k.contract_status} />{k.advance_short > 0 && k.contract_status !== 'huy' && <Pill tone="warn">thiếu cọc</Pill>}</div> },
      ]} />
    </ListPage>
  );
}

export function ContractForm({ id, order_id, onClose, onSaved }) {
  const { rpc, book, settings, toast, open } = useApp();
  const { run, busy } = useAction();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const [f, setF] = useState({ code: '', sign_date: todayVN(), profile_id: ds.profiles[0].id, rep_name: '', rep_title: '', tax_code: '', transport_included: false, ship_unit: '', ship_fee_note: '', ship_payer: 'Bên mua', ship_plan: '', advance_amount: null, advance_note: '', advance_date: '', note: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => { if (id) rpc('q', { view: 'contracts', filters: [['id', 'eq', id]] }).then(([k]) => setF((s) => ({ ...s, ...k }))).catch((e) => toast(e.message, 'err')); }, [id]);
  useEffect(() => {
    if (id || !order_id) return;
    rpc('q', { view: 'sales_orders', filters: [['id', 'eq', order_id]] }).then(async ([o]) => {
      const [c] = await rpc('q', { view: 'customers', filters: [['id', 'eq', o.customer_id]] });
      setF((s) => ({ ...s, tax_code: c?.extra?.tax_code || '', rep_name: c?.contact || '', advance_amount: o.paid_net || null }));
    }).catch((e) => toast(e.message, 'err'));
  }, [order_id]);
  return (
    <Modal title={id ? `Sửa hợp đồng ${f.code}` : 'Lập hợp đồng'} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('save_contract', { ...f, id: id || null, order_id, advance_date: f.advance_date || null }, (x) => `Đã lưu hợp đồng ${x.code}`);
        if (r) { onSaved?.(r); onClose(); if (!id) open('contract', { id: r.id }); }
      }}>Lưu hợp đồng</Btn></>}>
      <div className="grid">
        <Field label="Số hợp đồng" hint={id ? '' : 'Để trống: tự cấp theo ngày ký, vd. 1009/2026/HĐKT'}><Input value={f.code} onChange={(v) => set('code', v)} /></Field>
        <Field label="Ngày ký"><DateInput value={f.sign_date} onChange={(v) => set('sign_date', v)} /></Field>
        <Field label="Đơn vị đứng tên"><Select value={f.profile_id || ''} onChange={(v) => set('profile_id', v)} options={ds.profiles.map((p) => ({ value: p.id, label: p.legal_name || p.name }))} /></Field>
        <Field label="Đại diện bên mua"><Input value={f.rep_name} onChange={(v) => set('rep_name', v)} /></Field>
        <Field label="Chức vụ"><Input value={f.rep_title} onChange={(v) => set('rep_title', v)} /></Field>
        <Field label="Mã số thuế bên mua"><Input value={f.tax_code} onChange={(v) => set('tax_code', v)} /></Field>
        <Field label="Số tiền đề nghị tạm ứng"><NumInput value={f.advance_amount} onChange={(v) => set('advance_amount', v)} /></Field>
        <Field label="Diễn giải tạm ứng"><Input value={f.advance_note} onChange={(v) => set('advance_note', v)} placeholder="vd. 30% giá trị hợp đồng" /></Field>
        <Field label="Hạn tạm ứng"><DateInput value={f.advance_date} onChange={(v) => set('advance_date', v)} /></Field>
      </div>
      <Check checked={!!f.transport_included} onChange={(v) => set('transport_included', v)}>Hợp đồng đã bao gồm vận chuyển</Check>
      {!f.transport_included && <div className="grid">
        <Field label="Đơn vị vận chuyển"><Input value={f.ship_unit} onChange={(v) => set('ship_unit', v)} /></Field>
        <Field label="Bên chịu phí"><Input value={f.ship_payer} onChange={(v) => set('ship_payer', v)} /></Field>
        <Field label="Phí vận chuyển"><Input value={f.ship_fee_note} onChange={(v) => set('ship_fee_note', v)} placeholder="vd. 1.300.000 đ/tấn" /></Field>
        <Field label="Phương án giao" wide><Input value={f.ship_plan} onChange={(v) => set('ship_plan', v)} /></Field>
      </div>}
      <Field label="Ghi chú" wide><TextArea value={f.note} onChange={(v) => set('note', v)} /></Field>
    </Modal>
  );
}

export function ContractDetail({ id, onClose }) {
  const { open, can } = useApp();
  const q = useQ('contracts', [['id', 'eq', id]]);
  const k = q.data?.[0];
  const dels = useQ('deliveries', k ? [['order_id', 'eq', k.order_id]] : [['id', 'eq', '']], 'delivery_date');
  const { run, busy } = useAction();
  if (!k) return <Modal title="Hợp đồng" onClose={onClose}>{q.error ? <ErrorBox error={q.error} /> : <Loading />}</Modal>;
  const doc = (type) => open('doc', { kind: 'contract', id, type });
  const ready = !!k.reconciled_at;
  const steps = [
    ['Đề nghị tạm ứng', 'de_nghi_tam_ung', k.advance_amount > 0, k.advance_amount > 0 ? `${money(k.advance_amount)} đ` : 'Chưa nhập số tiền tạm ứng'],
    ['Đối chiếu số lượng', 'doi_chieu_sl', k.delivery_count > 0, k.delivery_count > 0 ? `${k.delivery_count} đợt giao` : 'Chưa có đợt giao'],
    ['Đối chiếu kèm thanh toán', 'doi_chieu_tt', k.delivery_count > 0, ready ? `Hoàn tất ${dmy(k.reconciled_at.slice(0, 10))}` : 'Chưa hoàn tất'],
    ['Đề nghị thanh toán', 'de_nghi_tt', ready, ready ? 'Sẵn sàng lập' : 'Lập sau khi hoàn tất đối chiếu'],
  ];
  const pct = k.eff_qty ? (k.delivered_qty / k.eff_qty) * 100 : 0;
  return (
    <Modal title={`Hợp đồng ${k.code}`} subtitle={<span className="row gap-s">{k.customer_name} · ký {dmy(k.sign_date)} · <KStatus v={k.contract_status} /></span>} onClose={onClose} size="xl"
      footer={<>
        <Btn onClick={() => open('order', { id: k.order_id })} icon="order">Mở đơn {k.order_code}</Btn>
        <span className="grow" />
        {can('ban_hang') && <Btn icon="edit" onClick={() => open('contract-form', { id })}>Sửa</Btn>}
        {can('ban_hang') && k.delivery_count > 0 && <Btn kind={ready ? 'ghost' : 'soft'} busy={busy} onClick={() => run('set_contract_reconciled', { id, done: !ready }, ready ? 'Đã mở lại đối chiếu' : 'Đã hoàn tất đối chiếu')}>{ready ? 'Mở lại đối chiếu' : 'Hoàn tất đối chiếu'}</Btn>}
        {can('ban_hang') && k.remaining_qty > 0 && k.order_status === 'xac_nhan' && <OrderDeliverBtn orderId={k.order_id} />}
      </>}>
      <div className="grid-2">
        <KV items={[['Khách hàng', k.customer_name], ['Điện thoại', k.customer_phone || '—'], ['Địa chỉ', k.customer_address || '—'], ['Đại diện', [k.rep_name, k.rep_title].filter(Boolean).join(' · ') || '—'], ['Mã số thuế', k.tax_code || '—'], k.note && ['Ghi chú', k.note]]} />
        <div className="card"><div className="totals">
          <span>Giá trị hợp đồng</span><span className="r strong">{money(k.order_total)}</span>
          {k.vat_rate > 0 && <><span className="muted">Gồm VAT {fq(k.vat_rate)}%</span><span className="r muted">{money(k.vat_total)}</span></>}
          <span>Đề nghị tạm ứng</span><span className="r">{money(k.advance_amount)}</span>
          <span>Đã thu</span><span className="r">{money(k.paid_net)}</span>
          {k.advance_short > 0 && <><span className="warn">Còn thiếu tạm ứng</span><span className="r warn">{money(k.advance_short)}</span></>}
          <span className="strong">Còn phải thu cả hợp đồng</span><span className="r strong">{money(k.remaining_to_pay)}</span>
        </div></div>
      </div>
      <div className="deliv-bar"><span>Đã giao <b>{fq(k.delivered_qty)}</b> / {fq(k.eff_qty)}</span><div className="prog grow"><i style={{ width: `${Math.min(100, pct)}%` }} /></div><b>{fq(pct)}%</b><span>Còn phải giao <b className="warn">{fq(k.remaining_qty)}</b></span></div>
      <Section title="Giấy tờ theo hợp đồng">
        <div className="steps">{steps.map(([label, type, ok, sub]) => (
          <button key={type} className="step" disabled={!ok} onClick={() => doc(type)}><b>{label}</b><span className="small muted">{sub}</span></button>
        ))}</div>
      </Section>
      <Section title="Các đợt giao hàng">
        <Table dense rows={dels.data} empty="Chưa có đợt giao" columns={[
          { key: 'n', label: 'Đợt', render: (r) => <b>Đợt {dels.data.indexOf(r) + 1}</b> },
          { key: 'd', label: 'Ngày giao', render: (r) => dmy(r.delivery_date) }, { key: 'c', label: 'Phiếu', render: (r) => r.code },
          { key: 'v', label: 'Tiền đợt này', align: 'right', render: (r) => money(r.total) }, { key: 'k', label: 'Khấu trừ cọc', align: 'right', render: (r) => money(r.deposit_used) },
          { key: 'x', label: 'Chứng từ', render: (r) => <div className="row gap-s">{[['hoa_don', 'Hóa đơn'], ['bien_ban', 'Biên bản'], ['hd_van_chuyen', 'HĐ vận chuyển']].map(([t, l]) => <Btn small key={t} onClick={() => open('doc', { kind: 'delivery', id: r.id, type: t })}>{l}</Btn>)}</div> },
        ]} />
      </Section>
      <div className="grid-2">
        <Section title="Tài liệu hợp đồng (scan / PDF)"><Attachments refType="contract" refId={id} /></Section>
        <Section title="Thông tin vận chuyển">
          {k.transport_included ? <Note>Hợp đồng đã bao gồm vận chuyển.</Note> : <KV items={[['Đơn vị', k.ship_unit || '—'], ['Phí', k.ship_fee_note || '—'], ['Bên chịu phí', k.ship_payer || '—'], ['Phương án giao', k.ship_plan || '—']]} />}
        </Section>
      </div>
    </Modal>
  );
}

function OrderDeliverBtn({ orderId }) {
  const { open, rpc } = useApp();
  return <Btn kind="primary" icon="truck" onClick={async () => { const [o] = await rpc('q', { view: 'sales_orders', filters: [['id', 'eq', orderId]] }); open('deliver', { order: o }); }}>Tạo đợt giao tiếp theo</Btn>;
}
