-- =====================================================================
--  05. BÁO CÁO, ĐỌC DỮ LIỆU, XUẤT DỮ LIỆU, CẤP QUYỀN
-- =====================================================================

-- Số dư công nợ từng khách / NCC tại một ngày (+ họ nợ mình / mình nợ NCC ; − đã trả trước)
create or replace function app.cust_balances(p_book uuid, p_asof date)
returns table (party_id uuid, balance numeric) language sql stable as $$
  select pid, sum(amt) from (
    select party_id pid, amount amt from app.opening_debts where book_id = p_book and party_type = 'kh' and debt_date <= p_asof
    union all
    select o.customer_id, x.revenue from app.delivery_lines x join app.deliveries d on d.id = x.delivery_id join app.sales_orders o on o.id = d.order_id
      where d.book_id = p_book and d.delivery_date <= p_asof
    union all
    select o.customer_id, d.shipping_fee from app.deliveries d join app.sales_orders o on o.id = d.order_id
      where d.book_id = p_book and d.delivery_date <= p_asof
    union all
    select o.customer_id, -x.revenue from app.sales_return_lines x join app.sales_returns r on r.id = x.return_id join app.sales_orders o on o.id = r.order_id
      where r.book_id = p_book and r.return_date <= p_asof
    union all
    select party_id, -debt_amount from app.v_pay_signed where book_id = p_book and party_type = 'kh' and pay_date <= p_asof
  ) t group by pid
$$;

create or replace function app.supp_balances(p_book uuid, p_asof date)
returns table (party_id uuid, balance numeric) language sql stable as $$
  select pid, sum(amt) from (
    select party_id pid, amount amt from app.opening_debts where book_id = p_book and party_type = 'ncc' and debt_date <= p_asof
    union all
    select po.supplier_id, x.value from app.goods_receipt_lines x join app.goods_receipts g on g.id = x.receipt_id join app.purchase_orders po on po.id = g.po_id
      where g.book_id = p_book and g.receipt_date <= p_asof
    union all
    select po.supplier_id, -x.value from app.supplier_return_lines x join app.supplier_returns r on r.id = x.return_id join app.purchase_orders po on po.id = r.po_id
      where r.book_id = p_book and r.return_date <= p_asof
    union all
    select supplier_id, amount from app.expenses where book_id = p_book and supplier_id is not null and not voided and exp_date <= p_asof
    union all
    select party_id, -debt_amount from app.v_pay_signed where book_id = p_book and party_type = 'ncc' and pay_date <= p_asof
  ) t group by pid
$$;

-- Kết quả kinh doanh trong khoảng ngày (cách tính dùng chung cho Tổng quan & báo cáo tháng)
create or replace function app.calc_pl(p_book uuid, d1 date, d2 date) returns jsonb language plpgsql stable as $$
declare
  vat_rate numeric; pit_rate numeric; rg numeric; rs numeric; rr numeric; rev numeric; vat numeric; cg_d numeric; cg_r numeric; cg_x numeric;
  cg numeric; ex numeric; loss numeric; ci numeric; cic numeric; co numeric; gp numeric; pf numeric; pit numeric;
