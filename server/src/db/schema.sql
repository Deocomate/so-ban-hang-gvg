-- =====================================================================
--  GỐM SỨ – PHẦN MỀM QUẢN LÝ BÁN HÀNG · CẤU TRÚC DỮ LIỆU (SQLite)
--  Ứng dụng chỉ đọc/ghi qua API (server/src/domain): kiểm tra quyền, chống ghi trùng,
--  mọi thao tác ghi chạy trong 1 giao dịch.
--  Quy ước: id = UUID (TEXT), ngày = 'YYYY-MM-DD', thời điểm = ISO-8601 UTC,
--  đúng/sai = 0/1, mảng / JSON = TEXT chứa JSON, tiền & số lượng = REAL.
-- =====================================================================

create table if not exists users (
  id text primary key,
  email text not null unique collate nocase,
  name text,
  password_hash text not null,
  token_version integer not null default 0,
  created_at text not null,
  phone text,
  -- invited: đã mời, chưa đặt mật khẩu · active: đang dùng · disabled: bị khóa
  status text not null default 'active' check (status in ('invited','active','disabled')),
  is_admin integer not null default 0,           -- Tổng quản trị
  email_verified_at text,
  must_change_password integer not null default 0,
  last_login_at text,
  updated_at text
);

-- Vai trò mẫu: bộ quyền đặt tên sẵn, Tổng quản trị gán cho nhân viên ở từng sổ
create table if not exists roles (
  id text primary key,
  name text not null unique collate nocase,
  description text,
  perms text not null default '{}',
  created_at text not null
);

-- Link trong email (mời, xác thực email, quên mật khẩu, đổi email): chỉ lưu bản băm SHA-256 của mã, dùng 1 lần
create table if not exists auth_tokens (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  kind text not null check (kind in ('invite','verify_email','reset_password','change_email')),
  token_hash text not null unique,
  new_email text,
  expires_at text not null,
  used_at text,
  created_at text not null
);
create index if not exists auth_tokens_user_idx on auth_tokens (user_id, kind);

-- Thư chờ gửi: ghi trong cùng giao dịch với thao tác, gửi ngay sau đó; gửi xong thì xóa nội dung
create table if not exists mail_outbox (
  id integer primary key autoincrement,
  to_email text not null,
  subject text not null,
  body text,
  html text,
  status text not null default 'cho' check (status in ('cho','da_gui','loi')),
  tries integer not null default 0,
  error text,
  created_at text not null,
  sent_at text
);

-- Nhật ký bảo mật: đăng nhập, mật khẩu, email, cấp quyền — chỉ Tổng quản trị xem
create table if not exists security_log (
  id integer primary key autoincrement,
  at text not null,
  user_id text,
  actor_id text,
  event text not null,
  ip text,
  detail text not null default '{}'
);
create index if not exists security_log_at_idx on security_log (at desc);

-- ---------- SỔ (mỗi thương hiệu một sổ riêng) ----------
create table if not exists books (
  id text primary key,
  name text not null,
  short_name text not null,
  is_demo integer not null default 0,
  settings text not null default '{}',
  created_at text not null
);

