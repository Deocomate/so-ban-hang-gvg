// Khuyến mại, coupon, voucher: tạo chương trình, mã giảm giá, phát hành voucher; theo dõi lượt dùng.
import React, { useState } from 'react';
import { useApp, useRpcData, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN } from '../lib/format.js';
import { useProducts, useCustomers } from '../lib/lookups.js';
import { Btn, Field, Input, Select, DateInput, NumInput, Check, Note, Table, Modal, Pill, Tabs, usePageTab, ErrorBox, Picker } from '../components/ui.jsx';

const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const discText = (x) => (x.discount_pct ? `${x.discount_pct}%${x.max_discount ? ` (tối đa ${money(x.max_discount)} đ)` : ''}` : `${money(x.discount_amount)} đ`);
const live = (x) => x.active && x.start_date <= todayVN() && x.end_date >= todayVN();

export function LoyaltyPage(nav) {
  const { settings } = useApp();
  const tabs = [settings.promo_on && { value: 'km', label: 'Khuyến mại' }, settings.coupon_on && { value: 'coupon', label: 'Coupon' }, settings.voucher_on && { value: 'voucher', label: 'Voucher' }].filter(Boolean);
  const [tab, setTab] = usePageTab(nav, tabs[0]?.value || 'km', tabs.map((t) => t.value));
  const q = useRpcData('loyalty_lists', {});
  const [form, setForm] = useState(null);
  if (!tabs.length) return <Note>Hãy bật Khuyến mại, Coupon hoặc Voucher ở Thiết lập → Khách hàng.</Note>;
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Khuyến mại &amp; voucher</h1><div className="page-sub">Áp dụng ở màn bán hàng; máy chủ kiểm tra điều kiện và tính số tiền giảm.</div></div>
        <Btn kind="primary" icon="plus" onClick={() => setForm({ type: tab, data: {} })}>{tab === 'km' ? 'Tạo chương trình' : tab === 'coupon' ? 'Tạo coupon' : 'Phát hành voucher'}</Btn></div>
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <ErrorBox error={q.error} />
      {tab === 'km' && <Table rows={q.data?.promotions} onRow={(x) => setForm({ type: 'km', data: x })} empty="Chưa có chương trình" columns={[
        { key: 'n', label: 'Chương trình', render: (x) => <><b>{x.name}</b><div className="cell-sub">{x.code}</div></> },
        { key: 'k', label: 'Áp dụng', render: (x) => (x.kind === 'order' ? `Đơn từ ${money(x.min_amount)} đ` : `${x.product_ids.length} hàng, ${x.categories.length} nhóm`) },
        { key: 'd', label: 'Giảm', render: discText },
        { key: 't', label: 'Thời gian', render: (x) => `${dmy(x.start_date)} – ${dmy(x.end_date)}` },
        { key: 'u', label: 'Đã dùng', align: 'right', render: (x) => x.used },
        { key: 's', label: '', render: (x) => <Pill tone={live(x) ? 'good' : 'mute'}>{live(x) ? 'Đang chạy' : 'Ngừng'}</Pill> },
      ]} />}
      {tab === 'coupon' && <Table rows={q.data?.coupons} onRow={(x) => setForm({ type: 'coupon', data: x })} empty="Chưa có coupon" columns={[
        { key: 'c', label: 'Mã', render: (x) => <><b>{x.code}</b><div className="cell-sub">{x.name}</div></> },
        { key: 'd', label: 'Giảm', render: discText }, { key: 'm', label: 'Đơn tối thiểu', align: 'right', render: (x) => money(x.min_amount) },
        { key: 't', label: 'Thời gian', render: (x) => `${dmy(x.start_date)} – ${dmy(x.end_date)}` },
        { key: 'u', label: 'Đã dùng', align: 'right', render: (x) => `${x.used}${x.usage_limit ? ` / ${x.usage_limit}` : ''}` },
        { key: 's', label: '', render: (x) => <Pill tone={live(x) ? 'good' : 'mute'}>{live(x) ? 'Đang chạy' : 'Ngừng'}</Pill> },
      ]} />}
      {tab === 'voucher' && <Vouchers rows={q.data?.vouchers} />}
      {form?.type === 'km' && <PromoForm promo={form.data} onClose={() => setForm(null)} />}
      {form?.type === 'coupon' && <CouponForm coupon={form.data} onClose={() => setForm(null)} />}
      {form?.type === 'voucher' && <VoucherIssue onClose={() => setForm(null)} />}
    </>
  );
}

