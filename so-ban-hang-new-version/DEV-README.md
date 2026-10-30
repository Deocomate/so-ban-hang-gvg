# Sổ Bán Hàng Gốm — tài liệu cho dev

Phần mềm quản lý bán hàng cho 2 thương hiệu dùng chung một hệ thống: **Gốm sứ Thanh Hải** (sổ TH) và **Gốm Vũ Gia** (sổ VG). Mỗi thương hiệu là một sổ riêng; hàng hóa, khách, quỹ tiền và báo cáo của hai sổ không lẫn vào nhau.

Tài liệu dành cho người dùng cuối là `HUONG-DAN.md` (mục 1–11). Tài liệu này dành cho dev sửa và deploy.

## 1. Kiến trúc

```
Trình duyệt (React + Vite, PWA)
   │  supabase-js: auth (email + mật khẩu) và gọi hàm RPC public.<tên>(p jsonb)
   ▼
Supabase Postgres ── toàn bộ nghiệp vụ nằm trong SQL (plpgsql)
   │  pg_cron + pg_net: báo cáo cuối ngày, nhắc công nợ, gửi thông báo mỗi phút
   ▼
Supabase Edge Functions (Deno)
   ├─ sepay-webhook     nhận tiền về tài khoản từ SePay, tự khớp đơn
   ├─ tracking-webhook  nhận trạng thái vận đơn SPX / BEST
   └─ send-push         gửi Web Push lên điện thoại (WebCrypto thuần, RFC 8291/8292)
```

Một số điểm cần nắm trước khi sửa:

- **Mọi nghiệp vụ nằm trong database.** Frontend không ghi thẳng vào bảng nào. Frontend chỉ gọi `public.<tên_hàm>(p jsonb) returns jsonb`. Các hàm này là `security definer` và tự kiểm tra quyền bằng `app.require(book_id, quyền)`.
- **Bảng nằm ở schema `app`, không mở qua PostgREST.** Đọc dữ liệu qua hàm chung `public.q(p)` với danh sách view được phép (`app.v_*`). Cột giá vốn chỉ trả về khi người dùng có quyền `xem_gia_von`.
- **Quyền theo từng sổ** nằm ở `app.book_members` (role `owner` hoặc `staff`, cùng `perms` jsonb). Các quyền gồm: `ban_hang`, `thu_chi`, `nhap_hang`, `kho`, `danh_muc`, `chi_phi`, `xem_gia_von`, `xem_bao_cao`.
- **Chống ghi trùng khi bấm 2 lần / mạng chập chờn:** các hàm ghi chứng từ nhận `request_id` (uuid) và đi qua `app.req_begin` / `app.req_end`.
- **Tồn kho và giá vốn** tính theo bình quân gia quyền. Sổ cái kho là `app.stock_moves`.
- **Bản chạy thử (demo)** chạy đúng các tệp SQL trên trong trình duyệt bằng PGlite (Postgres biên dịch sang WASM), nạp dữ liệu mẫu từ `web/src/lib/demoSeed.js`. Bản build thật không chứa PGlite.

## 2. Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `db/00_demo_shim.sql` | Giả lập schema `auth`, `auth.uid()` và các role. **Chỉ dùng cho PGlite / kiểm thử, không chạy trên Supabase.** |
| `db/01_schema.sql` … `db/11_weight.sql` | Cơ sở dữ liệu tách theo giai đoạn. 01–05 là lõi: bảng, hàm lõi, view, API, báo cáo. 06–08 là vận chuyển, tiền về, thông báo, BEST. 09 là chi phí theo nhóm và phân bổ. 10 là chứng từ PDF và quy cách đóng gói. 11 là trọng lượng. |
| `supabase/migration.sql` | Gộp 01 → 11 thành một tệp, để cài mới trong một lần chạy. |
| `supabase/schedule.sql` | Lịch pg_cron. |
| `supabase/seed-demo.sql` | **Dữ liệu mẫu** để dev xem giao diện có số liệu (mục 5). |
| `supabase/functions/` | 3 Edge Function và mã dùng chung `_shared/`. |
| `web/` | Frontend React 18 + Vite 5. |
| `web/src/lib/backend.js` | Lớp gọi backend: Supabase (bản thật) hoặc PGlite (bản demo). |
| `web/src/lib/docs/` | Xuất chứng từ PDF bằng pdfmake. `model.js` dựng nội dung, `pdf.js` vẽ PDF. Phông Arimo/Tinos nằm trong `web/src/assets/fonts`. |
| `web/src/pages/` | Các màn hình. Màn hình tạo đơn kiểu quầy là `OrderPos.jsx`. |
| `tests/` | Kiểm thử nghiệp vụ, chạy trên PGlite bằng Node, không cần Supabase. |
| `mau-excel/` | File Excel mẫu để nhập hàng hóa, khách hàng, nhà cung cấp. |
| `ket-qua-kiem-thu.xlsx` | Kết quả kiểm thử gần nhất: 334 phép, 0 lỗi. |

