import React, { useState } from 'react';
import { useApp, useRpcData, useQ } from '../lib/store.jsx';
import { money, qty as fq, pct, monthLabel, todayVN, monthStart, addMonths, monthEnd, dmy } from '../lib/format.js';
import { exportXlsx } from '../lib/excel.js';
import { cats as expCats } from '../lib/expenseCats.js';
import { Btn, Tabs, ErrorBox, Note, Table, Pill, MonthInput } from '../components/ui.jsx';
import { PeriodPicker, usePeriod } from '../components/Period.jsx';
import { StockReport } from './Inventory.jsx';
import { FactoryReport } from './Tax.jsx';

const PL_ROWS = [
  ['revenue_goods', 'Tiền hàng đã giao'], ['revenue_shipping', '+ Phí vận chuyển thu khách'], ['revenue_returns', '− Hàng khách trả lại'],
  ['revenue', 'Doanh thu', 'b'], ['vat', '− Thuế GTGT ước tính'], ['revenue_net', 'Doanh thu thuần', 'b'], ['cogs', '− Giá vốn hàng bán', 'c'],
  ['gross_profit', 'Lợi nhuận gộp', 'bc'], ['expenses', '− Chi phí'], ['stock_loss', '− Hao hụt kho', 'c'], ['profit', 'Lợi nhuận sau chi phí', 'bc'],
  ['pit', '− Thuế TNCN ước tính', 'c'], ['profit_after_tax', 'Lợi nhuận sau thuế (ước tính)', 'bc'],
  ['cash_in', 'Tiền thực thu'], ['cash_out', 'Tiền thực chi'], ['net_cash', 'Chênh lệch tiền', 'b'],
];

export function ReportsPage() {
  const { can } = useApp();
  const [tab, setTab] = useState('pl');
  const cost = can('xem_gia_von');
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Báo cáo</h1>
        <div className="page-sub">Doanh thu tính theo ngày giao hàng. Tiền thu tính theo ngày thu. Mọi bảng đều xuất được ra Excel.</div></div></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'pl', label: 'Lãi lỗ theo tháng' }, { value: 'prod', label: 'Theo sản phẩm' }, { value: 'grp', label: 'Theo kênh / khách / nhóm' },
        { value: 'factory', label: 'Đơn đặt xưởng' }, { value: 'stock', label: 'Nhập – xuất – tồn' }, { value: 'debt', label: 'Công nợ' }, ...(cost ? [{ value: 'exp', label: 'Chi phí' }] : []),
      ]} />
      {tab === 'pl' && <MonthlyPL />}
      {tab === 'factory' && <FactoryReport />}
      {tab === 'prod' && <ProductReport />}
      {tab === 'grp' && <GroupReport />}
      {tab === 'stock' && <StockReport />}
      {tab === 'debt' && <DebtReport />}
      {tab === 'exp' && <ExpenseReport />}
    </>
  );
}

