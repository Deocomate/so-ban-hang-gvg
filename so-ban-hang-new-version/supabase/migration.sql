-- Sổ Bán Hàng Gốm — tạo toàn bộ cơ sở dữ liệu trên Supabase (chạy 1 lần trong SQL Editor)
-- Gồm: 01_schema … 11_weight. KHÔNG gồm 00_demo_shim (chỉ dùng cho bản chạy thử).

-- ===== db/01_schema.sql =====
-- =====================================================================
--  GỐM SỨ – PHẦN MỀM QUẢN LÝ BÁN HÀNG
--  01. CẤU TRÚC DỮ LIỆU
--  Bảng gốc nằm trong schema "app" (KHÔNG mở ra API). Ứng dụng chỉ đọc/ghi
--  qua các hàm public.* (kiểm tra quyền, khóa dòng, chống ghi trùng).
-- =====================================================================
create schema if not exists app;

-- ---------- SỔ (mỗi thương hiệu một sổ riêng) ----------
create table app.books (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  is_demo boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table app.book_members (
  book_id uuid not null references app.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  perms jsonb not null default '{}'::jsonb,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (book_id, user_id)
);

create table app.doc_counters (
  book_id uuid not null references app.books(id) on delete cascade,
  kind text not null,
  last_no integer not null default 0,
  primary key (book_id, kind)
);

create table app.request_log (
  request_id uuid primary key,
  book_id uuid,
  fn text not null,
  result jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);

-- ---------- DANH MỤC ----------
create table app.products (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  sku text not null,
  name text not null,
  category text,
  pattern text,          -- mẫu
  size text,             -- kích thước
  color text,            -- màu men / màu sắc
  unit text not null default 'Cái',
  image_url text,
  price1 numeric not null default 0,   -- giá bán mức 1 (vd. giá lẻ)
  price2 numeric not null default 0,   -- giá bán mức 2 (vd. giá sỉ/đại lý)
  price3 numeric not null default 0,   -- giá bán mức 3 (vd. giá công trình/CTV)
  low_stock numeric not null default 0,
  is_kit boolean not null default false,  -- bán theo bộ
  active boolean not null default true,
  note text,
  on_hand numeric not null default 0,      -- tồn thực tế (sổ kho tự cập nhật)
  stock_value numeric not null default 0,  -- giá trị tồn theo giá vốn
  last_cost numeric not null default 0,    -- giá vốn bình quân gần nhất
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_sku_uq on app.products (book_id, lower(sku));

create table app.kit_items (
  kit_id uuid not null references app.products(id) on delete cascade,
  component_id uuid not null references app.products(id),
  qty numeric not null check (qty > 0),
  primary key (kit_id, component_id)
);

create table app.customers (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  name text not null,
  phone text, address text, contact text,
  kind text,
  price_tier smallint not null default 1 check (price_tier between 1 and 3),
  credit_days integer not null default 0,
  credit_limit numeric not null default 0,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index customers_code_uq on app.customers (book_id, lower(code));

create table app.suppliers (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  name text not null,
  phone text, address text, contact text,
  credit_days integer not null default 0,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index suppliers_code_uq on app.suppliers (book_id, lower(code));

create table app.funds (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  name text not null,
  opening_balance numeric not null default 0,
  sort integer not null default 0,
  active boolean not null default true
);

-- ---------- NỢ ĐẦU KỲ ----------
create table app.opening_debts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  party_type text not null check (party_type in ('kh','ncc')),
  party_id uuid not null,
  amount numeric not null,          -- + còn nợ ; − đã trả trước
  debt_date date not null,
  due_date date,
  note text,
  created_by uuid, created_at timestamptz not null default now()
);

-- ---------- BÁN HÀNG ----------
create table app.sales_orders (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  kind text not null default 'ban_san' check (kind in ('ban_san','dat_hang')),
  status text not null default 'nhap' check (status in ('nhap','xac_nhan','huy')),
  customer_id uuid references app.customers(id),
  channel text,
  order_date date not null,
  due_date date,              -- ngày hẹn giao
  staff text,
  discount numeric not null default 0,      -- giảm giá cả đơn (VND)
  shipping_fee numeric not null default 0,  -- phí vận chuyển thu của khách
  note text,
  cancel_reason text,
  created_by uuid, created_at timestamptz not null default now(),
  confirmed_at timestamptz, cancelled_at timestamptz
);
create unique index sales_orders_code_uq on app.sales_orders (book_id, code);

create table app.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references app.sales_orders(id) on delete cascade,
  book_id uuid not null,
  line_no integer not null,
  product_id uuid not null references app.products(id),
  qty numeric not null check (qty > 0),
  unit_price numeric not null check (unit_price >= 0),
  discount_pct numeric not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  cancelled_qty numeric not null default 0,
  delivered_qty numeric not null default 0,   -- tự cập nhật
  returned_qty numeric not null default 0,    -- tự cập nhật
  po_line_id uuid,            -- dòng đơn đặt NCC/xưởng phục vụ dòng này (đơn đặt riêng)
  note text
);

create table app.deliveries (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  order_id uuid not null references app.sales_orders(id),
  delivery_date date not null,
  shipping_fee numeric not null default 0,
  note text,
  created_by uuid, created_at timestamptz not null default now()
);

create table app.delivery_lines (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references app.deliveries(id) on delete cascade,
  book_id uuid not null,
  order_line_id uuid not null references app.sales_order_lines(id),
  product_id uuid not null references app.products(id),
  qty numeric not null check (qty > 0),
  unit_price_net numeric not null,  -- giá đã trừ chiết khấu dòng + phần giảm giá đơn
  revenue numeric not null,         -- doanh thu (gồm thuế) của dòng
  cogs numeric not null,            -- giá vốn tại thời điểm giao (lưu cố định)
  returned_qty numeric not null default 0
);

create table app.sales_returns (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  order_id uuid not null references app.sales_orders(id),
  return_date date not null,
  reason text,
  note text,
  created_by uuid, created_at timestamptz not null default now()
);

create table app.sales_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references app.sales_returns(id) on delete cascade,
  book_id uuid not null,
  delivery_line_id uuid not null references app.delivery_lines(id),
  product_id uuid not null references app.products(id),
  qty numeric not null check (qty > 0),
  revenue numeric not null,   -- doanh thu bị giảm
  cogs numeric not null,      -- giá vốn được hoàn lại (theo giá lúc giao)
  restock boolean not null default true
);

-- ---------- MUA HÀNG / ĐẶT XƯỞNG ----------
create table app.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  kind text not null default 'mua_san' check (kind in ('mua_san','dat_sx')),
  status text not null default 'nhap' check (status in ('nhap','xac_nhan','huy')),
  supplier_id uuid references app.suppliers(id),
  order_date date not null,
  expected_date date,
  prod_step text,
  prod_step_at timestamptz,
  sales_order_id uuid references app.sales_orders(id),
  note text,
  cancel_reason text,
  created_by uuid, created_at timestamptz not null default now(),
  confirmed_at timestamptz, cancelled_at timestamptz
);
create unique index purchase_orders_code_uq on app.purchase_orders (book_id, code);

create table app.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references app.purchase_orders(id) on delete cascade,
  book_id uuid not null,
  line_no integer not null,
  product_id uuid not null references app.products(id),
  qty numeric not null check (qty > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  cancelled_qty numeric not null default 0,
  received_qty numeric not null default 0,   -- tự cập nhật
  returned_qty numeric not null default 0,   -- tự cập nhật
  sales_order_line_id uuid,
  note text
);

create table app.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  po_id uuid not null references app.purchase_orders(id),
  receipt_date date not null,
  note text,
  created_by uuid, created_at timestamptz not null default now()
);

create table app.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references app.goods_receipts(id) on delete cascade,
  book_id uuid not null,
  po_line_id uuid not null references app.purchase_order_lines(id),
  product_id uuid not null references app.products(id),
  qty numeric not null check (qty > 0),
  unit_cost numeric not null,
  value numeric not null,
  returned_qty numeric not null default 0
);

create table app.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  po_id uuid not null references app.purchase_orders(id),
  return_date date not null,
  reason text, note text,
  created_by uuid, created_at timestamptz not null default now()
);

create table app.supplier_return_lines (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references app.supplier_returns(id) on delete cascade,
  book_id uuid not null,
  receipt_line_id uuid not null references app.goods_receipt_lines(id),
  product_id uuid not null references app.products(id),
  qty numeric not null check (qty > 0),
  unit_cost numeric not null,
  value numeric not null
);

-- ---------- KHO ----------
create table app.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  adj_date date not null,
  reason text not null check (reason in ('dau_ky','vo','loi','that_thoat','kiem_ke','hang_tra_loi','khac')),
  note text,
  created_by uuid, created_at timestamptz not null default now()
);

create table app.stock_adjustment_lines (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references app.stock_adjustments(id) on delete cascade,
  book_id uuid not null,
  product_id uuid not null references app.products(id),
  qty_delta numeric not null check (qty_delta <> 0),
  unit_cost numeric not null,
  value numeric not null
);

-- Sổ kho: mỗi biến động truy ngược về chứng từ gốc. Chỉ hệ thống ghi.
create table app.stock_moves (
  id bigserial primary key,
  book_id uuid not null,
  product_id uuid not null references app.products(id),
  move_date date not null,
  qty numeric not null,          -- + nhập / − xuất
  value numeric not null,        -- + / − giá trị theo giá vốn
  unit_cost numeric not null,
  doc_type text not null,        -- dau_ky, nhap, tra_ncc, giao, tra_hang, dieu_chinh, chenh_lech
  doc_id uuid not null,
  doc_code text,
  line_id uuid,
  balance_qty numeric not null,
  balance_value numeric not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index stock_moves_prod_idx on app.stock_moves (product_id, id);
create index stock_moves_book_date_idx on app.stock_moves (book_id, move_date);

-- ---------- TIỀN ----------
create table app.payments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  pay_date date not null,
  kind text not null check (kind in ('thu_khach','hoan_khach','tra_ncc','ncc_hoan','chi_phi','thu_khac','chi_khac','gop_von','rut_von','chuyen_quy')),
  direction text not null check (direction in ('thu','chi','chuyen')),
  fund_id uuid not null references app.funds(id),
  to_fund_id uuid references app.funds(id),
  party_type text check (party_type in ('kh','ncc')),
  party_id uuid,
  amount numeric not null check (amount > 0),
  fee numeric not null default 0 check (fee >= 0),   -- phí sàn/thu hộ bị trừ (chỉ phiếu thu khách)
  method text,
  note text,
  voided boolean not null default false,
  void_reason text,
  voided_at timestamptz,
  created_by uuid, created_at timestamptz not null default now()
);
create index payments_book_date_idx on app.payments (book_id, pay_date);

create table app.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references app.payments(id) on delete cascade,
  book_id uuid not null,
  doc_type text not null check (doc_type in ('don_ban','don_mua','chi_phi','no_dau_ky')),
  doc_id uuid not null,
  amount numeric not null check (amount > 0)
);
create index payment_alloc_doc_idx on app.payment_allocations (doc_id);

create table app.expenses (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  exp_date date not null,
  category text not null,
  description text,
  amount numeric not null check (amount > 0),
  supplier_id uuid references app.suppliers(id),   -- nếu nợ nhà cung cấp dịch vụ
  settled_payment_id uuid references app.payments(id),  -- phí sàn bị trừ thẳng vào tiền thu
  voided boolean not null default false,
  void_reason text,
  note text,
  created_by uuid, created_at timestamptz not null default now()
);

-- ---------- NHẬT KÝ CHỈNH SỬA ----------
create table app.audit_log (
  id bigserial primary key,
  book_id uuid,
  user_id uuid,
  at timestamptz not null default clock_timestamp(),
  table_name text not null,
  op text not null,
  row_id text,
  old_data jsonb,
  new_data jsonb
);
create index audit_book_at_idx on app.audit_log (book_id, at desc);

-- Không ai (ngoài hàm hệ thống) được đọc/ghi trực tiếp bảng gốc.
revoke all on schema app from public;
do $$ begin
  execute 'revoke all on schema app from anon, authenticated';
exception when others then null; end $$;

-- ===== db/02_core.sql =====
-- =====================================================================
--  02. HÀM NỀN: quyền, số chứng từ, chống ghi trùng, ngày, sổ kho, nhật ký
-- =====================================================================

-- Ngày hôm nay theo giờ Việt Nam (máy chủ Supabase chạy giờ UTC)
create or replace function app.today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create or replace function app.perm_label(p text) returns text language sql immutable as $$
  select case p
    when 'ban_hang' then 'Bán hàng (tạo đơn, giao hàng, trả hàng)'
    when 'nhap_hang' then 'Nhập hàng / đặt xưởng'
    when 'thu_chi' then 'Thu chi tiền'
    when 'kho' then 'Điều chỉnh kho'
    when 'danh_muc' then 'Sửa sản phẩm, khách hàng, nhà cung cấp'
    when 'chi_phi' then 'Ghi chi phí'
    when 'xem_gia_von' then 'Xem giá vốn, lợi nhuận, giá trị tồn kho'
    when 'xem_bao_cao' then 'Xem tổng quan và báo cáo'
    when 'owner' then 'Chủ cửa hàng'
    else p end
$$;

-- Có quyền không (không báo lỗi)
create or replace function app.can(p_book uuid, p_perm text) returns boolean
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare m app.book_members;
begin
  select * into m from app.book_members where book_id = p_book and user_id = auth.uid();
  if not found then return false; end if;
  if m.role = 'owner' then return true; end if;
  if p_perm is null then return true; end if;
  if p_perm = 'owner' then return false; end if;
  return coalesce((m.perms ->> p_perm)::boolean, false);
end $$;

-- Bắt buộc có quyền (báo lỗi tiếng Việt)
create or replace function app.require(p_book uuid, p_perm text) returns void
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare m app.book_members;
begin
  if auth.uid() is null then raise exception 'Bạn chưa đăng nhập' using errcode = '42501'; end if;
  select * into m from app.book_members where book_id = p_book and user_id = auth.uid();
  if not found then raise exception 'Bạn không có quyền truy cập sổ này' using errcode = '42501'; end if;
  if m.role = 'owner' or p_perm is null then return; end if;
  if p_perm = 'owner' then raise exception 'Chỉ chủ cửa hàng được thực hiện thao tác này' using errcode = '42501'; end if;
  if not coalesce((m.perms ->> p_perm)::boolean, false) then
    raise exception 'Bạn chưa được cấp quyền: %', app.perm_label(p_perm) using errcode = '42501';
  end if;
end $$;

create or replace function app.is_owner(p_book uuid) returns boolean language sql stable security definer
set search_path = app, public, pg_temp as $$
  select exists (select 1 from app.book_members where book_id = p_book and user_id = auth.uid() and role = 'owner')
$$;

create or replace function app.setting(p_book uuid, p_key text) returns jsonb language sql stable as $$
  select settings -> p_key from app.books where id = p_book
$$;

-- Số chứng từ tự tăng, không trùng kể cả khi nhiều người cùng lưu
create or replace function app.next_code(p_book uuid, p_kind text) returns text language plpgsql as $$
declare n integer;
begin
  insert into app.doc_counters (book_id, kind, last_no) values (p_book, p_kind, 1)
  on conflict (book_id, kind) do update set last_no = app.doc_counters.last_no + 1
  returning last_no into n;
  return p_kind || lpad(n::text, 5, '0');
end $$;