## 3. Chạy ở máy dev

Cần Node 20 trở lên (đã kiểm thử trên Node 22).

```bash
# Kiểm thử nghiệp vụ (PGlite, không cần mạng)
npm install
npm test                      # 4 bộ: business 146, ship_bank 125, expenses 38, documents 25

# Frontend
cd web
npm install
npm run demo                  # bản chạy thử: Postgres trong trình duyệt + dữ liệu mẫu, không cần Supabase
cp .env.example .env          # điền VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (và VITE_VAPID_PUBLIC_KEY nếu dùng thông báo)
npm run dev                   # bản thật, nối Supabase theo .env
npm run build                 # build bản thật → web/dist
npm run build:demo            # build bản demo → web/dist-demo
```

Bản demo lưu dữ liệu trong IndexedDB của trình duyệt. Nút "Làm lại dữ liệu mẫu" trên thanh vàng sẽ xóa và tạo lại. Khi đổi `db/*.sql` hoặc `demoSeed.js`, cần tăng `DEMO_VERSION` trong `web/src/lib/backend.js`, để trình duyệt đã mở bản cũ tự tạo lại dữ liệu.

## 4. Deploy

### 4.1 Database (Supabase)

- **Dự án mới:** chạy toàn bộ `supabase/migration.sql` trong SQL Editor. Tệp này chỉ chạy một lần, vì `01_schema.sql` tạo bảng.
- **Dự án đã cài từ trước:** chỉ chạy các tệp mới theo thứ tự số. Các tệp 07–11 được viết để chạy lại nhiều lần không lỗi (`add column if not exists`, `create or replace`).
  - Không chạy lại 10 sau khi đã chạy 11, vì view `v_products` ở 11 có thêm cột. Nếu lỡ chạy thì chạy lại 11.
- **Thay đổi schema về sau:** thêm tệp `db/12_….sql` theo cùng kiểu, cập nhật mảng `SQL_FILES` trong `tests/harness.mjs`, `load.mjs` và danh sách import trong `web/src/lib/backend.js`, rồi gộp lại `supabase/migration.sql`.
  - Muốn chuyển sang Supabase CLI migrations thì có thể đổi tên các tệp 01–11 thành `supabase/migrations/<timestamp>_<tên>.sql`.
- **`create or replace view` chỉ được thêm cột vào cuối** (giới hạn của Postgres). Nếu cần sửa một hàm đã định nghĩa ở tệp trước, chép nguyên định nghĩa sang tệp mới rồi sửa, như cách tệp 09, 10, 11 đang làm.

### 4.2 Edge Functions

```bash
npx supabase login
npx supabase link --project-ref <ma-du-an>
npx supabase functions deploy sepay-webhook --no-verify-jwt
npx supabase functions deploy send-push --no-verify-jwt
npx supabase functions deploy tracking-webhook --no-verify-jwt
npx supabase secrets set CRON_SECRET=<chuoi-bi-mat> SEPAY_API_KEY=<khoa-sepay> TRACKING_WEBHOOK_SECRET=<chuoi-bi-mat> \
  VAPID_PRIVATE_KEY=<khoa-rieng> VAPID_SUBJECT=mailto:<email>
```

- `--no-verify-jwt` là bắt buộc, vì SePay, đơn vị vận chuyển và pg_cron gọi vào mà không có JWT người dùng. Mỗi hàm tự xác thực:
  - `sepay-webhook`: header `Authorization: Apikey <SEPAY_API_KEY>`;
  - `tracking-webhook`: tham số `?carrier=SPX|BEST&secret=<TRACKING_WEBHOOK_SECRET>`;
  - `send-push`: `Bearer <CRON_SECRET>`.
- `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` do Supabase tự cấp cho Edge Function. **Không bao giờ đưa service role key vào frontend.**
- Tạo cặp khóa VAPID bằng `npx web-push generate-vapid-keys`. Khóa công khai đặt vào `VITE_VAPID_PUBLIC_KEY` ở frontend, khóa riêng đặt vào secret.

### 4.3 Lịch tự động

Bật extension `pg_cron` và `pg_net` (Database → Extensions). Sửa 2 chỗ `<…>` trong `supabase/schedule.sql` rồi chạy tệp.

### 4.4 Frontend

Build `web/` bằng `npm run build`. Kết quả là trang tĩnh trong `web/dist`, đưa lên Cloudflare Pages, Vercel hay Netlify đều được.

- Base path là `./`, nên đặt trong thư mục con cũng chạy được.
- Biến môi trường `VITE_*` được nhúng lúc build, nên đổi biến phải build lại.
- Trong Supabase → Authentication → URL Configuration, đặt Site URL bằng địa chỉ web.
- Web Push cần HTTPS. Trên iPhone, người dùng phải "Thêm vào Màn hình chính" thì mới nhận được thông báo.

