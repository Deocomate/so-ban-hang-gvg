// Nhãn tiếng Việt dùng chung (cho cả SQL qua hàm tự định nghĩa và mã JS)

// Danh mục quyền theo nhóm (giao diện dựng ô tick từ đây). Quyền sửa kéo theo quyền xem cùng nhóm (PERM_IMPLIES).
export const PERM_GROUPS = [
  { group: 'Bán hàng', perms: [['xem_ban_hang', 'Xem đơn bán, báo giá, hợp đồng, vận chuyển'], ['ban_hang', 'Tạo / sửa đơn bán, giao hàng, trả hàng']] },
  { group: 'Mua hàng', perms: [['xem_nhap_hang', 'Xem đơn nhập, phiếu nhập, trả hàng nhập'], ['nhap_hang', 'Tạo / sửa đơn nhập, đặt xưởng, nhận hàng']] },
  { group: 'Sổ quỹ', perms: [['xem_thu_chi', 'Xem phiếu thu chi, tiền về tài khoản'], ['thu_chi', 'Lập / hủy phiếu thu chi'],
    ['xem_chi_phi', 'Xem chi phí vận hành'], ['chi_phi', 'Ghi chi phí']] },
  { group: 'Hàng hóa & kho', perms: [['danh_muc', 'Sửa hàng hóa, khách hàng, nhà cung cấp'], ['kho', 'Điều chỉnh kho (vỡ, kiểm kê, xuất hủy)']] },
  { group: 'Nhân sự', perms: [['cham_cong', 'Chấm công và lịch làm việc']] },
  { group: 'Báo cáo', perms: [['xem_bao_cao', 'Xem tổng quan, báo cáo, thuế'], ['xem_gia_von', 'Xem giá vốn, lợi nhuận, giá trị tồn kho']] },
];
export const PERM_KEYS = PERM_GROUPS.flatMap((g) => g.perms.map(([k]) => k));
export const PERM_IMPLIES = { ban_hang: ['xem_ban_hang'], nhap_hang: ['xem_nhap_hang'], thu_chi: ['xem_thu_chi'], chi_phi: ['xem_chi_phi'] };

export const PERM_LABELS = {
  ...Object.fromEntries(PERM_GROUPS.flatMap((g) => g.perms)),
  owner: 'Quản lý sổ',
  admin: 'Tổng quản trị',
};

// Vai trò mẫu tạo sẵn khi nâng cấp; Tổng quản trị sửa, xóa, thêm được
export const DEFAULT_ROLES = [
  { name: 'Nhân viên bán hàng', description: 'Lên đơn, giao hàng, thu tiền khách', perms: ['ban_hang', 'thu_chi'] },
  { name: 'Thủ kho', description: 'Nhập hàng, nhận hàng, kiểm kho; xem đơn bán để soạn hàng', perms: ['xem_ban_hang', 'nhap_hang', 'kho'] },
  { name: 'Kế toán', description: 'Thu chi, chi phí, báo cáo, giá vốn; xem đơn bán và đơn nhập', perms: ['xem_ban_hang', 'xem_nhap_hang', 'thu_chi', 'chi_phi', 'xem_bao_cao', 'xem_gia_von'] },
  { name: 'Nhân sự', description: 'Chấm công, lịch làm việc', perms: ['cham_cong'] },
  { name: 'Chỉ xem', description: 'Xem đơn, phiếu, báo cáo; không sửa được gì', perms: ['xem_ban_hang', 'xem_nhap_hang', 'xem_thu_chi', 'xem_chi_phi', 'xem_bao_cao'] },
];
export const permLabel = (p) => PERM_LABELS[p] || p;

export const SHIP_STATUS_LABELS = {
  cho_lay_hang: 'Chờ lấy hàng', da_lay_hang: 'Đã lấy hàng', dang_trung_chuyen: 'Đang trung chuyển',
  dang_giao: 'Đang giao hàng', giao_thanh_cong: 'Giao thành công',
  giao_that_bai: 'Giao thất bại – chờ giao lại', dang_hoan: 'Đang hoàn hàng về shop',
  da_hoan: 'Đã hoàn hàng về shop', da_huy: 'Đã hủy vận đơn', su_co: 'Có sự cố (thất lạc / hư hỏng)',
};
export const shipStatusLabel = (s) => (s == null ? null : SHIP_STATUS_LABELS[s] || s);
export const isShipStatus = (s) => s != null && Object.hasOwn(SHIP_STATUS_LABELS, s);

const COD_LABELS = { khong_cod: 'Không thu hộ', chua_thu: 'Chưa thu', spx_dang_giu: 'ĐVVC đang giữ tiền', da_ve_tk: 'Đã về tài khoản', khong_thu_duoc: 'Không thu được (hoàn/hủy)' };
export const codStatusLabel = (s) => (s == null ? null : COD_LABELS[s] || s);

// Đơn vị vận chuyển: SPX = Shopee Express, BEST = BEST Express, KHAC = đơn vị khác
export const CARRIERS = ['SPX', 'BEST', 'KHAC'];
export const carrierShort = (c) => ({ SPX: 'SPX', BEST: 'BEST', KHAC: 'ĐVVC' }[c] || c || 'ĐVVC');
export const carrierName = (c) => ({ SPX: 'Shopee Express', BEST: 'BEST Express', KHAC: 'Đơn vị khác' }[c] || c || 'Đơn vị khác');

// Thứ tự tiến trình giao (để biết trạng thái nào "đi xa hơn")
const RANK = { cho_lay_hang: 0, da_lay_hang: 1, dang_trung_chuyen: 2, dang_giao: 3, giao_that_bai: 4, giao_thanh_cong: 5, dang_hoan: 5, su_co: 5, da_hoan: 6, da_huy: 6 };
export const shipRank = (s) => RANK[s] ?? 0;

// Trạng thái TrackingMore (dùng chung cho mọi hãng) → trạng thái kiểu app Shopee Express
export function mapTmStatus(st, sub) {
  switch (String(st ?? '').toLowerCase()) {
    case 'pending': case 'notfound': case 'inforeceived': return 'cho_lay_hang';
    case 'transit': return 'dang_trung_chuyen';
    case 'pickup': return 'dang_giao';
    case 'delivered': return 'giao_thanh_cong';
    case 'undelivered': return 'giao_that_bai';
    case 'exception':
      return { exception010: 'da_hoan', exception011: 'dang_hoan', exception009: 'dang_hoan', exception008: 'da_huy' }[String(sub ?? '').toLowerCase()] || 'su_co';
    case 'expired': return 'su_co';
    default: return null;
  }
}
