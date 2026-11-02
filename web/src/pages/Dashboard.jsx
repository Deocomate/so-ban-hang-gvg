// Các khối trang Tổng quan điều hành: thẻ chỉ số, việc cần xử lý, phễu bán hàng, biểu đồ, xếp hạng, cơ cấu chi phí.
import React from 'react';
import { useApp, useRpcData } from '../lib/store.jsx';
import { money, short, qty as fq, pct } from '../lib/format.js';
import { Icon, Loading, ErrorBox, Section } from '../components/ui.jsx';

const Trend = ({ v }) => (v === null || v === undefined ? <span className="muted">chưa có kỳ trước để so</span> : <span className={v >= 0 ? 'good' : 'bad'}>{v >= 0 ? '▲' : '▼'} {pct(Math.abs(v))} so với kỳ trước</span>);

function Stat({ label, value, sub, bar }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span><span className="kpi-value">{value === null || value === undefined ? '—' : `${money(value)} đ`}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
      {bar !== undefined && <div className="prog"><i style={{ width: `${Math.min(100, bar)}%`, background: 'var(--accent)' }} /></div>}
    </div>
  );
}

function LineChart({ daily, target, from, to }) {
  const days = []; for (let t = Date.parse(from); t <= Date.parse(to); t += 86400e3) days.push(new Date(t).toISOString().slice(0, 10));
  const map = Object.fromEntries(daily.map((d) => [d.day, d.revenue]));
  const dailyTarget = days.length ? target / days.length : 0;
  let run = 0;
  const pts = days.map((d, i) => { run += map[d] || 0; return { d, v: run, t: dailyTarget * (i + 1) }; });
  const max = Math.max(1, ...pts.map((p) => Math.max(p.v, p.t)));
  const W = 640; const H = 180; const x = (i) => (pts.length > 1 ? (i / (pts.length - 1)) * W : 0); const y = (v) => H - (v / max) * (H - 8);
  const line = (k) => pts.map((p, i) => `${x(i)},${y(p[k])}`).join(' ');
  return (
    <div className="stack-s">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Doanh thu cộng dồn so với mục tiêu">
        <polygon points={`0,${H} ${line('v')} ${W},${H}`} fill="var(--accent-2)" />
        {target > 0 && <polyline points={line('t')} fill="none" stroke="var(--muted)" strokeDasharray="6 5" strokeWidth="1.5" />}
        <polyline points={line('v')} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      </svg>
      <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Doanh thu cộng dồn {short(run)}</span>{target > 0 && <span><i style={{ background: 'var(--muted)' }} />Mục tiêu {short(target)}</span>}</div>
    </div>
  );
}

const STAGES = [['moi', '1. Khách mới', 'Khách tạo trong kỳ'], ['tu_van', '2. Đã tư vấn', 'Đã liên hệ, tư vấn'], ['bao_gia', '3. Đã báo giá', 'Đã gửi báo giá'], ['coc', '4. Đã cọc', 'Đơn đã nhận tiền'], ['chot', '5. Đã chốt đơn', 'Đơn đã xác nhận']];
function Funnel({ f }) {
  const top = Math.max(1, ...STAGES.map(([k]) => f[k]));
  return (
    <div className="funnel">{STAGES.map(([k, label, sub], i) => (
      <div className="funnel-row" key={k}>
        <div className="funnel-bar" style={{ width: `${Math.max(34, 100 - i * 13)}%`, opacity: 1 - i * 0.09 }}><b>{label}</b><span className="small">{sub}</span></div>
        <div className="funnel-num"><b>{fq(f[k])}</b>{f[`${k}_value`] > 0 && <span className="small muted">{short(f[`${k}_value`])}</span>}</div>
        <span className="funnel-pct muted small">{Math.round((f[k] / top) * 100)}%</span>
      </div>
    ))}</div>
  );
}

