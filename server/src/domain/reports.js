// Báo cáo: lãi lỗ theo kỳ, tổng quan, chi tiết từng con số, theo tháng / sản phẩm / nhóm, nhập-xuất-tồn, chi phí.
import { fail, one, all, oneN, allN, rnd, today, asDate, addMonths, monthStart, addDays, outRows } from '../lib/context.js';
import { requirePerm, can, bookSettings } from './access.js';
import { permLabel } from '../lib/labels.js';

// Số dư công nợ từng khách / NCC tại một ngày (+ họ nợ mình / mình nợ NCC ; − đã trả trước)
export const custBalances = (b, d) => allN(`select pid as party_id, sum(amt) as balance from (
    select party_id as pid, amount as amt from opening_debts where book_id = @b and party_type = 'kh' and debt_date <= @d
    union all
    select o.customer_id, x.revenue from delivery_lines x join deliveries d on d.id = x.delivery_id join sales_orders o on o.id = d.order_id
      where d.book_id = @b and d.delivery_date <= @d
    union all
    select o.customer_id, d.shipping_fee from deliveries d join sales_orders o on o.id = d.order_id where d.book_id = @b and d.delivery_date <= @d
    union all
    select o.customer_id, -x.revenue from sales_return_lines x join sales_returns r on r.id = x.return_id join sales_orders o on o.id = r.order_id
      where r.book_id = @b and r.return_date <= @d
    union all
    select party_id, -debt_amount from v_pay_signed where book_id = @b and party_type = 'kh' and pay_date <= @d
  ) group by pid`, { b, d });

export const suppBalances = (b, d) => allN(`select pid as party_id, sum(amt) as balance from (
    select party_id as pid, amount as amt from opening_debts where book_id = @b and party_type = 'ncc' and debt_date <= @d
    union all
    select po.supplier_id, x.value from goods_receipt_lines x join goods_receipts g on g.id = x.receipt_id join purchase_orders po on po.id = g.po_id
      where g.book_id = @b and g.receipt_date <= @d
    union all
    select po.supplier_id, -x.value from supplier_return_lines x join supplier_returns r on r.id = x.return_id join purchase_orders po on po.id = r.po_id
      where r.book_id = @b and r.return_date <= @d
    union all
    select supplier_id, amount from expenses where book_id = @b and supplier_id is not null and voided = 0 and exp_date <= @d
    union all
    select party_id, -debt_amount from v_pay_signed where book_id = @b and party_type = 'ncc' and pay_date <= @d
  ) group by pid`, { b, d });

const rates = (b) => { const s = bookSettings(b); return { vat: Number(s.vat_rate ?? 0) || 0, pit: Number(s.pit_rate ?? 0) || 0 }; };

