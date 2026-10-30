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
