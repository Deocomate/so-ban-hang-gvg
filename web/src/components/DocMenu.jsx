// Xuất giấy tờ của một đơn bán: mọi chứng từ lập được từ đơn, xếp theo trình tự công việc
// bán hàng → đóng & giao hàng → đối chiếu sau giao. Dùng ở chi tiết hóa đơn (trang Hóa đơn, Đặt hàng, hồ sơ khách…)
// dưới hai dạng: nút "Giấy tờ" mở danh sách ở chân hộp thoại, và khung nút bấm trong thẻ "Giấy tờ".
import React, { useEffect, useRef, useState } from 'react';
import { useApp, useQ } from '../lib/store.jsx';
import { DOC_TYPES, isCompany } from '../lib/docs/model.js';
import { Btn, Icon } from './ui.jsx';

const ICONS = { hoa_don: 'invoice', don_dat_hang: 'order', yeu_cau_vat: 'tax', phieu_dong_hang: 'box', bien_ban: 'print', phieu_xuat_kho: 'out',
  hd_van_chuyen: 'truck', cn_xuat_xuong: 'kiln', doi_chieu_tt: 'cash', doi_chieu_sl: 'quote' };

// Nhóm chứng từ của đơn d (dòng sales_orders). Phiếu yêu cầu xuất VAT chỉ cho khách công ty; đối chiếu chỉ khi đã giao.
export function useOrderDocGroups(d) {
  const { settings } = useApp();
  const cust = useQ('customers', [['id', 'eq', d.customer_id]], undefined, 1, !!d.customer_id);
  const contract = useQ('contracts', [['order_id', 'eq', d.id]]);
  const isDat = d.kind === 'dat_hang'; const delivered = d.delivery_count > 0;
  const company = isCompany(cust.data?.[0], settings);
  const k = contract.data?.[0];
  const item = (type, params = { kind: 'order', id: d.id, type }) => ({ type, label: DOC_TYPES[type].label, icon: ICONS[type], params });
  return [
    { label: 'Bán hàng', items: [(!isDat || delivered) && item('hoa_don'), isDat && item('don_dat_hang'), company && item('yeu_cau_vat')] },
    { label: 'Đóng & giao hàng', items: ['phieu_dong_hang', 'bien_ban', 'phieu_xuat_kho', 'hd_van_chuyen', 'cn_xuat_xuong'].map((t) => item(t)) },
    delivered && { label: 'Đối chiếu sau giao hàng', items: ['doi_chieu_tt', 'doi_chieu_sl'].map((t) => item(t, k ? { kind: 'contract', id: k.id, type: t } : undefined)) },
  ].filter(Boolean).map((g) => ({ ...g, items: g.items.filter(Boolean) })).filter((g) => g.items.length);
}

// Nút "Giấy tờ" (chân hộp thoại chi tiết đơn): danh sách mở lên trên, chọn một chứng từ là mở hộp thoại xem / sửa / in / tải
export function OrderDocMenu({ order, onTrack }) {
  const { open } = useApp();
  const groups = useOrderDocGroups(order);
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!show) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target)) setShow(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setShow(false); } };
    document.addEventListener('mousedown', down); window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', esc, true); };
  }, [show]);
  const go = (fn) => { setShow(false); fn(); };
  return (
    <div className="dd" ref={ref}>
      <Btn icon="print" aria-haspopup="menu" aria-expanded={show} onClick={() => setShow((v) => !v)}>Giấy tờ <Icon name="down" size={14} className="dd-caret" /></Btn>
      {show && (
        <div className="dd-menu dd-right dd-up doc-menu" role="menu" aria-label="Xuất giấy tờ">
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <div className="doc-menu-label">{g.label}</div>
              {g.items.map((x) => <button key={x.type} type="button" role="menuitem" className="dd-item" onClick={() => go(() => open('doc', x.params))}><Icon name={x.icon} size={17} />{x.label}</button>)}
            </div>
          ))}
          {onTrack && <><div className="pos-menu-sep" />
            <button type="button" role="menuitem" className="dd-item" onClick={() => go(onTrack)}><Icon name="folder" size={17} />Theo dõi giấy tờ đã ký / tải lên</button></>}
        </div>
      )}
    </div>
  );
}

// Khung nút bấm trong thẻ "Giấy tờ" của chi tiết đơn: mỗi nhóm một hàng
export function OrderDocLauncher({ order }) {
  const { open } = useApp();
  const groups = useOrderDocGroups(order);
  return (
    <div className="doc-launch">
      {groups.map((g) => (
        <div key={g.label} className="doc-launch-row">
          <span className="doc-launch-label small strong">{g.label}</span>
          <div className="row gap-s wrap">{g.items.map((x) => <Btn key={x.type} small icon={x.icon} onClick={() => open('doc', x.params)}>{x.label}</Btn>)}</div>
        </div>
      ))}
    </div>
  );
}
