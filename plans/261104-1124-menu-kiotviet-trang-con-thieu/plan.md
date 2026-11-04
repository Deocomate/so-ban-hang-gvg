# Menu kiểu KiotViet và các trang còn thiếu

Trạng thái: giai đoạn 1–6 xong (chưa commit), giai đoạn 7 để sau theo yêu cầu người dùng. Khảo sát KiotViet: [báo cáo](../reports/kiotviet-261104-1124-trang-tham-khao.md).

## Quyết định đã chốt (04/11/2026)

- Giữ nguyên Sổ quỹ của app (Phiếu thu chi, Tiền về tài khoản, Chi phí vận hành). Chỉ không thêm "Sổ quỹ" và "Bán online" kiểu KiotViet.
- Người dùng muốn xây luôn các trang KiotViet mà app chưa có. Làm từng phần theo bảng dưới, mỗi giai đoạn xong mới thêm mục vào menu.
- Báo giá và Hợp đồng nằm trong mega-menu Đơn hàng (nhóm "Báo giá & hợp đồng").
- Toàn bộ dữ liệu local là dữ liệu test (ghi trong `CLAUDE.md`).

## Giai đoạn

| # | Nội dung | Mục menu | Trạng thái |
|---|---|---|---|
| 1 | Thanh menu mới: mega-menu/dropdown, active, badge "Mới", gom "Khác", mở thẳng tab qua `#trang/tab` | Toàn bộ | Xong |
| 2 | Nhóm khách hàng: danh mục nhóm, gán khách vào nhóm, lọc theo nhóm ở Khách hàng và báo cáo | Khách hàng → Nhóm khách hàng | Xong |
| 3 | Kho: phiếu Xuất hủy và Xuất dùng nội bộ riêng (tách khỏi phiếu điều chỉnh), phiếu Sản xuất (lắp bộ từ thành phần) | Hàng hóa → Kho hàng | Xong |
| 4 | Mua dịch vụ: phiếu mua dịch vụ theo nhà cung cấp, ghi công nợ NCC và chi phí | Mua hàng → Mua dịch vụ | Xong |
| 5 | Nhân viên: hồ sơ nhân viên (tách khỏi tài khoản đăng nhập), lịch làm việc, bảng chấm công, bảng lương, bảng hoa hồng theo doanh số, thiết lập | Nhân viên | Xong |
| 6 | Báo cáo thêm: Cuối ngày, Nhân viên (doanh số, hoa hồng), Đặt hàng | Báo cáo | Xong |
| 7 | Kênh ngoài: Gửi tin chăm sóc khách hàng, Cửa hàng Zalo, Hóa đơn điện tử | Khách hàng, Thuế & Kế toán | Để sau (cần nhà cung cấp dịch vụ) |

Giai đoạn 2, 3, 4 độc lập, làm song song được. Giai đoạn 6 phần báo cáo nhân viên cần giai đoạn 5.

## Tiêu chí hoàn thành chung

- Mỗi trang mới có bảng dữ liệu, API trong `server/src/domain/`, quyền xem/sửa như các trang hiện có, xuất Excel như các danh sách khác.
- Mục menu mới gắn badge "Mới" (trường `badge` trong `MENU` ở `web/src/App.jsx`).
- `npm test` đạt toàn bộ, có bộ kiểm thử cho phần nghiệp vụ mới (tồn kho, công nợ, lương).

## Đã làm ở giai đoạn 2–4 (04/11/2026)

- Nhóm khách hàng: giảm giá theo nhóm (VND hoặc %) tự áp khi lập đơn mới; điều kiện (số lần mua, tổng bán, tổng bán trừ trả hàng, công nợ, khu vực) trong N ngày; tự thêm khách chưa có nhóm / tự bỏ khách hết thỏa, chạy khi lưu, khi bấm cập nhật và theo báo cáo ngày. Mỗi khách một nhóm (khác KiotViet cho nhiều nhóm).
- Kho: Xuất hủy (mã XH), Xuất dùng nội bộ (mã XNB, 7 loại xuất như KiotViet, tính vào chi phí riêng), Sản xuất (mã SX, định mức lưu theo mặt hàng, thành phẩm nhận giá vốn bằng tổng thành phần). CSDL lên phiên bản 5, tự sao lưu trước khi nâng cấp.
- Mua dịch vụ: phiếu chi phí bắt buộc nhà cung cấp (mã DV), số hóa đơn đầu vào, trả ngay một phần; phần còn lại vào công nợ nhà cung cấp.

## Đã làm ở giai đoạn 5–6 (04/11/2026)

- Người dùng chọn cách tính công linh hoạt: mỗi nhân viên chọn lương theo ca, theo giờ, theo ngày công chuẩn hoặc cố định; cộng làm thêm giờ (hệ số), phụ cấp (theo kỳ / theo ngày đi làm), thưởng doanh thu bậc thang (VND hoặc %), hoa hồng theo bảng (% doanh thu, % lãi gộp hoặc VND mỗi đơn vị, theo hàng hóa / nhóm hàng / tất cả); trừ giảm trừ (theo kỳ / mỗi lần muộn-sớm / mỗi ngày nghỉ không phép).
- Doanh số tính cho người bán ghi trên đơn trùng tên hoặc mã nhân viên (ô Người bán gợi ý tên nhân viên).
- Chốt bảng lương sinh khoản chi phí "Lương" (nhóm Nhân sự) cho từng người; trả lương bằng phiếu chi gắn vào khoản đó; hủy bảng lương chỉ khi chưa trả. Chấm công trong kỳ đã chốt bị khóa.
- Quyền mới "Chấm công và lịch làm việc" cho nhân viên; hồ sơ lương, bảng lương, hoa hồng, thiết lập chỉ chủ cửa hàng.
- Báo cáo thêm: Cuối ngày, Đặt hàng, Nhân viên.

## Câu hỏi cần người dùng trả lời trước khi làm
- Giai đoạn 7: cần tài khoản nhà cung cấp (Zalo OA/ZNS để gửi tin, nhà cung cấp hóa đơn điện tử như VNPT, Viettel, MISA). Chọn nhà cung cấp nào, hay chỉ làm phần lập/lưu chứng từ trong app và xuất file?

## Rủi ro

- Giai đoạn 5 là phần lớn nhất, đụng cả người dùng/quyền hiện có ở Cài đặt.
- Giai đoạn 7 không chạy thật được nếu chưa có tài khoản và khóa API của nhà cung cấp.