begin
  select coalesce((settings ->> 'vat_rate')::numeric, 0), coalesce((settings ->> 'pit_rate')::numeric, 0) into vat_rate, pit_rate from app.books where id = p_book;
  select coalesce(sum(x.revenue), 0), coalesce(sum(x.cogs), 0) into rg, cg_d
    from app.delivery_lines x join app.deliveries d on d.id = x.delivery_id where d.book_id = p_book and d.delivery_date between d1 and d2;
  select coalesce(sum(shipping_fee), 0) into rs from app.deliveries where book_id = p_book and delivery_date between d1 and d2;
  select coalesce(sum(x.revenue), 0), coalesce(sum(x.cogs), 0) into rr, cg_r
    from app.sales_return_lines x join app.sales_returns r on r.id = x.return_id where r.book_id = p_book and r.return_date between d1 and d2;
  select coalesce(-sum(value), 0) into cg_x from app.stock_moves where book_id = p_book and doc_type = 'chenh_lech' and move_date between d1 and d2;
  -- Chi phí theo kỳ: khoản phân bổ dần (công cụ dụng cụ, tiền nhà trả trước…) chỉ tính phần của từng tháng
  select coalesce(sum(amount), 0) into ex from app.v_expense_alloc where book_id = p_book and alloc_date between d1 and d2;
  select coalesce(-sum(l.value), 0) into loss from app.stock_adjustment_lines l join app.stock_adjustments a on a.id = l.adjustment_id
    where a.book_id = p_book and a.reason <> 'dau_ky' and a.adj_date between d1 and d2;
  select coalesce(sum(amount - fee), 0), coalesce(sum(amount - fee) filter (where kind = 'thu_khach'), 0) into ci, cic
    from app.payments where book_id = p_book and not voided and direction = 'thu' and pay_date between d1 and d2;
  select coalesce(sum(amount), 0) into co from app.payments where book_id = p_book and not voided and direction = 'chi' and pay_date between d1 and d2;
  rev := rg + rs - rr;
  vat := round(rev * vat_rate);
  cg := cg_d - cg_r + cg_x;
  gp := rev - vat - cg;
  pf := gp - ex - loss;
  pit := round(greatest(pf, 0) * pit_rate);
  return jsonb_build_object(
    'revenue_goods', rg, 'revenue_shipping', rs, 'revenue_returns', rr, 'revenue', rev, 'vat', vat, 'vat_rate', vat_rate,
    'revenue_net', rev - vat, 'cogs', cg, 'gross_profit', gp, 'gross_margin', case when rev - vat <> 0 then round(gp / (rev - vat), 4) end,
    'expenses', ex, 'stock_loss', loss, 'opex', ex + loss, 'profit', pf, 'pit_rate', pit_rate, 'pit', pit, 'profit_after_tax', pf - pit,
    'cash_in', ci, 'cash_in_customers', cic, 'cash_out', co, 'net_cash', ci - co);
end $$;

create or replace function app.mask(p_book uuid, j jsonb) returns jsonb language plpgsql stable as $$
declare k text;
begin
  if app.can(p_book, 'xem_gia_von') then return j; end if;
  foreach k in array array['cogs','gross_profit','gross_margin','stock_loss','opex','profit','pit','profit_after_tax','inventory_value','expenses'] loop
    if j ? k then j := jsonb_set(j, array[k], 'null'::jsonb); end if;
  end loop;
  return j;
end $$;

