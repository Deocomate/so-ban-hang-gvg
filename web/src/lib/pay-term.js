// Hình thức thanh toán của đơn đặt hàng.
// Tiền cọc không trừ vào hóa đơn nào: cọc ghi riêng ở đơn, chỉ trừ vào tổng công nợ của khách.
// 'mac_dinh': khách trả theo giá trị hóa đơn.
// 'don_lon' (đơn hàng lớn): khi xử lý đơn, gợi ý mỗi đợt khách trả `ratio` % giá trị đợt; khi tiền cọc đã đủ cho phần hàng chưa giao thì
// gợi ý trả 0. Ví dụ đơn 1 tỷ, cọc 500 triệu, 5 đợt 200 triệu, 70%: gợi ý trả 140 – 140 – 140 – 80 – 0 triệu.
export const PAY_TERMS = [
  { value: 'mac_dinh', label: 'Mặc định – khách trả theo hóa đơn' },
  { value: 'don_lon', label: 'Đơn hàng lớn – gợi ý mỗi đợt trả theo %' },
];
export const payTermLabel = (o) => (o?.pay_term === 'don_lon' ? `Đơn hàng lớn – gợi ý mỗi đợt trả ${Number(o.pay_ratio) || 70}%` : 'Mặc định – khách trả theo hóa đơn');

// Phần giá trị đợt giao có cọc bù (không phải trả ngay); khách trả đợt này = value − kết quả.
// value: tiền đợt này (sau giảm giá, gồm VAT, phí vận chuyển); deposit: cọc còn dùng được; remaining: giá trị đơn chưa giao, gồm cả đợt này
export function depositForDelivery({ term, ratio = 70, value, deposit, remaining }) {
  const v = Math.max(0, Math.round(Number(value) || 0)); const dep = Math.max(0, Math.round(Number(deposit) || 0));
  if (!v || !dep) return 0;
  if (term !== 'don_lon') return Math.min(dep, v);
  // Khách còn phải trả bằng tiền ngoài cọc cho phần chưa giao (kể cả đợt này); đợt này trả theo tỷ lệ nhưng không quá số đó
  const need = Math.max(0, Math.round(Math.max(Number(remaining) || 0, v)) - dep);
  const pay = Math.min(Math.round((v * (Number(ratio) || 70)) / 100), need, v);
  return Math.min(dep, v - pay);
}
