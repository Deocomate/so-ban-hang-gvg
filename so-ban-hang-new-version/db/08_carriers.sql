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
