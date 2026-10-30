-- =====================================================================
--  CÁC BẢNG TỔNG HỢP (VIEW) – mọi con số đều tính từ chứng từ gốc.
--  Ứng dụng đọc qua RPC q(); cột giá vốn/lợi nhuận bị ẩn nếu không có quyền.
--  Hàm tự định nghĩa (server/src/db/index.js): today(), vn_date(ts), days(a, b),
--  can_cost(book_id), ship_status_label(s), cod_status_label(s), carrier_name(c).
--  Tệp này được chạy lại mỗi lần khởi động (drop + create), không đụng dữ liệu.
-- =====================================================================

drop view if exists v_audit;
drop view if exists v_members;
drop view if exists v_bank_txns;
drop view if exists v_shipments;
drop view if exists v_open_docs;
drop view if exists v_doc_payments;
drop view if exists v_payments;
drop view if exists v_funds;
drop view if exists v_fund_moves;
drop view if exists v_suppliers;
drop view if exists v_expense_alloc;
drop view if exists v_expenses;
drop view if exists v_customers;
drop view if exists v_opening_debts;
drop view if exists v_adjustments;
drop view if exists v_stock_moves;
drop view if exists v_supplier_returns;
drop view if exists v_receipts;
drop view if exists v_purchase_order_lines;
drop view if exists v_purchase_orders;
drop view if exists v_sales_returns;
drop view if exists v_delivery_lines;
drop view if exists v_deliveries;
drop view if exists v_sales_order_lines;
drop view if exists v_sales_orders;
drop view if exists v_order_po;
drop view if exists v_order_values;
drop view if exists v_products;
drop view if exists v_incoming;
drop view if exists v_reserve_sum;
drop view if exists v_reserve;
drop view if exists v_doc_paid;
drop view if exists v_alloc_signed;
drop view if exists v_pay_signed;

-- Thanh toán còn hiệu lực, có dấu theo chiều công nợ
create view v_pay_signed as
select p.*,
  case when p.kind in ('thu_khach','tra_ncc','chi_phi') then p.amount
       when p.kind in ('hoan_khach','ncc_hoan') then -p.amount else 0 end as debt_amount
from payments p where p.voided = 0;

-- Phân bổ còn hiệu lực, có dấu (+ trả nợ/cọc, − hoàn tiền)
create view v_alloc_signed as
select a.*, p.kind, p.pay_date, p.code as pay_code, p.party_id,
  case when p.kind in ('hoan_khach','ncc_hoan') then -a.amount else a.amount end as signed_amount
from payment_allocations a join payments p on p.id = a.payment_id and p.voided = 0;

create view v_doc_paid as
select doc_id, sum(signed_amount) as paid_net, max(pay_date) as last_pay_date
from v_alloc_signed group by doc_id;

-- Hàng đang giữ cho đơn đã xác nhận nhưng chưa giao.
-- Dòng đơn gắn với đơn đặt xưởng/NCC chỉ giữ phần hàng của đơn đặt đó đã về kho.
create view v_reserve as
select l.book_id, l.order_id, l.id as order_line_id,
  coalesce(k.component_id, l.product_id) as product_id,
  (case when l.po_line_id is null then l.qty - l.cancelled_qty - l.delivered_qty
        else min(l.qty - l.cancelled_qty - l.delivered_qty,
                 max(coalesce(pl.received_qty - pl.returned_qty, 0) - l.delivered_qty, 0)) end)
    * coalesce(k.qty, 1) as qty
from sales_order_lines l
join sales_orders o on o.id = l.order_id and o.status = 'xac_nhan'
join products p on p.id = l.product_id
left join kit_items k on p.is_kit = 1 and k.kit_id = p.id
left join purchase_order_lines pl on pl.id = l.po_line_id
where l.qty - l.cancelled_qty - l.delivered_qty > 0;

create view v_reserve_sum as
select product_id, sum(qty) as reserved from v_reserve group by product_id;

-- Hàng đang về (đơn đặt NCC đã xác nhận, chưa nhận đủ)
create view v_incoming as
select pl.product_id, sum(pl.qty - pl.cancelled_qty - pl.received_qty) as incoming
from purchase_order_lines pl join purchase_orders po on po.id = pl.po_id and po.status = 'xac_nhan'
where pl.qty - pl.cancelled_qty - pl.received_qty > 0 group by pl.product_id;

