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
  created_at text not null
);

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
  category text, pattern text, size text, color text,
  unit text not null default 'Cái',
  image_url text,
  price1 real not null default 0,
  price2 real not null default 0,
  price3 real not null default 0,
  low_stock real not null default 0,
  is_kit integer not null default 0,
  active integer not null default 1,
  note text,
  on_hand real not null default 0,       -- tồn thực tế (sổ kho tự cập nhật)
  stock_value real not null default 0,   -- giá trị tồn theo giá vốn
  last_cost real not null default 0,     -- giá vốn bình quân gần nhất
  pack_unit text not null default 'hộp',
  units_per_pack real check (units_per_pack is null or units_per_pack > 0),
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

create table if not exists customers (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  name text not null,
  phone text, address text, contact text, kind text,
  price_tier integer not null default 1 check (price_tier between 1 and 3),
  credit_days integer not null default 0,
  credit_limit real not null default 0,
  note text,
  active integer not null default 1,
  created_at text not null
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
  confirmed_at text, cancelled_at text
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
  note text
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
  created_by text, created_at text not null
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
  created_by text, created_at text not null
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
  restock integer not null default 1
);

-- ---------- MUA HÀNG / ĐẶT XƯỞNG ----------
create table if not exists purchase_orders (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  kind text not null default 'mua_san' check (kind in ('mua_san','dat_sx')),
  status text not null default 'nhap' check (status in ('nhap','xac_nhan','huy')),
  supplier_id text references suppliers(id),
  order_date text not null,
  expected_date text,
  prod_step text,
  prod_step_at text,
  sales_order_id text references sales_orders(id),
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
  note text
);
create index if not exists pol_po_idx on purchase_order_lines (po_id);

create table if not exists goods_receipts (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  po_id text not null references purchase_orders(id),
  receipt_date text not null,
  note text,
  created_by text, created_at text not null
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

create table if not exists supplier_returns (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  po_id text not null references purchase_orders(id),
  return_date text not null,
  reason text, note text,
  created_by text, created_at text not null
);

create table if not exists supplier_return_lines (
  id text primary key,
  return_id text not null references supplier_returns(id) on delete cascade,
  book_id text not null,
  receipt_line_id text not null references goods_receipt_lines(id),
  product_id text not null references products(id),
  qty real not null check (qty > 0),
  unit_cost real not null,
  value real not null
);

-- ---------- KHO ----------
create table if not exists stock_adjustments (
  id text primary key,
  book_id text not null references books(id) on delete cascade,
  code text not null,
  adj_date text not null,
  reason text not null check (reason in ('dau_ky','vo','loi','that_thoat','kiem_ke','hang_tra_loi','khac')),
  note text,
  created_by text, created_at text not null
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

-- Sổ kho: mỗi biến động truy ngược về chứng từ gốc. Chỉ hệ thống ghi.
create table if not exists stock_moves (
  id integer primary key autoincrement,
  book_id text not null,
  product_id text not null references products(id),
  move_date text not null,
  qty real not null,
  value real not null,
  unit_cost real not null,
  doc_type text not null,       -- dau_ky, nhap, tra_ncc, giao, tra_hang, dieu_chinh, chenh_lech
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
  created_by text, created_at text not null
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
  ref_type text not null check (ref_type in ('order','delivery','payment')),
  ref_id text not null,
  data text not null default '{}',
  updated_by text, updated_at text not null,
  primary key (ref_type, ref_id)
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