const PIE = ['var(--accent)', 'var(--celadon)', '#c9892b', '#8a6fbf', '#c0574a', '#5b8fb9', '#7a8a55', '#a07a5a'];
function Donut({ rows }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (!total) return <div className="muted small">Chưa có chi phí trong kỳ</div>;
  let acc = 0;
  const stops = rows.map((r, i) => { const a = acc; acc += (r.amount / total) * 100; return `${PIE[i % PIE.length]} ${a}% ${acc}%`; }).join(', ');
  return (
    <div className="row gap-l" style={{ alignItems: 'center' }}>
      <div className="donut" style={{ background: `conic-gradient(${stops})` }}><div><span className="small muted">Tổng chi phí</span><b>{short(total)}</b></div></div>
      <div className="stack-s grow">{rows.map((r, i) => <div className="row gap-s small" key={r.label}><i className="dot" style={{ background: PIE[i % PIE.length] }} /><span className="grow">{r.label}</span><b className="num">{short(r.amount)}</b><span className="muted">{Math.round((r.amount / total) * 100)}%</span></div>)}</div>
    </div>
  );
}

function CashBars({ rows }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.cash_in, r.cash_out]));
  if (!rows.length) return <div className="muted small">Chưa có thu chi trong kỳ</div>;
  return (
    <div className="stack-s">
      <div className="cash-bars" role="img" aria-label="Tiền vào và tiền ra theo ngày">{rows.map((r) => (
        <div key={r.day} title={`${r.day}: vào ${money(r.cash_in)}, ra ${money(r.cash_out)}`}><i style={{ height: `${(r.cash_in / max) * 100}%`, background: 'var(--good)' }} /><i style={{ height: `${(r.cash_out / max) * 100}%`, background: 'var(--bad)' }} /></div>
      ))}</div>
      <div className="legend"><span><i style={{ background: 'var(--good)' }} />Tiền vào</span><span><i style={{ background: 'var(--bad)' }} />Tiền ra</span></div>
    </div>
  );
}

