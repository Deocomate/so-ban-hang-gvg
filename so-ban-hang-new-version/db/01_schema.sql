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
