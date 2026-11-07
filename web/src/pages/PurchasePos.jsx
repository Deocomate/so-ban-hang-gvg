// Màn tạo / sửa phiếu nhập hàng, đặt hàng nhập và trả hàng nhập kiểu KiotViet (toàn màn hình, giống màn bán hàng):
// gõ tên hoặc mã vào ô tìm kiếm (F3) là có ngay một dòng; chọn nhà cung cấp (F4); thêm nhiều dòng từ file Excel.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useAction, useQ } from '../lib/store.jsx';
import { money, qty as fq, todayVN, match } from '../lib/format.js';
import { useProducts, useSuppliers, useFunds, productSub, unitsOf, findUnit } from '../lib/lookups.js';
import { packing } from '../lib/docs/model.js';
import { packView } from '../lib/book-profile.js';
import { loadSheets, readLineFile, exportXlsx, LINE_FILE_COLUMNS } from '../lib/excel.js';
import { Icon, Select, DateInput, NumInput, Loading, Picker } from '../components/ui.jsx';

let seq = 0;
const METHODS = ['Tiền mặt', 'Chuyển khoản'];
// Giá gợi ý cho dòng mới: giá nhập lần cuối, chưa có thì giá vốn bình quân (người không xem giá vốn thì để 0)
const costOf = (p) => Math.round(p?.last_in_cost ?? p?.avg_cost ?? 0);
const num = (v) => Number(v) || 0;

// Ô tìm hàng: chọn là thêm dòng; gõ đúng mã rồi Enter (máy quét mã vạch) thêm ngay
function ItemSearch({ products, onPick, inputRef }) {
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
      <input ref={inputRef} value={q} placeholder="Tìm hàng hóa theo mã hoặc tên (F3)" autoComplete="off"
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
                <b>{p.name}</b>
                <span className="muted small">{p.sku}{productSub(p) ? ' · ' + productSub(p) : ''}</span>
              </span>
              <span className="pos-result-side">
                {(p.last_in_cost ?? p.avg_cost) != null && <b>{money(costOf(p))}</b>}
                <span className={`small ${p.on_hand < 0 ? 'bad' : 'muted'}`}>Tồn: {fq(p.on_hand)} {p.unit}{p.reserved > 0 ? ` · khách đặt ${fq(p.reserved)}` : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Khung chung: thanh trên (ô tìm hàng, tên màn, nút đóng hỏi lại khi đang có dòng), danh sách dòng, cột phải
function PosShell({ title, icon, search, top, empty, lines, note, right, rootRef, dirty, onClose, label }) {
  const [armClose, setArmClose] = useState(false);
  useEffect(() => { if (!armClose) return undefined; const t = setTimeout(() => setArmClose(false), 4000); return () => clearTimeout(t); }, [armClose]);
  const tryClose = () => { if (dirty && !armClose) { setArmClose(true); return; } onClose(); };
  return (
    <div className="pos-overlay" ref={rootRef} role="dialog" aria-modal="true" aria-label={label}>
      <div className="pos-top">
        {search}
        <div className="pos-tab"><Icon name={icon} size={17} /><b>{title}</b></div>
        <span className="grow" />
        {top}
        <button className={`pos-close${armClose ? ' armed' : ''}`} onClick={tryClose} title="Đóng">{armClose ? <span className="small">Bỏ phiếu đang làm? Bấm lần nữa</span> : <Icon name="x" />}</button>
      </div>
      <div className="pos-body">
        <div className="pos-left">
          <div className="pos-lines">{lines.length ? lines : empty}</div>
          {note}
        </div>
        <div className="pos-right">{right}</div>
      </div>
    </div>
  );
}

// F3 tìm hàng, F4 tìm nhà cung cấp; chỉ màn trên cùng nhận phím
function useHotkeys(rootRef, searchRef) {
  useEffect(() => {
    const h = (e) => {
      const all = document.querySelectorAll('.overlay, .pos-overlay'); if (all[all.length - 1] !== rootRef.current) return;
      if (e.key === 'F3') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'F4') { e.preventDefault(); rootRef.current?.querySelector('.pos-cust .picker-box')?.click(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
}

// Thêm dòng từ file Excel (Mã hàng, Số lượng, Đơn giá, Giảm giá); mã không có trong danh mục được báo lại
function useLineFile(products, toast, makeLine, addLines) {
  const pick = async (file) => {
    try {
      const r = readLineFile(await loadSheets(file));
      if (r.error) { toast(r.error, 'err'); return; }
      const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
      const missing = []; const add = [];
      for (const x of r.rows) {
        const p = bySku.get(x.sku.toLowerCase());
        if (!p) { missing.push(x.sku); continue; }
        add.push(makeLine(p, x));
      }
      addLines(add);
      const errs = [...r.errors.map((e) => `dòng ${e.row}: ${e.text}`), ...(missing.length ? [`không có mã ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`] : [])];
      toast(`Đã thêm ${add.length} dòng từ file${errs.length ? ' · bỏ qua ' + errs.join('; ') : ''}`, errs.length ? 'err' : undefined);
    } catch (e) { toast('Không đọc được file: ' + e.message, 'err'); }
  };
  const template = (name) => exportXlsx(`mau-${name}.xlsx`, [{ name: 'Dòng hàng', columns: LINE_FILE_COLUMNS,
    rows: products.slice(0, 2).map((p) => ({ sku: p.sku, name: p.name, qty: 1, price: costOf(p), discount: 0 })) }]);
  return { pick, template };
}

function FileEmpty({ text, onPick, onTemplate }) {
  return (
    <div className="pos-empty">
      <Icon name="search" size={34} />
      <div><b>{text}</b></div>
      <div className="muted">Hoặc thêm nhiều dòng từ file Excel có cột Mã hàng, Số lượng, Đơn giá, Giảm giá (<button className="link-btn" onClick={onTemplate}>tải file mẫu</button>).</div>
      <label className="btn btn-soft"><Icon name="up" /> Chọn file dữ liệu<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) onPick(x); }} /></label>
    </div>
  );
}

const FileBtn = ({ onPick }) => (
  <label className="pos-chip" title="Thêm dòng từ file Excel"><Icon name="up" size={14} /> Từ file Excel
    <input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) onPick(x); }} /></label>
);