export function DashboardBlocks({ period, go }) {
  const { open } = useApp();
  const { data: d, error } = useRpcData('rpt_dashboard', { from: period.from, to: period.to });
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const safe = d.break_even !== null && d.revenue > 0 ? (d.revenue - d.break_even) / d.break_even : null;
  const todos = [
    ['Báo giá cần chăm sóc lại', 'Đã gửi khách hơn 3 ngày chưa chốt', d.todo.quotes_followup, 'bad', () => go('bao-gia')],
    ['Khách hàng nợ quá hạn', `Tổng ${money(d.todo.overdue_amount)} đ`, d.todo.overdue_customers, 'bad', () => go('khach-hang')],
    ['Đơn hàng sắp giao', 'Trong 3 ngày tới hoặc đã trễ', d.todo.orders_due, 'warn', () => go('dat-rieng')],
    ['Hợp đồng chưa nhận đủ cọc', 'Đã ký, chưa đủ số đề nghị tạm ứng', d.todo.contracts_short, 'warn', () => go('hop-dong')],
  ];
  const topMax = Math.max(1, ...d.top_customers.map((c) => c.revenue));
  return (
    <div className="stack-l">
      <div className="kpis kpis-4">
        <Stat label="Doanh thu / Mục tiêu" value={d.revenue} sub={<><Trend v={d.growth_revenue} />{d.target > 0 && <div>Đạt {Math.round((d.revenue / d.target) * 100)}% mục tiêu {short(d.target)}</div>}</>} bar={d.target > 0 ? (d.revenue / d.target) * 100 : undefined} />
        <Stat label="Lợi nhuận sau chi phí" value={d.profit} sub={d.can_cost ? <Trend v={d.growth_profit} /> : 'Cần quyền xem giá vốn'} />
        <Stat label="Tiền thực thu" value={d.cash_in} sub={<Trend v={d.growth_cash} />} />
        <Stat label="Điểm hòa vốn" value={d.break_even} sub={d.break_even === null ? 'Cần có doanh thu và quyền xem giá vốn' : safe >= 0 ? <span className="good">An toàn +{Math.round(safe * 100)}%</span> : <span className="bad">Còn thiếu {money(d.break_even - d.revenue)} đ</span>} />
      </div>
      <div className="grid-2">
        <Section title="Việc cần xử lý ngay">
          <div className="todo-list">{todos.map(([t, s, n, tone, on]) => (
            <button key={t} className="todo-item" onClick={on}><Icon name="alert" size={18} className={tone} /><span className="grow"><b>{t}</b><span className="small muted">{s}</span></span><span className={`todo-n ${n ? tone : ''}`}>{n}</span><Icon name="chev" size={14} /></button>
          ))}</div>
        </Section>
        <Section title="Phễu bán hàng"><Funnel f={d.funnel} /></Section>
      </div>
      <div className="grid-2">
        <Section title="Doanh thu thực tế và mục tiêu"><LineChart daily={d.daily} target={d.target} from={d.from} to={d.to} /></Section>
        <Section title="Top sản phẩm bán chạy">
          {d.top_products.length === 0 ? <div className="muted small">Chưa có doanh thu trong kỳ</div> : <div className="top-prods">{d.top_products.map((p) => (
            <button key={p.id} onClick={() => open('stockcard', { product_id: p.id })}><b>{short(p.revenue)}</b><div className="tp-bar" style={{ height: `${(p.revenue / d.top_products[0].revenue) * 90}px` }} />
              {p.image_url ? <img src={p.image_url} alt="" /> : <span className="thumb"><Icon name="vase" size={18} /></span>}<span className="small">{p.name}</span></button>
          ))}</div>}
        </Section>
      </div>
      <div className="grid-3">
        <Section title="Top khách hàng">
          <div className="stack-s">{d.top_customers.length === 0 && <div className="muted small">Chưa có doanh thu trong kỳ</div>}{d.top_customers.map((c, i) => (
            <button className="top-cust" key={c.id} onClick={() => open('party-detail', { type: 'kh', id: c.id })}><span className="muted">{i + 1}</span><span className="grow"><span>{c.name}</span><div className="prog"><i style={{ width: `${(c.revenue / topMax) * 100}%`, background: 'var(--accent)' }} /></div></span><b className="num">{short(c.revenue)}</b></button>
          ))}</div>
        </Section>
        <Section title="Cơ cấu chi phí">{d.can_cost ? <Donut rows={d.costs} /> : <div className="muted small">Cần quyền xem giá vốn</div>}</Section>
        <Section title="Tiền vào / Tiền ra"><CashBars rows={d.cash} /></Section>
      </div>
      <Section title="Vận hành & tồn kho">
        <div className="kpis kpis-4">
          <div className="kpi"><span className="kpi-label">Tồn kho</span><span className="kpi-value">{fq(d.ops.stock_items)} mã</span><span className="kpi-sub">{d.stock_value !== null ? `Trị giá ${short(d.stock_value)}` : ''}</span></div>
          <div className="kpi"><span className="kpi-label">Đơn chờ giao</span><span className="kpi-value">{fq(d.ops.open_orders)} đơn</span><span className="kpi-sub">Trị giá {short(d.ops.open_value)}</span></div>
          <div className="kpi"><span className="kpi-label">Công nợ phải thu</span><span className="kpi-value">{short(d.ops.receivable)}</span><span className="kpi-sub">{d.ops.receivable_count} khách hàng</span></div>
          <div className="kpi"><span className="kpi-label">Nợ nhà cung cấp</span><span className="kpi-value">{short(d.ops.payable)}</span><span className="kpi-sub">{d.ops.payable_count} nhà cung cấp · lái xe {short(d.ops.driver_payable)}</span></div>
        </div>
      </Section>
    </div>
  );
}
