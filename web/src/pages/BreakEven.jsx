// Báo cáo hòa vốn: P&L tháng theo chi phí biến đổi / cố định, điểm hòa vốn, kịch bản doanh thu, kịch bản giá bán (hệ số trên giá vốn)
// và so sánh các thương hiệu. Số liệu lấy từ sổ; phần "Giả lập" cho sửa tạm từng số để thử kịch bản (không lưu).
import React, { useEffect, useState } from 'react';
import { useApp, useRpcData } from '../lib/store.jsx';
import { money, qty as fq, pct, short, monthLabel, todayVN, monthStart, addMonths, monthEnd } from '../lib/format.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, ErrorBox, Note, Table, Pill, MonthInput, Section, NumInput, Icon } from '../components/ui.jsx';

// Số đầu vào: [khóa, nhãn, nguồn trong sổ, chỉ tiêu xem chi tiết]
const INPUTS = [
  ['revenue', 'Doanh thu thuần', 'Tiền hàng đã giao + phí vận chuyển thu khách − hàng trả lại − thuế GTGT ước tính', 'revenue_net'],
  ['orders', 'Số đơn', 'Số đơn có giao hàng trong tháng (giá trị đơn TA = doanh thu ÷ số đơn)', null],
  ['cogs', 'Giá vốn', 'Giá vốn hàng đã giao − giá vốn hàng trả lại', 'cogs'],
  ['ads', 'Quảng cáo', 'Chi phí nhóm Marketing', 'expenses'],
  ['damage', 'Hỏng / hủy / hao hụt', 'Hao hụt kho: vỡ, lỗi, thất thoát, xuất dùng nội bộ', 'stock_loss'],
  ['other_var', 'Chi phí biến đổi khác', 'Chi phí nhóm Chi phí bán hàng (ship, bao bì, phí sàn, hoa hồng…)', 'expenses'],
  ['staff', 'Lương thưởng', 'Chi phí nhóm Nhân sự', 'expenses'],
  ['rent', 'Thuê nhà', 'Chi phí nhóm Mặt bằng (khoản trả trước chỉ tính phần của tháng)', 'expenses'],
  ['utilities', 'Điện nước', 'Chi phí nhóm Điện, nước, internet', 'expenses'],
  ['tools', 'Công cụ dụng cụ', 'Chi phí nhóm Công cụ dụng cụ (đã chia phân bổ)', 'expenses'],
  ['other_fixed', 'Chi phí khác cố định', 'Chi phí nhóm Quản lý & khác và các nhóm tự đặt thêm', 'expenses'],
];
const LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5];
const n0 = (v) => Number(v) || 0;
const div = (a, b) => (b ? a / b : null);

// Toàn bộ chỉ số suy ra từ số đầu vào (giống cách tính của bảng P&L dự toán khách đang dùng)
export function beCalc(x) {
  const rev = n0(x.revenue); const orders = n0(x.orders);
  const ta = div(rev, orders);
  const variable = n0(x.cogs) + n0(x.ads) + n0(x.damage) + n0(x.other_var);
  const varRatio = rev ? variable / rev : 0;
  const cm = 1 - varRatio;
  const gross = rev - n0(x.cogs);
  const contribution = rev - variable;
  const opex = n0(x.rent) + n0(x.utilities) + n0(x.tools) + n0(x.other_fixed);
  const fixed = n0(x.staff) + opex;
  const profit = contribution - fixed;
  const be = cm > 0 ? Math.ceil(fixed / cm / 1000) * 1000 : null;
  const cogsRatio = rev ? n0(x.cogs) / rev : 0;
  const otherVar = rev ? (n0(x.ads) + n0(x.damage) + n0(x.other_var)) / rev : 0;
  return {
    rev, orders, ta, variable, varRatio, cm, gross, contribution, opex, fixed, profit, margin: div(profit, rev), total_cost: variable + fixed,
    be, be_orders: be !== null && ta ? Math.ceil(be / ta) : null, over: be !== null ? rev - be : null, need: be !== null ? Math.max(0, be - rev) : null,
    cogsRatio, otherVar, cur_mult: cogsRatio ? 1 / cogsRatio : null, cogs_per_order: ta !== null ? ta * cogsRatio : null,
  };
}

