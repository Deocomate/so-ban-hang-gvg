// Báo cáo P&L (lãi lỗ) theo tháng: KPI, cầu lợi nhuận, cấu trúc chi phí, xu hướng tháng và bảng P&L chi tiết theo nhóm chi phí.
// Toàn bộ số liệu lấy thật từ sổ (rpt_monthly + chi phí theo nhóm × tháng); thuế GTGT và TNCN là ước tính theo thuế suất của sổ.
import React, { useState } from 'react';
import { useApp, useRpcData } from '../lib/store.jsx';
import { money, pct, short, monthLabel, todayVN, monthStart, monthEnd, addMonths } from '../lib/format.js';
import { exportXlsx } from '../lib/excel.js';
import { cats as expCats } from '../lib/expenseCats.js';
import { Btn, ErrorBox, Note, MonthInput, Section, Loading } from '../components/ui.jsx';

// Nhóm chi phí xếp vào "Chi phí bán hàng"; các nhóm còn lại (kể cả nhóm tự đặt) vào "Quản lý & vận hành"
const SELL_GROUPS = ['Marketing', 'Chi phí bán hàng', 'Hao hụt kho'];
const STOCK_GROUPS = ['Hao hụt kho', 'Xuất dùng nội bộ'];

const PRESETS = [
  ['month', 'Tháng này', (t) => [monthStart(t), monthEnd(t)]],
  ['quarter', 'Quý này', (t) => { const s = `${t.slice(0, 4)}-${String(Math.floor((Number(t.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`; return [s, monthEnd(addMonths(s, 2))]; }],
  ['6m', '6 tháng', (t) => [addMonths(t, -5), monthEnd(t)]],
  ['12m', '12 tháng', (t) => [addMonths(t, -11), monthEnd(t)]],
  ['year', 'Năm nay', (t) => [`${t.slice(0, 4)}-01-01`, monthEnd(t)]],
  ['lastyear', 'Năm trước', (t) => { const y = Number(t.slice(0, 4)) - 1; return [`${y}-01-01`, `${y}-12-31`]; }],
];

const n0 = (v) => Number(v) || 0;
const neg = (v) => (v ? -v : 0);
const div = (a, b) => (a === null || a === undefined || !b ? null : a / b);
const nfTr = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const growthText = (cur, prev) => (prev ? `${cur >= prev ? '▲' : '▼'} ${pct(Math.abs((cur - prev) / Math.abs(prev)))} so với cùng kỳ năm trước` : 'Cùng kỳ năm trước chưa có số');

// Ghép số lãi lỗ từng tháng với chi phí theo nhóm; trả về các tháng, cột tổng và danh sách nhóm chi phí bán hàng / quản lý
function buildModel(months, exp, settings, pitRate) {
  const amt = {};
  for (const x of exp || []) { amt[x.grp] = amt[x.grp] || {}; amt[x.grp][x.month] = n0(amt[x.grp][x.month]) + n0(x.amount); }
  const present = Object.keys(amt);
  const tree = expCats(settings).map((g) => g.group);
  const sellG = SELL_GROUPS;
  const adminG = [...tree.filter((g) => !SELL_GROUPS.includes(g)), ...present.filter((g) => !tree.includes(g) && !SELL_GROUPS.includes(g) && !STOCK_GROUPS.includes(g)),
    ...present.filter((g) => STOCK_GROUPS.includes(g) && !SELL_GROUPS.includes(g))];
  const rows = months.map((m) => {
    const g = Object.fromEntries([...sellG, ...adminG].map((k) => [k, n0(amt[k]?.[m.month])]));
    const selling = sellG.reduce((s, k) => s + g[k], 0);
    const admin = adminG.reduce((s, k) => s + g[k], 0);
    return { ...m, g, selling: m.cogs === null ? null : selling, admin: m.cogs === null ? null : admin };
  });
  const NUM = ['revenue_goods', 'revenue_shipping', 'revenue_returns', 'revenue', 'vat', 'revenue_net', 'cogs', 'gross_profit', 'expenses', 'stock_loss', 'opex', 'profit',
    'selling', 'admin', 'cash_in', 'cash_out', 'net_cash'];
  const sum = (k) => (rows.some((m) => m[k] === null || m[k] === undefined) ? null : rows.reduce((s, m) => s + n0(m[k]), 0));
  const total = { month: 'total', ...Object.fromEntries(NUM.map((k) => [k, sum(k)])), g: Object.fromEntries([...sellG, ...adminG].map((k) => [k, rows.reduce((s, m) => s + m.g[k], 0)])) };
  // Thuế TNCN của cả kỳ tính trên tổng lợi nhuận (tháng lỗ được bù cho tháng lãi), không cộng thuế từng tháng
  total.pit = total.profit === null ? null : Math.round(Math.max(0, total.profit) * pitRate);
  total.profit_after_tax = total.profit === null ? null : total.profit - total.pit;
  return { rows, total, sellG, adminG };
}