-- Kiểm tra ngày chứng từ: không để trống, không ở tương lai, không rơi vào kỳ đã khóa sổ
create or replace function app.check_date(p_book uuid, p_date date) returns date language plpgsql stable as $$
declare lk date;
begin
  if p_date is null then raise exception 'Thiếu ngày chứng từ'; end if;
  if p_date > app.today() then raise exception 'Ngày % ở tương lai — không thể ghi nhận trước', to_char(p_date, 'DD/MM/YYYY'); end if;
  lk := nullif(app.setting(p_book, 'lock_date') #>> '{}', '')::date;
  if lk is not null and p_date <= lk then
    raise exception 'Sổ đã khóa đến ngày % — không thể ghi chứng từ ngày %', to_char(lk, 'DD/MM/YYYY'), to_char(p_date, 'DD/MM/YYYY');
  end if;
  return p_date;
end $$;

-- ---------- Chống ghi trùng khi bấm nút nhiều lần ----------
-- Mỗi lần mở form, ứng dụng tạo 1 mã yêu cầu (request_id). Gửi lại cùng mã -> trả về kết quả cũ.
create or replace function app.req_begin(p_req uuid, p_book uuid, p_fn text) returns jsonb language plpgsql as $$
begin
  if p_req is null then return null; end if;
  begin
    insert into app.request_log (request_id, book_id, fn, user_id) values (p_req, p_book, p_fn, auth.uid());
    return null;
  exception when unique_violation then
    return coalesce((select result from app.request_log where request_id = p_req), '{"duplicate":true}'::jsonb)
           || jsonb_build_object('duplicate', true);
  end;
end $$;

create or replace function app.req_end(p_req uuid, p_res jsonb) returns jsonb language plpgsql as $$
begin
  if p_req is not null then update app.request_log set result = p_res where request_id = p_req; end if;
  return p_res;
end $$;

-- ---------- Giá vốn bình quân hiện tại ----------
create or replace function app.avg_cost(p app.products) returns numeric language sql immutable as $$
  select case when p.on_hand > 0 then p.stock_value / p.on_hand else p.last_cost end
$$;

-- ---------- GHI SỔ KHO (lõi giá vốn bình quân gia quyền di động) ----------
-- p_qty > 0: nhập. Giá trị = p_value (nếu có) hoặc p_qty * p_unit_cost.
-- p_qty < 0: xuất. Giá trị = p_value (nếu có, vd. trả NCC theo giá mua) hoặc theo giá vốn bình quân hiện tại.
-- Sau mỗi lần nhập, giá vốn bình quân = tổng giá trị tồn / tổng số lượng tồn.
create or replace function app.post_move(
  p_book uuid, p_product uuid, p_date date, p_qty numeric, p_unit_cost numeric,
  p_doc_type text, p_doc_id uuid, p_doc_code text, p_line uuid, p_note text, p_value numeric default null
) returns numeric  -- trả về giá trị (có dấu) của biến động
language plpgsql as $$
declare
  p app.products;
  v numeric; nq numeric; nv numeric; avgc numeric; adj numeric := 0; inflow_cost numeric;
begin
  select * into p from app.products where id = p_product and book_id = p_book for update;
  if not found then raise exception 'Không tìm thấy sản phẩm'; end if;
  if p.is_kit then raise exception 'Sản phẩm "%" là bộ — không có tồn riêng', p.name; end if;
  if p_qty = 0 then return 0; end if;

  if p_qty > 0 then
    v := coalesce(round(p_value), round(p_qty * coalesce(p_unit_cost, app.avg_cost(p))));
    inflow_cost := v / p_qty;
    nq := p.on_hand + p_qty;
    nv := p.stock_value + v;
    -- Đang âm kho (đã bán quá) rồi nhập về: đưa giá trị tồn về đúng giá nhập, phần chênh tính vào giá vốn
    if p.on_hand < 0 and nq > 0 then
      adj := round(nq * inflow_cost) - nv;
      nv := nv + adj;
    end if;
  else
    avgc := app.avg_cost(p);
    if p_value is not null then
      v := -abs(round(p_value));
    elsif p.on_hand > 0 and -p_qty = p.on_hand then
      v := -p.stock_value;                     -- xuất hết: lấy đúng toàn bộ giá trị còn lại
    else
      v := -round(-p_qty * avgc);
    end if;
    nq := p.on_hand + p_qty;
    nv := p.stock_value + v;
    if nq = 0 and nv <> 0 then                 -- hết hàng mà còn lẻ giá trị: chuyển phần lẻ vào giá vốn
      adj := -nv; nv := 0;
    end if;
  end if;

  insert into app.stock_moves (book_id, product_id, move_date, qty, value, unit_cost, doc_type, doc_id, doc_code, line_id,
                               balance_qty, balance_value, note, created_by)
  values (p_book, p_product, p_date, p_qty, v, abs(v / p_qty), p_doc_type, p_doc_id, p_doc_code, p_line,
          nq, nv - adj, p_note, auth.uid());

  if adj <> 0 then
    insert into app.stock_moves (book_id, product_id, move_date, qty, value, unit_cost, doc_type, doc_id, doc_code, line_id,
                                 balance_qty, balance_value, note, created_by)
    values (p_book, p_product, p_date, 0, adj, 0, 'chenh_lech', p_doc_id, p_doc_code, p_line,
            nq, nv, 'Chênh lệch làm tròn / âm kho được tính vào giá vốn', auth.uid());
  end if;

  update app.products set on_hand = nq, stock_value = nv,
    last_cost = case when nq > 0 then nv / nq when p_qty > 0 then inflow_cost else last_cost end,
    updated_at = now()
  where id = p_product;
  return v;
end $$;

-- ---------- NHẬT KÝ CHỈNH SỬA (mọi thay đổi trên bảng gốc) ----------
create or replace function app.audit_trg() returns trigger language plpgsql security definer
set search_path = app, public, pg_temp as $$
declare o jsonb; n jsonb; ign text[]; k text;
begin
  o := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  if tg_op = 'UPDATE' then
    ign := coalesce(string_to_array(tg_argv[0], ','), '{}');
    foreach k in array ign || array['updated_at'] loop o := o - k; n := n - k; end loop;
    if o = n then return new; end if;
  end if;
  insert into app.audit_log (book_id, user_id, table_name, op, row_id, old_data, new_data)
  values (coalesce((n ->> 'book_id')::uuid, (o ->> 'book_id')::uuid, (n ->> 'id')::uuid),
          auth.uid(), tg_table_name, tg_op, coalesce(n ->> 'id', o ->> 'id'), o, n);
  return coalesce(new, old);
end $$;

do $$
declare t text; ign text;
begin
  foreach t in array array['books','book_members','products','customers','suppliers','funds','opening_debts',
    'sales_orders','sales_order_lines','deliveries','sales_returns','purchase_orders','purchase_order_lines',
    'goods_receipts','supplier_returns','stock_adjustments','payments','payment_allocations','expenses'] loop
    ign := case t
      when 'products' then 'on_hand,stock_value,last_cost'
      when 'sales_order_lines' then 'delivered_qty,returned_qty'
      when 'purchase_order_lines' then 'received_qty,returned_qty'
      else '' end;
    execute format('drop trigger if exists audit on app.%I', t);
    execute format('create trigger audit after insert or update or delete on app.%I for each row execute function app.audit_trg(%L)', t, ign);
  end loop;
end $$;

-- ===== db/03_views.sql =====
-- =====================================================================
--  03. CÁC BẢNG TỔNG HỢP (VIEW) – mọi con số đều tính từ chứng từ gốc
--  Ứng dụng đọc qua hàm public.q(); cột giá vốn/lợi nhuận bị ẩn nếu không có quyền.
-- =====================================================================

-- Thanh toán còn hiệu lực, có dấu theo chiều công nợ
create or replace view app.v_pay_signed as
select p.*,
  case when p.kind in ('thu_khach','tra_ncc','chi_phi') then p.amount
       when p.kind in ('hoan_khach','ncc_hoan') then -p.amount else 0 end as debt_amount
from app.payments p where not p.voided;

-- Phân bổ còn hiệu lực, có dấu (+ trả nợ/cọc, − hoàn tiền)
create or replace view app.v_alloc_signed as
select a.*, p.kind, p.pay_date, p.code as pay_code, p.party_id,
  case when p.kind in ('hoan_khach','ncc_hoan') then -a.amount else a.amount end as signed_amount
from app.payment_allocations a join app.payments p on p.id = a.payment_id and not p.voided;

create or replace view app.v_doc_paid as
select doc_id, sum(signed_amount) as paid_net, max(pay_date) as last_pay_date
from app.v_alloc_signed group by doc_id;

-- Hàng đang giữ cho đơn đã xác nhận nhưng chưa giao
-- Dòng đơn gắn với đơn đặt xưởng/NCC chỉ giữ phần hàng của đơn đặt đó đã về kho.
create or replace view app.v_reserve as
select l.book_id, l.order_id, l.id as order_line_id,
  coalesce(k.component_id, l.product_id) as product_id,
  (case when l.po_line_id is null then r.rem
        else least(r.rem, greatest(coalesce(pl.received_qty - pl.returned_qty, 0) - l.delivered_qty, 0)) end)
    * coalesce(k.qty, 1) as qty
from app.sales_order_lines l
join app.sales_orders o on o.id = l.order_id and o.status = 'xac_nhan'
cross join lateral (select l.qty - l.cancelled_qty - l.delivered_qty as rem) r
join app.products p on p.id = l.product_id
left join app.kit_items k on p.is_kit and k.kit_id = p.id
left join app.purchase_order_lines pl on pl.id = l.po_line_id
where r.rem > 0;

create or replace view app.v_reserve_sum as
select product_id, sum(qty) as reserved from app.v_reserve group by product_id;

-- Hàng đang về (đơn đặt NCC đã xác nhận, chưa nhận đủ)
create or replace view app.v_incoming as
select pl.product_id, sum(pl.qty - pl.cancelled_qty - pl.received_qty) as incoming
from app.purchase_order_lines pl join app.purchase_orders po on po.id = pl.po_id and po.status = 'xac_nhan'
where pl.qty - pl.cancelled_qty - pl.received_qty > 0 group by pl.product_id;

-- ---------- SẢN PHẨM & TỒN KHO ----------
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
  (not b.is_kit and b.active and b.on_hand - b.reserved <= b.low_stock) as is_low
from base b left join kit on kit.kit_id = b.id;

-- ---------- GIÁ TRỊ TỪNG ĐƠN BÁN ----------
create or replace view app.v_order_values as
with l as (
  select order_id,
    sum((qty - cancelled_qty) * unit_price * (1 - discount_pct / 100)) as goods_gross,
    sum(qty - cancelled_qty) as eff_qty, sum(delivered_qty) as delivered_qty, sum(returned_qty) as returned_qty,
    sum(greatest(qty - cancelled_qty - delivered_qty, 0)) as remaining_qty,
    count(*) as line_count
  from app.sales_order_lines group by order_id
), d as (
  select d.order_id, sum(d.shipping_fee) as ship_billed, max(d.delivery_date) as last_delivery_date, count(*) as delivery_count
  from app.deliveries d group by d.order_id
), dl as (
  select d.order_id, sum(x.revenue) as goods_delivered, sum(x.cogs) as cogs_delivered
  from app.delivery_lines x join app.deliveries d on d.id = x.delivery_id group by d.order_id
), rt as (
  select r.order_id, sum(x.revenue) as returned_value, sum(x.cogs) as returned_cogs
  from app.sales_return_lines x join app.sales_returns r on r.id = x.return_id group by r.order_id
)
select o.id as order_id,
  coalesce(l.goods_gross, 0) as goods_gross,
  case when o.status = 'huy' then 0 else greatest(round(coalesce(l.goods_gross, 0) - o.discount), 0) end as goods_total,
  case when o.status = 'huy' then 0 else greatest(round(coalesce(l.goods_gross, 0) - o.discount), 0)
       + greatest(o.shipping_fee, coalesce(d.ship_billed, 0)) end as order_total,
  coalesce(l.eff_qty, 0) as eff_qty, coalesce(l.delivered_qty, 0) as delivered_qty,
  coalesce(l.returned_qty, 0) as returned_qty, coalesce(l.remaining_qty, 0) as remaining_qty,
  coalesce(l.line_count, 0) as line_count,
  coalesce(dl.goods_delivered, 0) as goods_delivered, coalesce(d.ship_billed, 0) as ship_billed,
  coalesce(rt.returned_value, 0) as returned_value,
  coalesce(dl.goods_delivered, 0) + coalesce(d.ship_billed, 0) - coalesce(rt.returned_value, 0) as delivered_value,
  coalesce(dl.cogs_delivered, 0) - coalesce(rt.returned_cogs, 0) as cogs_net,
  coalesce(pd.paid_net, 0) as paid_net, pd.last_pay_date,
  d.last_delivery_date, coalesce(d.delivery_count, 0) as delivery_count
from app.sales_orders o
left join l on l.order_id = o.id
left join d on d.order_id = o.id
left join dl on dl.order_id = o.id
left join rt on rt.order_id = o.id
left join app.v_doc_paid pd on pd.doc_id = o.id;

-- Tiến độ đơn đặt riêng: tính tự động từ đơn đặt xưởng, phiếu giao và thanh toán
create or replace view app.v_order_po as
select po.sales_order_id as order_id,
  count(*) as po_count,
  bool_and(coalesce(x.remaining, 0) <= 0) as all_received,
  bool_or(coalesce(x.received, 0) > 0) as any_received,
  string_agg(po.code || coalesce(' – ' || po.prod_step, ''), '; ' order by po.code) as po_summary,
  min(po.expected_date) as po_expected
from app.purchase_orders po
left join lateral (select sum(qty - cancelled_qty - received_qty) as remaining, sum(received_qty) as received
                   from app.purchase_order_lines where po_id = po.id) x on true
where po.sales_order_id is not null and po.status <> 'huy'
group by po.sales_order_id;

create or replace view app.v_sales_orders as
select o.id, o.book_id, o.code, o.kind, o.status, o.customer_id, c.code as customer_code, c.name as customer_name,
  c.phone as customer_phone, c.address as customer_address, c.price_tier,
  o.channel, o.order_date, o.due_date, o.staff, o.discount, o.shipping_fee, o.note, o.cancel_reason,
  o.created_at, o.confirmed_at, o.cancelled_at,
  v.goods_gross, v.goods_total, v.order_total, v.eff_qty, v.delivered_qty, v.returned_qty, v.remaining_qty, v.line_count,
  v.delivered_value, v.returned_value, v.ship_billed, v.paid_net, v.last_pay_date, v.last_delivery_date, v.delivery_count,
  v.order_total - v.returned_value as net_total,
  greatest(v.delivered_value - v.paid_net, 0) as receivable,
  greatest(v.paid_net - v.delivered_value, 0) as prepaid,
  v.order_total - v.returned_value - v.paid_net as remaining_to_pay,
  case when app.can(o.book_id, 'xem_gia_von') then v.cogs_net end as cogs,
  case when app.can(o.book_id, 'xem_gia_von') then round(v.delivered_value * (1 - coalesce((b.settings ->> 'vat_rate')::numeric, 0))) - v.cogs_net end as gross_profit,
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
  (o.status = 'xac_nhan' and v.remaining_qty > 0 and o.due_date is not null and o.due_date < app.today()) as is_late,
  case when o.status = 'xac_nhan' and v.remaining_qty > 0 and o.due_date is not null then o.due_date - app.today() end as days_to_due,
  case when v.delivered_value - v.paid_net > 0 and v.last_delivery_date is not null
       then v.last_delivery_date + c.credit_days end as pay_due_date,
  case when v.delivered_value - v.paid_net > 0 and v.last_delivery_date is not null
            and v.last_delivery_date + c.credit_days < app.today()
       then app.today() - (v.last_delivery_date + c.credit_days) else 0 end as overdue_days
from app.sales_orders o
join app.v_order_values v on v.order_id = o.id
join app.books b on b.id = o.book_id
left join app.customers c on c.id = o.customer_id
left join app.v_order_po op on op.order_id = o.id;

create or replace view app.v_sales_order_lines as
select l.id, l.book_id, l.order_id, o.code as order_code, o.status as order_status, l.line_no, l.product_id,
  p.sku, p.name as product_name, p.unit, p.is_kit, p.image_url,
  l.qty, l.unit_price, l.discount_pct, l.cancelled_qty, l.delivered_qty, l.returned_qty,
  l.qty - l.cancelled_qty as eff_qty,
  greatest(l.qty - l.cancelled_qty - l.delivered_qty, 0) as remaining_qty,
  round((l.qty - l.cancelled_qty) * l.unit_price * (1 - l.discount_pct / 100)) as line_total,
  l.po_line_id, po.code as po_code, po.id as po_id, po.prod_step as po_step,
  pl.received_qty - pl.returned_qty as po_received, l.note
from app.sales_order_lines l
join app.sales_orders o on o.id = l.order_id
join app.products p on p.id = l.product_id
left join app.purchase_order_lines pl on pl.id = l.po_line_id
left join app.purchase_orders po on po.id = pl.po_id;

create or replace view app.v_deliveries as
select d.id, d.book_id, d.code, d.order_id, o.code as order_code, o.customer_id, c.name as customer_name, c.phone as customer_phone,
  c.address as customer_address, d.delivery_date, d.shipping_fee, d.note, d.created_at,
  coalesce(x.revenue, 0) as goods_revenue, coalesce(x.revenue, 0) + d.shipping_fee as total,
  case when app.can(d.book_id, 'xem_gia_von') then x.cogs end as cogs
from app.deliveries d join app.sales_orders o on o.id = d.order_id
left join app.customers c on c.id = o.customer_id
left join lateral (select sum(revenue) revenue, sum(cogs) cogs from app.delivery_lines where delivery_id = d.id) x on true;

create or replace view app.v_delivery_lines as
select x.id, x.book_id, x.delivery_id, d.code as delivery_code, d.delivery_date, d.order_id, x.order_line_id,
  x.product_id, p.sku, p.name as product_name, p.unit, x.qty, x.returned_qty, x.qty - x.returned_qty as returnable_qty,
  x.unit_price_net, x.revenue,
  case when app.can(x.book_id, 'xem_gia_von') then x.cogs end as cogs
from app.delivery_lines x join app.deliveries d on d.id = x.delivery_id join app.products p on p.id = x.product_id;

create or replace view app.v_sales_returns as
select r.id, r.book_id, r.code, r.order_id, o.code as order_code, c.name as customer_name, r.return_date, r.reason, r.note,
  r.created_at, coalesce(x.revenue, 0) as revenue,
  case when app.can(r.book_id, 'xem_gia_von') then x.cogs end as cogs, x.lines
from app.sales_returns r join app.sales_orders o on o.id = r.order_id left join app.customers c on c.id = o.customer_id
left join lateral (select sum(l.revenue) revenue, sum(l.cogs) cogs,
   jsonb_agg(jsonb_build_object('sku', p.sku, 'name', p.name, 'qty', l.qty, 'revenue', l.revenue, 'restock', l.restock)) lines
   from app.sales_return_lines l join app.products p on p.id = l.product_id where l.return_id = r.id) x on true;

-- ---------- MUA HÀNG ----------
create or replace view app.v_purchase_orders as
with l as (
  select po_id, sum((qty - cancelled_qty) * unit_cost) as order_total, sum(qty - cancelled_qty) as eff_qty,
    sum(received_qty) as received_qty, sum(returned_qty) as returned_qty,
    sum(greatest(qty - cancelled_qty - received_qty, 0)) as remaining_qty, count(*) as line_count
  from app.purchase_order_lines group by po_id
), r as (
  select g.po_id, sum(x.value) as received_value, max(g.receipt_date) as last_receipt_date
  from app.goods_receipt_lines x join app.goods_receipts g on g.id = x.receipt_id group by g.po_id
), rt as (
  select s.po_id, sum(x.value) as returned_value
  from app.supplier_return_lines x join app.supplier_returns s on s.id = x.return_id group by s.po_id
)
select po.id, po.book_id, po.code, po.kind, po.status, po.supplier_id, s.code as supplier_code, s.name as supplier_name,
  s.phone as supplier_phone, po.order_date, po.expected_date, po.prod_step, po.prod_step_at, po.sales_order_id,
  so.code as sales_order_code, sc.name as sales_customer_name, po.note, po.cancel_reason, po.created_at,
  case when po.status = 'huy' then 0 else round(coalesce(l.order_total, 0)) end as order_total,
  coalesce(l.eff_qty, 0) as eff_qty, coalesce(l.received_qty, 0) as received_qty, coalesce(l.returned_qty, 0) as returned_qty,
  coalesce(l.remaining_qty, 0) as remaining_qty, coalesce(l.line_count, 0) as line_count,
  coalesce(r.received_value, 0) - coalesce(rt.returned_value, 0) as received_value,
  coalesce(pd.paid_net, 0) as paid_net, r.last_receipt_date,
  greatest(coalesce(r.received_value, 0) - coalesce(rt.returned_value, 0) - coalesce(pd.paid_net, 0), 0) as payable,
  greatest(coalesce(pd.paid_net, 0) - (coalesce(r.received_value, 0) - coalesce(rt.returned_value, 0)), 0) as prepaid,
  case when po.status = 'huy' then 0 else round(coalesce(l.order_total, 0)) end - coalesce(rt.returned_value, 0) as net_total,
  case when po.status = 'huy' then 0 else round(coalesce(l.order_total, 0)) end - coalesce(rt.returned_value, 0) - coalesce(pd.paid_net, 0) as remaining_to_pay,
  case
    when po.status = 'nhap' then 'nhap'
    when po.status = 'huy' then 'da_huy'
    when coalesce(l.received_qty, 0) = 0 then 'chua_nhan'
    when coalesce(l.remaining_qty, 0) > 0 then 'nhan_mot_phan'
    else 'da_nhan_du' end as receive_status,
  case
    when po.status = 'nhap' then 'Nháp'
    when po.status = 'huy' then 'Đã hủy'
    when coalesce(l.remaining_qty, 0) = 0 then 'Đã nhận đủ'
    when coalesce(l.received_qty, 0) > 0 then 'Đã nhận một phần' || coalesce(' · ' || po.prod_step, '')
    else coalesce(po.prod_step, 'Đã đặt – chờ hàng') end as progress,
  (po.status = 'xac_nhan' and coalesce(l.remaining_qty, 0) > 0 and po.expected_date is not null and po.expected_date < app.today()) as is_late,
  case when coalesce(r.received_value, 0) - coalesce(rt.returned_value, 0) - coalesce(pd.paid_net, 0) > 0 and r.last_receipt_date is not null
       then r.last_receipt_date + s.credit_days end as pay_due_date,
  case when coalesce(r.received_value, 0) - coalesce(rt.returned_value, 0) - coalesce(pd.paid_net, 0) > 0 and r.last_receipt_date is not null
            and r.last_receipt_date + s.credit_days < app.today()
       then app.today() - (r.last_receipt_date + s.credit_days) else 0 end as overdue_days
from app.purchase_orders po
left join app.suppliers s on s.id = po.supplier_id
left join app.sales_orders so on so.id = po.sales_order_id
left join app.customers sc on sc.id = so.customer_id
left join l on l.po_id = po.id left join r on r.po_id = po.id left join rt on rt.po_id = po.id
left join app.v_doc_paid pd on pd.doc_id = po.id;

create or replace view app.v_purchase_order_lines as
select l.id, l.book_id, l.po_id, po.code as po_code, l.line_no, l.product_id, p.sku, p.name as product_name, p.unit,
  l.qty, l.unit_cost, l.cancelled_qty, l.received_qty, l.returned_qty, l.qty - l.cancelled_qty as eff_qty,
  greatest(l.qty - l.cancelled_qty - l.received_qty, 0) as remaining_qty,
  round((l.qty - l.cancelled_qty) * l.unit_cost) as line_total, l.sales_order_line_id, so.code as sales_order_code, l.note
from app.purchase_order_lines l join app.purchase_orders po on po.id = l.po_id join app.products p on p.id = l.product_id
left join app.sales_order_lines sl on sl.id = l.sales_order_line_id left join app.sales_orders so on so.id = sl.order_id;

create or replace view app.v_receipts as
select g.id, g.book_id, g.code, g.po_id, po.code as po_code, s.name as supplier_name, g.receipt_date, g.note, g.created_at,
  x.value, x.lines
from app.goods_receipts g join app.purchase_orders po on po.id = g.po_id left join app.suppliers s on s.id = po.supplier_id
left join lateral (select sum(l.value) value, jsonb_agg(jsonb_build_object('id', l.id, 'sku', p.sku, 'name', p.name, 'unit', p.unit,
    'qty', l.qty, 'unit_cost', l.unit_cost, 'value', l.value, 'returned_qty', l.returned_qty, 'product_id', l.product_id) order by p.sku) lines
  from app.goods_receipt_lines l join app.products p on p.id = l.product_id where l.receipt_id = g.id) x on true;

create or replace view app.v_supplier_returns as
select r.id, r.book_id, r.code, r.po_id, po.code as po_code, s.name as supplier_name, r.return_date, r.reason, r.note, r.created_at,
  x.value, x.lines
from app.supplier_returns r join app.purchase_orders po on po.id = r.po_id left join app.suppliers s on s.id = po.supplier_id
left join lateral (select sum(l.value) value, jsonb_agg(jsonb_build_object('sku', p.sku, 'name', p.name, 'qty', l.qty, 'value', l.value)) lines
  from app.supplier_return_lines l join app.products p on p.id = l.product_id where l.return_id = r.id) x on true;

-- ---------- SỔ KHO ----------
create or replace view app.v_stock_moves as
select m.id, m.book_id, m.product_id, p.sku, p.name as product_name, p.unit, m.move_date, m.qty, m.balance_qty,
  case when app.can(m.book_id, 'xem_gia_von') then m.value end as value,
  case when app.can(m.book_id, 'xem_gia_von') then m.unit_cost end as unit_cost,
  case when app.can(m.book_id, 'xem_gia_von') then m.balance_value end as balance_value,
  m.doc_type,
  case m.doc_type when 'dau_ky' then 'Tồn đầu kỳ' when 'nhap' then 'Nhập hàng' when 'tra_ncc' then 'Trả nhà cung cấp'
    when 'giao' then 'Giao hàng (bán)' when 'tra_hang' then 'Khách trả hàng' when 'dieu_chinh' then 'Điều chỉnh kho'
    when 'chenh_lech' then 'Chênh lệch giá vốn' else m.doc_type end as doc_label,
  m.doc_id, m.doc_code, m.line_id, m.note, m.created_at,
  coalesce(so.code, po.code) as order_code, so.id as order_id, po.id as po_id, coalesce(c.name, s.name) as party_name, sa.reason as adj_reason
from app.stock_moves m join app.products p on p.id = m.product_id
left join app.deliveries d on m.doc_type = 'giao' and d.id = m.doc_id
left join app.sales_returns sr on m.doc_type = 'tra_hang' and sr.id = m.doc_id
left join app.sales_orders so on so.id = coalesce(d.order_id, sr.order_id)
left join app.customers c on c.id = so.customer_id
left join app.goods_receipts g on m.doc_type = 'nhap' and g.id = m.doc_id
left join app.supplier_returns spr on m.doc_type = 'tra_ncc' and spr.id = m.doc_id
left join app.purchase_orders po on po.id = coalesce(g.po_id, spr.po_id)
left join app.suppliers s on s.id = po.supplier_id
left join app.stock_adjustments sa on m.doc_type in ('dieu_chinh','dau_ky') and sa.id = m.doc_id;

create or replace view app.v_adjustments as
select a.id, a.book_id, a.code, a.adj_date, a.reason,
  case a.reason when 'dau_ky' then 'Tồn đầu kỳ' when 'vo' then 'Hàng vỡ' when 'loi' then 'Hàng lỗi'
    when 'that_thoat' then 'Thất thoát / mất' when 'kiem_ke' then 'Kiểm kê chênh lệch'
    when 'hang_tra_loi' then 'Hàng khách trả bị lỗi (không nhập lại)' else 'Khác' end as reason_label,
  a.note, a.created_at,
  case when app.can(a.book_id, 'xem_gia_von') then x.value end as value, x.lines
from app.stock_adjustments a
left join lateral (select sum(l.value) value, jsonb_agg(jsonb_build_object('sku', p.sku, 'name', p.name, 'unit', p.unit, 'qty', l.qty_delta,
    'value', case when app.can(a.book_id, 'xem_gia_von') then l.value end) order by p.sku) lines
  from app.stock_adjustment_lines l join app.products p on p.id = l.product_id where l.adjustment_id = a.id) x on true;

-- ---------- KHÁCH HÀNG & CÔNG NỢ ----------
create or replace view app.v_opening_debts as
select d.id, d.book_id, d.code, d.party_type, d.party_id, coalesce(c.name, s.name) as party_name, coalesce(c.code, s.code) as party_code,
  d.amount, d.debt_date, d.due_date, d.note, d.created_at, coalesce(pd.paid_net, 0) as paid_net,
  d.amount - coalesce(pd.paid_net, 0) as remaining,
  case when d.amount - coalesce(pd.paid_net, 0) > 0 and d.due_date < app.today() then app.today() - d.due_date else 0 end as overdue_days
from app.opening_debts d
left join app.customers c on d.party_type = 'kh' and c.id = d.party_id
left join app.suppliers s on d.party_type = 'ncc' and s.id = d.party_id
left join app.v_doc_paid pd on pd.doc_id = d.id;

create or replace view app.v_customers as
with od as (
  select party_id, sum(amount) as opening, sum(greatest(remaining, 0)) filter (where overdue_days > 0) as overdue,
    max(overdue_days) as max_overdue
  from app.v_opening_debts where party_type = 'kh' group by party_id
), so as (
  select customer_id, sum(delivered_value) as delivered, sum(order_total) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_value,
    count(*) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_orders,
    sum(receivable) filter (where overdue_days > 0) as overdue, max(overdue_days) as max_overdue,
    sum(order_total) filter (where status <> 'huy') as total_bought, max(order_date) as last_order_date
  from app.v_sales_orders group by customer_id
), pay as (
  select party_id, sum(debt_amount) as paid from app.v_pay_signed where party_type = 'kh' group by party_id
)
select c.id, c.book_id, c.code, c.name, c.phone, c.address, c.contact, c.kind, c.price_tier, c.credit_days, c.credit_limit,
  c.note, c.active, c.created_at,
  coalesce(od.opening, 0) as opening, coalesce(so.delivered, 0) as delivered, coalesce(pay.paid, 0) as paid,
  coalesce(od.opening, 0) + coalesce(so.delivered, 0) - coalesce(pay.paid, 0) as balance,
  greatest(coalesce(od.opening, 0) + coalesce(so.delivered, 0) - coalesce(pay.paid, 0), 0) as receivable,
  greatest(-(coalesce(od.opening, 0) + coalesce(so.delivered, 0) - coalesce(pay.paid, 0)), 0) as prepaid,
  least(coalesce(od.overdue, 0) + coalesce(so.overdue, 0),
        greatest(coalesce(od.opening, 0) + coalesce(so.delivered, 0) - coalesce(pay.paid, 0), 0)) as overdue,
  greatest(coalesce(od.max_overdue, 0), coalesce(so.max_overdue, 0)) as max_overdue_days,
  coalesce(so.open_orders, 0) as open_orders, coalesce(so.open_value, 0) as open_value,
  coalesce(so.total_bought, 0) as total_bought, so.last_order_date
from app.customers c left join od on od.party_id = c.id left join so on so.customer_id = c.id left join pay on pay.party_id = c.id;

create or replace view app.v_expenses as
select e.id, e.book_id, e.code, e.exp_date, e.category, e.description, e.amount, e.supplier_id, s.name as supplier_name,
  e.settled_payment_id, sp.code as settled_payment_code, e.voided, e.void_reason, e.note, e.created_at,
  case when e.settled_payment_id is not null then e.amount else coalesce(pd.paid_net, 0) end as paid,
  case when e.voided then 0 when e.settled_payment_id is not null then 0 else e.amount - coalesce(pd.paid_net, 0) end as unpaid
from app.expenses e left join app.suppliers s on s.id = e.supplier_id left join app.payments sp on sp.id = e.settled_payment_id
left join app.v_doc_paid pd on pd.doc_id = e.id;

create or replace view app.v_suppliers as
with od as (
  select party_id, sum(amount) as opening, sum(greatest(remaining, 0)) filter (where overdue_days > 0) as overdue,
    max(overdue_days) as max_overdue
  from app.v_opening_debts where party_type = 'ncc' group by party_id
), po as (
  select supplier_id, sum(received_value) as received, sum(payable) filter (where overdue_days > 0) as overdue,
    max(overdue_days) as max_overdue, count(*) filter (where status = 'xac_nhan' and remaining_qty > 0) as open_pos,
    max(order_date) as last_order_date
  from app.v_purchase_orders group by supplier_id
), ex as (
  select supplier_id, sum(amount) as amount from app.expenses where supplier_id is not null and not voided group by supplier_id
), pay as (
  select party_id, sum(debt_amount) as paid from app.v_pay_signed where party_type = 'ncc' group by party_id
)
select s.id, s.book_id, s.code, s.name, s.phone, s.address, s.contact, s.credit_days, s.note, s.active, s.created_at,
  coalesce(od.opening, 0) as opening, coalesce(po.received, 0) + coalesce(ex.amount, 0) as received, coalesce(pay.paid, 0) as paid,
  coalesce(od.opening, 0) + coalesce(po.received, 0) + coalesce(ex.amount, 0) - coalesce(pay.paid, 0) as balance,
  greatest(coalesce(od.opening, 0) + coalesce(po.received, 0) + coalesce(ex.amount, 0) - coalesce(pay.paid, 0), 0) as payable,
  greatest(-(coalesce(od.opening, 0) + coalesce(po.received, 0) + coalesce(ex.amount, 0) - coalesce(pay.paid, 0)), 0) as prepaid,
  least(coalesce(od.overdue, 0) + coalesce(po.overdue, 0),
        greatest(coalesce(od.opening, 0) + coalesce(po.received, 0) + coalesce(ex.amount, 0) - coalesce(pay.paid, 0), 0)) as overdue,
  greatest(coalesce(od.max_overdue, 0), coalesce(po.max_overdue, 0)) as max_overdue_days,
  coalesce(po.open_pos, 0) as open_pos, po.last_order_date
from app.suppliers s left join od on od.party_id = s.id left join po on po.supplier_id = s.id
left join ex on ex.supplier_id = s.id left join pay on pay.party_id = s.id;

-- ---------- QUỸ TIỀN ----------
create or replace view app.v_fund_moves as
select p.book_id, p.fund_id, p.pay_date, case when p.direction = 'thu' then p.amount - p.fee else -p.amount end as amount, p.id as payment_id
from app.payments p where not p.voided
union all
select p.book_id, p.to_fund_id, p.pay_date, p.amount, p.id from app.payments p where not p.voided and p.direction = 'chuyen';

create or replace view app.v_funds as
select f.id, f.book_id, f.name, f.opening_balance, f.sort, f.active,
  f.opening_balance + coalesce((select sum(amount) from app.v_fund_moves m where m.fund_id = f.id), 0) as balance
from app.funds f;

create or replace view app.v_payments as
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
from app.payments p join app.funds f on f.id = p.fund_id left join app.funds tf on tf.id = p.to_fund_id
left join app.customers c on p.party_type = 'kh' and c.id = p.party_id
left join app.suppliers s on p.party_type = 'ncc' and s.id = p.party_id
left join lateral (select sum(a.amount) allocated, jsonb_agg(jsonb_build_object('doc_type', a.doc_type, 'doc_id', a.doc_id, 'amount', a.amount,
     'doc_code', coalesce(so.code, po.code, e.code, od.code))) allocations
   from app.payment_allocations a
   left join app.sales_orders so on a.doc_type = 'don_ban' and so.id = a.doc_id
   left join app.purchase_orders po on a.doc_type = 'don_mua' and po.id = a.doc_id
   left join app.expenses e on a.doc_type = 'chi_phi' and e.id = a.doc_id
   left join app.opening_debts od on a.doc_type = 'no_dau_ky' and od.id = a.doc_id
   where a.payment_id = p.id) x on true;

-- Các khoản thanh toán gắn với 1 chứng từ (để xem trong chi tiết đơn)
create or replace view app.v_doc_payments as
select a.book_id, a.doc_id, a.doc_type, a.payment_id, p.code, p.pay_date, p.kind, a.amount, a.signed_amount, f.name as fund_name, p.method, p.note
from app.v_alloc_signed a join app.payments p on p.id = a.payment_id join app.funds f on f.id = p.fund_id;

-- Chứng từ còn mở của 1 đối tượng (gợi ý phân bổ khi thu/chi)
create or replace view app.v_open_docs as
select book_id, 'don_ban'::text as doc_type, id as doc_id, code, order_date as doc_date, customer_id as party_id, 'kh'::text as party_type,
  net_total as total, delivered_value as due_now, paid_net, net_total - paid_net as remaining_total,
  delivered_value - paid_net as remaining_due, pay_due_date as due_date, status
from app.v_sales_orders where status <> 'nhap' or paid_net <> 0
union all
select book_id, 'don_mua', id, code, order_date, supplier_id, 'ncc', net_total, received_value, paid_net, net_total - paid_net,
  received_value - paid_net, pay_due_date, status
from app.v_purchase_orders
union all
select book_id, 'no_dau_ky', id, code, debt_date, party_id, party_type, amount, amount, paid_net, remaining, remaining, due_date, 'xac_nhan'
from app.v_opening_debts
union all
select book_id, 'chi_phi', id, code, exp_date, supplier_id, case when supplier_id is null then null else 'ncc' end,
  amount, amount, paid, unpaid, unpaid, null::date, case when voided then 'huy' else 'xac_nhan' end
from app.v_expenses where settled_payment_id is null;

create or replace view app.v_members as
select m.book_id, m.user_id, u.email, m.role, m.perms, m.display_name, m.created_at
from app.book_members m join auth.users u on u.id = m.user_id;

create or replace view app.v_audit as
select a.id, a.book_id, a.user_id, coalesce(m.display_name, u.email) as user_name, a.at, a.table_name, a.op, a.row_id,
  coalesce(a.new_data ->> 'code', a.old_data ->> 'code', a.new_data ->> 'sku', a.old_data ->> 'sku') as doc_code,
  a.old_data, a.new_data
from app.audit_log a left join auth.users u on u.id = a.user_id
left join app.book_members m on m.user_id = a.user_id and m.book_id = a.book_id;

-- ===== db/04_api.sql =====
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

-- ===== db/05_reports.sql =====
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

-- ===== db/06_ship_bank_notify.sql =====
-- =====================================================================
--  06. VẬN CHUYỂN (Shopee Express, BEST Express…) · TIỀN VỀ TÀI KHOẢN · THÔNG BÁO
--  - Vận đơn gắn với đơn bán; trạng thái cập nhật tay hoặc tự động (TrackingMore → webhook).
--  - Tiền chuyển khoản về TK (Casso / SePay → webhook) tự gạch nợ đơn theo mã đơn trong nội dung CK.
--  - Thông báo: theo sự kiện + báo cáo ngày + nhắc công nợ; gửi lên điện thoại bằng thông báo web (Web Push).
-- =====================================================================

alter table app.book_members add column if not exists notify jsonb not null default '{}'::jsonb;

-- ---------- VẬN ĐƠN ----------
create table app.shipments (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references app.books(id) on delete cascade,
  code text not null,
  order_id uuid not null references app.sales_orders(id),
  delivery_id uuid references app.deliveries(id),
  carrier text not null default 'SPX',
  tracking_no text not null,
  status text not null default 'cho_lay_hang' check (status in ('cho_lay_hang','da_lay_hang','dang_trung_chuyen','dang_giao',
    'giao_thanh_cong','giao_that_bai','dang_hoan','da_hoan','da_huy','su_co')),
  status_at timestamptz not null default now(),
  status_detail text,
  cod_amount numeric not null default 0 check (cod_amount >= 0),
  ship_fee numeric not null default 0 check (ship_fee >= 0),       -- cước dự kiến đơn vị vận chuyển trừ / mình trả
  cod_status text not null default 'khong_cod' check (cod_status in ('khong_cod','chua_thu','spx_dang_giu','da_ve_tk','khong_thu_duoc')),
  cod_payment_ids uuid[] not null default '{}',
  cod_settled_at timestamptz,
  receiver_name text, receiver_phone text, receiver_address text,
  note text,
  tracking_registered_at timestamptz,   -- đã đăng ký theo dõi tự động
  last_sync_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz
);
create unique index shipments_tracking_uq on app.shipments (book_id, carrier, upper(tracking_no));
create index shipments_order_idx on app.shipments (order_id);
create index shipments_tracking_idx on app.shipments (upper(tracking_no));

create table app.shipment_events (
  id bigserial primary key,
  shipment_id uuid not null references app.shipments(id) on delete cascade,
  book_id uuid not null,
  ev_at timestamptz not null,
  status text,
  detail text,
  location text,
  source text not null default 'tay' check (source in ('tay','tu_dong','he_thong')),
  ev_key text not null,
  created_by uuid, created_at timestamptz not null default now(),
  unique (shipment_id, ev_key)
);

-- ---------- GIAO DỊCH NGÂN HÀNG (từ Casso / SePay) ----------
create table app.bank_txns (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                    -- sepay | casso | demo
  ext_id text not null,                      -- mã giao dịch phía nhà cung cấp (chống ghi trùng)
  account_no text,
  amount numeric not null,
  direction text not null check (direction in ('in','out')),
  content text,
  txn_at timestamptz not null,
  ref text,
  counter_name text,
  book_id uuid references app.books(id) on delete cascade,     -- sổ đã nhận giao dịch này
  candidate_books uuid[] not null default '{}',                -- các sổ có thể nhận (khi chưa xác định)
  status text not null default 'cho_xu_ly' check (status in ('cho_xu_ly','da_ghi','bo_qua')),
  match_note text,
  order_id uuid references app.sales_orders(id),
  payment_ids uuid[] not null default '{}',
  handled_by uuid, handled_at timestamptz,
  raw jsonb,
  received_at timestamptz not null default now(),
  unique (provider, ext_id)
);
create index bank_txns_book_idx on app.bank_txns (book_id, txn_at desc);

-- ---------- THÔNG BÁO ----------
create table app.notifications (
  id bigserial primary key,
  book_id uuid not null references app.books(id) on delete cascade,
  kind text not null check (kind in ('don_hang','van_chuyen','tien_ve','cong_no','bao_cao')),
  level text not null default 'info' check (level in ('info','good','warn','bad')),
  title text not null,
  body text,
  link text,                 -- 'order:<id>' | 'ship:<id>' | 'bank:<id>' | 'page:<hash>'
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  push_sent_at timestamptz
);
create index notifications_book_idx on app.notifications (book_id, id desc);

create table app.notification_reads (
  user_id uuid not null,
  book_id uuid not null references app.books(id) on delete cascade,
  last_read_id bigint not null default 0,
  primary key (user_id, book_id)
);

create table app.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count int not null default 0
);