function SupplierPick({ suppliers, value, onChange, disabled }) {
  const { open } = useApp();
  if (disabled) return <div className="pos-cust"><b>{suppliers.find((s) => s.id === value)?.name || '—'}</b></div>;
  return (
    <div className="pos-cust">
      <Picker items={suppliers} value={value} onChange={onChange} placeholder="Tìm nhà cung cấp (F4)"
        getLabel={(s) => s.name} getSub={(s) => `${s.code}${s.phone ? ' · ' + s.phone : ''}`} filterKeys={(s) => `${s.name} ${s.code} ${s.phone || ''}`}
        onCreate={(name) => open('party', { type: 'ncc', name, onSaved: (r) => onChange(r.id) })} createLabel="Thêm nhà cung cấp" />
      <button className="pos-cust-add" title="Thêm nhà cung cấp" onClick={() => open('party', { type: 'ncc', onSaved: (r) => onChange(r.id) })}><Icon name="plus" size={18} /></button>
    </div>
  );
}

function PayBox({ label, amount, onAmount, full, fundId, onFund, method, onMethod, funds, restLabel, rest }) {
  return (
    <div className="pos-pay">
      <div className="pos-sum">
        <span>{label}</span>
        <div className="pos-payin">
          <NumInput suffix={false} min={0} value={amount} onChange={onAmount} placeholder="0" className="pos-uline" aria-label={label} />
          <button className="pos-chip" onClick={() => onAmount(full)}>Đủ</button>
        </div>
        <span>{restLabel}</span><b className="r">{money(rest)}</b>
      </div>
      {num(amount) > 0 && <>
        <div className="pos-methods">{METHODS.map((m) => <button key={m} className={`pos-chip${method === m ? ' on' : ''}`} onClick={() => onMethod(m)}>{m}</button>)}</div>
        <Select value={fundId} onChange={onFund} options={(funds || []).map((x) => ({ value: x.id, label: 'Quỹ: ' + x.name }))} aria-label="Quỹ" />
      </>}
    </div>
  );
}

