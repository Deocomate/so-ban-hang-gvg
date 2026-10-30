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