function MonthlyPL() {
  const { settings, can } = useApp();
  const t = todayVN();
  const [range, setRange] = useState({ from: monthStart(addMonths(t, -5)), to: monthEnd(t) });
  const r = useRpcData('rpt_monthly', range);
  const rows = r.data || [];
  const cost = can('xem_gia_von');
  const lines = PL_ROWS.filter(([, , f]) => cost || !String(f || '').includes('c'));
  const sumK = (k) => (rows.some((m) => m[k] === null || m[k] === undefined) ? null : rows.reduce((s, m) => s + Number(m[k] || 0), 0));
  // Thuế TNCN của cả giai đoạn tính trên tổng lợi nhuận (tháng lỗ được bù cho tháng lãi), không cộng thuế từng tháng
  const total = (k) => {
    if (k === 'pit' || k === 'profit_after_tax') { const pr = sumK('profit'); if (pr === null) return null; const pit = Math.round(Math.max(0, pr) * (settings.pit_rate || 0)); return k === 'pit' ? pit : pr - pit; }
    return sumK(k);
  };
  return (
    <div className="stack">
      <div className="row gap">
        <label className="row gap-s small">Từ tháng <MonthInput value={range.from.slice(0, 7)} max={range.to.slice(0, 7)} onChange={(v) => setRange((x) => ({ ...x, from: v + '-01' }))} aria-label="Từ tháng" /></label>
        <label className="row gap-s small">đến <MonthInput value={range.to.slice(0, 7)} min={range.from.slice(0, 7)} onChange={(v) => setRange((x) => ({ ...x, to: monthEnd(v + '-01') }))} aria-label="Đến tháng" /></label>
        <span className="grow" />
        <Btn icon="dl" onClick={() => exportXlsx(`lai-lo_${range.from}_${range.to}.xlsx`, [{ name: 'Lãi lỗ', rows: lines.map(([k, label]) => ({ label, ...Object.fromEntries(rows.map((m) => [m.month, m[k]])), total: total(k) })),
          columns: [{ key: 'label', label: 'Chỉ tiêu' }, ...rows.map((m) => ({ key: m.month, label: monthLabel(m.month) })), { key: 'total', label: 'Cộng' }] }])}>Xuất Excel</Btn>
      </div>
      <Note>Thuế GTGT {pct(settings.vat_rate || 0)} trên doanh thu, thuế TNCN {pct(settings.pit_rate || 0)} trên lợi nhuận — số ước tính để quản trị, không thay tờ khai thuế. Cột “Cộng” tính thuế TNCN trên tổng lợi nhuận cả giai đoạn.{!cost && ' Bạn chưa có quyền xem giá vốn nên các dòng giá vốn và lợi nhuận bị ẩn.'}</Note>
      <ErrorBox error={r.error} />
      <div className="table-wrap">
        <table className="tbl dense">
          <thead><tr><th>Chỉ tiêu</th>{rows.map((m) => <th key={m.month} className="r">{monthLabel(m.month)}</th>)}<th className="r">Cộng</th></tr></thead>
          <tbody>{lines.map(([k, label, f]) => (
            <tr key={k} className={String(f || '').includes('b') ? 'row-strong' : ''}>
              <td>{label}</td>
              {rows.map((m) => <td key={m.month} className={`r num ${m[k] < 0 ? 'bad' : ''}`}>{money(m[k])}</td>)}
              <td className="r num strong">{money(total(k))}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function ProductReport() {
  const { can, open } = useApp();
  const [period, setPeriod] = usePeriod('month');
  const r = useRpcData('rpt_products', { from: period.from, to: period.to });
  const cost = can('xem_gia_von');
  const rows = r.data || [];
  const sum = (k) => rows.reduce((s, x) => s + Number(x[k] || 0), 0);
  return (
    <div className="stack">
      <div className="row gap"><PeriodPicker value={period} onChange={setPeriod} /><span className="grow" />
        <Btn icon="dl" onClick={() => exportXlsx(`ban-theo-san-pham_${period.from}_${period.to}.xlsx`, [{ name: 'Theo sản phẩm', rows, columns: [
          { key: 'sku', label: 'SKU' }, { key: 'name', label: 'Tên' }, { key: 'category', label: 'Chủng loại' }, { key: 'qty', label: 'SL bán thuần' }, { key: 'orders', label: 'Số đơn' },
          { key: 'revenue', label: 'Doanh thu' }, ...(cost ? [{ key: 'cogs', label: 'Giá vốn' }, { key: 'profit', label: 'Lãi gộp (sau thuế GTGT)' }] : [])] }])}>Xuất Excel</Btn></div>
      <ErrorBox error={r.error} />
      <Table dense rows={r.data} onRow={(x) => open('stockcard', { product_id: x.id })} empty="Chưa bán được hàng trong kỳ"
        foot={{ q: fq(sum('qty')), r: money(sum('revenue')), ...(cost ? { c: money(sum('cogs')), p: money(sum('profit')) } : {}) }} columns={[
          { key: 'n', label: 'Sản phẩm', render: (x) => <><b>{x.sku}</b> · {x.name} {x.is_kit && <Pill tone="accent">Bộ</Pill>}<div className="cell-sub">{x.category}</div></> },
          { key: 'q', label: 'SL bán', align: 'right', render: (x) => fq(x.qty) },
          { key: 'o', label: 'Số đơn', align: 'right', render: (x) => x.orders },
          { key: 'r', label: 'Doanh thu', align: 'right', render: (x) => money(x.revenue) },
          ...(cost ? [{ key: 'c', label: 'Giá vốn', align: 'right', render: (x) => money(x.cogs) },
            { key: 'p', label: 'Lãi gộp', align: 'right', render: (x) => <span className={x.profit < 0 ? 'bad' : ''}>{money(x.profit)}</span> },
            { key: 'm', label: 'Biên', align: 'right', render: (x) => (x.revenue ? pct(x.profit / x.revenue) : '—') }] : []),
        ]} />
    </div>
  );
}

function GroupReport() {
  const { can } = useApp();
  const [period, setPeriod] = usePeriod('month');
  const [by, setBy] = useState('channel');
  const r = useRpcData('rpt_groups', { from: period.from, to: period.to, by });
  const cost = can('xem_gia_von');
  const rows = r.data || [];
  const total = rows.reduce((s, x) => s + Number(x.revenue || 0), 0);
  const LBL = { channel: 'Kênh bán', customer: 'Khách hàng', category: 'Chủng loại', staff: 'Nhân viên' };
  return (
    <div className="stack">
      <div className="row gap"><PeriodPicker value={period} onChange={setPeriod} />
        <div className="seg">{Object.entries(LBL).map(([k, v]) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{v}</button>)}</div>
        <span className="grow" />
        <Btn icon="dl" onClick={() => exportXlsx(`doanh-thu-theo-${by}_${period.from}_${period.to}.xlsx`, [{ name: LBL[by], rows, columns: [
          { key: 'name', label: LBL[by] }, { key: 'orders', label: 'Số đơn' }, { key: 'revenue', label: 'Doanh thu' }, ...(cost ? [{ key: 'cogs', label: 'Giá vốn' }, { key: 'profit', label: 'Lãi gộp' }] : [])] }])}>Xuất Excel</Btn></div>
      <ErrorBox error={r.error} />
      <Table dense rowKey="name" rows={r.data} empty="Chưa có doanh thu trong kỳ" foot={{ r: money(total) }} columns={[
        { key: 'n', label: LBL[by], render: (x) => <b>{x.name}</b> },
        { key: 'o', label: 'Số đơn', align: 'right', render: (x) => x.orders },
        { key: 'r', label: 'Doanh thu', align: 'right', render: (x) => money(x.revenue) },
        { key: 's', label: 'Tỷ trọng', render: (x) => <div className="share"><i style={{ width: `${total ? Math.max(0, (x.revenue / total) * 100) : 0}%` }} /><span>{total ? pct(x.revenue / total) : '—'}</span></div> },
        ...(cost ? [{ key: 'c', label: 'Giá vốn', align: 'right', render: (x) => money(x.cogs) }, { key: 'p', label: 'Lãi gộp', align: 'right', render: (x) => money(x.profit) }] : []),
      ]} />
      {by === 'channel' && <div className="muted small">Doanh thu kênh TikTok là giá bán cho khách; phí sàn được ghi riêng vào chi phí “Phí sàn TMĐT”.</div>}
    </div>
  );
}

function DebtReport() {
  const { open } = useApp();
  const [type, setType] = useState('kh');
  const isKh = type === 'kh';
  const q = useQ('open_docs', [['party_type', 'eq', type]], 'due_date', 2000);
  const parties = useQ(isKh ? 'customers' : 'suppliers', [], 'name', 5000);
  const names = Object.fromEntries((parties.data || []).map((c) => [c.id, c.name]));
  // Chỉ phần ĐÃ giao/nhận mà chưa trả mới là nợ (phần chưa giao không phải nợ)
  const rows = (q.data || []).filter((d) => d.remaining_due > 0 && d.status !== 'huy').map((d) => ({ ...d, party_name: names[d.party_id] || '' }));
  const sum = (k) => rows.reduce((s, x) => s + Number(x[k] || 0), 0);
  const t = todayVN();
  const bucket = (d) => { if (!d.due_date || d.due_date >= t) return 'Chưa đến hạn'; const n = Math.round((new Date(t) - new Date(d.due_date)) / 864e5); return n <= 30 ? 'Quá hạn 1–30 ngày' : n <= 60 ? 'Quá hạn 31–60 ngày' : 'Quá hạn trên 60 ngày'; };
  const buckets = ['Chưa đến hạn', 'Quá hạn 1–30 ngày', 'Quá hạn 31–60 ngày', 'Quá hạn trên 60 ngày'].map((b) => ({ b, v: rows.filter((d) => bucket(d) === b).reduce((s, d) => s + d.remaining_due, 0) }));
  return (
    <div className="stack">
      <div className="row gap">
        <div className="seg"><button className={isKh ? 'on' : ''} onClick={() => setType('kh')}>Khách hàng nợ mình</button><button className={!isKh ? 'on' : ''} onClick={() => setType('ncc')}>Mình nợ nhà cung cấp</button></div>
        <span className="grow" />
        <Btn icon="dl" onClick={() => exportXlsx(`chi-tiet-cong-no-${type}.xlsx`, [{ name: 'Công nợ', rows, columns: [
          { key: 'party_name', label: isKh ? 'Khách hàng' : 'Nhà cung cấp' }, { key: 'code', label: 'Chứng từ' }, { key: 'doc_date', label: 'Ngày' }, { key: 'due_now', label: 'Giá trị đã giao/nhận' },
          { key: 'paid_net', label: 'Đã trả' }, { key: 'remaining_due', label: 'Còn nợ' }, { key: 'due_date', label: 'Hạn trả' }, { key: 'b', label: 'Tuổi nợ', get: bucket }] }])}>Xuất Excel</Btn>
      </div>
      <div className="kpis">{buckets.map((x, i) => <div key={x.b} className={`kpi ${i > 0 && x.v > 0 ? 'alertk' : ''}`}><span className="kpi-label">{x.b}</span><span className="kpi-value">{money(x.v)}</span></div>)}</div>
      <ErrorBox error={q.error} />
      <Table dense rows={q.data ? rows : null} rowKey="doc_id" empty="Không còn công nợ" foot={{ r: money(sum('remaining_due')) }}
        onRow={(d) => (d.doc_type === 'don_ban' ? open('order', { id: d.doc_id }) : d.doc_type === 'don_mua' ? open('po', { id: d.doc_id }) : d.doc_type === 'chi_phi' ? open('expense', { id: d.doc_id }) : open('party-detail', { type, id: d.party_id }))}
        rowClass={(d) => (d.due_date && d.due_date < t ? 'row-late' : '')} columns={[
          { key: 'p', label: isKh ? 'Khách hàng' : 'Nhà cung cấp', render: (d) => <b>{d.party_name}</b> },
          { key: 'c', label: 'Chứng từ', render: (d) => <>{d.code}<div className="cell-sub">{dmy(d.doc_date)}</div></> },
          { key: 't', label: 'Đã giao/nhận', align: 'right', render: (d) => money(d.due_now) },
          { key: 'pd', label: 'Đã trả', align: 'right', render: (d) => money(d.paid_net) },
          { key: 'r', label: 'Còn nợ', align: 'right', render: (d) => <b>{money(d.remaining_due)}</b> },
          { key: 'h', label: 'Hạn trả', render: (d) => (d.due_date ? dmy(d.due_date) : '—') },
          { key: 'a', label: 'Tuổi nợ', render: (d) => { const b = bucket(d); return <Pill tone={b === 'Chưa đến hạn' ? 'neutral' : 'bad'}>{b}</Pill>; } },
        ]} />
    </div>
  );
}

function ExpenseReport() {
  const { open, settings } = useApp();
  const t = todayVN();
  const [view, setView] = useState('item');
  const [period, setPeriod] = usePeriod('month');
  const [range, setRange] = useState({ from: monthStart(addMonths(t, -5)), to: monthEnd(t) });
  const r = useRpcData('rpt_expenses', view === 'item' ? { from: period.from, to: period.to } : { ...range, by: 'month' });
  const rows = r.data || [];
  const total = rows.reduce((s, x) => s + Number(x.amount || 0), 0);
  // Theo khoản mục: chèn dòng tổng của từng nhóm
  const itemRows = []; let last = null;
  for (const x of view === 'item' ? rows : []) {
    if (x.grp !== last) { itemRows.push({ __g: true, id: 'g-' + x.grp, grp: x.grp, amount: x.grp_amount }); last = x.grp; }
    itemRows.push({ ...x, id: x.grp + '|' + x.name });
  }
  // Theo tháng: bảng nhóm × tháng
  const months = []; for (let m = range.from.slice(0, 7) + '-01'; m <= range.to && months.length < 36; m = addMonths(m, 1)) months.push(m);
  const tree = expCats(settings).map((g) => g.group);
  const present = [...new Set(rows.map((x) => x.grp))];
  const groups = [...tree.filter((g) => present.includes(g)), ...present.filter((g) => !tree.includes(g) && g !== 'Hao hụt kho'), ...(present.includes('Hao hụt kho') ? ['Hao hụt kho'] : [])];
  const cell = (g, m) => Number(rows.find((x) => x.grp === g && x.month === m)?.amount || 0);
  const gsum = (g) => months.reduce((s, m) => s + Number(cell(g, m)), 0);
  const msum = (m) => groups.reduce((s, g) => s + Number(cell(g, m)), 0);
  return (
    <div className="stack">
      <div className="row gap">
        <div className="seg"><button className={view === 'item' ? 'on' : ''} onClick={() => setView('item')}>Theo nhóm & khoản mục</button><button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>So sánh theo tháng</button></div>
        {view === 'item' ? <PeriodPicker value={period} onChange={setPeriod} /> : <>
          <label className="row gap-s small">Từ tháng <MonthInput value={range.from.slice(0, 7)} max={range.to.slice(0, 7)} onChange={(v) => setRange((x) => ({ ...x, from: v + '-01' }))} aria-label="Từ tháng" /></label>
          <label className="row gap-s small">đến <MonthInput value={range.to.slice(0, 7)} min={range.from.slice(0, 7)} onChange={(v) => setRange((x) => ({ ...x, to: monthEnd(v + '-01') }))} aria-label="Đến tháng" /></label></>}
        <span className="grow" />
        <Btn icon="dl" onClick={() => (view === 'item'
          ? exportXlsx(`chi-phi_${period.from}_${period.to}.xlsx`, [{ name: 'Chi phí', rows, columns: [{ key: 'grp', label: 'Nhóm' }, { key: 'name', label: 'Khoản mục' }, { key: 'count', label: 'Số khoản' }, { key: 'amount', label: 'Tính vào lãi lỗ kỳ này' }] }])
          : exportXlsx(`chi-phi-theo-thang_${range.from}_${range.to}.xlsx`, [{ name: 'Chi phí theo tháng', rows: [...groups.map((g) => ({ g, ...Object.fromEntries(months.map((m) => [m, cell(g, m)])), tot: gsum(g) })), { g: 'Cộng', ...Object.fromEntries(months.map((m) => [m, msum(m)])), tot: total }],
            columns: [{ key: 'g', label: 'Nhóm' }, ...months.map((m) => ({ key: m, label: monthLabel(m) })), { key: 'tot', label: 'Cộng' }] }]))}>Xuất Excel</Btn>
      </div>
      <div className="muted small">Số tiền tính vào lãi lỗ: khoản phân bổ (công cụ dụng cụ, tiền nhà trả trước…) chỉ tính phần của từng tháng. Hao hụt kho (vỡ, lỗi) hiện riêng để đối chiếu.</div>
      <ErrorBox error={r.error} />
      {view === 'item' ? (
        <Table dense rows={r.data ? itemRows : null} rowClass={(x) => (x.__g ? 'row-group' : '')} empty="Không có chi phí trong kỳ" foot={{ n: 'Cộng', a: money(total) }}
          onRow={(x) => !x.__g && open('drill', { metric: 'opex', label: 'Chi phí vận hành', how: 'Từng khoản chi phí (đã chia phân bổ) và hao hụt kho trong kỳ.', from: period.from, to: period.to })} columns={[
          { key: 'n', label: 'Nhóm / khoản mục', render: (x) => (x.__g ? x.grp : <span style={{ paddingLeft: 16, display: 'inline-block' }}>{x.name}{x.has_alloc && <span className="muted small"> · có phân bổ</span>}</span>) },
          { key: 'c', label: 'Số khoản', align: 'right', render: (x) => (x.__g ? '' : x.count) },
          { key: 's', label: 'Tỷ trọng', render: (x) => <div className="share"><i style={{ width: `${total ? (x.amount / total) * 100 : 0}%`, opacity: x.__g ? 1 : 0.55 }} /><span>{total ? pct(x.amount / total) : '—'}</span></div> },
          { key: 'a', label: 'Số tiền', align: 'right', render: (x) => (x.__g ? <b>{money(x.amount)}</b> : money(x.amount)) },
        ]} />
      ) : (
        <div className="table-wrap">
          <table className="tbl dense">
            <thead><tr><th>Nhóm chi phí</th>{months.map((m) => <th key={m} className="r">{monthLabel(m)}</th>)}<th className="r">Cộng</th></tr></thead>
            <tbody>{groups.length === 0 && <tr><td colSpan={months.length + 2} className="tbl-empty">Không có chi phí</td></tr>}
              {groups.map((g) => <tr key={g}><td>{g}</td>{months.map((m) => <td key={m} className="r num">{cell(g, m) ? money(cell(g, m)) : '—'}</td>)}<td className="r num strong">{money(gsum(g))}</td></tr>)}</tbody>
            <tfoot><tr><td>Cộng</td>{months.map((m) => <td key={m} className="r num">{money(msum(m))}</td>)}<td className="r num">{money(total)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