// Kết quả kinh doanh trong khoảng ngày (cách tính dùng chung cho Tổng quan, báo cáo tháng, báo cáo ngày)
export function calcPl(b, d1, d2) {
  const { vat: vatRate, pit: pitRate } = rates(b);
  const o = { b, d1, d2 };
  const del = oneN(`select coalesce(sum(x.revenue), 0) as rg, coalesce(sum(x.cogs), 0) as cg from delivery_lines x join deliveries d on d.id = x.delivery_id
    where d.book_id = @b and d.delivery_date between @d1 and @d2`, o);
  const rs = oneN(`select coalesce(sum(shipping_fee), 0) as v from deliveries where book_id = @b and delivery_date between @d1 and @d2`, o).v;
  const ret = oneN(`select coalesce(sum(x.revenue), 0) as rr, coalesce(sum(x.cogs), 0) as cg from sales_return_lines x join sales_returns r on r.id = x.return_id
    where r.book_id = @b and r.return_date between @d1 and @d2`, o);
  const cgx = oneN(`select coalesce(-sum(value), 0) as v from stock_moves where book_id = @b and doc_type = 'chenh_lech' and move_date between @d1 and @d2`, o).v;
  // Chi phí theo kỳ: khoản phân bổ dần (công cụ dụng cụ, tiền nhà trả trước…) chỉ tính phần của từng tháng
  const ex = oneN(`select coalesce(sum(amount), 0) as v from v_expense_alloc where book_id = @b and alloc_date between @d1 and @d2`, o).v;
  const loss = oneN(`select coalesce(-sum(l.value), 0) as v from stock_adjustment_lines l join stock_adjustments a on a.id = l.adjustment_id
    where a.book_id = @b and a.reason <> 'dau_ky' and a.adj_date between @d1 and @d2`, o).v;
  const cin = oneN(`select coalesce(sum(amount - fee), 0) as ci, coalesce(sum(amount - fee) filter (where kind = 'thu_khach'), 0) as cic
    from payments where book_id = @b and voided = 0 and direction = 'thu' and pay_date between @d1 and @d2`, o);
  const co = oneN(`select coalesce(sum(amount), 0) as v from payments where book_id = @b and voided = 0 and direction = 'chi' and pay_date between @d1 and @d2`, o).v;
  const rev = del.rg + rs - ret.rr;
  const vat = rnd(rev * vatRate);
  const cg = del.cg - ret.cg + cgx;
  const gp = rev - vat - cg;
  const pf = gp - ex - loss;
  const pit = rnd(Math.max(pf, 0) * pitRate);
  return {
    revenue_goods: del.rg, revenue_shipping: rs, revenue_returns: ret.rr, revenue: rev, vat, vat_rate: vatRate,
    revenue_net: rev - vat, cogs: cg, gross_profit: gp, gross_margin: rev - vat !== 0 ? rnd(gp / (rev - vat), 4) : null,
    expenses: ex, stock_loss: loss, opex: ex + loss, profit: pf, pit_rate: pitRate, pit, profit_after_tax: pf - pit,
    cash_in: cin.ci, cash_in_customers: cin.cic, cash_out: co, net_cash: cin.ci - co,
  };
}

const COST_KEYS = ['cogs', 'gross_profit', 'gross_margin', 'stock_loss', 'opex', 'profit', 'pit', 'profit_after_tax', 'inventory_value', 'expenses'];
export function mask(b, r) {
  if (can(b, 'xem_gia_von')) return r;
  for (const k of COST_KEYS) if (k in r) r[k] = null;
  return r;
}
const needCost = (b) => { if (!can(b, 'xem_gia_von')) fail(`Bạn chưa được cấp quyền: ${permLabel('xem_gia_von')}`, 403); };
const period = (p) => ({ b: p.book_id, d1: asDate(p.from), d2: asDate(p.to) });

export function rpt_overview(p) {
  const { b, d1, d2 } = period(p);
  requirePerm(b, 'xem_bao_cao');
  const cb = custBalances(b, d2); const sb = suppBalances(b, d2);
  const pos = (rows) => rows.reduce((s, x) => s + (x.balance > 0 ? x.balance : 0), 0);
  const neg = (rows) => rows.reduce((s, x) => s + (x.balance < 0 ? -x.balance : 0), 0);
  const o = { b, d2 };
  const so = oneN(`select count(*) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_orders,
      coalesce(sum(order_total - delivered_value - returned_value) filter (where status = 'xac_nhan' and remaining_qty > 0), 0) as open_orders_value,
      count(*) filter (where is_late) as late_orders, count(*) filter (where status = 'nhap') as draft_orders,
      count(*) filter (where kind = 'dat_hang' and status = 'xac_nhan' and remaining_qty > 0) as special_open
    from v_sales_orders where book_id = @b`, o);
  const po = oneN(`select count(*) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_pos, count(*) filter (where is_late) as late_pos
    from v_purchase_orders where book_id = @b`, o);
  const r = {
    ...calcPl(b, d1, d2), from: d1, to: d2, today: today(),
    receivable: pos(cb), customer_prepaid: neg(cb), payable: pos(sb), supplier_prepaid: neg(sb),
    overdue_receivable: oneN(`select coalesce(sum(overdue), 0) as v from v_customers where book_id = @b`, o).v,
    overdue_payable: oneN(`select coalesce(sum(overdue), 0) as v from v_suppliers where book_id = @b`, o).v,
    inventory_value: oneN(`select coalesce(sum(value), 0) as v from stock_moves where book_id = @b and move_date <= @d2`, o).v,
    inventory_qty: oneN(`select coalesce(sum(qty), 0) as v from stock_moves where book_id = @b and move_date <= @d2`, o).v,
    fund_balance: oneN(`select coalesce(sum(opening_balance), 0) as v from funds where book_id = @b`, o).v
      + oneN(`select coalesce(sum(amount), 0) as v from v_fund_moves where book_id = @b and pay_date <= @d2`, o).v,
    ...so, ...po,
    low_stock: oneN(`select count(*) as v from v_products where book_id = @b and is_low`, o).v,
    can_cost: can(b, 'xem_gia_von'),
  };
  return mask(b, r);
}