-- ---------- SẢN PHẨM & TỒN KHO ----------
create view v_products as
with base as (
  select p.*, coalesce(r.reserved, 0) as reserved, coalesce(i.incoming, 0) as incoming
  from products p
  left join v_reserve_sum r on r.product_id = p.id
  left join v_incoming i on i.product_id = p.id
), kit as (
  select k.kit_id,
    floor(min(c.on_hand / k.qty)) as on_hand,
    floor(min((c.on_hand - c.reserved) / k.qty)) as available,
    sum((case when c.on_hand > 0 then c.stock_value / c.on_hand else c.last_cost end) * k.qty) as avg_cost,
    json_group_array(json_object('product_id', c.id, 'sku', c.sku, 'name', c.name, 'unit', c.unit, 'qty', k.qty,
                                 'on_hand', c.on_hand) order by c.sku) as components
  from kit_items k join base c on c.id = k.component_id group by k.kit_id
)
select b.id, b.book_id, b.sku, b.name, b.category, b.pattern, b.size, b.color, b.unit, b.image_url,
  b.price1, b.price2, b.price3, b.low_stock, b.is_kit, b.active, b.note, b.created_at, b.updated_at,
  case when b.is_kit then coalesce(kit.on_hand, 0) else b.on_hand end as on_hand,
  case when b.is_kit then 0 else b.reserved end as reserved,
  case when b.is_kit then coalesce(kit.available, 0) else b.on_hand - b.reserved end as available,
  b.incoming,
  case when can_cost(b.book_id) then
    case when b.is_kit then coalesce(kit.avg_cost, 0) else case when b.on_hand > 0 then b.stock_value / b.on_hand else b.last_cost end end end as avg_cost,
  case when can_cost(b.book_id) then case when b.is_kit then 0 else b.stock_value end end as stock_value,
  coalesce(kit.components, '[]') as components,
  (not b.is_kit and b.active and b.on_hand - b.reserved <= b.low_stock) as is_low,
  b.pack_unit, b.units_per_pack, b.pack_weight, b.unit_weight,
  coalesce(b.unit_weight, round(b.pack_weight / nullif(b.units_per_pack, 0), 4)) as weight_per_unit
from base b left join kit on kit.kit_id = b.id;

-- ---------- GIÁ TRỊ TỪNG ĐƠN BÁN ----------
create view v_order_values as
with l as (
  select order_id,
    sum((qty - cancelled_qty) * unit_price * (1 - discount_pct / 100.0)) as goods_gross,
    sum(qty - cancelled_qty) as eff_qty, sum(delivered_qty) as delivered_qty, sum(returned_qty) as returned_qty,
    sum(max(qty - cancelled_qty - delivered_qty, 0)) as remaining_qty,
    count(*) as line_count
  from sales_order_lines group by order_id
), d as (
  select order_id, sum(shipping_fee) as ship_billed, max(delivery_date) as last_delivery_date, count(*) as delivery_count
  from deliveries group by order_id
), dl as (
  select d.order_id, sum(x.revenue) as goods_delivered, sum(x.cogs) as cogs_delivered
  from delivery_lines x join deliveries d on d.id = x.delivery_id group by d.order_id
), rt as (
  select r.order_id, sum(x.revenue) as returned_value, sum(x.cogs) as returned_cogs
  from sales_return_lines x join sales_returns r on r.id = x.return_id group by r.order_id
)
select o.id as order_id,
  coalesce(l.goods_gross, 0) as goods_gross,
  case when o.status = 'huy' then 0 else max(round(coalesce(l.goods_gross, 0) - o.discount), 0) end as goods_total,
  case when o.status = 'huy' then 0 else max(round(coalesce(l.goods_gross, 0) - o.discount), 0)
       + max(o.shipping_fee, coalesce(d.ship_billed, 0)) end as order_total,
  coalesce(l.eff_qty, 0) as eff_qty, coalesce(l.delivered_qty, 0) as delivered_qty,
  coalesce(l.returned_qty, 0) as returned_qty, coalesce(l.remaining_qty, 0) as remaining_qty,
  coalesce(l.line_count, 0) as line_count,
  coalesce(dl.goods_delivered, 0) as goods_delivered, coalesce(d.ship_billed, 0) as ship_billed,
  coalesce(rt.returned_value, 0) as returned_value,
  coalesce(dl.goods_delivered, 0) + coalesce(d.ship_billed, 0) - coalesce(rt.returned_value, 0) as delivered_value,
  coalesce(dl.cogs_delivered, 0) - coalesce(rt.returned_cogs, 0) as cogs_net,
  coalesce(pd.paid_net, 0) as paid_net, pd.last_pay_date,
  d.last_delivery_date, coalesce(d.delivery_count, 0) as delivery_count
from sales_orders o
left join l on l.order_id = o.id
left join d on d.order_id = o.id
left join dl on dl.order_id = o.id
left join rt on rt.order_id = o.id
left join v_doc_paid pd on pd.doc_id = o.id;

-- Tiến độ đơn đặt riêng: tính tự động từ đơn đặt xưởng, phiếu giao và thanh toán
create view v_order_po as
select po.sales_order_id as order_id,
  count(*) as po_count,
  min(coalesce(x.remaining, 0) <= 0) as all_received,
  max(coalesce(x.received, 0) > 0) as any_received,
  group_concat(po.code || coalesce(' – ' || po.prod_step, ''), '; ' order by po.code) as po_summary,
  min(po.expected_date) as po_expected
from purchase_orders po
left join (select po_id, sum(qty - cancelled_qty - received_qty) as remaining, sum(received_qty) as received
           from purchase_order_lines group by po_id) x on x.po_id = po.id
where po.sales_order_id is not null and po.status <> 'huy'
group by po.sales_order_id;