revoke all on all tables in schema app from public;

-- ---------- NHÃN & ÁNH XẠ TRẠNG THÁI ----------
create or replace function app.ship_status_label(s text) returns text language sql immutable as $$
  select case s
    when 'cho_lay_hang' then 'Chờ lấy hàng' when 'da_lay_hang' then 'Đã lấy hàng' when 'dang_trung_chuyen' then 'Đang trung chuyển'
    when 'dang_giao' then 'Đang giao hàng' when 'giao_thanh_cong' then 'Giao thành công'
    when 'giao_that_bai' then 'Giao thất bại – chờ giao lại' when 'dang_hoan' then 'Đang hoàn hàng về shop'
    when 'da_hoan' then 'Đã hoàn hàng về shop' when 'da_huy' then 'Đã hủy vận đơn' when 'su_co' then 'Có sự cố (thất lạc / hư hỏng)'
    else s end
$$;

create or replace function app.cod_status_label(s text) returns text language sql immutable as $$
  select case s when 'khong_cod' then 'Không thu hộ' when 'chua_thu' then 'Chưa thu' when 'spx_dang_giu' then 'ĐVVC đang giữ tiền'
    when 'da_ve_tk' then 'Đã về tài khoản' when 'khong_thu_duoc' then 'Không thu được (hoàn/hủy)' else s end