// Danh sách giao dịch tạo nên một con số trên Tổng quan
export function rpt_drill(p) {
  const { b, d1, d2 } = period(p); const m = p.metric;
  requirePerm(b, 'xem_bao_cao');
  const cost = can(b, 'xem_gia_von');
  if (['cogs', 'gross_profit', 'opex', 'inventory', 'profit'].includes(m) && !cost) needCost(b);
  const vat = rates(b).vat;
  const o = { b, d1, d2 };
  if (['revenue', 'revenue_net', 'vat', 'cogs', 'gross_profit', 'profit'].includes(m)) {
    const rows = allN(`select * from (
        select d.delivery_date as date, d.code, 'Giao hàng' as label, c.name as party, o.code as ref, 'giao' as doc_type, d.order_id as doc_id,
          coalesce(x.rev, 0) + d.shipping_fee as revenue, coalesce(x.cg, 0) as cogs
        from deliveries d join sales_orders o on o.id = d.order_id left join customers c on c.id = o.customer_id
        left join (select delivery_id, sum(revenue) as rev, sum(cogs) as cg from delivery_lines group by delivery_id) x on x.delivery_id = d.id
        where d.book_id = @b and d.delivery_date between @d1 and @d2
        union all
        select r.return_date, r.code, 'Khách trả hàng', c.name, o.code, 'tra_hang', r.order_id, -coalesce(x.rev, 0), -coalesce(x.cg, 0)
        from sales_returns r join sales_orders o on o.id = r.order_id left join customers c on c.id = o.customer_id
        left join (select return_id, sum(revenue) as rev, sum(cogs) as cg from sales_return_lines group by return_id) x on x.return_id = r.id
        where r.book_id = @b and r.return_date between @d1 and @d2
        union all
        select move_date, doc_code, 'Chênh lệch giá vốn', null, null, doc_type, doc_id, 0, -value
        from stock_moves where book_id = @b and doc_type = 'chenh_lech' and move_date between @d1 and @d2
      ) order by date, code`, o);
    return rows.map(({ revenue, cogs, ...s }) => {
      const v = rnd(revenue * vat);
      const amount = m === 'revenue' ? revenue : m === 'vat' ? v : m === 'revenue_net' ? revenue - v : m === 'cogs' ? cogs : revenue - v - cogs;
      return { ...s, amount };
    });
  }
  if (['opex', 'expenses', 'stock_loss'].includes(m)) {
    return allN(`select * from (
        select ea.alloc_date as date, ea.code, ea.expense_group || ' · ' || ea.category
            || case when ea.alloc_months > 1 then ' (phân bổ ' || ea.part_no || '/' || ea.alloc_months || ')' else '' end as label,
          coalesce(ea.supplier_name, ea.description) as party, ea.description as ref, 'chi_phi' as doc_type, ea.expense_id as doc_id, ea.amount
        from v_expense_alloc ea where ea.book_id = @b and ea.alloc_date between @d1 and @d2 and @m <> 'stock_loss'
        union all
        select a.adj_date, a.code, 'Hao hụt kho: ' || v.reason_label, null, a.note, 'dieu_chinh', a.id, -coalesce(v.value, 0)
        from stock_adjustments a join v_adjustments v on v.id = a.id
        where a.book_id = @b and a.reason <> 'dau_ky' and a.adj_date between @d1 and @d2 and @m <> 'expenses' and @cost
      ) order by date, code`, { ...o, m, cost });
  }
  if (['cash_in', 'cash_out'].includes(m)) {
    return allN(`select pay_date as date, code, kind_label as label, coalesce(party_name, note) as party, fund_name as ref, 'thu_chi' as doc_type, id as doc_id,
        cash_amount as amount from v_payments where book_id = @b and voided = 0 and pay_date between @d1 and @d2 and direction = @dir
      order by date, code`, { ...o, dir: m === 'cash_in' ? 'thu' : 'chi' });
  }
  if (['receivable', 'customer_prepaid', 'payable', 'supplier_prepaid'].includes(m)) {
    const isCust = ['receivable', 'customer_prepaid'].includes(m); const positive = ['receivable', 'payable'].includes(m);
    const tbl = isCust ? 'customers' : 'suppliers';
    const rows = [];
    for (const x of isCust ? custBalances(b, d2) : suppBalances(b, d2)) {
      if (positive ? !(x.balance > 0) : !(x.balance < 0)) continue;
      const c = one(`select id, code, name, phone from ${tbl} where id = ?`, x.party_id);
      if (!c) continue;
      rows.push({ date: d2, code: c.code, label: isCust ? 'Khách hàng' : 'Nhà cung cấp', party: c.name, ref: c.phone, doc_type: isCust ? 'khach_hang' : 'ncc',
        doc_id: c.id, amount: positive ? x.balance : -x.balance });
    }
    return rows.sort((a, z) => z.amount - a.amount);
  }
  if (m === 'overdue_receivable' || m === 'overdue_payable') {
    const kh = m === 'overdue_receivable';
    return allN(kh ? `select * from (
        select pay_due_date as date, code, 'Quá hạn ' || overdue_days || ' ngày' as label, customer_name as party, null as ref,
          'don_ban' as doc_type, id as doc_id, receivable as amount, overdue_days as days
        from v_sales_orders where book_id = @b and overdue_days > 0 and receivable > 0
        union all
        select due_date, code, 'Nợ đầu kỳ quá hạn ' || overdue_days || ' ngày', party_name, null, 'no_dau_ky', id, remaining, overdue_days
        from v_opening_debts where book_id = @b and party_type = 'kh' and overdue_days > 0) order by days desc`
      : `select * from (
        select pay_due_date as date, code, 'Quá hạn ' || overdue_days || ' ngày' as label, supplier_name as party, null as ref,
          'don_mua' as doc_type, id as doc_id, payable as amount, overdue_days as days
        from v_purchase_orders where book_id = @b and overdue_days > 0 and payable > 0
        union all
        select due_date, code, 'Nợ đầu kỳ quá hạn ' || overdue_days || ' ngày', party_name, null, 'no_dau_ky', id, remaining, overdue_days
        from v_opening_debts where book_id = @b and party_type = 'ncc' and overdue_days > 0) order by days desc`, { b });
  }
  if (m === 'inventory') {
    return allN(`select @d2 as date, p.sku as code, p.name as label, p.category as party, p.unit as ref, 'san_pham' as doc_type, p.id as doc_id,
        sum(m2.value) as amount, sum(m2.qty) as qty
      from stock_moves m2 join products p on p.id = m2.product_id
      where m2.book_id = @b and m2.move_date <= @d2 group by p.id having sum(m2.qty) <> 0 or sum(m2.value) <> 0 order by amount desc`, { b, d2 });
  }
  if (['open_orders', 'late_orders', 'special_open'].includes(m)) {
    return allN(`select coalesce(due_date, order_date) as date, code, progress as label, customer_name as party, channel as ref, 'don_ban' as doc_type, id as doc_id,
        order_total - delivered_value - returned_value as amount
      from v_sales_orders where book_id = @b and status = 'xac_nhan' and remaining_qty > 0
        and (@m = 'open_orders' or (@m = 'late_orders' and is_late) or (@m = 'special_open' and kind = 'dat_hang'))
      order by date nulls last`, { b, m });
  }
  if (['open_pos', 'late_pos'].includes(m)) {
    return allN(`select coalesce(expected_date, order_date) as date, code, progress as label, supplier_name as party, sales_order_code as ref,
        'don_mua' as doc_type, id as doc_id, order_total as amount
      from v_purchase_orders where book_id = @b and status = 'xac_nhan' and remaining_qty > 0 and (@m = 'open_pos' or is_late)
      order by date nulls last`, { b, m });
  }
  if (m === 'low_stock') {
    return allN(`select null as date, sku as code, name as label, category as party, unit as ref, 'san_pham' as doc_type, id as doc_id,
        available as amount, low_stock as qty from v_products where book_id = @b and is_low order by amount`, { b });
  }
  return fail(`Chỉ tiêu "${m}" không có chi tiết`);
}