create view v_sales_orders as
select o.id, o.book_id, o.code, o.kind, o.status, o.customer_id, c.code as customer_code, c.name as customer_name,
  c.phone as customer_phone, c.address as customer_address, c.price_tier,
  o.channel, o.order_date, o.due_date, o.staff, o.discount, o.shipping_fee, o.note, o.cancel_reason,
  o.created_at, o.confirmed_at, o.cancelled_at,
  v.goods_gross, v.goods_total, v.order_total, v.eff_qty, v.delivered_qty, v.returned_qty, v.remaining_qty, v.line_count,
  v.delivered_value, v.returned_value, v.ship_billed, v.paid_net, v.last_pay_date, v.last_delivery_date, v.delivery_count,
  v.order_total - v.returned_value as net_total,
  max(v.delivered_value - v.paid_net, 0) as receivable,
  max(v.paid_net - v.delivered_value, 0) as prepaid,
  v.order_total - v.returned_value - v.paid_net as remaining_to_pay,
  case when can_cost(o.book_id) then v.cogs_net end as cogs,
  case when can_cost(o.book_id) then round(v.delivered_value * (1 - coalesce(json_extract(b.settings, '$.vat_rate'), 0))) - v.cogs_net end as gross_profit,
  case
    when o.status = 'nhap' then 'nhap'
    when o.status = 'huy' then 'da_huy'
    when v.delivered_qty = 0 then 'chua_giao'
    when v.remaining_qty > 0 then 'giao_mot_phan'
    else 'da_giao_du' end as delivery_status,
  case
    when v.paid_net > v.order_total - v.returned_value and v.paid_net > 0 then 'thua_tien'
    when v.paid_net <= 0 and v.order_total - v.returned_value > 0 then 'chua_thanh_toan'
    when v.paid_net >= v.order_total - v.returned_value then 'da_thanh_toan_du'
    when v.delivered_value = 0 then 'da_dat_coc'
    else 'thanh_toan_mot_phan' end as payment_status,
  case
    when o.status = 'nhap' then 'Mới nhận'
    when o.status = 'huy' then 'Đã hủy'
    when v.remaining_qty = 0 and v.paid_net >= v.order_total - v.returned_value then 'Hoàn tất'
    when v.remaining_qty = 0 then 'Đã giao đủ – chờ thu tiền'
    when v.delivered_qty > 0 then 'Giao một phần'
    when op.po_count > 0 and not op.all_received then 'Đang sản xuất / chờ hàng về'
    when op.po_count > 0 then 'Hàng về – chờ giao'
    else 'Đã xác nhận' end as progress,
  op.po_summary, op.po_count,
  (o.status = 'xac_nhan' and v.remaining_qty > 0 and o.due_date is not null and o.due_date < today()) as is_late,
  case when o.status = 'xac_nhan' and v.remaining_qty > 0 and o.due_date is not null then days(o.due_date, today()) end as days_to_due,
  case when v.delivered_value - v.paid_net > 0 and v.last_delivery_date is not null
       then date(v.last_delivery_date, '+' || c.credit_days || ' days') end as pay_due_date,
  case when v.delivered_value - v.paid_net > 0 and v.last_delivery_date is not null
            and date(v.last_delivery_date, '+' || c.credit_days || ' days') < today()
       then days(today(), date(v.last_delivery_date, '+' || c.credit_days || ' days')) else 0 end as overdue_days
from sales_orders o
join v_order_values v on v.order_id = o.id
join books b on b.id = o.book_id
left join customers c on c.id = o.customer_id
left join v_order_po op on op.order_id = o.id;

create view v_sales_order_lines as
select l.id, l.book_id, l.order_id, o.code as order_code, o.status as order_status, l.line_no, l.product_id,
  p.sku, p.name as product_name, p.unit, p.is_kit, p.image_url,
  l.qty, l.unit_price, l.discount_pct, l.cancelled_qty, l.delivered_qty, l.returned_qty,
  l.qty - l.cancelled_qty as eff_qty,
  max(l.qty - l.cancelled_qty - l.delivered_qty, 0) as remaining_qty,
  round((l.qty - l.cancelled_qty) * l.unit_price * (1 - l.discount_pct / 100.0)) as line_total,
  l.po_line_id, po.code as po_code, po.id as po_id, po.prod_step as po_step,
  pl.received_qty - pl.returned_qty as po_received, l.note
from sales_order_lines l
join sales_orders o on o.id = l.order_id
join products p on p.id = l.product_id
left join purchase_order_lines pl on pl.id = l.po_line_id
left join purchase_orders po on po.id = pl.po_id;

create view v_deliveries as
select d.id, d.book_id, d.code, d.order_id, o.code as order_code, o.customer_id, c.name as customer_name, c.phone as customer_phone,
  c.address as customer_address, d.delivery_date, d.shipping_fee, d.note, d.created_at,
  coalesce(x.revenue, 0) as goods_revenue, coalesce(x.revenue, 0) + d.shipping_fee as total,
  case when can_cost(d.book_id) then x.cogs end as cogs
