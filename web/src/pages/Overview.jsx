import React from 'react';
import { useApp, useRpcData, useQ } from '../lib/store.jsx';
import { money, moneyD, short, pct, dmy, addMonths, monthStart, monthLabel, todayVN, monthEnd } from '../lib/format.js';
import { Icon, Loading, ErrorBox, Note, Section, Table, Pill, Btn } from '../components/ui.jsx';
import { PeriodPicker, usePeriod } from '../components/Period.jsx';

export const METRICS = {
  revenue: { label: 'Doanh thu', how: 'Tiền hàng ĐÃ GIAO cho khách trong kỳ (theo giá bán sau chiết khấu, đã gồm thuế) + phí vận chuyển thu của khách − hàng khách trả lại. Tiền cọc và đơn chưa giao KHÔNG tính.' },
  revenue_net: { label: 'Doanh thu thuần', how: 'Doanh thu − thuế GTGT ước tính (tỷ lệ % trên doanh thu đặt trong Cài đặt).' },
  vat: { label: 'Thuế GTGT ước tính', how: 'Doanh thu × tỷ lệ thuế GTGT trong Cài đặt. Số ước tính để quản trị, không thay tờ khai.' },
  cash_in: { label: 'Tiền thực thu', how: 'Tổng tiền thật sự vào quỹ trong kỳ: thu khách (đã trừ phí sàn), thu khác, góp vốn. Chuyển tiền giữa các quỹ không tính.' },
  cash_out: { label: 'Tiền thực chi', how: 'Tổng tiền thật sự ra khỏi quỹ trong kỳ: trả nhà cung cấp, chi phí, hoàn tiền khách, chi khác, rút vốn.' },
  cogs: { label: 'Giá vốn hàng bán', how: 'Giá vốn của chính số hàng đã giao trong kỳ (bình quân gia quyền tại lúc giao, được lưu cố định) − giá vốn hàng khách trả lại.' },
  gross_profit: { label: 'Lợi nhuận gộp', how: 'Doanh thu thuần − giá vốn hàng bán.' },
  opex: { label: 'Chi phí vận hành', how: 'Chi phí ghi nhận trong kỳ theo 7 nhóm (mặt bằng, điện nước, công cụ dụng cụ, marketing, chi phí bán hàng, nhân sự, quản lý & khác) + hao hụt kho (vỡ, lỗi, thất thoát). Tính theo ngày phát sinh, không theo ngày trả tiền; khoản phân bổ dần (kệ, camera, tiền nhà trả trước…) chỉ tính phần của tháng đó. Tiền nhập hàng KHÔNG nằm ở đây (nằm trong tồn kho, thành giá vốn khi bán).' },
  profit: { label: 'Lợi nhuận sau chi phí', how: 'Lợi nhuận gộp − chi phí vận hành. Lợi nhuận quản trị, trước thuế thu nhập cá nhân.' },
  receivable: { label: 'Khách còn nợ', how: 'Tổng số tiền khách còn nợ tại ngày cuối kỳ = nợ đầu kỳ + hàng đã giao − hàng trả lại − tiền khách đã trả. Khách trả dư/đặt cọc được tách riêng.' },
  customer_prepaid: { label: 'Khách đã trả trước', how: 'Tiền cọc / tiền khách trả vượt giá trị hàng đã giao, tại ngày cuối kỳ. Đây là khoản mình đang giữ của khách, chưa phải doanh thu.' },
  payable: { label: 'Nợ nhà cung cấp', how: 'Tổng mình còn nợ NCC tại ngày cuối kỳ = nợ đầu kỳ + hàng đã nhận + chi phí ghi nợ − hàng trả NCC − tiền đã trả.' },
  supplier_prepaid: { label: 'Đã trả trước cho NCC', how: 'Tiền cọc / tiền đã trả NCC vượt giá trị hàng đã nhận.' },
  inventory_value: { label: 'Giá trị tồn kho', how: 'Tổng (số lượng tồn × giá vốn bình quân) tại ngày cuối kỳ, tính từ sổ kho.', metric: 'inventory' },
  open_orders: { label: 'Đơn đang chờ giao', how: 'Đơn đã xác nhận còn hàng chưa giao. Giá trị = phần tiền hàng còn phải giao.' },
  late_orders: { label: 'Đơn trễ hẹn giao', how: 'Đơn đã quá ngày hẹn giao mà chưa giao đủ.' },
  overdue_receivable: { label: 'Nợ quá hạn', how: 'Phần khách còn nợ đã quá hạn thanh toán (ngày giao gần nhất + số ngày được nợ của khách; nợ đầu kỳ theo hạn đã nhập). Tính tại hôm nay.' },
  overdue_payable: { label: 'Nợ NCC quá hạn', how: 'Phần mình còn nợ NCC đã quá hạn (ngày nhận gần nhất + số ngày được nợ).' },
  low_stock: { label: 'Sắp hết hàng', how: 'Sản phẩm có số lượng còn có thể bán ≤ mức tồn tối thiểu.' },
  open_pos: { label: 'Đơn nhập chờ hàng', how: 'Đơn đặt NCC / đặt xưởng đã xác nhận, chưa nhận đủ hàng.' },
  late_pos: { label: 'Đơn nhập trễ hẹn', how: 'Đơn nhập đã quá ngày hẹn nhận mà chưa nhận đủ.' },
  special_open: { label: 'Đơn đặt riêng đang làm', how: 'Đơn đặt hàng riêng đã xác nhận, chưa giao đủ.' },
  stock_loss: { label: 'Hao hụt kho', how: 'Giá vốn hàng vỡ, lỗi, thất thoát, hàng khách trả bị lỗi không nhập lại.' },
  expenses: { label: 'Chi phí', how: 'Các khoản chi phí ghi nhận trong kỳ (không gồm hao hụt kho).' },
};