create or replace function public.rpt_overview(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; d1 date := (p ->> 'from')::date; d2 date := (p ->> 'to')::date; r jsonb;
begin
  perform app.require(b, 'xem_bao_cao');
  r := app.calc_pl(b, d1, d2);
  r := r || jsonb_build_object(
    'from', d1, 'to', d2, 'today', app.today(),
    'receivable', (select coalesce(sum(balance) filter (where balance > 0), 0) from app.cust_balances(b, d2)),
    'customer_prepaid', (select coalesce(-sum(balance) filter (where balance < 0), 0) from app.cust_balances(b, d2)),
    'payable', (select coalesce(sum(balance) filter (where balance > 0), 0) from app.supp_balances(b, d2)),
    'supplier_prepaid', (select coalesce(-sum(balance) filter (where balance < 0), 0) from app.supp_balances(b, d2)),
    'overdue_receivable', (select coalesce(sum(overdue), 0) from app.v_customers where book_id = b),
    'overdue_payable', (select coalesce(sum(overdue), 0) from app.v_suppliers where book_id = b),
    'inventory_value', (select coalesce(sum(value), 0) from app.stock_moves where book_id = b and move_date <= d2),
    'inventory_qty', (select coalesce(sum(qty), 0) from app.stock_moves where book_id = b and move_date <= d2),
    'fund_balance', (select coalesce(sum(opening_balance), 0) from app.funds where book_id = b)
                    + (select coalesce(sum(amount), 0) from app.v_fund_moves where book_id = b and pay_date <= d2),
    'open_orders', (select count(*) from app.v_sales_orders where book_id = b and status = 'xac_nhan' and remaining_qty > 0),
    'open_orders_value', (select coalesce(sum(order_total - delivered_value - returned_value), 0) from app.v_sales_orders where book_id = b and status = 'xac_nhan' and remaining_qty > 0),
    'late_orders', (select count(*) from app.v_sales_orders where book_id = b and is_late),
    'draft_orders', (select count(*) from app.v_sales_orders where book_id = b and status = 'nhap'),
    'special_open', (select count(*) from app.v_sales_orders where book_id = b and kind = 'dat_hang' and status = 'xac_nhan' and remaining_qty > 0),
    'open_pos', (select count(*) from app.v_purchase_orders where book_id = b and status = 'xac_nhan' and remaining_qty > 0),
    'late_pos', (select count(*) from app.v_purchase_orders where book_id = b and is_late),
    'low_stock', (select count(*) from app.v_products where book_id = b and is_low),
    'can_cost', app.can(b, 'xem_gia_von'));
  return app.mask(b, r);
end $$;

-- Danh sách giao dịch tạo nên một con số trên Tổng quan
create or replace function public.rpt_drill(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; d1 date := (p ->> 'from')::date; d2 date := (p ->> 'to')::date; m text := p ->> 'metric';
  r jsonb; vat numeric; cost boolean;
begin
  perform app.require(b, 'xem_bao_cao');
  cost := app.can(b, 'xem_gia_von');
  if m in ('cogs','gross_profit','opex','inventory','profit') and not cost then raise exception 'Bạn chưa được cấp quyền: %', app.perm_label('xem_gia_von'); end if;
  select coalesce((settings ->> 'vat_rate')::numeric, 0) into vat from app.books where id = b;
  if m in ('revenue','revenue_net','vat','cogs','gross_profit','profit') then
    select coalesce(jsonb_agg(t order by t.date, t.code), '[]') into r from (
      select d.delivery_date as date, d.code, 'Giao hàng' as label, c.name as party, o.code as ref, 'giao' as doc_type, d.order_id as doc_id,
        coalesce(x.rev, 0) + d.shipping_fee as revenue, coalesce(x.cg, 0) as cogs
      from app.deliveries d join app.sales_orders o on o.id = d.order_id left join app.customers c on c.id = o.customer_id
      left join lateral (select sum(revenue) rev, sum(cogs) cg from app.delivery_lines where delivery_id = d.id) x on true
      where d.book_id = b and d.delivery_date between d1 and d2
      union all
      select r.return_date, r.code, 'Khách trả hàng', c.name, o.code, 'tra_hang', r.order_id, -coalesce(x.rev, 0), -coalesce(x.cg, 0)
      from app.sales_returns r join app.sales_orders o on o.id = r.order_id left join app.customers c on c.id = o.customer_id
      left join lateral (select sum(revenue) rev, sum(cogs) cg from app.sales_return_lines where return_id = r.id) x on true
      where r.book_id = b and r.return_date between d1 and d2
      union all
      select move_date, doc_code, 'Chênh lệch giá vốn', null, null, doc_type, doc_id, 0, -value
      from app.stock_moves where book_id = b and doc_type = 'chenh_lech' and move_date between d1 and d2
    ) s cross join lateral (select s.date, s.code, s.label, s.party, s.ref, s.doc_type, s.doc_id,
        case m when 'revenue' then s.revenue when 'vat' then round(s.revenue * vat) when 'revenue_net' then s.revenue - round(s.revenue * vat)
               when 'cogs' then s.cogs else s.revenue - round(s.revenue * vat) - s.cogs end as amount) t;
  elsif m in ('opex','expenses','stock_loss') then
    select coalesce(jsonb_agg(t order by t.date, t.code), '[]') into r from (
      select ea.alloc_date as date, ea.code, ea.expense_group || ' · ' || ea.category
          || case when ea.alloc_months > 1 then ' (phân bổ ' || ea.part_no || '/' || ea.alloc_months || ')' else '' end as label,
        coalesce(ea.supplier_name, ea.description) as party, ea.description as ref, 'chi_phi' as doc_type, ea.expense_id as doc_id, ea.amount
      from app.v_expense_alloc ea
      where ea.book_id = b and ea.alloc_date between d1 and d2 and m <> 'stock_loss'
      union all
      select a.adj_date, a.code, 'Hao hụt kho: ' || v.reason_label, null, a.note, 'dieu_chinh', a.id, -coalesce(v.value, 0)
      from app.stock_adjustments a join app.v_adjustments v on v.id = a.id
      where a.book_id = b and a.reason <> 'dau_ky' and a.adj_date between d1 and d2 and m <> 'expenses' and cost) t;
  elsif m in ('cash_in','cash_out') then
    select coalesce(jsonb_agg(t order by t.date, t.code), '[]') into r from (
      select pay_date as date, code, kind_label as label, coalesce(party_name, note) as party, fund_name as ref, 'thu_chi' as doc_type, id as doc_id,
        cash_amount as amount
      from app.v_payments where book_id = b and not voided and pay_date between d1 and d2
        and direction = case m when 'cash_in' then 'thu' else 'chi' end) t;
  elsif m in ('receivable','customer_prepaid') then
    select coalesce(jsonb_agg(t order by t.amount desc), '[]') into r from (
      select d2 as date, c.code, 'Khách hàng' as label, c.name as party, c.phone as ref, 'khach_hang' as doc_type, c.id as doc_id,
        case m when 'receivable' then x.balance else -x.balance end as amount
      from app.cust_balances(b, d2) x join app.customers c on c.id = x.party_id
      where (m = 'receivable' and x.balance > 0) or (m = 'customer_prepaid' and x.balance < 0)) t;
  elsif m in ('payable','supplier_prepaid') then
    select coalesce(jsonb_agg(t order by t.amount desc), '[]') into r from (
      select d2 as date, s.code, 'Nhà cung cấp' as label, s.name as party, s.phone as ref, 'ncc' as doc_type, s.id as doc_id,
        case m when 'payable' then x.balance else -x.balance end as amount
      from app.supp_balances(b, d2) x join app.suppliers s on s.id = x.party_id
      where (m = 'payable' and x.balance > 0) or (m = 'supplier_prepaid' and x.balance < 0)) t;
  elsif m = 'overdue_receivable' then
    select coalesce(jsonb_agg(t order by t.days desc), '[]') into r from (
      select pay_due_date as date, code, 'Quá hạn ' || overdue_days || ' ngày' as label, customer_name as party, null as ref,
        'don_ban' as doc_type, id as doc_id, receivable as amount, overdue_days as days
      from app.v_sales_orders where book_id = b and overdue_days > 0 and receivable > 0
      union all
      select due_date, code, 'Nợ đầu kỳ quá hạn ' || overdue_days || ' ngày', party_name, null, 'no_dau_ky', id, remaining, overdue_days
      from app.v_opening_debts where book_id = b and party_type = 'kh' and overdue_days > 0) t;
  elsif m = 'overdue_payable' then
    select coalesce(jsonb_agg(t order by t.days desc), '[]') into r from (
      select pay_due_date as date, code, 'Quá hạn ' || overdue_days || ' ngày' as label, supplier_name as party, null as ref,
        'don_mua' as doc_type, id as doc_id, payable as amount, overdue_days as days
      from app.v_purchase_orders where book_id = b and overdue_days > 0 and payable > 0
      union all
      select due_date, code, 'Nợ đầu kỳ quá hạn ' || overdue_days || ' ngày', party_name, null, 'no_dau_ky', id, remaining, overdue_days
      from app.v_opening_debts where book_id = b and party_type = 'ncc' and overdue_days > 0) t;
  elsif m = 'inventory' then
    select coalesce(jsonb_agg(t order by t.amount desc), '[]') into r from (
      select d2 as date, p.sku as code, p.name as label, p.category as party, p.unit as ref, 'san_pham' as doc_type, p.id as doc_id,
        sum(m2.value) as amount, sum(m2.qty) as qty
      from app.stock_moves m2 join app.products p on p.id = m2.product_id
      where m2.book_id = b and m2.move_date <= d2 group by p.id having sum(m2.qty) <> 0 or sum(m2.value) <> 0) t;
  elsif m in ('open_orders','late_orders','special_open') then
    select coalesce(jsonb_agg(t order by t.date nulls last), '[]') into r from (
      select coalesce(due_date, order_date) as date, code, progress as label, customer_name as party, channel as ref, 'don_ban' as doc_type, id as doc_id,
        order_total - delivered_value - returned_value as amount
      from app.v_sales_orders where book_id = b and status = 'xac_nhan' and remaining_qty > 0
        and (m = 'open_orders' or (m = 'late_orders' and is_late) or (m = 'special_open' and kind = 'dat_hang'))) t;
  elsif m in ('open_pos','late_pos') then
    select coalesce(jsonb_agg(t order by t.date nulls last), '[]') into r from (
      select coalesce(expected_date, order_date) as date, code, progress as label, supplier_name as party, sales_order_code as ref,
        'don_mua' as doc_type, id as doc_id, order_total as amount
      from app.v_purchase_orders where book_id = b and status = 'xac_nhan' and remaining_qty > 0 and (m = 'open_pos' or is_late)) t;
  elsif m = 'low_stock' then
    select coalesce(jsonb_agg(t order by t.amount), '[]') into r from (
      select null::date as date, sku as code, name as label, category as party, unit as ref, 'san_pham' as doc_type, id as doc_id,
        available as amount, low_stock as qty
      from app.v_products where book_id = b and is_low) t;
  else
    raise exception 'Chỉ tiêu "%" không có chi tiết', m;
  end if;
  return r;
end $$;

create or replace function public.rpt_monthly(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; d date := date_trunc('month', (p ->> 'from')::date)::date; d2 date := (p ->> 'to')::date;
  r jsonb := '[]'::jsonb; n int := 0;
begin
  perform app.require(b, 'xem_bao_cao');
  while d <= d2 and n < 36 loop
    r := r || jsonb_build_array(app.mask(b, app.calc_pl(b, d, (d + interval '1 month - 1 day')::date) || jsonb_build_object('month', d)));
    d := (d + interval '1 month')::date; n := n + 1;
  end loop;
  return r;
end $$;

create or replace function public.rpt_products(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; d1 date := (p ->> 'from')::date; d2 date := (p ->> 'to')::date; cost boolean; vat numeric; r jsonb;
begin
  perform app.require(b, 'xem_bao_cao');
  cost := app.can(b, 'xem_gia_von');
  select coalesce((settings ->> 'vat_rate')::numeric, 0) into vat from app.books where id = b;
  select coalesce(jsonb_agg(t order by t.revenue desc), '[]') into r from (
    select p.id, p.sku, p.name, p.category, p.unit, p.is_kit, sum(x.qty) as qty, sum(x.revenue) as revenue,
      case when cost then sum(x.cogs) end as cogs,
      case when cost then sum(x.revenue) - round(sum(x.revenue) * vat) - sum(x.cogs) end as profit,
      count(distinct x.order_id) as orders
    from (
      select dl.product_id, dl.qty, dl.revenue, dl.cogs, d.order_id from app.delivery_lines dl join app.deliveries d on d.id = dl.delivery_id
       where d.book_id = b and d.delivery_date between d1 and d2
      union all
      select rl.product_id, -rl.qty, -rl.revenue, -rl.cogs, r.order_id from app.sales_return_lines rl join app.sales_returns r on r.id = rl.return_id
       where r.book_id = b and r.return_date between d1 and d2
    ) x join app.products p on p.id = x.product_id group by p.id) t;
  return r;
end $$;

create or replace function public.rpt_groups(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; d1 date := (p ->> 'from')::date; d2 date := (p ->> 'to')::date; g text := p ->> 'by';
  cost boolean; vat numeric; r jsonb;
begin
  perform app.require(b, 'xem_bao_cao');
  if g not in ('channel','customer','category','staff') then raise exception 'Nhóm báo cáo không hợp lệ'; end if;
  cost := app.can(b, 'xem_gia_von');
  select coalesce((settings ->> 'vat_rate')::numeric, 0) into vat from app.books where id = b;
  select coalesce(jsonb_agg(t order by t.revenue desc), '[]') into r from (
    select case g when 'channel' then coalesce(o.channel, '(không ghi kênh)') when 'customer' then c.name
                  when 'category' then coalesce(pr.category, '(chưa phân loại)') else coalesce(o.staff, '(không ghi)') end as name,
      sum(x.revenue) as revenue, case when cost then sum(x.cogs) end as cogs,
      case when cost then sum(x.revenue) - round(sum(x.revenue) * vat) - sum(x.cogs) end as profit,
      count(distinct o.id) as orders, sum(x.qty) as qty
    from (
      select dl.product_id, dl.qty, dl.revenue, dl.cogs, d.order_id from app.delivery_lines dl join app.deliveries d on d.id = dl.delivery_id
        where d.book_id = b and d.delivery_date between d1 and d2
      union all
      select null, 0, d.shipping_fee, 0, d.order_id from app.deliveries d where d.book_id = b and d.delivery_date between d1 and d2 and d.shipping_fee <> 0
      union all
      select rl.product_id, -rl.qty, -rl.revenue, -rl.cogs, r.order_id from app.sales_return_lines rl join app.sales_returns r on r.id = rl.return_id
        where r.book_id = b and r.return_date between d1 and d2
    ) x join app.sales_orders o on o.id = x.order_id left join app.customers c on c.id = o.customer_id
    left join app.products pr on pr.id = x.product_id
    group by 1) t;
  return r;
end $$;

create or replace function public.rpt_stock(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; d1 date := (p ->> 'from')::date; d2 date := (p ->> 'to')::date; cost boolean; r jsonb;
begin
  perform app.require(b, null);
  cost := app.can(b, 'xem_gia_von');
  select coalesce(jsonb_agg(t order by t.sku), '[]') into r from (
    select p.id, p.sku, p.name, p.unit, p.category,
      coalesce(sum(m.qty) filter (where m.move_date < d1 or (m.doc_type = 'dau_ky' and m.move_date <= d2)), 0) as open_qty,
      coalesce(sum(m.qty) filter (where m.doc_type in ('nhap','tra_ncc') and m.move_date between d1 and d2), 0) as in_qty,
      coalesce(-sum(m.qty) filter (where m.doc_type in ('giao','tra_hang') and m.move_date between d1 and d2), 0) as sold_qty,
      coalesce(sum(m.qty) filter (where m.doc_type in ('dieu_chinh','chenh_lech') and m.move_date between d1 and d2), 0) as adj_qty,
      coalesce(sum(m.qty) filter (where m.move_date <= d2), 0) as close_qty,
      case when cost then coalesce(sum(m.value) filter (where m.move_date < d1 or (m.doc_type = 'dau_ky' and m.move_date <= d2)), 0) end as open_value,
      case when cost then coalesce(sum(m.value) filter (where m.doc_type in ('nhap','tra_ncc') and m.move_date between d1 and d2), 0) end as in_value,
      case when cost then coalesce(-sum(m.value) filter (where m.doc_type in ('giao','tra_hang') and m.move_date between d1 and d2), 0) end as sold_value,
      case when cost then coalesce(sum(m.value) filter (where m.doc_type in ('dieu_chinh','chenh_lech') and m.move_date between d1 and d2), 0) end as adj_value,
      case when cost then coalesce(sum(m.value) filter (where m.move_date <= d2), 0) end as close_value
    from app.products p left join app.stock_moves m on m.product_id = p.id
    where p.book_id = b and not p.is_kit group by p.id) t;
  return r;
end $$;

create or replace function public.rpt_expenses(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
-- p = {book_id, from, to, by?: 'item' (mặc định, theo nhóm + khoản mục) | 'month' (theo nhóm × tháng)}
declare b uuid := (p ->> 'book_id')::uuid; d1 date := (p ->> 'from')::date; d2 date := (p ->> 'to')::date; r jsonb;
begin
  perform app.require(b, 'xem_bao_cao');
  if not app.can(b, 'xem_gia_von') then raise exception 'Bạn chưa được cấp quyền: %', app.perm_label('xem_gia_von'); end if;
  if coalesce(p ->> 'by', 'item') = 'month' then
    select coalesce(jsonb_agg(t order by t.grp, t.month), '[]') into r from (
      select expense_group as grp, date_trunc('month', alloc_date)::date as month, sum(amount) as amount
        from app.v_expense_alloc where book_id = b and alloc_date between d1 and d2 group by 1, 2
      union all
      select 'Hao hụt kho', date_trunc('month', a.adj_date)::date, -sum(l.value)
        from app.stock_adjustment_lines l join app.stock_adjustments a on a.id = l.adjustment_id
       where a.book_id = b and a.reason <> 'dau_ky' and a.adj_date between d1 and d2 group by 2) t;
  else
    select coalesce(jsonb_agg(t order by t.grp_amount desc, t.grp, t.amount desc), '[]') into r from (
      select x.*, sum(x.amount) over (partition by x.grp) as grp_amount from (
        select expense_group as grp, category as name, sum(amount) as amount, count(distinct expense_id) as count,
          bool_or(alloc_months > 1) as has_alloc
          from app.v_expense_alloc where book_id = b and alloc_date between d1 and d2 group by 1, 2
        union all
        select 'Hao hụt kho', 'Vỡ, lỗi, thất thoát, hàng trả lỗi', coalesce(-sum(l.value), 0), count(distinct a.id), false
          from app.stock_adjustment_lines l join app.stock_adjustments a on a.id = l.adjustment_id
         where a.book_id = b and a.reason <> 'dau_ky' and a.adj_date between d1 and d2 having count(*) > 0) x) t;
  end if;
  return r;
end $$;

-- ---------- ĐỌC DỮ LIỆU CHUNG ----------
-- p = {view, book_id, filters:[[cột, phép, giá trị]...], order:'cột desc', limit}
create or replace function public.q(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare
  v text := p ->> 'view'; b uuid := (p ->> 'book_id')::uuid; perm text; f jsonb; col text; op text; val jsonb; w text := '';
  ord text := ''; lim int := least(coalesce((p ->> 'limit')::int, 2000), 10000); r jsonb; parts text[];
begin
  perm := case v
    when 'products' then '' when 'customers' then '' when 'suppliers' then '' when 'sales_orders' then '' when 'sales_order_lines' then ''
    when 'deliveries' then '' when 'delivery_lines' then '' when 'sales_returns' then '' when 'stock_moves' then '' when 'adjustments' then ''
    when 'opening_debts' then '' when 'doc_payments' then '' when 'purchase_orders' then '' when 'purchase_order_lines' then ''
    when 'receipts' then '' when 'supplier_returns' then '' when 'funds' then '' when 'payments' then 'thu_chi' when 'open_docs' then ''
    when 'expenses' then 'chi_phi' when 'members' then 'owner' when 'audit' then 'owner'
    when 'shipments' then '' when 'bank_txns' then 'thu_chi' else null end;
  if perm is null then raise exception 'Không có bảng dữ liệu "%"', v; end if;
  perform app.require(b, nullif(perm, ''));
  for f in select * from jsonb_array_elements(coalesce(p -> 'filters', '[]'::jsonb)) loop
    col := f ->> 0; op := coalesce(f ->> 1, 'eq'); val := f -> 2;
    if col !~ '^[a-z_][a-z0-9_]*$' then raise exception 'Cột không hợp lệ'; end if;
    w := w || ' and ' || case op
      when 'eq' then format('%I::text = %L', col, val #>> '{}')
      when 'neq' then format('%I::text is distinct from %L', col, val #>> '{}')
      when 'gte' then format('%I >= %L', col, val #>> '{}')
      when 'lte' then format('%I <= %L', col, val #>> '{}')
      when 'gt' then format('%I > %L', col, val #>> '{}')
      when 'lt' then format('%I < %L', col, val #>> '{}')
      when 'in' then format('%I::text = any(%L::text[])', col, array(select jsonb_array_elements_text(val)))
      when 'is_null' then format('%I is null', col)
      when 'not_null' then format('%I is not null', col)
      when 'ilike' then format('%I::text ilike %L', col, '%' || (val #>> '{}') || '%')
      else null end;
    if w is null then raise exception 'Phép lọc không hợp lệ'; end if;
  end loop;
  if coalesce(p ->> 'order', '') <> '' then
    parts := regexp_split_to_array(trim(p ->> 'order'), '\s+');
    if parts[1] !~ '^[a-z_][a-z0-9_]*$' then raise exception 'Cột sắp xếp không hợp lệ'; end if;
    ord := format(' order by %I %s nulls last', parts[1], case when lower(coalesce(parts[2], '')) = 'desc' then 'desc' else 'asc' end);
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from app.%I where book_id = %L %s %s limit %s) t',
                 'v_' || v, b, w, ord, lim) into r;
  return r;
end $$;

-- ---------- XUẤT TOÀN BỘ DỮ LIỆU 1 SỔ (sao lưu) ----------
create or replace function public.export_book(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb := '{}'::jsonb; t text; rows jsonb;
begin
  perform app.require(b, 'owner');
  foreach t in array array['books','book_members','funds','products','customers','suppliers','opening_debts','sales_orders','sales_order_lines',
    'deliveries','delivery_lines','sales_returns','sales_return_lines','purchase_orders','purchase_order_lines','goods_receipts',
    'goods_receipt_lines','supplier_returns','supplier_return_lines','stock_adjustments','stock_adjustment_lines','stock_moves',
    'payments','payment_allocations','expenses','doc_counters','shipments','shipment_events','bank_txns','notifications'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from app.%I x where %I = $1', t,
                   case t when 'books' then 'id' else 'book_id' end) into rows using b;
    r := r || jsonb_build_object(t, rows);
  end loop;
  r := r || jsonb_build_object('kit_items', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb) from app.kit_items k join app.products pr on pr.id = k.kit_id where pr.book_id = b),
                               'exported_at', now(), 'format', 'gomsu-backup-v1');
  return r;
end $$;

-- ---------- CẤP QUYỀN GỌI HÀM ----------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('bootstrap','my_books','update_book_settings','upsert_member','remove_member',
             'save_product','save_party','save_fund','save_opening_debt','delete_opening_debt','adjust_stock','import_products','import_parties',
             'create_payment','void_payment','save_expense','void_expense','save_sales_order','confirm_sales_order','cancel_sales_order',
             'cancel_remaining','deliver','sales_return','save_purchase_order','confirm_purchase_order','cancel_purchase_order',
             'cancel_po_remaining','set_prod_step','receive','supplier_return','rpt_overview','rpt_drill','rpt_monthly','rpt_products',
             'rpt_groups','rpt_stock','rpt_expenses','q','export_book') loop
    execute format('revoke all on function %s from public', f.sig);
    begin execute format('revoke all on function %s from anon', f.sig); exception when others then null; end;
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