### 4.5 Tài khoản đầu tiên

- Người đăng ký đầu tiên trên hệ thống trống tự trở thành chủ của 2 sổ TH và VG (hàm `public.bootstrap`).
- Từ đó về sau, người mới chỉ vào được sổ khi chủ thêm email của họ trong Cài đặt → Người dùng.
- Sổ dữ liệu mẫu (`is_demo = true`) không được tính khi kiểm tra "hệ thống trống".

## 5. Dữ liệu

- **Chưa có dữ liệu kinh doanh thật nào trong gói này.** Phần mềm chưa từng chạy trên Supabase thật. Mọi số liệu trong bản chạy thử là dữ liệu mẫu.
- **`supabase/seed-demo.sql`** là dữ liệu mẫu của bản chạy thử, dùng để dev xem giao diện có số liệu:
  - 2 sổ mẫu (đánh dấu `is_demo = true`), 29 sản phẩm, 29 đơn bán, đơn mua, thu chi, chi phí, vận đơn SPX/BEST, tiền về tài khoản và thông báo;
  - 2 tài khoản `chu.cuahang@demo.vn` và `lan.nhanvien@demo.vn`, mật khẩu `Demo@123456`.
  - **Chỉ nạp vào dự án Supabase dùng để thử (staging) hoặc Supabase local, sau `migration.sql`. Không nạp vào dự án đang chạy thật.**
  - Phần tạo tài khoản ghi thẳng vào `auth.users` và `auth.identities` theo cấu trúc hiện hành của Supabase Auth. Nếu phiên bản Supabase khác cấu trúc này, hãy xóa phần đó, tạo 2 tài khoản trong Authentication → Users với đúng id ghi trong tệp, rồi chạy phần còn lại.
  - Tạo lại tệp: `npm run export:demo` (chạy migration và dữ liệu mẫu trên PGlite, xuất ra, rồi nạp lại vào một cơ sở dữ liệu trống và đối chiếu số liệu).
- **Dữ liệu thật ban đầu** (tồn đầu kỳ 01/10/2026, khách hàng, nhà cung cấp, công nợ đầu kỳ) nhập qua màn hình **Cài đặt → Nhập / sao lưu dữ liệu** bằng các file trong `mau-excel/`. Chi tiết ở `HUONG-DAN.md` mục 3.
- **Sao lưu:** dùng sao lưu tự động của Supabase (gói trả phí có Point-in-Time Recovery), cộng với chức năng xuất Excel toàn bộ sổ trong phần mềm.

## 6. Kiểm thử

| Bộ | Tệp | Số phép |
|---|---|---|
| Bán hàng, kho, công nợ, giá vốn, phân quyền, chống ghi trùng | `tests/business.test.mjs` | 146 |
| Vận chuyển SPX/BEST, đối soát COD, tiền về SePay, thông báo | `tests/ship_bank.test.mjs` | 125 |
| Chi phí theo nhóm, phân bổ nhiều tháng, nâng cấp từ bản cũ | `tests/expenses.test.mjs` | 38 |
| Quy cách đóng gói, thông tin chứng từ, trọng lượng, nâng cấp | `tests/documents.test.mjs` | 25 |

- Mỗi bộ dựng một cơ sở dữ liệu trống bằng PGlite và chạy đúng các tệp `db/*.sql`.
- Kết quả từng phép được ghi ra `tests/last-results*.json`.
- `tests/seed.test.mjs` chạy toàn bộ dữ liệu mẫu và kiểm tra tồn kho khớp sổ cái kho.

**Chưa kiểm thử được trong môi trường làm phần mềm, cần thử trên Supabase thật:**
- hai người lưu cùng lúc trên cùng một mặt hàng (đã có khóa dòng `for update`);
- webhook SePay, SPX, BEST thật;
- Web Push thật trên iPhone và Android;
- lịch pg_cron.

## 7. Việc nên làm tiếp

- **Thư viện `xlsx` 0.18.5 trên npm có cảnh báo bảo mật đã biết** (prototype pollution, ReDoS khi đọc file độc hại). Thư viện này dùng để đọc file Excel do người dùng tải lên, nên nên nâng cấp lên bản SheetJS 0.20.x tải từ `https://cdn.sheetjs.com`. API dùng trong `web/src/lib/excel.js` không đổi.
- **Thông báo do SQL tạo** (báo cáo ngày, tiền về) đang định dạng số kiểu `5.000.000đ`. Giao diện đã chuyển sang `5,000,000`; nếu muốn đồng bộ thì sửa các hàm `format` trong `db/06_ship_bank_notify.sql`.
- **Chưa có tích hợp hóa đơn điện tử với cơ quan thuế.** "Hóa đơn bán hàng" PDF là chứng từ nội bộ.