create table if not exists book_members (
  book_id text not null references books(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  role_id text references roles(id) on delete set null,
  perms text not null default '{}',
  display_name text,
  notify text not null default '{}',
  created_at text not null,
  primary key (book_id, user_id)
);

create table if not exists doc_counters (
  book_id text not null references books(id) on delete cascade,
  kind text not null,
  last_no integer not null default 0,
  primary key (book_id, kind)
);

create table if not exists request_log (
  request_id text primary key,
  book_id text,
  fn text not null,
  result text,
  user_id text,
  created_at text not null
);

-- ---------- DANH MỤC ----------
create table if not exists products (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  sku text not null,
  name text not null,
  category text, brand text, pattern text, size text, color text,
  unit text not null default 'Cái',
  image_url text,
  price1 real not null default 0,
  price2 real not null default 0,
  price3 real not null default 0,
  price4 real not null default 0,
  price5 real not null default 0,
  low_stock real not null default 0,
  is_kit integer not null default 0,
  active integer not null default 1,
  note text,
  on_hand real not null default 0,       -- tồn thực tế (sổ kho tự cập nhật)
  stock_value real not null default 0,   -- giá trị tồn theo giá vốn
  last_cost real not null default 0,     -- giá vốn bình quân gần nhất
  pack_unit text not null default 'hộp',
  units_per_pack real check (units_per_pack is null or units_per_pack > 0),
  pack_weight real check (pack_weight is null or pack_weight >= 0),   -- kg mỗi thùng/hộp
  unit_weight real check (unit_weight is null or unit_weight >= 0),   -- kg mỗi đơn vị (viên, cái…)
  material text,
  norm_m2 real check (norm_m2 is null or norm_m2 >= 0),               -- định mức theo m²
  norm_m real check (norm_m is null or norm_m >= 0),                  -- định mức theo mét dài
  product_type text not null default 'hang',  -- hang | dich_vu (không quản lý kho) | combo (= is_kit) | san_xuat (có định mức thành phần)
  description text,
  order_note text,                             -- mẫu ghi chú tự điền vào dòng hóa đơn / đặt hàng
  max_stock real check (max_stock is null or max_stock >= 0),
  location text,
  width real check (width is null or width >= 0),
  length real check (length is null or length >= 0),
  dim_unit text not null default 'cm',
  sell_direct integer not null default 1,      -- 0: không hiện ở ô tìm hàng khi bán
  images text not null default '[]',           -- tối đa 5 ảnh, ảnh đầu = image_url
  created_at text not null,
  updated_at text not null
);
create unique index if not exists products_sku_uq on products (book_id, lower(sku));

create table if not exists kit_items (
  kit_id text not null references products(id) on delete cascade,
  component_id text not null references products(id),
  qty real not null check (qty > 0),
  primary key (kit_id, component_id)
);

-- Đơn vị quy đổi: 1 đơn vị = conv đơn vị cơ bản. prices = [giá mức 1..4], ô trống = giá cơ bản × conv
create table if not exists product_units (
  id text primary key,
  book_id text not null,
  product_id text not null references products(id) on delete cascade,
  name text not null,
  conv real not null check (conv > 0),
  prices text not null default '[]',
  sell_direct integer not null default 1,
  sort integer not null default 0
);
create index if not exists product_units_prod_idx on product_units (product_id);

-- Bảng giá có tên (ngoài các mức giá chung theo khách)
create table if not exists price_books (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  name text not null,
  valid_from text,
  valid_to text,
  active integer not null default 1,
  formula text not null default '{}',          -- {base: cost|last_in|tier1..5|book:<id>, op: + | -, value, pct}
  allow_others integer not null default 1,     -- cho thêm hàng không có trong bảng (lấy giá chung)
  warn_others integer not null default 0,
  cust_groups text,                            -- null = tất cả nhóm khách; ngược lại mảng tên nhóm
  user_ids text,                               -- null = mọi người tạo giao dịch; ngược lại mảng mã người dùng
  created_at text not null,
  updated_at text not null
);
create unique index if not exists price_books_name_uq on price_books (book_id, lower(name));

create table if not exists price_book_items (
  price_book_id text not null references price_books(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  price real not null check (price >= 0),
  primary key (price_book_id, product_id)
);

create table if not exists customers (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  name text not null,
  phone text, address text, contact text, kind text,
  price_tier integer not null default 1 check (price_tier between 1 and 5),
  credit_days integer not null default 0,
  credit_limit real not null default 0,
  note text,
  active integer not null default 1,
  created_at text not null,
  extra text not null default '{}',      -- email, facebook, thông tin xuất hóa đơn, địa chỉ giao hàng…
  stage text not null default 'moi'      -- moi / tu_van (nhân viên cập nhật cho phễu bán hàng)
);
create unique index if not exists customers_code_uq on customers (book_id, lower(code));

create table if not exists suppliers (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  name text not null,
  phone text, address text, contact text,
  credit_days integer not null default 0,
  note text,
  active integer not null default 1,
  created_at text not null
);
create unique index if not exists suppliers_code_uq on suppliers (book_id, lower(code));

create table if not exists funds (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  name text not null,
  opening_balance real not null default 0,
  sort integer not null default 0,
  active integer not null default 1
);

create table if not exists opening_debts (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  party_type text not null check (party_type in ('kh','ncc')),
  party_id text not null,
  amount real not null,          -- + còn nợ ; − đã trả trước
  debt_date text not null,
  due_date text,
  note text,
  created_by text, created_at text not null
);

-- ---------- BÁN HÀNG ----------
create table if not exists sales_orders (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  kind text not null default 'ban_san' check (kind in ('ban_san','dat_hang')),
  status text not null default 'nhap' check (status in ('nhap','xac_nhan','huy')),
  customer_id text references customers(id),
  channel text,
  order_date text not null,
  due_date text,
  staff text,
  discount real not null default 0,
  shipping_fee real not null default 0,
  note text,
  cancel_reason text,
  created_by text, created_at text not null,
  confirmed_at text, cancelled_at text,
  vat_rate real not null default 0 check (vat_rate >= 0 and vat_rate <= 100),
  price_book_id text
);
create unique index if not exists sales_orders_code_uq on sales_orders (book_id, code);

create table if not exists sales_order_lines (
  id text primary key,
  order_id text not null references sales_orders(id) on delete cascade,
  book_id text not null,
  line_no integer not null,
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  unit_price real not null check (unit_price >= 0),
  discount_pct real not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  cancelled_qty real not null default 0,
  delivered_qty real not null default 0,
  returned_qty real not null default 0,
  po_line_id text,
  note text,
  unit_name text,                              -- đơn vị đã chọn khi bán; qty và unit_price luôn theo đơn vị cơ bản
  unit_conv real not null default 1
);
create index if not exists sol_order_idx on sales_order_lines (order_id);

create table if not exists deliveries (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  order_id text not null references sales_orders(id),
  delivery_date text not null,
  shipping_fee real not null default 0,
  note text,
  created_by text, created_at text not null,
  deposit_used real not null default 0 check (deposit_used >= 0)   -- tiền cọc khấu trừ vào hóa đơn của đợt này
);
create index if not exists deliveries_order_idx on deliveries (order_id);

create table if not exists delivery_lines (
  id text primary key,
  delivery_id text not null references deliveries(id) on delete cascade,
  book_id text not null,
  order_line_id text not null references sales_order_lines(id),
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  unit_price_net real not null,
  revenue real not null,
  cogs real not null,
  returned_qty real not null default 0
);
create index if not exists dl_delivery_idx on delivery_lines (delivery_id);

create table if not exists sales_returns (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  order_id text not null references sales_orders(id),
  return_date text not null,
  reason text, note text,
  created_by text, created_at text not null,
  fee real not null default 0 check (fee >= 0)   -- phí trả hàng cửa hàng giữ lại: đã trừ sẵn vào revenue của các dòng trả
);

create table if not exists sales_return_lines (
  id text primary key,
  return_id text not null references sales_returns(id) on delete cascade,
  book_id text not null,
  delivery_line_id text not null references delivery_lines(id),
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  revenue real not null,
  cogs real not null,
  restock integer not null default 1,
  fee real not null default 0 check (fee >= 0)   -- phần phí trả hàng của dòng (revenue đã trừ phần này)
);

-- ---------- MUA HÀNG / ĐẶT XƯỞNG ----------
create table if not exists purchase_orders (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  kind text not null default 'mua_san' check (kind in ('mua_san','dat_sx')),
  mode text not null default 'dat' check (mode in ('dat','nhap')),
  status text not null default 'nhap' check (status in ('nhap','xac_nhan','huy')),
  supplier_id text references suppliers(id),
  order_date text not null,
  expected_date text,
  prod_step text,
  prod_step_at text,
  sales_order_id text references sales_orders(id),
  discount real not null default 0 check (discount >= 0),
  invoice_no text,
  note text,
  cancel_reason text,
  created_by text, created_at text not null,
  confirmed_at text, cancelled_at text
);
create unique index if not exists purchase_orders_code_uq on purchase_orders (book_id, code);

create table if not exists purchase_order_lines (
  id text primary key,
  po_id text not null references purchase_orders(id) on delete cascade,
  book_id text not null,
  line_no integer not null,
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  unit_cost real not null check (unit_cost >= 0),
  cancelled_qty real not null default 0,
  received_qty real not null default 0,
  returned_qty real not null default 0,
  sales_order_line_id text,
  note text,
  unit_name text,
  unit_conv real not null default 1,
  unit_price real,
  discount real not null default 0
);
create index if not exists pol_po_idx on purchase_order_lines (po_id);

create table if not exists goods_receipts (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  po_id text not null references purchase_orders(id),
  receipt_date text not null,
  note text,
  created_by text, created_at text not null,
  cancelled_at text, cancel_reason text
);

create table if not exists goods_receipt_lines (
  id text primary key,
  receipt_id text not null references goods_receipts(id) on delete cascade,
  book_id text not null,
  po_line_id text not null references purchase_order_lines(id),
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  unit_cost real not null,
  value real not null,
  returned_qty real not null default 0
);

-- Trả hàng nhập: theo phiếu nhập (po_id, receipt_line_id) hoặc lập riêng theo nhà cung cấp (để trống hai cột này)
create table if not exists supplier_returns (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  po_id text references purchase_orders(id),
  supplier_id text not null references suppliers(id),
  return_date text not null,
  reason text, note text,
  discount real not null default 0,
  refund_payment_id text,
  created_by text, created_at text not null,
  cancelled_at text, cancel_reason text
);

-- value: số NCC phải trả lại (giá trả lại sau giảm giá); cost_value: giá trị kho xuất ra
create table if not exists supplier_return_lines (
  id text primary key,
  return_id text not null references supplier_returns(id) on delete cascade,
  book_id text not null,
  receipt_line_id text references goods_receipt_lines(id),
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  unit_cost real not null,
  unit_price real not null,
  value real not null,
  cost_value real not null
);

-- ---------- KHO ----------
create table if not exists stock_adjustments (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  adj_date text not null,
  reason text not null check (reason in ('dau_ky','vo','loi','that_thoat','kiem_ke','hang_tra_loi','noi_bo','khac')),
  note text,
  created_by text, created_at text not null,
  purpose text                            -- mục đích xuất dùng nội bộ (văn phòng phẩm, quà tặng…)
);

create table if not exists stock_adjustment_lines (
  id text primary key,
  adjustment_id text not null references stock_adjustments(id) on delete cascade,
  book_id text not null,
  product_id text not null references products(id),
  qty_delta real not null check (qty_delta <> 0),
  unit_cost real not null,
  value real not null
);

-- Phiếu sản xuất: xuất các nguyên liệu / thành phần, nhập thành phẩm với giá vốn bằng tổng giá trị đã xuất
create table if not exists productions (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  prod_date text not null,
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  value real not null default 0,
  note text,
  created_by text, created_at text not null
);
create index if not exists productions_book_date_idx on productions (book_id, prod_date);

create table if not exists production_lines (
  id text primary key,
  production_id text not null references productions(id) on delete cascade,
  book_id text not null,
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  value real not null default 0
);

-- Định mức sản xuất: số lượng mỗi thành phần cho 1 đơn vị thành phẩm
create table if not exists bom_items (
  book_id text not null,
  product_id text not null references products(id) on delete cascade,
  component_id text not null references products(id),
  qty real not null check (qty > 0),
  primary key (product_id, component_id)
);

-- Sổ kho: mỗi biến động truy ngược về chứng từ gốc. Chỉ hệ thống ghi.
create table if not exists stock_moves (
  id integer primary key autoincrement,
  book_id text not null,
  product_id text not null references products(id),
  move_date text not null,
  qty real not null,
  value real not null,
  unit_cost real not null,
  doc_type text not null,       -- dau_ky, nhap, tra_ncc, giao, tra_hang, dieu_chinh, san_xuat, chenh_lech
  doc_id text not null,
  doc_code text,
  line_id text,
  balance_qty real not null,
  balance_value real not null,
  note text,
  created_by text,
  created_at text not null
);
create index if not exists stock_moves_prod_idx on stock_moves (product_id, id);
create index if not exists stock_moves_book_date_idx on stock_moves (book_id, move_date);
create index if not exists stock_moves_line_idx on stock_moves (line_id);

-- ---------- TIỀN ----------
create table if not exists payments (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  pay_date text not null,
  kind text not null check (kind in ('thu_khach','hoan_khach','tra_ncc','ncc_hoan','chi_phi','thu_khac','chi_khac','gop_von','rut_von','chuyen_quy')),
  direction text not null check (direction in ('thu','chi','chuyen')),
  fund_id text not null references funds(id),
  to_fund_id text references funds(id),
  party_type text check (party_type in ('kh','ncc')),
  party_id text,
  amount real not null check (amount > 0),
  fee real not null default 0 check (fee >= 0),
  method text,
  note text,
  voided integer not null default 0,
  void_reason text,
  voided_at text,
  created_by text, created_at text not null,
  ref_no text                    -- mã giao dịch ngân hàng / ví (nếu có)
);
create index if not exists payments_book_date_idx on payments (book_id, pay_date);

create table if not exists payment_allocations (
  id text primary key,
  payment_id text not null references payments(id) on delete cascade,
  book_id text not null,
  doc_type text not null check (doc_type in ('don_ban','don_mua','chi_phi','no_dau_ky')),
  doc_id text not null,
  amount real not null check (amount > 0)
);
create index if not exists payment_alloc_doc_idx on payment_allocations (doc_id);
create index if not exists payment_alloc_pay_idx on payment_allocations (payment_id);

create table if not exists expenses (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  exp_date text not null,
  category text not null,
  expense_group text,
  alloc_months integer not null default 1 check (alloc_months between 1 and 60),
  description text,
  amount real not null check (amount > 0),
  supplier_id text references suppliers(id),
  settled_payment_id text references payments(id),
  invoice_no text,                        -- số hóa đơn đầu vào (mua dịch vụ)
  voided integer not null default 0,
  void_reason text,
  note text,
  created_by text, created_at text not null
);

-- ---------- VẬN ĐƠN ----------
create table if not exists shipments (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  order_id text not null references sales_orders(id),
  delivery_id text references deliveries(id),
  carrier text not null default 'SPX' check (carrier in ('SPX','BEST','KHAC')),
  tracking_no text not null,
  status text not null default 'cho_lay_hang' check (status in ('cho_lay_hang','da_lay_hang','dang_trung_chuyen','dang_giao',
    'giao_thanh_cong','giao_that_bai','dang_hoan','da_hoan','da_huy','su_co')),
  status_at text not null,
  status_detail text,
  cod_amount real not null default 0 check (cod_amount >= 0),
  ship_fee real not null default 0 check (ship_fee >= 0),
  cod_status text not null default 'khong_cod' check (cod_status in ('khong_cod','chua_thu','spx_dang_giu','da_ve_tk','khong_thu_duoc')),
  cod_payment_ids text not null default '[]',
  cod_settled_at text,
  receiver_name text, receiver_phone text, receiver_address text,
  note text,
  tracking_registered_at text,
  last_sync_at text,
  created_by text, created_at text not null, updated_at text
);
create unique index if not exists shipments_tracking_uq on shipments (book_id, carrier, upper(tracking_no));
create index if not exists shipments_order_idx on shipments (order_id);
create index if not exists shipments_tracking_idx on shipments (upper(tracking_no));

create table if not exists shipment_events (
  id integer primary key autoincrement,
  shipment_id text not null references shipments(id) on delete cascade,
  book_id text not null,
  ev_at text not null,
  status text,
  detail text,
  location text,
  source text not null default 'tay' check (source in ('tay','tu_dong','he_thong')),
  ev_key text not null,
  created_by text, created_at text not null,
  unique (shipment_id, ev_key)
);

-- ---------- GIAO DỊCH NGÂN HÀNG (SePay / Casso) ----------
create table if not exists bank_txns (
  id text primary key,
  provider text not null,
  ext_id text not null,
  account_no text,
  amount real not null,
  direction text not null check (direction in ('in','out')),
  content text,
  txn_at text not null,
  ref text,
  counter_name text,
  book_id text references books(id) on delete cascade,
  candidate_books text not null default '[]',
  status text not null default 'cho_xu_ly' check (status in ('cho_xu_ly','da_ghi','bo_qua')),
  match_note text,
  order_id text references sales_orders(id),
  payment_ids text not null default '[]',
  handled_by text, handled_at text,
  raw text,
  received_at text not null,
  unique (provider, ext_id)
);
create index if not exists bank_txns_book_idx on bank_txns (book_id, txn_at desc);

-- ---------- THÔNG BÁO ----------
create table if not exists notifications (
  id integer primary key autoincrement,
  book_id text not null references books(id) on delete cascade,
  kind text not null check (kind in ('don_hang','van_chuyen','tien_ve','cong_no','bao_cao')),
  level text not null default 'info' check (level in ('info','good','warn','bad')),
  title text not null,
  body text,
  link text,
  dedupe_key text unique,
  created_at text not null,
  push_sent_at text
);
create index if not exists notifications_book_idx on notifications (book_id, id desc);

create table if not exists notification_reads (
  user_id text not null,
  book_id text not null references books(id) on delete cascade,
  last_read_id integer not null default 0,
  primary key (user_id, book_id)
);

create table if not exists push_subs (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at text not null,
  last_ok_at text,
  fail_count integer not null default 0
);

create table if not exists carrier_webhook_log (
  id integer primary key autoincrement,
  carrier text not null,
  received_at text not null,
  tracking_no text,
  raw_status text,
  mapped_status text,
  result text not null check (result in ('da_cap_nhat','khong_doi','khong_co_van_don','chua_doc_duoc','loi')),
  note text,
  payload text
);
create index if not exists carrier_webhook_log_idx on carrier_webhook_log (received_at desc);

-- ---------- THÔNG TIN RIÊNG CỦA CHỨNG TỪ IN ----------
create table if not exists doc_info (
  book_id text not null references books(id) on delete cascade,
  ref_type text not null check (ref_type in ('order','delivery','payment','contract','quote')),
  ref_id text not null,
  data text not null default '{}',
  updated_by text, updated_at text not null,
  primary key (ref_type, ref_id)
);

-- ---------- LÁI XE & CÔNG NỢ LÁI XE ----------
create table if not exists drivers (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  name text not null,
  phone text, plate text, id_no text, note text,
  active integer not null default 1,
  created_at text not null
);
create unique index if not exists drivers_code_uq on drivers (book_id, lower(code));

-- Một chuyến vận chuyển. Khoản phải trả lái xe là 1 chi phí (expense_id), tiền trả đi qua phiếu chi như mọi chi phí khác.
create table if not exists driver_trips (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  order_id text references sales_orders(id),
  delivery_id text references deliveries(id),
  driver_id text not null references drivers(id),
  trip_date text not null,
  amount real not null check (amount >= 0),
  payer text not null default 'khach' check (payer in ('khach','cua_hang')),
  collect text not null default 'hoa_don' check (collect in ('hoa_don','truc_tiep')),
  expense_id text references expenses(id),
  note text,
  created_by text, created_at text not null
);
create index if not exists driver_trips_order_idx on driver_trips (order_id);

-- ---------- BÁO GIÁ (độc lập, không ảnh hưởng tồn kho hay công nợ) ----------
create table if not exists quotes (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  quote_date text not null,
  status text not null default 'nhap' check (status in ('nhap','da_gui','chot','huy')),
  template text not null default 'ngoi' check (template in ('ngoi','mosaic')),
  customer_id text references customers(id),
  customer_name text not null,
  address text, site text,
  profile_id text,
  body text not null default '{}',       -- nhóm hàng, dòng hàng, lưu ý, VAT, vận chuyển
  total real not null default 0,
  order_id text references sales_orders(id),
  created_by text, created_at text not null, updated_at text
);
create unique index if not exists quotes_code_uq on quotes (book_id, code);

-- ---------- HỢP ĐỒNG: lớp giấy tờ gắn 1-1 với đơn đặt hàng, dùng chung đợt giao, cọc, tồn kho của đơn ----------
create table if not exists contracts (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  order_id text not null unique references sales_orders(id),
  sign_date text not null,
  profile_id text,
  rep_name text, rep_title text, tax_code text,
  transport_included integer not null default 0,
  ship_unit text, ship_fee_note text, ship_payer text, ship_plan text,
  advance_amount real not null default 0 check (advance_amount >= 0),
  advance_note text,
  advance_date text,
  reconciled_at text,
  terms text, note text,
  created_by text, created_at text not null, updated_at text
);
create unique index if not exists contracts_code_uq on contracts (book_id, code);

-- Tệp đính kèm (bản scan hợp đồng, hóa đơn đầu vào…): lưu trong CSDL nên đi cùng bản sao lưu hằng đêm
create table if not exists attachments (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  ref_type text not null check (ref_type in ('contract','order','quote','tax_invoice')),
  ref_id text not null,
  name text not null,
  mime text,
  size integer not null,
  data blob not null,
  created_by text, created_at text not null
);
create index if not exists attachments_ref_idx on attachments (ref_type, ref_id);

-- ---------- HÓA ĐƠN ĐẦU VÀO / ĐẦU RA (kho chứng từ dùng chung Mua hàng và Thuế) ----------
create table if not exists tax_invoices (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  direction text not null check (direction in ('vao','ra')),
  inv_no text not null,
  inv_date text not null,
  party_name text, party_tax text,
  profile_id text,
  amount real not null check (amount >= 0),          -- tiền trước thuế
  vat_rate real not null default 0,
  vat_amount real not null default 0,
  supplier_id text references suppliers(id),
  order_id text references sales_orders(id),
  category text, note text,
  voided integer not null default 0,
  created_by text, created_at text not null
);
create index if not exists tax_invoices_book_idx on tax_invoices (book_id, direction, inv_date);

-- ---------- NHÂN VIÊN, CHẤM CÔNG, LƯƠNG ----------
-- pay: cách tính lương {type: ca | gio | ngay_cong | co_dinh, rate, std_days, ot_rate, allowances[], deductions[], bonus[], commission_id}
create table if not exists employees (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  name text not null,
  phone text, id_no text, title text, dept text, address text,
  start_date text,
  user_id text references users(id),        -- tài khoản đăng nhập (nếu có)
  pay text not null default '{}',
  active integer not null default 1,
  note text,
  created_at text not null
);
create unique index if not exists employees_code_uq on employees (book_id, lower(code));

create table if not exists shifts (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  name text not null,
  start_time text not null,                  -- 'HH:MM'
  end_time text not null,
  hours real not null check (hours > 0),
  active integer not null default 1
);

-- Lịch làm việc lặp lại theo thứ trong tuần (0 = Chủ nhật … 6 = Thứ bảy)
create table if not exists work_schedules (
  book_id text not null,
  employee_id text not null references employees(id) on delete cascade,
  shift_id text not null references shifts(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  primary key (employee_id, shift_id, weekday)
);

create table if not exists timesheets (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  employee_id text not null references employees(id) on delete cascade,
  work_date text not null,
  shift_id text references shifts(id),
  status text not null check (status in ('di_lam','nghi_phep','nghi_khong_phep')),
  check_in text, check_out text,             -- 'HH:MM'
  hours real not null default 0,
  late_minutes integer not null default 0,
  early_minutes integer not null default 0,
  ot_hours real not null default 0,
  note text,
  created_by text, created_at text not null
);
create unique index if not exists timesheets_uq on timesheets (employee_id, work_date, coalesce(shift_id, ''));
create index if not exists timesheets_book_date_idx on timesheets (book_id, work_date);

-- Bảng hoa hồng: rules [{scope: all | category | product, target, basis: doanh_thu | lai_gop | so_luong, value}]
create table if not exists commission_tables (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  name text not null,
  rules text not null default '[]',
  active integer not null default 1,
  created_at text not null
);

create table if not exists paysheets (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  name text not null,
  period_from text not null,
  period_to text not null,
  status text not null default 'tam' check (status in ('tam','chot','huy')),
  note text,
  created_by text, created_at text not null, closed_at text
);

create table if not exists paysheet_lines (
  id text primary key,
  paysheet_id text not null references paysheets(id) on delete cascade,
  book_id text not null,
  employee_id text not null references employees(id),
  base real not null default 0,
  ot real not null default 0,
  bonus real not null default 0,
  commission real not null default 0,
  allowance real not null default 0,
  deduction real not null default 0,
  adjust real not null default 0,            -- cộng/trừ tay khi duyệt bảng lương
  total real not null default 0,
  breakdown text not null default '{}',
  expense_id text references expenses(id)    -- khoản chi phí "Lương" tạo khi chốt; trả lương = trả khoản này
);

-- ---------- NHẬT KÝ CHỈNH SỬA ----------
create table if not exists audit_log (
  id integer primary key autoincrement,
  book_id text,
  user_id text,
  at text not null,
  table_name text not null,
  op text not null,
  row_id text,
  old_data text,
  new_data text
);
create index if not exists audit_book_at_idx on audit_log (book_id, at desc);

-- Lịch sử một đơn bán, viết bằng lời: tạo, sửa (cái gì đổi thành gì), giao, hủy đợt giao, thu / hoàn tiền, trả hàng, hủy
create table if not exists order_events (
  id integer primary key autoincrement,
  book_id text not null,
  order_id text not null,
  at text not null,
  user_id text,
  action text not null,
  summary text not null,
  detail text                                 -- các dòng chi tiết, mỗi thay đổi một dòng (JSON mảng chuỗi)
);
create index if not exists order_events_order_idx on order_events (order_id, at);

-- ---------- THIẾT LẬP KIỂU KIOTVIET ----------
-- Bảo hành, sửa chữa: phiếu tiếp nhận hàng khách mang tới bảo hành / sửa
create table if not exists warranty_claims (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  customer_id text references customers(id),
  product_id text references products(id),
  delivery_line_id text,
  issue text not null,
  received_date text not null,
  promise_date text,
  status text not null default 'tiep_nhan' check (status in ('tiep_nhan','dang_sua','da_sua','da_tra','huy')),
  in_warranty integer not null default 0,
  fee real not null default 0 check (fee >= 0),
  note text,
  created_by text, created_at text not null, done_at text
);
create index if not exists warranty_claims_book_idx on warranty_claims (book_id, status);

-- Kết ca: thu ngân mở ca với tiền đầu ca, cuối ca đếm tiền và nộp báo cáo bàn giao
create table if not exists cash_shifts (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  user_id text not null,
  fund_id text not null references funds(id),
  opened_at text not null,
  opening_cash real not null default 0,
  closed_at text,
  cash_in real, cash_out real, expected_cash real, counted_cash real, diff real,
  note text
);
create index if not exists cash_shifts_book_idx on cash_shifts (book_id, opened_at);

-- Tích điểm: mỗi dòng là một lần cộng / trừ điểm của khách
create table if not exists point_moves (
  id integer primary key autoincrement,
  book_id text not null references books(id) on delete cascade,
  customer_id text not null references customers(id),
  move_date text not null,
  points real not null,
  kind text not null check (kind in ('tich','doi','tra_hang','huy','dieu_chinh')),
  doc_type text, doc_id text, doc_code text, note text,
  created_by text, created_at text not null
);
create index if not exists point_moves_cust_idx on point_moves (customer_id);
create index if not exists point_moves_doc_idx on point_moves (doc_id);

-- Chương trình khuyến mại: giảm theo tổng đơn hoặc theo hàng hóa / nhóm hàng
create table if not exists promotions (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('order','product')),
  min_amount real not null default 0,
  discount_pct real not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  discount_amount real not null default 0 check (discount_amount >= 0),
  max_discount real,
  product_ids text not null default '[]',
  categories text not null default '[]',
  start_date text not null, end_date text not null,
  active integer not null default 1,
  note text,
  created_at text not null
);

-- Voucher (phiếu mua hàng): mỗi mã một mệnh giá, dùng một lần
create table if not exists vouchers (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  batch text,
  value real not null check (value > 0),
  min_amount real not null default 0,
  customer_id text references customers(id),
  issue_date text not null,
  expiry_date text,
  status text not null default 'moi' check (status in ('moi','da_dung','huy')),
  used_order_id text, used_at text,
  note text,
  created_at text not null
);
create unique index if not exists vouchers_code_uq on vouchers (book_id, upper(code));

-- Coupon (mã giảm giá): một mã dùng nhiều lần đến giới hạn
create table if not exists coupons (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  name text,
  discount_pct real not null default 0 check (discount_pct >= 0 and discount_pct <= 100),
  discount_amount real not null default 0 check (discount_amount >= 0),
  max_discount real,
  min_amount real not null default 0,
  usage_limit integer,
  start_date text not null, end_date text not null,
  active integer not null default 1,
  created_at text not null
);
create unique index if not exists coupons_code_uq on coupons (book_id, upper(code));

-- Giảm giá đã áp dụng trên đơn (khuyến mại, voucher, coupon, đổi điểm); tổng nằm trong sales_orders.discount
create table if not exists order_promos (
  id integer primary key autoincrement,
  order_id text not null references sales_orders(id) on delete cascade,
  book_id text not null,
  kind text not null check (kind in ('promo','voucher','coupon','points')),
  ref_id text, code text, label text,
  points real,
  amount real not null check (amount >= 0)
);
create index if not exists order_promos_order_idx on order_promos (order_id);

-- Thiết bị đã xác thực 2 lớp (nhớ 30 ngày)
create table if not exists user_devices (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  label text,
  created_at text not null,
  expires_at text not null
);

-- Xóa dữ liệu cũ của sổ: lịch xóa và kết quả
create table if not exists purge_jobs (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  cutoff text not null,
  run_at text not null,
  status text not null default 'cho' check (status in ('cho','xong','loi','huy')),
  result text,
  created_by text, created_at text not null, done_at text
);
