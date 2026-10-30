-- =====================================================================
-- 11. Trọng lượng sản phẩm (kg / thùng, kg / viên) để tính tổng trọng lượng đơn hàng
-- Chạy được nhiều lần; dữ liệu cũ giữ nguyên (ô trọng lượng để trống).
-- =====================================================================
alter table app.products add column if not exists pack_weight numeric;   -- kg mỗi thùng/hộp
alter table app.products add column if not exists unit_weight numeric;   -- kg mỗi đơn vị (viên, cái…)
alter table app.products drop constraint if exists products_weight_chk;
alter table app.products add constraint products_weight_chk check (coalesce(pack_weight, 0) >= 0 and coalesce(unit_weight, 0) >= 0);

create or replace view app.v_products as
with base as (
  select p.*, coalesce(r.reserved, 0) as reserved, coalesce(i.incoming, 0) as incoming
  from app.products p
  left join app.v_reserve_sum r on r.product_id = p.id
  left join app.v_incoming i on i.product_id = p.id
), kit as (
  select k.kit_id,
    floor(min(c.on_hand / k.qty)) as on_hand,
    floor(min((c.on_hand - c.reserved) / k.qty)) as available,
    sum((case when c.on_hand > 0 then c.stock_value / c.on_hand else c.last_cost end) * k.qty) as avg_cost,
    jsonb_agg(jsonb_build_object('product_id', c.id, 'sku', c.sku, 'name', c.name, 'unit', c.unit, 'qty', k.qty,
                                 'on_hand', c.on_hand) order by c.sku) as components
  from app.kit_items k join base c on c.id = k.component_id group by k.kit_id
)
select b.id, b.book_id, b.sku, b.name, b.category, b.pattern, b.size, b.color, b.unit, b.image_url,
  b.price1, b.price2, b.price3, b.low_stock, b.is_kit, b.active, b.note, b.created_at, b.updated_at,
  case when b.is_kit then coalesce(kit.on_hand, 0) else b.on_hand end as on_hand,
  case when b.is_kit then 0 else b.reserved end as reserved,
  case when b.is_kit then coalesce(kit.available, 0) else b.on_hand - b.reserved end as available,
  b.incoming,
  case when app.can(b.book_id, 'xem_gia_von') then
    case when b.is_kit then coalesce(kit.avg_cost, 0) else case when b.on_hand > 0 then b.stock_value / b.on_hand else b.last_cost end end end as avg_cost,
  case when app.can(b.book_id, 'xem_gia_von') then case when b.is_kit then 0 else b.stock_value end end as stock_value,
  coalesce(kit.components, '[]'::jsonb) as components,
  (not b.is_kit and b.active and b.on_hand - b.reserved <= b.low_stock) as is_low,
  b.pack_unit, b.units_per_pack, b.pack_weight, b.unit_weight,
  coalesce(b.unit_weight, round(b.pack_weight / nullif(b.units_per_pack, 0), 4)) as weight_per_unit
from base b left join kit on kit.kit_id = b.id;

create or replace function public.save_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  b uuid := (p ->> 'book_id')::uuid; pid uuid := nullif(p ->> 'id', '')::uuid; old app.products;
  s text := nullif(trim(p ->> 'sku'), ''); kit boolean := coalesce((p ->> 'is_kit')::boolean, false); c jsonb; n int := 0;