function rowSpec(sellG, adminG, cost) {
  const grpDrill = (g) => (STOCK_GROUPS.includes(g) ? 'stock_loss' : 'expenses');
  return [
    { group: 'A. Doanh thu & lợi nhuận gộp' },
    { k: 'revenue_goods', label: 'Tiền hàng đã giao', drill: 'revenue' },
    { k: 'revenue_shipping', label: '+ Phí vận chuyển thu khách', drill: 'revenue' },
    { k: 'revenue_returns', label: '− Hàng khách trả lại', drill: 'revenue' },
    { k: 'revenue', label: 'Doanh thu', type: 'sub', drill: 'revenue' },
    { k: 'vat', label: '− Thuế GTGT ước tính', drill: 'vat' },
    { k: 'revenue_net', label: '01 · Doanh thu thuần', type: 'total', drill: 'revenue_net' },
    { k: 'cogs', label: '02 · Giá vốn hàng bán', drill: 'cogs', cost: true },
    { k: 'gross_profit', label: '03 · Lợi nhuận gộp', type: 'sub', drill: 'gross_profit', cost: true },
    { k: 'gm', label: 'Biên lợi nhuận gộp', type: 'ratio', get: (r) => div(r.gross_profit, r.revenue_net), cost: true },
    { group: 'B. Chi phí bán hàng', cost: true },
    ...sellG.map((g) => ({ k: `g:${g}`, label: g, get: (r) => r.g[g], drill: grpDrill(g), expGroup: g, cost: true })),
    { k: 'selling', label: 'Tổng chi phí bán hàng', type: 'sub', cost: true },
    { group: 'C. Chi phí quản lý & vận hành', cost: true },
    ...adminG.map((g) => ({ k: `g:${g}`, label: g, get: (r) => r.g[g], drill: grpDrill(g), expGroup: g, cost: true })),
    { k: 'admin', label: 'Tổng chi phí quản lý', type: 'sub', cost: true },
    { group: 'D. Lợi nhuận', cost: true },
    { k: 'opex', label: 'Tổng chi phí hoạt động (B + C)', drill: 'opex', cost: true },
    { k: 'profit', label: '04 · Lợi nhuận trước thuế', type: 'total', drill: 'profit', cost: true },
    { k: 'pm', label: 'Biên lợi nhuận trước thuế', type: 'ratio', get: (r) => div(r.profit, r.revenue_net), cost: true },
    { k: 'pit', label: '− Thuế TNCN ước tính', cost: true },
    { k: 'profit_after_tax', label: '05 · Lợi nhuận sau thuế (ước tính)', type: 'total', cost: true },
    { k: 'nm', label: 'Biên lợi nhuận sau thuế', type: 'ratio', get: (r) => div(r.profit_after_tax, r.revenue_net), cost: true },
    { group: 'E. Dòng tiền (đối chiếu)' },
    { k: 'cash_in', label: 'Tiền thực thu', drill: 'cash_in' },
    { k: 'cash_out', label: 'Tiền thực chi', drill: 'cash_out' },
    { k: 'net_cash', label: 'Chênh lệch tiền', type: 'sub' },
  ].filter((r) => cost || !r.cost);
}
const valOf = (spec, r) => (spec.get ? spec.get(r) : r[spec.k]);

