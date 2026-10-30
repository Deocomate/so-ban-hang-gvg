-- =====================================================================
--  09. CHI PHÍ PHÂN NHÓM + PHÂN BỔ DẦN
--  - Danh mục 2 cấp: nhóm lớn (Mặt bằng, Điện nước, Công cụ dụng cụ, Marketing, Chi phí bán hàng, Nhân sự, Quản lý & khác) → khoản mục
--  - Phân bổ dần: khoản chi 1 lần nhưng dùng nhiều tháng (kệ, camera, tiền nhà trả trước…) chia đều vào lãi lỗ từng tháng
--  Chạy được trên cơ sở dữ liệu đã cài trước (nâng cấp), không mất dữ liệu.
-- =====================================================================

alter table app.expenses add column if not exists expense_group text;
alter table app.expenses add column if not exists alloc_months int not null default 1;
alter table app.expenses drop constraint if exists expenses_alloc_chk;
alter table app.expenses add constraint expenses_alloc_chk check (alloc_months between 1 and 60);

create or replace function app.default_expense_cats() returns jsonb language sql immutable as $$
  select '[
    {"group":"Mặt bằng","items":["Thuê nhà / cửa hàng","Thuê kho","Phí dịch vụ, an ninh, vệ sinh"]},
    {"group":"Điện, nước, internet","items":["Tiền điện","Tiền nước","Internet, điện thoại","Gas, rác thải"]},
    {"group":"Công cụ dụng cụ","items":["Kệ, tủ, bàn trưng bày","Thiết bị (máy in, camera, đèn, điện thoại livestream)","Dụng cụ đóng gói, bán hàng","Sửa chữa, bảo trì"]},
    {"group":"Marketing","items":["Quảng cáo Facebook","Quảng cáo TikTok","Quảng cáo khác (Google, Zalo…)","KOC / KOL, affiliate","Chụp ảnh, quay video, đạo cụ","In ấn, biển bảng, catalog","Quà tặng, khuyến mãi, hàng mẫu"]},
    {"group":"Chi phí bán hàng","items":["Phí vận chuyển (ship, COD)","Bao bì, đóng gói","Phí sàn TMĐT","Phí ngân hàng, thanh toán","Hoa hồng bán hàng, CTV","Hàng tặng kèm"]},
    {"group":"Nhân sự","items":["Lương","Thưởng","Bảo hiểm, phụ cấp","Ăn uống, liên hoan"]},
    {"group":"Quản lý & khác","items":["Phần mềm, ứng dụng","Thuế môn bài, lệ phí","Văn phòng phẩm","Tiếp khách","Chi phí khác"]}
  ]'::jsonb
$$;


-- Nhóm lớn của 1 khoản mục (theo danh mục của sổ; tên cũ trước bản này cũng được hiểu)
create or replace function app.expense_group_of(p_book uuid, p_cat text) returns text language sql stable as $$
  select coalesce(
    (select g ->> 'group' from app.books b, jsonb_array_elements(coalesce(b.settings -> 'expense_cats', app.default_expense_cats())) g
      where b.id = p_book and (lower(g ->> 'group') = lower(trim(p_cat))
        or exists (select 1 from jsonb_array_elements_text(g -> 'items') i where lower(i) = lower(trim(p_cat)))) limit 1),
    case lower(trim(p_cat))
      when 'thuê mặt bằng' then 'Mặt bằng' when 'điện nước - vận hành' then 'Điện, nước, internet'
      when 'quảng cáo - marketing' then 'Marketing' when 'vận chuyển' then 'Chi phí bán hàng' when 'bao bì - đóng gói' then 'Chi phí bán hàng'
      when 'phí sàn tmđt' then 'Chi phí bán hàng' when 'phí ngân hàng' then 'Chi phí bán hàng' when 'nhân sự' then 'Nhân sự' end,
    'Quản lý & khác')
$$;

create or replace function app.expense_group_trg() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.expense_group := coalesce(nullif(trim(new.expense_group), ''), app.expense_group_of(new.book_id, new.category));
  elsif new.category is distinct from old.category and new.expense_group is not distinct from old.expense_group then
    new.expense_group := app.expense_group_of(new.book_id, new.category);
  elsif coalesce(trim(new.expense_group), '') = '' then
    new.expense_group := app.expense_group_of(new.book_id, new.category);
  end if;
  return new;
end $$;
drop trigger if exists expense_group on app.expenses;
create trigger expense_group before insert or update on app.expenses for each row execute function app.expense_group_trg();

-- Nâng cấp dữ liệu cũ
update app.books set settings = settings || jsonb_build_object('expense_cats', app.default_expense_cats(),
  'expense_groups', '["Mặt bằng","Điện, nước, internet","Công cụ dụng cụ","Marketing","Chi phí bán hàng","Nhân sự","Quản lý & khác"]'::jsonb)
 where not settings ? 'expense_cats';
update app.expenses set expense_group = app.expense_group_of(book_id, category) where expense_group is null;