begin
  perform app.require(b, 'danh_muc');
  if coalesce(nullif(p ->> 'units_per_pack', '')::numeric, 1) <= 0 then raise exception 'Số lượng mỗi hộp phải lớn hơn 0'; end if;
  if coalesce(nullif(p ->> 'pack_weight', '')::numeric, 0) < 0 or coalesce(nullif(p ->> 'unit_weight', '')::numeric, 0) < 0 then
    raise exception 'Trọng lượng không được âm'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'Thiếu tên sản phẩm'; end if;
  if coalesce((p ->> 'price1')::numeric, 0) < 0 or coalesce((p ->> 'price2')::numeric, 0) < 0 or coalesce((p ->> 'price3')::numeric, 0) < 0 then
    raise exception 'Giá bán không được âm'; end if;
  if pid is null then
    if s is null then s := app.new_master_code(b, 'SP', 'products'); end if;
    if exists (select 1 from app.products where book_id = b and lower(sku) = lower(s)) then raise exception 'Mã SKU "%" đã tồn tại', s; end if;
    insert into app.products (book_id, sku, name, category, pattern, size, color, unit, image_url, price1, price2, price3, low_stock, is_kit, active, note, pack_unit, units_per_pack, pack_weight, unit_weight)
    values (b, s, trim(p ->> 'name'), p ->> 'category', p ->> 'pattern', p ->> 'size', p ->> 'color', coalesce(nullif(p ->> 'unit', ''), 'Cái'),
            p ->> 'image_url', coalesce((p ->> 'price1')::numeric, 0), coalesce((p ->> 'price2')::numeric, 0), coalesce((p ->> 'price3')::numeric, 0),
            coalesce((p ->> 'low_stock')::numeric, 0), kit, coalesce((p ->> 'active')::boolean, true), p ->> 'note',
            coalesce(nullif(trim(p ->> 'pack_unit'), ''), 'hộp'), nullif(p ->> 'units_per_pack', '')::numeric,
            nullif(p ->> 'pack_weight', '')::numeric, nullif(p ->> 'unit_weight', '')::numeric)
    returning id into pid;
  else
    select * into old from app.products where id = pid and book_id = b for update;
    if not found then raise exception 'Không tìm thấy sản phẩm'; end if;
    if s is null then s := old.sku; end if;
    if lower(s) <> lower(old.sku) and exists (select 1 from app.products where book_id = b and lower(sku) = lower(s) and id <> pid) then
      raise exception 'Mã SKU "%" đã tồn tại', s; end if;
    if kit <> old.is_kit and (exists (select 1 from app.stock_moves where product_id = pid)
        or exists (select 1 from app.sales_order_lines where product_id = pid)) then
      raise exception 'Sản phẩm đã có giao dịch — không thể đổi giữa hàng đơn lẻ và bộ. Hãy tạo mã mới.'; end if;
    update app.products set sku = s, name = trim(p ->> 'name'), category = p ->> 'category', pattern = p ->> 'pattern', size = p ->> 'size',
      color = p ->> 'color', unit = coalesce(nullif(p ->> 'unit', ''), 'Cái'), image_url = p ->> 'image_url',
      price1 = coalesce((p ->> 'price1')::numeric, 0), price2 = coalesce((p ->> 'price2')::numeric, 0), price3 = coalesce((p ->> 'price3')::numeric, 0),
      low_stock = coalesce((p ->> 'low_stock')::numeric, 0), is_kit = kit, active = coalesce((p ->> 'active')::boolean, true), note = p ->> 'note',
      pack_unit = coalesce(nullif(trim(p ->> 'pack_unit'), ''), 'hộp'), units_per_pack = nullif(p ->> 'units_per_pack', '')::numeric,
      pack_weight = nullif(p ->> 'pack_weight', '')::numeric, unit_weight = nullif(p ->> 'unit_weight', '')::numeric,
      updated_at = now()
    where id = pid;
  end if;
  if kit then
    delete from app.kit_items where kit_id = pid;
    for c in select * from jsonb_array_elements(coalesce(p -> 'components', '[]'::jsonb)) loop
      if (c ->> 'product_id')::uuid = pid then raise exception 'Bộ không thể chứa chính nó'; end if;
      if not exists (select 1 from app.products where id = (c ->> 'product_id')::uuid and book_id = b and not is_kit) then
        raise exception 'Thành phần của bộ phải là sản phẩm đơn lẻ trong cùng sổ'; end if;
      if coalesce((c ->> 'qty')::numeric, 0) <= 0 then raise exception 'Số lượng thành phần phải lớn hơn 0'; end if;
      insert into app.kit_items (kit_id, component_id, qty) values (pid, (c ->> 'product_id')::uuid, (c ->> 'qty')::numeric)
      on conflict (kit_id, component_id) do update set qty = app.kit_items.qty + excluded.qty;
      n := n + 1;
    end loop;
    if n = 0 then raise exception 'Bộ sản phẩm cần ít nhất 1 thành phần'; end if;
  end if;
  return jsonb_build_object('id', pid, 'sku', s);
end $$;

