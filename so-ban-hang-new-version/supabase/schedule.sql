-- Lịch chạy tự động trên Supabase (chạy 1 lần trong SQL Editor, SAU khi đã chạy migration.sql và đưa 3 hàm Edge Functions lên).
-- Cần bật 2 tiện ích: Database → Extensions → pg_cron và pg_net.
-- Thay 2 chỗ <...> bên dưới: mã dự án (vd. abcdxyz) và CRON_SECRET (chuỗi bí mật anh tự đặt, giống trong Edge Function secrets).

-- Báo cáo cuối ngày lúc 21:00 giờ Việt Nam (= 14:00 UTC)
select cron.schedule('bao-cao-ngay', '0 14 * * *', $$ select public.run_scheduled('{"kind":"daily_report"}'::jsonb) $$);
-- Nhắc công nợ lúc 08:00 giờ Việt Nam (= 01:00 UTC)
select cron.schedule('nhac-cong-no', '0 1 * * *', $$ select public.run_scheduled('{"kind":"debt_reminder"}'::jsonb) $$);
-- Mỗi phút: gửi các thông báo đang chờ lên điện thoại
select cron.schedule('gui-thong-bao', '* * * * *', $$
  select net.http_post(
    url := 'https://<MA-DU-AN>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb)
$$);
-- Xem lịch: select * from cron.job;   Xóa 1 lịch: select cron.unschedule('gui-thong-bao');
