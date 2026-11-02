// Biểu mẫu khách hàng (thông tin chung, xuất hóa đơn, giao hàng) và cài đặt mục tiêu kinh doanh.
import React, { useState } from 'react';
import { useApp, useAction } from '../lib/store.jsx';
import { Btn, Field, Input, TextArea, Select, DateInput, NumInput, Check, Tabs, Section } from '../components/ui.jsx';

export function CustomerFields({ f, set, id }) {
  const { settings } = useApp();
  const [tab, setTab] = useState('chung');
  const x = f.extra || {};
  const setX = (k, v) => set('extra', { ...(f.extra || {}), [k]: v });
  const pn = settings.price_names || [];
  const same = !!x.ship_same;
  const toggleSame = (v) => set('extra', { ...x, ship_same: v, ...(v ? { ship_name: f.name, ship_phone: f.phone, ship_address: f.address, ship_province: x.province, ship_ward: x.ward } : {}) });
  const groups = [...new Set([...(settings.customer_groups || []), f.kind].filter(Boolean))];
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'chung', label: 'Thông tin chung' }, { value: 'hd', label: 'Thông tin xuất hóa đơn' }]} />
      {tab === 'hd' && <div className="grid">
        <Field label="Tên đơn vị" wide><Input value={x.tax_name} onChange={(v) => setX('tax_name', v)} /></Field>
        <Field label="Mã số thuế"><Input value={x.tax_code} onChange={(v) => setX('tax_code', v)} /></Field>
        <Field label="Email nhận hóa đơn"><Input value={x.tax_email} onChange={(v) => setX('tax_email', v)} /></Field>
        <Field label="Địa chỉ xuất hóa đơn" wide><Input value={x.tax_address} onChange={(v) => setX('tax_address', v)} /></Field>
      </div>}
      {tab === 'chung' && <>
        <div className="cust-tabs-grid">
          <Section title="Thông tin khách hàng"><div className="grid">
            <Field label="Mã khách hàng" hint={id ? '' : 'Để trống: tự cấp'}><Input value={f.code} onChange={(v) => set('code', v)} /></Field>
            <Field label="Tên khách hàng" required><Input value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
            <Field label="Điện thoại"><Input value={f.phone} onChange={(v) => set('phone', v)} inputMode="tel" /></Field>
            <Field label="Người liên hệ"><Input value={f.contact} onChange={(v) => set('contact', v)} /></Field>
            <Field label="Địa chỉ khách hàng" wide><Input value={f.address} onChange={(v) => set('address', v)} /></Field>
            <Field label="Khu vực (Tỉnh/TP)"><Input value={x.province} onChange={(v) => setX('province', v)} /></Field>
            <Field label="Phường/Xã"><Input value={x.ward} onChange={(v) => setX('ward', v)} /></Field>
          </div></Section>
          <Section title="Thông tin bổ sung"><div className="grid">
            <Field label="Nhóm khách"><Input value={f.kind} onChange={(v) => set('kind', v)} list="cust-groups" placeholder="Chọn hoặc gõ nhóm mới" /><datalist id="cust-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></Field>
            <Field label="Mức giá áp dụng"><Select value={String(f.price_tier)} onChange={(v) => set('price_tier', Number(v))} options={pn.map((n, i) => ({ value: String(i + 1), label: n }))} /></Field>
            <Field label="Giai đoạn"><Select value={f.stage || 'moi'} onChange={(v) => set('stage', v)} options={[{ value: 'moi', label: 'Khách mới' }, { value: 'tu_van', label: 'Đã tư vấn' }]} /></Field>
            <Field label="Ngày sinh"><DateInput value={x.birthday || ''} onChange={(v) => setX('birthday', v)} /></Field>
            <Field label="Giới tính"><Select value={x.gender || ''} onChange={(v) => setX('gender', v)} options={['Nam', 'Nữ']} placeholder="Chọn" /></Field>
            <Field label="Email"><Input value={x.email} onChange={(v) => setX('email', v)} /></Field>
            <Field label="Facebook"><Input value={x.facebook} onChange={(v) => setX('facebook', v)} /></Field>
            <Field label="Số ngày được nợ" hint="Hạn trả = ngày giao + số ngày này"><NumInput money={false} min={0} suffix="ngày" value={f.credit_days} onChange={(v) => set('credit_days', v || 0)} /></Field>
            <Field label="Hạn mức nợ" hint="0 = không giới hạn"><NumInput value={f.credit_limit} onChange={(v) => set('credit_limit', v || 0)} /></Field>
            <Field label="Ghi chú" wide><TextArea value={f.note} onChange={(v) => set('note', v)} /></Field>
          </div></Section>
        </div>
        <div className="ship-box stack">
          <div className="row gap"><b>Thông tin giao hàng</b><Check checked={same} onChange={toggleSame}>Giống thông tin khách hàng</Check></div>
          <div className="grid">
            <Field label="Người nhận"><Input value={x.ship_name} onChange={(v) => setX('ship_name', v)} /></Field>
            <Field label="Số điện thoại người nhận"><Input value={x.ship_phone} onChange={(v) => setX('ship_phone', v)} inputMode="tel" /></Field>
            <Field label="Địa chỉ giao hàng" wide><Input value={x.ship_address} onChange={(v) => setX('ship_address', v)} /></Field>
            <Field label="Khu vực giao hàng"><Input value={x.ship_province} onChange={(v) => setX('ship_province', v)} /></Field>
            <Field label="Phường/Xã giao hàng"><Input value={x.ship_ward} onChange={(v) => setX('ship_ward', v)} /></Field>
            <Field label="Ghi chú giao hàng" wide><Input value={x.ship_note} onChange={(v) => setX('ship_note', v)} placeholder="Ví dụ: Liên hệ người nhận trước khi giao" /></Field>
          </div>
        </div>
      </>}
    </>
  );
}

export function BusinessTargets() {
  const { settings, loadBooks } = useApp();
  const { run, busy } = useAction();
  const [target, setTarget] = useState(settings.monthly_target || 0); const [vat, setVat] = useState(settings.default_vat ?? 8);
  const [groups, setGroups] = useState((settings.customer_groups || []).join(', '));
  return (
    <Section title="Mục tiêu & mặc định kinh doanh">
      <div className="grid">
        <Field label="Mục tiêu doanh thu mỗi tháng" hint="Dùng cho thẻ Doanh thu / Mục tiêu ở Tổng quan"><NumInput value={target} onChange={(v) => setTarget(v || 0)} /></Field>
        <Field label="VAT mặc định trên hóa đơn, báo giá"><NumInput money={false} min={0} max={100} suffix="%" value={vat} onChange={setVat} /></Field>
        <Field label="Nhóm khách hàng" hint="Cách nhau bằng dấu phẩy" wide><Input value={groups} onChange={setGroups} /></Field>
      </div>
      <div><Btn kind="primary" busy={busy} onClick={async () => { if (await run('update_book_settings', { settings: { monthly_target: Number(target) || 0, default_vat: Number(vat) || 0, customer_groups: groups.split(',').map((s) => s.trim()).filter(Boolean) } }, 'Đã lưu')) loadBooks(); }}>Lưu</Btn></div>
    </Section>
  );
}