$$;

-- Đơn vị vận chuyển: SPX = Shopee Express, BEST = BEST Express, KHAC = đơn vị khác
create or replace function app.carrier_short(c text) returns text language sql immutable as $$
  select case c when 'SPX' then 'SPX' when 'BEST' then 'BEST' when 'KHAC' then 'ĐVVC' else coalesce(c, 'ĐVVC') end
$$;
create or replace function app.carrier_name(c text) returns text language sql immutable as $$
  select case c when 'SPX' then 'Shopee Express' when 'BEST' then 'BEST Express' when 'KHAC' then 'Đơn vị khác' else coalesce(c, 'Đơn vị khác') end
$$;

-- Trạng thái TrackingMore (dùng chung cho mọi hãng) → trạng thái kiểu app Shopee Express
create or replace function app.map_tm_status(st text, sub text) returns text language sql immutable as $$
  select case lower(coalesce(st, ''))
    when 'pending' then 'cho_lay_hang' when 'notfound' then 'cho_lay_hang' when 'inforeceived' then 'cho_lay_hang'
    when 'transit' then 'dang_trung_chuyen' when 'pickup' then 'dang_giao' when 'delivered' then 'giao_thanh_cong'
    when 'undelivered' then 'giao_that_bai'
    when 'exception' then case lower(coalesce(sub, ''))
      when 'exception010' then 'da_hoan' when 'exception011' then 'dang_hoan' when 'exception009' then 'dang_hoan'
      when 'exception008' then 'da_huy' else 'su_co' end
    when 'expired' then 'su_co'
    else null end
$$;

create or replace function app.vnd(n numeric) returns text language sql immutable as $$
  select case when n is null then '0đ' else replace(to_char(round(n), 'FM999G999G999G990'), ',', '.') || 'đ' end
$$;

-- Thành viên (không phải người đang đăng nhập) có quyền không
create or replace function app.member_can(p_book uuid, p_user uuid, p_perm text) returns boolean language sql stable as $$
  select coalesce((select m.role = 'owner' or p_perm is null or coalesce((m.perms ->> p_perm)::boolean, false)
                   from app.book_members m where m.book_id = p_book and m.user_id = p_user), false)
$$;

create or replace function app.notify_allowed(p_book uuid, p_user uuid, p_kind text) returns boolean language sql stable as $$
  select exists (select 1 from app.book_members m where m.book_id = p_book and m.user_id = p_user
                   and coalesce((m.notify ->> p_kind)::boolean, true))
     and case p_kind
           when 'don_hang' then app.member_can(p_book, p_user, 'ban_hang')
           when 'van_chuyen' then app.member_can(p_book, p_user, 'ban_hang')
           when 'tien_ve' then app.member_can(p_book, p_user, 'thu_chi')
           when 'cong_no' then app.member_can(p_book, p_user, 'thu_chi')
           when 'bao_cao' then app.member_can(p_book, p_user, 'xem_bao_cao') and app.member_can(p_book, p_user, 'xem_gia_von')
           else false end
$$;

create or replace function app.notify(p_book uuid, p_kind text, p_level text, p_title text, p_body text, p_link text, p_key text default null)
returns bigint language plpgsql as $$
declare nid bigint;
begin
  insert into app.notifications (book_id, kind, level, title, body, link, dedupe_key)
  values (p_book, p_kind, coalesce(p_level, 'info'), p_title, p_body, p_link, p_key)
  on conflict (dedupe_key) do nothing returning id into nid;
  return nid;
