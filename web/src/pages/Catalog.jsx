// Bảng giá, lái xe & công nợ lái xe, danh sách trả hàng.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, match, todayVN } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { exportXlsx, loadSheets, readPriceBookFile } from '../lib/excel.js';
import { Btn, Icon, Pill, Field, Input, TextArea, Select, DateInput, NumInput, Check, Search, ErrorBox, Note, Table, Modal, ConfirmBtn, ListPage, FilterBox, RadioList, Section, Loading } from '../components/ui.jsx';
import { useTimeFilter, TimeFilter } from '../components/DocFilters.jsx';

// ===================== BẢNG GIÁ =====================
// "Bảng giá chung" = các mức giá theo khách (sửa nhanh ở đây). Bảng giá có tên: hiệu lực, công thức, phạm vi nhóm khách / người tạo.
export function PriceBookPage() {
  const { can, settings, open } = useApp();
  const q = useQ('products', [['active', 'eq', 'true']], 'sku', 5000);
  const books = useQ('price_books', [], 'name', 200);
  const { run, busy } = useAction();
  const [search, setSearch] = useState(''); const [cat, setCat] = useState(''); const [edit, setEdit] = useState({});
  const [sel, setSel] = useState(''); const [onlyIn, setOnlyIn] = useState(false);
  const items = useQ('price_book_items', [['price_book_id', 'eq', sel]], 'sku', 10000, !!sel);
  const pn = settings.price_names || [];
  const cost = can('xem_gia_von');
  const all = q.data || [];
  const pb = (books.data || []).find((b) => b.id === sel);
  const inBook = useMemo(() => Object.fromEntries((items.data || []).map((i) => [i.product_id, i.price])), [items.data]);
  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
  const rows = useMemo(() => all.filter((p) => (!cat || p.category === cat) && (!sel || !onlyIn || inBook[p.id] != null)
    && match(`${p.sku} ${p.name} ${p.size || ''} ${p.color || ''}`, search)), [all, cat, search, sel, onlyIn, inBook]);
  const dirty = Object.keys(edit).length;
  useEffect(() => setEdit({}), [sel]);
  const setPrice = (id, i, v) => setEdit((s) => ({ ...s, [id]: { ...s[id], [`price${i + 1}`]: v } }));
  const save = async () => {
    const ok = sel
      ? await run('save_price_book_items', { price_book_id: sel, rows: Object.entries(edit).map(([id, v]) => ({ product_id: id, price: v.book })) }, (r) => `Đã cập nhật ${r.updated} mã trong bảng giá`)
      : await run('save_prices', { rows: Object.entries(edit).map(([id, v]) => ({ id, ...v })) }, (r) => `Đã cập nhật giá ${r.updated} mã hàng`);
    if (ok) setEdit({});
  };
  const state = (b) => (!b.active ? 'chưa áp dụng' : !b.in_effect ? 'ngoài hiệu lực' : '');
  const costCols = cost ? [{ key: 'c', label: 'Giá vốn', align: 'right', render: (p) => money(p.avg_cost) }, { key: 'li', label: 'Giá nhập cuối', align: 'right', render: (p) => (p.last_in_cost == null ? '—' : money(p.last_in_cost)) }] : [];
  return (
    <ListPage title={pb ? pb.name : 'Bảng giá chung'} sub={pb ? [pb.valid_from || pb.valid_to ? `Hiệu lực ${pb.valid_from ? dmy(pb.valid_from) : '…'} – ${pb.valid_to ? dmy(pb.valid_to) : '…'}` : 'Không giới hạn thời gian',
      state(pb), pb.allow_others ? 'cho thêm hàng ngoài bảng' : 'chỉ bán hàng trong bảng', pb.cust_groups ? `nhóm khách: ${pb.cust_groups.join(', ')}` : 'mọi nhóm khách'].filter(Boolean).join(' · ')
      : `${pn.join(' / ')}. Giá theo mức của khách được tự điền khi tạo báo giá và đơn hàng.`}
      filters={<>
        <FilterBox title="Bảng giá">
          <RadioList value={sel} onChange={setSel} options={[{ value: '', label: 'Bảng giá chung' }, ...(books.data || []).map((b) => ({ value: b.id, label: b.name + (state(b) ? ` (${state(b)})` : ''), count: b.item_count }))]} />
          {can('danh_muc') && <Btn small icon="plus" onClick={() => open('price-book', { onSaved: (r) => setSel(r.id) })}>Tạo bảng giá</Btn>}
        </FilterBox>
        <FilterBox title="Nhóm hàng"><RadioList value={cat} onChange={setCat} options={[{ value: '', label: 'Tất cả', count: all.length }, ...cats.map((c) => ({ value: c, label: c, count: all.filter((p) => p.category === c).length }))]} /></FilterBox>
        {sel && <FilterBox title="Hiển thị"><RadioList value={onlyIn ? 'in' : ''} onChange={(v) => setOnlyIn(v === 'in')} options={[{ value: '', label: 'Mọi hàng hóa' }, { value: 'in', label: 'Chỉ hàng trong bảng giá', count: items.data?.length }]} /></FilterBox>}
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã, tên, màu, kích thước…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('bang-gia.xlsx', [{ name: pb ? pb.name.slice(0, 30) : 'Bảng giá', rows: rows.map((p) => ({ ...p, book_price: inBook[p.id] })), columns: [{ key: 'sku', label: 'Mã SKU' }, { key: 'name', label: 'Tên hàng hóa' }, { key: 'unit', label: 'ĐVT' },
          ...(cost ? [{ key: 'avg_cost', label: 'Giá vốn' }, { key: 'last_in_cost', label: 'Giá nhập cuối' }] : []), ...pn.map((label, i) => ({ key: `price${i + 1}`, label })), ...(pb ? [{ key: 'book_price', label: pb.name }] : [])] }])}>Xuất Excel</Btn>
        {pb && can('danh_muc') && <Btn icon="up" onClick={() => open('price-book-import', { book: pb })}>Nhập Excel</Btn>}
        {pb && can('danh_muc') && <Btn icon="edit" onClick={() => open('price-book', { id: pb.id })}>Sửa bảng giá</Btn>}
        {pb && can('danh_muc') && pb.formula?.base && <ConfirmBtn icon="refresh" busy={busy} confirmText={`Tính lại giá ${rows.length} mã theo công thức?`}
          onConfirm={() => run('apply_price_formula', { price_book_id: pb.id, product_ids: rows.map((p) => p.id) }, (r) => `Đã tính ${r.updated} mã${r.skipped ? `, bỏ qua ${r.skipped} mã chưa có giá gốc` : ''}`)}>Áp dụng công thức</ConfirmBtn>}
        {can('danh_muc') && <Btn kind="primary" icon="check" busy={busy} disabled={!dirty} onClick={save}>Lưu {dirty ? `${dirty} mã` : ''}</Btn>}
      </>}>
      <ErrorBox error={q.error || books.error} />
      <Table dense rows={q.data && (!sel || items.data) ? rows : null} empty="Chưa có hàng hóa" columns={[
        { key: 'p', label: 'Hàng hóa', render: (p) => <><div className="cell-main">{p.sku} · {p.name}</div><div className="cell-sub">{[p.size, p.color, p.material].filter(Boolean).join(' · ')}</div></> },
        { key: 'u', label: 'ĐVT', render: (p) => p.unit },
        ...costCols,
        ...(pb ? [{ key: 'g', label: pn[0] || 'Giá chung', align: 'right', render: (p) => money(p.price1) },
          { key: 'b', label: pb.name, align: 'right', render: (p) => (can('danh_muc')
            ? <NumInput suffix={false} min={0} value={edit[p.id] && 'book' in edit[p.id] ? edit[p.id].book : inBook[p.id] ?? null} placeholder="—" onChange={(v) => setEdit((s) => ({ ...s, [p.id]: { book: v } }))} style={{ maxWidth: 130, marginLeft: 'auto' }} aria-label={pb.name} />
            : inBook[p.id] == null ? '—' : money(inBook[p.id])) }]
          : pn.map((label, i) => ({ key: `p${i}`, label, align: 'right', render: (p) => (can('danh_muc')
            ? <NumInput suffix={false} min={0} value={edit[p.id]?.[`price${i + 1}`] ?? p[`price${i + 1}`]} onChange={(v) => setPrice(p.id, i, v)} style={{ maxWidth: 120, marginLeft: 'auto' }} aria-label={label} />
            : money(p[`price${i + 1}`])) }))),
      ]} />
      {pb && <div className="muted small">Ô trống = hàng không có trong bảng giá (bán theo giá chung{pb.allow_others ? '' : ' — bảng này không cho thêm hàng ngoài bảng'}). Đơn vị quy đổi (hộp, thùng…) lấy giá bảng × giá trị quy đổi.</div>}
    </ListPage>
  );
}