function Kpi({ k, data, sub, tone, onOpen, money: m = true }) {
  const v = data?.[k];
  const def = METRICS[k];
  return (
    <button className={`kpi ${tone || ''}`} onClick={() => onOpen(k)} title={def.how}>
      <span className="kpi-label">{def.label}<span className="kpi-info"><Icon name="info" size={14} /></span></span>
      <span className="kpi-value">{v === null || v === undefined ? <span className="muted" title="Cần quyền xem giá vốn">—</span> : m ? short(v) : v}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </button>
  );
}

function MonthBars({ rows }) {
  if (!rows) return <Loading />;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.revenue_net || 0, Math.abs(r.profit || 0))));
  return (
    <div className="stack">
      <div className="legend"><span><i style={{ background: 'var(--accent)' }} />Doanh thu thuần</span><span><i style={{ background: 'var(--celadon)' }} />Lợi nhuận sau chi phí</span></div>
      <div className="bars" role="img" aria-label="Doanh thu và lợi nhuận 6 tháng gần nhất">
        {rows.map((r) => (
          <div className="bars-col" key={r.month} title={`${monthLabel(r.month)}: doanh thu thuần ${money(r.revenue_net)} đ, lợi nhuận ${r.profit === null ? '—' : money(r.profit) + ' đ'}`}>
            <div className="bars-pair">
              <div className="bar rev" style={{ height: `${(Math.max(r.revenue_net, 0) / max) * 100}%` }} />
              {r.profit !== null && <div className={`bar ${r.profit < 0 ? 'neg' : 'pro'}`} style={{ height: `${(Math.abs(r.profit) / max) * 100}%` }} />}
            </div>
            <span className="bars-lbl">{monthLabel(r.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Overview({ go }) {
  const { open, can, book } = useApp();
  const [period, setPeriod] = usePeriod('30d');
  const { data, error } = useRpcData('rpt_overview', { from: period.from, to: period.to });
  const t = todayVN();
  const months = useRpcData('rpt_monthly', { from: addMonths(t, -5), to: monthEnd(t) });
  const late = useQ('sales_orders', [['is_late', 'eq', 'true']], 'due_date', 20);
  const overdue = useQ('customers', [['overdue', 'gt', 0]], 'overdue desc', 20);
  const low = useQ('products', [['is_low', 'eq', 'true']], 'available', 20);
  const latePo = useQ('purchase_orders', [['is_late', 'eq', 'true']], 'expected_date', 20, can('nhap_hang'));
  const shipProb = useQ('shipments', [['status', 'in', ['giao_that_bai', 'dang_hoan', 'su_co']]], 'status_at', 20);
  const bankWait = useQ('bank_txns', [['status', 'eq', 'cho_xu_ly'], ['direction', 'eq', 'in']], 'txn_at desc', 20, can('thu_chi'));
  const drill = (k) => open('drill', { metric: METRICS[k].metric || k, label: METRICS[k].label, how: METRICS[k].how, from: period.from, to: period.to });
  const cost = data?.can_cost;
  return (
    <>
      <div className="page-head">
        <div className="grow"><h1 className="page-title">Tổng quan</h1><div className="page-sub">{book.name} · kỳ {dmy(period.from)} – {dmy(period.to)}</div></div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <>
          {!cost && <Note>Bạn chưa được cấp quyền xem giá vốn và lợi nhuận — các ô này để trống.</Note>}
          <div className="kpis kpis-3">
            <Kpi k="revenue" data={data} onOpen={drill} tone="key" sub={`Thuần: ${short(data.revenue_net)} · thuế ước tính ${short(data.vat)}`} />
            <Kpi k="cash_in" data={data} onOpen={drill} sub={`Chi ra: ${short(data.cash_out)} · dòng tiền thuần ${short(data.net_cash)}`} />
            <Kpi k="cogs" data={data} onOpen={drill} />
            <Kpi k="gross_profit" data={data} onOpen={drill} sub={data.gross_margin !== null && data.gross_margin !== undefined ? `Tỷ suất ${pct(data.gross_margin)}` : null} />
            <Kpi k="opex" data={data} onOpen={drill} sub={cost ? `Gồm hao hụt kho ${short(data.stock_loss)}` : null} />
            <Kpi k="profit" data={data} onOpen={drill} tone={data.profit < 0 ? 'alertk' : 'key'} />
          </div>
          <div className="kpis kpis-4">
            <Kpi k="receivable" data={data} onOpen={drill} sub={`Quá hạn ${short(data.overdue_receivable)} · trả trước ${short(data.customer_prepaid)}`} tone={data.overdue_receivable > 0 ? 'alertk' : ''} />
            <Kpi k="payable" data={data} onOpen={drill} sub={`Quá hạn ${short(data.overdue_payable)} · đã cọc ${short(data.supplier_prepaid)}`} />
            <Kpi k="inventory_value" data={data} onOpen={drill} sub={`${money(data.inventory_qty)} đơn vị hàng · ${data.low_stock} mã sắp hết`} />
            <Kpi k="open_orders" data={data} onOpen={drill} money={false} sub={`Trị giá ${short(data.open_orders_value)} · ${data.late_orders} đơn trễ hẹn`} tone={data.late_orders > 0 ? 'alertk' : ''} />
          </div>
          <div className="grid-2">
            <Section title="Kết quả kinh doanh" actions={<span className="muted small">bấm từng dòng để xem chi tiết</span>}>
              <div className="pl">
                <PLRow label="Doanh thu bán hàng (đã giao)" v={data.revenue_goods} onClick={() => drill('revenue')} />
                <PLRow sub label="+ Phí vận chuyển thu khách" v={data.revenue_shipping} />
                <PLRow sub label="− Hàng khách trả lại" v={-data.revenue_returns} />
                <PLRow t label="Doanh thu" v={data.revenue} onClick={() => drill('revenue')} />
                <PLRow sub label={`− Thuế GTGT ước tính (${pct(data.vat_rate)})`} v={-data.vat} />
                <PLRow t label="Doanh thu thuần" v={data.revenue_net} />
                <PLRow sub label="− Giá vốn hàng bán" v={cost ? -data.cogs : null} onClick={cost ? () => drill('cogs') : null} />
                <PLRow t label="Lợi nhuận gộp" v={data.gross_profit} />
                <PLRow sub label="− Chi phí" v={cost ? -data.expenses : null} onClick={cost ? () => drill('opex') : null} />
                <PLRow sub label="− Hao hụt kho" v={cost ? -data.stock_loss : null} />
                <PLRow t label="Lợi nhuận sau chi phí" v={data.profit} />
                <PLRow sub label={`Thuế TNCN ước tính (${pct(data.pit_rate)} × lợi nhuận)`} v={cost ? -data.pit : null} />
                <PLRow t label="Lợi nhuận sau thuế (ước tính)" v={data.profit_after_tax} />
              </div>
            </Section>
            <Section title="Doanh thu & lợi nhuận 6 tháng" actions={can('xem_bao_cao') && <Btn small onClick={() => go('bao-cao')}>Báo cáo chi tiết</Btn>}>
              <MonthBars rows={months.data} />
              <div className="pl">
                <PLRow label="Tiền thực thu" v={data.cash_in} onClick={() => drill('cash_in')} />
                <PLRow sub label="trong đó thu từ khách" v={data.cash_in_customers} />
                <PLRow label="Tiền thực chi" v={-data.cash_out} onClick={() => drill('cash_out')} />
                <PLRow t label="Dòng tiền thuần" v={data.net_cash} />
                <PLRow label="Tồn quỹ cuối kỳ (mọi quỹ)" v={data.fund_balance} />
              </div>
            </Section>
          </div>
          <Section title="Cần xử lý">
            <div className="grid-2">
              <TodoList title="Đơn trễ hẹn giao" q={late} empty="Không có đơn trễ hẹn" render={(r) => <><span className="cell-main">{r.code} · {r.customer_name}</span><span className="cell-sub">Hẹn {dmy(r.due_date)} · {r.progress}</span></>} right={(r) => <Pill tone="bad">trễ {-r.days_to_due} ngày</Pill>} onRow={(r) => open('order', { id: r.id })} />
              <TodoList title="Khách nợ quá hạn" q={overdue} empty="Không có nợ quá hạn" render={(r) => <><span className="cell-main">{r.name}</span><span className="cell-sub">Còn nợ {moneyD(r.receivable)}</span></>} right={(r) => <span className="bad strong num">{money(r.overdue)}</span>} onRow={(r) => open('party-detail', { type: 'kh', id: r.id })} />
              <TodoList title="Sắp hết hàng" q={low} empty="Không có mã nào dưới mức tối thiểu" render={(r) => <><span className="cell-main">{r.sku} · {r.name}</span><span className="cell-sub">Tối thiểu {r.low_stock} · đang về {r.incoming}</span></>} right={(r) => <Pill tone={r.available <= 0 ? 'bad' : 'warn'}>còn bán {r.available} {r.unit}</Pill>} onRow={(r) => open('stockcard', { product_id: r.id })} />
              {can('nhap_hang') && <TodoList title="Hàng đặt xưởng / NCC trễ hẹn" q={latePo} empty="Không có đơn nhập trễ" render={(r) => <><span className="cell-main">{r.code} · {r.supplier_name}</span><span className="cell-sub">Hẹn {dmy(r.expected_date)} · {r.progress}</span></>} right={() => <Pill tone="bad">trễ</Pill>} onRow={(r) => open('po', { id: r.id })} />}
              <TodoList title="Vận đơn có vấn đề" q={shipProb} empty="Không có vận đơn giao thất bại / hoàn hàng" render={(r) => <><span className="cell-main">{r.carrier === 'BEST' ? 'BEST' : r.carrier === 'SPX' ? 'SPX' : ''} {r.tracking_no} · {r.customer_name}</span><span className="cell-sub">Đơn {r.order_code} · {dmy(r.status_at)}{r.status_detail ? ' · ' + r.status_detail : ''}</span></>} right={(r) => <Pill tone={r.status === 'giao_that_bai' ? 'warn' : 'bad'}>{r.status_label}</Pill>} onRow={(r) => open('ship', { id: r.id })} />
              {can('thu_chi') && <TodoList title="Tiền về chưa khớp đơn" q={bankWait} empty="Không có khoản nào chờ xử lý" render={(r) => <><span className="cell-main">{r.counter_name || 'Chuyển khoản'} · {dmy(r.txn_at)}</span><span className="cell-sub">{r.content}</span></>} right={(r) => <span className="good strong num">+{money(r.amount)}</span>} onRow={() => go('tien-ve')} />}
            </div>
          </Section>
        </>
      )}
    </>
  );
}

function PLRow({ label, v, t, sub, onClick }) {
  const cls = t ? 't' : sub ? 'sub' : '';
  return (
    <>
      <div className={cls} onClick={onClick} style={onClick ? { cursor: 'pointer' } : null}>{label}{onClick && <Icon name="chev" size={13} className="muted" />}</div>
      <div className={`${cls} r ${v < 0 && t ? 'bad' : ''}`}>{v === null || v === undefined ? '—' : money(v)}</div>
    </>
  );
}

function TodoList({ title, q, render, right, onRow, empty }) {
  return (
    <div className="stack">
      <div className="strong">{title} {q.data && <span className="muted">({q.data.length})</span>}</div>
      {!q.data ? <Loading /> : q.data.length === 0 ? <div className="muted small">{empty}</div> : (
        <div className="table-wrap"><table className="tbl dense"><tbody>
          {q.data.map((r) => <tr key={r.id} className="clickable" onClick={() => onRow(r)}><td><div className="stack" style={{ gap: 0 }}>{render(r)}</div></td><td className="r">{right(r)}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}