from deliveries d join sales_orders o on o.id = d.order_id
left join customers c on c.id = o.customer_id
left join (select delivery_id, sum(revenue) as revenue, sum(cogs) as cogs from delivery_lines group by delivery_id) x on x.delivery_id = d.id;

create view v_delivery_lines as
select x.id, x.book_id, x.delivery_id, d.code as delivery_code, d.delivery_date, d.order_id, x.order_line_id,
  x.product_id, p.sku, p.name as product_name, p.unit, x.qty, x.returned_qty, x.qty - x.returned_qty as returnable_qty,
  x.unit_price_net, x.revenue,
  case when can_cost(x.book_id) then x.cogs end as cogs
from delivery_lines x join deliveries d on d.id = x.delivery_id join products p on p.id = x.product_id;

create view v_sales_returns as
select r.id, r.book_id, r.code, r.order_id, o.code as order_code, c.name as customer_name, r.return_date, r.reason, r.note,
  r.created_at, coalesce(x.revenue, 0) as revenue,
  case when can_cost(r.book_id) then x.cogs end as cogs, x.lines
from sales_returns r join sales_orders o on o.id = r.order_id left join customers c on c.id = o.customer_id
left join (select l.return_id, sum(l.revenue) as revenue, sum(l.cogs) as cogs,
   json_group_array(json_object('sku', p.sku, 'name', p.name, 'qty', l.qty, 'revenue', l.revenue,
     'restock', json(case when l.restock then 'true' else 'false' end))) as lines
   from sales_return_lines l join products p on p.id = l.product_id group by l.return_id) x on x.return_id = r.id;

-- ---------- MUA HÀNG ----------
create view v_purchase_orders as
with l as (
  select po_id, sum((qty - cancelled_qty) * unit_cost) as order_total, sum(qty - cancelled_qty) as eff_qty,
    sum(received_qty) as received_qty, sum(returned_qty) as returned_qty,
    sum(max(qty - cancelled_qty - received_qty, 0)) as remaining_qty, count(*) as line_count
  from purchase_order_lines group by po_id
), r as (
  select g.po_id, sum(x.value) as received_value, max(g.receipt_date) as last_receipt_date
  from goods_receipt_lines x join goods_receipts g on g.id = x.receipt_id group by g.po_id
), rt as (
  select s.po_id, sum(x.value) as returned_value
  from supplier_return_lines x join supplier_returns s on s.id = x.return_id group by s.po_id
), base as (
  select po.*, coalesce(l.order_total, 0) as l_total, coalesce(l.eff_qty, 0) as eff_qty, coalesce(l.received_qty, 0) as received_qty,
    coalesce(l.returned_qty, 0) as returned_qty, coalesce(l.remaining_qty, 0) as remaining_qty, coalesce(l.line_count, 0) as line_count,
    coalesce(r.received_value, 0) - coalesce(rt.returned_value, 0) as received_value, coalesce(rt.returned_value, 0) as returned_value,
    coalesce(pd.paid_net, 0) as paid_net, r.last_receipt_date
  from purchase_orders po
  left join l on l.po_id = po.id left join r on r.po_id = po.id left join rt on rt.po_id = po.id
  left join v_doc_paid pd on pd.doc_id = po.id
)
select po.id, po.book_id, po.code, po.kind, po.status, po.supplier_id, s.code as supplier_code, s.name as supplier_name,
  s.phone as supplier_phone, po.order_date, po.expected_date, po.prod_step, po.prod_step_at, po.sales_order_id,
  so.code as sales_order_code, sc.name as sales_customer_name, po.note, po.cancel_reason, po.created_at,
  case when po.status = 'huy' then 0 else round(po.l_total) end as order_total,
  po.eff_qty, po.received_qty, po.returned_qty, po.remaining_qty, po.line_count,
  po.received_value, po.paid_net, po.last_receipt_date,
  max(po.received_value - po.paid_net, 0) as payable,
  max(po.paid_net - po.received_value, 0) as prepaid,
  case when po.status = 'huy' then 0 else round(po.l_total) end - po.returned_value as net_total,
  case when po.status = 'huy' then 0 else round(po.l_total) end - po.returned_value - po.paid_net as remaining_to_pay,
  case
    when po.status = 'nhap' then 'nhap'
    when po.status = 'huy' then 'da_huy'
    when po.received_qty = 0 then 'chua_nhan'
    when po.remaining_qty > 0 then 'nhan_mot_phan'
    else 'da_nhan_du' end as receive_status,
  case
    when po.status = 'nhap' then 'Nháp'
    when po.status = 'huy' then 'Đã hủy'
    when po.remaining_qty = 0 then 'Đã nhận đủ'
    when po.received_qty > 0 then 'Đã nhận một phần' || coalesce(' · ' || po.prod_step, '')
    else coalesce(po.prod_step, 'Đã đặt – chờ hàng') end as progress,
  (po.status = 'xac_nhan' and po.remaining_qty > 0 and po.expected_date is not null and po.expected_date < today()) as is_late,
  case when po.received_value - po.paid_net > 0 and po.last_receipt_date is not null
       then date(po.last_receipt_date, '+' || s.credit_days || ' days') end as pay_due_date,
  case when po.received_value - po.paid_net > 0 and po.last_receipt_date is not null
            and date(po.last_receipt_date, '+' || s.credit_days || ' days') < today()
       then days(today(), date(po.last_receipt_date, '+' || s.credit_days || ' days')) else 0 end as overdue_days
