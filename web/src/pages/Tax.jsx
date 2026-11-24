// Kho hóa đơn đầu vào / đầu ra, trang Thuế HKD và báo cáo đơn đặt xưởng.
import React, { useMemo, useState } from 'react';
import { useApp, useQ, useRpcData, useAction } from '../lib/store.jsx';
import { useNewestFirst, timeCols } from '../components/report-order.jsx';
import { money, qty as fq, dmy, match, todayVN, monthLabel } from '../lib/format.js';
import { useSuppliers } from '../lib/lookups.js';
import { docSettings, custExtra } from '../lib/docs/model.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, Pill, Field, Input, Select, DateInput, NumInput, Search, ErrorBox, Note, Table, Modal, Tabs, usePageTab, ConfirmBtn, Loading, Picker } from '../components/ui.jsx';
import { Attachments } from './Contracts.jsx';

const LABEL = { vao: 'Hóa đơn đầu vào', ra: 'Hóa đơn đầu ra' };

const notVoided = [['voided', 'eq', 'false']];
const sameNo = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Nguồn để điền nhanh hóa đơn: đầu ra lấy từ hóa đơn bán (Đơn hàng › Hóa đơn), đầu vào lấy từ phiếu nhập hàng / mua dịch vụ có ghi số hóa đơn đầu vào.
// Mỗi mục: {id, label, sub, fill(): Promise<các trường điền sẵn>}
function useInvoiceSources(direction, enabled) {
  const { can, q } = useApp();
  const ra = direction === 'ra';
  const taxed = useQ('tax_invoices', [['direction', 'eq', direction], ...notVoided], 'inv_date desc', 5000, enabled);
  const orders = useQ('sales_orders', [['status', 'neq', 'huy']], 'created_at desc', 5000, enabled && ra && can('xem_ban_hang'));
  const pos = useQ('purchase_orders', [['mode', 'eq', 'nhap'], ['status', 'neq', 'huy'], ['invoice_no', 'not_null']], 'order_date desc', 5000, enabled && !ra && can('xem_nhap_hang'));
  const exps = useQ('expenses', [...notVoided, ['invoice_no', 'not_null']], 'exp_date desc', 5000, enabled && !ra && can('xem_chi_phi'));
  return useMemo(() => {
    const done = taxed.data || [];
    if (ra) {
      return (orders.data || []).filter((o) => o.status !== 'nhap' && (o.kind !== 'dat_hang' || o.delivery_count > 0)).map((o) => {
        // Tiền trước thuế của hàng đã giao (đơn chưa giao thì lấy cả đơn), trừ phần đã ghi hóa đơn
        const need = o.delivered_value > 0 ? o.delivered_value - o.vat_net : o.order_total - (o.vat_total || 0);
        const invoiced = done.filter((t) => t.order_id === o.id).reduce((s, t) => s + t.amount, 0);
        const left = Math.max(Math.round(need - invoiced), 0);
        return { id: o.id, label: `${o.code} · ${o.customer_name}`, sub: `${dmy(o.order_date)} · ${money(o.order_total)}${invoiced ? ` · đã ghi HĐ ${money(invoiced)}` : ''}`,
          fill: async () => {
            const [c] = o.customer_id ? await q('customers', [['id', 'eq', o.customer_id]]) : [];
            const x = custExtra(c);
            return { order_id: o.id, party_name: x.tax_name || o.customer_name || '', party_tax: x.tax_code || '', amount: left || null, ...(Number(o.vat_rate) > 0 ? { vat_rate: Number(o.vat_rate) } : {}), note: `Hóa đơn bán ${o.code}` };
          } };
      });
    }
    const fresh = (no, sid) => !done.some((t) => sameNo(t.inv_no, no) && (!t.supplier_id || !sid || t.supplier_id === sid));
    const fromPo = (pos.data || []).filter((o) => String(o.invoice_no || '').trim() && fresh(o.invoice_no, o.supplier_id)).map((o) => ({
      id: `po:${o.id}`, label: `HĐ ${o.invoice_no} · ${o.supplier_name || ''}`, sub: `Nhập hàng ${o.code} · ${dmy(o.order_date)} · ${money(o.order_total)}`, date: o.order_date,
      fill: async () => ({ inv_no: o.invoice_no.trim(), inv_date: o.order_date, supplier_id: o.supplier_id || '', party_name: o.supplier_name || '', amount: o.order_total || null, category: 'Hàng hóa', note: `Phiếu nhập ${o.code}` }),
    }));
    const fromExp = (exps.data || []).filter((e) => String(e.invoice_no || '').trim() && fresh(e.invoice_no, e.supplier_id)).map((e) => ({
      id: `ex:${e.id}`, label: `HĐ ${e.invoice_no} · ${e.supplier_name || e.category}`, sub: `${e.code} · ${e.category} · ${dmy(e.exp_date)} · ${money(e.amount)}`, date: e.exp_date,
      fill: async () => ({ inv_no: e.invoice_no.trim(), inv_date: e.exp_date, supplier_id: e.supplier_id || '', party_name: e.supplier_name || '', amount: e.amount || null, category: e.category, note: `${e.code}${e.description ? ' · ' + e.description : ''}` }),
    }));
    return [...fromPo, ...fromExp].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [ra, taxed.data, orders.data, pos.data, exps.data]);
}

// preset: điền sẵn theo đơn bán (nhắc xuất hóa đơn VAT) — {order_id, order_code, party_name, party_tax, amount, vat_rate}
export function TaxInvoiceForm({ direction, preset, onClose }) {
  const { book, settings } = useApp();
  const sources = useInvoiceSources(direction, !preset);
  const [src, setSrc] = useState('');
  const suppliers = useSuppliers();
  const { run, busy } = useAction();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const [f, setF] = useState({ inv_no: '', inv_date: todayVN(), party_name: '', party_tax: '', profile_id: ds.profiles[0].id, amount: null, vat_rate: settings.default_vat ?? 8, supplier_id: '', category: '', note: '',
    ...(preset ? { order_id: preset.order_id, party_name: preset.party_name || '', party_tax: preset.party_tax || '', amount: preset.amount ?? null, vat_rate: Number(preset.vat_rate) > 0 ? Number(preset.vat_rate) : (settings.default_vat ?? 8) } : {}) });
  const [saved, setSaved] = useState(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const vao = direction === 'vao';
  if (saved) return <Modal title="Đính kèm hóa đơn" onClose={onClose} footer={<Btn kind="primary" onClick={onClose}>Xong</Btn>}><Attachments refType="tax_invoice" refId={saved} /></Modal>;
  return (
    <Modal title={`Thêm ${LABEL[direction].toLowerCase()}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => { const r = await run('save_tax_invoice', { ...f, direction }, 'Đã lưu hóa đơn'); if (r) setSaved(r.id); }}>Lưu</Btn></>}>
      {preset?.order_code && <Note>Hóa đơn VAT đã xuất cho đơn <b>{preset.order_code}</b>. Nhập số hóa đơn và tiền trước thuế đúng như trên hóa đơn điện tử.</Note>}
      {!preset && (
        <Field label={vao ? 'Lấy từ phiếu nhập hàng / mua dịch vụ' : 'Lấy từ hóa đơn bán (Đơn hàng › Hóa đơn)'}
          hint={src ? 'Đã điền sẵn từ chứng từ đã chọn. Kiểm tra lại tiền trước thuế và thuế suất cho đúng hóa đơn.' : vao ? 'Chỉ hiện phiếu có ghi số hóa đơn đầu vào và chưa ghi nhận ở đây.' : 'Chọn đơn để điền sẵn bên mua, mã số thuế và tiền chưa xuất hóa đơn.'}>
          <Picker items={sources} value={src} getLabel={(x) => x.label} getSub={(x) => x.sub} placeholder={vao ? 'Tìm số hóa đơn, phiếu, nhà cung cấp…' : 'Tìm mã đơn, khách hàng…'}
            onChange={async (id, x) => { setSrc(id); const v = await x.fill(); setF((s) => ({ ...s, order_id: undefined, ...v })); }} />
        </Field>
      )}
      <div className="grid">
        <Field label="Số hóa đơn" required><Input value={f.inv_no} onChange={(v) => set('inv_no', v)} autoFocus /></Field>
        <Field label="Ngày hóa đơn"><DateInput value={f.inv_date} onChange={(v) => set('inv_date', v)} /></Field>
        {vao && <Field label="Nhà cung cấp"><Select value={f.supplier_id} onChange={(v) => { const s = suppliers.data?.find((x) => x.id === v); setF((x) => ({ ...x, supplier_id: v, party_name: s?.name || x.party_name })); }} options={(suppliers.data || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="Chọn nếu có" /></Field>}
        <Field label={vao ? 'Bên bán' : 'Bên mua'}><Input value={f.party_name} onChange={(v) => set('party_name', v)} /></Field>
        <Field label="Mã số thuế"><Input value={f.party_tax} onChange={(v) => set('party_tax', v)} /></Field>
        <Field label="Pháp nhân"><Select value={f.profile_id} onChange={(v) => set('profile_id', v)} options={ds.profiles.map((p) => ({ value: p.id, label: p.legal_name || p.name }))} /></Field>
        <Field label="Tiền trước thuế"><NumInput value={f.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Thuế suất VAT"><NumInput money={false} min={0} max={100} suffix="%" value={f.vat_rate} onChange={(v) => set('vat_rate', v)} /></Field>
        <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>
    </Modal>
  );
}

export function InvoiceList({ direction, title, sub }) {
  const { open, can } = useApp();
  const q = useQ('tax_invoices', [['direction', 'eq', direction], ['voided', 'eq', 'false']], 'inv_date desc', 3000);
  const { run, busy } = useAction();
  const [search, setSearch] = useState('');
  const rows = useMemo(() => (q.data || []).filter((t) => match(`${t.inv_no} ${t.party_name || ''} ${t.party_tax || ''}`, search)), [q.data, search]);
  const sum = (k) => rows.reduce((s, t) => s + t[k], 0);
  return (
    <div className="stack">
      {title && <div className="page-head"><div className="grow"><h1 className="page-title">{title}</h1>{sub && <div className="page-sub">{sub}</div>}</div></div>}
      <div className="row gap"><div className="grow" style={{ maxWidth: 380 }}><Search value={search} onChange={setSearch} placeholder="Tìm số hóa đơn, tên, mã số thuế…" /></div>
        <Btn icon="dl" onClick={() => exportXlsx(`hoa-don-${direction === 'vao' ? 'dau-vao' : 'dau-ra'}.xlsx`, [{ name: LABEL[direction], rows, columns: [{ key: 'inv_no', label: 'Số hóa đơn' }, { key: 'inv_date', label: 'Ngày', type: 'date' }, { key: 'party_name', label: 'Đối tác' }, { key: 'party_tax', label: 'Mã số thuế' }, { key: 'amount', label: 'Tiền trước thuế' }, { key: 'vat_rate', label: 'Thuế suất %' }, { key: 'vat_amount', label: 'Tiền VAT' }, { key: 'total', label: 'Tổng' }] }])}>Xuất Excel</Btn>
        {can(direction === 'vao' ? 'nhap_hang' : 'ban_hang') && <Btn kind="primary" icon="plus" onClick={() => open('tax-invoice', { direction })}>Thêm hóa đơn</Btn>}</div>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} empty="Chưa có hóa đơn" foot={rows.length ? { n: `${rows.length} hóa đơn`, a: money(sum('amount')), v: money(sum('vat_amount')), t: money(sum('total')) } : null} columns={[
        { key: 'n', label: 'Hóa đơn', render: (t) => <><b>{t.inv_no}</b><div className="cell-sub">{dmy(t.inv_date)}</div></> },
        { key: 'p', label: direction === 'vao' ? 'Bên bán' : 'Bên mua', render: (t) => <><div>{t.party_name || '—'}</div><div className="cell-sub">{t.party_tax || ''}</div></> },
        { key: 'a', label: 'Trước thuế', align: 'right', render: (t) => money(t.amount) }, { key: 'v', label: 'VAT', align: 'right', render: (t) => money(t.vat_amount) }, { key: 't', label: 'Tổng', align: 'right', render: (t) => money(t.total) },
        { key: 'x', label: '', render: (t) => can('owner') && <ConfirmBtn small busy={busy} onConfirm={() => run('void_tax_invoice', { id: t.id }, 'Đã hủy hóa đơn')}>Hủy</ConfirmBtn> },
      ]} />
    </div>
  );
}

export function InputInvoicesPage() { return <InvoiceList direction="vao" title="Hóa đơn đầu vào" />; }

function Reconcile({ profile }) {
  const [year, setYear] = useState(todayVN().slice(0, 4));
  const { data, error } = useRpcData('rpt_tax', { year, profile_id: profile || null });
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const t = data.totals;
  return (
    <div className="stack">
      <div className="row gap"><Field label="Năm"><Input value={year} onChange={setYear} inputMode="numeric" style={{ maxWidth: 100 }} /></Field>
        <Btn icon="dl" onClick={() => exportXlsx(`doi-soat-thue-${year}.xlsx`, [{ name: 'Đối soát', rows: data.months, columns: [{ key: 'month', label: 'Tháng' }, { key: 'revenue', label: 'Doanh thu trên sổ' }, { key: 'out_amount', label: 'Hóa đơn đầu ra' }, { key: 'gap', label: 'Chênh lệch' }, { key: 'out_vat', label: 'VAT đầu ra' }, { key: 'in_amount', label: 'Hóa đơn đầu vào' }, { key: 'in_vat', label: 'VAT đầu vào' }, { key: 'tax_est', label: 'Thuế ước tính' }] }])}>Xuất Excel</Btn></div>
      <div className="kpis kpis-4">
        <div className="kpi"><span className="kpi-label">Doanh thu trên sổ</span><span className="kpi-value">{money(t.revenue)}</span></div>
        <div className="kpi"><span className="kpi-label">Hóa đơn đầu ra</span><span className="kpi-value">{money(t.out_amount)}</span></div>
        <div className={`kpi ${t.gap !== 0 ? 'alertk' : ''}`}><span className="kpi-label">Chênh lệch</span><span className="kpi-value">{money(t.gap)}</span></div>
        <div className="kpi"><span className="kpi-label">Thuế ước tính ({fq(data.vat_rate * 100)}% × đầu ra)</span><span className="kpi-value">{money(t.tax_est)}</span></div>
      </div>
      <Table dense rows={data.months} rowKey="month" columns={[
        { key: 'm', label: 'Tháng', render: (r) => monthLabel(r.month + '-01') }, { key: 'r', label: 'Doanh thu trên sổ', align: 'right', render: (r) => money(r.revenue) }, { key: 'o', label: 'Hóa đơn đầu ra', align: 'right', render: (r) => money(r.out_amount) },
        { key: 'g', label: 'Chênh lệch', align: 'right', render: (r) => (r.gap ? <span className="warn strong">{money(r.gap)}</span> : '—') }, { key: 'ov', label: 'VAT ra', align: 'right', render: (r) => money(r.out_vat) }, { key: 'i', label: 'Đầu vào', align: 'right', render: (r) => money(r.in_amount) }, { key: 'iv', label: 'VAT vào', align: 'right', render: (r) => money(r.in_vat) },
      ]} />
      <Note>Số thuế chỉ là ước tính để theo dõi, thuế suất đặt ở Cài đặt. Khi kê khai cần đối chiếu với kế toán.</Note>
    </div>
  );
}

// Sổ sách: xuất các bảng dữ liệu từ kho chứng từ để nộp cho kế toán
function Ledgers() {
  const { q } = useApp();
  const out = async (dir, name) => { const rows = await q('tax_invoices', [['direction', 'eq', dir], ['voided', 'eq', 'false']], 'inv_date', 10000);
    exportXlsx(`so-${name}.xlsx`, [{ name: 'Sổ', rows, columns: [{ key: 'inv_date', label: 'Ngày', type: 'date' }, { key: 'inv_no', label: 'Số hóa đơn' }, { key: 'party_name', label: 'Đối tác' }, { key: 'party_tax', label: 'Mã số thuế' }, { key: 'amount', label: 'Tiền trước thuế' }, { key: 'vat_amount', label: 'Tiền VAT' }, { key: 'total', label: 'Tổng' }] }]); };
  return <div className="row gap"><Btn icon="dl" onClick={() => out('ra', 'doanh-thu')}>Sổ doanh thu (hóa đơn đầu ra)</Btn><Btn icon="dl" onClick={() => out('vao', 'chi-phi-dau-vao')}>Sổ hàng hóa, chi phí đầu vào</Btn></div>;
}

export function TaxPage(nav) {
  const { book, settings } = useApp();
  const ds = useMemo(() => docSettings(book, settings), [book, settings]);
  const hkd = ds.profiles.find((p) => /hộ kinh doanh/i.test(p.legal_name || p.name)) || ds.profiles[0];
  const [profile, setProfile] = useState(hkd.id);
  const [tab, setTab] = usePageTab(nav, 'tong');
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Thuế HKD</h1></div>
        <div style={{ minWidth: 280 }}><Select value={profile} onChange={setProfile} options={ds.profiles.map((p) => ({ value: p.id, label: p.legal_name || p.name }))} aria-label="Pháp nhân" /></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'tong', label: 'Tổng quan thuế' }, { value: 'vao', label: 'Hóa đơn đầu vào' }, { value: 'ra', label: 'Hóa đơn đầu ra' }, { value: 'so', label: 'Sổ sách & hồ sơ' }]} />
      {tab === 'tong' && <Reconcile profile={profile} />}
      {tab === 'vao' && <InvoiceList direction="vao" />}
      {tab === 'ra' && <InvoiceList direction="ra" />}
      {tab === 'so' && <Ledgers />}
    </>
  );
}

// ===================== ĐƠN ĐẶT XƯỞNG =====================
export function FactoryReport() {
  const { open } = useApp();
  const { data, error } = useRpcData('rpt_factory', {});
  const newest = useNewestFirst();
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const days = timeCols(data.days, newest); let last = null;
  const flat = data.lines.map((l) => ({ ...l, ...Object.fromEntries(days.map((d) => [`d_${d}`, l.moves[d] || 0])) }));
  const exportIt = () => exportXlsx('don-dat-xuong.xlsx', [{ name: 'Đơn đặt xưởng', rows: flat, columns: [{ key: 'customer_name', label: 'Tên KH' }, { key: 'product_name', label: 'Tên sản phẩm' }, { key: 'qty', label: 'Số lượng đặt' }, { key: 'unit', label: 'ĐVT' }, ...days.map((d) => ({ key: `d_${d}`, label: dmy(d).slice(0, 5) })), { key: 'remaining', label: 'Còn SX' }, { key: 'due_date', label: 'Ngày trả dự kiến', type: 'date' }] }]);
  return (
    <div className="stack">
      <div className="row gap"><span className="muted small grow">Đơn đặt hàng đang làm, mỗi ngày giao một cột. Đơn bị hủy phần chưa giao hiện là dừng hàng.</span><Btn icon="dl" onClick={exportIt}>Xuất Excel</Btn></div>
      <div className="table-wrap"><table className="tbl dense">
        <thead><tr><th>Tên KH</th><th>Tên sản phẩm</th><th className="r">SL đặt</th><th>ĐVT</th>{days.map((d) => <th className="r" key={d}>{dmy(d).slice(0, 5)}</th>)}<th className="r">Còn SX</th><th>Ngày trả dự kiến</th></tr></thead>
        <tbody>{data.lines.length === 0 && <tr><td colSpan={6 + days.length} className="muted">Không có đơn đặt hàng đang làm</td></tr>}
          {data.lines.map((l) => { const first = l.order_id !== last; last = l.order_id; return (
            <tr key={l.id} className="clickable" onClick={() => open('order', { id: l.order_id })}>
              <td>{first ? <b>{l.customer_name}</b> : ''}{first && <div className="cell-sub">{l.order_code}</div>}</td><td>{l.product_name}</td><td className="r">{fq(l.qty)}</td><td>{l.unit}</td>
              {days.map((d) => <td className="r" key={d}>{l.moves[d] ? fq(l.moves[d]) : ''}</td>)}
              <td className="r"><b>{fq(l.remaining)}</b></td><td>{l.stopped ? <Pill tone="bad">Dừng hàng</Pill> : l.due_date ? dmy(l.due_date) : '—'}</td>
            </tr>); })}
        </tbody></table></div>
    </div>
  );
}
