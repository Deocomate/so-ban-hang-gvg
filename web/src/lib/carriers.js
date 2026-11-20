// Đơn vị vận chuyển đang dùng
export const CARRIERS = [
  { code: 'SPX', name: 'Shopee Express', short: 'SPX', track: 'https://spx.vn/track', hint: 'SPXVN0…' },
  { code: 'BEST', name: 'BEST Express', short: 'BEST', track: 'https://giaohangtotnhat.vn/tra-cuu-van-don-best-express/', hint: 'Mã vận đơn BEST' },
  // Đơn vị khác: không có mã vận đơn của hãng, đi bằng lái xe trong danh sách lái xe
  { code: 'KHAC', name: 'Đơn vị khác (lái xe)', short: 'Khác', track: null, hint: 'Chọn lái xe', own: true },
];
export const carrier = (c) => CARRIERS.find((x) => x.code === c) || CARRIERS[2];
// Tên hiển thị của 1 vận đơn: mã của hãng, hoặc lái xe với đơn vị khác
export const shipLabel = (s) => (carrier(s.carrier).own ? (s.driver_name ? `Xe ${s.driver_name}` : s.code) : s.tracking_no);
// Nhớ hãng dùng lần trước trên máy này (chỉ để chọn sẵn)
export const lastCarrier = () => { try { return localStorage.getItem('gomsu.carrier') || 'SPX'; } catch (e) { return 'SPX'; } };
export const rememberCarrier = (c) => { try { localStorage.setItem('gomsu.carrier', c); } catch (e) { /* bỏ qua */ } };
