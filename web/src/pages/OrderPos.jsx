// Màn hình tạo / sửa đơn bán kiểu quầy (toàn màn hình):
// gõ tên hoặc mã vào ô tìm kiếm → chọn là có ngay một dòng hàng, không cần bấm "Thêm dòng".
// Mỗi dòng có ô ghi chú riêng (đặc điểm hàng, men, yêu cầu đóng gói…) và được in lên hóa đơn.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAction } from '../lib/store.jsx';
import { money, qty as fq, todayVN, match } from '../lib/format.js';
import { useProducts, useCustomers, useFunds, tierPrice, productSub } from '../lib/lookups.js';
import { packing, weightOf, fmtKg } from '../lib/docs/model.js';
import { Btn, Icon, Input, Select, DateInput, NumInput, Loading, Picker } from '../components/ui.jsx';

let seq = 0;
const METHODS = ['Tiền mặt', 'Chuyển khoản', 'Thẻ / POS', 'TikTok Shop', 'COD'];
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } };

// Ô tìm hàng hóa: chọn là thêm dòng; máy quét mã vạch (gõ mã + Enter) thêm ngay nếu trùng SKU
function ProductSearch({ products, tier, onPick, inputRef }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [hi, setHi] = useState(0);
  const boxRef = useRef(null); const listRef = useRef(null);
  const list = useMemo(() => {
    if (!q.trim()) return products.slice(0, 40);
    return products.filter((p) => match(`${p.sku} ${p.name} ${p.size || ''} ${p.color || ''} ${p.pattern || ''} ${p.category || ''}`, q)).slice(0, 60);
  }, [products, q]);
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => { listRef.current?.querySelector('.hi')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const pick = (p) => { onPick(p); setQ(''); setHi(0); setOpen(false); inputRef.current?.focus(); };
  return (
    <div className="pos-search" ref={boxRef}>
      <Icon name="search" size={20} />
      <input ref={inputRef} value={q} placeholder="Tìm hàng hóa theo tên hoặc mã (F3)" autoComplete="off"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            const exact = products.find((p) => p.sku.toLowerCase() === q.trim().toLowerCase());
            if (exact) pick(exact); else if (open && list[hi]) pick(list[hi]);
          } else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
        }} />
      {q && <button className="pos-search-x" onClick={() => { setQ(''); inputRef.current?.focus(); }} aria-label="Xóa"><Icon name="x" size={16} /></button>}
      {open && (
        <div className="pos-results" ref={listRef}>
          {list.length === 0 && <div className="picker-empty">Không tìm thấy “{q}”</div>}
          {list.map((p, i) => (
            <button type="button" key={p.id} className={`pos-result${i === hi ? ' hi' : ''}`} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
              {p.image_url ? <img src={p.image_url} alt="" /> : <span className="pos-thumb"><Icon name="box" size={18} /></span>}
              <span className="pos-result-main">
                <b>{p.name}{p.is_kit ? ' (bộ)' : ''}</b>
                <span className="muted small">{p.sku}{productSub(p) ? ' · ' + productSub(p) : ''}</span>
              </span>
              <span className="pos-result-side">
                <b>{money(tierPrice(p, tier))}</b>
                <span className={`small ${p.available <= 0 ? 'bad' : 'muted'}`}>Có thể bán: {fq(p.available)} {p.unit}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrderPos({ id, kind: kind0, customer_id: cust0, onClose }) {
  const { settings, open, can, rpc, toast, book } = useApp();
  const products = useProducts();
  const customers = useCustomers();
  const funds = useFunds(can('thu_chi'));
  const { run, busy } = useAction();
  const searchRef = useRef(null); const rootRef = useRef(null); const lastAdded = useRef(null);
  const [loaded, setLoaded] = useState(!id);
  const [armClose, setArmClose] = useState(false);
  const [f, setF] = useState({
    kind: kind0 || 'ban_san', customer_id: cust0 || '', channel: (settings.channels || [])[0] || '', order_date: todayVN(), due_date: '',
    staff: lsGet('gomsu.staff'), note: '', discount: 0, shipping_fee: 0, lines: [],
    pay: { amount: null, fund_id: '', method: 'Tiền mặt', fee: null },
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setPay = (k, v) => setF((s) => ({ ...s, pay: { ...s.pay, [k]: v } }));

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [o] = await rpc('q', { view: 'sales_orders', filters: [['id', 'eq', id]] });
      const ls = await rpc('q', { view: 'sales_order_lines', filters: [['order_id', 'eq', id]], order: 'line_no' });
      setF((s) => ({ ...s, kind: o.kind, customer_id: o.customer_id, channel: o.channel || '', order_date: o.order_date, due_date: o.due_date || '', staff: o.staff || '',
        note: o.note || '', discount: o.discount, shipping_fee: o.shipping_fee, status0: o.status, code: o.code,
        lines: ls.map((l) => ({ key: ++seq, id: l.id, product_id: l.product_id, qty: l.qty, unit_price: l.unit_price, discount_pct: l.discount_pct, po_line_id: l.po_line_id, note: l.note || '', manual: true })) }));
      setLoaded(true);
    })().catch((e) => toast(e.message, 'err'));
  }, [id]);

  useEffect(() => {
    if (!f.customer_id && customers.data) { const kl = customers.data.find((c) => c.code === 'KL'); if (kl) set('customer_id', kl.id); }
    if (!f.pay.fund_id && funds.data?.length) setPay('fund_id', funds.data[0].id);
  }, [customers.data, funds.data]);

  const cust = customers.data?.find((c) => c.id === f.customer_id);
  const tier = cust?.price_tier || 1;
  const pmap = useMemo(() => Object.fromEntries((products.data || []).map((p) => [p.id, p])), [products.data]);
  // Đổi khách → giá các dòng chưa sửa tay theo mức giá của khách
  useEffect(() => {
    setF((s) => ({ ...s, lines: s.lines.map((l) => (!l.manual && pmap[l.product_id] ? { ...l, unit_price: tierPrice(pmap[l.product_id], tier) } : l)) }));
  }, [tier, pmap]);

  const addProduct = (p) => {
    setF((s) => {
      const ex = s.lines.find((l) => l.product_id === p.id && !l.po_line_id);
      if (ex) { lastAdded.current = ex.key; return { ...s, lines: s.lines.map((l) => (l === ex ? { ...l, qty: (Number(l.qty) || 0) + 1 } : l)) }; }
      const key = ++seq; lastAdded.current = key;
      return { ...s, lines: [...s.lines, { key, product_id: p.id, qty: 1, unit_price: tierPrice(p, tier), discount_pct: 0, note: '', manual: false }] };
    });
  };
  useEffect(() => {
    if (!lastAdded.current) return;
    const el = rootRef.current?.querySelector(`[data-line="${lastAdded.current}"]`);
    if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    lastAdded.current = null;
  }, [f.lines]);
  const setLine = (key, patch) => setF((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const delLine = (key) => setF((s) => ({ ...s, lines: s.lines.filter((l) => l.key !== key) }));

  const lineTotal = (l) => Math.round((Number(l.qty) || 0) * (Number(l.unit_price) || 0) * (1 - (Number(l.discount_pct) || 0) / 100));
  const gross = f.lines.reduce((s, l) => s + lineTotal(l), 0);
  const qtySum = f.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const wLines = f.lines.map((l) => weightOf(l.qty, pmap[l.product_id]));
  const weightSum = wLines.reduce((s, w) => s + (w || 0), 0);
  const noWeight = f.lines.filter((l, i) => wLines[i] === null && Number(l.qty) > 0).length;
  const boxSum = f.lines.reduce((s, l) => { const p = pmap[l.product_id]; return s + (p ? packing(l.qty, p.units_per_pack, p.pack_unit, p.unit).boxes : 0); }, 0);
  const packUnits = [...new Set(f.lines.map((l) => pmap[l.product_id]).filter((p) => p && p.units_per_pack).map((p) => p.pack_unit || 'hộp'))];
  const boxLabel = packUnits.length === 1 ? packUnits[0] : 'kiện';
  const goods = Math.max(0, Math.round(gross - (Number(f.discount) || 0)));
  const total = goods + (Number(f.shipping_fee) || 0);
  const payAmt = Number(f.pay.amount) || 0;
  const editing = !!id;
  const isDat = f.kind === 'dat_hang';
  const isOnline = /tiktok|shopee|lazada|facebook/i.test(f.channel || '');
  const priceNames = settings.price_names || ['Giá 1', 'Giá 2', 'Giá 3'];

  // Phím tắt: F3 tìm hàng, F4 tìm khách
  useEffect(() => {
    const h = (e) => {
      const all = document.querySelectorAll('.overlay, .pos-overlay'); if (all[all.length - 1] !== rootRef.current) return;
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'F4') { e.preventDefault(); rootRef.current?.querySelector('.pos-cust .picker-box')?.click(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  const ready = loaded && !!products.data && !!customers.data;
  useEffect(() => { if (ready) setTimeout(() => searchRef.current?.focus(), 50); }, [ready]);
  useEffect(() => { if (!armClose) return undefined; const t = setTimeout(() => setArmClose(false), 4000); return () => clearTimeout(t); }, [armClose]);
  const tryClose = () => { if (f.lines.length && !armClose) { setArmClose(true); return; } onClose(); };

  const submit = async (mode, print) => {
    const lines = f.lines.filter((l) => l.product_id && Number(l.qty) > 0);
    if (!lines.length) { toast('Đơn hàng chưa có sản phẩm — gõ tên hàng vào ô tìm kiếm', 'err'); searchRef.current?.focus(); return; }
    lsSet('gomsu.staff', f.staff || '');
    const p = {
      id: id || null, kind: f.kind, customer_id: f.customer_id, channel: f.channel, order_date: f.order_date, due_date: f.due_date || null, staff: f.staff,
      note: f.note, discount: Number(f.discount) || 0, shipping_fee: Number(f.shipping_fee) || 0,
      status: mode === 'draft' ? 'nhap' : 'xac_nhan', deliver_now: mode === 'deliver',
      lines: lines.map((l) => ({ id: l.id || null, product_id: l.product_id, qty: Number(l.qty), unit_price: l.unit_price, discount_pct: Number(l.discount_pct) || 0,
        po_line_id: l.po_line_id || null, note: (l.note || '').trim() || null })),
      deposit: payAmt > 0 && mode !== 'draft' ? { amount: Math.min(payAmt, mode === 'deliver' ? total : payAmt), fund_id: f.pay.fund_id, method: f.pay.method, fee: f.pay.fee || 0 } : null,
    };
    const r = await run('save_sales_order', p, (r2) => `Đã lưu đơn ${r2.code}${r2.delivery_code ? ' · đã giao (' + r2.delivery_code + ')' : ''}${r2.payment_code ? ' · phiếu thu ' + r2.payment_code : ''}`);
    if (r) {
      onClose();
      if (r.warnings?.length) toast('Lưu ý tồn kho: ' + r.warnings.join('; '), 'err');
      if (print) open('doc', { kind: 'order', id: r.id, type: isDat ? 'don_dat_hang' : 'hoa_don' });
      else if (!editing) open('order', { id: r.id });
    }
  };
  const savingConfirmed = editing && f.status0 === 'xac_nhan';
  const mainMode = isDat || savingConfirmed ? 'confirm' : 'deliver';

  if (!loaded || !products.data || !customers.data) return <div className="pos-overlay" ref={rootRef}><div className="pos-top"><span className="grow" /><button className="pos-close" onClick={onClose}><Icon name="x" /></button></div><Loading /></div>;
  return (
    <div className="pos-overlay" ref={rootRef} role="dialog" aria-modal="true" aria-label="Tạo đơn bán">
      <div className="pos-top">
        <ProductSearch products={products.data} tier={tier} onPick={addProduct} inputRef={searchRef} />
        <div className="pos-tab">
          <Icon name="cart" size={17} />
          <b>{editing ? `Sửa đơn ${f.code}` : isDat ? 'Đơn đặt riêng' : 'Đơn bán mới'}</b>
        </div>
        <span className="grow" />
        <div className="seg pos-kind">
          <button className={!isDat ? 'on' : ''} onClick={() => set('kind', 'ban_san')}>Bán có sẵn</button>
          <button className={isDat ? 'on' : ''} onClick={() => set('kind', 'dat_hang')}>Đặt riêng</button>
        </div>
        <button className={`pos-close${armClose ? ' armed' : ''}`} onClick={tryClose} title="Đóng">{armClose ? <span className="small">Bỏ đơn đang làm? Bấm lần nữa</span> : <Icon name="x" />}</button>
      </div>

      <div className="pos-body">
        <div className="pos-left">
          <div className="pos-lines">
            {f.lines.length === 0 && (
              <div className="pos-empty">
                <Icon name="search" size={34} />
                <div><b>Gõ tên hoặc mã sản phẩm vào ô tìm kiếm phía trên</b></div>
                <div className="muted">Chọn là thêm vào đơn ngay. Chọn lại cùng sản phẩm sẽ cộng thêm số lượng. Có thể dùng máy quét mã vạch.</div>
              </div>
            )}
            {f.lines.map((l, i) => {
              const p = pmap[l.product_id] || {};
              const short = !isDat && Number(l.qty) > (p.available ?? 0);
              const pk = packing(l.qty, p.units_per_pack, p.pack_unit, p.unit);
              const kg = wLines[i];
              return (
                <div className="pos-line" key={l.key} data-line={l.key}>
                  <div className="pos-line-no">{i + 1}</div>
                  <button className="pos-line-del" onClick={() => delLine(l.key)} aria-label="Xóa dòng" title="Xóa dòng"><Icon name="x" size={16} /></button>
                  <div className="pos-line-info">
                    <div className="pos-line-name"><span className="muted">{p.sku}</span> <b>{p.name || '…'}</b>{p.is_kit ? ' (bộ)' : ''}</div>
                    <div className={`small ${short ? 'bad' : 'muted'}`}>
                      {productSub(p) ? productSub(p) + ' · ' : ''}Có thể bán {fq(p.available)} {p.unit}{p.incoming ? ` · đang về ${fq(p.incoming)}` : ''}{short ? ' — không đủ để giao ngay' : ''}
                    </div>
                    <div className="pos-split">
                      {pk.text ? <span className="pos-pack"><Icon name="box" size={14} /> {pk.text}</span>
                        : p.id && !p.is_kit ? <button className="link-btn small" onClick={() => open('product', { id: p.id })}>+ Khai số {String(p.unit || 'cái').toLowerCase()}/thùng để tự chia thùng</button> : null}
                      {kg !== null && <span className="pos-kg">{fmtKg(kg)}</span>}
                    </div>
                    <input className="pos-note" value={l.note || ''} maxLength={300} onChange={(e) => setLine(l.key, { note: e.target.value })}
                      placeholder="Ghi chú cho hàng này (đặc điểm, men, kích thước, yêu cầu đóng gói…)" />
                  </div>
                  <div className="pos-qty">
                    <button onClick={() => setLine(l.key, { qty: Math.max(0, (Number(l.qty) || 0) - 1) })} aria-label="Bớt 1">−</button>
                    <NumInput money={false} min={0} value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} aria-label="Số lượng" />
                    <button onClick={() => setLine(l.key, { qty: (Number(l.qty) || 0) + 1 })} aria-label="Thêm 1">+</button>
                    <span className="pos-unit">{p.unit}</span>
                  </div>
                  <label className="pos-price"><span className="muted small">Đơn giá</span><NumInput suffix={false} value={l.unit_price} onChange={(v) => setLine(l.key, { unit_price: v, manual: true })} aria-label="Đơn giá" /></label>
                  <label className="pos-ck"><span className="muted small">CK %</span><NumInput money={false} min={0} max={100} value={l.discount_pct} onChange={(v) => setLine(l.key, { discount_pct: v })} aria-label="Chiết khấu %" /></label>
                  <div className="pos-line-total">{money(lineTotal(l))}</div>
                </div>
              );
            })}
          </div>
          <div className="pos-ordernote">
            <Icon name="edit" size={17} />
            <input value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Ghi chú đơn hàng" maxLength={1000} />
          </div>
        </div>

        <div className="pos-right">
          <div className="pos-meta">
            <input className="pos-staff" value={f.staff} onChange={(e) => set('staff', e.target.value)} placeholder="Người bán" list="pos-staff-list" />
            <datalist id="pos-staff-list">{[book?.my_name, ...(settings.staff_names || [])].filter(Boolean).map((x) => <option key={x} value={x} />)}</datalist>
            <DateInput value={f.order_date} onChange={(v) => set('order_date', v)} max={todayVN()} />
          </div>
          <div className="pos-cust">
            <Picker items={customers.data} value={f.customer_id} onChange={(v) => set('customer_id', v)} placeholder="Tìm khách hàng (F4)"
              getLabel={(c) => c.name} getSub={(c) => `${c.code}${c.phone ? ' · ' + c.phone : ''}`}
              filterKeys={(c) => `${c.name} ${c.code} ${c.phone || ''} ${String(c.phone || '').replace(/\D/g, '')}`}
              onCreate={(name) => open('party', { type: 'kh', name, onSaved: (r) => set('customer_id', r.id) })} createLabel="Thêm khách mới" />
            <button className="pos-cust-add" title="Thêm khách mới" onClick={() => open('party', { type: 'kh', onSaved: (r) => set('customer_id', r.id) })}><Icon name="plus" size={18} /></button>
          </div>
          {cust && cust.code !== 'KL' && <div className="small muted pos-cust-info">{cust.phone || 'Chưa có SĐT'} · {priceNames[tier - 1]}{cust.receivable > 0 ? <> · <span className="bad">đang nợ {money(cust.receivable)}</span></> : ''}{cust.prepaid > 0 ? ` · trả trước ${money(cust.prepaid)}` : ''}</div>}
          <div className="pos-grid2">
            <Select value={f.channel} onChange={(v) => set('channel', v)} options={settings.channels || []} placeholder="Kênh bán" aria-label="Kênh bán" />
            <label className="pos-due"><span className="muted small">Hẹn giao</span><DateInput value={f.due_date} onChange={(v) => set('due_date', v)} /></label>
          </div>

          <div className="pos-sum">
            {(weightSum > 0 || boxSum > 0) && <><span>Tổng trọng lượng{boxSum > 0 ? <span className="pos-count">{fq(boxSum)} {boxLabel}</span> : null}</span>
              <b className="r">{fmtKg(weightSum)}{noWeight > 0 && <div className="small muted" style={{ fontWeight: 400 }}>thiếu {noWeight} mặt hàng chưa khai</div>}</b></>}
            <span>Tổng tiền hàng <span className="pos-count">{fq(qtySum)}</span></span><b className="r">{money(gross)}</b>
            <span>Giảm giá</span><NumInput suffix={false} min={0} value={f.discount} onChange={(v) => set('discount', v)} className="pos-uline" aria-label="Giảm giá" />
            <span>Phí vận chuyển</span><NumInput suffix={false} min={0} value={f.shipping_fee} onChange={(v) => set('shipping_fee', v)} className="pos-uline" aria-label="Phí vận chuyển" />
            <b>Khách cần trả</b><b className="r pos-due-amt">{money(total)}</b>
          </div>

          {can('thu_chi') && (
            <div className="pos-pay">
              <div className="pos-sum">
                <span>{isDat ? 'Khách đặt cọc' : 'Khách thanh toán'}</span>
                <div className="pos-payin">
                  <NumInput suffix={false} min={0} value={f.pay.amount} onChange={(v) => setPay('amount', v)} placeholder="0" className="pos-uline" aria-label="Khách thanh toán" />
                  <button className="pos-chip" onClick={() => setPay('amount', total)}>Đủ</button>
                </div>
                {payAmt > total && !isDat ? <><span>Tiền thừa trả khách</span><b className="r">{money(payAmt - total)}</b></>
                  : <><span>{isDat ? 'Còn lại khi giao' : 'Ghi nợ khách'}</span><b className={`r ${total - payAmt > 0 && !isDat ? 'bad' : ''}`}>{money(Math.max(0, total - payAmt))}</b></>}
              </div>
              {payAmt > 0 && <>
                <div className="pos-methods">{METHODS.map((m) => <button key={m} className={`pos-chip${f.pay.method === m ? ' on' : ''}`} onClick={() => setPay('method', m)}>{m}</button>)}</div>
                <div className="pos-grid2">
                  <Select value={f.pay.fund_id} onChange={(v) => setPay('fund_id', v)} options={(funds.data || []).map((x) => ({ value: x.id, label: 'Vào quỹ: ' + x.name }))} aria-label="Vào quỹ" />
                  {isOnline && <label className="pos-due"><span className="muted small">Phí sàn bị trừ</span><NumInput suffix={false} min={0} value={f.pay.fee} onChange={(v) => setPay('fee', v)} placeholder="0" /></label>}
                </div>
              </>}
            </div>
          )}

          <span className="grow" />
          <div className="pos-links">
            <button className="link-btn small" disabled={busy} onClick={() => submit('draft')}>Lưu nháp</button>
            {!isDat && !savingConfirmed && <button className="link-btn small" disabled={busy} onClick={() => submit('confirm')}>Chỉ xác nhận, giao sau</button>}
            {!isDat && savingConfirmed && <button className="link-btn small" disabled={busy} onClick={() => submit('deliver')}>Lưu & giao ngay</button>}
          </div>
          <div className="pos-actions">
            <button className="pos-btn pos-btn-print" disabled={busy} onClick={() => submit(mainMode, true)} title={isDat ? 'Lưu và xuất đơn đặt hàng PDF' : 'Thanh toán và xuất hóa đơn PDF'}>IN</button>
            <button className="pos-btn pos-btn-main" disabled={busy} onClick={() => submit(mainMode)}>
              {busy ? <span className="spin" /> : savingConfirmed ? 'LƯU ĐƠN' : isDat ? 'XÁC NHẬN ĐƠN' : 'THANH TOÁN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