const VST = { moi: ['Chưa dùng', 'info'], da_dung: ['Đã dùng', 'good'], huy: ['Đã hủy', 'mute'] };
function Vouchers({ rows }) {
  const { run } = useAction();
  return <Table rows={rows} empty="Chưa phát hành voucher" columns={[
    { key: 'c', label: 'Mã voucher', render: (x) => <><b className="mono">{x.code}</b><div className="cell-sub">Đợt {x.batch}</div></> },
    { key: 'v', label: 'Mệnh giá', align: 'right', render: (x) => money(x.value) },
    { key: 'k', label: 'Khách được tặng', render: (x) => x.customer_name || 'Mọi khách' },
    { key: 'h', label: 'Hạn dùng', render: (x) => (x.expiry_date ? dmy(x.expiry_date) : 'Không hạn') },
    { key: 's', label: 'Trạng thái', render: (x) => <><Pill tone={VST[x.status][1]}>{VST[x.status][0]}</Pill>{x.used_order_code && <div className="cell-sub">đơn {x.used_order_code}</div>}</> },
    { key: 'a', label: '', render: (x) => x.status === 'moi' && <Btn small onClick={() => run('cancel_voucher', { id: x.id }, `Đã hủy voucher ${x.code}`)}>Hủy</Btn> },
  ]} />;
}

function Discount({ f, set }) {
  const byPct = f.mode === 'pct';
  return (
    <>
      <Field label="Giảm theo"><Select value={f.mode} onChange={(v) => set('mode', v)} options={[{ value: 'pct', label: 'Phần trăm' }, { value: 'amt', label: 'Số tiền' }]} /></Field>
      {byPct ? <Field label="Phần trăm giảm"><NumInput money={false} min={0} max={100} value={f.discount_pct} onChange={(v) => set('discount_pct', v)} suffix="%" /></Field>
        : <Field label="Số tiền giảm"><NumInput min={0} value={f.discount_amount} onChange={(v) => set('discount_amount', v)} suffix="đ" /></Field>}
      {byPct && <Field label="Giảm tối đa" hint="Để trống: không giới hạn"><NumInput min={0} value={f.max_discount} onChange={(v) => set('max_discount', v)} suffix="đ" /></Field>}
    </>
  );
}
const initDisc = (x) => ({ mode: x.discount_amount > 0 ? 'amt' : 'pct', discount_pct: x.discount_pct || null, discount_amount: x.discount_amount || null, max_discount: x.max_discount || null });
const discPayload = (f) => (f.mode === 'pct' ? { discount_pct: f.discount_pct, discount_amount: 0, max_discount: f.max_discount } : { discount_pct: 0, discount_amount: f.discount_amount, max_discount: null });

function PromoForm({ promo, onClose }) {
  const { settings } = useApp(); const prods = useProducts(); const { run, busy } = useAction();
  const [f, setF] = useState({ name: '', kind: 'order', min_amount: 0, start_date: todayVN(), end_date: addDays(todayVN(), 30), active: true, note: '', product_ids: [], categories: [], ...promo, ...initDisc(promo) });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const realKind = f.kind;
  const cats = [...new Set([...(settings.categories || []), ...((prods.data || []).map((p) => p.category).filter(Boolean))])];
  const save = async () => { if (await run('save_promotion', { id: f.id || null, name: f.name, kind: realKind, min_amount: f.min_amount, product_ids: f.product_ids, categories: f.categories,
    start_date: f.start_date, end_date: f.end_date, active: f.active, note: f.note, ...discPayload(f) }, 'Đã lưu chương trình')) onClose(); };
  return (
    <Modal title={f.id ? `Sửa ${f.code}` : 'Chương trình khuyến mại'} size="md" onClose={onClose} footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" busy={busy} onClick={save}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Tên chương trình" wide required><Input value={f.name} onChange={(v) => set('name', v)} /></Field>
        {!f.id && <Field label="Hình thức"><Select value={f.kind} onChange={(v) => set('kind', v)} options={[{ value: 'order', label: 'Giảm theo tổng đơn' }, { value: 'product', label: 'Giảm theo hàng / nhóm hàng' }]} /></Field>}
        <Field label="Đơn tối thiểu"><NumInput min={0} value={f.min_amount} onChange={(v) => set('min_amount', v || 0)} suffix="đ" /></Field>
        <Discount f={f} set={set} />
        <Field label="Từ ngày"><DateInput value={f.start_date} onChange={(v) => set('start_date', v)} /></Field>
        <Field label="Đến ngày"><DateInput value={f.end_date} onChange={(v) => set('end_date', v)} /></Field>
      </div>
      {realKind === 'product' && <>
        <div className="field-label">Nhóm hàng được giảm</div>
        <div className="taglist">{cats.map((c) => <Check key={c} checked={f.categories.includes(c)} onChange={(v) => set('categories', v ? [...f.categories, c] : f.categories.filter((x) => x !== c))}>{c}</Check>)}</div>
        <Field label="Thêm từng hàng hóa"><Picker items={prods.data} value={null} onChange={(id) => id && !f.product_ids.includes(id) && set('product_ids', [...f.product_ids, id])} getLabel={(p) => `${p.sku} · ${p.name}`} placeholder="Chọn hàng…" /></Field>
        <div className="taglist">{f.product_ids.map((id) => { const p = (prods.data || []).find((x) => x.id === id); return <span className="tag" key={id}>{p ? p.sku : id}<button onClick={() => set('product_ids', f.product_ids.filter((x) => x !== id))}>×</button></span>; })}</div>
      </>}
      <Check checked={f.active} onChange={(v) => set('active', v)}>Đang áp dụng</Check>
    </Modal>
  );
}