export function PnlReport({ onGo }) {
  const { settings, can, open } = useApp();
  const cost = can('xem_gia_von');
  const t = todayVN();
  const [preset, setPreset] = useState('6m');
  const [range, setRange] = useState(() => { const [from, to] = PRESETS[2][2](t); return { from, to }; });
  const [unit, setUnit] = useState('tr');
  const pick = (k) => { const [from, to] = PRESETS.find((p) => p[0] === k)[2](t); setPreset(k); setRange({ from, to }); };
  const setCustom = (r) => { setPreset('custom'); setRange(r); };

  const cur = useRpcData('rpt_monthly', range);
  const prev = useRpcData('rpt_monthly', { from: addMonths(range.from, -12), to: monthEnd(addMonths(range.to, -12)) });
  const exp = useRpcData('rpt_expenses', { ...range, by: 'month' }, cost);
  const pitRate = Number(settings.pit_rate || 0);
  const ready = cur.data && (!cost || exp.data);
  const model = ready ? buildModel(cur.data, exp.data, settings, pitRate) : null;
  const specs = model ? rowSpec(model.sellG, model.adminG, cost) : [];
  const T = model?.total;
  const prevSum = (k) => (prev.data ? prev.data.reduce((s, m) => s + n0(m[k]), 0) : null);

  const fmt = (v) => (v === null || v === undefined ? '—' : unit === 'tr' ? nfTr.format(v / 1e6) : money(v));
  const drill = (spec, r) => {
    if (!spec.drill) return;
    const isTotal = r.month === 'total';
    open('drill', { metric: spec.drill, label: `${spec.label.replace(/^[−+\d· ]+/, '')} · ${isTotal ? `${monthLabel(range.from)} – ${monthLabel(range.to)}` : monthLabel(r.month)}`,
      how: 'Các chứng từ tạo nên con số trong báo cáo P&L.', group: spec.expGroup, from: isTotal ? range.from : r.month, to: isTotal ? range.to : monthEnd(r.month) });
  };

  const doExport = () => exportXlsx(`bao-cao-PnL_${range.from.slice(0, 7)}_${range.to.slice(0, 7)}.xlsx`, [{
    name: 'P&L',
    rows: specs.map((s) => (s.group ? { label: s.group.toUpperCase() } : {
      label: s.label, ...Object.fromEntries(model.rows.map((m) => [m.month, valOf(s, m)])), total: valOf(s, T),
      share: s.type === 'ratio' ? null : div(valOf(s, T), T.revenue_net),
    })),
    columns: [{ key: 'label', label: 'Khoản mục (đồng)' }, ...model.rows.map((m) => ({ key: m.month, label: monthLabel(m.month) })), { key: 'total', label: 'Tổng kỳ' }, { key: 'share', label: '% DT thuần' }],
  }]);

  const doPrint = () => {
    document.body.classList.add('printing-report');
    const done = () => { document.body.classList.remove('printing-report'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <div className="stack pnl-page">
      <div className="row gap pnl-noprint" style={{ flexWrap: 'wrap' }}>
        <div className="seg">{PRESETS.map(([k, l]) => <button key={k} className={preset === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>)}</div>
        <label className="row gap-s small">Từ tháng <MonthInput value={range.from.slice(0, 7)} max={range.to.slice(0, 7)} onChange={(v) => v && setCustom({ ...range, from: v + '-01' })} aria-label="Từ tháng" /></label>
        <label className="row gap-s small">đến <MonthInput value={range.to.slice(0, 7)} min={range.from.slice(0, 7)} onChange={(v) => v && setCustom({ ...range, to: monthEnd(v + '-01') })} aria-label="Đến tháng" /></label>
        <span className="grow" />
        <Btn icon="print" onClick={doPrint} disabled={!model}>In / PDF</Btn>
        <Btn icon="dl" kind="primary" onClick={doExport} disabled={!model}>Xuất Excel</Btn>
      </div>

      <div className="pnl-intro">
        <div>
          <h2>Báo cáo P&L · Lãi lỗ theo tháng</h2>
          <p>Đi từ doanh thu → giá vốn → chi phí bán hàng → chi phí quản lý → lợi nhuận, kỳ {monthLabel(range.from)} – {monthLabel(range.to)}. Số liệu lấy thẳng từ đơn giao, trả hàng, phiếu chi phí và kiểm kho của sổ; bấm vào một con số để xem chứng từ.</p>
        </div>
        <span className="pnl-chip">Thuế GTGT {pct(settings.vat_rate || 0)} · TNCN {pct(pitRate)} là ước tính</span>
      </div>

      <ErrorBox error={cur.error || exp.error} />
      {!model && !cur.error && !exp.error && <Loading />}
      {model && <>
        {!cost && <Note tone="warn">Bạn chưa có quyền xem giá vốn nên báo cáo chỉ hiện doanh thu và dòng tiền; giá vốn, chi phí và lợi nhuận bị ẩn.</Note>}
        <div className="kpis pnl-kpis">
          <Kpi label="Doanh thu thuần" value={short(T.revenue_net)} sub={growthText(T.revenue_net, prevSum('revenue_net'))} tone={prevSum('revenue_net') ? (T.revenue_net >= prevSum('revenue_net') ? 'good' : 'bad') : ''}
            onClick={() => drill(specs.find((s) => s.k === 'revenue_net'), T)} />
          {cost ? <>
            <Kpi label="Lợi nhuận gộp" value={short(T.gross_profit)} sub={`Biên gộp ${pct(div(T.gross_profit, T.revenue_net))}`} onClick={() => drill(specs.find((s) => s.k === 'gross_profit'), T)} />
            <Kpi label="Chi phí hoạt động" value={short(T.opex)} sub={`Bán hàng ${short(T.selling)} · Quản lý ${short(T.admin)}`} onClick={() => drill(specs.find((s) => s.k === 'opex'), T)} />
            <Kpi label="LN trước thuế" value={short(T.profit)} sub={growthText(T.profit, prevSum('profit'))} bad={T.profit < 0} tone={prevSum('profit') ? (T.profit >= prevSum('profit') ? 'good' : 'bad') : ''} />
            <Kpi label="LN sau thuế (ước tính)" value={short(T.profit_after_tax)} sub={`Biên ${pct(div(T.profit_after_tax, T.revenue_net))} · thuế ${short(T.pit)}`} bad={T.profit_after_tax < 0} />
          </> : <Kpi label="Doanh thu (trước thuế GTGT)" value={short(T.revenue)} sub={`Trả lại ${short(T.revenue_returns)}`} />}
          <Kpi label="Chênh lệch tiền thu – chi" value={short(T.net_cash)} sub={`Thu ${short(T.cash_in)} · chi ${short(T.cash_out)}`} bad={T.net_cash < 0} />
        </div>

        {cost && <Insights model={model} />}

        {cost && <div className="pnl-grid">
          <Section title="Cầu lợi nhuận (waterfall)"><Waterfall T={T} /></Section>
          <Section title="Cấu trúc chi phí"><CostMix model={model} /></Section>
        </div>}

        <Section title="Xu hướng doanh thu và lợi nhuận theo tháng"><TrendChart rows={model.rows} cost={cost} /></Section>

        <Section title="Báo cáo P&L chi tiết theo tháng" actions={<div className="seg pnl-noprint">
          <button className={unit === 'tr' ? 'on' : ''} onClick={() => setUnit('tr')}>Triệu đồng</button><button className={unit === 'd' ? 'on' : ''} onClick={() => setUnit('d')}>Đồng</button></div>}>
          <div className="table-wrap pnl-table-wrap">
            <table className="tbl dense pnl-table">
              <thead><tr>
                <th>Khoản mục · đơn vị {unit === 'tr' ? 'triệu đồng' : 'đồng'}</th>
                {model.rows.map((m) => <th key={m.month} className="r"><button className="pnl-month-btn" title="Xem riêng tháng này" onClick={() => setCustom({ from: m.month, to: monthEnd(m.month) })}>{monthLabel(m.month)}</button></th>)}
                <th className="r pnl-tot">Tổng kỳ</th>{cost && <th className="r">% DT thuần</th>}
              </tr></thead>
              <tbody>{specs.map((s) => (s.group
                ? <tr key={s.group} className="pnl-grp"><td colSpan={model.rows.length + (cost ? 3 : 2)}>{s.group}</td></tr>
                : <tr key={s.k} className={s.type ? `pnl-${s.type}` : ''}>
                  <td>{s.label}</td>
                  {[...model.rows, T].map((r) => {
                    const v = valOf(s, r);
                    return <td key={r.month} className={`r num${r === T ? ' pnl-tot' : ''}${v < 0 ? ' bad' : ''}${s.drill && v ? ' click' : ''}`}
                      title={s.type === 'ratio' || v === null ? undefined : `${money(v)} đ`} onClick={s.drill && v ? () => drill(s, r) : undefined}>
                      {s.type === 'ratio' ? pct(v) : fmt(v)}</td>;
                  })}
                  {cost && <td className="r num muted">{s.type === 'ratio' ? '' : pct(div(valOf(s, T), T.revenue_net))}</td>}
                </tr>))}</tbody>
            </table>
          </div>
          <div className="muted small">Bấm tên tháng để xem riêng tháng đó; bấm vào số để mở chứng từ. Cột “Tổng kỳ” tính thuế TNCN trên tổng lợi nhuận cả kỳ nên có thể khác tổng thuế từng tháng.</div>
        </Section>

        <div className="pnl-guide">
          <b>Cách tính:</b> Doanh thu thuần = tiền hàng đã giao + phí vận chuyển thu khách − hàng trả lại − thuế GTGT ước tính. Lợi nhuận gộp = doanh thu thuần − giá vốn.
          Chi phí bán hàng gồm nhóm Marketing, Chi phí bán hàng và hao hụt kho; các nhóm chi phí còn lại (kể cả nhóm tự đặt và xuất dùng nội bộ) là chi phí quản lý & vận hành.
          Khoản chi phí phân bổ nhiều tháng (tiền nhà trả trước, công cụ dụng cụ…) chỉ tính phần của từng tháng. Lợi nhuận trước thuế = lợi nhuận gộp − chi phí bán hàng − chi phí quản lý.
          Dòng tiền là tiền thực thu, chi trong kỳ để đối chiếu, không tham gia tính lãi lỗ.
        </div>
        {cost && onGo && <div className="pnl-link pnl-noprint"><span>Muốn thử kịch bản: tăng quảng cáo, giảm tiền nhà, đổi hệ số giá… và xem điểm hòa vốn?</span><Btn onClick={() => onGo('be')}>Mở Hòa vốn & kịch bản giá →</Btn></div>}
      </>}
    </div>
  );
}

function Kpi({ label, value, sub, tone = '', bad, onClick }) {
  return (
    <div className={`kpi${bad ? ' alertk' : ''}`} onClick={onClick} style={onClick ? undefined : { cursor: 'default' }}>
      <span className="kpi-label">{label}</span><span className="kpi-value">{value}</span>{sub && <span className={`kpi-sub ${tone}`}>{sub}</span>}
    </div>
  );
}

function Insights({ model }) {
  const { rows, total: T, sellG, adminG } = model;
  const withRev = rows.filter((m) => m.revenue_net || m.profit);
  const best = withRev.length > 1 ? withRev.reduce((a, b) => (b.profit > a.profit ? b : a)) : null;
  const losses = rows.filter((m) => m.profit < 0);
  const topCost = [...sellG, ...adminG].map((g) => [g, T.g[g]]).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="pnl-insights">
      <div className="pnl-insight">Biên lợi nhuận gộp cả kỳ <b>{pct(div(T.gross_profit, T.revenue_net))}</b>, biên trước thuế <b>{pct(div(T.profit, T.revenue_net))}</b>.</div>
      {best && <div className="pnl-insight info">Tháng lãi cao nhất: <b>{monthLabel(best.month)}</b> với {short(best.profit)} trên doanh thu {short(best.revenue_net)}.</div>}
      {topCost && topCost[1] > 0 && <div className="pnl-insight info">Nhóm chi phí lớn nhất: <b>{topCost[0]}</b> {short(topCost[1])} ({pct(div(topCost[1], T.revenue_net))} doanh thu).</div>}
      {losses.length > 0 && <div className="pnl-insight warn">Có <b>{losses.length}</b> tháng lỗ: {losses.map((m) => monthLabel(m.month)).join(', ')}.</div>}
    </div>
  );
}

// Cầu lợi nhuận: các cột tổng đứng từ 0, các cột giảm treo từ mức trước xuống mức sau
function Waterfall({ T }) {
  const st = [
    ['Doanh thu', 'thuần', 0, T.revenue_net, 'var(--accent)', T.revenue_net],
    ['Giá vốn', '', T.revenue_net, T.gross_profit, 'var(--gold)', neg(T.cogs)],
    ['Lợi nhuận', 'gộp', 0, T.gross_profit, 'var(--celadon)', T.gross_profit],
    ['CP bán', 'hàng', T.gross_profit, T.gross_profit - T.selling, '#d9844f', neg(T.selling)],
    ['CP quản lý', '& vận hành', T.gross_profit - T.selling, T.profit, '#b9805c', neg(T.admin)],
    ['LN trước', 'thuế', 0, T.profit, T.profit < 0 ? 'var(--bad)' : 'var(--info)', T.profit],
    ['Thuế', 'TNCN', T.profit, T.profit_after_tax, '#8a96a8', neg(T.pit)],
    ['LN sau', 'thuế', 0, T.profit_after_tax, T.profit_after_tax < 0 ? 'var(--bad)' : 'var(--good)', T.profit_after_tax],
  ];
  const vals = st.flatMap((s) => [s[2], s[3]]);
  const hi = Math.max(1, ...vals); const lo = Math.min(0, ...vals);
  const W = 800; const H = 270; const top = 26; const bot = 44; const cw = W / st.length;
  const y = (v) => top + ((hi - v) / (hi - lo || 1)) * (H - top - bot);
  return (
    <div className="pnl-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="pnl-svg" style={{ minWidth: 560 }} role="img" aria-label="Cầu lợi nhuận từ doanh thu thuần đến lợi nhuận sau thuế">
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="4 4" />
        {st.map(([l1, l2, a, b, color, shown], i) => {
          const x = i * cw + cw * 0.17; const w = cw * 0.66; const yy = Math.min(y(a), y(b)); const h = Math.max(2, Math.abs(y(a) - y(b)));
          return (
            <g key={i}><title>{`${l1} ${l2}: ${money(shown)} đ`}</title>
              <rect x={x} y={yy} width={w} height={h} rx="4" fill={color} opacity=".9" />
              <text x={x + w / 2} y={Math.max(12, yy - 7)} textAnchor="middle" className="val">{short(shown)}</text>
              <text x={x + w / 2} y={H - 26} textAnchor="middle">{l1}</text>
              <text x={x + w / 2} y={H - 12} textAnchor="middle">{l2}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CostMix({ model }) {
  const { total: T, sellG, adminG } = model;
  const COLORS = ['var(--gold)', '#d9844f', '#7465d7', 'var(--info)', 'var(--celadon)', '#b9805c', '#8a96a8', 'var(--bad)', 'var(--accent)'];
  const items = [['Giá vốn', T.cogs], ...[...sellG, ...adminG].map((g) => [g, T.g[g]]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]), ['Thuế TNCN ước tính', T.pit]].filter((x) => x[1] > 0);
  const max = Math.max(1, ...items.map((x) => x[1]));
  if (!items.length) return <div className="muted small">Chưa có chi phí trong kỳ.</div>;
  return (
    <div className="pnl-cost">
      {items.map(([label, v], i) => (
        <div key={label} className="pnl-cost-row">
          <span title={label}>{label}</span>
          <span className="pnl-cost-track"><i style={{ width: `${Math.max(1, (v / max) * 100)}%`, background: COLORS[i % COLORS.length] }} /></span>
          <b>{short(v)}<small>{pct(div(v, T.revenue_net))}</small></b>
        </div>
      ))}
      <div className="muted small">Số % là tỷ lệ trên doanh thu thuần của kỳ.</div>
    </div>
  );
}

// Cột doanh thu thuần + đường lợi nhuận trước thuế từng tháng (trục có phần âm khi tháng lỗ)
function TrendChart({ rows, cost }) {
  if (!rows.length) return <div className="muted small">Không có tháng nào trong kỳ.</div>;
  const W = 1100; const H = 280; const L = 60; const R = 12; const top = 14; const bot = 30;
  const vals = rows.flatMap((m) => [n0(m.revenue_net), cost ? n0(m.profit) : 0]);
  const hi = Math.max(1e6, ...vals) * 1.1; const lo = Math.min(0, ...vals) * 1.1;
  const y = (v) => top + ((hi - v) / (hi - lo || 1)) * (H - top - bot);
  const step = (W - L - R) / rows.length; const bw = Math.min(42, step * 0.5);
  const cx = (i) => L + step * (i + 0.5);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  return (
    <div className="stack-s">
      <div className="pnl-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="pnl-svg" style={{ minWidth: 520 }} role="img" aria-label="Doanh thu thuần và lợi nhuận trước thuế theo tháng">
          {ticks.map((v, i) => <g key={i}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end">{short(v)}</text></g>)}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeOpacity=".5" />
          {rows.map((m, i) => (
            <g key={m.month}><title>{`${monthLabel(m.month)} · Doanh thu thuần ${money(m.revenue_net)} đ${cost ? ` · LN trước thuế ${money(m.profit)} đ` : ''}`}</title>
              <rect x={cx(i) - bw / 2} y={Math.min(y(0), y(n0(m.revenue_net)))} width={bw} height={Math.max(1, Math.abs(y(0) - y(n0(m.revenue_net))))} rx="3" fill="var(--accent)" opacity=".85" />
              <text x={cx(i)} y={H - 10} textAnchor="middle">{monthLabel(m.month)}</text>
            </g>
          ))}
          {cost && <>
            <polyline points={rows.map((m, i) => `${cx(i)},${y(n0(m.profit))}`).join(' ')} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinejoin="round" />
            {rows.map((m, i) => <circle key={m.month} cx={cx(i)} cy={y(n0(m.profit))} r="4" fill={m.profit < 0 ? 'var(--bad)' : 'var(--gold)'} stroke="var(--surface)" strokeWidth="1.5" />)}
          </>}
        </svg>
      </div>
      <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Doanh thu thuần (cột)</span>{cost && <span><i style={{ background: 'var(--gold)' }} />Lợi nhuận trước thuế (đường)</span>}</div>
    </div>
  );
}