end $$;

-- ---------- XEM ----------
create or replace view app.v_shipments as
select s.id, s.book_id, s.code, s.order_id, o.code as order_code, o.customer_id, c.name as customer_name, c.phone as customer_phone,
  o.channel, s.delivery_id, d.code as delivery_code, s.carrier, app.carrier_name(s.carrier) as carrier_name, s.tracking_no, s.status, app.ship_status_label(s.status) as status_label,
  s.status_at, s.status_detail, s.cod_amount, s.ship_fee, s.cod_status, app.cod_status_label(s.cod_status) as cod_status_label,
  s.cod_settled_at, s.receiver_name, s.receiver_phone, s.receiver_address, s.note, s.tracking_registered_at, s.last_sync_at,
  s.created_at, s.updated_at,
  s.status in ('giao_thanh_cong','da_hoan','da_huy') as is_final,
  s.status in ('giao_that_bai','dang_hoan','da_hoan','su_co') as has_problem,
  (app.today() - (s.status_at at time zone 'Asia/Ho_Chi_Minh')::date) as days_in_status,
  (select count(*) from app.shipment_events e where e.shipment_id = s.id) as event_count,
  (select coalesce(jsonb_agg(jsonb_build_object('at', e.ev_at, 'status', e.status, 'label', app.ship_status_label(e.status),
     'detail', e.detail, 'location', e.location, 'source', e.source) order by e.ev_at desc, e.id desc), '[]'::jsonb)
     from app.shipment_events e where e.shipment_id = s.id) as events,
  (select coalesce(jsonb_agg(p.code), '[]'::jsonb) from app.payments p where p.id = any(s.cod_payment_ids)) as cod_payment_codes,
  o.status = 'huy' as order_cancelled
from app.shipments s join app.sales_orders o on o.id = s.order_id
left join app.customers c on c.id = o.customer_id left join app.deliveries d on d.id = s.delivery_id;

create or replace view app.v_bank_txns as
select b.id as book_id, t.id, t.provider, t.ext_id, t.account_no, t.amount, t.direction, t.content, t.txn_at, t.ref, t.counter_name,
  t.book_id is not null as assigned, t.status, t.match_note, t.order_id, o.code as order_code, c.name as customer_name,
  t.payment_ids, (select coalesce(jsonb_agg(p.code), '[]'::jsonb) from app.payments p where p.id = any(t.payment_ids)) as payment_codes,
  t.handled_at, t.received_at, coalesce(m.display_name, u.email) as handled_by_name
from app.bank_txns t
join app.books b on b.id = t.book_id or (t.book_id is null and b.id = any(t.candidate_books))
left join app.sales_orders o on o.id = t.order_id left join app.customers c on c.id = o.customer_id
left join auth.users u on u.id = t.handled_by left join app.book_members m on m.user_id = t.handled_by and m.book_id = b.id;

