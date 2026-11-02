// Bảng giá, lái xe & công nợ lái xe, danh sách trả hàng.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, match, todayVN } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, Pill, Field, Input, TextArea, Select, DateInput, NumInput, Check, Search, ErrorBox, Table, Modal, ConfirmBtn, ListPage, FilterBox, RadioList } from '../components/ui.jsx';

// ===================== BẢNG GIÁ =====================
export function PriceBookPage() {
  const { can, settings } = useApp();
  const q = useQ('products', [['active', 'eq', 'true']], 'sku', 5000);
  const { run, busy } = useAction();
  const [search, setSearch] = useState(''); const [cat, setCat] = useState(''); const [edit, setEdit] = useState({});
  const pn = settings.price_names || [];
  const all = q.data || [];
  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
  const rows = useMemo(() => all.filter((p) => (!cat || p.category === cat) && match(`${p.sku} ${p.name} ${p.size || ''} ${p.color || ''}`, search)), [all, cat, search]);
  const dirty = Object.keys(edit).length;
  const setPrice = (id, i, v) => setEdit((s) => ({ ...s, [id]: { ...s[id], [`price${i + 1}`]: v } }));
  const save = async () => { if (await run('save_prices', { rows: Object.entries(edit).map(([id, v]) => ({ id, ...v })) }, (r) => `Đã cập nhật giá ${r.updated} mã hàng`)) setEdit({}); };
  return (
    <ListPage title="Bảng giá" sub={`${pn.join(' / ')}. Giá theo mức của khách được tự điền khi tạo báo giá và đơn hàng.`}
      filters={<FilterBox title="Nhóm hàng"><RadioList value={cat} onChange={setCat} options={[{ value: '', label: 'Tất cả', count: all.length }, ...cats.map((c) => ({ value: c, label: c, count: all.filter((p) => p.category === c).length }))]} /></FilterBox>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã, tên, màu, kích thước…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('bang-gia.xlsx', [{ name: 'Bảng giá', rows, columns: [{ key: 'sku', label: 'Mã SKU' }, { key: 'name', label: 'Tên hàng hóa' }, { key: 'unit', label: 'ĐVT' }, ...pn.map((label, i) => ({ key: `price${i + 1}`, label }))] }])}>Xuất Excel</Btn>
        {can('danh_muc') && <Btn kind="primary" icon="check" busy={busy} disabled={!dirty} onClick={save}>Lưu {dirty ? `${dirty} mã` : ''}</Btn>}
      </>}>
      <ErrorBox error={q.error} />
      <Table dense rows={q.data ? rows : null} empty="Chưa có hàng hóa" columns={[
        { key: 'p', label: 'Hàng hóa', render: (p) => <><div className="cell-main">{p.sku} · {p.name}</div><div className="cell-sub">{[p.size, p.color, p.material].filter(Boolean).join(' · ')}</div></> },
        { key: 'u', label: 'ĐVT', render: (p) => p.unit },
        ...pn.map((label, i) => ({ key: `p${i}`, label, align: 'right', render: (p) => (can('danh_muc')
          ? <NumInput suffix={false} min={0} value={edit[p.id]?.[`price${i + 1}`] ?? p[`price${i + 1}`]} onChange={(v) => setPrice(p.id, i, v)} style={{ maxWidth: 120, marginLeft: 'auto' }} aria-label={label} />
          : money(p[`price${i + 1}`])) })),
      ]} />
    </ListPage>
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
  const q = useQ('sales_returns', [], 'return_date desc', 2000);
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Trả hàng</h1><div className="page-sub">Khách trả lại hàng đã giao. Lập phiếu trả từ chi tiết đơn hàng, nút “Trả hàng”.</div></div></div>
      <ErrorBox error={q.error} />
      <Table rows={q.data} empty="Chưa có phiếu trả hàng" onRow={(r) => open('order', { id: r.order_id })} columns={[
        { key: 'c', label: 'Phiếu trả', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.return_date)}</div></> },
        { key: 'o', label: 'Đơn / khách', render: (r) => <><div>{r.order_code}</div><div className="cell-sub">{r.customer_name}</div></> },
        { key: 'l', label: 'Hàng trả', render: (r) => (r.lines || []).map((x) => `${x.sku} × ${fq(x.qty)}`).join('; ') },
        { key: 'r', label: 'Lý do', render: (r) => r.reason || '—' }, { key: 'v', label: 'Giảm doanh thu', align: 'right', render: (r) => money(r.revenue) },
      ]} />
    </>
  );
}

export function SupplierReturnsPage() {
  const { open } = useApp();
  const q = useQ('supplier_returns', [], 'return_date desc', 2000);
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Trả hàng nhập</h1><div className="page-sub">Hàng trả lại nhà cung cấp. Lập phiếu từ chi tiết đơn nhập, nút “Trả hàng”.</div></div></div>
      <ErrorBox error={q.error} />
      <Table rows={q.data} empty="Chưa có phiếu trả hàng nhập" onRow={(r) => open('po', { id: r.po_id })} columns={[
        { key: 'c', label: 'Phiếu trả', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.return_date)}</div></> },
        { key: 'o', label: 'Đơn nhập / NCC', render: (r) => <><div>{r.po_code}</div><div className="cell-sub">{r.supplier_name}</div></> },
        { key: 'l', label: 'Hàng trả', render: (r) => (r.lines || []).map((x) => `${x.sku} × ${fq(x.qty)}`).join('; ') },
        { key: 'r', label: 'Lý do', render: (r) => r.reason || '—' }, { key: 'v', label: 'Giá trị', align: 'right', render: (r) => money(r.value) },
      ]} />
    </>
  );
}

