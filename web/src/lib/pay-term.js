// Hình thức thanh toán của đơn đặt hàng.
// 'mac_dinh': tiền cọc trừ thẳng vào đợt giao (trừ hết cọc còn lại, đến giá trị đợt).
// 'don_lon' (đơn hàng lớn): mỗi đợt khách trả `ratio` % giá trị đợt, phần còn lại trừ vào cọc; khi tiền cọc còn lại đã đủ cho phần hàng
// chưa giao thì khách thôi trả, cọc được quyết toán ở các đợt giao cuối. Ví dụ đơn 1 tỷ, cọc 500 triệu, 5 đợt 200 triệu, 70%:
// khách trả 140 – 140 – 140 – 80 – 0 triệu, cọc trừ 60 – 60 – 60 – 120 – 200 triệu.
export const PAY_TERMS = [
  { value: 'mac_dinh', label: 'Mặc định – trừ cọc thẳng vào đợt giao' },
  { value: 'don_lon', label: 'Đơn hàng lớn – mỗi đợt trả theo %, cọc quyết toán đợt cuối' },
];
export const payTermLabel = (o) => (o?.pay_term === 'don_lon' ? `Đơn hàng lớn – mỗi đợt trả ${Number(o.pay_ratio) || 70}%, cọc quyết toán đợt cuối` : 'Mặc định – trừ cọc thẳng');

// Tiền cọc khấu trừ vào một đợt giao.
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