// Kịch bản giá bán theo hệ số k trên giá vốn: A giữ nguyên doanh thu, B giữ nguyên số đơn
export function priceScenario(c, k, keep) {
  const price = c.cogs_per_order !== null ? c.cogs_per_order * k : null;
  const cmK = 1 - 1 / k - c.otherVar;
  const rev = keep === 'revenue' ? c.rev : price !== null ? c.orders * price : 0;
  const orders = keep === 'revenue' ? div(c.rev, price) : c.orders;
  const contribution = rev * cmK;
  const profit = contribution - c.fixed;
  const be = cmK > 0 ? Math.ceil(c.fixed / cmK / 1000) * 1000 : null;
  return { k, price, cogs_pct: 1 / k, gross_margin: 1 - 1 / k, rev, orders, contribution, profit, margin: div(profit, rev), be, be_orders: be !== null && price ? Math.ceil(be / price) : null };
}

const tone = (v) => (v < 0 ? 'bad' : v > 0 ? 'good' : '');
const Kpi = ({ label, value, sub, cls = '' }) => <div className={`kpi ${cls}`}><span className="kpi-label">{label}</span><span className="kpi-value">{value}</span>{sub && <span className="kpi-sub">{sub}</span>}</div>;

function MonthNav({ value, onChange }) {
  return (
    <div className="row gap-s">
      <Btn icon="back" aria-label="Tháng trước" onClick={() => onChange(addMonths(value, -1))} />
      <MonthInput value={value.slice(0, 7)} max={todayVN().slice(0, 7)} onChange={(v) => v && onChange(v + '-01')} aria-label="Tháng" />
      <Btn icon="chev" aria-label="Tháng sau" disabled={value >= monthStart(todayVN())} onClick={() => onChange(addMonths(value, 1))} />
    </div>
  );
}