export function rpt_monthly(p) {
  const { b, d2 } = period(p);
  requirePerm(b, 'xem_bao_cao');
  const r = [];
  for (let d = monthStart(asDate(p.from)), n = 0; d <= d2 && n < 36; d = addMonths(d, 1), n++) {
    r.push(mask(b, { ...calcPl(b, d, addDays(addMonths(d, 1), -1)), month: d }));
  }
  return r;
}

// Doanh số theo dòng hàng đã giao trừ hàng trả trong kỳ
const SOLD = `select dl.product_id, dl.qty, dl.revenue, dl.cogs, d.order_id from delivery_lines dl join deliveries d on d.id = dl.delivery_id
    where d.book_id = @b and d.delivery_date between @d1 and @d2
  union all
  select rl.product_id, -rl.qty, -rl.revenue, -rl.cogs, r.order_id from sales_return_lines rl join sales_returns r on r.id = rl.return_id
    where r.book_id = @b and r.return_date between @d1 and @d2`;

export function rpt_products(p) {
  const { b, d1, d2 } = period(p);
  requirePerm(b, 'xem_bao_cao');
  const cost = can(b, 'xem_gia_von'); const vat = rates(b).vat;
  return outRows(allN(`select p.id, p.sku, p.name, p.category, p.unit, p.is_kit, sum(x.qty) as qty, sum(x.revenue) as revenue, sum(x.cogs) as cogs,
      count(distinct x.order_id) as orders
    from (${SOLD}) x join products p on p.id = x.product_id group by p.id order by revenue desc`, { b, d1, d2 }))
    .map((r) => ({ ...r, cogs: cost ? r.cogs : null, profit: cost ? r.revenue - rnd(r.revenue * vat) - r.cogs : null }));
}

