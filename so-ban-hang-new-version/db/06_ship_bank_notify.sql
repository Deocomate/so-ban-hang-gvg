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