// Lãi/lỗ theo doanh thu: đường thẳng lợi nhuận = doanh thu × biên đóng góp − chi phí cố định
function ProfitChart({ c }) {
  const X = Math.max(c.rev * 1.5, (c.be || 0) * 1.3, 1);
  const W = 640; const H = 200; const pad = 4;
  const pts = [0, X].map((r) => ({ r, p: r * c.cm - c.fixed }));
  const lo = Math.min(0, ...pts.map((p) => p.p)); const hi = Math.max(0, ...pts.map((p) => p.p), 1);
  const x = (r) => (r / X) * W; const y = (v) => pad + (hi - v) / (hi - lo || 1) * (H - pad * 2);
  return (
    <div className="stack-s">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ height: 'auto' }} role="img" aria-label="Lãi lỗ theo doanh thu">
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1.5" />
        <polyline points={pts.map((p) => `${x(p.r)},${y(p.p)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        {c.be !== null && c.be <= X && <line x1={x(c.be)} x2={x(c.be)} y1="0" y2={H} stroke="#c9892b" strokeDasharray="5 4" strokeWidth="1.5" />}
        {c.rev > 0 && <circle cx={x(c.rev)} cy={y(c.rev * c.cm - c.fixed)} r="5" fill={c.profit < 0 ? 'var(--bad, #b3261e)' : 'var(--celadon)'} />}
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--accent)' }} />Lãi/lỗ theo doanh thu (0 → {short(X)})</span>
        {c.be !== null && <span><i style={{ background: '#c9892b' }} />Hòa vốn {short(c.be)}</span>}
        {c.rev > 0 && <span><i style={{ background: c.profit < 0 ? '#b3261e' : 'var(--celadon)' }} />Hiện tại {short(c.rev)} → {c.profit < 0 ? 'lỗ' : 'lãi'} {short(Math.abs(c.profit))}</span>}
      </div>
    </div>
  );
}

function MultChart({ a, b }) {
  if (a.length < 2) return null;
  const all = [...a, ...b].map((s) => s.profit);
  const lo = Math.min(0, ...all); const hi = Math.max(0, ...all, 1);
  const W = 640; const H = 200; const pad = 6;
  const x = (i) => pad + (i / (a.length - 1)) * (W - pad * 2); const y = (v) => pad + (hi - v) / (hi - lo || 1) * (H - pad * 2);
  const line = (rows) => rows.map((s, i) => `${x(i)},${y(s.profit)}`).join(' ');
  return (
    <div className="stack-s">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ height: 'auto' }} role="img" aria-label="Lợi nhuận theo hệ số giá">
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1.5" />
        <polyline points={line(a)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        <polyline points={line(b)} fill="none" stroke="#c9892b" strokeWidth="2.5" />
        {a.map((s, i) => <circle key={i} cx={x(i)} cy={y(s.profit)} r="4" fill="var(--accent)" />)}
        {b.map((s, i) => <circle key={i} cx={x(i)} cy={y(s.profit)} r="4" fill="#c9892b" />)}
      </svg>
      <div className="legend"><span><i style={{ background: 'var(--accent)' }} />A · Giữ nguyên doanh thu</span><span><i style={{ background: '#c9892b' }} />B · Giữ nguyên số đơn</span>
        <span>Hệ số: {a.map((s) => `${fq(s.k)}×`).join(' · ')}</span></div>
    </div>
  );
}

function plRows(c, x) {
  return [
    ['I. Doanh thu & giá vốn'], ['Doanh thu thuần', c.rev, 'revenue'], ['Giá vốn (−)', x.cogs, 'cogs'], ['Lợi nhuận gộp', c.gross, null, 'b'],
    ['II. Chi phí biến đổi'], ['Quảng cáo (−)', x.ads, 'ads'], ['Hỏng / hủy / hao hụt (−)', x.damage, 'damage'], ['Chi phí biến đổi khác (−)', x.other_var, 'other_var'],
    ['Lãi đóng góp trước nhân sự', c.contribution, null, 'b'],
    ['III. Lương thưởng'], ['Lương thưởng (−)', x.staff, 'staff'],
    ['IV. Chi phí vận hành'], ['Thuê nhà (−)', x.rent, 'rent'], ['Điện nước (−)', x.utilities, 'utilities'], ['Công cụ dụng cụ (−)', x.tools, 'tools'], ['Chi phí khác cố định (−)', x.other_fixed, 'other_fixed'],
    ['Tổng chi phí vận hành', c.opex, null, 'b'],
    ['V. Kết quả kinh doanh'], ['Lãi / lỗ trước thuế', c.profit, null, 'b'], ['Tổng chi phí tháng', c.total_cost], ['Doanh thu hòa vốn', c.be],
  ];
}

export function BreakEvenReport() {
  const { open, can, rpc, toast, refresh } = useApp();
  const [month, setMonth] = useState(monthStart(todayVN()));
  const [view, setView] = useState('pl');
  const [ov, setOv] = useState({});
  const [mult, setMult] = useState(null);
  const q = useRpcData('rpt_break_even', { month });
  const d = q.data;
  useEffect(() => { setOv({}); }, [month]);
  useEffect(() => { if (d && mult === null) setMult(d.multipliers); }, [d]);
  const x = d ? { ...d, ...ov } : null;
  const c = x ? beCalc(x) : null;
  const ks = (mult || []).filter((k) => k > 1);
  const scA = c ? ks.map((k) => priceScenario(c, k, 'revenue')) : [];
  const scB = c ? ks.map((k) => priceScenario(c, k, 'orders')) : [];
  const levels = c ? [...LEVELS.map((l) => ({ l, rev: c.rev * l })), ...(c.be !== null && c.be > 0 ? [{ l: 'be', rev: c.be }] : [])].sort((a, z) => a.rev - z.rev) : [];
  const simulated = Object.keys(ov).length > 0;
  const to = monthEnd(month);
  const drill = (k) => { const def = INPUTS.find((i) => i[0] === k); if (def?.[3]) open('drill', { metric: def[3], label: def[1], how: def[2], from: month, to }); };
  const multDirty = d && mult && JSON.stringify(mult) !== JSON.stringify(d.multipliers);

  const doExport = () => {
    const pl = plRows(c, x).filter((r) => r.length > 1).map(([label, v]) => ({ label, v, p: c.rev ? v / c.rev : null }));
    const sc = (rows) => rows.map((s) => ({ ...s, k: `${fq(s.k)}×` }));
    const scCols = [{ key: 'k', label: 'Hệ số giá' }, { key: 'price', label: 'Giá bán/đơn' }, { key: 'cogs_pct', label: 'Giá vốn/DT' }, { key: 'gross_margin', label: 'Biên LN gộp' },
      { key: 'rev', label: 'Doanh thu' }, { key: 'orders', label: 'Số đơn' }, { key: 'contribution', label: 'Lãi đóng góp' }, { key: 'profit', label: 'Lãi/lỗ trước thuế' },
      { key: 'margin', label: 'Biên LN trước thuế' }, { key: 'be', label: 'DT hòa vốn' }, { key: 'be_orders', label: 'Số đơn hòa vốn' }];
    exportXlsx(`hoa-von_${month.slice(0, 7)}.xlsx`, [
      { name: 'P&L tháng', rows: pl, columns: [{ key: 'label', label: 'Khoản mục' }, { key: 'v', label: 'Số tiền' }, { key: 'p', label: '% DT' }] },
      { name: 'Kịch bản doanh thu', rows: levels.map((s) => ({ name: s.l === 'be' ? 'Hòa vốn' : pct(s.l), rev: s.rev, orders: c.ta ? s.rev / c.ta : null, contribution: s.rev * c.cm, fixed: c.fixed, profit: s.rev * c.cm - c.fixed })),
        columns: [{ key: 'name', label: 'Mức' }, { key: 'rev', label: 'Doanh thu' }, { key: 'orders', label: 'Số đơn' }, { key: 'contribution', label: 'Lãi đóng góp' }, { key: 'fixed', label: 'Chi phí cố định' }, { key: 'profit', label: 'Lãi/lỗ dự kiến' }] },
      { name: 'Giữ nguyên doanh thu', rows: sc(scA), columns: scCols },
      { name: 'Giữ nguyên số đơn', rows: sc(scB), columns: scCols },
    ]);
  };

  const saveMult = async () => {
    try { await rpc('update_book_settings', { settings: { price_multipliers: ks } }); refresh(); toast('Đã lưu hệ số giá'); } catch (e) { toast(e.message, 'err'); }
  };

  const scCols = (keep) => [
    { key: 'k', label: 'Hệ số giá', render: (s) => <b>{fq(s.k)}×</b> },
    { key: 'p', label: 'Giá bán/đơn', align: 'right', render: (s) => money(s.price) },
    { key: 'g', label: 'Giá vốn/DT', align: 'right', render: (s) => pct(s.cogs_pct) },
    { key: 'gm', label: 'Biên LN gộp', align: 'right', render: (s) => pct(s.gross_margin) },
    { key: 'r', label: 'Doanh thu', align: 'right', render: (s) => money(s.rev) },
    { key: 'o', label: keep === 'revenue' ? 'Số đơn quy đổi' : 'Số đơn', align: 'right', render: (s) => (s.orders === null ? '—' : fq(Math.round(s.orders))) },
    { key: 'c', label: 'Lãi đóng góp', align: 'right', render: (s) => money(s.contribution) },
    { key: 'pf', label: 'Lãi/lỗ trước thuế', align: 'right', render: (s) => <b className={tone(s.profit)}>{money(s.profit)}</b> },
    { key: 'm', label: 'Biên LN trước thuế', align: 'right', render: (s) => <span className={tone(s.profit)}>{pct(s.margin)}</span> },
    { key: 'be', label: 'DT hòa vốn', align: 'right', render: (s) => money(s.be) },
    { key: 'bo', label: 'Số đơn HV', align: 'right', render: (s) => (s.be_orders === null ? '—' : fq(s.be_orders)) },
  ];

  if (!can('xem_gia_von')) return <Note tone="warn">Báo cáo hòa vốn cần quyền xem giá vốn.</Note>;
  return (
    <div className="stack">
      <div className="row gap" style={{ flexWrap: 'wrap' }}>
        <MonthNav value={month} onChange={setMonth} />
        <div className="seg">{[['input', 'Thông số & giả lập'], ['pl', 'P&L tháng'], ['be', 'Điểm hòa vốn'], ['price', 'Kịch bản giá bán']].map(([k, l]) =>
          <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>
        <span className="grow" />
        {simulated && <Btn icon="refresh" onClick={() => setOv({})}>Bỏ giả lập</Btn>}
        <Btn icon="dl" disabled={!c} onClick={doExport}>Xuất Excel</Btn>
      </div>
      <ErrorBox error={q.error} />
      {simulated && <Note tone="warn">Đang <b>giả lập</b>: một số ô đã được sửa tạm, các con số bên dưới là dự toán chứ không phải số thật của sổ. Bấm “Bỏ giả lập” để quay về số liệu thật.</Note>}
      {c && c.rev === 0 && !simulated && <Note>Tháng {monthLabel(month)} chưa có doanh thu. Có thể vào “Thông số & giả lập” để nhập số dự kiến và xem hòa vốn.</Note>}
      {c && <div className="kpis kpis-4">
        <Kpi label="Doanh thu thuần" value={money(c.rev)} sub={`${fq(c.orders)} đơn · TA ${money(c.ta)} đ/đơn`} />
        <Kpi label="Lãi / lỗ trước thuế" value={<span className={tone(c.profit)}>{money(c.profit)}</span>} sub={`Biên ${pct(c.margin)}`} cls={c.profit < 0 ? 'alertk' : ''} />
        <Kpi label="Doanh thu hòa vốn" value={money(c.be)} sub={c.be === null ? 'Biên đóng góp ≤ 0: tăng doanh thu không hòa vốn được' : `${c.be_orders === null ? '—' : fq(c.be_orders)} đơn hòa vốn`} />
        <Kpi label={c.over !== null && c.over < 0 ? 'Còn thiếu để hòa vốn' : 'Vượt hòa vốn'} value={<span className={tone(c.over ?? 0)}>{money(c.over === null ? null : Math.abs(c.over))}</span>}
          sub={c.be ? <div className="prog"><i style={{ width: `${Math.min(100, (c.rev / c.be) * 100)}%`, background: c.over < 0 ? '#c9892b' : 'var(--celadon)' }} /></div> : null} />
      </div>}

      {c && view === 'input' && <Section title="Thông số tháng — số thật của sổ và giả lập">
        <div className="muted small">Mỗi ô lấy sẵn số thật trong sổ. Sửa một ô để thử kịch bản (ví dụ tăng quảng cáo, giảm tiền nhà) — các tab P&L, hòa vốn, kịch bản giá cập nhật ngay. Số giả lập không lưu vào sổ.</div>
        <Table dense rowKey="0" rows={INPUTS} columns={[
          { key: 'n', label: 'Khoản', render: ([k, label, how]) => <><b>{label}</b><div className="cell-sub">{how}</div></> },
          { key: 'a', label: 'Số thật', align: 'right', render: ([k, , , m]) => (m ? <button className="link-btn" onClick={() => drill(k)}>{k === 'orders' ? fq(d[k]) : money(d[k])}</button> : fq(d[k])) },
          { key: 's', label: 'Giả lập', align: 'right', render: ([k]) => <div className="row gap-s" style={{ justifyContent: 'flex-end' }}>
            <NumInput money={k !== 'orders'} suffix={false} min={0} value={x[k]} onChange={(v) => setOv((o) => { const n = { ...o }; if (v === null || v === d[k]) delete n[k]; else n[k] = v; return n; })} style={{ maxWidth: 160 }} aria-label={`Giả lập ${INPUTS.find((i) => i[0] === k)[1]}`} />
            {k in ov && <Btn small icon="x" aria-label="Về số thật" onClick={() => setOv((o) => { const n = { ...o }; delete n[k]; return n; })} />}</div> },
          { key: 'r', label: '% DT', align: 'right', render: ([k]) => (k === 'orders' || k === 'revenue' || !c.rev ? '' : pct(n0(x[k]) / c.rev)) },
        ]} />
        <div className="muted small">Tổng chi phí biến đổi {money(c.variable)} đ = {pct(c.varRatio)} doanh thu · biên đóng góp {pct(c.cm)} · chi phí cố định (lương thưởng + vận hành) {money(c.fixed)} đ.</div>
      </Section>}

      {c && view === 'pl' && <div className="table-wrap">
        <table className="tbl dense">
          <thead><tr><th>Khoản mục — {monthLabel(month)}</th><th className="r">Số tiền</th><th className="r">% DT</th><th>Ghi chú</th></tr></thead>
          <tbody>{plRows(c, x).map(([label, v, k, f]) => (v === undefined
            ? <tr key={label} className="row-group"><td colSpan={4}>{label}</td></tr>
            : <tr key={label} className={f ? 'row-strong' : ''} onClick={k && INPUTS.find((i) => i[0] === k)?.[3] && !(k in ov) ? () => drill(k) : undefined} style={k && !(k in ov) ? { cursor: 'pointer' } : undefined}>
              <td>{label}</td><td className={`r num ${label.startsWith('Lãi / lỗ') ? tone(v) : ''}`}>{money(v)}</td><td className="r num">{c.rev && v !== null ? pct(v / c.rev) : '—'}</td>
              <td className="muted small">{k && k in ov ? <Pill tone="warn">Giả lập</Pill> : k ? INPUTS.find((i) => i[0] === k)?.[2] : label === 'Doanh thu hòa vốn' ? 'Chi phí cố định ÷ biên đóng góp' : ''}</td></tr>))}</tbody>
        </table>
      </div>}

      {c && view === 'be' && <>
        <div className="kpis">
          <Kpi label="Tổng chi phí cố định" value={money(c.fixed)} sub="Lương thưởng + vận hành" />
          <Kpi label="Tỷ lệ chi phí biến đổi" value={pct(c.varRatio)} sub="Giá vốn + QC + hỏng + khác" />
          <Kpi label="Biên đóng góp" value={pct(c.cm)} />
          <Kpi label="DT cần tăng để hòa vốn" value={c.need === null ? '—' : c.need > 0 ? money(c.need) : '—'} sub={c.need === 0 ? 'Đã vượt hòa vốn' : null} />
        </div>
        <Section title="Lãi/lỗ theo doanh thu"><ProfitChart c={c} /></Section>
        <Section title="Kịch bản doanh thu & lãi lỗ">
          <div className="muted small">Các mức 25% – 150% doanh thu hiện tại, kèm dòng hòa vốn. Chi phí cố định (lương thưởng, vận hành) giữ nguyên ở mọi mức.</div>
          <Table dense rowKey="l" rows={levels} rowClass={(s) => (s.l === 1 ? 'row-strong' : '')} columns={[
            { key: 'r', label: 'Doanh thu', render: (s) => <>{money(s.rev)} {s.l === 1 && <Pill tone="accent">Hiện tại</Pill>}{s.l === 'be' && <Pill tone="warn">Hòa vốn</Pill>}</> },
            { key: 'o', label: 'Số đơn (TA)', align: 'right', render: (s) => (c.ta ? fq((s.l === 'be' ? Math.ceil : Math.round)(s.rev / c.ta)) : '—') },
            { key: 'c', label: 'Lãi đóng góp', align: 'right', render: (s) => money(s.rev * c.cm) },
            { key: 'f', label: 'Chi phí cố định', align: 'right', render: () => money(c.fixed) },
            { key: 'p', label: 'Lãi/lỗ dự kiến', align: 'right', render: (s) => <b className={tone(s.rev * c.cm - c.fixed)}>{money(s.rev * c.cm - c.fixed)}</b> },
            { key: 't', label: 'Trạng thái', render: (s) => { const p = s.l === 'be' ? 0 : s.rev * c.cm - c.fixed; return <Pill tone={p > 0 ? 'good' : p < 0 ? 'bad' : 'neutral'}>{p > 0 ? 'Có lãi' : p < 0 ? 'Lỗ' : 'Hòa vốn'}</Pill>; } },
          ]} />
          <div className="muted small">Doanh thu hòa vốn = chi phí cố định ÷ biên đóng góp (làm tròn lên nghìn đồng). Khi biên đóng góp ≤ 0, doanh thu tăng không tạo ra hòa vốn.</div>
        </Section>
      </>}

      {c && view === 'price' && <>
        <div className="kpis">
          <Kpi label="Giá trị đơn hiện tại (TA)" value={money(c.ta)} sub={`${fq(c.orders)} đơn/tháng`} />
          <Kpi label="Giá vốn/đơn ước tính" value={money(c.cogs_per_order)} sub={`TA × ${pct(c.cogsRatio)}`} />
          <Kpi label="Lương thưởng + CP vận hành" value={money(c.fixed)} />
          <Kpi label="Biến phí ngoài giá vốn" value={pct(c.otherVar)} />
          <Kpi label="Hệ số giá hiện tại" value={c.cur_mult === null ? '—' : `${fq(c.cur_mult)}×`} sub="= 1 ÷ tỷ lệ giá vốn" />
        </div>
        <Section title="Hệ số giá đem so sánh" actions={can('owner') && multDirty ? <Btn kind="primary" icon="check" onClick={saveMult}>Lưu hệ số</Btn> : null}>
          <div className="row gap-s" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            {(mult || []).map((k, i) => <div key={i} className="row gap-s">
              <NumInput money={false} suffix={false} min={1} value={k} onChange={(v) => setMult((m) => m.map((z, j) => (j === i ? v : z)))} style={{ maxWidth: 80 }} aria-label={`Hệ số ${i + 1}`} /><span>×</span>
              {mult.length > 1 && <Btn small icon="x" aria-label="Bỏ hệ số" onClick={() => setMult((m) => m.filter((_, j) => j !== i))} />}</div>)}
            {(mult || []).length < 8 && <Btn small icon="plus" onClick={() => setMult((m) => [...m, Math.round(((m[m.length - 1] || 2) + 0.5) * 10) / 10])}>Thêm hệ số</Btn>}
          </div>
          <div className="muted small">Giá bán = giá vốn × hệ số. Hệ số phải lớn hơn 1.{can('owner') ? ' Bấm “Lưu hệ số” để dùng lại cho các tháng sau.' : ''}</div>
        </Section>
        <Section title="A · Giữ nguyên doanh thu tháng — so sánh tỷ lệ giá vốn">
          <div className="muted small">Doanh thu không đổi; số đơn quy đổi = doanh thu ÷ giá bán mới.</div>
          <Table dense rowKey="k" rows={scA} empty="Chưa có hệ số" columns={scCols('revenue')} />
        </Section>
        <Section title={`B · Giữ nguyên số đơn tháng — so sánh tăng giá bán`}>
          <div className="muted small">Giả định không mất đơn khi tăng giá: doanh thu = {fq(c.orders)} đơn × giá bán mới.</div>
          <Table dense rowKey="k" rows={scB} empty="Chưa có hệ số" columns={scCols('orders')} />
        </Section>
        <Section title="Lợi nhuận theo hệ số giá"><MultChart a={scA} b={scB} /></Section>
        {c.cogs_per_order === null && <Note>Chưa có số đơn hoặc doanh thu nên chưa tính được giá bán/đơn.</Note>}
      </>}
      <div className="muted small">P&L quản trị trước thuế thu nhập. Chi phí gắn vào đúng tháng phát sinh (khoản phân bổ chỉ tính phần của tháng). Bấm vào số tiền để xem từng chứng từ.</div>
    </div>
  );
}

// So sánh các thương hiệu (mỗi thương hiệu một sổ) trong cùng một tháng
const BRAND_ROWS = [['rev', 'Doanh thu thuần'], ['orders', 'Số đơn', 'q'], ['gross', 'Lợi nhuận gộp'], ['contribution', 'Lãi đóng góp trước nhân sự'], ['staff', 'Lương thưởng'],
  ['opex', 'Tổng chi phí vận hành'], ['profit', 'Lãi / lỗ trước thuế', 'b'], ['margin', 'Biên lãi / lỗ', 'p'], ['be', 'Doanh thu hòa vốn', 'n'], ['be_orders', 'Số đơn hòa vốn', 'qn']];

export function BrandsReport() {
  const [month, setMonth] = useState(monthStart(todayVN()));
  const q = useRpcData('rpt_brands', { month });
  const brands = (q.data?.brands || []).map((b) => ({ ...b, c: { ...beCalc(b), staff: b.staff } }));
  const tot = brands.length ? { ...beCalc(Object.fromEntries(INPUTS.map(([k]) => [k, brands.reduce((s, b) => s + n0(b[k]), 0)]))) } : null;
  if (tot) tot.staff = brands.reduce((s, b) => s + n0(b.staff), 0);
  const fmt = (v, f = '') => (f.includes('p') ? pct(v) : f.includes('q') ? (v === null ? '—' : fq(Math.round(v))) : money(v));
  const cell = (c, k, f) => <span className={k === 'profit' ? tone(c[k]) : ''}>{fmt(c[k], f)}</span>;
  return (
    <div className="stack">
      <div className="row gap"><MonthNav value={month} onChange={setMonth} /><span className="grow" />
        <Btn icon="dl" disabled={!brands.length} onClick={() => exportXlsx(`so-sanh-thuong-hieu_${month.slice(0, 7)}.xlsx`, [{ name: 'So sánh thương hiệu',
          rows: BRAND_ROWS.map(([k, label, f]) => ({ label, ...Object.fromEntries(brands.map((b) => [b.book_id, b.c[k]])), tot: f?.includes('n') || f?.includes('p') ? null : tot[k] })),
          columns: [{ key: 'label', label: 'Chỉ tiêu' }, ...brands.map((b) => ({ key: b.book_id, label: b.short_name || b.name })), { key: 'tot', label: 'Tổng' }] }])}>Xuất Excel</Btn></div>
      <ErrorBox error={q.error} />
      {tot && <div className="kpis kpis-3">
        <Kpi label="Lãi / lỗ cả công ty" value={<span className={tone(tot.profit)}>{money(tot.profit)}</span>} sub={`Biên ${pct(tot.margin)}`} cls={tot.profit < 0 ? 'alertk' : ''} />
        <Kpi label="Tổng doanh thu thuần" value={money(tot.rev)} sub={`${fq(tot.orders)} đơn`} />
        <Kpi label="Tổng chi phí cố định" value={money(tot.fixed)} sub="Lương thưởng + vận hành" />
      </div>}
      {brands.length > 0 && <div className="kpis">{brands.map((b) => (
        <div key={b.book_id} className={`kpi ${b.c.profit < 0 ? 'alertk' : ''}`}>
          <span className="kpi-label">{b.name}</span>
          <span className="kpi-value"><span className={tone(b.c.profit)}>{money(b.c.profit)}</span></span>
          <span className="kpi-sub">Biên {pct(b.c.margin)} · DT {short(b.c.rev)} · hòa vốn {b.c.be === null ? '—' : short(b.c.be)}</span>
          {b.c.be ? <div className="prog"><i style={{ width: `${Math.min(100, (b.c.rev / b.c.be) * 100)}%`, background: b.c.over < 0 ? '#c9892b' : 'var(--celadon)' }} /></div> : null}
          <span className="kpi-sub">{b.c.over === null ? 'Biên đóng góp ≤ 0' : b.c.over >= 0 ? `Vượt hòa vốn ${money(b.c.over)}` : `Còn thiếu ${money(-b.c.over)}`}</span>
        </div>))}</div>}
      {q.data && <div className="table-wrap">
        <table className="tbl dense">
          <thead><tr><th>Chỉ tiêu — {monthLabel(month)}</th>{brands.map((b) => <th key={b.book_id} className="r">{b.short_name || b.name}</th>)}<th className="r">Tổng</th></tr></thead>
          <tbody>{brands.length === 0 && <tr><td colSpan={2} className="tbl-empty">Bạn chưa có sổ nào được xem báo cáo và giá vốn</td></tr>}
            {brands.length > 0 && BRAND_ROWS.map(([k, label, f = '']) => <tr key={k} className={f.includes('b') ? 'row-strong' : ''}><td>{label}</td>
              {brands.map((b) => <td key={b.book_id} className="r num">{cell(b.c, k, f)}</td>)}
              <td className="r num strong">{f.includes('n') ? '—' : cell(tot, k, f)}</td></tr>)}</tbody>
        </table>
      </div>}
      <div className="muted small">Mỗi thương hiệu là một sổ; chỉ hiện các sổ bạn được xem báo cáo và giá vốn. Tổng = cộng số của từng thương hiệu, riêng biên lãi tính trên tổng; doanh thu hòa vốn tính riêng từng thương hiệu nên không cộng.
        Nếu lương dùng chung cho nhiều thương hiệu, hãy ghi chi phí lương vào đúng sổ của thương hiệu để so sánh chính xác.</div>
    </div>
  );
}