create or replace function public.import_products(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  b uuid := (p ->> 'book_id')::uuid; r jsonb; row jsonb; i int := 0; s text; pid uuid; ex app.products;
  created int := 0; updated int := 0; skipped_qty int := 0; ol jsonb := '[]'::jsonb; q numeric; cst numeric;
  adj jsonb := null; seen text[] := '{}'; warn jsonb := '[]'::jsonb; d date;
begin
  perform app.require(b, 'owner');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'import_products'); if r is not null then return r; end if;
  d := coalesce((p ->> 'opening_date')::date, app.today());
  for row in select * from jsonb_array_elements(coalesce(p -> 'rows', '[]'::jsonb)) loop
    i := i + 1;
    if coalesce(trim(row ->> 'name'), '') = '' then raise exception 'Dòng %: thiếu tên hàng hóa', i; end if;
    q := coalesce(nullif(row ->> 'qty', '')::numeric, 0);
    cst := nullif(row ->> 'cost', '')::numeric;
    if coalesce(nullif(row ->> 'pack_weight', '')::numeric, 0) < 0 or coalesce(nullif(row ->> 'unit_weight', '')::numeric, 0) < 0 then
      raise exception 'Dòng %: trọng lượng không được âm', i; end if;
    if q < 0 then raise exception 'Dòng %: số lượng không được âm', i; end if;
    if coalesce(cst, 0) < 0 or coalesce(nullif(row ->> 'price1', '')::numeric, 0) < 0 or coalesce(nullif(row ->> 'price2', '')::numeric, 0) < 0
       or coalesce(nullif(row ->> 'price3', '')::numeric, 0) < 0 then raise exception 'Dòng %: giá không được âm', i; end if;
    s := nullif(trim(row ->> 'sku'), '');
    if s is not null then
      if lower(s) = any(seen) then raise exception 'Dòng %: SKU "%" bị lặp trong file', i, s; end if;
      seen := seen || lower(s);
      select * into ex from app.products where book_id = b and lower(sku) = lower(s);
    else
      ex := null;
    end if;
    if ex.id is not null then
      update app.products set name = trim(row ->> 'name'),
        category = coalesce(nullif(row ->> 'category', ''), category), pattern = coalesce(nullif(row ->> 'pattern', ''), pattern),
        size = coalesce(nullif(row ->> 'size', ''), size), color = coalesce(nullif(row ->> 'color', ''), color),
        unit = coalesce(nullif(row ->> 'unit', ''), unit),
        units_per_pack = coalesce(nullif(row ->> 'units_per_pack', '')::numeric, units_per_pack), pack_unit = coalesce(nullif(trim(row ->> 'pack_unit'), ''), pack_unit),
        pack_weight = coalesce(nullif(row ->> 'pack_weight', '')::numeric, pack_weight), unit_weight = coalesce(nullif(row ->> 'unit_weight', '')::numeric, unit_weight),
        price1 = coalesce(nullif(row ->> 'price1', '')::numeric, price1), price2 = coalesce(nullif(row ->> 'price2', '')::numeric, price2),
        price3 = coalesce(nullif(row ->> 'price3', '')::numeric, price3),
        low_stock = coalesce(nullif(row ->> 'low_stock', '')::numeric, low_stock), note = coalesce(nullif(row ->> 'note', ''), note),
        updated_at = now()
      where id = ex.id;
      updated := updated + 1;
      if q > 0 then skipped_qty := skipped_qty + 1;
        warn := warn || jsonb_build_array(format('Dòng %s: SKU %s đã có — bỏ qua số lượng %s (tồn chỉ đổi qua phiếu điều chỉnh)', i, ex.sku, q)); end if;
    else
      if s is null then s := app.new_master_code(b, 'SP', 'products'); end if;
      insert into app.products (book_id, sku, name, category, pattern, size, color, unit, price1, price2, price3, low_stock, note, last_cost, units_per_pack, pack_unit, pack_weight, unit_weight)
      values (b, s, trim(row ->> 'name'), nullif(row ->> 'category', ''), nullif(row ->> 'pattern', ''), nullif(row ->> 'size', ''),
              nullif(row ->> 'color', ''), coalesce(nullif(row ->> 'unit', ''), 'Cái'),
              coalesce(nullif(row ->> 'price1', '')::numeric, 0), coalesce(nullif(row ->> 'price2', '')::numeric, 0),
              coalesce(nullif(row ->> 'price3', '')::numeric, 0), coalesce(nullif(row ->> 'low_stock', '')::numeric, 0),
              nullif(row ->> 'note', ''), coalesce(cst, 0), nullif(row ->> 'units_per_pack', '')::numeric, coalesce(nullif(trim(row ->> 'pack_unit'), ''), 'hộp'),
              nullif(row ->> 'pack_weight', '')::numeric, nullif(row ->> 'unit_weight', '')::numeric)
      returning id into pid;
      created := created + 1;
      if q > 0 then
        if cst is null then warn := warn || jsonb_build_array(format('Dòng %s: %s có số lượng nhưng chưa có giá vốn — ghi giá vốn 0', i, s)); end if;
        ol := ol || jsonb_build_array(jsonb_build_object('product_id', pid, 'qty_delta', q, 'unit_cost', coalesce(cst, 0)));
      end if;
    end if;
  end loop;
  if i = 0 then raise exception 'File không có dòng dữ liệu nào'; end if;
  if jsonb_array_length(ol) > 0 then
    adj := app.do_adjust(b, d, 'dau_ky', coalesce(p ->> 'note', 'Tồn đầu kỳ nhập từ Excel'), ol);
  end if;
  r := jsonb_build_object('created', created, 'updated', updated, 'skipped_qty', skipped_qty,
     'opening_lines', jsonb_array_length(ol),
     'opening_qty', (select coalesce(sum((x ->> 'qty_delta')::numeric), 0) from jsonb_array_elements(ol) x),
     'opening_value', (select coalesce(sum(value), 0) from app.stock_adjustment_lines where adjustment_id = (adj ->> 'id')::uuid),
     'adjustment_code', adj ->> 'code', 'warnings', warn);
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('save_product','import_products') loop
    execute format('revoke all on function %s from public', f.sig);
    begin execute format('revoke all on function %s from anon', f.sig); exception when others then null; end;
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
