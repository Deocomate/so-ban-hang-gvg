// Hộp thoại "Các khoản thu khác" trên màn bán hàng: VAT và tiền vận chuyển kèm thông tin lái xe.
import React, { useState } from 'react';
import { useApp, useQ } from '../lib/store.jsx';
import { money } from '../lib/format.js';
import { Btn, Field, Input, Select, NumInput, Check, Modal, Note, Table } from '../components/ui.jsx';

export function ChargesDialog({ goods, vatRate, shippingFee, transport, onApply, onClose }) {
  const { open, settings } = useApp();
  const drivers = useQ('drivers', [['active', 'eq', 'true']], 'name');
  const [vatOn, setVatOn] = useState(Number(vatRate) > 0);
  const [rate, setRate] = useState(Number(vatRate) || settings.default_vat || 8);
  const [shipOn, setShipOn] = useState(!!transport || Number(shippingFee) > 0);
  const [amount, setAmount] = useState(transport?.amount ?? shippingFee ?? 0);
  const [t, setT] = useState({ driver_id: '', payer: 'khach', collect: 'hoa_don', note: '', ...transport });
  const set = (k, v) => setT((s) => ({ ...s, [k]: v }));
  const billed = t.payer === 'khach' && t.collect === 'hoa_don';
  const apply = () => {
    onApply({ vat_rate: vatOn ? Number(rate) || 0 : 0, shipping_fee: shipOn && billed ? Number(amount) || 0 : 0, transport: shipOn && t.driver_id ? { ...t, amount: Number(amount) || 0 } : null });
    onClose();
  };
  const rows = [
    { id: 'vat', code: 'THK000002', name: 'VAT', rate: `${rate} %`, value: vatOn ? money(Math.round(goods * (Number(rate) || 0) / 100)) : '—', on: vatOn, set: setVatOn },
    { id: 'ship', code: 'THK000001', name: 'Tiền vận chuyển', rate: `${money(amount)} đ`, value: shipOn && billed ? `${money(amount)} đ` : '—', on: shipOn, set: setShipOn },
  ];
  return (
    <Modal title="Các khoản thu khác" onClose={onClose} size="lg" footer={<><Btn onClick={onClose}>Hủy</Btn><Btn kind="primary" onClick={apply}>Áp dụng</Btn></>}>
      <Table dense rows={rows} columns={[
        { key: 'c', label: '', render: (r) => <Check checked={r.on} onChange={r.set} /> }, { key: 'k', label: 'Mã thu khác', render: (r) => r.code }, { key: 'n', label: 'Loại thu', render: (r) => r.name },
        { key: 'r', label: 'Mức thu', align: 'right', render: (r) => r.rate }, { key: 'v', label: 'Thu trên hóa đơn', align: 'right', render: (r) => r.value },
      ]} />
      {vatOn && <div className="grid"><Field label="Thuế suất VAT"><NumInput money={false} min={0} max={100} suffix="%" value={rate} onChange={setRate} /></Field></div>}
      {shipOn && (
        <div className="ship-box stack">
          <b>Chi tiết vận chuyển</b>
          <div className="grid">
            <Field label="Lái xe"><div className="row gap-s"><div className="grow"><Select value={t.driver_id} onChange={(v) => set('driver_id', v)} options={(drivers.data || []).map((d) => ({ value: d.id, label: `${d.name}${d.phone ? ' · ' + d.phone : ''}` }))} placeholder="Chọn lái xe" /></div>
              <Btn small icon="plus" aria-label="Thêm lái xe" onClick={() => open('driver', { onSaved: (r) => set('driver_id', r.id) })} /></div></Field>
            <Field label="Tiền vận chuyển"><NumInput value={amount} onChange={setAmount} /></Field>
            <Field label="Bên chịu phí"><Select value={t.payer} onChange={(v) => set('payer', v)} options={[{ value: 'khach', label: 'Khách thanh toán' }, { value: 'cua_hang', label: 'Cửa hàng thanh toán' }]} /></Field>
            {t.payer === 'khach' && <Field label="Cách thanh toán"><Select value={t.collect} onChange={(v) => set('collect', v)} options={[{ value: 'hoa_don', label: 'Thu cùng hóa đơn' }, { value: 'truc_tiep', label: 'Khách trả trực tiếp lái xe' }]} /></Field>}
            <Field label="Ghi chú chuyến giao" wide><Input value={t.note} onChange={(v) => set('note', v)} /></Field>
          </div>
          <Note>{billed ? `Thu hộ ${money(amount)} đ từ khách và theo dõi khoản phải trả lái xe.` : t.payer === 'cua_hang' ? `Cửa hàng chịu phí, phát sinh ${money(amount)} đ phải trả lái xe.` : 'Khách trả trực tiếp cho lái xe, không phát sinh công nợ lái xe.'}</Note>
          {!t.driver_id && <div className="muted small">Không chọn lái xe thì chỉ cộng tiền vận chuyển vào hóa đơn, không theo dõi công nợ lái xe.</div>}
        </div>
      )}
    </Modal>
  );
}