// Nhập giá của một bảng giá từ Excel: cột Mã hàng + cột giá (tên cột = tên bảng giá, như file Xuất Excel)
export function PriceBookImport({ book, onClose }) {
  const { toast } = useApp();
  const { run, busy } = useAction();
  const [r, setR] = useState(null); const [name, setName] = useState('');
  const pick = async (file) => {
    if (!file) return;
    setName(file.name);
    try { setR(readPriceBookFile(await loadSheets(file), book.name)); } catch (e) { setR({ error: 'Không đọc được file: ' + e.message }); }
  };
  const go = async () => {
    const x = await run('import_price_book_items', { price_book_id: book.id, rows: r.rows.map(({ sku, price }) => ({ sku, price })) },
      (y) => `Đã nhập giá ${y.updated} mã vào ${book.name}${y.missing.length ? ` · ${y.missing.length} mã không có trong sổ` : ''}`);
    if (x) { if (x.missing.length) toast(`Mã không có trong sổ, đã bỏ qua: ${x.missing.slice(0, 20).join(', ')}${x.missing.length > 20 ? '…' : ''}`, 'err'); onClose(); }
  };
  return (
    <Modal title={`Nhập giá vào bảng ${book.name}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Bỏ qua</Btn><Btn kind="primary" busy={busy} disabled={!r?.rows?.length || r.errors?.length > 0} onClick={go}>Nhập {r?.rows?.length || ''} giá</Btn></>}>
      <Note>File cần cột <b>Mã hàng</b> và cột giá đặt tên <b>{book.name}</b> (hoặc “Giá mới”). Cách nhanh nhất: bấm “Xuất Excel” ở bảng giá này, sửa cột giá rồi nhập lại.
        Ô giá để trống thì bỏ qua, không xóa hàng khỏi bảng. Đơn vị quy đổi (hộp, thùng…) tự lấy giá bảng × quy đổi.</Note>
      <label className="btn btn-soft" style={{ alignSelf: 'flex-start' }}><Icon name="up" /> <span>{name || 'Chọn file Excel (.xlsx, .xls, .csv)'}</span>
        <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {r?.error && <Note tone="bad">{r.error}</Note>}
      {r?.rows && <div className="stack">
        <div>Sheet <b>{r.sheet}</b>: {r.rows.length} dòng có giá.</div>
        {r.errors.length > 0 && <Note tone="bad">{r.errors.length} dòng lỗi, sửa file rồi chọn lại:<br />{r.errors.slice(0, 10).map((x) => `Dòng ${x.row}: ${x.text}`).join('; ')}{r.errors.length > 10 ? '…' : ''}</Note>}
        {r.rows.length > 0 && <Table dense rowKey="__row" rows={r.rows.slice(0, 8)} columns={[{ key: 'r', label: 'Dòng', render: (x) => x.__row }, { key: 's', label: 'Mã hàng', render: (x) => x.sku }, { key: 'p', label: book.name, align: 'right', render: (x) => money(x.price) }]} />}
        {r.rows.length > 8 && <div className="muted small">… và {r.rows.length - 8} dòng nữa</div>}
      </div>}
    </Modal>
  );
}

export function PriceBookForm({ id, onClose, onSaved }) {
  const { settings, can, rpc, toast } = useApp();
  const books = useQ('price_books', [], 'name', 200);
  const members = useQ('members', [], 'email', 200, can('owner'));
  const custs = useQ('customers', [], 'name', 5000);
  const { run, busy } = useAction();
  const [f, setF] = useState({ name: '', valid_from: todayVN(), valid_to: '', active: true, formula: { base: '', op: '+', value: 0, pct: true }, allow_others: true, warn_others: false, cust_groups: null, user_ids: null });
  const [loaded, setLoaded] = useState(!id);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setFm = (k, v) => setF((s) => ({ ...s, formula: { ...s.formula, [k]: v } }));
  useEffect(() => { if (id) rpc('q', { view: 'price_books', filters: [['id', 'eq', id]] }).then(([b]) => { setF({ ...b, valid_from: b.valid_from || '', valid_to: b.valid_to || '', formula: { base: '', op: '+', value: 0, pct: true, ...b.formula } }); setLoaded(true); }).catch((e) => toast(e.message, 'err')); }, [id]);
  const pn = settings.price_names || [];
  const groups = [...new Set([...(settings.customer_groups || []), ...(custs.data || []).map((c) => c.kind).filter(Boolean)])];
  const toggle = (k, v, on) => set(k, on ? [...(f[k] || []), v] : (f[k] || []).filter((x) => x !== v));
  if (!loaded) return <Modal title="Bảng giá" onClose={onClose}><Loading /></Modal>;
  return (
    <Modal title={id ? `Sửa bảng giá ${f.name}` : 'Tạo bảng giá'} onClose={onClose} size="lg"
      footer={<>
        {id && <ConfirmBtn icon="trash" busy={busy} confirmText="Bấm lần nữa để xóa bảng giá" onConfirm={async () => { if (await run('delete_price_book', { id }, 'Đã xóa bảng giá')) onClose(); }}>Xóa</ConfirmBtn>}
        <span className="grow" /><Btn onClick={onClose}>Bỏ qua</Btn>
        <Btn kind="primary" busy={busy} onClick={async () => {
          const r = await run('save_price_book', { ...f, id: id || null, valid_from: f.valid_from || null, valid_to: f.valid_to || null, formula: f.formula.base ? f.formula : {} }, 'Đã lưu bảng giá');
          if (r) { onSaved?.(r); onClose(); }
        }}>Lưu</Btn>
      </>}>
      <Field label="Tên bảng giá" required><Input value={f.name} onChange={(v) => set('name', v)} placeholder="vd. Giá công trình quý 4" autoFocus /></Field>
      <Section title="Hiệu lực">
        <div className="grid">
          <Field label="Từ ngày"><DateInput value={f.valid_from} onChange={(v) => set('valid_from', v)} /></Field>
          <Field label="Đến ngày" hint="Để trống: không giới hạn"><DateInput value={f.valid_to} onChange={(v) => set('valid_to', v)} /></Field>
          <Field label="Trạng thái"><RadioList value={f.active ? 'on' : 'off'} onChange={(v) => set('active', v === 'on')} options={[{ value: 'on', label: 'Áp dụng' }, { value: 'off', label: 'Chưa áp dụng' }]} /></Field>
        </div>
      </Section>
      <Section title="Công thức giá">
        <div className="muted small">Tạo giá dựa trên giá vốn, giá nhập cuối, mức giá chung hoặc bảng giá khác. Bấm “Áp dụng công thức” ở màn bảng giá để tính.</div>
        <div className="row gap" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Giá mới =</span>
          <div style={{ minWidth: 200 }}><Select value={f.formula.base} onChange={(v) => setFm('base', v)} placeholder="(không dùng công thức)" options={[
            ...(can('xem_gia_von') ? [{ value: 'cost', label: 'Giá vốn' }, { value: 'last_in', label: 'Giá nhập cuối' }] : []),
            ...pn.map((n, i) => ({ value: `tier${i + 1}`, label: n })),
            ...(books.data || []).filter((b) => b.id !== id).map((b) => ({ value: `book:${b.id}`, label: `Bảng giá ${b.name}` }))]} /></div>
          {f.formula.base && <>
            <div className="seg"><button className={f.formula.op === '+' ? 'on' : ''} onClick={() => setFm('op', '+')}>+</button><button className={f.formula.op === '-' ? 'on' : ''} onClick={() => setFm('op', '-')}>−</button></div>
            <NumInput money={!f.formula.pct} suffix={false} min={0} value={f.formula.value} onChange={(v) => setFm('value', v)} style={{ maxWidth: 130 }} aria-label="Giá trị" />
            <div className="seg"><button className={!f.formula.pct ? 'on' : ''} onClick={() => setFm('pct', false)}>VND</button><button className={f.formula.pct ? 'on' : ''} onClick={() => setFm('pct', true)}>%</button></div>
          </>}
        </div>
      </Section>
      <Section title="Khi thu ngân lên đơn với bảng giá này">
        <RadioList value={f.allow_others ? 'yes' : 'no'} onChange={(v) => set('allow_others', v === 'yes')} options={[{ value: 'yes', label: 'Được phép thêm hàng hóa không có trong bảng giá (lấy giá chung)' }, { value: 'no', label: 'Chỉ được thêm hàng hóa có trong bảng giá này' }]} />
        {f.allow_others && <Check checked={f.warn_others} onChange={(v) => set('warn_others', v)}>Gửi cảnh báo khi thêm hàng hóa không có trong bảng giá</Check>}
      </Section>
      <Section title="Phạm vi áp dụng">
        <Field label="Nhóm khách hàng"><RadioList value={f.cust_groups ? 'some' : 'all'} onChange={(v) => set('cust_groups', v === 'all' ? null : [])} options={[{ value: 'all', label: 'Tất cả' }, { value: 'some', label: 'Nhóm khách hàng cụ thể' }]} /></Field>
        {f.cust_groups && <div className="row gap" style={{ flexWrap: 'wrap' }}>{groups.length ? groups.map((g) => <Check key={g} checked={f.cust_groups.includes(g)} onChange={(v) => toggle('cust_groups', g, v)}>{g}</Check>) : <span className="muted small">Chưa có nhóm khách hàng — tạo ở Khách hàng → Nhóm khách hàng</span>}</div>}
        {can('owner') && <Field label="Người tạo giao dịch"><RadioList value={f.user_ids ? 'some' : 'all'} onChange={(v) => set('user_ids', v === 'all' ? null : [])} options={[{ value: 'all', label: 'Tất cả' }, { value: 'some', label: 'Người tạo giao dịch cụ thể' }]} /></Field>}
        {can('owner') && f.user_ids && <div className="row gap" style={{ flexWrap: 'wrap' }}>{(members.data || []).map((m) => <Check key={m.user_id} checked={f.user_ids.includes(m.user_id)} onChange={(v) => toggle('user_ids', m.user_id, v)}>{m.display_name || m.email}</Check>)}</div>}
      </Section>
    </Modal>
  );
}

// ===================== LÁI XE =====================
export function DriverForm({ id, onClose, onSaved }) {
  const { rpc } = useApp();
  const { run, busy } = useAction();
  const [f, setF] = useState({ name: '', phone: '', plate: '', id_no: '', note: '', active: true });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => { if (id) rpc('q', { view: 'drivers', filters: [['id', 'eq', id]] }).then(([d]) => setF((s) => ({ ...s, ...d }))); }, [id]);
  return (
    <Modal title={id ? `Sửa ${f.name}` : 'Thêm lái xe'} onClose={onClose}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => { const r = await run('save_driver', { ...f, id: id || null }, 'Đã lưu lái xe'); if (r) { onSaved?.(r); onClose(); } }}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Tên lái xe" required wide><Input value={f.name} onChange={(v) => set('name', v)} autoFocus /></Field>
        <Field label="Điện thoại"><Input value={f.phone} onChange={(v) => set('phone', v)} inputMode="tel" /></Field>
        <Field label="Biển số xe"><Input value={f.plate} onChange={(v) => set('plate', v)} /></Field>
        <Field label="CCCD"><Input value={f.id_no} onChange={(v) => set('id_no', v)} /></Field>
        <Field label="Ghi chú" wide><TextArea value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>
      {id && <Check checked={f.active} onChange={(v) => set('active', v)}>Đang hợp tác</Check>}
    </Modal>
  );
}

export function PayDriverDialog({ trip, onClose }) {
  const funds = useFunds();
  const { run, busy } = useAction();
  const [amount, setAmount] = useState(trip.unpaid); const [fund, setFund] = useState(''); const [date, setDate] = useState(todayVN());
  useEffect(() => { if (!fund && funds.data?.length) setFund(funds.data[0].id); }, [funds.data]);
  return (
    <Modal title={`Trả lái xe ${trip.driver_name}`} subtitle={`Chuyến ${trip.code} · còn phải trả ${money(trip.unpaid)} đ`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => { if (await run('pay_driver', { id: trip.id, amount, fund_id: fund, date }, (r) => `Đã chi ${r.code}`)) onClose(); }}>Ghi phiếu chi</Btn></>}>
      <div className="grid">
        <Field label="Số tiền"><NumInput value={amount} onChange={setAmount} /></Field>
        <Field label="Chi từ quỹ"><Select value={fund} onChange={setFund} options={(funds.data || []).map((x) => ({ value: x.id, label: `${x.name} (${money(x.balance)})` }))} /></Field>
        <Field label="Ngày chi"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
      </div>
    </Modal>
  );
}

const WHO = { khach: 'Khách thanh toán', cua_hang: 'Cửa hàng thanh toán' };
const HOW = { hoa_don: 'Thu cùng hóa đơn', truc_tiep: 'Khách trả trực tiếp lái xe' };

export function TripForm({ order_id, delivery_id, onClose }) {
  const { open } = useApp();
  const drivers = useQ('drivers', [['active', 'eq', 'true']], 'name');
  const { run, busy } = useAction();
  const [f, setF] = useState({ driver_id: '', amount: null, payer: 'khach', collect: 'hoa_don', date: todayVN(), note: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal title="Ghi chuyến vận chuyển" onClose={onClose}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => { if (await run('save_trip', { ...f, order_id, delivery_id }, (r) => `Đã ghi chuyến ${r.code}`)) onClose(); }}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Lái xe" required><Select value={f.driver_id} onChange={(v) => set('driver_id', v)} options={(drivers.data || []).map((d) => ({ value: d.id, label: `${d.name}${d.phone ? ' · ' + d.phone : ''}` }))} placeholder="Chọn lái xe" /></Field>
        <Field label="Tiền vận chuyển"><NumInput value={f.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Bên chịu phí"><Select value={f.payer} onChange={(v) => set('payer', v)} options={Object.entries(WHO).map(([value, label]) => ({ value, label }))} /></Field>
        {f.payer === 'khach' && <Field label="Cách thanh toán"><Select value={f.collect} onChange={(v) => set('collect', v)} options={Object.entries(HOW).map(([value, label]) => ({ value, label }))} /></Field>}
        <Field label="Ngày"><DateInput value={f.date} onChange={(v) => set('date', v)} max={todayVN()} /></Field>
        <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>
      <Btn small icon="plus" onClick={() => open('driver', { onSaved: (r) => set('driver_id', r.id) })}>Thêm lái xe mới</Btn>
    </Modal>
  );
}

export function DriversPage() {
  const { open, can } = useApp();
  const drivers = useQ('drivers', [], 'name');
  const trips = useQ('driver_trips', [], 'trip_date desc', 2000);
  const { run, busy } = useAction();
  const [tab, setTab] = useState('debt'); const [search, setSearch] = useState('');
  const rows = useMemo(() => (trips.data || []).filter((t) => (tab === 'all' || t.unpaid > 0) && match(`${t.code} ${t.driver_name} ${t.order_code || ''} ${t.customer_name || ''}`, search)), [trips.data, tab, search]);
  const unpaid = (drivers.data || []).reduce((s, d) => s + d.unpaid, 0);
  return (
    <ListPage title="Lái xe & công nợ" sub="Thu hộ cùng hóa đơn hoặc cửa hàng chịu phí thì phát sinh khoản phải trả lái xe. Khách trả trực tiếp cho lái xe thì không phát sinh nợ."
      filters={<FilterBox title="Chuyến"><RadioList value={tab} onChange={setTab} options={[{ value: 'debt', label: 'Còn phải trả', count: (trips.data || []).filter((t) => t.unpaid > 0).length }, { value: 'all', label: 'Tất cả', count: (trips.data || []).length }]} /></FilterBox>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm lái xe, đơn, khách…" />}
      actions={<>{can('ban_hang') && <Btn onClick={() => open('trip', {})} icon="truck">Ghi chuyến</Btn>}{can('ban_hang') && <Btn kind="primary" icon="plus" onClick={() => open('driver', {})}>Thêm lái xe</Btn>}</>}>
      <ErrorBox error={drivers.error || trips.error} />
      <div className="kpis kpis-3">
        <div className={`kpi ${unpaid > 0 ? 'alertk' : ''}`}><span className="kpi-label">Còn phải trả lái xe</span><span className="kpi-value">{money(unpaid)}</span></div>
        <div className="kpi"><span className="kpi-label">Số lái xe</span><span className="kpi-value">{(drivers.data || []).length}</span></div>
        <div className="kpi"><span className="kpi-label">Đã trả</span><span className="kpi-value">{money((drivers.data || []).reduce((s, d) => s + d.paid, 0))}</span></div>
      </div>
      <Table dense rows={drivers.data} empty="Chưa có lái xe" onRow={(d) => open('driver', { id: d.id })} columns={[
        { key: 'n', label: 'Lái xe', render: (d) => <><div className="cell-main">{d.name}</div><div className="cell-sub">{[d.phone, d.plate].filter(Boolean).join(' · ')}</div></> },
        { key: 't', label: 'Số chuyến', align: 'right', render: (d) => d.trips },
        { key: 'a', label: 'Phải trả', align: 'right', render: (d) => money(d.total) }, { key: 'p', label: 'Đã trả', align: 'right', render: (d) => money(d.paid) },
        { key: 'u', label: 'Còn lại', align: 'right', render: (d) => (d.unpaid > 0 ? <b className="bad">{money(d.unpaid)}</b> : '—') },
      ]} />
      <Table dense rows={trips.data ? rows : null} empty="Không có chuyến phù hợp" columns={[
        { key: 'c', label: 'Chuyến', render: (t) => <><b>{t.code}</b><div className="cell-sub">{dmy(t.trip_date)}</div></> },
        { key: 'd', label: 'Lái xe', render: (t) => t.driver_name },
        { key: 'o', label: 'Đơn / khách', render: (t) => (t.order_id ? <a href="#" onClick={(e) => { e.preventDefault(); open('order', { id: t.order_id }); }}>{t.order_code}</a> : '—') },
        { key: 'h', label: 'Thanh toán', render: (t) => <span className="small">{WHO[t.payer]}{t.payer === 'khach' ? ` · ${HOW[t.collect]}` : ''}</span> },
        { key: 'a', label: 'Tiền', align: 'right', render: (t) => money(t.amount) },
        { key: 'u', label: 'Còn phải trả', align: 'right', render: (t) => (t.unpaid > 0 ? <b className="bad">{money(t.unpaid)}</b> : t.expense_id ? <Pill tone="good">đã trả</Pill> : <Pill tone="neutral">khách trả</Pill>) },
        { key: 'x', label: '', render: (t) => <div className="row gap-s">
          {t.unpaid > 0 && can('thu_chi') && <Btn small kind="soft" onClick={() => open('pay-driver', { trip: t })}>Trả tiền</Btn>}
          {t.paid === 0 && can('ban_hang') && <ConfirmBtn small busy={busy} onConfirm={() => run('delete_trip', { id: t.id }, 'Đã xóa chuyến')}>Xóa</ConfirmBtn>}</div> },
      ]} />
    </ListPage>
  );
}

// ===================== TRẢ HÀNG =====================
export function SalesReturnsPage() {
  const { open } = useApp();
  const q = useQ('sales_returns', [], 'return_date desc', 3000);
  const time = useTimeFilter('month');
  const [search, setSearch] = useState('');
  const rows = useMemo(() => (q.data || []).filter((r) => time.inRange(r.return_date)
    && match(`${r.code} ${r.order_code || ''} ${r.customer_name || ''} ${r.reason || ''}`, search)), [q.data, time.time, search]);
  return (
    <ListPage title="Trả hàng" sub="Khách trả lại hàng đã giao. Lập phiếu trả từ chi tiết đơn hàng, nút “Trả hàng”."
      filters={<TimeFilter filter={time} />}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã phiếu trả, mã đơn, khách…" />}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} onRow={(r) => open('order', { id: r.order_id })}
        empty={time.from ? 'Không có phiếu trả hàng nào trong khoảng thời gian này. Chọn "Toàn thời gian" để xem các tháng khác.' : 'Chưa có phiếu trả hàng'}
        foot={rows.length ? { c: `${rows.length} phiếu`, v: money(rows.reduce((t, r) => t + (r.revenue || 0), 0)) } : null} columns={[
        { key: 'c', label: 'Phiếu trả', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.return_date)}</div></> },
        { key: 'o', label: 'Đơn / khách', render: (r) => <><div>{r.order_code}</div><div className="cell-sub">{r.customer_name}</div></> },
        { key: 'l', label: 'Hàng trả', render: (r) => (r.lines || []).map((x) => `${x.sku} × ${fq(x.qty)}`).join('; ') },
        { key: 'r', label: 'Lý do', render: (r) => r.reason || '—' }, { key: 'v', label: 'Giảm doanh thu', align: 'right', render: (r) => money(r.revenue) },
      ]} />
    </ListPage>
  );
}