export function rpt_groups(p) {
  const { b, d1, d2 } = period(p); const g = p.by;
  requirePerm(b, 'xem_bao_cao');
  const expr = { channel: `coalesce(o.channel, '(không ghi kênh)')`, customer: 'c.name', category: `coalesce(pr.category, '(chưa phân loại)')`,
    staff: `coalesce(o.staff, '(không ghi)')` }[g];
  if (!expr) fail('Nhóm báo cáo không hợp lệ');
  const cost = can(b, 'xem_gia_von'); const vat = rates(b).vat;
  return allN(`select ${expr} as name, sum(x.revenue) as revenue, sum(x.cogs) as cogs, count(distinct o.id) as orders, sum(x.qty) as qty
    from (${SOLD}
      union all
      select null, 0, d.shipping_fee, 0, d.order_id from deliveries d where d.book_id = @b and d.delivery_date between @d1 and @d2 and d.shipping_fee <> 0
    ) x join sales_orders o on o.id = x.order_id left join customers c on c.id = o.customer_id
    left join products pr on pr.id = x.product_id
    group by 1 order by revenue desc`, { b, d1, d2 })
    .map((r) => ({ name: r.name, revenue: r.revenue, cogs: cost ? r.cogs : null, profit: cost ? r.revenue - rnd(r.revenue * vat) - r.cogs : null,
      orders: r.orders, qty: r.qty }));
}

