// Danh mục chi phí 2 cấp: nhóm lớn → khoản mục
export const DEFAULT_CATS = [
  { group: 'Mặt bằng', items: ['Thuê nhà / cửa hàng', 'Thuê kho', 'Phí dịch vụ, an ninh, vệ sinh'] },
  { group: 'Điện, nước, internet', items: ['Tiền điện', 'Tiền nước', 'Internet, điện thoại', 'Gas, rác thải'] },
  { group: 'Công cụ dụng cụ', items: ['Kệ, tủ, bàn trưng bày', 'Thiết bị (máy in, camera, đèn, điện thoại livestream)', 'Dụng cụ đóng gói, bán hàng', 'Sửa chữa, bảo trì'] },
  { group: 'Marketing', items: ['Quảng cáo Facebook', 'Quảng cáo TikTok', 'Quảng cáo khác (Google, Zalo…)', 'KOC / KOL, affiliate', 'Chụp ảnh, quay video, đạo cụ', 'In ấn, biển bảng, catalog', 'Quà tặng, khuyến mãi, hàng mẫu'] },
  { group: 'Chi phí bán hàng', items: ['Phí vận chuyển (ship, COD)', 'Bao bì, đóng gói', 'Phí sàn TMĐT', 'Phí ngân hàng, thanh toán', 'Hoa hồng bán hàng, CTV', 'Hàng tặng kèm'] },
  { group: 'Nhân sự', items: ['Lương', 'Thưởng', 'Bảo hiểm, phụ cấp', 'Ăn uống, liên hoan'] },
  { group: 'Quản lý & khác', items: ['Phần mềm, ứng dụng', 'Thuế môn bài, lệ phí', 'Văn phòng phẩm', 'Tiếp khách', 'Chi phí khác'] },
];
// Gợi ý ngắn cho từng nhóm (hiện trong form)
export const GROUP_HINT = {
  'Mặt bằng': 'Trả trước nhiều tháng tiền nhà → chọn phân bổ đúng số tháng.',
  'Điện, nước, internet': 'Ghi theo tháng của hóa đơn.',
  'Công cụ dụng cụ': 'Đồ dùng lâu (kệ, camera, máy in…) nên phân bổ 6–24 tháng để lãi lỗ từng tháng không bị lệch.',
  Marketing: 'Tách từng kênh quảng cáo để biết kênh nào tốn bao nhiêu.',
  'Chi phí bán hàng': 'Phí sàn TikTok và cước COD được phần mềm tự ghi khi thu tiền / đối soát — không cần nhập lại.',
  'Nhân sự': 'Lương, thưởng tính theo tháng làm việc.',
  'Quản lý & khác': 'Thuế GTGT 1% và TNCN 17% phần mềm tự ước tính — không ghi ở đây.',
};
export const cats = (settings) => (Array.isArray(settings?.expense_cats) && settings.expense_cats.length ? settings.expense_cats : DEFAULT_CATS);
export const groupOf = (settings, cat) => cats(settings).find((g) => g.group === cat || g.items.includes(cat))?.group || null;
export const GROUP_COLORS = ['#1d4f91', '#4f8a76', '#9a5b00', '#b3261e', '#6b4fa0', '#2f7f9a', '#5a6778', '#8a6d3b'];