function CouponForm({ coupon, onClose }) {
  const { run, busy } = useAction();
  const [f, setF] = useState({ code: '', name: '', min_amount: 0, usage_limit: null, start_date: todayVN(), end_date: addDays(todayVN(), 30), active: true, ...coupon, ...initDisc(coupon) });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => { if (await run('save_coupon', { id: f.id || null, code: f.code, name: f.name, min_amount: f.min_amount, usage_limit: f.usage_limit, start_date: f.start_date, end_date: f.end_date, active: f.active, ...discPayload(f) }, 'Đã lưu coupon')) onClose(); };
  return (
    <Modal title={f.id ? `Sửa coupon ${f.code}` : 'Tạo coupon'} size="md" onClose={onClose} footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" busy={busy} onClick={save}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Mã coupon" required hint="Khách đọc mã này khi mua"><Input value={f.code} onChange={(v) => set('code', v.toUpperCase().replace(/\s/g, ''))} /></Field>
        <Field label="Tên gọi"><Input value={f.name} onChange={(v) => set('name', v)} /></Field>
        <Discount f={f} set={set} />
        <Field label="Đơn tối thiểu"><NumInput min={0} value={f.min_amount} onChange={(v) => set('min_amount', v || 0)} suffix="đ" /></Field>
        <Field label="Số lần dùng tối đa" hint="Để trống: không giới hạn"><NumInput money={false} min={1} value={f.usage_limit} onChange={(v) => set('usage_limit', v)} /></Field>
        <Field label="Từ ngày"><DateInput value={f.start_date} onChange={(v) => set('start_date', v)} /></Field>
        <Field label="Đến ngày"><DateInput value={f.end_date} onChange={(v) => set('end_date', v)} /></Field>
      </div>
      <Check checked={f.active} onChange={(v) => set('active', v)}>Đang áp dụng</Check>
    </Modal>
  );
}

function VoucherIssue({ onClose }) {
  const custs = useCustomers(); const { run, busy } = useAction();
  const [f, setF] = useState({ count: 1, value: null, min_amount: 0, prefix: 'VC', expiry_date: addDays(todayVN(), 90), customer_id: null, note: '' });
  const [done, setDone] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => { const r = await run('issue_vouchers', f, (x) => `Đã phát hành ${x.codes.length} voucher`); if (r) setDone(r); };
  return (
    <Modal title="Phát hành voucher" size="md" onClose={onClose} footer={done ? <Btn kind="primary" onClick={onClose}>Xong</Btn> : <><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" busy={busy} onClick={save}>Phát hành</Btn></>}>
      {done ? <><Note tone="good">Đợt {done.batch}: {done.codes.length} mã. Chép gửi khách:</Note><pre className="voucher-codes">{done.codes.join('\n')}</pre></> : <div className="grid">
        <Field label="Số lượng"><NumInput money={false} min={1} max={500} value={f.count} onChange={(v) => set('count', v)} /></Field>
        <Field label="Mệnh giá" required><NumInput min={0} value={f.value} onChange={(v) => set('value', v)} suffix="đ" /></Field>
        <Field label="Đơn tối thiểu"><NumInput min={0} value={f.min_amount} onChange={(v) => set('min_amount', v || 0)} suffix="đ" /></Field>
        <Field label="Tiền tố mã"><Input value={f.prefix} onChange={(v) => set('prefix', v.toUpperCase())} /></Field>
        <Field label="Hạn dùng"><DateInput value={f.expiry_date} onChange={(v) => set('expiry_date', v)} /></Field>
        <Field label="Tặng riêng cho khách" wide hint="Để trống: khách nào cũng dùng được"><Picker items={custs.data} value={f.customer_id} onChange={(v) => set('customer_id', v)} getLabel={(c) => c.name} getSub={(c) => c.code} placeholder="Mọi khách" /></Field>
      </div>}
    </Modal>
  );
}