export function rpt_stock(p) {
  const { b, d1, d2 } = period(p);
  requirePerm(b, null);
  const cost = can(b, 'xem_gia_von');
  const OPEN = `(m.move_date < @d1 or (m.doc_type = 'dau_ky' and m.move_date <= @d2))`;
  const IN = `(m.doc_type in ('nhap','tra_ncc') and m.move_date between @d1 and @d2)`;
  const SOLDF = `(m.doc_type in ('giao','tra_hang') and m.move_date between @d1 and @d2)`;
  const ADJ = `(m.doc_type in ('dieu_chinh','chenh_lech') and m.move_date between @d1 and @d2)`;
  const CLOSE = `(m.move_date <= @d2)`;
  const rows = allN(`select p.id, p.sku, p.name, p.unit, p.category,
      coalesce(sum(m.qty) filter (where ${OPEN}), 0) as open_qty, coalesce(sum(m.qty) filter (where ${IN}), 0) as in_qty,
      coalesce(-sum(m.qty) filter (where ${SOLDF}), 0) as sold_qty, coalesce(sum(m.qty) filter (where ${ADJ}), 0) as adj_qty,
      coalesce(sum(m.qty) filter (where ${CLOSE}), 0) as close_qty,
      coalesce(sum(m.value) filter (where ${OPEN}), 0) as open_value, coalesce(sum(m.value) filter (where ${IN}), 0) as in_value,
      coalesce(-sum(m.value) filter (where ${SOLDF}), 0) as sold_value, coalesce(sum(m.value) filter (where ${ADJ}), 0) as adj_value,
      coalesce(sum(m.value) filter (where ${CLOSE}), 0) as close_value
    from products p left join stock_moves m on m.product_id = p.id
    where p.book_id = @b and p.is_kit = 0 group by p.id order by p.sku`, { b, d1, d2 });
  if (!cost) for (const r of rows) for (const k of ['open_value', 'in_value', 'sold_value', 'adj_value', 'close_value']) r[k] = null;
  return rows;
}

// p = {book_id, from, to, by?: 'item' (mặc định, theo nhóm + khoản mục) | 'month' (theo nhóm × tháng)}
export function rpt_expenses(p) {
  const { b, d1, d2 } = period(p);
  requirePerm(b, 'xem_bao_cao');
  needCost(b);
  if ((p.by || 'item') === 'month') {
    return allN(`select * from (
        select expense_group as grp, date(alloc_date, 'start of month') as month, sum(amount) as amount
          from v_expense_alloc where book_id = @b and alloc_date between @d1 and @d2 group by 1, 2
        union all
        select 'Hao hụt kho', date(a.adj_date, 'start of month'), -sum(l.value)
          from stock_adjustment_lines l join stock_adjustments a on a.id = l.adjustment_id
         where a.book_id = @b and a.reason <> 'dau_ky' and a.adj_date between @d1 and @d2 group by 2
      ) order by grp, month`, { b, d1, d2 });
  }
  return outRows(allN(`select x.*, sum(x.amount) over (partition by x.grp) as grp_amount from (
      select expense_group as grp, category as name, sum(amount) as amount, count(distinct expense_id) as count, max(alloc_months > 1) as has_alloc
        from v_expense_alloc where book_id = @b and alloc_date between @d1 and @d2 group by 1, 2
      union all
      select 'Hao hụt kho', 'Vỡ, lỗi, thất thoát, hàng trả lỗi', coalesce(-sum(l.value), 0), count(distinct a.id), 0
        from stock_adjustment_lines l join stock_adjustments a on a.id = l.adjustment_id
       where a.book_id = @b and a.reason <> 'dau_ky' and a.adj_date between @d1 and @d2 having count(*) > 0
    ) x order by grp_amount desc, grp, amount desc`, { b, d1, d2 }));
}