from base po
left join suppliers s on s.id = po.supplier_id
left join sales_orders so on so.id = po.sales_order_id
left join customers sc on sc.id = so.customer_id;

create view v_purchase_order_lines as
select l.id, l.book_id, l.po_id, po.code as po_code, l.line_no, l.product_id, p.sku, p.name as product_name, p.unit,
  l.qty, l.unit_cost, l.cancelled_qty, l.received_qty, l.returned_qty, l.qty - l.cancelled_qty as eff_qty,
  max(l.qty - l.cancelled_qty - l.received_qty, 0) as remaining_qty,
  round((l.qty - l.cancelled_qty) * l.unit_cost) as line_total, l.sales_order_line_id, so.code as sales_order_code, l.note
from purchase_order_lines l join purchase_orders po on po.id = l.po_id join products p on p.id = l.product_id
left join sales_order_lines sl on sl.id = l.sales_order_line_id left join sales_orders so on so.id = sl.order_id;

create view v_receipts as
select g.id, g.book_id, g.code, g.po_id, po.code as po_code, s.name as supplier_name, g.receipt_date, g.note, g.created_at,
  x.value, x.lines
from goods_receipts g join purchase_orders po on po.id = g.po_id left join suppliers s on s.id = po.supplier_id
left join (select l.receipt_id, sum(l.value) as value, json_group_array(json_object('id', l.id, 'sku', p.sku, 'name', p.name, 'unit', p.unit,
    'qty', l.qty, 'unit_cost', l.unit_cost, 'value', l.value, 'returned_qty', l.returned_qty, 'product_id', l.product_id) order by p.sku) as lines
  from goods_receipt_lines l join products p on p.id = l.product_id group by l.receipt_id) x on x.receipt_id = g.id;

create view v_supplier_returns as
select r.id, r.book_id, r.code, r.po_id, po.code as po_code, s.name as supplier_name, r.return_date, r.reason, r.note, r.created_at,
  x.value, x.lines
from supplier_returns r join purchase_orders po on po.id = r.po_id left join suppliers s on s.id = po.supplier_id
left join (select l.return_id, sum(l.value) as value, json_group_array(json_object('sku', p.sku, 'name', p.name, 'qty', l.qty, 'value', l.value)) as lines
  from supplier_return_lines l join products p on p.id = l.product_id group by l.return_id) x on x.return_id = r.id;

-- ---------- SỔ KHO ----------
create view v_stock_moves as
select m.id, m.book_id, m.product_id, p.sku, p.name as product_name, p.unit, m.move_date, m.qty, m.balance_qty,
  case when can_cost(m.book_id) then m.value end as value,
  case when can_cost(m.book_id) then m.unit_cost end as unit_cost,
  case when can_cost(m.book_id) then m.balance_value end as balance_value,
  m.doc_type,
  case m.doc_type when 'dau_ky' then 'Tồn đầu kỳ' when 'nhap' then 'Nhập hàng' when 'tra_ncc' then 'Trả nhà cung cấp'
    when 'giao' then 'Giao hàng (bán)' when 'tra_hang' then 'Khách trả hàng' when 'dieu_chinh' then 'Điều chỉnh kho'
    when 'chenh_lech' then 'Chênh lệch giá vốn' else m.doc_type end as doc_label,
  m.doc_id, m.doc_code, m.line_id, m.note, m.created_at,
  coalesce(so.code, po.code) as order_code, so.id as order_id, po.id as po_id, coalesce(c.name, s.name) as party_name, sa.reason as adj_reason
from stock_moves m join products p on p.id = m.product_id
left join deliveries d on m.doc_type = 'giao' and d.id = m.doc_id
left join sales_returns sr on m.doc_type = 'tra_hang' and sr.id = m.doc_id
left join sales_orders so on so.id = coalesce(d.order_id, sr.order_id)
left join customers c on c.id = so.customer_id
left join goods_receipts g on m.doc_type = 'nhap' and g.id = m.doc_id
left join supplier_returns spr on m.doc_type = 'tra_ncc' and spr.id = m.doc_id
left join purchase_orders po on po.id = coalesce(g.po_id, spr.po_id)
left join suppliers s on s.id = po.supplier_id
left join stock_adjustments sa on m.doc_type in ('dieu_chinh','dau_ky') and sa.id = m.doc_id;

create view v_adjustments as
select a.id, a.book_id, a.code, a.adj_date, a.reason,
  case a.reason when 'dau_ky' then 'Tồn đầu kỳ' when 'vo' then 'Hàng vỡ' when 'loi' then 'Hàng lỗi'
    when 'that_thoat' then 'Thất thoát / mất' when 'kiem_ke' then 'Kiểm kê chênh lệch'
    when 'hang_tra_loi' then 'Hàng khách trả bị lỗi (không nhập lại)' else 'Khác' end as reason_label,
  a.note, a.created_at,
  case when can_cost(a.book_id) then x.value end as value, x.lines
