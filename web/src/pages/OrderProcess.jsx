// Xử lý đơn đặt hàng như KiotViet: bấm "Xử lý đơn hàng" ở trang Đặt hàng → mở màn hình bán hàng riêng cho đơn đó
// (tab mang mã DH…), các dòng hàng còn phải giao điền sẵn. Trên màn hình này được:
// - sửa số lượng lấy đợt này (lấy vượt số đặt thì đơn tăng theo), sửa đơn giá / chiết khấu dòng chưa giao, thêm hàng mới (F3);
// - LƯU: chỉ ghi các thay đổi vào đơn đặt hàng, chưa tạo hóa đơn;
// - TẠO HÓA ĐƠN / IN: ghi thay đổi (nếu có), tạo hóa đơn HD… (trừ kho, ghi doanh thu), khấu trừ tiền khách đã trả trước
//   và lập phiếu thu phần khách thanh toán. Đơn còn hàng chưa lấy thì lần sau xử lý tiếp.
import { tripDue, isProgress, payRatio, payTermLabel } from '../lib/pay-term.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAction, useQ } from '../lib/store.jsx';
import { money, qty as fq, todayVN } from '../lib/format.js';
import { useFunds, useCustomers, useProducts, usePriceBooks, priceOf, levelTier } from '../lib/lookups.js';
import { Btn, Icon, Select, DateInput, NumInput, Loading, ErrorBox, Modal } from '../components/ui.jsx';
import { PosMenu } from '../components/PosMenu.jsx';
import { ProductSearch } from './OrderPos.jsx';
import { QUICK_FUND_KEY, readFund } from './Sales.jsx';

const METHODS = ['Tiền mặt', 'Chuyển khoản', 'Thẻ', 'Ví'];
let seq = 0;
const rid = () => crypto.randomUUID?.() || String(Date.now() + Math.random());

// Dòng trên màn hình từ một dòng đơn còn phải giao; số lượng, giá theo đơn vị bán của dòng
const fromLine = (l) => {
  const c = l.unit_conv || 1;
  return { key: l.id, id: l.id, product_id: l.product_id, sku: l.sku, name: l.product_name, unit: l.unit_name || l.unit, conv: c, note: l.note,
    qty: l.remaining_qty / c, rem: l.remaining_qty / c, ordered: (l.qty - (l.cancelled_qty || 0)) / c, delivered: l.delivered_qty / c,
    price: l.unit_price * c, price0: l.unit_price * c, disc: l.discount_pct || 0, disc0: l.discount_pct || 0, lockPrice: l.delivered_qty > 0 };
};

