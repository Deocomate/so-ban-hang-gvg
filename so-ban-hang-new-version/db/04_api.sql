-- =====================================================================
--  04. HÀM NGHIỆP VỤ (API). Mỗi hàm nhận 1 tham số JSON "p", trả JSON.
--  Mọi thao tác ghi chạy trong 1 giao dịch: hoặc thành công trọn vẹn, hoặc không ghi gì.
-- =====================================================================

-- ---------- SỔ & THIẾT LẬP ----------
-- Danh mục chi phí mặc định: nhóm lớn → khoản mục
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

create or replace function app.default_settings(p_variant text) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'vat_rate', 0.01,
    'pit_rate', 0.17,
    'price_names', case when p_variant = 'VG' then '["Giá lẻ","Giá sỉ","Giá CTV"]'::jsonb
                        else '["Giá lẻ","Giá đại lý","Giá công trình"]'::jsonb end,
    'channels', case when p_variant = 'VG' then '["Facebook","TikTok"]'::jsonb else '["Bán tại cửa hàng"]'::jsonb end,
    'categories', case when p_variant = 'VG'
      then '["Đồ thờ","Bình hút lộc","Ấm chén","Lọ hoa","Mosaic","Khác"]'::jsonb
      else '["Ngói","Gạch thông gió","Lan can - con tiện","Đèn vườn","Linh vật - phong thủy","Phụ kiện mái","Khác"]'::jsonb end,
    'units', '["Cái","Viên","Bộ","Đôi","Chiếc","m²","Thùng"]'::jsonb,
    'expense_groups', '["Mặt bằng","Điện, nước, internet","Công cụ dụng cụ","Marketing","Chi phí bán hàng","Nhân sự","Quản lý & khác"]'::jsonb,
    'expense_cats', app.default_expense_cats(),
    'fee_category', 'Phí sàn TMĐT',
    'prod_steps', '["Chờ sản xuất","Đang sản xuất","Đang trong lò","Đã sản xuất, chưa giao hàng","Đang giao về"]'::jsonb,
    'allow_oversell', false,
    'due_warn_days', 3,
    'lock_date', null,
    'staff_default_perms', '{"ban_hang":true,"thu_chi":true,"nhap_hang":false,"kho":false,"danh_muc":false,"chi_phi":false,"xem_gia_von":false,"xem_bao_cao":false}'::jsonb
  )
$$;

create or replace function app.create_book(p_name text, p_short text, p_owner uuid, p_demo boolean default false)
returns uuid language plpgsql as $$
declare b uuid;
begin
  insert into app.books (name, short_name, is_demo, settings)
  values (p_name, p_short, p_demo, app.default_settings(p_short)) returning id into b;
  insert into app.book_members (book_id, user_id, role, display_name) values (b, p_owner, 'owner', 'Chủ cửa hàng');
  insert into app.funds (book_id, name, sort) values (b, 'Tiền mặt', 1), (b, 'Tài khoản ngân hàng', 2);
  insert into app.customers (book_id, code, name, kind, price_tier) values (b, 'KL', 'Khách lẻ', 'Khách lẻ', 1);
  return b;
end $$;

-- Lần đầu đăng nhập: nếu hệ thống chưa có sổ nào, người đầu tiên thành chủ cửa hàng của 2 sổ.
create or replace function public.bootstrap(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Bạn chưa đăng nhập'; end if;
  if not exists (select 1 from app.book_members where user_id = auth.uid()) then
    if exists (select 1 from app.books where not is_demo) then
      raise exception 'Tài khoản này chưa được cấp quyền vào sổ nào. Hãy nhờ chủ cửa hàng thêm email của bạn trong Cài đặt → Người dùng.';
    end if;
    perform app.create_book('Gốm sứ Thanh Hải', 'TH', auth.uid());
    perform app.create_book('Gốm Vũ Gia', 'VG', auth.uid());
  end if;
  return public.my_books('{}'::jsonb);
end $$;

create or replace function public.my_books(p jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path = app, public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'short_name', b.short_name, 'is_demo', b.is_demo,
     'settings', b.settings, 'role', m.role, 'perms', m.perms, 'display_name', m.display_name) order by b.created_at), '[]'::jsonb)
  from app.books b join app.book_members m on m.book_id = b.id and m.user_id = auth.uid()
$$;

create or replace function public.update_book_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; s jsonb := coalesce(p -> 'settings', '{}'::jsonb);
begin
  perform app.require(b, 'owner');
  if s ? 'vat_rate' and ((s ->> 'vat_rate')::numeric < 0 or (s ->> 'vat_rate')::numeric > 0.2) then raise exception 'Thuế suất GTGT không hợp lệ'; end if;
  if s ? 'price_names' and jsonb_array_length(s -> 'price_names') <> 3 then raise exception 'Cần đúng 3 tên mức giá'; end if;
  update app.books set settings = settings || s, name = coalesce(nullif(p ->> 'name', ''), name) where id = b;
  return (select jsonb_build_object('settings', settings, 'name', name) from app.books where id = b);
end $$;

create or replace function public.upsert_member(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; u uuid; r text := coalesce(p ->> 'role', 'staff'); prm jsonb;
begin
  perform app.require(b, 'owner');
  if r not in ('owner','staff') then raise exception 'Vai trò không hợp lệ'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p ->> 'email'));
  if u is null then raise exception 'Chưa có tài khoản nào đăng ký bằng email "%". Hãy nhờ người này đăng ký trước, rồi thêm lại.', p ->> 'email'; end if;
  prm := coalesce(p -> 'perms', app.setting(b, 'staff_default_perms'), '{}'::jsonb);
  if u = auth.uid() and r <> 'owner' then raise exception 'Không thể tự hạ quyền của chính mình'; end if;
  insert into app.book_members (book_id, user_id, role, perms, display_name)
  values (b, u, r, prm, nullif(p ->> 'display_name', ''))
  on conflict (book_id, user_id) do update set role = excluded.role, perms = excluded.perms,
    display_name = coalesce(excluded.display_name, app.book_members.display_name);
  return jsonb_build_object('user_id', u);
end $$;