from stock_adjustments a
left join (select l.adjustment_id, sum(l.value) as value, json_group_array(json_object('sku', p.sku, 'name', p.name, 'unit', p.unit, 'qty', l.qty_delta,
    'value', case when can_cost(l.book_id) then l.value end) order by p.sku) as lines
  from stock_adjustment_lines l join products p on p.id = l.product_id group by l.adjustment_id) x on x.adjustment_id = a.id;

-- ---------- KHÁCH HÀNG & CÔNG NỢ ----------
create view v_opening_debts as
select d.id, d.book_id, d.code, d.party_type, d.party_id, coalesce(c.name, s.name) as party_name, coalesce(c.code, s.code) as party_code,
  d.amount, d.debt_date, d.due_date, d.note, d.created_at, coalesce(pd.paid_net, 0) as paid_net,
  d.amount - coalesce(pd.paid_net, 0) as remaining,
  case when d.amount - coalesce(pd.paid_net, 0) > 0 and d.due_date < today() then days(today(), d.due_date) else 0 end as overdue_days
from opening_debts d
left join customers c on d.party_type = 'kh' and c.id = d.party_id
left join suppliers s on d.party_type = 'ncc' and s.id = d.party_id
left join v_doc_paid pd on pd.doc_id = d.id;

create view v_customers as
with od as (
  select party_id, sum(amount) as opening, sum(max(remaining, 0)) filter (where overdue_days > 0) as overdue,
    max(overdue_days) as max_overdue
  from v_opening_debts where party_type = 'kh' group by party_id
), so as (
  select customer_id, sum(delivered_value) as delivered,
    sum(order_total) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_value,
    count(*) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_orders,
    sum(receivable) filter (where overdue_days > 0) as overdue, max(overdue_days) as max_overdue,
    sum(order_total) filter (where status <> 'huy') as total_bought, max(order_date) as last_order_date
  from v_sales_orders group by customer_id
), pay as (
  select party_id, sum(debt_amount) as paid from v_pay_signed where party_type = 'kh' group by party_id
), t as (
  select c.*, coalesce(od.opening, 0) as opening, coalesce(so.delivered, 0) as delivered, coalesce(pay.paid, 0) as paid,
    coalesce(od.opening, 0) + coalesce(so.delivered, 0) - coalesce(pay.paid, 0) as balance,
    coalesce(od.overdue, 0) + coalesce(so.overdue, 0) as overdue_raw,
    max(coalesce(od.max_overdue, 0), coalesce(so.max_overdue, 0)) as max_overdue_days,
    coalesce(so.open_orders, 0) as open_orders, coalesce(so.open_value, 0) as open_value,
    coalesce(so.total_bought, 0) as total_bought, so.last_order_date
  from customers c left join od on od.party_id = c.id left join so on so.customer_id = c.id left join pay on pay.party_id = c.id
)
select id, book_id, code, name, phone, address, contact, kind, price_tier, credit_days, credit_limit, note, active, created_at,
  opening, delivered, paid, balance, max(balance, 0) as receivable, max(-balance, 0) as prepaid,
  min(overdue_raw, max(balance, 0)) as overdue, max_overdue_days, open_orders, open_value, total_bought, last_order_date
from t;

create view v_expenses as
select e.id, e.book_id, e.code, e.exp_date, e.category, e.description, e.amount, e.supplier_id, s.name as supplier_name,
  e.settled_payment_id, sp.code as settled_payment_code, e.voided, e.void_reason, e.note, e.created_at,
  case when e.settled_payment_id is not null then e.amount else coalesce(pd.paid_net, 0) end as paid,
  case when e.voided then 0 when e.settled_payment_id is not null then 0 else e.amount - coalesce(pd.paid_net, 0) end as unpaid,
  e.expense_group, e.alloc_months,
  case when e.alloc_months > 1 then date(e.exp_date, 'start of month', '+' || (e.alloc_months - 1) || ' months') end as alloc_end
from expenses e left join suppliers s on s.id = e.supplier_id left join payments sp on sp.id = e.settled_payment_id
left join v_doc_paid pd on pd.doc_id = e.id;

-- Chi phí chia theo tháng: phần 1 tính vào ngày phát sinh, các phần sau vào ngày 1 của tháng kế tiếp; phần cuối nhận số lẻ
create view v_expense_alloc as
with recursive g(i) as (select 0 union all select i + 1 from g where i < 59)
select e.book_id, e.id as expense_id, e.code, e.category, coalesce(e.expense_group, 'Quản lý & khác') as expense_group, e.description,
  s.name as supplier_name, e.alloc_months, g.i + 1 as part_no,
  case when g.i = 0 then e.exp_date else date(e.exp_date, 'start of month', '+' || g.i || ' months') end as alloc_date,
  case when g.i < e.alloc_months - 1 then round(e.amount / e.alloc_months)
       else e.amount - round(e.amount / e.alloc_months) * (e.alloc_months - 1) end as amount
