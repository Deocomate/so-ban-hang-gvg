// Đơn vị vận chuyển đang dùng
export const CARRIERS = [
  { code: 'SPX', name: 'Shopee Express', short: 'SPX', track: 'https://spx.vn/track', hint: 'SPXVN0…' },
  { code: 'BEST', name: 'BEST Express', short: 'BEST', track: 'https://giaohangtotnhat.vn/tra-cuu-van-don-best-express/', hint: 'Mã vận đơn BEST' },
  { code: 'KHAC', name: 'Đơn vị khác', short: 'Khác', track: null, hint: 'Mã vận đơn' },
];
export const carrier = (c) => CARRIERS.find((x) => x.code === c) || CARRIERS[2];
// Nhớ hãng dùng lần trước trên máy này (chỉ để chọn sẵn)
export const lastCarrier = () => { try { return localStorage.getItem('gomsu.carrier') || 'SPX'; } catch (e) { return 'SPX'; } };
export const rememberCarrier = (c) => { try { localStorage.setItem('gomsu.carrier', c); } catch (e) { /* bỏ qua */ } };