create or replace function public.remove_member(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; u uuid := (p ->> 'user_id')::uuid;
begin
  perform app.require(b, 'owner');
  if u = auth.uid() then raise exception 'Không thể tự xóa chính mình khỏi sổ'; end if;
  delete from app.book_members where book_id = b and user_id = u;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- DANH MỤC ----------
create or replace function app.new_master_code(p_book uuid, p_kind text, p_table text) returns text language plpgsql as $$
declare c text; ex boolean;
begin
  loop
    c := app.next_code(p_book, p_kind);
    execute format('select exists(select 1 from app.%I where book_id = $1 and lower(%I) = lower($2))', p_table,
                   case p_table when 'products' then 'sku' else 'code' end) into ex using p_book, c;
    exit when not ex;
  end loop;
  return c;
end $$;

create or replace function public.save_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  b uuid := (p ->> 'book_id')::uuid; pid uuid := nullif(p ->> 'id', '')::uuid; old app.products;
  s text := nullif(trim(p ->> 'sku'), ''); kit boolean := coalesce((p ->> 'is_kit')::boolean, false); c jsonb; n int := 0;
begin
  perform app.require(b, 'danh_muc');
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'Thiếu tên sản phẩm'; end if;
  if coalesce((p ->> 'price1')::numeric, 0) < 0 or coalesce((p ->> 'price2')::numeric, 0) < 0 or coalesce((p ->> 'price3')::numeric, 0) < 0 then
    raise exception 'Giá bán không được âm'; end if;
  if pid is null then
    if s is null then s := app.new_master_code(b, 'SP', 'products'); end if;
    if exists (select 1 from app.products where book_id = b and lower(sku) = lower(s)) then raise exception 'Mã SKU "%" đã tồn tại', s; end if;
    insert into app.products (book_id, sku, name, category, pattern, size, color, unit, image_url, price1, price2, price3, low_stock, is_kit, active, note)
    values (b, s, trim(p ->> 'name'), p ->> 'category', p ->> 'pattern', p ->> 'size', p ->> 'color', coalesce(nullif(p ->> 'unit', ''), 'Cái'),
            p ->> 'image_url', coalesce((p ->> 'price1')::numeric, 0), coalesce((p ->> 'price2')::numeric, 0), coalesce((p ->> 'price3')::numeric, 0),
            coalesce((p ->> 'low_stock')::numeric, 0), kit, coalesce((p ->> 'active')::boolean, true), p ->> 'note')
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

create or replace function public.save_party(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; k text := p ->> 'type'; pid uuid := nullif(p ->> 'id', '')::uuid; c text := nullif(trim(p ->> 'code'), '');
  tbl text; pre text;
begin
  perform app.require(b, 'danh_muc');
  if k not in ('kh','ncc') then raise exception 'Loại đối tượng không hợp lệ'; end if;
  tbl := case k when 'kh' then 'customers' else 'suppliers' end; pre := case k when 'kh' then 'KH' else 'NCC' end;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'Thiếu tên'; end if;
  if c is null and pid is null then c := app.new_master_code(b, pre, tbl); end if;
  if c is not null then
    execute format('select exists(select 1 from app.%I where book_id = $1 and lower(code) = lower($2) and id is distinct from $3)', tbl)
      into strict pre using b, c, pid;
    if pre::boolean then raise exception 'Mã "%" đã tồn tại', c; end if;
  end if;
  if k = 'kh' then
    if pid is null then
      insert into app.customers (book_id, code, name, phone, address, contact, kind, price_tier, credit_days, credit_limit, note)
      values (b, c, trim(p ->> 'name'), p ->> 'phone', p ->> 'address', p ->> 'contact', p ->> 'kind',
              coalesce((p ->> 'price_tier')::smallint, 1), coalesce((p ->> 'credit_days')::int, 0), coalesce((p ->> 'credit_limit')::numeric, 0), p ->> 'note')
      returning id into pid;
    else
      update app.customers set code = coalesce(c, code), name = trim(p ->> 'name'), phone = p ->> 'phone', address = p ->> 'address',
        contact = p ->> 'contact', kind = p ->> 'kind', price_tier = coalesce((p ->> 'price_tier')::smallint, 1),
        credit_days = coalesce((p ->> 'credit_days')::int, 0), credit_limit = coalesce((p ->> 'credit_limit')::numeric, 0),
        note = p ->> 'note', active = coalesce((p ->> 'active')::boolean, true)
      where id = pid and book_id = b;
      if not found then raise exception 'Không tìm thấy khách hàng'; end if;
    end if;
  else
    if pid is null then
      insert into app.suppliers (book_id, code, name, phone, address, contact, credit_days, note)
      values (b, c, trim(p ->> 'name'), p ->> 'phone', p ->> 'address', p ->> 'contact', coalesce((p ->> 'credit_days')::int, 0), p ->> 'note')
      returning id into pid;
    else
      update app.suppliers set code = coalesce(c, code), name = trim(p ->> 'name'), phone = p ->> 'phone', address = p ->> 'address',
        contact = p ->> 'contact', credit_days = coalesce((p ->> 'credit_days')::int, 0), note = p ->> 'note',
        active = coalesce((p ->> 'active')::boolean, true)
      where id = pid and book_id = b;
      if not found then raise exception 'Không tìm thấy nhà cung cấp'; end if;
    end if;
  end if;
  return jsonb_build_object('id', pid, 'code', c);
end $$;

create or replace function public.save_fund(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; fid uuid := nullif(p ->> 'id', '')::uuid;
begin
  perform app.require(b, 'owner');
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'Thiếu tên quỹ'; end if;
  if fid is null then
    insert into app.funds (book_id, name, opening_balance, sort)
    values (b, trim(p ->> 'name'), coalesce((p ->> 'opening_balance')::numeric, 0), coalesce((p ->> 'sort')::int, 9)) returning id into fid;
  else
    update app.funds set name = trim(p ->> 'name'), opening_balance = coalesce((p ->> 'opening_balance')::numeric, 0),
      active = coalesce((p ->> 'active')::boolean, true) where id = fid and book_id = b;
  end if;
  return jsonb_build_object('id', fid);
end $$;

create or replace function public.save_opening_debt(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; d uuid; c text; pt text := p ->> 'party_type'; pid uuid := (p ->> 'party_id')::uuid;
begin
  perform app.require(b, 'owner');
  if pt = 'kh' and not exists (select 1 from app.customers where id = pid and book_id = b) then raise exception 'Không tìm thấy khách hàng'; end if;
  if pt = 'ncc' and not exists (select 1 from app.suppliers where id = pid and book_id = b) then raise exception 'Không tìm thấy nhà cung cấp'; end if;
  if pt not in ('kh','ncc') then raise exception 'Loại đối tượng không hợp lệ'; end if;
  if coalesce((p ->> 'amount')::numeric, 0) = 0 then raise exception 'Số tiền nợ đầu kỳ phải khác 0'; end if;
  c := app.next_code(b, 'DK');
  insert into app.opening_debts (book_id, code, party_type, party_id, amount, debt_date, due_date, note, created_by)
  values (b, c, pt, pid, round((p ->> 'amount')::numeric), coalesce((p ->> 'debt_date')::date, app.today()),
          (p ->> 'due_date')::date, p ->> 'note', auth.uid()) returning id into d;
  return jsonb_build_object('id', d, 'code', c);
end $$;

create or replace function public.delete_opening_debt(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare d app.opening_debts;
begin
  select * into d from app.opening_debts where id = (p ->> 'id')::uuid;
  if not found then raise exception 'Không tìm thấy khoản nợ'; end if;
  perform app.require(d.book_id, 'owner');
  if exists (select 1 from app.v_alloc_signed where doc_id = d.id) then raise exception 'Khoản nợ đã có thanh toán — hãy hủy phiếu thu/chi trước'; end if;
  delete from app.opening_debts where id = d.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- KHO ----------
create or replace function app.do_adjust(p_book uuid, p_date date, p_reason text, p_note text, p_lines jsonb, p_check boolean default true)
returns jsonb language plpgsql as $$
declare a uuid; c text; l jsonb; pr app.products; q numeric; v numeric; lid uuid; cnt int := 0;
begin
  perform app.check_date(p_book, p_date);
  c := app.next_code(p_book, 'DC');
  insert into app.stock_adjustments (book_id, code, adj_date, reason, note, created_by)
  values (p_book, c, p_date, p_reason, p_note, auth.uid()) returning id into a;
  for l in select * from jsonb_array_elements(p_lines) loop
    q := (l ->> 'qty_delta')::numeric;
    if q is null or q = 0 then continue; end if;
    select * into pr from app.products where id = (l ->> 'product_id')::uuid and book_id = p_book for update;
    if not found then raise exception 'Không tìm thấy sản phẩm trong sổ'; end if;
    if pr.is_kit then raise exception '"%" là bộ — hãy điều chỉnh từng thành phần', pr.name; end if;
    if q < 0 and p_check and pr.on_hand + q < 0 then
      raise exception 'Không thể giảm % % "%": tồn hiện tại chỉ còn %', -q, pr.unit, pr.name, pr.on_hand; end if;
    if q > 0 and coalesce((l ->> 'unit_cost')::numeric, 0) < 0 then raise exception 'Giá vốn không được âm'; end if;
    insert into app.stock_adjustment_lines (adjustment_id, book_id, product_id, qty_delta, unit_cost, value)
    values (a, p_book, pr.id, q, 0, 0) returning id into lid;
    v := app.post_move(p_book, pr.id, p_date, q, (l ->> 'unit_cost')::numeric,
                       case when p_reason = 'dau_ky' then 'dau_ky' else 'dieu_chinh' end, a, c, lid, p_note, (l ->> 'value')::numeric);
    update app.stock_adjustment_lines set value = v, unit_cost = abs(v / q) where id = lid;
    cnt := cnt + 1;
  end loop;
  if cnt = 0 then raise exception 'Phiếu điều chỉnh chưa có dòng nào'; end if;
  return jsonb_build_object('id', a, 'code', c);
end $$;

create or replace function public.adjust_stock(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb; reason text := coalesce(p ->> 'reason', 'khac');
begin
  perform app.require(b, case when reason = 'dau_ky' then 'owner' else 'kho' end);
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'adjust_stock'); if r is not null then return r; end if;
  if reason in ('vo','loi','that_thoat','hang_tra_loi') and exists (select 1 from jsonb_array_elements(p -> 'lines') x where (x ->> 'qty_delta')::numeric > 0) then
    raise exception 'Hàng vỡ/lỗi/thất thoát chỉ được ghi giảm số lượng'; end if;
  if reason <> 'dau_ky' and coalesce(trim(p ->> 'note'), '') = '' and reason in ('khac','kiem_ke') then
    raise exception 'Hãy ghi rõ lý do điều chỉnh'; end if;
  r := app.do_adjust(b, coalesce((p ->> 'date')::date, app.today()), reason, p ->> 'note', coalesce(p -> 'lines', '[]'::jsonb));
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

-- ---------- IMPORT HÀNG HÓA (1 lần, kèm tồn đầu kỳ) ----------
-- Dòng có SKU đã tồn tại: chỉ cập nhật thông tin & giá, KHÔNG đổi tồn kho.
-- Dòng mới: tạo sản phẩm; nếu có số lượng > 0 thì ghi 1 phiếu "Tồn đầu kỳ" theo giá vốn.
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
      insert into app.products (book_id, sku, name, category, pattern, size, color, unit, price1, price2, price3, low_stock, note, last_cost)
      values (b, s, trim(row ->> 'name'), nullif(row ->> 'category', ''), nullif(row ->> 'pattern', ''), nullif(row ->> 'size', ''),
              nullif(row ->> 'color', ''), coalesce(nullif(row ->> 'unit', ''), 'Cái'),
              coalesce(nullif(row ->> 'price1', '')::numeric, 0), coalesce(nullif(row ->> 'price2', '')::numeric, 0),
              coalesce(nullif(row ->> 'price3', '')::numeric, 0), coalesce(nullif(row ->> 'low_stock', '')::numeric, 0),
              nullif(row ->> 'note', ''), coalesce(cst, 0))
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

-- Import khách hàng / nhà cung cấp kèm nợ đầu kỳ
create or replace function public.import_parties(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; k text := p ->> 'type'; r jsonb; row jsonb; i int := 0; res jsonb; pid uuid; c text;
  created int := 0; updated int := 0; debts int := 0; debt_total numeric := 0; amt numeric; isnew boolean; warn jsonb := '[]'::jsonb;
begin
  perform app.require(b, 'owner');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'import_parties'); if r is not null then return r; end if;
  for row in select * from jsonb_array_elements(coalesce(p -> 'rows', '[]'::jsonb)) loop
    i := i + 1;
    if coalesce(trim(row ->> 'name'), '') = '' then raise exception 'Dòng %: thiếu tên', i; end if;
    c := nullif(trim(row ->> 'code'), '');
    if k = 'kh' then select id into pid from app.customers where book_id = b and lower(code) = lower(c);
    else select id into pid from app.suppliers where book_id = b and lower(code) = lower(c); end if;
    isnew := pid is null;
    res := public.save_party(row || jsonb_build_object('book_id', b, 'type', k, 'id', pid));
    pid := (res ->> 'id')::uuid;
    if isnew then created := created + 1; else updated := updated + 1; end if;
    amt := coalesce(nullif(row ->> 'opening_debt', '')::numeric, 0);
    if amt <> 0 then
      if isnew then
        perform public.save_opening_debt(jsonb_build_object('book_id', b, 'party_type', k, 'party_id', pid, 'amount', amt,
          'debt_date', coalesce(nullif(row ->> 'debt_date', ''), p ->> 'debt_date'), 'due_date', nullif(row ->> 'due_date', ''),
          'note', 'Nợ đầu kỳ nhập từ Excel'));
        debts := debts + 1; debt_total := debt_total + round(amt);
      else
        warn := warn || jsonb_build_array(format('Dòng %s: mã %s đã có — bỏ qua nợ đầu kỳ %s', i, c, amt));
      end if;
    end if;
  end loop;
  r := jsonb_build_object('created', created, 'updated', updated, 'debts', debts, 'debt_total', debt_total, 'warnings', warn);
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

-- ---------- THU / CHI ----------
create or replace function app.suggest_alloc(p_book uuid, p_ptype text, p_party uuid, p_amount numeric) returns jsonb
language plpgsql as $$
declare left_amt numeric := p_amount; d record; res jsonb := '[]'::jsonb; a numeric;
begin
  -- 1) các khoản đã đến hạn trả (hàng đã giao/nhận, nợ đầu kỳ) – cũ trước
  for d in select * from app.v_open_docs where book_id = p_book and party_type = p_ptype and party_id = p_party
             and status <> 'huy' and remaining_due > 0 order by doc_date, code loop
    exit when left_amt <= 0;
    a := least(d.remaining_due, d.remaining_total, left_amt);
    if a > 0 then res := res || jsonb_build_array(jsonb_build_object('doc_type', d.doc_type, 'doc_id', d.doc_id, 'amount', a)); left_amt := left_amt - a; end if;
  end loop;
  return res;
end $$;

create or replace function app.do_payment(p_book uuid, p jsonb) returns jsonb language plpgsql as $$
declare
  k text := p ->> 'kind'; dir text; pt text; amt numeric; fee numeric; pid uuid := nullif(p ->> 'party_id', '')::uuid;
  pay app.payments; al jsonb; a jsonb; dt text; did uuid; aa numeric; tot numeric := 0; d record; lim numeric; c text;
  d_date date := coalesce((p ->> 'date')::date, app.today()); fid uuid := (p ->> 'fund_id')::uuid; tfid uuid := nullif(p ->> 'to_fund_id', '')::uuid;
begin
  dir := case when k in ('thu_khach','ncc_hoan','thu_khac','gop_von') then 'thu'
              when k in ('hoan_khach','tra_ncc','chi_phi','chi_khac','rut_von') then 'chi'
              when k = 'chuyen_quy' then 'chuyen' end;
  if dir is null then raise exception 'Loại phiếu thu/chi không hợp lệ'; end if;
  pt := case when k in ('thu_khach','hoan_khach') then 'kh' when k in ('tra_ncc','ncc_hoan') then 'ncc' end;
  amt := round((p ->> 'amount')::numeric);
  if amt is null or amt <= 0 then raise exception 'Số tiền phải lớn hơn 0'; end if;
  fee := coalesce(round(nullif(p ->> 'fee', '')::numeric), 0);
  if fee < 0 then raise exception 'Phí không được âm'; end if;
  if fee > 0 and k <> 'thu_khach' then raise exception 'Chỉ phiếu thu tiền khách mới có phí sàn/thu hộ'; end if;
  if fee >= amt then raise exception 'Phí sàn phải nhỏ hơn số tiền thu'; end if;
  perform app.check_date(p_book, d_date);
  if not exists (select 1 from app.funds where id = fid and book_id = p_book and active) then raise exception 'Chưa chọn quỹ / tài khoản hợp lệ'; end if;
  if dir = 'chuyen' then
    if tfid is null or tfid = fid or not exists (select 1 from app.funds where id = tfid and book_id = p_book) then
      raise exception 'Chọn quỹ nhận khác quỹ chuyển'; end if;
  else tfid := null;
  end if;
  if pt = 'kh' and (pid is null or not exists (select 1 from app.customers where id = pid and book_id = p_book)) then raise exception 'Chưa chọn khách hàng'; end if;
  if pt = 'ncc' and (pid is null or not exists (select 1 from app.suppliers where id = pid and book_id = p_book)) then raise exception 'Chưa chọn nhà cung cấp'; end if;
  if pt is null then pid := null; end if;

  c := app.next_code(p_book, case dir when 'thu' then 'PT' when 'chi' then 'PC' else 'CQ' end);
  insert into app.payments (book_id, code, pay_date, kind, direction, fund_id, to_fund_id, party_type, party_id, amount, fee, method, note, created_by)
  values (p_book, c, d_date, k, dir, fid, tfid, pt, pid, amt, fee, p ->> 'method', p ->> 'note', auth.uid()) returning * into pay;

  al := coalesce(p -> 'allocations', '[]'::jsonb);
  if jsonb_array_length(al) = 0 and coalesce((p ->> 'auto_allocate')::boolean, false) and k in ('thu_khach','tra_ncc') then
    al := app.suggest_alloc(p_book, pt, pid, amt);
  end if;
  for a in select * from jsonb_array_elements(al) loop
    dt := a ->> 'doc_type'; did := (a ->> 'doc_id')::uuid; aa := round((a ->> 'amount')::numeric);
    if aa is null or aa <= 0 then continue; end if;
    if not ((k in ('thu_khach','hoan_khach') and dt in ('don_ban','no_dau_ky'))
         or (k in ('tra_ncc','ncc_hoan') and dt in ('don_mua','no_dau_ky','chi_phi'))
         or (k = 'chi_phi' and dt = 'chi_phi')) then
      raise exception 'Phiếu "%" không thể gắn với loại chứng từ này', k; end if;
    select * into d from app.v_open_docs where book_id = p_book and doc_type = dt and doc_id = did;
    if not found then raise exception 'Không tìm thấy chứng từ cần thanh toán'; end if;
    if pt is not null and d.party_id is distinct from pid then raise exception 'Chứng từ % không thuộc đối tượng của phiếu', d.code; end if;
    if k = 'chi_phi' and d.party_id is not null then
      raise exception 'Chi phí % ghi nợ nhà cung cấp — hãy dùng phiếu "Trả tiền nhà cung cấp"', d.code; end if;
    if d.status = 'huy' and k not in ('hoan_khach','ncc_hoan') then raise exception 'Chứng từ % đã hủy', d.code; end if;
    if k in ('thu_khach','tra_ncc','chi_phi') then
      lim := d.remaining_total;
      if aa > lim then raise exception 'Số tiền gắn cho % (%) vượt số còn phải trả (%)', d.code, aa, greatest(lim, 0); end if;
    else
      lim := case when dt = 'no_dau_ky' then -d.remaining_total else d.paid_net - d.due_now end;
      if aa > lim then raise exception 'Số tiền hoàn cho % (%) vượt số đã trả dư (%)', d.code, aa, greatest(lim, 0); end if;
    end if;
    insert into app.payment_allocations (payment_id, book_id, doc_type, doc_id, amount) values (pay.id, p_book, dt, did, aa);
    tot := tot + aa;
  end loop;
  if tot > amt then raise exception 'Tổng số tiền gắn vào chứng từ (%) vượt số tiền phiếu (%)', tot, amt; end if;
  if k = 'chi_phi' and tot <> amt then raise exception 'Phiếu chi phí phải gắn đủ vào khoản chi phí. Khoản chi không có chứng từ hãy chọn "Chi khác".'; end if;

  if fee > 0 then
    insert into app.expenses (book_id, code, exp_date, category, description, amount, settled_payment_id, created_by)
    values (p_book, app.next_code(p_book, 'CP'), d_date, coalesce(nullif(p ->> 'fee_category', ''), app.setting(p_book, 'fee_category') #>> '{}', 'Phí sàn TMĐT'),
            coalesce(nullif(p ->> 'fee_note', ''), 'Phí sàn / thu hộ trừ vào phiếu ' || c), fee, pay.id, auth.uid());
  end if;
  return jsonb_build_object('id', pay.id, 'code', c, 'allocated', tot, 'unallocated', amt - tot);
end $$;

create or replace function public.create_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb;
begin
  perform app.require(b, 'thu_chi');
  if p ->> 'kind' in ('gop_von','rut_von','chuyen_quy') then perform app.require(b, 'owner'); end if;
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'create_payment'); if r is not null then return r; end if;
  r := app.do_payment(b, p);
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

create or replace function public.void_payment(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare pay app.payments;
begin
  select * into pay from app.payments where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy phiếu'; end if;
  perform app.require(pay.book_id, 'owner');
  if pay.voided then return jsonb_build_object('ok', true); end if;
  if coalesce(trim(p ->> 'reason'), '') = '' then raise exception 'Hãy ghi lý do hủy phiếu'; end if;
  perform app.check_date(pay.book_id, pay.pay_date);
  update app.payments set voided = true, void_reason = p ->> 'reason', voided_at = now() where id = pay.id;
  update app.expenses set voided = true, void_reason = 'Hủy theo phiếu ' || pay.code where settled_payment_id = pay.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- CHI PHÍ ----------
create or replace function public.save_expense(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb; e app.expenses; eid uuid := nullif(p ->> 'id', '')::uuid; amt numeric;
  sid uuid := nullif(p ->> 'supplier_id', '')::uuid; d date := coalesce((p ->> 'date')::date, app.today()); pay jsonb;
begin
  perform app.require(b, 'chi_phi');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'save_expense'); if r is not null then return r; end if;
  amt := round((p ->> 'amount')::numeric);
  if amt is null or amt <= 0 then raise exception 'Số tiền chi phí phải lớn hơn 0'; end if;
  if coalesce(trim(p ->> 'category'), '') = '' then raise exception 'Chọn nhóm chi phí'; end if;
  perform app.check_date(b, d);
  if sid is not null and not exists (select 1 from app.suppliers where id = sid and book_id = b) then raise exception 'Không tìm thấy nhà cung cấp'; end if;
  if eid is null then
    insert into app.expenses (book_id, code, exp_date, category, description, amount, supplier_id, note, created_by)
    values (b, app.next_code(b, 'CP'), d, p ->> 'category', p ->> 'description', amt, sid, p ->> 'note', auth.uid()) returning * into e;
  else
    select * into e from app.expenses where id = eid and book_id = b for update;
    if not found then raise exception 'Không tìm thấy khoản chi phí'; end if;
    if e.voided or e.settled_payment_id is not null then raise exception 'Không thể sửa khoản chi phí này'; end if;
    if exists (select 1 from app.v_alloc_signed where doc_id = e.id) then raise exception 'Chi phí đã thanh toán — hãy hủy phiếu chi trước khi sửa'; end if;
    perform app.check_date(b, e.exp_date);
    update app.expenses set exp_date = d, category = p ->> 'category', description = p ->> 'description', amount = amt,
      supplier_id = sid, note = p ->> 'note' where id = e.id returning * into e;
  end if;
  if nullif(p #>> '{pay_now,fund_id}', '') is not null then
    perform app.require(b, 'thu_chi');
    pay := app.do_payment(b, jsonb_build_object('kind', case when sid is null then 'chi_phi' else 'tra_ncc' end, 'date', d,
      'fund_id', p #>> '{pay_now,fund_id}', 'party_id', sid, 'amount', amt, 'method', p #>> '{pay_now,method}',
      'note', 'Trả chi phí ' || e.code || coalesce(' – ' || e.description, ''),
      'allocations', jsonb_build_array(jsonb_build_object('doc_type', 'chi_phi', 'doc_id', e.id, 'amount', amt))));
  end if;
  r := jsonb_build_object('id', e.id, 'code', e.code, 'payment_code', pay ->> 'code');
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

create or replace function public.void_expense(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare e app.expenses;
begin
  select * into e from app.expenses where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy chi phí'; end if;
  perform app.require(e.book_id, 'owner');
  if e.settled_payment_id is not null then raise exception 'Phí sàn này gắn với phiếu thu — hãy hủy phiếu thu'; end if;
  if exists (select 1 from app.v_alloc_signed where doc_id = e.id) then raise exception 'Chi phí đã thanh toán — hãy hủy phiếu chi trước'; end if;
  if coalesce(trim(p ->> 'reason'), '') = '' then raise exception 'Hãy ghi lý do hủy'; end if;
  perform app.check_date(e.book_id, e.exp_date);
  update app.expenses set voided = true, void_reason = p ->> 'reason' where id = e.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- BÁN HÀNG ----------
create or replace function app.availability_warnings(p_order uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(format('%s – %s: còn có thể bán %s, đơn cần %s', p.sku, p.name, greatest(p.on_hand - coalesce(rs.reserved, 0) + x.need, 0), x.need)), '[]'::jsonb)
  from (select product_id, sum(qty) need from app.v_reserve where order_id = p_order group by product_id) x
  join app.products p on p.id = x.product_id
  left join app.v_reserve_sum rs on rs.product_id = p.id
  where p.on_hand - coalesce(rs.reserved, 0) < 0
$$;

create or replace function app.do_deliver(p_order uuid, p_date date, p_lines jsonb, p_ship numeric, p_note text, p_override boolean)
returns jsonb language plpgsql as $$
declare
  o app.sales_orders; bk app.books; allow boolean; rec record; pr app.products; avail numeric; gross numeric; factor numeric;
  dlv uuid; dcode text; sl app.sales_order_lines; ln jsonb; q numeric; unet numeric; rev numeric; cg numeric; v numeric; dlid uuid;
  kc record; last_dl uuid; diff numeric; cnt int := 0; shipped numeric; total_rev numeric := 0;
begin
  select * into o from app.sales_orders where id = p_order for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  if o.status = 'nhap' then raise exception 'Đơn % đang là nháp — hãy xác nhận đơn trước khi giao', o.code; end if;
  if o.status = 'huy' then raise exception 'Đơn % đã hủy', o.code; end if;
  perform app.check_date(o.book_id, p_date);
  select * into bk from app.books where id = o.book_id;
  allow := coalesce(p_override, false) and app.is_owner(o.book_id) and coalesce((bk.settings ->> 'allow_oversell')::boolean, false);

  -- kiểm tra số lượng giao từng dòng
  for ln in select * from jsonb_array_elements(p_lines) loop
    q := coalesce((ln ->> 'qty')::numeric, 0);
    if q < 0 then raise exception 'Số lượng giao không được âm'; end if;
    if q = 0 then continue; end if;
    select * into sl from app.sales_order_lines where id = (ln ->> 'order_line_id')::uuid and order_id = o.id for update;
    if not found then raise exception 'Dòng hàng không thuộc đơn %', o.code; end if;
    if q > sl.qty - sl.cancelled_qty - sl.delivered_qty then
      raise exception 'Giao vượt số lượng còn phải giao (dòng %: còn %)', sl.line_no, sl.qty - sl.cancelled_qty - sl.delivered_qty; end if;
    if exists (select 1 from app.products where id = sl.product_id and is_kit)
       and not exists (select 1 from app.kit_items where kit_id = sl.product_id) then
      raise exception 'Bộ sản phẩm ở dòng % chưa khai báo thành phần', sl.line_no; end if;
    cnt := cnt + 1;
  end loop;
  if cnt = 0 then raise exception 'Chưa nhập số lượng giao'; end if;

  -- kiểm tra tồn có thể bán (khóa dòng tồn kho theo thứ tự để tránh 2 người cùng bán 1 món)
  for rec in
    with req as (select (x ->> 'order_line_id')::uuid lid, (x ->> 'qty')::numeric q from jsonb_array_elements(p_lines) x where (x ->> 'qty')::numeric > 0),
    need as (
      select coalesce(k.component_id, l.product_id) pid, sum(r.q * coalesce(k.qty, 1)) need
      from req r join app.sales_order_lines l on l.id = r.lid join app.products p on p.id = l.product_id
      left join app.kit_items k on p.is_kit and k.kit_id = p.id group by 1)
    select pid, need from need order by pid
  loop
    select * into pr from app.products where id = rec.pid for update;
    avail := pr.on_hand - coalesce((select sum(qty) from app.v_reserve where product_id = pr.id and order_id <> o.id), 0);
    if rec.need > avail and not allow then
      raise exception 'Không đủ hàng để giao: % – % cần %, chỉ còn % % có thể bán (đã trừ hàng giữ cho đơn khác)',
        pr.sku, pr.name, rec.need, greatest(avail, 0), pr.unit;
    end if;
  end loop;

  select sum((qty - cancelled_qty) * unit_price * (1 - discount_pct / 100)) into gross from app.sales_order_lines where order_id = o.id;
  factor := case when coalesce(gross, 0) > 0 then greatest(0, 1 - o.discount / gross) else 1 end;
  select coalesce(sum(shipping_fee), 0) into shipped from app.deliveries where order_id = o.id;

  dcode := app.next_code(o.book_id, 'GH');
  insert into app.deliveries (book_id, code, order_id, delivery_date, shipping_fee, note, created_by)
  values (o.book_id, dcode, o.id, p_date, round(coalesce(p_ship, greatest(o.shipping_fee - shipped, 0))), p_note, auth.uid())
  returning id into dlv;

  for ln in select x.* from jsonb_array_elements(p_lines) x
            join app.sales_order_lines l on l.id = (x ->> 'order_line_id')::uuid order by l.line_no loop
    q := coalesce((ln ->> 'qty')::numeric, 0);
    continue when q <= 0;
    select * into sl from app.sales_order_lines where id = (ln ->> 'order_line_id')::uuid;
    unet := round(sl.unit_price * (1 - sl.discount_pct / 100) * factor, 4);
    rev := round(q * unet);
    insert into app.delivery_lines (delivery_id, book_id, order_line_id, product_id, qty, unit_price_net, revenue, cogs)
    values (dlv, o.book_id, sl.id, sl.product_id, q, unet, rev, 0) returning id into dlid;
    cg := 0;
    if exists (select 1 from app.products where id = sl.product_id and is_kit) then
      for kc in select component_id, qty from app.kit_items where kit_id = sl.product_id order by component_id loop
        v := app.post_move(o.book_id, kc.component_id, p_date, -(q * kc.qty), null, 'giao', dlv, dcode, dlid, 'Thành phần bộ');
        cg := cg - v;
      end loop;
    else
      v := app.post_move(o.book_id, sl.product_id, p_date, -q, null, 'giao', dlv, dcode, dlid, null);
      cg := -v;
    end if;
    update app.delivery_lines set cogs = cg where id = dlid;
    update app.sales_order_lines set delivered_qty = delivered_qty + q where id = sl.id;
    last_dl := dlid;
  end loop;

  -- Giao xong toàn bộ đơn: làm tròn để tổng doanh thu đúng bằng tiền hàng của đơn
  if not exists (select 1 from app.sales_order_lines where order_id = o.id and qty - cancelled_qty - delivered_qty > 0) then
    select coalesce(sum(x.revenue), 0) into total_rev from app.delivery_lines x join app.deliveries d on d.id = x.delivery_id where d.order_id = o.id;
    diff := greatest(round(gross - o.discount), 0) - total_rev;
    if diff <> 0 then
      update app.delivery_lines set revenue = revenue + diff where id = last_dl and revenue + diff >= 0;
    end if;
  end if;
  return jsonb_build_object('id', dlv, 'code', dcode);
end $$;

create or replace function public.save_sales_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  b uuid := (p ->> 'book_id')::uuid; r jsonb; oid uuid := nullif(p ->> 'id', '')::uuid; o app.sales_orders; cust app.customers;
  ln jsonb; i int := 0; pr app.products; price numeric; st text; keep uuid[] := '{}'; lid uuid; dep jsonb; dlv jsonb; cnt int;
  kind text := coalesce(nullif(p ->> 'kind', ''), 'ban_san'); deliver_now boolean := coalesce((p ->> 'deliver_now')::boolean, false);
  d date := coalesce((p ->> 'order_date')::date, app.today()); polid uuid;
begin
  perform app.require(b, 'ban_hang');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'save_sales_order'); if r is not null then return r; end if;
  perform app.check_date(b, d);
  select * into cust from app.customers where id = (p ->> 'customer_id')::uuid and book_id = b;
  if not found then raise exception 'Chưa chọn khách hàng'; end if;
  if kind not in ('ban_san','dat_hang') then raise exception 'Loại đơn không hợp lệ'; end if;
  if coalesce((p ->> 'discount')::numeric, 0) < 0 or coalesce((p ->> 'shipping_fee')::numeric, 0) < 0 then raise exception 'Giảm giá / phí vận chuyển không được âm'; end if;
  if jsonb_array_length(coalesce(p -> 'lines', '[]'::jsonb)) = 0 then raise exception 'Đơn hàng chưa có sản phẩm'; end if;
  st := case when deliver_now or p ->> 'status' = 'xac_nhan' then 'xac_nhan' else 'nhap' end;

  if oid is null then
    insert into app.sales_orders (book_id, code, kind, status, customer_id, channel, order_date, due_date, staff, discount, shipping_fee, note,
                                  created_by, confirmed_at)
    values (b, app.next_code(b, 'DH'), kind, st, cust.id, p ->> 'channel', d, (p ->> 'due_date')::date, p ->> 'staff',
            round(coalesce((p ->> 'discount')::numeric, 0)), round(coalesce((p ->> 'shipping_fee')::numeric, 0)), p ->> 'note',
            auth.uid(), case when st = 'xac_nhan' then now() end)
    returning * into o;
  else
    select * into o from app.sales_orders where id = oid and book_id = b for update;
    if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
    if o.status = 'huy' then raise exception 'Đơn đã hủy, không thể sửa'; end if;
    if exists (select 1 from app.deliveries where order_id = o.id) then
      raise exception 'Đơn % đã giao hàng — không sửa được. Hãy dùng "Hủy phần chưa giao" hoặc "Trả hàng".', o.code; end if;
    perform app.check_date(b, o.order_date);
    update app.sales_orders set kind = kind, customer_id = cust.id, channel = p ->> 'channel', order_date = d,
      due_date = (p ->> 'due_date')::date, staff = p ->> 'staff', discount = round(coalesce((p ->> 'discount')::numeric, 0)),
      shipping_fee = round(coalesce((p ->> 'shipping_fee')::numeric, 0)), note = p ->> 'note',
      status = case when st = 'xac_nhan' then 'xac_nhan' else status end,
      confirmed_at = case when st = 'xac_nhan' and confirmed_at is null then now() else confirmed_at end
    where id = o.id returning * into o;
    update app.sales_orders set kind = coalesce(nullif(p ->> 'kind', ''), o.kind) where id = o.id;
  end if;

  for ln in select * from jsonb_array_elements(p -> 'lines') loop
    i := i + 1;
    select * into pr from app.products where id = (ln ->> 'product_id')::uuid and book_id = b;
    if not found then raise exception 'Dòng %: chưa chọn sản phẩm', i; end if;
    if coalesce((ln ->> 'qty')::numeric, 0) <= 0 then raise exception 'Dòng % (%): số lượng phải lớn hơn 0', i, pr.sku; end if;
    price := coalesce(nullif(ln ->> 'unit_price', '')::numeric,
                      case cust.price_tier when 2 then pr.price2 when 3 then pr.price3 else pr.price1 end);
    if price < 0 then raise exception 'Dòng %: đơn giá không được âm', i; end if;
    if coalesce((ln ->> 'discount_pct')::numeric, 0) not between 0 and 100 then raise exception 'Dòng %: chiết khấu phải từ 0 đến 100%%', i; end if;
    polid := nullif(ln ->> 'po_line_id', '')::uuid;
    if polid is not null and pr.is_kit then raise exception 'Dòng %: bộ sản phẩm không gắn trực tiếp với đơn đặt xưởng', i; end if;
    lid := nullif(ln ->> 'id', '')::uuid;
    if lid is not null and exists (select 1 from app.sales_order_lines where id = lid and order_id = o.id) then
      update app.sales_order_lines set line_no = i, product_id = pr.id, qty = (ln ->> 'qty')::numeric, unit_price = price,
        discount_pct = coalesce((ln ->> 'discount_pct')::numeric, 0), cancelled_qty = 0, po_line_id = polid, note = ln ->> 'note'
      where id = lid;
    else
      insert into app.sales_order_lines (order_id, book_id, line_no, product_id, qty, unit_price, discount_pct, po_line_id, note)
      values (o.id, b, i, pr.id, (ln ->> 'qty')::numeric, price, coalesce((ln ->> 'discount_pct')::numeric, 0), polid, ln ->> 'note')
      returning id into lid;
    end if;
    keep := keep || lid;
  end loop;
  update app.purchase_order_lines set sales_order_line_id = null
   where sales_order_line_id in (select id from app.sales_order_lines where order_id = o.id and not (id = any(keep)));
  delete from app.sales_order_lines where order_id = o.id and not (id = any(keep));

  if coalesce(nullif(p #>> '{deposit,amount}', '')::numeric, 0) > 0 then
    perform app.require(b, 'thu_chi');
    dep := app.do_payment(b, jsonb_build_object('kind', 'thu_khach', 'date', d, 'fund_id', p #>> '{deposit,fund_id}',
      'party_id', cust.id, 'amount', (p #>> '{deposit,amount}')::numeric, 'fee', p #>> '{deposit,fee}', 'method', p #>> '{deposit,method}',
      'note', case when deliver_now then 'Thu tiền đơn ' else 'Đặt cọc đơn ' end || o.code,
      'allocations', jsonb_build_array(jsonb_build_object('doc_type', 'don_ban', 'doc_id', o.id, 'amount', (p #>> '{deposit,amount}')::numeric))));
  end if;

  if deliver_now then
    dlv := app.do_deliver(o.id, coalesce((p ->> 'deliver_date')::date, d),
      (select jsonb_agg(jsonb_build_object('order_line_id', id, 'qty', qty - cancelled_qty - delivered_qty)) from app.sales_order_lines where order_id = o.id),
      null, null, coalesce((p ->> 'override')::boolean, false));
  end if;

  r := jsonb_build_object('id', o.id, 'code', o.code, 'payment_code', dep ->> 'code', 'delivery_code', dlv ->> 'code',
                          'warnings', case when st = 'xac_nhan' and not deliver_now then app.availability_warnings(o.id) else '[]'::jsonb end);
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

create or replace function public.confirm_sales_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare o app.sales_orders;
begin
  select * into o from app.sales_orders where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  perform app.require(o.book_id, 'ban_hang');
  if o.status = 'xac_nhan' then return jsonb_build_object('ok', true, 'warnings', app.availability_warnings(o.id)); end if;
  if o.status <> 'nhap' then raise exception 'Đơn đã hủy'; end if;
  update app.sales_orders set status = 'xac_nhan', confirmed_at = now() where id = o.id;
  return jsonb_build_object('ok', true, 'warnings', app.availability_warnings(o.id));
end $$;

create or replace function public.cancel_sales_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare o app.sales_orders; paid numeric;
begin
  select * into o from app.sales_orders where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  perform app.require(o.book_id, 'ban_hang');
  if o.status = 'huy' then return jsonb_build_object('ok', true); end if;
  if exists (select 1 from app.deliveries where order_id = o.id) then
    raise exception 'Đơn % đã giao hàng nên không hủy được. Phần đã giao: dùng "Trả hàng". Phần chưa giao: dùng "Hủy phần chưa giao".', o.code; end if;
  if coalesce(trim(p ->> 'reason'), '') = '' then raise exception 'Hãy ghi lý do hủy đơn'; end if;
  update app.sales_orders set status = 'huy', cancel_reason = p ->> 'reason', cancelled_at = now() where id = o.id;
  update app.sales_order_lines set po_line_id = null where order_id = o.id;
  update app.purchase_order_lines set sales_order_line_id = null where sales_order_line_id in (select id from app.sales_order_lines where order_id = o.id);
  select coalesce(paid_net, 0) into paid from app.v_doc_paid where doc_id = o.id;
  return jsonb_build_object('ok', true, 'paid', coalesce(paid, 0));
end $$;

-- Hủy phần chưa giao (từng dòng hoặc toàn bộ)
create or replace function public.cancel_remaining(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare o app.sales_orders; ln jsonb; sl app.sales_order_lines; q numeric; n int := 0;
begin
  select * into o from app.sales_orders where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  perform app.require(o.book_id, 'ban_hang');
  if o.status <> 'xac_nhan' then raise exception 'Chỉ áp dụng cho đơn đã xác nhận'; end if;
  if jsonb_array_length(coalesce(p -> 'lines', '[]'::jsonb)) = 0 then
    update app.sales_order_lines set cancelled_qty = qty - delivered_qty where order_id = o.id and qty - cancelled_qty - delivered_qty > 0;
    get diagnostics n = row_count;
  else
    for ln in select * from jsonb_array_elements(p -> 'lines') loop
      q := coalesce((ln ->> 'qty')::numeric, 0); continue when q <= 0;
      select * into sl from app.sales_order_lines where id = (ln ->> 'order_line_id')::uuid and order_id = o.id for update;
      if not found then raise exception 'Dòng không thuộc đơn'; end if;
      if q > sl.qty - sl.cancelled_qty - sl.delivered_qty then raise exception 'Số lượng hủy vượt phần chưa giao (dòng %)', sl.line_no; end if;
      update app.sales_order_lines set cancelled_qty = cancelled_qty + q where id = sl.id; n := n + 1;
    end loop;
  end if;
  if n = 0 then raise exception 'Không còn phần nào chưa giao để hủy'; end if;
  update app.sales_orders set note = concat_ws(E'\n', note, 'Hủy phần chưa giao: ' || coalesce(p ->> 'reason', '')) where id = o.id;
  return jsonb_build_object('ok', true, 'lines', n);
end $$;

create or replace function public.deliver(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare o app.sales_orders; r jsonb;
begin
  select * into o from app.sales_orders where id = (p ->> 'order_id')::uuid;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  perform app.require(o.book_id, 'ban_hang');
  r := app.req_begin((p ->> 'request_id')::uuid, o.book_id, 'deliver'); if r is not null then return r; end if;
  r := app.do_deliver(o.id, coalesce((p ->> 'date')::date, app.today()), coalesce(p -> 'lines', '[]'::jsonb),
                      nullif(p ->> 'shipping_fee', '')::numeric, p ->> 'note', coalesce((p ->> 'override')::boolean, false));
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

-- Trả hàng: nhận hàng về (theo giá vốn lúc giao), giảm doanh thu, giảm công nợ, hoàn tiền nếu có
create or replace function public.sales_return(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  o app.sales_orders; r jsonb; rid uuid; rc text; ln jsonb; dl app.delivery_lines; q numeric; full_ret boolean; rev numeric;
  rlid uuid; m record; cq numeric; cv numeric; v numeric; cg numeric; prev_rev numeric; prev_val numeric; loss jsonb := '[]'::jsonb;
  restock boolean; d date := coalesce((p ->> 'date')::date, app.today()); refund numeric; pay jsonb; adj jsonb; n int := 0;
begin
  select * into o from app.sales_orders where id = (p ->> 'order_id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  perform app.require(o.book_id, 'ban_hang');
  r := app.req_begin((p ->> 'request_id')::uuid, o.book_id, 'sales_return'); if r is not null then return r; end if;
  perform app.check_date(o.book_id, d);
  rc := app.next_code(o.book_id, 'TL');
  insert into app.sales_returns (book_id, code, order_id, return_date, reason, note, created_by)
  values (o.book_id, rc, o.id, d, p ->> 'reason', p ->> 'note', auth.uid()) returning id into rid;

  for ln in select * from jsonb_array_elements(coalesce(p -> 'lines', '[]'::jsonb)) loop
    q := coalesce((ln ->> 'qty')::numeric, 0); continue when q <= 0;
    restock := coalesce((ln ->> 'restock')::boolean, true);
    select x.* into dl from app.delivery_lines x join app.deliveries dd on dd.id = x.delivery_id
     where x.id = (ln ->> 'delivery_line_id')::uuid and dd.order_id = o.id for update of x;
    if not found then raise exception 'Dòng giao hàng không thuộc đơn %', o.code; end if;
    if q > dl.qty - dl.returned_qty then raise exception 'Số lượng trả vượt số đã giao chưa trả (còn %)', dl.qty - dl.returned_qty; end if;
    full_ret := (q = dl.qty - dl.returned_qty);
    select coalesce(sum(revenue), 0) into prev_rev from app.sales_return_lines where delivery_line_id = dl.id;
    rev := case when full_ret then dl.revenue - prev_rev else round(dl.revenue * q / dl.qty) end;
    insert into app.sales_return_lines (return_id, book_id, delivery_line_id, product_id, qty, revenue, cogs, restock)
    values (rid, o.book_id, dl.id, dl.product_id, q, rev, 0, restock) returning id into rlid;
    cg := 0;
    for m in select product_id, sum(qty) qty, sum(value) value from app.stock_moves
             where doc_type = 'giao' and line_id = dl.id and qty < 0 group by product_id order by product_id loop
      cq := -m.qty * q / dl.qty;
      if full_ret then
        select coalesce(sum(sm.value), 0) into prev_val from app.stock_moves sm join app.sales_return_lines srl on srl.id = sm.line_id
         where sm.doc_type = 'tra_hang' and srl.delivery_line_id = dl.id and sm.product_id = m.product_id and srl.id <> rlid;
        cv := -m.value - prev_val;
      else
        cv := round(-m.value * q / dl.qty);
      end if;
      v := app.post_move(o.book_id, m.product_id, d, cq, null, 'tra_hang', rid, rc, rlid, p ->> 'reason', cv);
      cg := cg + v;
      if not restock then
        loss := loss || jsonb_build_array(jsonb_build_object('product_id', m.product_id, 'qty_delta', -cq, 'value', v));
      end if;
    end loop;
    update app.sales_return_lines set cogs = cg where id = rlid;
    update app.delivery_lines set returned_qty = returned_qty + q where id = dl.id;
    update app.sales_order_lines set returned_qty = returned_qty + q where id = dl.order_line_id;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Chưa nhập số lượng trả'; end if;

  if jsonb_array_length(loss) > 0 then
    adj := app.do_adjust(o.book_id, d, 'hang_tra_loi', 'Hàng khách trả bị lỗi, không nhập lại kho – phiếu ' || rc, loss, false);
  end if;
  refund := coalesce(nullif(p #>> '{refund,amount}', '')::numeric, 0);
  if refund > 0 then
    perform app.require(o.book_id, 'thu_chi');
    pay := app.do_payment(o.book_id, jsonb_build_object('kind', 'hoan_khach', 'date', d, 'fund_id', p #>> '{refund,fund_id}',
      'party_id', o.customer_id, 'amount', refund, 'method', p #>> '{refund,method}', 'note', 'Hoàn tiền trả hàng ' || rc,
      'allocations', jsonb_build_array(jsonb_build_object('doc_type', 'don_ban', 'doc_id', o.id, 'amount', refund))));
  end if;
  r := jsonb_build_object('id', rid, 'code', rc, 'refund_code', pay ->> 'code', 'loss_code', adj ->> 'code',
    'revenue', (select sum(revenue) from app.sales_return_lines where return_id = rid));
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

-- ---------- MUA HÀNG / ĐẶT XƯỞNG ----------
create or replace function app.do_receive(p_po uuid, p_date date, p_lines jsonb, p_note text) returns jsonb language plpgsql as $$
declare po app.purchase_orders; gid uuid; gc text; ln jsonb; pl app.purchase_order_lines; q numeric; uc numeric; lid uuid; v numeric; n int := 0;
begin
  select * into po from app.purchase_orders where id = p_po for update;
  if not found then raise exception 'Không tìm thấy đơn nhập'; end if;
  if po.status = 'nhap' then raise exception 'Đơn % đang là nháp — hãy xác nhận trước khi nhận hàng', po.code; end if;
  if po.status = 'huy' then raise exception 'Đơn % đã hủy', po.code; end if;
  perform app.check_date(po.book_id, p_date);
  gc := app.next_code(po.book_id, 'NK');
  insert into app.goods_receipts (book_id, code, po_id, receipt_date, note, created_by)
  values (po.book_id, gc, po.id, p_date, p_note, auth.uid()) returning id into gid;
  for ln in select * from jsonb_array_elements(p_lines) loop
    q := coalesce((ln ->> 'qty')::numeric, 0);
    if q < 0 then raise exception 'Số lượng nhận không được âm'; end if;
    continue when q = 0;
    select * into pl from app.purchase_order_lines where id = (ln ->> 'po_line_id')::uuid and po_id = po.id for update;
    if not found then raise exception 'Dòng hàng không thuộc đơn %', po.code; end if;
    if q > pl.qty - pl.cancelled_qty - pl.received_qty then
      raise exception 'Nhận vượt số lượng còn chờ (dòng %: còn %)', pl.line_no, pl.qty - pl.cancelled_qty - pl.received_qty; end if;
    uc := coalesce(nullif(ln ->> 'unit_cost', '')::numeric, pl.unit_cost);
    if uc < 0 then raise exception 'Giá nhập không được âm'; end if;
    insert into app.goods_receipt_lines (receipt_id, book_id, po_line_id, product_id, qty, unit_cost, value)
    values (gid, po.book_id, pl.id, pl.product_id, q, uc, round(q * uc)) returning id into lid;
    v := app.post_move(po.book_id, pl.product_id, p_date, q, uc, 'nhap', gid, gc, lid, null, round(q * uc));
    update app.purchase_order_lines set received_qty = received_qty + q where id = pl.id;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Chưa nhập số lượng nhận'; end if;
  return jsonb_build_object('id', gid, 'code', gc);
end $$;

create or replace function public.save_purchase_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  b uuid := (p ->> 'book_id')::uuid; r jsonb; pid uuid := nullif(p ->> 'id', '')::uuid; po app.purchase_orders; ln jsonb; i int := 0;
  pr app.products; keep uuid[] := '{}'; lid uuid; st text; dep jsonb; rcv jsonb; sol uuid; soid uuid := nullif(p ->> 'sales_order_id', '')::uuid;
  kind text := coalesce(nullif(p ->> 'kind', ''), 'mua_san'); steps jsonb; d date := coalesce((p ->> 'order_date')::date, app.today());
  receive_now boolean := coalesce((p ->> 'receive_now')::boolean, false);
begin
  perform app.require(b, 'nhap_hang');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'save_purchase_order'); if r is not null then return r; end if;
  perform app.check_date(b, d);
  if not exists (select 1 from app.suppliers where id = (p ->> 'supplier_id')::uuid and book_id = b) then raise exception 'Chưa chọn nhà cung cấp / xưởng'; end if;
  if kind not in ('mua_san','dat_sx') then raise exception 'Loại đơn nhập không hợp lệ'; end if;
  if soid is not null and not exists (select 1 from app.sales_orders where id = soid and book_id = b and status <> 'huy') then raise exception 'Đơn bán liên kết không hợp lệ'; end if;
  if jsonb_array_length(coalesce(p -> 'lines', '[]'::jsonb)) = 0 then raise exception 'Đơn nhập chưa có sản phẩm'; end if;
  steps := app.setting(b, 'prod_steps');
  st := case when receive_now or p ->> 'status' = 'xac_nhan' then 'xac_nhan' else 'nhap' end;
  if pid is null then
    insert into app.purchase_orders (book_id, code, kind, status, supplier_id, order_date, expected_date, prod_step, prod_step_at, sales_order_id, note, created_by, confirmed_at)
    values (b, app.next_code(b, 'DN'), kind, st, (p ->> 'supplier_id')::uuid, d, (p ->> 'expected_date')::date,
            case when kind = 'dat_sx' then coalesce(nullif(p ->> 'prod_step', ''), steps ->> 0) end,
            case when kind = 'dat_sx' then now() end, soid, p ->> 'note', auth.uid(), case when st = 'xac_nhan' then now() end)
    returning * into po;
  else
    select * into po from app.purchase_orders where id = pid and book_id = b for update;
    if not found then raise exception 'Không tìm thấy đơn nhập'; end if;
    if po.status = 'huy' then raise exception 'Đơn đã hủy'; end if;
    if exists (select 1 from app.goods_receipts where po_id = po.id) then raise exception 'Đơn % đã nhận hàng — không sửa được. Hãy dùng "Hủy phần chưa nhận".', po.code; end if;
    update app.purchase_orders set kind = kind, supplier_id = (p ->> 'supplier_id')::uuid, order_date = d,
      expected_date = (p ->> 'expected_date')::date, sales_order_id = soid, note = p ->> 'note',
      status = case when st = 'xac_nhan' then 'xac_nhan' else status end,
      confirmed_at = case when st = 'xac_nhan' and confirmed_at is null then now() else confirmed_at end
    where id = po.id returning * into po;
  end if;
  for ln in select * from jsonb_array_elements(p -> 'lines') loop
    i := i + 1;
    select * into pr from app.products where id = (ln ->> 'product_id')::uuid and book_id = b;
    if not found then raise exception 'Dòng %: chưa chọn sản phẩm', i; end if;
    if pr.is_kit then raise exception 'Dòng %: "%" là bộ — hãy nhập từng thành phần', i, pr.name; end if;
    if coalesce((ln ->> 'qty')::numeric, 0) <= 0 then raise exception 'Dòng %: số lượng phải lớn hơn 0', i; end if;
    if coalesce((ln ->> 'unit_cost')::numeric, -1) < 0 then raise exception 'Dòng % (%): chưa nhập giá nhập', i, pr.sku; end if;
    sol := nullif(ln ->> 'sales_order_line_id', '')::uuid;
    if sol is not null and not exists (select 1 from app.sales_order_lines l join app.sales_orders o on o.id = l.order_id
        where l.id = sol and l.product_id = pr.id and o.book_id = b and o.status <> 'huy') then
      raise exception 'Dòng %: dòng đơn bán liên kết không khớp sản phẩm', i; end if;
    lid := nullif(ln ->> 'id', '')::uuid;
    if lid is not null and exists (select 1 from app.purchase_order_lines where id = lid and po_id = po.id) then
      update app.purchase_order_lines set line_no = i, product_id = pr.id, qty = (ln ->> 'qty')::numeric, unit_cost = (ln ->> 'unit_cost')::numeric,
        cancelled_qty = 0, sales_order_line_id = sol, note = ln ->> 'note' where id = lid;
    else
      insert into app.purchase_order_lines (po_id, book_id, line_no, product_id, qty, unit_cost, sales_order_line_id, note)
      values (po.id, b, i, pr.id, (ln ->> 'qty')::numeric, (ln ->> 'unit_cost')::numeric, sol, ln ->> 'note') returning id into lid;
    end if;
    keep := keep || lid;
    if sol is not null then update app.sales_order_lines set po_line_id = lid where id = sol; end if;
  end loop;
  update app.sales_order_lines set po_line_id = null
   where po_line_id in (select id from app.purchase_order_lines where po_id = po.id and not (id = any(keep)));
  delete from app.purchase_order_lines where po_id = po.id and not (id = any(keep));

  if coalesce(nullif(p #>> '{deposit,amount}', '')::numeric, 0) > 0 then
    perform app.require(b, 'thu_chi');
    dep := app.do_payment(b, jsonb_build_object('kind', 'tra_ncc', 'date', d, 'fund_id', p #>> '{deposit,fund_id}',
      'party_id', po.supplier_id, 'amount', (p #>> '{deposit,amount}')::numeric, 'method', p #>> '{deposit,method}',
      'note', case when receive_now then 'Trả tiền đơn ' else 'Đặt cọc đơn ' end || po.code,
      'allocations', jsonb_build_array(jsonb_build_object('doc_type', 'don_mua', 'doc_id', po.id, 'amount', (p #>> '{deposit,amount}')::numeric))));
  end if;
  if receive_now then
    rcv := app.do_receive(po.id, coalesce((p ->> 'receive_date')::date, d),
      (select jsonb_agg(jsonb_build_object('po_line_id', id, 'qty', qty - cancelled_qty - received_qty)) from app.purchase_order_lines where po_id = po.id), null);
  end if;
  r := jsonb_build_object('id', po.id, 'code', po.code, 'payment_code', dep ->> 'code', 'receipt_code', rcv ->> 'code');
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

create or replace function public.confirm_purchase_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare po app.purchase_orders;
begin
  select * into po from app.purchase_orders where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn nhập'; end if;
  perform app.require(po.book_id, 'nhap_hang');
  if po.status = 'huy' then raise exception 'Đơn đã hủy'; end if;
  update app.purchase_orders set status = 'xac_nhan', confirmed_at = coalesce(confirmed_at, now()) where id = po.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancel_purchase_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare po app.purchase_orders;
begin
  select * into po from app.purchase_orders where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn nhập'; end if;
  perform app.require(po.book_id, 'nhap_hang');
  if exists (select 1 from app.goods_receipts where po_id = po.id) then
    raise exception 'Đơn % đã nhận hàng. Dùng "Hủy phần chưa nhận" hoặc "Trả hàng cho NCC".', po.code; end if;
  if coalesce(trim(p ->> 'reason'), '') = '' then raise exception 'Hãy ghi lý do hủy'; end if;
  update app.purchase_orders set status = 'huy', cancel_reason = p ->> 'reason', cancelled_at = now() where id = po.id;
  update app.sales_order_lines set po_line_id = null where po_line_id in (select id from app.purchase_order_lines where po_id = po.id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cancel_po_remaining(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare po app.purchase_orders; n int;
begin
  select * into po from app.purchase_orders where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn nhập'; end if;
  perform app.require(po.book_id, 'nhap_hang');
  update app.purchase_order_lines set cancelled_qty = qty - received_qty where po_id = po.id and qty - cancelled_qty - received_qty > 0;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Không còn phần nào chưa nhận'; end if;
  update app.purchase_orders set note = concat_ws(E'\n', note, 'Hủy phần chưa nhận: ' || coalesce(p ->> 'reason', '')) where id = po.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_prod_step(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare po app.purchase_orders; s text := p ->> 'step';
begin
  select * into po from app.purchase_orders where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn nhập'; end if;
  perform app.require(po.book_id, 'nhap_hang');
  if not (app.setting(po.book_id, 'prod_steps') ? s) then raise exception 'Trạng thái sản xuất "%" không có trong danh sách', s; end if;
  update app.purchase_orders set prod_step = s, prod_step_at = now() where id = po.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.receive(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare po app.purchase_orders; r jsonb;
begin
  select * into po from app.purchase_orders where id = (p ->> 'po_id')::uuid;
  if not found then raise exception 'Không tìm thấy đơn nhập'; end if;
  perform app.require(po.book_id, 'nhap_hang');
  r := app.req_begin((p ->> 'request_id')::uuid, po.book_id, 'receive'); if r is not null then return r; end if;
  r := app.do_receive(po.id, coalesce((p ->> 'date')::date, app.today()), coalesce(p -> 'lines', '[]'::jsonb), p ->> 'note');
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

create or replace function public.supplier_return(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare po app.purchase_orders; r jsonb; rid uuid; rc text; ln jsonb; gl app.goods_receipt_lines; q numeric; pr app.products; val numeric;
  lid uuid; d date := coalesce((p ->> 'date')::date, app.today()); pay jsonb; n int := 0; avail numeric;
begin
  select * into po from app.purchase_orders where id = (p ->> 'po_id')::uuid for update;
  if not found then raise exception 'Không tìm thấy đơn nhập'; end if;
  perform app.require(po.book_id, 'nhap_hang');
  r := app.req_begin((p ->> 'request_id')::uuid, po.book_id, 'supplier_return'); if r is not null then return r; end if;
  perform app.check_date(po.book_id, d);
  rc := app.next_code(po.book_id, 'TN');
  insert into app.supplier_returns (book_id, code, po_id, return_date, reason, note, created_by)
  values (po.book_id, rc, po.id, d, p ->> 'reason', p ->> 'note', auth.uid()) returning id into rid;
  for ln in select * from jsonb_array_elements(coalesce(p -> 'lines', '[]'::jsonb)) loop
    q := coalesce((ln ->> 'qty')::numeric, 0); continue when q <= 0;
    select x.* into gl from app.goods_receipt_lines x join app.goods_receipts g on g.id = x.receipt_id
     where x.id = (ln ->> 'receipt_line_id')::uuid and g.po_id = po.id for update of x;
    if not found then raise exception 'Dòng nhận hàng không thuộc đơn %', po.code; end if;
    if q > gl.qty - gl.returned_qty then raise exception 'Số lượng trả vượt số đã nhận (còn %)', gl.qty - gl.returned_qty; end if;
    select * into pr from app.products where id = gl.product_id for update;
    avail := pr.on_hand - coalesce((select reserved from app.v_reserve_sum where product_id = pr.id), 0);
    if q > pr.on_hand then raise exception 'Tồn kho của % chỉ còn % — không đủ để trả nhà cung cấp', pr.sku, pr.on_hand; end if;
    val := round(q * gl.unit_cost);
    insert into app.supplier_return_lines (return_id, book_id, receipt_line_id, product_id, qty, unit_cost, value)
    values (rid, po.book_id, gl.id, gl.product_id, q, gl.unit_cost, val) returning id into lid;
    perform app.post_move(po.book_id, gl.product_id, d, -q, null, 'tra_ncc', rid, rc, lid, p ->> 'reason', val);
    update app.goods_receipt_lines set returned_qty = returned_qty + q where id = gl.id;
    update app.purchase_order_lines set returned_qty = returned_qty + q where id = gl.po_line_id;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Chưa nhập số lượng trả'; end if;
  if coalesce(nullif(p #>> '{refund,amount}', '')::numeric, 0) > 0 then
    perform app.require(po.book_id, 'thu_chi');
    pay := app.do_payment(po.book_id, jsonb_build_object('kind', 'ncc_hoan', 'date', d, 'fund_id', p #>> '{refund,fund_id}',
      'party_id', po.supplier_id, 'amount', (p #>> '{refund,amount}')::numeric, 'note', 'NCC hoàn tiền trả hàng ' || rc,
      'allocations', jsonb_build_array(jsonb_build_object('doc_type', 'don_mua', 'doc_id', po.id, 'amount', (p #>> '{refund,amount}')::numeric))));
  end if;
  r := jsonb_build_object('id', rid, 'code', rc, 'refund_code', pay ->> 'code');
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;