from expenses e
join g on g.i < e.alloc_months
left join suppliers s on s.id = e.supplier_id
where e.voided = 0;

create view v_suppliers as
with od as (
  select party_id, sum(amount) as opening, sum(max(remaining, 0)) filter (where overdue_days > 0) as overdue,
    max(overdue_days) as max_overdue
  from v_opening_debts where party_type = 'ncc' group by party_id
), po as (
  select supplier_id, sum(received_value) as received, sum(payable) filter (where overdue_days > 0) as overdue,
    max(overdue_days) as max_overdue, count(*) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_pos,
    max(order_date) as last_order_date
  from v_purchase_orders group by supplier_id
), ex as (
  select supplier_id, sum(amount) as amount from expenses where supplier_id is not null and voided = 0 group by supplier_id
), pay as (
  select party_id, sum(debt_amount) as paid from v_pay_signed where party_type = 'ncc' group by party_id
), t as (
  select s.*, coalesce(od.opening, 0) as opening, coalesce(po.received, 0) + coalesce(ex.amount, 0) as received, coalesce(pay.paid, 0) as paid,
    coalesce(od.opening, 0) + coalesce(po.received, 0) + coalesce(ex.amount, 0) - coalesce(pay.paid, 0) as balance,
    coalesce(od.overdue, 0) + coalesce(po.overdue, 0) as overdue_raw,
    max(coalesce(od.max_overdue, 0), coalesce(po.max_overdue, 0)) as max_overdue_days,
    coalesce(po.open_pos, 0) as open_pos, po.last_order_date
  from suppliers s left join od on od.party_id = s.id left join po on po.supplier_id = s.id
  left join ex on ex.supplier_id = s.id left join pay on pay.party_id = s.id
)
select id, book_id, code, name, phone, address, contact, credit_days, note, active, created_at,
  opening, received, paid, balance, max(balance, 0) as payable, max(-balance, 0) as prepaid,
  min(overdue_raw, max(balance, 0)) as overdue, max_overdue_days, open_pos, last_order_date
from t;

-- ---------- QUỸ TIỀN ----------
create view v_fund_moves as
select p.book_id, p.fund_id, p.pay_date, case when p.direction = 'thu' then p.amount - p.fee else -p.amount end as amount, p.id as payment_id
from payments p where p.voided = 0
union all
select p.book_id, p.to_fund_id, p.pay_date, p.amount, p.id from payments p where p.voided = 0 and p.direction = 'chuyen';

create view v_funds as
select f.id, f.book_id, f.name, f.opening_balance, f.sort, f.active,
  f.opening_balance + coalesce((select sum(amount) from v_fund_moves m where m.fund_id = f.id), 0) as balance
from funds f;

create view v_payments as
select p.id, p.book_id, p.code, p.pay_date, p.kind,
  case p.kind when 'thu_khach' then 'Thu tiền khách hàng' when 'hoan_khach' then 'Hoàn tiền cho khách'
    when 'tra_ncc' then 'Trả tiền nhà cung cấp' when 'ncc_hoan' then 'Nhà cung cấp hoàn tiền' when 'chi_phi' then 'Chi phí'
    when 'thu_khac' then 'Thu khác' when 'chi_khac' then 'Chi khác' when 'gop_von' then 'Chủ góp vốn'
    when 'rut_von' then 'Chủ rút vốn' when 'chuyen_quy' then 'Chuyển quỹ' end as kind_label,
  p.direction, p.fund_id, f.name as fund_name, p.to_fund_id, tf.name as to_fund_name, p.party_type, p.party_id,
  coalesce(c.name, s.name) as party_name, coalesce(c.code, s.code) as party_code,
  p.amount, p.fee, case when p.direction = 'thu' then p.amount - p.fee else p.amount end as cash_amount,
  p.method, p.note, p.voided, p.void_reason, p.voided_at, p.created_at,
  coalesce(x.allocated, 0) as allocated, p.amount - coalesce(x.allocated, 0) as unallocated, x.allocations
from payments p join funds f on f.id = p.fund_id left join funds tf on tf.id = p.to_fund_id
left join customers c on p.party_type = 'kh' and c.id = p.party_id
left join suppliers s on p.party_type = 'ncc' and s.id = p.party_id
left join (select a.payment_id, sum(a.amount) as allocated, json_group_array(json_object('doc_type', a.doc_type, 'doc_id', a.doc_id, 'amount', a.amount,
     'doc_code', coalesce(so.code, po.code, e.code, od.code))) as allocations
   from payment_allocations a
   left join sales_orders so on a.doc_type = 'don_ban' and so.id = a.doc_id
   left join purchase_orders po on a.doc_type = 'don_mua' and po.id = a.doc_id
   left join expenses e on a.doc_type = 'chi_phi' and e.id = a.doc_id
   left join opening_debts od on a.doc_type = 'no_dau_ky' and od.id = a.doc_id
   group by a.payment_id) x on x.payment_id = p.id;

