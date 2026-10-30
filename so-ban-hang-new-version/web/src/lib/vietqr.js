// Mã QR chuyển khoản chuẩn VietQR (NAPAS / EMVCo) — tạo ngay trong máy, không gọi dịch vụ ngoài.
// Quét bằng app ngân hàng nào cũng tự điền: ngân hàng, số tài khoản, số tiền, nội dung.
import QRCode from 'qrcode';

export const BANKS = [
  { bin: '970436', name: 'Vietcombank' }, { bin: '970415', name: 'VietinBank' }, { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' }, { bin: '970407', name: 'Techcombank' }, { bin: '970422', name: 'MB Bank' },
  { bin: '970416', name: 'ACB' }, { bin: '970432', name: 'VPBank' }, { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' }, { bin: '970437', name: 'HDBank' }, { bin: '970441', name: 'VIB' },
  { bin: '970443', name: 'SHB' }, { bin: '970448', name: 'OCB' }, { bin: '970426', name: 'MSB' },
];

const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
function crc16(s) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
// Nội dung chuyển khoản: chỉ chữ không dấu, số, khoảng trắng (ngân hàng hay cắt ký tự lạ)
export const cleanContent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50);

export function vietqrPayload({ bin, account_no, amount, content }) {
  const acct = String(account_no || '').replace(/\D/g, '');
  const amt = Math.round(Number(amount) || 0);
  const mai = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', acct)) + tlv('02', 'QRIBFTTA');
  let s = tlv('00', '01') + tlv('01', amt > 0 ? '12' : '11') + tlv('38', mai) + tlv('53', '704');
  if (amt > 0) s += tlv('54', String(amt));
  s += tlv('58', 'VN');
  const c = cleanContent(content);
  if (c) s += tlv('62', tlv('08', c));
  s += '6304';
  return s + crc16(s);
}

// Nội dung CK theo đơn: <mã sổ><mã đơn>, ví dụ THDH00013 — phần mềm dựa vào đây để tự gạch nợ khi tiền về
export const orderTransferContent = (book, orderCode) => `${(book?.short_name || '').toUpperCase()}${orderCode}`;

export async function qrSvg(payload, size = 220) {
  return QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: size, color: { dark: '#000000', light: '#ffffff' } });
}