-- Xem chi phí (thêm nhóm, số tháng phân bổ)
create or replace view app.v_expenses as
select e.id, e.book_id, e.code, e.exp_date, e.category, e.description, e.amount, e.supplier_id, s.name as supplier_name,
  e.settled_payment_id, sp.code as settled_payment_code, e.voided, e.void_reason, e.note, e.created_at,
  case when e.settled_payment_id is not null then e.amount else coalesce(pd.paid_net, 0) end as paid,
  case when e.voided then 0 when e.settled_payment_id is not null then 0 else e.amount - coalesce(pd.paid_net, 0) end as unpaid,
  e.expense_group, e.alloc_months,
  case when e.alloc_months > 1 then (date_trunc('month', e.exp_date) + make_interval(months => e.alloc_months - 1))::date end as alloc_end
from app.expenses e left join app.suppliers s on s.id = e.supplier_id left join app.payments sp on sp.id = e.settled_payment_id
left join app.v_doc_paid pd on pd.doc_id = e.id;

-- Chi phí chia theo tháng: phần 1 tính vào ngày phát sinh, các phần sau vào ngày 1 của tháng kế tiếp; phần cuối nhận số lẻ
create or replace view app.v_expense_alloc as
select e.book_id, e.id as expense_id, e.code, e.category, coalesce(e.expense_group, 'Quản lý & khác') as expense_group, e.description,
  s.name as supplier_name, e.alloc_months, g.i + 1 as part_no,
  case when g.i = 0 then e.exp_date else (date_trunc('month', e.exp_date) + make_interval(months => g.i))::date end as alloc_date,
  case when g.i < e.alloc_months - 1 then round(e.amount / e.alloc_months)
       else e.amount - round(e.amount / e.alloc_months) * (e.alloc_months - 1) end as amount
from app.expenses e
cross join lateral generate_series(0, e.alloc_months - 1) as g(i)
left join app.suppliers s on s.id = e.supplier_id
where not e.voided;

-- Ghi / sửa chi phí (thêm nhóm, phân bổ)
create or replace function public.save_expense(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb; e app.expenses; eid uuid := nullif(p ->> 'id', '')::uuid; amt numeric;
  sid uuid := nullif(p ->> 'supplier_id', '')::uuid; d date := coalesce((p ->> 'date')::date, app.today()); pay jsonb;
  am int := coalesce(nullif(p ->> 'alloc_months', '')::int, 1); grp text := nullif(trim(p ->> 'expense_group'), '');
begin
  perform app.require(b, 'chi_phi');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'save_expense'); if r is not null then return r; end if;
  amt := round((p ->> 'amount')::numeric);
  if amt is null or amt <= 0 then raise exception 'Số tiền chi phí phải lớn hơn 0'; end if;
  if coalesce(trim(p ->> 'category'), '') = '' then raise exception 'Chọn khoản mục chi phí'; end if;
  if am < 1 or am > 60 then raise exception 'Số tháng phân bổ từ 1 đến 60'; end if;
  perform app.check_date(b, d);
  if sid is not null and not exists (select 1 from app.suppliers where id = sid and book_id = b) then raise exception 'Không tìm thấy nhà cung cấp'; end if;
  if eid is null then
    insert into app.expenses (book_id, code, exp_date, category, expense_group, alloc_months, description, amount, supplier_id, note, created_by)
    values (b, app.next_code(b, 'CP'), d, trim(p ->> 'category'), grp, am, p ->> 'description', amt, sid, p ->> 'note', auth.uid()) returning * into e;
  else
    select * into e from app.expenses where id = eid and book_id = b for update;
    if not found then raise exception 'Không tìm thấy khoản chi phí'; end if;
    if e.voided or e.settled_payment_id is not null then raise exception 'Không thể sửa khoản chi phí này'; end if;
    if exists (select 1 from app.v_alloc_signed where doc_id = e.id) then raise exception 'Chi phí đã thanh toán — hãy hủy phiếu chi trước khi sửa'; end if;
    perform app.check_date(b, e.exp_date);
    update app.expenses set exp_date = d, category = trim(p ->> 'category'), expense_group = coalesce(grp, app.expense_group_of(b, trim(p ->> 'category'))),
      alloc_months = am, description = p ->> 'description', amount = amt, supplier_id = sid, note = p ->> 'note' where id = e.id returning * into e;
  end if;
  if nullif(p #>> '{pay_now,fund_id}', '') is not null then
    perform app.require(b, 'thu_chi');
    pay := app.do_payment(b, jsonb_build_object('kind', case when sid is null then 'chi_phi' else 'tra_ncc' end, 'date', d,
      'fund_id', p #>> '{pay_now,fund_id}', 'party_id', sid, 'amount', amt, 'method', p #>> '{pay_now,method}',
      'note', 'Trả chi phí ' || e.code || coalesce(' – ' || e.description, ''),
      'allocations', jsonb_build_array(jsonb_build_object('doc_type', 'chi_phi', 'doc_id', e.id, 'amount', amt))));
  end if;
  r := jsonb_build_object('id', e.id, 'code', e.code, 'payment_code', pay ->> 'code', 'expense_group', e.expense_group);
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

-- Lãi lỗ, chi tiết số liệu, báo cáo chi phí: dùng chi phí đã phân bổ theo tháng
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