-- Các khoản thanh toán gắn với 1 chứng từ (để xem trong chi tiết đơn)
create view v_doc_payments as
select a.book_id, a.doc_id, a.doc_type, a.payment_id, p.code, p.pay_date, p.kind, a.amount, a.signed_amount, f.name as fund_name, p.method, p.note
from v_alloc_signed a join payments p on p.id = a.payment_id join funds f on f.id = p.fund_id;

-- Chứng từ còn mở của 1 đối tượng (gợi ý phân bổ khi thu/chi)
create view v_open_docs as
select book_id, 'don_ban' as doc_type, id as doc_id, code, order_date as doc_date, customer_id as party_id, 'kh' as party_type,
  net_total as total, delivered_value as due_now, paid_net, net_total - paid_net as remaining_total,
  delivered_value - paid_net as remaining_due, pay_due_date as due_date, status
from v_sales_orders where status <> 'nhap' or paid_net <> 0
union all
select book_id, 'don_mua', id, code, order_date, supplier_id, 'ncc', net_total, received_value, paid_net, net_total - paid_net,
  received_value - paid_net, pay_due_date, status
from v_purchase_orders
union all
select book_id, 'no_dau_ky', id, code, debt_date, party_id, party_type, amount, amount, paid_net, remaining, remaining, due_date, 'xac_nhan'
from v_opening_debts
union all
select book_id, 'chi_phi', id, code, exp_date, supplier_id, case when supplier_id is null then null else 'ncc' end,
  amount, amount, paid, unpaid, unpaid, null, case when voided then 'huy' else 'xac_nhan' end
from v_expenses where settled_payment_id is null;

create view v_members as
select m.book_id, m.user_id, u.email, m.role, m.perms, m.display_name, m.created_at
from book_members m join users u on u.id = m.user_id;

create view v_audit as
select a.id, a.book_id, a.user_id, coalesce(m.display_name, u.email) as user_name, a.at, a.table_name, a.op, a.row_id,
  coalesce(json_extract(a.new_data, '$.code'), json_extract(a.old_data, '$.code'),
           json_extract(a.new_data, '$.sku'), json_extract(a.old_data, '$.sku')) as doc_code,
  a.old_data, a.new_data
from audit_log a left join users u on u.id = a.user_id
left join book_members m on m.user_id = a.user_id and m.book_id = a.book_id;

-- ---------- VẬN ĐƠN & TIỀN VỀ ----------
create view v_shipments as
select s.id, s.book_id, s.code, s.order_id, o.code as order_code, o.customer_id, c.name as customer_name, c.phone as customer_phone,
  o.channel, s.delivery_id, d.code as delivery_code, s.carrier, carrier_name(s.carrier) as carrier_name, s.tracking_no, s.status,
  ship_status_label(s.status) as status_label,
  s.status_at, s.status_detail, s.cod_amount, s.ship_fee, s.cod_status, cod_status_label(s.cod_status) as cod_status_label,
  s.cod_settled_at, s.receiver_name, s.receiver_phone, s.receiver_address, s.note, s.tracking_registered_at, s.last_sync_at,
  s.created_at, s.updated_at,
  s.status in ('giao_thanh_cong','da_hoan','da_huy') as is_final,
  s.status in ('giao_that_bai','dang_hoan','da_hoan','su_co') as has_problem,
  days(today(), vn_date(s.status_at)) as days_in_status,
  (select count(*) from shipment_events e where e.shipment_id = s.id) as event_count,
  (select coalesce(json_group_array(json_object('at', e.ev_at, 'status', e.status, 'label', ship_status_label(e.status),
     'detail', e.detail, 'location', e.location, 'source', e.source) order by e.ev_at desc, e.id desc), '[]')
     from shipment_events e where e.shipment_id = s.id) as events,
  (select coalesce(json_group_array(p.code), '[]') from payments p where p.id in (select value from json_each(s.cod_payment_ids))) as cod_payment_codes,
  o.status = 'huy' as order_cancelled
from shipments s join sales_orders o on o.id = s.order_id
left join customers c on c.id = o.customer_id left join deliveries d on d.id = s.delivery_id;

create view v_bank_txns as
select b.id as book_id, t.id, t.provider, t.ext_id, t.account_no, t.amount, t.direction, t.content, t.txn_at, t.ref, t.counter_name,
  t.book_id is not null as assigned, t.status, t.match_note, t.order_id, o.code as order_code, c.name as customer_name,
  t.payment_ids, (select coalesce(json_group_array(p.code), '[]') from payments p where p.id in (select value from json_each(t.payment_ids))) as payment_codes,
  t.handled_at, t.received_at, coalesce(m.display_name, u.email) as handled_by_name
from bank_txns t
join books b on b.id = t.book_id or (t.book_id is null and b.id in (select value from json_each(t.candidate_books)))
left join sales_orders o on o.id = t.order_id left join customers c on c.id = o.customer_id
left join users u on u.id = t.handled_by left join book_members m on m.user_id = t.handled_by and m.book_id = b.id;