-- ---------- XỬ LÝ VẬN ĐƠN ----------
create or replace function app.add_ship_event(p_ship uuid, p_at timestamptz, p_status text, p_detail text, p_location text, p_source text)
returns boolean language plpgsql as $$
declare s app.shipments; n int;
begin
  select * into s from app.shipments where id = p_ship;
  insert into app.shipment_events (shipment_id, book_id, ev_at, status, detail, location, source, ev_key, created_by)
  values (p_ship, s.book_id, p_at, p_status, p_detail, p_location, p_source,
          md5(coalesce(to_char(p_at at time zone 'UTC', 'YYYYMMDDHH24MISS'), '') || '|' || coalesce(p_status, '') || '|' || coalesce(p_detail, '')),
          auth.uid())
  on conflict (shipment_id, ev_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Đổi trạng thái hiện tại + hệ quả (tiền COD) + thông báo
create or replace function app.set_ship_status(p_ship uuid, p_status text, p_at timestamptz, p_detail text) returns boolean
language plpgsql as $$
declare s app.shipments; o record; lvl text; ttl text; body text; newcod text;
begin
  select * into s from app.shipments where id = p_ship for update;
  if p_status is null or p_status = s.status then
    update app.shipments set last_sync_at = now(), status_detail = coalesce(p_detail, status_detail) where id = p_ship;
    return false;
  end if;
  newcod := s.cod_status;
  if p_status = 'giao_thanh_cong' and s.cod_status = 'chua_thu' then newcod := 'spx_dang_giu'; end if;
  if p_status in ('da_hoan','da_huy') and s.cod_status in ('chua_thu','spx_dang_giu') then newcod := 'khong_thu_duoc'; end if;
  if p_status not in ('da_hoan','da_huy','dang_hoan') and s.cod_status = 'khong_thu_duoc' then newcod := case when s.cod_amount > 0 then 'chua_thu' else 'khong_cod' end; end if;
  update app.shipments set status = p_status, status_at = coalesce(p_at, now()), status_detail = p_detail, cod_status = newcod,
    last_sync_at = now(), updated_at = now() where id = p_ship;

  select so.code, c.name as cname into o from app.sales_orders so left join app.customers c on c.id = so.customer_id where so.id = s.order_id;
  lvl := case p_status when 'giao_thanh_cong' then 'good' when 'giao_that_bai' then 'warn' when 'dang_hoan' then 'bad'
           when 'da_hoan' then 'bad' when 'su_co' then 'bad' when 'da_huy' then 'warn' else 'info' end;
  if p_status in ('da_lay_hang','dang_giao','giao_thanh_cong','giao_that_bai','dang_hoan','da_hoan','su_co','da_huy') then
    ttl := '🚚 ' || o.code || ' · ' || app.ship_status_label(p_status);
    body := coalesce(o.cname, '') || ' · ' || app.carrier_short(s.carrier) || ' ' || s.tracking_no
      || case when p_detail is not null and p_detail <> '' then ' · ' || p_detail else '' end
      || case when p_status = 'giao_thanh_cong' and s.cod_amount > 0 then ' · ' || app.carrier_short(s.carrier) || ' đang giữ COD ' || app.vnd(s.cod_amount) || ', chờ đối soát về tài khoản' else '' end
      || case when p_status in ('dang_hoan','da_hoan') then ' · Khi nhận lại hàng, mở đơn → Trả hàng để nhập lại kho' else '' end;
    perform app.notify(s.book_id, 'van_chuyen', lvl, ttl, body, 'ship:' || s.id, 'ship:' || s.id || ':' || p_status || ':' || coalesce(to_char(p_at, 'YYYYMMDDHH24MI'), ''));
  end if;
  return true;
end $$;

create or replace function public.create_shipment(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb; o record; tn text; sid uuid; c text; cod numeric; ex record;
begin
  perform app.require(b, 'ban_hang');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'create_shipment'); if r is not null then return r; end if;
  select * into o from app.v_sales_orders where id = (p ->> 'order_id')::uuid and book_id = b;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  if o.status <> 'xac_nhan' then raise exception 'Chỉ tạo vận đơn cho đơn đã xác nhận (đơn % đang %)', o.code, case o.status when 'nhap' then 'là nháp' else 'đã hủy' end; end if;
  tn := upper(regexp_replace(coalesce(p ->> 'tracking_no', ''), '\s', '', 'g'));
  if tn = '' then raise exception 'Nhập mã vận đơn (vd. SPXVN0… của Shopee Express, hoặc mã vận đơn BEST)'; end if;
  if coalesce(nullif(p ->> 'carrier', ''), 'SPX') not in ('SPX','BEST','KHAC') then raise exception 'Đơn vị vận chuyển không hợp lệ'; end if;
  if length(tn) < 6 then raise exception 'Mã vận đơn quá ngắn'; end if;
  select s.code, so.code as ocode into ex from app.shipments s join app.sales_orders so on so.id = s.order_id
    where s.book_id = b and upper(s.tracking_no) = tn and s.carrier = coalesce(nullif(p ->> 'carrier', ''), 'SPX');
  if found then raise exception 'Mã vận đơn % đã có (vận đơn % của đơn %)', tn, ex.code, ex.ocode; end if;
  cod := coalesce(round(nullif(p ->> 'cod_amount', '')::numeric), 0);
  if cod < 0 then raise exception 'Tiền thu hộ không được âm'; end if;
  if nullif(p ->> 'delivery_id', '') is not null and not exists (select 1 from app.deliveries where id = (p ->> 'delivery_id')::uuid and order_id = o.id) then
    raise exception 'Phiếu giao không thuộc đơn này'; end if;
  c := app.next_code(b, 'VD');
  insert into app.shipments (book_id, code, order_id, delivery_id, carrier, tracking_no, cod_amount, ship_fee, cod_status,
    receiver_name, receiver_phone, receiver_address, note, created_by)
  values (b, c, o.id, nullif(p ->> 'delivery_id', '')::uuid, coalesce(nullif(p ->> 'carrier', ''), 'SPX'), tn, cod,
    coalesce(round(nullif(p ->> 'ship_fee', '')::numeric), 0), case when cod > 0 then 'chua_thu' else 'khong_cod' end,
    coalesce(nullif(p ->> 'receiver_name', ''), o.customer_name), coalesce(nullif(p ->> 'receiver_phone', ''), o.customer_phone),
    coalesce(nullif(p ->> 'receiver_address', ''), o.customer_address), p ->> 'note', auth.uid())
  returning id into sid;
  perform app.add_ship_event(sid, now(), 'cho_lay_hang', 'Tạo vận đơn trong sổ', null, 'he_thong');
  return app.req_end((p ->> 'request_id')::uuid, jsonb_build_object('id', sid, 'code', c, 'tracking_no', tn));
end $$;

create or replace function public.update_shipment(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare s app.shipments; cod numeric;
begin
  select * into s from app.shipments where id = (p ->> 'id')::uuid for update;
  if not found then raise exception 'Không tìm thấy vận đơn'; end if;
  perform app.require(s.book_id, 'ban_hang');
  if s.cod_status = 'da_ve_tk' and p ? 'cod_amount' and round((p ->> 'cod_amount')::numeric) <> s.cod_amount then
    raise exception 'Tiền COD của vận đơn này đã đối soát về tài khoản — không sửa được'; end if;
  cod := coalesce(round(nullif(p ->> 'cod_amount', '')::numeric), s.cod_amount);
  if cod < 0 then raise exception 'Tiền thu hộ không được âm'; end if;
  update app.shipments set cod_amount = cod,
    cod_status = case when cod_status in ('khong_cod','chua_thu') then case when cod > 0 then 'chua_thu' else 'khong_cod' end
                      when cod_status = 'spx_dang_giu' and cod = 0 then 'khong_cod' else cod_status end,
    ship_fee = coalesce(round(nullif(p ->> 'ship_fee', '')::numeric), ship_fee),
    note = coalesce(p ->> 'note', note), receiver_name = coalesce(p ->> 'receiver_name', receiver_name),
    receiver_phone = coalesce(p ->> 'receiver_phone', receiver_phone), receiver_address = coalesce(p ->> 'receiver_address', receiver_address),
    updated_at = now()
  where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Cập nhật trạng thái bằng tay (khi xem trên app SPX hoặc gọi shipper)
create or replace function public.update_shipment_status(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare s app.shipments; st text := p ->> 'status'; at timestamptz := coalesce(nullif(p ->> 'at', '')::timestamptz, now());
begin
  select * into s from app.shipments where id = (p ->> 'id')::uuid;
  if not found then raise exception 'Không tìm thấy vận đơn'; end if;
  perform app.require(s.book_id, 'ban_hang');
  if app.ship_status_label(st) = st then raise exception 'Trạng thái vận chuyển không hợp lệ'; end if;
  if at > now() + interval '5 minutes' then raise exception 'Thời điểm cập nhật ở tương lai'; end if;
  perform app.add_ship_event(s.id, at, st, nullif(p ->> 'note', ''), null, 'tay');
  if at >= s.status_at or st <> s.status then perform app.set_ship_status(s.id, st, at, nullif(p ->> 'note', '')); end if;
  return jsonb_build_object('ok', true, 'status', st);
end $$;

-- Nhận cập nhật tự động (hàm máy chủ gọi bằng khóa service — người dùng không gọi được)
-- p = {tracking_no, status, substatus, latest_detail, latest_at, events:[{at, detail, location, status, substatus}]}
create or replace function public.ingest_tracking(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare tn text := upper(regexp_replace(coalesce(p ->> 'tracking_no', ''), '\s', '', 'g')); s app.shipments; e jsonb; st text;
  n_ev int := 0; n_ship int := 0; changed int := 0; lat timestamptz; ldet text;
begin
  st := coalesce(nullif(p ->> 'mapped_status', ''), app.map_tm_status(p ->> 'status', p ->> 'substatus'));
  for s in select * from app.shipments where upper(tracking_no) = tn loop
    n_ship := n_ship + 1;
    for e in select * from jsonb_array_elements(coalesce(p -> 'events', '[]'::jsonb)) loop
      if app.add_ship_event(s.id, coalesce(nullif(e ->> 'at', '')::timestamptz, now()),
           coalesce(nullif(e ->> 'mapped_status', ''), app.map_tm_status(e ->> 'status', e ->> 'substatus')), e ->> 'detail', e ->> 'location', 'tu_dong') then n_ev := n_ev + 1; end if;
    end loop;
    lat := coalesce(nullif(p ->> 'latest_at', '')::timestamptz,
                    (select max(ev_at) from app.shipment_events where shipment_id = s.id and source = 'tu_dong'), now());
    ldet := coalesce(nullif(p ->> 'latest_detail', ''),
                     (select detail from app.shipment_events where shipment_id = s.id and source = 'tu_dong' order by ev_at desc, id desc limit 1));
    if st is not null and (st <> s.status) then
      if app.set_ship_status(s.id, st, lat, ldet) then changed := changed + 1; end if;
    else
      update app.shipments set last_sync_at = now() where id = s.id;
    end if;
  end loop;
  return jsonb_build_object('shipments', n_ship, 'new_events', n_ev, 'changed', changed, 'status', st);
end $$;

-- Đối soát tiền COD: SPX chuyển 1 khoản gộp nhiều vận đơn (đã trừ cước) về tài khoản
-- p = {book_id, shipment_ids[], fund_id, date, received, bank_txn_id?}
create or replace function public.settle_cod(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb; ids uuid[]; s record; tot numeric := 0; recv numeric; fee_tot numeric; fee_left numeric;
  fee numeric; n int; i int := 0; pay jsonb; pids uuid[] := '{}'; d date := coalesce((p ->> 'date')::date, app.today());
  rem numeric; codes text[] := '{}'; tx app.bank_txns; fid uuid := (p ->> 'fund_id')::uuid; cr text; ncr int;
begin
  perform app.require(b, 'thu_chi');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'settle_cod'); if r is not null then return r; end if;
  select array_agg(x::uuid) into ids from jsonb_array_elements_text(coalesce(p -> 'shipment_ids', '[]'::jsonb)) x;
  if ids is null or array_length(ids, 1) = 0 then raise exception 'Chọn ít nhất 1 vận đơn để đối soát'; end if;
  select count(*), sum(cod_amount) into n, tot from app.shipments where id = any(ids) and book_id = b and cod_status = 'spx_dang_giu';
  if n <> array_length(ids, 1) then raise exception 'Có vận đơn chưa giao thành công hoặc đã đối soát rồi'; end if;
  select count(distinct carrier), min(carrier) into ncr, cr from app.shipments where id = any(ids);
  if ncr > 1 then raise exception 'Mỗi lần đối soát chỉ chọn vận đơn của 1 đơn vị vận chuyển (SPX và BEST chuyển tiền riêng)'; end if;
  recv := round((p ->> 'received')::numeric);
  if recv is null or recv <= 0 then raise exception 'Nhập số tiền % thực chuyển về', app.carrier_short(cr); end if;
  fee_tot := tot - recv;
  if fee_tot < 0 then raise exception 'Số tiền về (%) lớn hơn tổng COD (%) — kiểm tra lại các vận đơn đã chọn', recv, tot; end if;
  if nullif(p ->> 'bank_txn_id', '') is not null then
    select * into tx from app.bank_txns where id = (p ->> 'bank_txn_id')::uuid for update;
    if not found or tx.status <> 'cho_xu_ly' then raise exception 'Giao dịch ngân hàng không còn chờ xử lý'; end if;
    if tx.amount <> recv then raise exception 'Số tiền về (%) khác số tiền giao dịch ngân hàng (%)', recv, tx.amount; end if;
    if tx.book_id is not null and tx.book_id <> b then raise exception 'Giao dịch thuộc sổ khác'; end if;
  end if;
  fee_left := fee_tot;
  for s in select sh.*, o.customer_id, o.code as ocode from app.shipments sh join app.sales_orders o on o.id = sh.order_id
           where sh.id = any(ids) order by sh.cod_amount, sh.id loop
    i := i + 1;
    fee := case when i = n then fee_left else round(fee_tot * s.cod_amount / nullif(tot, 0)) end;
    fee := least(fee, s.cod_amount - 1); fee_left := fee_left - fee;
    select remaining_total into rem from app.v_open_docs where doc_type = 'don_ban' and doc_id = s.order_id;
    pay := app.do_payment(b, jsonb_build_object('kind', 'thu_khach', 'party_id', s.customer_id, 'fund_id', fid, 'date', d,
      'amount', s.cod_amount, 'fee', fee, 'fee_category', 'Phí vận chuyển (ship, COD)', 'fee_note', 'Cước / phí thu hộ ' || app.carrier_short(cr) || ' trừ vào COD vận đơn ' || s.tracking_no,
      'method', 'COD ' || app.carrier_name(cr), 'note', 'Đối soát COD ' || app.carrier_short(cr) || ' ' || s.tracking_no,
      'allocations', case when coalesce(rem, 0) > 0 then jsonb_build_array(jsonb_build_object('doc_type', 'don_ban', 'doc_id', s.order_id,
          'amount', least(s.cod_amount, rem))) else '[]'::jsonb end));
    pids := pids || (pay ->> 'id')::uuid; codes := codes || (pay ->> 'code');
    update app.shipments set cod_status = 'da_ve_tk', cod_payment_ids = cod_payment_ids || (pay ->> 'id')::uuid, cod_settled_at = now(), updated_at = now()
      where id = s.id;
  end loop;
  if fee_left <> 0 then raise exception 'Cước bị trừ lớn hơn tiền COD của vận đơn'; end if;
  if tx.id is not null then
    update app.bank_txns set status = 'da_ghi', book_id = b, payment_ids = pids, handled_by = auth.uid(), handled_at = now(),
      match_note = 'Đối soát COD ' || n || ' vận đơn ' || app.carrier_short(cr) where id = tx.id;
  end if;
  return app.req_end((p ->> 'request_id')::uuid, jsonb_build_object('payments', to_jsonb(codes), 'count', n, 'cod_total', tot, 'fee_total', fee_tot, 'carrier', cr));
end $$;

-- ---------- TIỀN VỀ TÀI KHOẢN ----------
create or replace function app.norm_acct(t text) returns text language sql immutable as $$ select regexp_replace(coalesce(t, ''), '\D', '', 'g') $$;

create or replace function app.bank_fund(p_book uuid) returns uuid language sql stable as $$
  select coalesce(
    (select f.id from app.funds f where f.book_id = p_book and f.active and f.id::text = (app.setting(p_book, 'bank') ->> 'fund_id')),
    (select f.id from app.funds f where f.book_id = p_book and f.active and (f.name ilike '%ngân hàng%' or f.name ilike '%tài khoản%' or f.name ilike '%bank%') order by f.sort limit 1),
    (select f.id from app.funds f where f.book_id = p_book and f.active order by f.sort desc limit 1))
$$;

-- Ghi tiền khách chuyển vào 1 đơn (dùng cho tự động và ghi tay)
create or replace function app.post_bank_to_order(p_txn uuid, p_book uuid, p_order uuid, p_auto boolean) returns jsonb language plpgsql as $$
declare t app.bank_txns; o record; rem numeric; alloc numeric; pay jsonb; d date; fid uuid;
begin
  select * into t from app.bank_txns where id = p_txn for update;
  select * into o from app.v_sales_orders where id = p_order and book_id = p_book;
  if not found then raise exception 'Không tìm thấy đơn hàng'; end if;
  if o.status <> 'xac_nhan' then raise exception 'Đơn % chưa xác nhận hoặc đã hủy', o.code; end if;
  select remaining_total into rem from app.v_open_docs where doc_type = 'don_ban' and doc_id = o.id;
  alloc := least(t.amount, greatest(coalesce(rem, 0), 0));
  d := least((t.txn_at at time zone 'Asia/Ho_Chi_Minh')::date, app.today());
  fid := app.bank_fund(p_book);
  if fid is null then raise exception 'Sổ chưa có quỹ tài khoản ngân hàng'; end if;
  pay := app.do_payment(p_book, jsonb_build_object('kind', 'thu_khach', 'party_id', o.customer_id, 'fund_id', fid, 'date', d,
    'amount', t.amount, 'method', 'Chuyển khoản',
    'note', case when p_auto then 'Tự động ghi khi tiền về TK' else 'Ghi từ tiền về TK' end || ' · ND: ' || left(coalesce(t.content, ''), 120),
    'allocations', case when alloc > 0 then jsonb_build_array(jsonb_build_object('doc_type', 'don_ban', 'doc_id', o.id, 'amount', alloc)) else '[]'::jsonb end));
  update app.bank_txns set status = 'da_ghi', book_id = p_book, order_id = o.id, payment_ids = array[(pay ->> 'id')::uuid],
    handled_by = auth.uid(), handled_at = now(),
    match_note = case when p_auto then 'Tự khớp theo mã đơn ' else 'Ghi tay vào đơn ' end || o.code
      || case when t.amount > alloc then ' · khách trả dư ' || app.vnd(t.amount - alloc) || ' (tính là trả trước)' else '' end
  where id = t.id;
  return jsonb_build_object('payment_code', pay ->> 'code', 'order_code', o.code, 'customer', o.customer_name,
    'allocated', alloc, 'excess', t.amount - alloc, 'remaining_after', greatest(coalesce(rem, 0) - alloc, 0));
end $$;

-- Nhận 1 giao dịch từ Casso/SePay (hàm máy chủ gọi bằng khóa service)
-- p = {provider, ext_id, account_no, amount, direction:'in'|'out', content, txn_at, ref, counter_name, code?, raw}
create or replace function public.ingest_bank_txn(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare t app.bank_txns; acct text := app.norm_acct(p ->> 'account_no'); cands uuid[]; b record; norm text; m text[];
  found_book uuid; found_order uuid; res jsonb; amt numeric := abs(round((p ->> 'amount')::numeric)); dir text := coalesce(p ->> 'direction', 'in');
  ttl text; body text; err text; nb int;
begin
  if amt is null or amt = 0 then raise exception 'Số tiền giao dịch không hợp lệ'; end if;
  select * into t from app.bank_txns where provider = p ->> 'provider' and ext_id = p ->> 'ext_id';
  if found then return jsonb_build_object('duplicate', true, 'id', t.id, 'status', t.status); end if;

  -- Sổ nào dùng tài khoản này
  select array_agg(id) into cands from app.books where app.norm_acct(settings -> 'bank' ->> 'account_no') = acct and acct <> '';
  if cands is null then select array_agg(id) into cands from app.books where not is_demo or coalesce((p ->> 'demo')::boolean, false); end if;
  cands := coalesce(cands, '{}');

  insert into app.bank_txns (provider, ext_id, account_no, amount, direction, content, txn_at, ref, counter_name, candidate_books, raw,
    book_id, status, match_note)
  values (p ->> 'provider', p ->> 'ext_id', acct, amt, dir, p ->> 'content', coalesce(nullif(p ->> 'txn_at', '')::timestamptz, now()),
    p ->> 'ref', p ->> 'counter_name', cands, p -> 'raw',
    case when array_length(cands, 1) = 1 then cands[1] end,
    case when dir = 'out' then 'bo_qua' else 'cho_xu_ly' end, case when dir = 'out' then 'Tiền ra khỏi tài khoản' end)
  returning * into t;
  if dir = 'out' then return jsonb_build_object('id', t.id, 'status', 'bo_qua'); end if;

  -- Tìm mã đơn trong nội dung: <mã sổ>DH<5 số>, ví dụ THDH00012 / VG DH00007
  norm := upper(regexp_replace(coalesce(p ->> 'code', '') || ' ' || coalesce(p ->> 'content', ''), '[^A-Za-z0-9]', '', 'g'));
  nb := array_length(cands, 1);
  for b in select id, upper(short_name) as sn from app.books where id = any(cands) loop
    m := regexp_match(norm, b.sn || 'DH(\d{5})(?!\d)');
    if m is null and nb = 1 then m := regexp_match(norm, 'DH(\d{5})(?!\d)'); end if;
    if m is not null then
      select id into found_order from app.sales_orders where book_id = b.id and code = 'DH' || m[1];
      if found then found_book := b.id; exit; end if;
    end if;
  end loop;

  if found_order is not null then
    begin
      res := app.post_bank_to_order(t.id, found_book, found_order, true);
      ttl := '💰 +' || app.vnd(amt) || ' · ' || (res ->> 'order_code');
      body := coalesce(res ->> 'customer', '') || ' chuyển khoản. Đã gạch nợ đơn ' || (res ->> 'order_code')
        || case when (res ->> 'remaining_after')::numeric > 0 then ', đơn còn nợ ' || app.vnd((res ->> 'remaining_after')::numeric)
                else ', đơn đã thu đủ' end
        || case when (res ->> 'excess')::numeric > 0 then '. Khách trả dư ' || app.vnd((res ->> 'excess')::numeric) || ' (tính là trả trước)' else '' end;
      perform app.notify(found_book, 'tien_ve', 'good', ttl, body, 'order:' || found_order, 'bank:' || t.id);
      return jsonb_build_object('id', t.id, 'status', 'da_ghi') || res;
    exception when others then
      err := sqlerrm;
      update app.bank_txns set book_id = found_book, order_id = found_order,
        match_note = 'Có mã đơn nhưng chưa ghi được tự động: ' || err where id = t.id;
    end;
  else
    update app.bank_txns set match_note = case
      when norm ~ '(SPX|SHOPEEEXPRESS|SHOPEE)' then 'Có thể là tiền COD từ Shopee Express — dùng “Đối soát COD”'
      when norm ~ '(BESTEXPRESS|BESTINC|BEST)' then 'Có thể là tiền COD từ BEST Express — dùng “Đối soát COD”'
      else 'Không tìm thấy mã đơn trong nội dung chuyển khoản' end where id = t.id;
  end if;

  select * into t from app.bank_txns where id = t.id;
  for b in select unnest(case when t.book_id is not null then array[t.book_id] else t.candidate_books end) as id loop
    perform app.notify(b.id, 'tien_ve', 'warn', '💰 +' || app.vnd(amt) || ' · chưa khớp đơn',
      coalesce(t.counter_name || ' · ', '') || 'ND: “' || left(coalesce(t.content, ''), 90) || '”. ' || t.match_note || '. Mở “Tiền về TK” để ghi vào đơn.',
      'bank:' || t.id, 'bank:' || t.id || ':' || b.id);
  end loop;
  return jsonb_build_object('id', t.id, 'status', t.status, 'note', t.match_note);
end $$;

-- Ghi tay giao dịch chưa khớp vào 1 đơn hoặc vào công nợ chung của 1 khách
create or replace function public.assign_bank_txn(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; t app.bank_txns; r jsonb; pay jsonb; cid uuid := nullif(p ->> 'customer_id', '')::uuid;
begin
  perform app.require(b, 'thu_chi');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'assign_bank_txn'); if r is not null then return r; end if;
  select * into t from app.bank_txns where id = (p ->> 'id')::uuid for update;
  if not found or not (t.book_id = b or (t.book_id is null and b = any(t.candidate_books))) then raise exception 'Không tìm thấy giao dịch'; end if;
  if t.status <> 'cho_xu_ly' then raise exception 'Giao dịch này đã được xử lý'; end if;
  if nullif(p ->> 'order_id', '') is not null then
    r := app.post_bank_to_order(t.id, b, (p ->> 'order_id')::uuid, false);
  elsif cid is not null then
    pay := app.do_payment(b, jsonb_build_object('kind', 'thu_khach', 'party_id', cid, 'fund_id', app.bank_fund(b),
      'date', least((t.txn_at at time zone 'Asia/Ho_Chi_Minh')::date, app.today()), 'amount', t.amount, 'method', 'Chuyển khoản',
      'auto_allocate', true, 'note', 'Ghi từ tiền về TK · ND: ' || left(coalesce(t.content, ''), 120)));
    update app.bank_txns set status = 'da_ghi', book_id = b, payment_ids = array[(pay ->> 'id')::uuid], handled_by = auth.uid(), handled_at = now(),
      match_note = 'Ghi tay vào công nợ khách (tự trừ các khoản nợ cũ nhất trước)' where id = t.id;
    r := jsonb_build_object('payment_code', pay ->> 'code');
  else
    raise exception 'Chọn đơn hàng hoặc khách hàng';
  end if;
  return app.req_end((p ->> 'request_id')::uuid, r);
end $$;

create or replace function public.ignore_bank_txn(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; t app.bank_txns;
begin
  perform app.require(b, 'thu_chi');
  select * into t from app.bank_txns where id = (p ->> 'id')::uuid for update;
  if not found or not (t.book_id = b or (t.book_id is null and b = any(t.candidate_books))) then raise exception 'Không tìm thấy giao dịch'; end if;
  if t.status = 'da_ghi' then raise exception 'Giao dịch đã ghi vào sổ — muốn bỏ thì hủy phiếu thu tương ứng'; end if;
  if coalesce(trim(p ->> 'reason'), '') = '' then raise exception 'Ghi lý do (vd. tiền cá nhân, chuyển giữa tài khoản…)'; end if;
  update app.bank_txns set status = 'bo_qua', book_id = b, match_note = 'Bỏ qua: ' || (p ->> 'reason'), handled_by = auth.uid(), handled_at = now()
    where id = t.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- BÁO CÁO NGÀY & NHẮC CÔNG NỢ ----------
create or replace function app.digest_daily(p_book uuid, d date) returns bigint language plpgsql as $$
declare pl jsonb; mtd jsonb; nb text; n_del int; n_new int; open_o int; late_o int; ships int; probs int; body text;
begin
  select name into nb from app.books where id = p_book;
  pl := app.calc_pl(p_book, d, d);
  mtd := app.calc_pl(p_book, date_trunc('month', d)::date, d);
  select count(*) into n_del from app.deliveries where book_id = p_book and delivery_date = d;
  select count(*) into n_new from app.sales_orders where book_id = p_book and order_date = d and status <> 'huy';
  select count(*) filter (where status = 'xac_nhan' and remaining_qty > 0), count(*) filter (where is_late) into open_o, late_o
    from app.v_sales_orders where book_id = p_book;
  select count(*) filter (where status not in ('giao_thanh_cong','da_hoan','da_huy')), count(*) filter (where status in ('giao_that_bai','dang_hoan','su_co'))
    into ships, probs from app.shipments where book_id = p_book;
  body := 'Doanh thu ' || app.vnd((pl ->> 'revenue')::numeric) || ' (' || n_del || ' lần giao) · Tiền thu ' || app.vnd((pl ->> 'cash_in')::numeric)
    || ' · Chi ' || app.vnd((pl ->> 'cash_out')::numeric) || ' · Lãi gộp ' || app.vnd((pl ->> 'gross_profit')::numeric)
    || E'\nĐơn mới ' || n_new || ' · Chờ giao ' || open_o || case when late_o > 0 then ' (trễ hẹn ' || late_o || ')' else '' end
    || ' · Đang vận chuyển ' || ships || case when probs > 0 then ' (có vấn đề ' || probs || ')' else '' end
    || E'\nLũy kế tháng: doanh thu ' || app.vnd((mtd ->> 'revenue')::numeric) || ' · lợi nhuận sau chi phí ' || app.vnd((mtd ->> 'profit')::numeric);
  return app.notify(p_book, 'bao_cao', 'info', '📊 Báo cáo ngày ' || to_char(d, 'DD/MM') || ' · ' || nb, body, 'page:tong-quan',
                    'daily:' || p_book || ':' || d);
end $$;

create or replace function app.digest_debt(p_book uuid, d date) returns bigint language plpgsql as $$
declare warn int := coalesce((app.setting(p_book, 'due_warn_days') #>> '{}')::int, 3); od numeric; odn int; top text; soon text; soon_n int;
  pay_due text; cod_old text; body text := ''; lvl text := 'warn'; nb text;
begin
  select name into nb from app.books where id = p_book;
  select coalesce(sum(overdue), 0), count(*) filter (where overdue > 0),
         string_agg(name || ' ' || app.vnd(overdue) || ' (quá ' || max_overdue_days || ' ngày)', '; ' order by overdue desc) filter (where overdue > 0)
    into od, odn, top from (select * from app.v_customers where book_id = p_book and overdue > 0 order by overdue desc limit 5) x;
  select count(*), string_agg(coalesce(customer_name, '') || ' · ' || code || ' ' || app.vnd(receivable) || ' hạn ' || to_char(pay_due_date, 'DD/MM'), '; ' order by pay_due_date)
    into soon_n, soon from (select * from app.v_sales_orders where book_id = p_book and receivable > 0 and pay_due_date between d and d + warn
                             order by pay_due_date limit 5) x;
  select string_agg(coalesce(supplier_name, '') || ' · ' || code || ' ' || app.vnd(payable) || case when overdue_days > 0 then ' (quá ' || overdue_days || ' ngày)' else ' hạn ' || to_char(pay_due_date, 'DD/MM') end, '; ')
    into pay_due from (select * from app.v_purchase_orders where book_id = p_book and payable > 0 and pay_due_date <= d + warn order by pay_due_date limit 5) x;
  select string_agg(app.carrier_short(carrier) || ' ' || tracking_no || ' ' || app.vnd(cod_amount), '; ') into cod_old
    from (select * from app.shipments where book_id = p_book and cod_status = 'spx_dang_giu' and status_at < now() - interval '7 days' limit 5) x;
  if odn > 0 then body := body || 'Khách quá hạn: ' || odn || ' khách, tổng ' || app.vnd(od) || ' — ' || top || E'\n'; lvl := 'bad'; end if;
  if soon_n > 0 then body := body || 'Sắp đến hạn (' || warn || ' ngày tới): ' || soon || E'\n'; end if;
  if pay_due is not null then body := body || 'Mình cần trả NCC: ' || pay_due || E'\n'; end if;
  if cod_old is not null then body := body || 'COD đơn vị vận chuyển giữ quá 7 ngày chưa về TK: ' || cod_old || E'\n'; end if;
  if body = '' then return null; end if;
  return app.notify(p_book, 'cong_no', lvl, '⏰ Nhắc công nợ ' || to_char(d, 'DD/MM') || ' · ' || nb, rtrim(body, E'\n'), 'page:khach-hang',
                    'debt:' || p_book || ':' || d);
end $$;

-- Lịch tự động gọi (pg_cron). p = {kind:'daily_report'|'debt_reminder', book_id?, date?}
create or replace function public.run_scheduled(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b record; d date := coalesce(nullif(p ->> 'date', '')::date, app.today()); n int := 0; r bigint;
begin
  for b in select id from app.books where (nullif(p ->> 'book_id', '') is null and not is_demo) or id::text = p ->> 'book_id' loop
    r := case p ->> 'kind' when 'daily_report' then app.digest_daily(b.id, d) when 'debt_reminder' then app.digest_debt(b.id, d) end;
    if r is not null then n := n + 1; end if;
  end loop;
  return jsonb_build_object('created', n);
end $$;

-- Bản chạy thử: chủ sổ bấm để xem trước báo cáo ngày / nhắc nợ (chỉ sổ dữ liệu mẫu)
create or replace function public.demo_run_scheduled(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r bigint;
begin
  perform app.require(b, 'owner');
  if not (select is_demo from app.books where id = b) then raise exception 'Chỉ dùng trong sổ dữ liệu mẫu'; end if;
  delete from app.notifications where book_id = b and dedupe_key in ('daily:' || b || ':' || app.today(), 'debt:' || b || ':' || app.today());
  r := case p ->> 'kind' when 'daily_report' then app.digest_daily(b, app.today()) else app.digest_debt(b, app.today()) end;
  return jsonb_build_object('id', r);
end $$;

-- Bản chạy thử: giả lập tiền về / SPX cập nhật (chỉ sổ dữ liệu mẫu)
create or replace function public.demo_simulate(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; bk app.books; s app.shipments;
begin
  perform app.require(b, 'owner');
  select * into bk from app.books where id = b;
  if not bk.is_demo then raise exception 'Chỉ dùng trong sổ dữ liệu mẫu'; end if;
  if p ->> 'what' = 'bank' then
    return public.ingest_bank_txn(jsonb_build_object('provider', 'demo', 'ext_id', gen_random_uuid()::text, 'demo', true,
      'account_no', bk.settings -> 'bank' ->> 'account_no', 'amount', p ->> 'amount', 'direction', 'in',
      'content', p ->> 'content', 'counter_name', nullif(p ->> 'counter_name', ''), 'txn_at', now()));
  else
    select * into s from app.shipments where id = (p ->> 'shipment_id')::uuid and book_id = b;
    if not found then raise exception 'Không tìm thấy vận đơn'; end if;
    return public.ingest_tracking(jsonb_build_object('tracking_no', s.tracking_no, 'mapped_status', p ->> 'status',
      'events', jsonb_build_array(jsonb_build_object('at', now(), 'detail', p ->> 'detail', 'location', p ->> 'location'))));
  end if;
end $$;

-- ---------- THÔNG BÁO CỦA TÔI ----------
create or replace function public.my_notifications(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; lr bigint; items jsonb; unread int; prefs jsonb;
begin
  perform app.require(b, null);
  select coalesce(last_read_id, 0) into lr from app.notification_reads where user_id = auth.uid() and book_id = b;
  lr := coalesce(lr, 0);
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'level', n.level, 'title', n.title, 'body', n.body, 'link', n.link,
           'at', n.created_at, 'unread', n.id > lr) order by n.id desc), '[]'::jsonb)
    into items from (select * from app.notifications n where n.book_id = b and app.notify_allowed(b, auth.uid(), n.kind)
                     order by id desc limit least(coalesce((p ->> 'limit')::int, 50), 200)) n;
  select count(*) into unread from app.notifications n where n.book_id = b and n.id > lr and app.notify_allowed(b, auth.uid(), n.kind);
  select notify into prefs from app.book_members where book_id = b and user_id = auth.uid();
  return jsonb_build_object('items', items, 'unread', unread, 'prefs', prefs,
    'subs', (select count(*) from app.push_subs where user_id = auth.uid()));
end $$;

create or replace function public.mark_notifications_read(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; mx bigint;
begin
  perform app.require(b, null);
  select coalesce(max(id), 0) into mx from app.notifications where book_id = b;
  insert into app.notification_reads (user_id, book_id, last_read_id) values (auth.uid(), b, mx)
  on conflict (user_id, book_id) do update set last_read_id = greatest(app.notification_reads.last_read_id, excluded.last_read_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.save_notify_prefs(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; pr jsonb := '{}'::jsonb; k text;
begin
  perform app.require(b, null);
  foreach k in array array['don_hang','van_chuyen','tien_ve','cong_no','bao_cao'] loop
    if p -> 'prefs' ? k then pr := pr || jsonb_build_object(k, coalesce((p -> 'prefs' ->> k)::boolean, true)); end if;
  end loop;
  update app.book_members set notify = notify || pr where book_id = b and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.save_push_sub(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Bạn chưa đăng nhập'; end if;
  if coalesce(p ->> 'endpoint', '') !~ '^https://' or coalesce(p ->> 'p256dh', '') = '' or coalesce(p ->> 'auth', '') = '' then
    raise exception 'Thông tin đăng ký nhận thông báo không hợp lệ'; end if;
  insert into app.push_subs (user_id, endpoint, p256dh, auth, user_agent) values (auth.uid(), p ->> 'endpoint', p ->> 'p256dh', p ->> 'auth', left(p ->> 'user_agent', 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, fail_count = 0;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.delete_push_sub(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  delete from app.push_subs where user_id = auth.uid() and (endpoint = p ->> 'endpoint' or coalesce((p ->> 'all')::boolean, false));
  return jsonb_build_object('ok', true);
end $$;

-- ---------- HÀNG ĐỢI CHO HÀM MÁY CHỦ (chỉ khóa service) ----------
-- Thông báo chưa gửi lên điện thoại + danh sách máy nhận
create or replace function public.push_queue(p jsonb) returns jsonb
language sql security definer set search_path = app, public, pg_temp as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select n.id, n.title, n.body, n.link, n.level, bk.name as book_name, bk.id as book_id,
      (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
         from app.push_subs s join app.book_members m on m.user_id = s.user_id and m.book_id = n.book_id
        where app.notify_allowed(n.book_id, s.user_id, n.kind)) as subs
    from app.notifications n join app.books bk on bk.id = n.book_id
    where n.push_sent_at is null and n.created_at > now() - interval '1 day' and not bk.is_demo
    order by n.id limit least(coalesce((p ->> 'limit')::int, 50), 200)) x
$$;

create or replace function public.push_done(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  update app.notifications set push_sent_at = now()
   where id in (select (x)::bigint from jsonb_array_elements_text(coalesce(p -> 'ids', '[]'::jsonb)) x);
  update app.push_subs set last_ok_at = now(), fail_count = 0
   where endpoint in (select x from jsonb_array_elements_text(coalesce(p -> 'ok_endpoints', '[]'::jsonb)) x);
  delete from app.push_subs where endpoint in (select x from jsonb_array_elements_text(coalesce(p -> 'dead_endpoints', '[]'::jsonb)) x);
  return jsonb_build_object('ok', true);
end $$;

-- Vận đơn cần đăng ký theo dõi tự động / cần hỏi lại trạng thái
create or replace function public.tracking_queue(p jsonb) returns jsonb
language sql security definer set search_path = app, public, pg_temp as $$
  select jsonb_build_object(
    'register', (select coalesce(jsonb_agg(jsonb_build_object('tracking_no', tracking_no, 'carrier', carrier)), '[]'::jsonb)
                   from (select distinct upper(tracking_no) tracking_no, carrier from app.shipments s join app.books b on b.id = s.book_id
                          where s.tracking_registered_at is null and s.status not in ('giao_thanh_cong','da_hoan','da_huy') and not b.is_demo limit 40) r),
    'poll', (select coalesce(jsonb_agg(jsonb_build_object('tracking_no', tracking_no, 'carrier', carrier)), '[]'::jsonb)
               from (select distinct upper(tracking_no) tracking_no, carrier from app.shipments s join app.books b on b.id = s.book_id
                      where s.tracking_registered_at is not null and s.status not in ('giao_thanh_cong','da_hoan','da_huy') and not b.is_demo
                        and coalesce(s.last_sync_at, s.created_at) < now() - interval '3 hours' limit 40) q))
$$;

create or replace function public.tracking_registered(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  update app.shipments set tracking_registered_at = now()
   where upper(tracking_no) in (select upper(x) from jsonb_array_elements_text(coalesce(p -> 'tracking_nos', '[]'::jsonb)) x);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- NHẬT KÝ ----------
drop trigger if exists audit on app.shipments;
create trigger audit after insert or update or delete on app.shipments for each row
  execute function app.audit_trg('status,status_at,status_detail,last_sync_at,tracking_registered_at,cod_status,cod_settled_at,cod_payment_ids');
drop trigger if exists audit on app.bank_txns;
create trigger audit after insert or update or delete on app.bank_txns for each row execute function app.audit_trg('');

-- ---------- QUYỀN GỌI HÀM ----------
do $$
declare f record; svc boolean;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_shipment','update_shipment','update_shipment_status','settle_cod',
             'assign_bank_txn','ignore_bank_txn','my_notifications','mark_notifications_read','save_notify_prefs','save_push_sub',
             'delete_push_sub','demo_run_scheduled','demo_simulate',
             'ingest_tracking','ingest_bank_txn','run_scheduled','push_queue','push_done','tracking_queue','tracking_registered') loop
    svc := f.proname in ('ingest_tracking','ingest_bank_txn','run_scheduled','push_queue','push_done','tracking_queue','tracking_registered');
    execute format('revoke all on function %s from public', f.sig);
    begin execute format('revoke all on function %s from anon', f.sig); exception when others then null; end;
    if svc then
      begin execute format('revoke all on function %s from authenticated', f.sig); exception when others then null; end;
      begin execute format('grant execute on function %s to service_role', f.sig); exception when others then null; end;
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ===== db/07_ship_bank_extra.sql =====
-- =====================================================================
--  07. BỔ SUNG cho vận chuyển · tiền về · thông báo
--  - Thông báo khi đơn được xác nhận (đơn mới)
--  - Hủy phiếu thu đã gắn với tiền về TK / đối soát COD → trả giao dịch về "chờ xử lý"
--  - Nhập trạng thái vận đơn hàng loạt (từ file Excel tải ở trang quản lý SPX)
--  - Kiểm tra cài đặt tài khoản nhận tiền (QR chuyển khoản)
-- =====================================================================

-- ---------- THÔNG BÁO ĐƠN MỚI ----------
-- Chạy lúc kết thúc giao dịch (deferred) để tổng tiền đơn đã đủ các dòng hàng.
create or replace function app.order_confirmed_trg() returns trigger language plpgsql security definer
set search_path = app, public, pg_temp as $$
declare o record;
begin
  if new.status <> 'xac_nhan' or (tg_op = 'UPDATE' and old.status = 'xac_nhan') then return null; end if;
  select code, kind, customer_name, order_total, channel, due_date into o from app.v_sales_orders where id = new.id;
  if not found then return null; end if;
  perform app.notify(new.book_id, 'don_hang', 'info',
    '🧾 ' || case when o.kind = 'dat_hang' then 'Đơn đặt riêng ' else 'Đơn mới ' end || o.code || ' · ' || app.vnd(o.order_total),
    coalesce(o.customer_name, '') || coalesce(' · ' || o.channel, '')
      || case when o.due_date is not null then ' · hẹn giao ' || to_char(o.due_date, 'DD/MM') else '' end,
    'order:' || new.id, 'order:' || new.id || ':xac_nhan');
  return null;
end $$;
drop trigger if exists order_confirmed on app.sales_orders;
create constraint trigger order_confirmed after insert or update of status on app.sales_orders
  deferrable initially deferred for each row execute function app.order_confirmed_trg();

-- ---------- HỦY PHIẾU THU → TRẢ LẠI GIAO DỊCH NGÂN HÀNG / COD ----------
create or replace function app.payment_voided_trg() returns trigger language plpgsql security definer
set search_path = app, public, pg_temp as $$
declare t record; s record;
begin
  if not (new.voided and not old.voided) then return null; end if;
  -- Giao dịch ngân hàng: khi mọi phiếu thu sinh ra từ nó đều đã hủy → chờ ghi lại
  for t in select * from app.bank_txns where new.id = any(payment_ids) loop
    if not exists (select 1 from app.payments p where p.id = any(t.payment_ids) and not p.voided) then
      update app.bank_txns set status = 'cho_xu_ly', payment_ids = '{}', order_id = null, handled_by = null, handled_at = null,
        match_note = 'Phiếu thu ' || new.code || ' đã hủy — giao dịch chờ ghi lại' where id = t.id;
    end if;
  end loop;
  -- Vận đơn đã đối soát COD bằng phiếu này → SPX coi như vẫn đang giữ tiền
  for s in select * from app.shipments where new.id = any(cod_payment_ids) loop
    update app.shipments set cod_payment_ids = array_remove(cod_payment_ids, new.id),
      cod_status = case when array_length(array_remove(cod_payment_ids, new.id), 1) is null then 'spx_dang_giu' else cod_status end,
      cod_settled_at = case when array_length(array_remove(cod_payment_ids, new.id), 1) is null then null else cod_settled_at end,
      updated_at = now()
    where id = s.id;
  end loop;
  return null;
end $$;
drop trigger if exists payment_voided on app.payments;
create trigger payment_voided after update of voided on app.payments for each row execute function app.payment_voided_trg();

-- Thứ tự tiến trình giao (để biết trạng thái nào "đi xa hơn" khi thời gian trong file sớm hơn lúc tạo vận đơn trong sổ)
create or replace function app.ship_rank(s text) returns int language sql immutable as $$
  select case s when 'cho_lay_hang' then 0 when 'da_lay_hang' then 1 when 'dang_trung_chuyen' then 2 when 'dang_giao' then 3
    when 'giao_that_bai' then 4 when 'giao_thanh_cong' then 5 when 'dang_hoan' then 5 when 'su_co' then 5
    when 'da_hoan' then 6 when 'da_huy' then 6 else 0 end
$$;

-- ---------- NHẬP TRẠNG THÁI VẬN ĐƠN HÀNG LOẠT ----------
-- p = {book_id, rows:[{tracking_no, status (mã trạng thái), at?, detail?}]}
-- Trạng thái đã được giao diện chuyển từ chữ trong file SPX sang mã (cho_lay_hang, dang_giao, …).
create or replace function public.import_shipment_statuses(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb; x jsonb; tn text; st text; at timestamptz; s app.shipments;
  n_rows int := 0; n_changed int := 0; n_events int := 0; n_same int := 0; nf text[] := '{}'; bad text[] := '{}';
begin
  perform app.require(b, 'ban_hang');
  r := app.req_begin((p ->> 'request_id')::uuid, b, 'import_shipment_statuses'); if r is not null then return r; end if;
  for x in select * from jsonb_array_elements(coalesce(p -> 'rows', '[]'::jsonb)) loop
    n_rows := n_rows + 1;
    tn := upper(regexp_replace(coalesce(x ->> 'tracking_no', ''), '\s', '', 'g'));
    st := x ->> 'status';
    if tn = '' then continue; end if;
    if st is null or app.ship_status_label(st) = st then bad := bad || tn; continue; end if;
    at := least(coalesce(nullif(x ->> 'at', '')::timestamptz, now()), now());
    select * into s from app.shipments where book_id = b and upper(tracking_no) = tn;
    if not found then nf := nf || tn; continue; end if;
    if app.add_ship_event(s.id, at, st, nullif(x ->> 'detail', ''), null, 'tay') then n_events := n_events + 1; end if;
    -- Ghi nhận nếu mới hơn theo thời gian, hoặc đi xa hơn trong tiến trình giao (dù giờ trong file sớm hơn lúc nhập vận đơn vào sổ)
    if st <> s.status and (at >= s.status_at - interval '1 minute' or app.ship_rank(st) > app.ship_rank(s.status)) then
      if app.set_ship_status(s.id, st, at, nullif(x ->> 'detail', '')) then n_changed := n_changed + 1; end if;
    else
      n_same := n_same + 1;
    end if;
  end loop;
  return app.req_end((p ->> 'request_id')::uuid, jsonb_build_object('rows', n_rows, 'changed', n_changed, 'events', n_events,
    'unchanged', n_same, 'not_found', to_jsonb(nf), 'bad_status', to_jsonb(bad)));
end $$;

-- ---------- CÀI ĐẶT TÀI KHOẢN NHẬN TIỀN ----------
-- p = {book_id, bank:{bin, bank_name, account_no, account_name, fund_id}}  (lưu vào settings.bank)
create or replace function public.save_bank_account(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; bk jsonb := coalesce(p -> 'bank', '{}'::jsonb); acct text; nm text;
begin
  perform app.require(b, 'owner');
  acct := app.norm_acct(bk ->> 'account_no');
  nm := upper(trim(coalesce(bk ->> 'account_name', '')));
  if acct = '' then
    update app.books set settings = settings - 'bank' where id = b;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;
  if length(acct) < 6 or length(acct) > 19 then raise exception 'Số tài khoản không hợp lệ'; end if;
  if coalesce(bk ->> 'bin', '') !~ '^\d{6}$' then raise exception 'Chọn ngân hàng'; end if;
  if nm = '' then raise exception 'Nhập tên chủ tài khoản (in hoa, không dấu, đúng như trên ngân hàng)'; end if;
  if nullif(bk ->> 'fund_id', '') is not null and not exists (select 1 from app.funds where id = (bk ->> 'fund_id')::uuid and book_id = b) then
    raise exception 'Quỹ không thuộc sổ này'; end if;
  update app.books set settings = settings || jsonb_build_object('bank', jsonb_build_object(
    'bin', bk ->> 'bin', 'bank_name', bk ->> 'bank_name', 'account_no', acct, 'account_name', nm,
    'fund_id', nullif(bk ->> 'fund_id', ''))) where id = b;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- QUYỀN GỌI HÀM ----------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('import_shipment_statuses','save_bank_account') loop
    execute format('revoke all on function %s from public', f.sig);
    begin execute format('revoke all on function %s from anon', f.sig); exception when others then null; end;
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- ===== db/08_carriers.sql =====
-- =====================================================================
--  08. NHIỀU ĐƠN VỊ VẬN CHUYỂN (Shopee Express, BEST Express, đơn vị khác)
--  - Giới hạn mã hãng hợp lệ
--  - Nhật ký dữ liệu hãng vận chuyển gửi về (webhook): lưu nguyên văn để kiểm tra / chỉnh cách đọc khi có dữ liệu thật
-- =====================================================================

alter table app.shipments drop constraint if exists shipments_carrier_chk;
alter table app.shipments add constraint shipments_carrier_chk check (carrier in ('SPX','BEST','KHAC'));

create table if not exists app.carrier_webhook_log (
  id bigserial primary key,
  carrier text not null,
  received_at timestamptz not null default now(),
  tracking_no text,
  raw_status text,
  mapped_status text,
  result text not null check (result in ('da_cap_nhat','khong_doi','khong_co_van_don','chua_doc_duoc','loi')),
  note text,
  payload jsonb
);
create index if not exists carrier_webhook_log_idx on app.carrier_webhook_log (received_at desc);
revoke all on app.carrier_webhook_log from public;

-- Hàm máy chủ (khóa service): ghi 1 lần nhận dữ liệu từ hãng
-- p = {carrier, tracking_no, raw_status, mapped_status, result, note, payload}
create or replace function public.log_carrier_webhook(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare nid bigint;
begin
  insert into app.carrier_webhook_log (carrier, tracking_no, raw_status, mapped_status, result, note, payload)
  values (coalesce(nullif(p ->> 'carrier', ''), 'KHAC'), upper(nullif(p ->> 'tracking_no', '')), left(p ->> 'raw_status', 200),
    nullif(p ->> 'mapped_status', ''), coalesce(nullif(p ->> 'result', ''), 'chua_doc_duoc'), left(p ->> 'note', 500), p -> 'payload')
  returning id into nid;
  -- Giữ 3.000 dòng gần nhất
  delete from app.carrier_webhook_log where id < nid - 3000;
  return jsonb_build_object('id', nid);
end $$;

-- Chủ sổ xem 50 lần nhận gần nhất (chỉ những vận đơn thuộc sổ của mình, hoặc chưa xác định được vận đơn)
create or replace function public.carrier_webhook_log(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb;
begin
  perform app.require(b, 'owner');
  select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb) into r from (
    select l.id, l.carrier, l.received_at, l.tracking_no, l.raw_status, l.mapped_status, app.ship_status_label(l.mapped_status) as mapped_label,
      l.result, l.note, s.order_id, o.code as order_code
    from app.carrier_webhook_log l
    left join app.shipments s on upper(s.tracking_no) = l.tracking_no and s.book_id = b
    left join app.sales_orders o on o.id = s.order_id
    where (p ->> 'carrier' is null or l.carrier = p ->> 'carrier') and (s.id is not null or l.result in ('chua_doc_duoc','khong_co_van_don','loi'))
    order by l.id desc limit 50) x;
  return r;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('log_carrier_webhook','carrier_webhook_log') loop
    execute format('revoke all on function %s from public', f.sig);
    begin execute format('revoke all on function %s from anon', f.sig); exception when others then null; end;
    if f.proname = 'log_carrier_webhook' then
      begin execute format('revoke all on function %s from authenticated', f.sig); exception when others then null; end;
      begin execute format('grant execute on function %s to service_role', f.sig); exception when others then null; end;
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ===== db/09_expenses.sql =====
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

-- ===== db/10_documents.sql =====
-- =====================================================================
--  10. CHỨNG TỪ IN / XUẤT PDF
--  - Quy cách đóng gói của sản phẩm (vd. 140 viên / hộp) để in "4 hộp x 140 viên + 40 viên"
--  - Thông tin riêng từng chứng từ (người nhận, SĐT, địa chỉ giao, lái xe, tình trạng hàng…) lưu để in lại giống lần trước
--  Mẫu chứng từ (đơn vị phát hành, logo, ghi chú chính sách…) lưu trong cài đặt sổ: settings.docs
--  Chạy được trên cơ sở dữ liệu đã cài (nâng cấp), không mất dữ liệu.
-- =====================================================================

alter table app.products add column if not exists pack_unit text not null default 'hộp';
alter table app.products add column if not exists units_per_pack numeric;
alter table app.products drop constraint if exists products_pack_chk;
alter table app.products add constraint products_pack_chk check (units_per_pack is null or units_per_pack > 0);

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
  b.pack_unit, b.units_per_pack
from base b left join kit on kit.kit_id = b.id;

create or replace function public.save_product(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  b uuid := (p ->> 'book_id')::uuid; pid uuid := nullif(p ->> 'id', '')::uuid; old app.products;
  s text := nullif(trim(p ->> 'sku'), ''); kit boolean := coalesce((p ->> 'is_kit')::boolean, false); c jsonb; n int := 0;
begin
  perform app.require(b, 'danh_muc');
  if coalesce(nullif(p ->> 'units_per_pack', '')::numeric, 1) <= 0 then raise exception 'Số lượng mỗi hộp phải lớn hơn 0'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'Thiếu tên sản phẩm'; end if;
  if coalesce((p ->> 'price1')::numeric, 0) < 0 or coalesce((p ->> 'price2')::numeric, 0) < 0 or coalesce((p ->> 'price3')::numeric, 0) < 0 then
    raise exception 'Giá bán không được âm'; end if;
  if pid is null then
    if s is null then s := app.new_master_code(b, 'SP', 'products'); end if;
    if exists (select 1 from app.products where book_id = b and lower(sku) = lower(s)) then raise exception 'Mã SKU "%" đã tồn tại', s; end if;
    insert into app.products (book_id, sku, name, category, pattern, size, color, unit, image_url, price1, price2, price3, low_stock, is_kit, active, note, pack_unit, units_per_pack)
    values (b, s, trim(p ->> 'name'), p ->> 'category', p ->> 'pattern', p ->> 'size', p ->> 'color', coalesce(nullif(p ->> 'unit', ''), 'Cái'),
            p ->> 'image_url', coalesce((p ->> 'price1')::numeric, 0), coalesce((p ->> 'price2')::numeric, 0), coalesce((p ->> 'price3')::numeric, 0),
            coalesce((p ->> 'low_stock')::numeric, 0), kit, coalesce((p ->> 'active')::boolean, true), p ->> 'note',
            coalesce(nullif(trim(p ->> 'pack_unit'), ''), 'hộp'), nullif(p ->> 'units_per_pack', '')::numeric)
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
      insert into app.products (book_id, sku, name, category, pattern, size, color, unit, price1, price2, price3, low_stock, note, last_cost, units_per_pack, pack_unit)
      values (b, s, trim(row ->> 'name'), nullif(row ->> 'category', ''), nullif(row ->> 'pattern', ''), nullif(row ->> 'size', ''),
              nullif(row ->> 'color', ''), coalesce(nullif(row ->> 'unit', ''), 'Cái'),
              coalesce(nullif(row ->> 'price1', '')::numeric, 0), coalesce(nullif(row ->> 'price2', '')::numeric, 0),
              coalesce(nullif(row ->> 'price3', '')::numeric, 0), coalesce(nullif(row ->> 'low_stock', '')::numeric, 0),
              nullif(row ->> 'note', ''), coalesce(cst, 0), nullif(row ->> 'units_per_pack', '')::numeric, coalesce(nullif(trim(row ->> 'pack_unit'), ''), 'hộp'))
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

-- ---------- THÔNG TIN RIÊNG CỦA CHỨNG TỪ ----------
create table if not exists app.doc_info (
  book_id uuid not null references app.books(id) on delete cascade,
  ref_type text not null check (ref_type in ('order','delivery','payment')),
  ref_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid, updated_at timestamptz not null default now(),
  primary key (ref_type, ref_id)
);
revoke all on app.doc_info from public;

create or replace function app.doc_ref_ok(p_book uuid, p_type text, p_id uuid) returns boolean language sql stable as $$
  select case p_type
    when 'order' then exists (select 1 from app.sales_orders where id = p_id and book_id = p_book)
    when 'delivery' then exists (select 1 from app.deliveries where id = p_id and book_id = p_book)
    when 'payment' then exists (select 1 from app.payments where id = p_id and book_id = p_book)
    else false end
$$;

-- p = {book_id, ref_type, ref_id}
create or replace function public.get_doc_info(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; r jsonb;
begin
  perform app.require(b, null);
  if not app.doc_ref_ok(b, p ->> 'ref_type', (p ->> 'ref_id')::uuid) then raise exception 'Không tìm thấy chứng từ'; end if;
  select data into r from app.doc_info where ref_type = p ->> 'ref_type' and ref_id = (p ->> 'ref_id')::uuid;
  return coalesce(r, '{}'::jsonb);
end $$;

-- p = {book_id, ref_type, ref_id, data:{…}}  (chỉ lưu các trường cho phép, mỗi trường tối đa 500 ký tự)
create or replace function public.save_doc_info(p jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare b uuid := (p ->> 'book_id')::uuid; t text := p ->> 'ref_type'; rid uuid := (p ->> 'ref_id')::uuid; d jsonb := '{}'::jsonb; k text;
begin
  perform app.require(b, case when t = 'payment' then 'thu_chi' else 'ban_hang' end);
  if not app.doc_ref_ok(b, t, rid) then raise exception 'Không tìm thấy chứng từ'; end if;
  foreach k in array array['recv_name','recv_phone','recv_address','driver_name','driver_phone','handover_rep','goods_condition',
                           'box_total','old_debt','doc_date','note','place','reason','payer_name','payer_address','attach','recv_party',
                           'date_hoa_don','date_don_dat_hang','date_bien_ban','date_phieu_xuat_kho'] loop
    if p -> 'data' ? k then d := d || jsonb_build_object(k, left(p -> 'data' ->> k, 500)); end if;
  end loop;
  insert into app.doc_info (book_id, ref_type, ref_id, data, updated_by) values (b, t, rid, d, auth.uid())
  on conflict (ref_type, ref_id) do update set data = app.doc_info.data || excluded.data, updated_by = auth.uid(), updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('get_doc_info','save_doc_info','save_product','import_products') loop
    execute format('revoke all on function %s from public', f.sig);
    begin execute format('revoke all on function %s from anon', f.sig); exception when others then null; end;
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- ===== db/11_weight.sql =====
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