// ===================== PHIẾU NHẬP HÀNG / ĐẶT HÀNG NHẬP =====================
export function PurchasePos({ id, copy_id, mode: mode0, kind: kind0, sales_order_id, supplier_id: sup0, lines: lines0, product_id, onClose }) {
  const { settings, open, can, rpc, toast } = useApp();
  const products = useProducts();
  const suppliers = useSuppliers();
  const funds = useFunds(can('thu_chi'));
  const so = useQ('sales_orders', [['status', 'eq', 'xac_nhan']], 'created_at desc', 500, can('xem_ban_hang'));
  const { run, busy } = useAction();
  const searchRef = useRef(null); const rootRef = useRef(null);
  const src = id || copy_id;
  const [loaded, setLoaded] = useState(!src);
  const [f, setF] = useState({
    mode: mode0 || (kind0 === 'dat_sx' || sales_order_id ? 'dat' : 'nhap'), kind: kind0 || 'mua_san', supplier_id: sup0 || '', order_date: todayVN(), expected_date: '',
    sales_order_id: sales_order_id || '', prod_step: '', invoice_no: '', discount: 0, note: '', status: 'xac_nhan', code: '', status0: null,
    lines: (lines0 || []).map((l) => ({ key: ++seq, product_id: l.product_id, qty: l.qty, unit_price: l.unit_cost ?? null, discount: 0, conv: 1, note: '', sales_order_line_id: l.sales_order_line_id || null })),
    pay: { amount: null, fund_id: '', method: 'Chuyển khoản' },
  });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setPay = (k, v) => setF((s) => ({ ...s, pay: { ...s.pay, [k]: v } }));
  const pmap = useMemo(() => Object.fromEntries((products.data || []).map((p) => [p.id, packView(p, settings)])), [products.data, settings]);
  const buyable = useMemo(() => (products.data || []).filter((p) => !p.is_kit && !p.is_service), [products.data]);

  useEffect(() => {
    if (!src) return;
    (async () => {
      const [o] = await rpc('q', { view: 'purchase_orders', filters: [['id', 'eq', src]] });
      const ls = await rpc('q', { view: 'purchase_order_lines', filters: [['po_id', 'eq', src]], order: 'line_no' });
      setF((s) => ({ ...s, mode: o.mode, kind: o.kind, supplier_id: o.supplier_id, discount: o.discount || 0,
        ...(id ? { code: o.code, status0: o.status, status: o.status, order_date: o.order_date, expected_date: o.expected_date || '', sales_order_id: o.sales_order_id || '', invoice_no: o.invoice_no || '', note: o.note || '' } : {}),
        lines: ls.filter((l) => id || l.eff_qty > 0).map((l) => { const c = l.unit_conv || 1; return { key: ++seq, id: id ? l.id : null, product_id: l.product_id, qty: (id ? l.qty : l.eff_qty) / c,
          unit_price: l.unit_price * c, discount: l.discount * c, unit: l.unit_name || l.unit, conv: c, note: l.note || '', sales_order_line_id: id ? l.sales_order_line_id : null }; }) }));
      setLoaded(true);
    })().catch((e) => toast(e.message, 'err'));
  }, [src]);
  useEffect(() => { if (!f.pay.fund_id && funds.data?.length) setPay('fund_id', funds.data[0].id); }, [funds.data]);
  // Giá gợi ý cho dòng chưa có giá (mở từ đơn bán, từ một mặt hàng); mở từ một mặt hàng thì có sẵn dòng đó
  useEffect(() => {
    if (!products.data) return;
    setF((s) => {
      let lines = s.lines.map((l) => (l.unit_price == null && pmap[l.product_id] ? { ...l, unit_price: costOf(pmap[l.product_id]) } : l));
      if (product_id && !lines.length && pmap[product_id]) lines = [newLine(pmap[product_id])];
      return { ...s, lines };
    });
  }, [products.data]);

  const newLine = (p, x = {}) => ({ key: ++seq, product_id: p.id, qty: x.qty ?? 1, unit_price: x.price ?? costOf(p), discount: x.discount ?? 0, unit: p.unit, conv: 1, note: '' });
  const addProduct = (p) => setF((s) => {
    const ex = s.lines.find((l) => l.product_id === p.id && (l.conv || 1) === 1 && !l.sales_order_line_id);
    if (ex) return { ...s, lines: s.lines.map((l) => (l === ex ? { ...l, qty: num(l.qty) + 1 } : l)) };
    return { ...s, lines: [...s.lines, newLine(p)] };
  });
  const setLine = (key, patch) => setF((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const delLine = (key) => setF((s) => ({ ...s, lines: s.lines.filter((l) => l.key !== key) }));
  const setUnit = (l, name) => {
    const u = findUnit(pmap[l.product_id], name); const r = u.conv / (l.conv || 1);
    setLine(l.key, { unit: u.name, conv: u.conv, unit_price: Math.round(num(l.unit_price) * r), discount: Math.round(num(l.discount) * r) });
  };
  const file = useLineFile(buyable, toast, newLine, (add) => setF((s) => ({ ...s, lines: [...s.lines, ...add] })));
  useHotkeys(rootRef, searchRef);

  const isNhap = f.mode === 'nhap';
  const editing = !!id;
  const baseQty = (l) => num(l.qty) * (l.conv || 1);
  const lineTotal = (l) => Math.round(num(l.qty) * (num(l.unit_price) - num(l.discount)));
  const goods = f.lines.reduce((s, l) => s + lineTotal(l), 0);
  const qtySum = f.lines.reduce((s, l) => s + num(l.qty), 0);
  const need = Math.max(0, goods - num(f.discount));
  const payAmt = num(f.pay.amount);
  const ready = loaded && !!products.data && !!suppliers.data;
  useEffect(() => { if (ready) setTimeout(() => searchRef.current?.focus(), 50); }, [ready]);

  const submit = async (action) => {
    const lines = f.lines.filter((l) => l.product_id && num(l.qty) > 0);
    if (!lines.length) { toast('Phiếu chưa có hàng hóa — gõ tên hoặc mã hàng vào ô tìm kiếm', 'err'); searchRef.current?.focus(); return; }
    if (!f.supplier_id) { toast('Chưa chọn nhà cung cấp', 'err'); return; }
    const r = await run('save_purchase_order', {
      id: id || null, mode: f.mode, kind: f.kind, supplier_id: f.supplier_id, order_date: f.order_date, expected_date: f.expected_date || null,
      sales_order_id: f.sales_order_id || null, prod_step: f.prod_step || null, invoice_no: f.invoice_no, discount: num(f.discount), note: f.note,
      status: action === 'draft' ? 'nhap' : 'xac_nhan', receive_now: action === 'receive',
      lines: lines.map((l) => ({ id: l.id || null, product_id: l.product_id, qty: baseQty(l), unit_price: num(l.unit_price) / (l.conv || 1), discount: num(l.discount) / (l.conv || 1),
        unit_name: (l.conv || 1) !== 1 ? l.unit : null, sales_order_line_id: l.sales_order_line_id || null, note: (l.note || '').trim() || null })),
      deposit: payAmt > 0 && action !== 'draft' ? { amount: payAmt, fund_id: f.pay.fund_id, method: f.pay.method } : null,
    }, (x) => `Đã lưu ${isNhap ? 'phiếu nhập' : 'đơn đặt hàng nhập'} ${x.code}${x.receipt_code ? ' · đã nhập kho' : ''}${x.payment_code ? ' · phiếu chi ' + x.payment_code : ''}`);
    if (r) { onClose(); if (!editing) open('po', { id: r.id }); }
  };

  const shellProps = { rootRef, onClose, dirty: f.lines.length > 0, label: isNhap ? 'Nhập hàng' : 'Đặt hàng nhập' };
  if (!ready) return <div className="pos-overlay" ref={rootRef}><div className="pos-top"><span className="grow" /><button className="pos-close" onClick={onClose}><Icon name="x" /></button></div><Loading /></div>;
  const steps = settings.prod_steps || [];
  const lines = f.lines.map((l, i) => {
    const p = pmap[l.product_id] || {};
    const pk = packing(baseQty(l), p.units_per_pack, p.pack_unit, p.unit);
    const us = unitsOf(p);
    return (
      <div className="pos-line po" key={l.key}>
        <div className="pos-line-no">{i + 1}</div>
        <button className="pos-line-del" onClick={() => delLine(l.key)} aria-label="Xóa dòng" title="Xóa dòng"><Icon name="x" size={16} /></button>
        <div className="pos-line-info">
          <div className="pos-line-name"><span className="muted">{p.sku}</span> <b>{p.name || '…'}</b></div>
          <div className="small muted">{[productSub(p), `tồn ${fq(p.on_hand)} ${p.unit || ''}`, (l.conv || 1) !== 1 ? `= ${fq(baseQty(l))} ${p.unit}` : ''].filter(Boolean).join(' · ')}</div>
          {pk.text && <div className="pos-split"><span className="pos-pack"><Icon name="box" size={14} /> {pk.text}</span></div>}
          {l.sales_order_line_id && <span className="stockhint">Giữ cho đơn bán khi hàng về</span>}
          <input className="pos-note" value={l.note || ''} maxLength={300} onChange={(e) => setLine(l.key, { note: e.target.value })} placeholder="Ghi chú cho hàng này" />
        </div>
        <div className="pos-qty">
          <button onClick={() => setLine(l.key, { qty: Math.max(0, num(l.qty) - 1) })} aria-label="Bớt 1">−</button>
          <NumInput money={false} min={0} value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} aria-label="Số lượng" />
          <button onClick={() => setLine(l.key, { qty: num(l.qty) + 1 })} aria-label="Thêm 1">+</button>
          {us.length > 1 ? <select className="pos-unit pos-unit-sel" value={l.unit || p.unit} onChange={(e) => setUnit(l, e.target.value)} aria-label="Đơn vị tính">
            {us.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select> : <span className="pos-unit">{l.unit || p.unit}</span>}
        </div>
        <label className="pos-price"><span className="muted small">Đơn giá</span><NumInput suffix={false} min={0} value={l.unit_price} onChange={(v) => setLine(l.key, { unit_price: v })} aria-label="Đơn giá" /></label>
        <label className="pos-ck"><span className="muted small">Giảm giá</span><NumInput suffix={false} min={0} value={l.discount} onChange={(v) => setLine(l.key, { discount: v })} aria-label="Giảm giá" /></label>
        <div className="pos-line-total">{money(lineTotal(l))}</div>
      </div>
    );
  });
  const right = <>
    <div className="pos-meta">
      <span className="small muted">{editing ? (isNhap ? 'Phiếu ' : 'Đơn ') + f.code : isNhap ? 'Phiếu nhập mới' : 'Đơn đặt mới'}</span>
      <DateInput value={f.order_date} onChange={(v) => set('order_date', v)} max={todayVN()} />
    </div>
    <SupplierPick suppliers={suppliers.data} value={f.supplier_id} onChange={(v) => set('supplier_id', v)} />
    {(() => { const s = suppliers.data.find((x) => x.id === f.supplier_id); return s ? <div className="small muted pos-cust-info">{s.phone || 'Chưa có SĐT'}{s.payable > 0 ? <> · <span className="bad">đang nợ NCC {money(s.payable)}</span></> : ''}{s.prepaid > 0 ? ` · đã trả trước ${money(s.prepaid)}` : ''}</div> : null; })()}
    <div className="pos-sum">
      <span>{isNhap ? 'Mã phiếu nhập' : 'Mã đặt hàng nhập'}</span><span className="r muted">{f.code || 'Tự động'}</span>
      <span>Trạng thái</span>{isNhap ? <span className="r">Phiếu tạm</span>
        : <Select value={f.status} onChange={(v) => set('status', v)} aria-label="Trạng thái" options={[{ value: 'nhap', label: 'Phiếu tạm' }, { value: 'xac_nhan', label: 'Đã xác nhận NCC' }]} />}
      <span>Số hóa đơn đầu vào</span><input className="inp pos-uline" value={f.invoice_no} onChange={(e) => set('invoice_no', e.target.value)} placeholder="Nhập số hóa đơn" maxLength={60} />
      {!isNhap && <><span>Dự kiến ngày nhập</span><DateInput value={f.expected_date} onChange={(v) => set('expected_date', v)} /></>}
      {!isNhap && f.kind === 'dat_sx' && !editing && steps.length > 0 && <><span>Bước sản xuất</span><Select value={f.prod_step} onChange={(v) => set('prod_step', v)} options={steps} placeholder={steps[0]} aria-label="Bước sản xuất" /></>}
    </div>
    {!isNhap && can('xem_ban_hang') && <Select value={f.sales_order_id} onChange={(v) => set('sales_order_id', v)} placeholder="Nhập về kho để bán (không gắn đơn bán)" aria-label="Cho đơn bán"
      options={(so.data || []).filter((o) => o.remaining_qty > 0 || o.id === f.sales_order_id).map((o) => ({ value: o.id, label: `Cho đơn ${o.code} · ${o.customer_name}` }))} />}
    <div className="pos-sum">
      <span>Tổng tiền hàng <span className="pos-count">{fq(qtySum)}</span></span><b className="r">{money(goods)}</b>
      <span>Giảm giá</span><NumInput suffix={false} min={0} value={f.discount} onChange={(v) => set('discount', v)} className="pos-uline" aria-label="Giảm giá" />
      <b>Cần trả nhà cung cấp</b><b className="r pos-due-amt">{money(need)}</b>
    </div>
    {can('thu_chi') && <PayBox label={isNhap ? 'Tiền trả NCC' : 'Đặt cọc cho NCC'} amount={f.pay.amount} onAmount={(v) => setPay('amount', v)} full={need}
      fundId={f.pay.fund_id} onFund={(v) => setPay('fund_id', v)} method={f.pay.method} onMethod={(v) => setPay('method', v)} funds={funds.data}
      restLabel={isNhap ? 'Tính vào công nợ' : 'Còn lại khi nhận hàng'} rest={need - payAmt} />}
    <textarea className="inp" rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Ghi chú" maxLength={1000} />
    <span className="grow" />
    {isNhap ? (
      <div className="pos-actions two">
        <button className="pos-btn pos-btn-soft" disabled={busy} onClick={() => submit('draft')}>Lưu tạm</button>
        <button className="pos-btn pos-btn-main" disabled={busy} onClick={() => submit('receive')}>{busy ? <span className="spin" /> : 'Hoàn thành'}</button>
      </div>
    ) : (
      <div className="pos-actions one">
        <button className="pos-btn pos-btn-main" disabled={busy} onClick={() => submit(f.status === 'nhap' ? 'draft' : 'confirm')}>{busy ? <span className="spin" /> : editing ? 'Lưu đơn' : 'Đặt hàng nhập'}</button>
      </div>
    )}
  </>;
  return (
    <PosShell {...shellProps} title={editing ? `${isNhap ? 'Sửa phiếu' : 'Sửa đơn'} ${f.code}` : isNhap ? 'Nhập hàng' : 'Đặt hàng nhập'} icon={isNhap ? 'import' : 'truck'}
      search={<ItemSearch products={buyable} onPick={addProduct} inputRef={searchRef} />}
      top={<>
        {!isNhap && !editing && <div className="seg pos-kind">
          <button className={f.kind === 'mua_san' ? 'on' : ''} onClick={() => set('kind', 'mua_san')}>Mua hàng</button>
          <button className={f.kind === 'dat_sx' ? 'on' : ''} onClick={() => set('kind', 'dat_sx')}>Đặt xưởng</button>
        </div>}
        <FileBtn onPick={file.pick} />
      </>}
      empty={<FileEmpty text="Gõ tên hoặc mã hàng vào ô tìm kiếm phía trên" onPick={file.pick} onTemplate={() => file.template(isNhap ? 'nhap-hang' : 'dat-hang-nhap')} />}
      lines={lines} right={right} />
  );
}

// ===================== TRẢ HÀNG NHẬP =====================
// Theo phiếu nhập (po_id): chỉ trả các dòng đã nhận. Lập riêng: chọn nhà cung cấp, tìm hàng như phiếu nhập.
export function ReturnPos({ po_id, supplier_id: sup0, onClose }) {
  const { can, rpc, toast, open } = useApp();
  const products = useProducts();
  const suppliers = useSuppliers();
  const funds = useFunds(can('thu_chi'));
  const { run, busy } = useAction();
  const searchRef = useRef(null); const rootRef = useRef(null);
  const [po, setPo] = useState(null);
  const [f, setF] = useState({ supplier_id: sup0 || '', date: todayVN(), reason: '', note: '', discount: 0, lines: [], pay: { amount: null, fund_id: '', method: 'Chuyển khoản' } });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setPay = (k, v) => setF((s) => ({ ...s, pay: { ...s.pay, [k]: v } }));
  const pmap = useMemo(() => Object.fromEntries((products.data || []).map((p) => [p.id, p])), [products.data]);
  const buyable = useMemo(() => (products.data || []).filter((p) => !p.is_kit && !p.is_service), [products.data]);
  useEffect(() => {
    if (!po_id) return;
    (async () => {
      const [o] = await rpc('q', { view: 'purchase_orders', filters: [['id', 'eq', po_id]] });
      const recs = await rpc('q', { view: 'receipts', filters: [['po_id', 'eq', po_id], ['cancelled_at', 'is_null']], order: 'created_at' });
      setPo(o);
      setF((s) => ({ ...s, supplier_id: o.supplier_id,
        lines: recs.flatMap((r) => (r.lines || []).filter((l) => l.qty - l.returned_qty > 0).map((l) => ({ key: ++seq, receipt_line_id: l.id, product_id: l.product_id, qty: 0,
          max: l.qty - l.returned_qty, cost: l.unit_cost, unit_price: Math.round(l.unit_cost), from: r.code }))) }));
    })().catch((e) => toast(e.message, 'err'));
  }, [po_id]);
  useEffect(() => { if (!f.pay.fund_id && funds.data?.length) setPay('fund_id', funds.data[0].id); }, [funds.data]);
  const newLine = (p, x = {}) => ({ key: ++seq, product_id: p.id, qty: x.qty ?? 1, cost: p.avg_cost, unit_price: x.price ?? costOf(p) });
  const addProduct = (p) => setF((s) => {
    const ex = s.lines.find((l) => l.product_id === p.id);
    if (ex) return { ...s, lines: s.lines.map((l) => (l === ex ? { ...l, qty: num(l.qty) + 1 } : l)) };
    return { ...s, lines: [...s.lines, newLine(p)] };
  });
  const setLine = (key, patch) => setF((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const file = useLineFile(buyable, toast, newLine, (add) => setF((s) => ({ ...s, lines: [...s.lines, ...add] })));
  useHotkeys(rootRef, searchRef);

  const lineTotal = (l) => Math.round(num(l.qty) * num(l.unit_price));
  const goods = f.lines.reduce((s, l) => s + lineTotal(l), 0);
  const need = Math.max(0, goods - num(f.discount));
  const payAmt = num(f.pay.amount);
  const ready = !!products.data && !!suppliers.data && (!po_id || !!po);

  const submit = async () => {
    const lines = f.lines.filter((l) => num(l.qty) > 0);
    if (!lines.length) { toast('Chưa nhập số lượng trả', 'err'); return; }
    if (!f.supplier_id) { toast('Chưa chọn nhà cung cấp', 'err'); return; }
    const r = await run('supplier_return', { po_id: po_id || null, supplier_id: f.supplier_id, date: f.date, reason: f.reason, note: f.note, discount: num(f.discount),
      lines: lines.map((l) => ({ receipt_line_id: l.receipt_line_id || null, product_id: l.product_id, qty: num(l.qty), unit_price: num(l.unit_price) })),
      refund: payAmt > 0 ? { amount: payAmt, fund_id: f.pay.fund_id, method: f.pay.method } : null }, (x) => `Đã lập phiếu trả hàng nhập ${x.code}${x.refund_code ? ' · phiếu thu ' + x.refund_code : ''}`);
    if (r) { onClose(); open('sret', { id: r.id }); }
  };

  if (!ready) return <div className="pos-overlay" ref={rootRef}><div className="pos-top"><span className="grow" /><button className="pos-close" onClick={onClose}><Icon name="x" /></button></div><Loading /></div>;
  const lines = f.lines.map((l, i) => {
    const p = pmap[l.product_id] || {};
    return (
      <div className="pos-line po-ret" key={l.key}>
        <div className="pos-line-no">{i + 1}</div>
        {po_id ? <span /> : <button className="pos-line-del" onClick={() => setF((s) => ({ ...s, lines: s.lines.filter((x) => x.key !== l.key) }))} aria-label="Xóa dòng" title="Xóa dòng"><Icon name="x" size={16} /></button>}
        <div className="pos-line-info">
          <div className="pos-line-name"><span className="muted">{p.sku}</span> <b>{p.name || '…'}</b></div>
          <div className="small muted">{[l.from && `theo ${l.from}`, l.max != null ? `còn trả được ${fq(l.max)} ${p.unit}` : `tồn ${fq(p.on_hand)} ${p.unit || ''}`, l.cost != null && `giá nhập ${money(l.cost)}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="pos-qty">
          <button onClick={() => setLine(l.key, { qty: Math.max(0, num(l.qty) - 1) })} aria-label="Bớt 1">−</button>
          <NumInput money={false} min={0} max={l.max ?? undefined} value={l.qty} onChange={(v) => setLine(l.key, { qty: v })} aria-label="Số lượng trả" />
          <button onClick={() => setLine(l.key, { qty: Math.min(l.max ?? Infinity, num(l.qty) + 1) })} aria-label="Thêm 1">+</button>
          <span className="pos-unit">{p.unit}</span>
        </div>
        <label className="pos-price"><span className="muted small">Giá trả lại</span><NumInput suffix={false} min={0} value={l.unit_price} onChange={(v) => setLine(l.key, { unit_price: v })} aria-label="Giá trả lại" /></label>
        <div className="pos-line-total">{money(lineTotal(l))}</div>
      </div>
    );
  });
  const right = <>
    <div className="pos-meta"><span className="small muted">{po ? `Theo ${po.code}` : 'Phiếu trả mới'}</span><DateInput value={f.date} onChange={(v) => set('date', v)} max={todayVN()} /></div>
    <SupplierPick suppliers={suppliers.data} value={f.supplier_id} onChange={(v) => set('supplier_id', v)} disabled={!!po_id} />
    <div className="pos-sum">
      <span>Mã trả hàng nhập</span><span className="r muted">Tự động</span>
      <span>Lý do trả</span><input className="inp pos-uline" value={f.reason} onChange={(e) => set('reason', e.target.value)} placeholder="vd. Men lỗi, sai màu" maxLength={200} />
      <span>Tổng tiền hàng <span className="pos-count">{fq(f.lines.reduce((s, l) => s + num(l.qty), 0))}</span></span><b className="r">{money(goods)}</b>
      <span>Giảm giá</span><NumInput suffix={false} min={0} value={f.discount} onChange={(v) => set('discount', v)} className="pos-uline" aria-label="Giảm giá" />
      <b>Nhà cung cấp cần trả</b><b className="r pos-due-amt">{money(need)}</b>
    </div>
    {can('thu_chi') && <PayBox label="Tiền NCC trả lại" amount={f.pay.amount} onAmount={(v) => setPay('amount', v)} full={need}
      fundId={f.pay.fund_id} onFund={(v) => setPay('fund_id', v)} method={f.pay.method} onMethod={(v) => setPay('method', v)} funds={funds.data}
      restLabel="Tính vào công nợ (giảm nợ NCC)" rest={need - payAmt} />}
    <textarea className="inp" rows={2} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Ghi chú" maxLength={1000} />
    <span className="grow" />
    <div className="pos-actions one"><button className="pos-btn pos-btn-main" disabled={busy} onClick={submit}>{busy ? <span className="spin" /> : 'Hoàn thành'}</button></div>
  </>;
  return (
    <PosShell rootRef={rootRef} onClose={onClose} dirty={f.lines.some((l) => num(l.qty) > 0)} label="Trả hàng nhập" title="Trả hàng nhập" icon="return"
      search={po_id ? <div className="pos-search muted small" style={{ alignItems: 'center' }}>Nhập số lượng trả cho từng dòng đã nhận của {po?.code}</div> : <ItemSearch products={buyable} onPick={addProduct} inputRef={searchRef} />}
      top={!po_id && <FileBtn onPick={file.pick} />}
      empty={po_id ? <div className="pos-empty"><b>Phiếu này không còn hàng nào trả được</b></div>
        : <FileEmpty text="Gõ tên hoặc mã hàng cần trả vào ô tìm kiếm phía trên" onPick={file.pick} onTemplate={() => file.template('tra-hang-nhap')} />}
      lines={lines} right={right} />
  );
}
