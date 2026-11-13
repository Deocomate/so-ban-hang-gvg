# Đối chiếu artifact "P&L tháng & Điểm hòa vốn — Thanh Hai" với module Báo cáo

Ngày: 2026-11-13. Artifact gốc là bảng dự toán người dùng tự gõ số, có 3 thương hiệu (TH Ceramics, Anam Tiles, Gốm Vũ Gia). Mỗi thương hiệu có 5 tab con, thêm một trang Tổng hợp.
Trong sổ bán hàng, mỗi thương hiệu là một sổ riêng, nên số liệu được lấy thẳng từ sổ và vẫn sửa tạm được (chế độ giả lập).

| Artifact | Trong sổ bán hàng |
|---|---|
| Tab Thông số (11 ô nhập) | Báo cáo → Hòa vốn & kịch bản giá → "Thông số & giả lập": cột số thật (bấm vào để xem chứng từ) và cột giả lập sửa tạm, không lưu |
| Tab P&L tháng (mục I–V, % DT, ghi chú) | Chế độ "P&L tháng" của cùng báo cáo |
| Tab Điểm hòa vốn (7 thẻ, biểu đồ, kịch bản 25–150%) | Chế độ "Điểm hòa vốn" |
| Tab Kịch bản giá bán (A giữ doanh thu, B giữ số đơn, biểu đồ) | Chế độ "Kịch bản giá bán". Hệ số giá lưu vào cài đặt sổ (`price_multipliers`); chỉ chủ sổ được lưu |
| Tab Bảng giá (% trên giá vốn, làm tròn) | Dùng màn Bảng giá có sẵn (công thức giá vốn + %). Đã bổ sung bước làm tròn tự động/cố định và chiều làm tròn lên, gần nhất hoặc xuống |
| Tổng hợp 3 thương hiệu | Báo cáo → So sánh thương hiệu |

## Số đầu vào lấy từ sổ (`beInputs` trong `server/src/domain/reports.js`)

- Doanh thu thuần là `revenue_net` (đã trừ thuế GTGT ước tính). Giá vốn là `cogs`. Hỏng/hủy là hao hụt kho.
- Số đơn là số đơn có giao hàng trong tháng, và TA = doanh thu ÷ số đơn.
- Các nhóm chi phí được xếp như sau: Marketing là quảng cáo; Chi phí bán hàng là biến phí khác; Nhân sự là lương thưởng; Mặt bằng là thuê nhà; Điện, nước, internet là điện nước; Công cụ dụng cụ giữ nguyên. Các nhóm còn lại, kể cả nhóm tự đặt, tính vào chi phí khác cố định.
- Kiểm thử `server/test/break-even.test.js` xác nhận lãi/lỗ theo mô hình hòa vốn khớp với "Lợi nhuận sau chi phí" của Tổng quan.

## Câu hỏi còn mở

- Artifact nhập lương tay cho từng thương hiệu. Trong sổ, lương lấy theo chi phí nhóm Nhân sự của từng sổ. Nếu lương trả chung thì cần ghi tách theo sổ.
