// Xử lý đơn đặt hàng như KiotViet: bấm "Xử lý đơn hàng" ở trang Đặt hàng → mở màn hình bán hàng riêng cho đơn đó
// (tab mang mã DH…), các dòng hàng còn phải giao điền sẵn. Sửa số lượng lấy đợt này, nhận tiền rồi bấm TẠO HÓA ĐƠN:
// hệ thống ghi phiếu giao (trừ kho, ghi doanh thu), khấu trừ tiền khách đã trả trước và lập phiếu thu phần khách thanh toán.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAction, useQ } from '../lib/store.jsx';
import { money, qty as fq, todayVN } from '../lib/format.js';
import { useFunds, useCustomers } from '../lib/lookups.js';
import { Btn, Icon, Select, DateInput, NumInput, Loading, ErrorBox, Modal } from '../components/ui.jsx';
import { PosMenu } from '../components/PosMenu.jsx';
import { QUICK_FUND_KEY, readFund } from './Sales.jsx';

const METHODS = ['Tiền mặt', 'Chuyển khoản', 'Thẻ', 'Ví'];

export function OrderProcess({ id, onClose }) {
  const { open, can, rpc, toast, refresh, settings } = useApp();
  const { run, busy } = useAction();
  const o = useQ('sales_orders', [['id', 'eq', id]]);
  const ls = useQ('sales_order_lines', [['order_id', 'eq', id]], 'line_no');
  const customers = useCustomers();
  const canPay = can('thu_chi');
  const funds = useFunds(canPay);
  const rootRef = useRef(null);
  const d = o.data?.[0];
  const [qtys, setQtys] = useState(null); // số lượng lấy đợt này theo đơn vị bán của dòng
  const [date, setDate] = useState(todayVN());
  const [ship, setShip] = useState(null);
  const [note, setNote] = useState('');
  const [pay, setPay] = useState({ amount: null, method: 'Tiền mặt', fund_id: readFund() });
  const [ask, setAsk] = useState(null);
  const [saving, setSaving] = useState(false);
  const [armClose, setArmClose] = useState(false);
  const setP = (k, v) => setPay((s) => ({ ...s, [k]: v }));

  const open0 = useMemo(() => (ls.data || []).filter((l) => l.remaining_qty > 0), [ls.data]);
  useEffect(() => { if (ls.data && !qtys) setQtys(Object.fromEntries(open0.map((l) => [l.id, l.remaining_qty / (l.unit_conv || 1)]))); }, [ls.data]);
  useEffect(() => { if (d && ship === null) setShip(Math.max(0, d.shipping_fee - d.ship_billed)); }, [d]);
  useEffect(() => { if (funds.data?.length && !funds.data.some((f) => f.id === pay.fund_id)) setP('fund_id', funds.data[0].id); }, [funds.data]);
  useEffect(() => { if (!armClose) return undefined; const t = setTimeout(() => setArmClose(false), 4000); return () => clearTimeout(t); }, [armClose]);

  if (!d || !ls.data || !qtys) {
    return <div className="pos-overlay" ref={rootRef}><div className="pos-top"><span className="grow" /><button className="pos-close" onClick={onClose}><Icon name="x" /></button></div>
      {o.error || ls.error ? <ErrorBox error={o.error || ls.error} /> : <Loading />}</div>;
  }
  const cust = customers.data?.find((c) => c.id === d.customer_id);
  const shown = open0.filter((l) => qtys[l.id] !== undefined);
  const conv = (l) => l.unit_conv || 1;
  const unitPrice = (l) => l.unit_price * conv(l);
  const takeBase = (l) => Math.min((Number(qtys[l.id]) || 0) * conv(l), l.remaining_qty);
  const lineAmt = (l) => Math.round(takeBase(l) * l.unit_price * (1 - (l.discount_pct || 0) / 100));
  // Tiền hàng đợt này: giảm giá cả đơn chia theo tỷ lệ như máy chủ tính doanh thu từng phiếu giao
  const orderGross = ls.data.reduce((t, l) => t + (l.qty - (l.cancelled_qty || 0)) * l.unit_price * (1 - (l.discount_pct || 0) / 100), 0);
  const factor = orderGross > 0 ? Math.max(0, 1 - (d.discount || 0) / orderGross) : 1;
  const gross = shown.reduce((t, l) => t + lineAmt(l), 0);
  const discount = Math.round(gross * (1 - factor));
  const goods = gross - discount;
  const vat = Math.round(goods * (d.vat_rate || 0) / 100);
  const shipAmt = Number(ship) || 0;
  const total = goods + vat + shipAmt;
  const qtySum = shown.reduce((t, l) => t + (Number(qtys[l.id]) || 0), 0);
  const prepaid = Math.max(0, d.paid_net - d.delivered_value); // khách đã trả trước (cọc) chưa trừ vào hóa đơn nào
  const used = Math.max(0, Math.min(prepaid, d.paid_net - (d.deposit_used || 0), total));
  const due = Math.max(0, total - used);
  const payAmt = Number(pay.amount) || 0;
  const debt = due - payAmt;
  const todo = shown.map((l) => ({ order_line_id: l.id, qty: takeBase(l) })).filter((x) => x.qty > 0);
  const chips = [...new Set([due, Math.ceil(due / 100000) * 100000, Math.ceil(due / 1000000) * 1000000].filter((x) => x > 0))];

  const create = async (print, confirmed) => {
    if (!todo.length) { toast('Chưa có hàng nào để tạo hóa đơn — nhập số lượng lấy đợt này', 'err'); return; }
    if (payAmt > 0 && !pay.fund_id) { toast('Chưa chọn quỹ nhận tiền', 'err'); return; }
    if (settings.confirm_complete && !confirmed) { setAsk({ print }); return; }
    setSaving(true);
    try {
      if (d.status === 'nhap') {
        const c = await run('confirm_sales_order', { id }, null);
        if (!c) return;
      }
      const r = await run('deliver', { order_id: id, date, shipping_fee: shipAmt, note: note.trim() || null, deposit_used: used, lines: todo },
        (x) => `Đã tạo hóa đơn ${x.code} cho đơn ${d.code}`);
      if (!r) return;
      let p = null;
      const amt = Math.min(payAmt, due);
      if (amt > 0) {
        try {
          try { localStorage.setItem(QUICK_FUND_KEY, pay.fund_id); } catch (e) { /* bỏ qua */ }
          p = await rpc('create_payment', { request_id: crypto.randomUUID?.() || String(Date.now()), kind: 'thu_khach', date, fund_id: pay.fund_id, party_id: d.customer_id,
            amount: amt, method: pay.method, allocations: [{ doc_type: 'don_ban', doc_id: id, amount: amt }], note: `Thu tiền hóa đơn ${r.code} (đơn ${d.code})` });
          toast(`Đã thu ${money(amt)} đ – phiếu ${p.code}${payAmt > due ? ` · trả lại khách ${money(payAmt - due)} đ` : ''}`);
        } catch (e) { toast('Đã tạo hóa đơn nhưng chưa thu được tiền: ' + e.message, 'err'); }
      }
      refresh();
      onClose();
      if (print) open('doc', { kind: 'delivery', id: r.id, type: 'hoa_don' });
    } finally { setSaving(false); }
  };
  const tryClose = () => { if (!armClose) { setArmClose(true); return; } onClose(); };
  const working = busy || saving;

  return (
    <div className="pos-overlay" ref={rootRef} role="dialog" aria-modal="true" aria-label={`Xử lý đơn hàng ${d.code}`}>
      <div className="pos-top">
        <div className="pos-tab"><Icon name="bag" size={17} /><b>{d.code}</b></div>
        <span className="grow" />
        <PosMenu screen="sale" dirty onClose={onClose} />
        <button className={`pos-close${armClose ? ' armed' : ''}`} onClick={tryClose} title="Đóng">{armClose ? <span className="small">Chưa tạo hóa đơn. Bấm lần nữa để đóng</span> : <Icon name="x" />}</button>
      </div>
      {ask && <Modal title="Xác nhận tạo hóa đơn" size="sm" onClose={() => setAsk(null)}
        footer={<><Btn onClick={() => setAsk(null)}>Quay lại</Btn><Btn kind="primary" busy={working} onClick={() => { const a = ask; setAsk(null); create(a.print, true); }}>Tạo hóa đơn</Btn></>}>
        <div className="pos-sum">
          <span>Khách hàng</span><b className="r">{d.customer_name}</b>
          <span>Khách cần trả</span><b className="r">{money(due)}</b>
          <span>Khách thanh toán</span><b className="r">{money(payAmt)}</b>
          <span>{debt < 0 ? 'Tiền thừa trả khách' : 'Tính vào công nợ'}</span><b className={`r${debt > 0 ? ' bad' : ''}`}>{money(Math.abs(debt))}</b>
        </div>
      </Modal>}
      <div className="pos-body">
        <div className="pos-left">
          <div className="pos-lines">
            {d.status === 'nhap' && <div className="pos-edit-note"><Icon name="alert" size={16} /><span>Đơn đang là phiếu tạm: khi tạo hóa đơn, đơn được xác nhận luôn.</span></div>}
            {d.delivery_count > 0 && <div className="pos-edit-note"><Icon name="alert" size={16} /><span>Đơn đã tạo {d.delivery_count} hóa đơn trước. Dưới đây là phần hàng còn lại chưa giao.</span></div>}
            {shown.length === 0 && (
              <div className="pos-empty">
                <Icon name="check" size={34} />
                <div><b>{open0.length ? 'Đã bỏ hết các dòng khỏi hóa đơn này' : 'Đơn đã giao đủ, không còn hàng để tạo hóa đơn'}</b></div>
                {open0.length > 0 && <button className="link-btn" onClick={() => setQtys(Object.fromEntries(open0.map((l) => [l.id, l.remaining_qty / conv(l)])))}>Lấy lại tất cả dòng</button>}
              </div>
            )}
            {shown.map((l, i) => {
              const rem = l.remaining_qty / conv(l); const v = Number(qtys[l.id]) || 0;
              return (
                <div className="pos-line" key={l.id}>
                  <div className="pos-line-no">{i + 1}</div>
                  <button className="pos-line-del" onClick={() => setQtys((s) => { const n = { ...s }; delete n[l.id]; return n; })} aria-label="Bỏ dòng khỏi hóa đơn" title="Bỏ dòng khỏi hóa đơn này (vẫn còn trong đơn đặt)"><Icon name="x" size={16} /></button>
                  <div className="pos-line-info">
                    <div className="pos-line-name"><span className="muted">{l.sku}</span> <b>{l.product_name}</b></div>
                    <div className={`small ${v > rem ? 'bad' : 'muted'}`}>Đặt {fq((l.qty - (l.cancelled_qty || 0)) / conv(l))} · đã giao {fq(l.delivered_qty / conv(l))} · còn {fq(rem)} {l.unit_name || l.unit}{v > rem ? ' — vượt số còn phải giao' : ''}</div>
                    {l.note && <div className="small muted">{l.note}</div>}
                  </div>
                  <div className="pos-qty">
                    <button onClick={() => setQtys((s) => ({ ...s, [l.id]: Math.max(0, v - 1) }))} aria-label="Bớt 1">−</button>
                    <NumInput money={false} min={0} max={rem} value={qtys[l.id]} onChange={(x) => setQtys((s) => ({ ...s, [l.id]: x }))} aria-label={`Số lượng ${l.product_name}`} />
                    <button onClick={() => setQtys((s) => ({ ...s, [l.id]: Math.min(rem, v + 1) }))} aria-label="Thêm 1">+</button>
                    <span className="pos-unit">{l.unit_name || l.unit}</span>
                  </div>
                  <div className="pos-price"><span className="muted small">Đơn giá</span><b>{money(unitPrice(l))}</b></div>
                  <div className="pos-ck"><span className="muted small">CK %</span><b>{fq(l.discount_pct || 0)}</b></div>
                  <div className="pos-line-total">{money(lineAmt(l))}</div>
                </div>
              );
            })}
          </div>
          <div className="pos-ordernote">
            <Icon name="edit" size={17} />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú hóa đơn" maxLength={1000} />
          </div>
        </div>

        <div className="pos-right">
          <div className="pos-meta">
            <span className="pos-staff">{d.staff || 'Người bán'}</span>
            <DateInput value={date} onChange={setDate} max={todayVN()} />
          </div>
          <div className="pos-cust-info">
            <b>{d.customer_name}</b>{d.customer_code ? <span className="muted"> · {d.customer_code}</span> : null}
            {cust?.receivable > 0 && <div className="small bad">Nợ: {money(cust.receivable)}</div>}
          </div>
          <div className="pos-sum">
            <span>Tổng tiền hàng <span className="pos-count">{fq(qtySum)}</span></span><b className="r">{money(gross)}</b>
            <span>Giảm giá</span><b className="r">{money(discount)}</b>
            {vat > 0 && <><span>VAT {fq(d.vat_rate)}%</span><b className="r">{money(vat)}</b></>}
            <span>Thu khác (vận chuyển)</span><NumInput suffix={false} min={0} value={ship} onChange={setShip} className="pos-uline" aria-label="Phí vận chuyển" />
            <span>Khách đã trả</span><b className="r">{money(used)}</b>
            <b>Khách cần trả</b><b className="r pos-due-amt">{money(due)}</b>
          </div>
          {canPay && (
            <div className="pos-pay">
              <div className="pos-sum">
                <b>Khách thanh toán</b>
                <NumInput suffix={false} min={0} value={pay.amount} onChange={(v) => setP('amount', v)} placeholder="0" className="pos-uline" aria-label="Khách thanh toán" />
              </div>
              <div className="pos-methods">{METHODS.map((m) => <button key={m} className={`pos-chip${pay.method === m ? ' on' : ''}`} onClick={() => setP('method', m)}>{m}</button>)}</div>
              {chips.length > 0 && <div className="pos-methods">{chips.map((x) => <button key={x} className={`pos-chip${payAmt === x ? ' on' : ''}`} onClick={() => setP('amount', x)}>{money(x)}</button>)}</div>}
              {payAmt > 0 && <Select value={pay.fund_id} onChange={(v) => setP('fund_id', v)} options={(funds.data || []).map((x) => ({ value: x.id, label: 'Vào quỹ: ' + x.name }))} aria-label="Vào quỹ" />}
              <div className="pos-sum">
                <span>{debt < 0 ? 'Tiền thừa trả khách' : 'Tính vào công nợ'}</span><b className={`r${debt > 0 ? ' bad' : ''}`}>{debt > 0 ? '- ' : ''}{money(Math.abs(debt))}</b>
              </div>
            </div>
          )}
          <span className="grow" />
          <div className="pos-links">
            <button className="link-btn small" disabled={working} onClick={() => { onClose(); open('order-form', { id }); }}>Sửa đơn đặt hàng</button>
          </div>
          <div className="pos-actions">
            <button className="pos-btn pos-btn-print" disabled={working} onClick={() => create(true)} title="Tạo hóa đơn và in">IN</button>
            <button className="pos-btn pos-btn-main" disabled={working || !todo.length} onClick={() => create(false)}>{working ? <span className="spin" /> : 'TẠO HÓA ĐƠN'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