export function OrderProcess({ id, onClose }) {
  const { open, can, rpc, toast, refresh, settings } = useApp();
  const { run, busy } = useAction();
  const o = useQ('sales_orders', [['id', 'eq', id]]);
  const ls = useQ('sales_order_lines', [['order_id', 'eq', id]], 'line_no');
  const customers = useCustomers();
  const products = useProducts();
  const priceBooks = usePriceBooks();
  const canPay = can('thu_chi');
  const funds = useFunds(canPay);
  const rootRef = useRef(null); const searchRef = useRef(null);
  const d = o.data?.[0];
  const [rows, setRows] = useState(null);
  const [date, setDate] = useState(todayVN());
  const [ship, setShip] = useState(null);
  const [note, setNote] = useState('');
  const [pay, setPay] = useState({ amount: null, method: 'Tiền mặt', fund_id: readFund() });
  const [ask, setAsk] = useState(null);
  const [saving, setSaving] = useState(false);
  const [armClose, setArmClose] = useState(false);
  const setP = (k, v) => setPay((s) => ({ ...s, [k]: v }));
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  useEffect(() => { if (ls.data && !rows) setRows(ls.data.filter((l) => l.remaining_qty > 0).map(fromLine)); }, [ls.data]);
  useEffect(() => { if (d && ship === null) setShip(Math.max(0, d.shipping_fee - d.ship_billed)); }, [d]);
  useEffect(() => { if (funds.data?.length && !funds.data.some((f) => f.id === pay.fund_id)) setP('fund_id', funds.data[0].id); }, [funds.data]);
  useEffect(() => { if (!armClose) return undefined; const t = setTimeout(() => setArmClose(false), 4000); return () => clearTimeout(t); }, [armClose]);
  useEffect(() => {
    const h = (e) => { const all = document.querySelectorAll('.overlay, .pos-overlay'); if (all[all.length - 1] !== rootRef.current) return;
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  const sellable = useMemo(() => (products.data || []).filter((p) => p.sell_direct), [products.data]);

  if (!d || !ls.data || !rows || !products.data) {
    return <div className="pos-overlay" ref={rootRef}><div className="pos-top"><span className="grow" /><button className="pos-close" onClick={onClose}><Icon name="x" /></button></div>
      {o.error || ls.error ? <ErrorBox error={o.error || ls.error} /> : <Loading />}</div>;
  }
  const cust = customers.data?.find((c) => c.id === d.customer_id);
  const tier = levelTier(d.price_level, cust?.price_tier || 1);
  const pbook = (priceBooks.data || []).find((b) => b.id === d.price_book_id) || null;
  const addProduct = (p) => setRows((rs) => {
    const ex = rs.find((r) => r.product_id === p.id && (r.conv || 1) === 1);
    if (ex) return rs.map((r) => (r === ex ? { ...r, qty: (Number(r.qty) || 0) + 1 } : r));
    const price = priceOf(p, { tier, book: pbook });
    return [...rs, { key: 'n' + (++seq), product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, conv: 1, note: p.order_note || null,
      qty: 1, rem: 0, ordered: 0, delivered: 0, price, price0: price, disc: 0, disc0: 0, isNew: true }];
  });

  const lineAmt = (r) => Math.round((Number(r.qty) || 0) * (Number(r.price) || 0) * (1 - (Number(r.disc) || 0) / 100));
  // Thay đổi phải ghi vào đơn trước: hàng mới, đổi giá / chiết khấu, lấy vượt số còn phải giao
  const changed = rows.filter((r) => r.isNew || Number(r.price) !== r.price0 || Number(r.disc) !== r.disc0 || (Number(r.qty) || 0) > r.rem + 1e-9);
  const dirty = changed.length > 0;
  // Tiền hàng đợt này: giảm giá cả đơn chia theo tỷ lệ như máy chủ tính doanh thu từng phiếu giao
  const orderGross = ls.data.reduce((t, l) => {
    const r = rows.find((x) => x.id === l.id);
    const q = r ? Math.max(l.qty - (l.cancelled_qty || 0), l.delivered_qty + (Number(r.qty) || 0) * r.conv) : l.qty - (l.cancelled_qty || 0);
    return t + q * (r ? (Number(r.price) || 0) / r.conv : l.unit_price) * (1 - (r ? Number(r.disc) || 0 : l.discount_pct || 0) / 100);
  }, 0) + rows.filter((r) => r.isNew).reduce((t, r) => t + lineAmt(r), 0);
  const factor = orderGross > 0 ? Math.max(0, 1 - (d.discount || 0) / orderGross) : 1;
  const gross = rows.reduce((t, r) => t + lineAmt(r), 0);
  const discount = Math.round(gross * (1 - factor));
  const goods = gross - discount;
  const vat = Math.round(goods * (d.vat_rate || 0) / 100);
  const shipAmt = Number(ship) || 0;
  const total = goods + vat + shipAmt;
  const qtySum = rows.reduce((t, r) => t + (Number(r.qty) || 0), 0);
  // Đơn thanh toán trên hóa đơn giao một lần (đợt này lấy hết, chưa có hóa đơn nào): hóa đơn trừ thẳng tiền cọc và các khoản khách đã trả cho đơn.
  // Còn lại tiền của đơn ghi riêng, không trừ vào hóa đơn này: khách cần trả đủ giá trị hóa đơn.
  const single = !isProgress(d) && !d.delivery_count && rows.every((r) => r.isNew || (Number(r.qty) || 0) >= r.rem - 1e-9);
  const prepaid = single ? Math.max(0, d.paid_net || 0) : Math.max(0, d.paid_net - d.delivered_value);
  // Theo tiến độ giao hàng: chuyến này đến hạn tỷ lệ % giá trị thực giao (tiền cọc chỉ dùng khi chủ sổ cấn trừ)
  const suggest = isProgress(d) ? tripDue(total, payRatio(d)) : null;
  const due = single ? Math.max(0, total - prepaid) : total;
  const payAmt = Number(pay.amount) || 0;
  const debt = due - payAmt;
  const takes = rows.filter((r) => (Number(r.qty) || 0) > 0);
  const chips = [...new Set([suggest, due, Math.ceil(due / 100000) * 100000, Math.ceil(due / 1000000) * 1000000].filter((x) => x > 0))];

  // Ghi thay đổi vào đơn đặt hàng (giữ nguyên các dòng đã giao đủ, khách, kênh bán, giảm giá, phí vận chuyển của đơn)
  const saveOrder = async (confirm) => {
    const sent = [];
    for (const l of ls.data) {
      const r = rows.find((x) => x.id === l.id);
      const eff = l.qty - (l.cancelled_qty || 0);
      if (eff <= 0 && !(l.delivered_qty > 0) && !r) continue;
      sent.push({ row: r, line: { id: l.id, product_id: l.product_id,
        qty: r ? Math.max(eff, l.delivered_qty + (Number(r.qty) || 0) * r.conv) : eff,
        unit_price: r ? (Number(r.price) || 0) / r.conv : l.unit_price, unit_name: l.unit_name || null,
        discount_pct: r ? Number(r.disc) || 0 : l.discount_pct, po_line_id: l.po_line_id || null, note: l.note || null,
        custom_price: !!l.custom_price || (!!r && Number(r.price) !== r.price0) } });
    }
    for (const r of rows.filter((x) => x.isNew && Number(x.qty) > 0)) {
      sent.push({ row: r, line: { id: null, product_id: r.product_id, qty: Number(r.qty), unit_price: Number(r.price) || 0, unit_name: null,
        discount_pct: Number(r.disc) || 0, po_line_id: null, note: r.note || null, custom_price: Number(r.price) !== r.price0 } });
    }
    const res = await run('save_sales_order', { id, kind: 'dat_hang', customer_id: d.customer_id, channel: d.channel, order_date: d.order_date, due_date: d.due_date,
      staff: d.staff, note: d.note, discount: d.discount || 0, shipping_fee: d.shipping_fee, vat_rate: d.vat_rate || 0, price_book_id: d.price_book_id, price_level: d.price_level,
      status: confirm || d.status === 'xac_nhan' ? 'xac_nhan' : 'nhap', lines: sent.map((x) => x.line) }, null);
    if (!res) return null;
    // Dòng thứ i gửi lên được lưu với số thứ tự i: lấy lại mã dòng cho hàng vừa thêm
    const fresh = await rpc('q', { view: 'sales_order_lines', filters: [['order_id', 'eq', id]], order: 'line_no' });
    const byNo = new Map(fresh.map((l) => [l.line_no, l.id]));
    const ids = new Map(sent.map((x, i) => [x.row?.key, byNo.get(i + 1)]).filter(([k]) => k));
    return { res, ids };
  };

  const create = async (print, confirmed) => {
    if (!takes.length) { toast('Chưa có hàng nào để tạo hóa đơn — nhập số lượng lấy đợt này', 'err'); return; }
    if (payAmt > 0 && !pay.fund_id) { toast('Chưa chọn quỹ nhận tiền', 'err'); return; }
    if (settings.confirm_complete && !confirmed) { setAsk({ print }); return; }
    setSaving(true);
    try {
      let ids = null;
      if (dirty) {
        const s = await saveOrder(true);
        if (!s) return;
        ids = s.ids;
      } else if (d.status === 'nhap') {
        if (!(await run('confirm_sales_order', { id }, null))) return;
      }
      const lines = takes.map((r) => ({ order_line_id: ids ? ids.get(r.key) : r.id, qty: (Number(r.qty) || 0) * r.conv }));
      const r = await run('deliver', { order_id: id, date, shipping_fee: shipAmt, note: note.trim() || null, lines },
        (x) => `Đã tạo hóa đơn ${x.code} cho đơn ${d.code}`);
      if (!r) { if (dirty) { toast('Đã lưu thay đổi vào đơn nhưng chưa tạo được hóa đơn', 'err'); onClose(); } return; }
      const amt = Math.min(payAmt, due);
      if (amt > 0) {
        try {
          try { localStorage.setItem(QUICK_FUND_KEY, pay.fund_id); } catch (e) { /* bỏ qua */ }
          const p = await rpc('create_payment', { request_id: rid(), kind: 'thu_khach', date, fund_id: pay.fund_id, party_id: d.customer_id,
            amount: amt, method: pay.method, allocations: [{ doc_type: 'hoa_don', doc_id: r.id, amount: amt }], note: `Thu tiền hóa đơn ${r.code} (đơn ${d.code})` });
          toast(`Đã thu ${money(amt)} đ – phiếu ${p.code}${payAmt > due ? ` · trả lại khách ${money(payAmt - due)} đ` : ''}`);
        } catch (e) { toast('Đã tạo hóa đơn nhưng chưa thu được tiền: ' + e.message, 'err'); }
      }
      refresh();
      onClose();
      if (print) open('doc', { kind: 'delivery', id: r.id, type: 'hoa_don' });
    } finally { setSaving(false); }
  };
  const save = async () => {
    if (!dirty) { onClose(); return; }
    setSaving(true);
    try { if (await saveOrder(false)) { toast(`Đã lưu đơn ${d.code}`); onClose(); } } finally { setSaving(false); }
  };
  const tryClose = () => { if (!armClose) { setArmClose(true); return; } onClose(); };
  const working = busy || saving;

  return (
    <div className="pos-overlay" ref={rootRef} role="dialog" aria-modal="true" aria-label={`Xử lý đơn hàng ${d.code}`}>
      <div className="pos-top">
        <ProductSearch products={sellable} tier={tier} book={pbook} onPick={addProduct} inputRef={searchRef} />
        <div className="pos-tab"><Icon name="bag" size={17} /><b>{d.code}</b></div>
        <span className="grow" />
        <PosMenu screen="sale" dirty onClose={onClose} keys={[['F3', 'Tìm hàng hóa']]} />
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
            {rows.length === 0 && (
              <div className="pos-empty">
                <Icon name="search" size={34} />
                <div><b>Chưa có hàng nào trong hóa đơn này</b></div>
                <div className="muted">Gõ tên hoặc mã hàng vào ô tìm kiếm phía trên (F3) để thêm.</div>
                {ls.data.some((l) => l.remaining_qty > 0) && <button className="link-btn" onClick={() => setRows(ls.data.filter((l) => l.remaining_qty > 0).map(fromLine))}>Lấy lại các dòng còn phải giao của đơn</button>}
              </div>
            )}
            {rows.map((r, i) => {
              const v = Number(r.qty) || 0;
              return (
                <div className="pos-line" key={r.key}>
                  <div className="pos-line-no">{i + 1}</div>
                  <button className="pos-line-del" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Bỏ dòng khỏi hóa đơn"
                    title={r.isNew ? 'Xóa dòng' : 'Bỏ dòng khỏi hóa đơn này (vẫn còn trong đơn đặt)'}><Icon name="x" size={16} /></button>
                  <div className="pos-line-info">
                    <div className="pos-line-name"><span className="muted">{r.sku}</span> <b>{r.name}</b></div>
                    {r.isNew ? <div className="small accent">Hàng thêm mới — khi lưu sẽ thêm vào đơn đặt hàng</div>
                      : <div className={`small ${v > r.rem ? 'warn' : 'muted'}`}>Đặt {fq(r.ordered)} · đã giao {fq(r.delivered)} · còn {fq(r.rem)} {r.unit}{v > r.rem ? ` — lấy thêm ${fq(v - r.rem)}, đơn tăng theo` : ''}</div>}
                    {r.note && <div className="small muted">{r.note}</div>}
                  </div>
                  <div className="pos-qty">
                    <button onClick={() => setRow(r.key, { qty: Math.max(0, v - 1) })} aria-label="Bớt 1">−</button>
                    <NumInput money={false} min={0} value={r.qty} onChange={(x) => setRow(r.key, { qty: x })} aria-label={`Số lượng ${r.name}`} />
                    <button onClick={() => setRow(r.key, { qty: v + 1 })} aria-label="Thêm 1">+</button>
                    <span className="pos-unit">{r.unit}</span>
                  </div>
                  <div className="pos-price">
                    <span className="muted small">{Number(r.price) !== r.price0 ? 'Giá riêng' : 'Đơn giá'}</span>
                    {r.lockPrice ? <b title="Dòng đã giao một phần: sửa giá ở Sửa đơn đặt hàng">{money(r.price)}</b>
                      : <NumInput suffix={false} min={0} value={r.price} onChange={(x) => setRow(r.key, { price: x })} aria-label={`Đơn giá ${r.name}`} />}
                  </div>
                  <label className="pos-ck"><span className="muted small">CK %</span>
                    {r.lockPrice ? <b>{fq(r.disc)}</b> : <NumInput money={false} min={0} max={100} value={r.disc} onChange={(x) => setRow(r.key, { disc: x })} aria-label="Chiết khấu %" />}</label>
                  <div className="pos-line-total">{money(lineAmt(r))}</div>
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
            {single && prepaid > 0 && <><span>Giá trị hóa đơn</span><b className="r">{money(total)}</b>
              <span>Trừ tiền cọc / đã thanh toán của đơn</span><b className="r">{money(-prepaid)}</b></>}
            <b>Khách cần trả</b><b className="r pos-due-amt">{money(due)}</b>
            {!single && prepaid > 0 && <><span className="muted small">Tiền cọc của đơn (ghi riêng, không trừ vào hóa đơn)</span><span className="r muted small">{money(prepaid)}</span></>}
            {suggest !== null && <><span className="small" title={payTermLabel(d)}>Theo tiến độ · chuyến này đến hạn {fq(payRatio(d))}%</span><b className="r">{money(suggest)}</b></>}
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
            <button className="link-btn small" disabled={working} onClick={() => { onClose(); open('order-form', { id }); }}>Sửa đơn đặt hàng (đổi khách, giảm giá cả đơn…)</button>
          </div>
          <div className="pos-actions pos-actions-3">
            <button className="pos-btn pos-btn-print" disabled={working} onClick={() => create(true)} title="Tạo hóa đơn và in">IN</button>
            <button className="pos-btn pos-btn-main" disabled={working || !takes.length} onClick={() => create(false)}>{working ? <span className="spin" /> : 'TẠO HÓA ĐƠN'}</button>
            <button className="pos-btn pos-btn-save" disabled={working} onClick={save} title="Lưu thay đổi vào đơn đặt hàng, chưa tạo hóa đơn">LƯU</button>
          </div>
        </div>
      </div>
    </div>
  );
}
