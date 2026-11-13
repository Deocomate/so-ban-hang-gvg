// Mẫu in dạng HTML có biến {Ten_Bien} (giống cách KiotViet lưu mẫu in).
// - Mẫu mặc định của từng loại chứng từ dựng lại đúng bố cục bản cũ, kèm nội dung ghi chú đã tùy chỉnh trong cài đặt.
// - Mẫu riêng lưu ở settings.docs.templates[loại] = [{ id, name, html, paper, orient, margin, sep, is_default }].
// - renderTemplate(): lặp dòng hàng hóa, ẩn dòng có biến trống, thay biến bằng dữ liệu.
import { DOC_TYPES, DEFAULT_TEXTS } from './model.js';
import { ALL_TOKENS, ITEM_TOKENS, esc, richText, tokenValues } from './tokens.js';

// ---------- Khổ giấy ----------
// Kích thước mm (rộng × cao khổ dọc); khổ cuộn K80/K58 cao tự do
export const PAPERS = {
  A4: { label: 'Khổ A4', w: 210, h: 297 },
  A5: { label: 'Khổ A5', w: 148, h: 210 },
  K80: { label: 'Khổ K80 (giấy cuộn 80mm)', w: 80, h: null, roll: true },
  K58: { label: 'Khổ K58 (giấy cuộn 58mm)', w: 58, h: null, roll: true },
};
export const DEFAULT_MARGIN = { top: 10, right: 14, bottom: 10, left: 14 };
const ROLL_MARGIN = { top: 3, right: 3, bottom: 3, left: 3 };
// Kích thước trang (mm) theo khổ + hướng giấy
export function pageSize(tpl) {
  const p = PAPERS[tpl.paper] || PAPERS.A4;
  if (p.roll) return { w: p.w, h: null };
  return tpl.orient === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}
export const marginOf = (tpl) => ({ ...(PAPERS[tpl.paper]?.roll ? ROLL_MARGIN : DEFAULT_MARGIN), ...(tpl.margin || {}) });

// CSS chung cho nội dung mẫu: dùng ở bản xem trước, trình soạn và khi in — nên ba nơi giống nhau
export const FONT_CSS = { Arimo: 'Arimo, Arial, "Helvetica Neue", sans-serif', Tinos: 'Tinos, "Times New Roman", Times, serif' };
export const TPL_CSS = `
.tpl { color: #000; line-height: 1.2; font-size: 10pt; overflow-wrap: anywhere; }
.tpl p { margin: 0; min-height: 1.2em; }
.tpl table { width: 100% !important; border-collapse: collapse; table-layout: fixed; margin: 0; }
.tpl td, .tpl th { vertical-align: top; padding: 1pt 2pt; position: relative; }
.tpl table[data-border="1"] > tbody > tr > td, .tpl table[data-border="1"] > tbody > tr > th { border: 0.6pt solid #000; padding: 3pt 4pt; }
.tpl img { max-width: 100%; height: auto; }
.tpl hr { border: 0; border-top: 1pt solid #000; margin: 4pt 0; }
.tpl hr[data-kind="rule"] { border-top: 3pt solid #1f3864; box-shadow: 0 2pt 0 -1.4pt #8ea2c6; margin: 0 0 8pt; height: 3pt; }
.tpl ul, .tpl ol { margin: 0; padding-left: 18pt; }
.tpl div[data-page-break] { break-after: page; page-break-after: always; height: 0; }
`;

// ---------- Mẫu mặc định ----------
const P = (inner, st = '') => `<p${st ? ` style="${st}"` : ''}>${inner}</p>`;
const B = (s) => `<strong>${s}</strong>`;
const I = (s) => `<em>${s}</em>`;
const center = 'text-align:center';
const right = 'text-align:right';
// Bảng: widths (pt, '*' = cột co giãn), rows = [[cell…]…]; cell = chuỗi HTML hoặc { h, span, st }
function table(widths, rows, { border = true, size, mt } = {}) {
  const col = widths.map((w) => (w === '*' ? '<col>' : `<col style="width:${Math.round(w * 4 / 3)}px">`)).join('');
  const td = (c) => { const x = typeof c === 'string' ? { h: c } : c; return `<td${x.span ? ` colspan="${x.span}"` : ''}${x.st ? ` style="${x.st}"` : ''}>${x.h.startsWith('<p') ? x.h : P(x.h, x.pst || '')}</td>`; };
  const st = [size && `font-size:${size}pt`, mt && `margin-top:${mt}pt`].filter(Boolean).join('; ');
  return `<table data-border="${border ? 1 : 0}"${st ? ` style="${st}"` : ''}><colgroup>${col}</colgroup><tbody>${rows.map((r) => `<tr>${r.map(td).join('')}</tr>`).join('')}</tbody></table>`;
}
const head = (labels) => labels.map((l) => ({ h: B(l), pst: center, st: 'vertical-align:middle' }));
const C = (h, st = '') => ({ h, pst: center, st: `vertical-align:middle${st ? ';' + st : ''}` });
const R = (h) => ({ h, pst: right, st: 'vertical-align:middle' });
const L = (h) => ({ h, st: 'vertical-align:middle' });
// Khối ký tên: cột tiêu đề, ghi chú (Ký, họ tên), khoảng trống, tên người ký
function sign(cols, { size, space = 3, mt = 0 }) {
  const blank = P('', '').repeat(space);
  const cell = (c) => ({ h: `${P(B(c.title), center)}${c.note ? P(I(c.note), `${center}; font-size:${size - 1}pt`) : ''}${blank}${P(B(c.name || ''), center)}` });
  return table(cols.map(() => '*'), [cols.map(cell)], { border: false, size, mt });
}
// Đầu trang: logo + tên, địa chỉ, liên hệ của đơn vị
function letterhead({ size, nameSize = 12, compact = false, bank = true, gap = 2 }) {
  const ln = (h) => P(h, `margin-bottom:${gap}pt`);
  const lines = [P(`<span style="font-size:${nameSize}pt">${B('{Ten_Don_Vi}')}</span>`, `margin-bottom:${gap}pt`), ln('Địa chỉ: {Dia_Chi_Don_Vi}')];
  if (compact) lines.push(ln('{Lien_He_Don_Vi}'), ln('Website: {Website_Don_Vi}'));
  else lines.push(ln('Điện thoại: {Dien_Thoai_Don_Vi}'), ln('Email: {Email_Don_Vi}'), ln('Website: {Website_Don_Vi}'));
  if (bank) lines.push(ln('STK: {So_Tai_Khoan_Don_Vi}'));
  return table([110, '*'], [[{ h: P('{Logo_Don_Vi}') }, { h: lines.join('') }]], { border: false, size });
}
const NATION = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'; const MOTTO = 'Độc lập – Tự do – Hạnh phúc';
const lines = (txt, st) => String(txt || '').split('\n').map((t) => P(esc(t) || '&nbsp;', st)).join('');

function textOf(ds, type, k) { const t = ds?.types?.[type]?.text; return t && t[k] !== undefined && t[k] !== null ? t[k] : DEFAULT_TEXTS[k]; }

const BUILDERS = {
  hoa_don(ds) {
    const s = 'font-size:9.5pt';
    const sumRow = (label, tok, bold) => ['', { h: bold ? B(label) : label, span: 4, pst: right }, { h: bold ? B(tok) : tok, pst: right }];
    const notes = textOf(ds, 'hoa_don', 'invoice_notes');
    const noteHtml = notes && notes.trim() ? P(B('GHI CHÚ:'), 'font-size:11pt; margin-top:14pt; margin-bottom:2pt') + notes.split('\n').map((ln) => {
      const lead = ln.match(/^\s*/)[0].length;
      return P(richText(ln.trim()) || '&nbsp;', `font-size:8.2pt; line-height:1.1${lead >= 4 ? '; margin-left:10pt' : lead >= 2 ? '; margin-left:4pt' : ''}`);
    }).join('') : '';
    return letterhead({ size: 10.5, gap: 2.5 })
      + P(`<span style="font-size:18pt">${B('HÓA ĐƠN BÁN HÀNG')}</span>`, `${center}; margin-top:8pt; margin-bottom:2pt`)
      + P('{Ngay_Thang_Nam}', `${center}; ${s}; margin-bottom:10pt`)
      + P(B('Khách hàng: {Khach_Hang_Kem_SDT}'), s) + P('Địa chỉ: {Dia_Chi_Nhan_Hang}', s) + P('SĐT: {SDT_Nhan_Hang}', `${s}; margin-bottom:10pt`)
      + table([28, '*', 70, 52, 72, 80], [
        head(['STT', 'Tên hàng', 'Số lượng', 'ĐVT', 'Đơn giá', 'Thành tiền']),
        [C('{STT}'), L(`{Ten_Hang}<br>${I('{Quy_Cach_Ghi_Chu}')}`), C('{So_Luong}'), C('{Don_Vi_Tinh}'), R('{Don_Gia}'), R('{Thanh_Tien}')],
        [{ h: B('Tổng cộng: {Tong_So_Hop} {Don_Vi_Dong_Goi}'), span: 6 }],
        sumRow('Tổng tiền hàng:', '{Tong_Tien_Hang}', true), sumRow('Chiết khấu:', '{Chiet_Khau}'), sumRow('Nợ cũ:', '{No_Cu}'), sumRow('{Ten_VAT}', '{Tien_VAT}'),
        sumRow('Tiền vận chuyển', '{Phi_Van_Chuyen}'), sumRow('Hàng trả lại', '{Hang_Tra_Lai}'), sumRow('Tổng thanh toán', '{Tong_Thanh_Toan}'),
        sumRow('{Nhan_Da_Thanh_Toan}', '{Da_Thanh_Toan}'), sumRow('Còn thanh toán', '{Con_Thanh_Toan}', true),
        [{ h: `${B(I('Bằng chữ:'))}&nbsp; ${I('{Con_Thanh_Toan_Bang_Chu}')}`, span: 6 }],
      ], { size: 9.5 })
      + noteHtml + sign([{ title: 'Người mua hàng' }, { title: 'Người bán hàng' }], { size: 9.5, space: 2, mt: 10 });
  },
  don_dat_hang(ds) {
    const s = 'font-size:10pt';
    const sumRow = (label, tok) => ['', { h: B(label), span: 4, pst: right }, { h: B(tok), pst: right }];
    const ft = textOf(ds, 'don_dat_hang', 'order_footer');
    return letterhead({ size: 9, gap: 2 })
      + P(`<span style="font-size:18pt">${B('ĐƠN ĐẶT HÀNG')}</span>`, `${center}; margin-top:8pt; margin-bottom:2pt`)
      + P('{Ngay_Thang_Nam}', `${center}; font-size:9.5pt; margin-bottom:10pt`)
      + P(B('Bên đặt hàng (Bên A): {Khach_Hang}'), s) + P('Địa chỉ: {Dia_Chi_Nhan_Hang}', s) + P('SĐT: {SDT_Nhan_Hang}', s)
      + P(B('Bên nhận đặt hàng (Bên B): {Ten_Phap_Ly}'), s) + P('Địa chỉ: {Dia_Chi_Don_Vi}', s) + P('Người đại diện: {Nguoi_Dai_Dien}', s) + P('SĐT: {Dien_Thoai_Don_Vi}', s)
      + P(B('I. TÊN HÀNG, SỐ LƯỢNG VÀ ĐƠN GIÁ'), `${s}; margin-top:6pt; margin-bottom:4pt`)
      + table([28, '*', 44, 44, 72, 82], [
        head(['STT', 'Tên hàng', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền']),
        [C('{STT}'), L(`{Ten_Hang}<br>${I('{Quy_Cach_Ghi_Chu}')}`), C('{Don_Vi_Tinh}'), C('{So_Luong}'), R('{Don_Gia}'), R('{Thanh_Tien}')],
        sumRow('Tổng tiền hàng:', '{Tong_Tien_Hang}'), sumRow('Chiết khấu:', '{Chiet_Khau}'), sumRow('{Ten_VAT}', '{Tien_VAT}'), sumRow('Tiền vận chuyển:', '{Phi_Van_Chuyen}'),
        sumRow('Hàng trả lại:', '{Hang_Tra_Lai}'), sumRow('Đặt cọc:', '{Da_Thanh_Toan}'), sumRow('Còn thanh toán:', '{Con_Thanh_Toan}'),
        [{ h: B(I('Bằng chữ: {Con_Thanh_Toan_Bang_Chu}.')), span: 6 }],
        [{ h: B(I('Ghi chú: {Ghi_Chu}')), span: 6 }],
      ], { size: 9.5 })
      + (ft ? P(B(I(esc(ft))), `${center}; font-size:9.5pt; margin-top:18pt`) : '');
  },
  bien_ban(ds) {
    const s = 'font-size:11pt; margin-top:3pt';
    return '<hr data-kind="rule">' + letterhead({ size: 10, nameSize: 10.5, compact: true, bank: false, gap: 4 })
      + P(`<span style="font-size:14pt">${B('BIÊN BẢN BÀN GIAO HÀNG HÓA')}</span>`, `${center}; margin-top:20pt; margin-bottom:12pt`)
      + P(`${I('Hôm nay, {Ngay_Thang_Nam_Thuong}')}, tại {Noi_Lap}, chúng tôi gồm có:`, 'font-size:11pt; line-height:1.35; margin-bottom:3pt')
      + P(B('A. BÊN GIAO HÀNG: {Ten_Phap_Ly_In_Hoa}'), s) + P('Địa chỉ: {Dia_Chi_Don_Vi}', s) + P('Đại diện giao hàng: {Dai_Dien_Ben_Giao}', s)
      + P(B('B. BÊN VẬN CHUYỂN: {Ben_Van_Chuyen}'), s)
      + P(B('C. BÊN NHẬN HÀNG: {Ben_Nhan_Hang_In_Hoa}'), s) + P('Địa chỉ: {Dia_Chi_Khach_Hang}', s)
      + P('Bên giao bàn giao cho bên nhận lô hàng chi tiết như sau:', `${s}; margin-bottom:6pt`)
      + table([30, '*', 58, 50, 150], [
        head(['STT', 'Tên hàng hoá', 'Số lượng', 'ĐVT', 'Quy cách đóng gói']),
        [C('{STT}'), L(`{Ten_Hang}<br>${I('{Ghi_Chu_Hang}')}`), C('{So_Luong}'), C('{Don_Vi_Tinh_Thuong}'), C('{Quy_Cach}')],
        [{ h: B('Tổng cộng: {Tong_So_Hop} {Don_Vi_Dong_Goi}{Tong_Trong_Luong_Kem}'), span: 5, pst: right }],
      ], { size: 10.5 })
      + P(B('Địa chỉ giao hàng: {Dia_Chi_Nhan_Hang}'), 'font-size:11pt; margin-top:6pt')
      + P(B('SĐT nhận hàng: {SDT_Kem_Nguoi_Nhan}'), 'font-size:11pt; margin-top:4pt')
      + P('Tình trạng hàng hóa: {Tinh_Trang_Hang}', 'font-size:11pt; margin-top:4pt')
      + lines(String(textOf(ds, 'bien_ban', 'handover_closing') || '').split('\n').filter(Boolean).join('\n'), 'font-size:11pt; margin-top:4pt; line-height:1.35')
      + sign([{ title: 'ĐẠI DIỆN BÊN GIAO', name: '{Dai_Dien_Ben_Giao}' }, { title: 'LÁI XE', name: '{Lai_Xe}' }, { title: 'ĐẠI DIỆN BÊN NHẬN' }], { size: 11, space: 4, mt: 24 });
  },
  phieu_xuat_kho(ds) {
    const cfg = ds?.types?.phieu_xuat_kho || {}; const showPrice = cfg.show_price !== false; const showForm = cfg.show_form !== false;
    const s = 'font-size:11pt; margin-top:2pt';
    const form = String(textOf(ds, 'phieu_xuat_kho', 'form_xuat') || '').split('\n').map((t, i) => P(i ? I(esc(t)) : B(esc(t)), `${center}; font-size:${i ? 8 : 9.5}pt`)).join('');
    const unit = P(B('Đơn vị: {Ten_Phap_Ly}')) + P('Địa chỉ: {Dia_Chi_Don_Vi}');
    const top = showForm ? table(['*', 220], [[{ h: unit }, { h: form }]], { border: false, size: 10 }) : P(B('Đơn vị: {Ten_Phap_Ly}'), 'font-size:10pt') + P('Địa chỉ: {Dia_Chi_Don_Vi}', 'font-size:10pt');
    const headCols = ['STT', 'Tên, nhãn hiệu, quy cách hàng hóa', 'Mã số', 'ĐVT', 'Số lượng', ...(showPrice ? ['Đơn giá', 'Thành tiền'] : [])];
    const widths = showPrice ? [26, '*', 52, 36, 56, 62, 76] : [30, '*', 70, 50, 70];
    return top
      + P(`<span style="font-size:16pt">${B('PHIẾU XUẤT KHO')}</span>`, `${center}; margin-top:16pt`)
      + P(I('{Ngay_Thang_Nam}'), `${center}; font-size:11pt`) + P('Số: {So_Chung_Tu}', `${center}; font-size:11pt; margin-bottom:10pt`)
      + P('- Họ và tên người nhận hàng: {Nguoi_Nhan_Hang}', s) + P('- Địa chỉ (bộ phận): {Dia_Chi_Nhan_Hang}', s) + P('- Lý do xuất kho: {Ly_Do_Xuat}', s)
      + P('- Xuất tại kho (ngăn lô): {Noi_Lap}', `${s}; margin-bottom:8pt`)
      + table(widths, [
        head(headCols),
        [C('{STT}'), L(`{Ten_Hang}<br>${I('{Quy_Cach_Ghi_Chu}')}`), C('{Ma_Hang}'), C('{Don_Vi_Tinh}'), R('{So_Luong}'), ...(showPrice ? [R('{Don_Gia}'), R('{Thanh_Tien}')] : [])],
        ['', C(B('Cộng')), '', '', R(B('{Tong_So_Luong}')), ...(showPrice ? ['', R(B('{Tong_Tien_Hang}'))] : [])],
      ], { size: 10 })
      + (showPrice ? P('- Tổng số tiền (viết bằng chữ): {Tong_Tien_Hang_Bang_Chu}', 'font-size:11pt; margin-top:8pt') : '')
      + P('- Tổng trọng lượng: {Tong_Trong_Luong}{Ghi_Chu_Trong_Luong}', `font-size:11pt; margin-top:${showPrice ? 3 : 8}pt`)
      + P('- Số chứng từ gốc kèm theo: {Chung_Tu_Kem_Theo}', 'font-size:11pt; margin-top:3pt')
      + P(I('{Ngay_Thang_Nam}'), `${right}; font-size:11pt; margin-top:10pt`)
      + sign([{ title: 'NGƯỜI LẬP BIỂU', note: '(Ký, họ tên)' }, { title: 'NGƯỜI NHẬN HÀNG', note: '(Ký, họ tên)' }, { title: 'THỦ KHO', note: '(Ký, họ tên)' },
        { title: '{Chuc_Danh_Dai_Dien_In_Hoa}', note: '(Ký, họ tên, đóng dấu)', name: '{Nguoi_Dai_Dien}' }], { size: 9.5, space: 4, mt: 6 });
  },
  phieu_thu(ds) {
    const showForm = ds?.types?.phieu_thu?.show_form !== false;
    const s = 'font-size:11pt; margin-top:4pt';
    const unit = P(B('Đơn vị: {Ten_Phap_Ly}')) + P('Địa chỉ: {Dia_Chi_Don_Vi}');
    return (showForm ? table(['*', 220], [[{ h: unit }, { h: P('{Mau_So_Phieu}', `${center}; font-size:8pt`) }]], { border: false, size: 10 }) : P(B('Đơn vị: {Ten_Phap_Ly}'), 'font-size:10pt') + P('Địa chỉ: {Dia_Chi_Don_Vi}', 'font-size:10pt'))
      + P(`<span style="font-size:16pt">${B('{Tieu_De_Phieu}')}</span>`, `${center}; margin-top:16pt`)
      + P(I('{Ngay_Thang_Nam}'), `${center}; font-size:11pt`) + P('Số: {So_Chung_Tu}', `${center}; font-size:11pt; margin-bottom:12pt`)
      + P('Họ và tên {Nhan_Nguoi_Nop}: {Nguoi_Nop_Tien}', s) + P('Địa chỉ: {Dia_Chi_Nguoi_Nop}', s) + P('{Nhan_Ly_Do}: {Ly_Do}', s)
      + P(`Số tiền: ${B('{So_Tien}')}&nbsp; (Viết bằng chữ): {So_Tien_Bang_Chu}`, s) + P('Kèm theo: {Kem_Theo} chứng từ gốc.', s)
      + P('{Trang_Thai_Phieu}', 'font-size:12pt; margin-top:6pt')
      + P(I('{Ngay_Thang_Nam}'), `${right}; font-size:11pt; margin-top:10pt`)
      + sign([{ title: '{Chuc_Danh_Dai_Dien_In_Hoa}', note: '(Ký, họ tên, đóng dấu)', name: '{Nguoi_Dai_Dien}' }, { title: 'NGƯỜI LẬP BIỂU', note: '(Ký, họ tên)' },
        { title: '{Nhan_Nguoi_Nop_In_Hoa}', note: '(Ký, họ tên)', name: '{Nguoi_Nop_Tien}' }, { title: 'THỦ QUỸ', note: '(Ký, họ tên)' }], { size: 9.5, space: 4, mt: 6 })
      + P('Đã nhận đủ số tiền (viết bằng chữ): {So_Tien_Bang_Chu}', 'font-size:11pt; margin-top:10pt');
  },
  hd_van_chuyen() {
    const s = 'font-size:10.5pt';
    const terms = DEFAULT_TEXTS.transport_terms.replace('{days}', '{So_Ngay_Van_Chuyen}').split('\n').map((ln) => P(richText(ln), 'font-size:9.5pt; margin-top:3pt; line-height:1.25')).join('');
    return table(['*', '*'], [[{ h: P(B('{Ten_Phap_Ly_In_Hoa}')) }, { h: P(B(NATION), center) + P(B(MOTTO), center) }]], { border: false, size: 10.5 })
      + P(`<span style="font-size:15pt">${B('HỢP ĐỒNG VẬN CHUYỂN')}</span>`, `${center}; margin-top:10pt; margin-bottom:2pt`)
      + P(I('Hà Nội, {Ngay_Thang_Nam_Thuong}'), `${center}; ${s}; margin-bottom:4pt`)
      + P('Căn cứ chức năng nhiệm vụ, khả năng hàng hóa và vận chuyển của hai bên', `${s}; margin-bottom:4pt`)
      + P(B('BÊN A: {Ten_Phap_Ly_In_Hoa}'), s) + P('Đại diện bên giao: {Dai_Dien_Ben_Giao}', s) + P('Điện thoại: {Dien_Thoai_Don_Vi}', s) + P('Địa chỉ: {Dia_Chi_Don_Vi}', s)
      + P(B('BÊN B: {Ben_B_Van_Chuyen}'), `${s}; margin-top:4pt`) + P('Địa chỉ: {Dia_Chi_Ben_B}', s)
      + P(B('LÁI XE: {Lai_Xe_In_Hoa}'), s)
      + P('CCCD số: {CCCD_Lai_Xe}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Xe BKS: {Bien_So_Xe}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Điện thoại: {SDT_Lai_Xe}', `${s}; margin-bottom:4pt`)
      + P(B('Điều I: Nhận vận chuyển số lượng hàng sau đây:'), `${s}; margin-bottom:4pt`)
      + table([24, '*', 104, 50, 40, 52], [
        head(['STT', 'Tên hàng', 'Số hộp', 'Tổng viên', 'kg/hộp', 'Tổng kg']),
        [C('{STT}'), L('{Ten_Hang}'), C('{Quy_Cach}'), R('{So_Luong}'), R('{Kg_Moi_Hop}'), R('{Trong_Luong}')],
        [{ h: B('Tổng cộng: {Tong_So_Hop} {Don_Vi_Dong_Goi}'), span: 5, pst: right }, R(B('{Tong_Trong_Luong_So}'))],
      ], { size: 9.5 })
      + P(B('Địa chỉ giao hàng: {Dia_Chi_Nhan_Hang}'), `${s}; margin-top:6pt`) + P(B('Người nhận: {Nguoi_Nhan_Kem_SDT}'), s)
      + terms + P('Cân nặng và giá cước: {Can_Nang_Gia_Cuoc}', 'font-size:9.5pt; margin-top:2pt') + P('Thanh toán cước phí tại: {Thanh_Toan_Cuoc_Tai}', 'font-size:9.5pt; margin-top:2pt')
      + sign([{ title: 'ĐẠI DIỆN BÊN A', name: '{Dai_Dien_Ben_Giao}' }, { title: 'LÁI XE', name: '{Lai_Xe}' }, { title: 'ĐẠI DIỆN BÊN B' }], { size: 10.5, space: 4, mt: 12 });
  },
  de_nghi_tam_ung() { return requestTpl(true); },
  de_nghi_tt() { return requestTpl(false); },
  doi_chieu_sl() { return reconcileTpl('BẢNG ĐỐI CHIẾU SỐ LƯỢNG GIAO HÀNG', '{Bang_Doi_Chieu_So_Luong}', ''); },
  doi_chieu_tt() { return reconcileTpl('BẢNG ĐỐI CHIẾU CÔNG NỢ', '{Bang_Doi_Chieu_Cong_No}', P(B(I('Bằng chữ: {Con_No_Doi_Chieu_Bang_Chu}.')), 'font-size:10.5pt; margin-top:6pt')); },
  bao_gia() {
    const s = 'font-size:10.5pt';
    return letterhead({ size: 9.5, bank: false, gap: 2 }).replace(P('Website: {Website_Don_Vi}', 'margin-bottom:2pt'), '')
      + P(`<span style="font-size:17pt">${B('BÁO GIÁ')}</span>`, `${center}; margin-top:8pt; margin-bottom:6pt`)
      + P(B('Kính gửi: {Kinh_Gui}'), s) + P('Địa chỉ: {Dia_Chi_Bao_Gia}', s) + P('Địa điểm công trình: {Dia_Diem_Cong_Trinh}', `${s}; margin-bottom:4pt`)
      + P('Trước tiên, công ty gửi lời cảm ơn đến Quý khách hàng đã quan tâm đến sản phẩm của công ty chúng tôi.', 'font-size:10pt')
      + P('Chúng tôi xin gửi Quý khách hàng báo giá dưới đây:', 'font-size:10pt; margin-bottom:5pt')
      + P('{Bang_Bao_Gia}') + P('{Luu_Y_Bao_Gia}')
      + P(I('Hà Nội, {Ngay_Thang_Nam_Thuong}'), `${right}; ${s}; margin-top:8pt`);
  },
};
function requestTpl(isAdv) {
  const para = (h, st = '') => P(h, `font-size:12pt; line-height:1.5${st ? '; ' + st : ''}`);
  const rows = isAdv ? [['Tổng giá trị hợp đồng', '{Tong_Gia_Tri_Hop_Dong}'], ['Số tiền đề nghị tạm ứng{Noi_Dung_Tam_Ung}', '{So_Tien_Tam_Ung}']]
    : [['Tổng giá trị hàng đã giao', '{Gia_Tri_Da_Giao}'], ['Số tiền đã tạm ứng / thanh toán', '{Da_Tam_Ung}'], ['Số tiền còn lại cần thanh toán', '{Con_Lai_Can_TT}']];
  return P(B(NATION), `${center}; font-size:12pt`) + P(B(MOTTO), `${center}; font-size:12pt`) + P('-----------', `${center}; font-size:11pt; margin-bottom:8pt`)
    + P(`<span style="font-size:17pt">${B(isAdv ? 'GIẤY ĐỀ NGHỊ TẠM ỨNG' : 'GIẤY ĐỀ NGHỊ THANH TOÁN')}</span>`, `${center}; margin-top:4pt; margin-bottom:10pt`)
    + P(B('Kính gửi: {Khach_Hang_In_Hoa}'), `${center}; font-size:12pt`) + P('Địa chỉ: {Dia_Chi_Khach_Hang}', `${center}; font-size:12pt; margin-bottom:10pt`)
    + para('Lời đầu tiên, {Ten_Phap_Ly} xin trân trọng cảm ơn sự hợp tác và tin cậy của Quý khách hàng trong thời gian vừa qua.', 'margin-left:24pt')
    + para(`Căn cứ theo Hợp đồng số ${B('{So_Hop_Dong}')} ký ngày {Ngay_Ky_Hop_Dong} giữa {Khach_Hang} và {Ten_Phap_Ly}.`, 'margin-left:24pt')
    + para(`Chúng tôi kính đề nghị Quý khách hàng ${isAdv ? 'tạm ứng' : 'thanh toán'} số tiền theo hợp đồng là:`, 'margin-left:24pt')
    + table(['*', 130], rows.map(([l, tk]) => [{ h: `- ${l}:` }, { h: `${tk} đồng`, pst: right }]), { border: false, size: 12 })
    + para(I('(Bằng chữ: {So_Tien_De_Nghi_Bang_Chu})'), 'margin-left:24pt; margin-top:4pt')
    + para('Quý khách hàng thanh toán cho chúng tôi bằng chuyển khoản theo thông tin sau:') + para(B('Thông tin chuyển khoản:'))
    + para('Chủ tài khoản: {Ten_Phap_Ly}') + para('Số tài khoản: {So_Tai_Khoan_Don_Vi}') + para(I('Rất mong sự hợp tác của Quý khách hàng!'), center)
    + P(B(I('Hà Nội, {Ngay_Thang_Nam_Thuong}')), `${right}; font-size:12pt; margin-top:4pt`)
    + P(B(isAdv ? 'Người đề nghị tạm ứng' : 'Người đề nghị thanh toán'), `${right}; font-size:12pt; margin-top:2pt`);
}
function reconcileTpl(title, tableTok, after) {
  return table(['*', '*'], [[{ h: P(B('{Ten_Phap_Ly_In_Hoa}')) + P('Số:......./ĐCCN/{Ma_Don_Vi_Ngan}') }, { h: P(B(NATION), center) + P(B(MOTTO), center) }]], { border: false, size: 10 })
    + P(`<span style="font-size:14pt">${B(title)}</span>`, `${center}; margin-top:12pt; margin-bottom:4pt`)
    + P('THEO HỢP ĐỒNG SỐ: {So_Hop_Dong}', `${center}; font-size:11pt`) + P(B('KHÁCH HÀNG: {Khach_Hang_In_Hoa}'), `${center}; font-size:11pt`)
    + P('Địa chỉ: {Dia_Chi_Khach_Hang}', `${center}; font-size:10pt`) + P('Số điện thoại: {So_Dien_Thoai}', `${center}; font-size:10pt; margin-bottom:8pt`)
    + P(tableTok) + after
    + P('Hà Nội, {Ngay_Thang_Nam_Thuong}', `${right}; font-size:11pt; margin-top:10pt`)
    + sign([{ title: 'Đại diện bên mua' }, { title: 'Đại diện bên bán' }], { size: 11, space: 5, mt: 6 });
}

// Mẫu gợi ý thêm (chọn ở "Chọn mẫu gợi ý" trong trình sửa): hóa đơn / phiếu thu khổ giấy cuộn K80
const ROLL = { top: 3, right: 3, bottom: 3, left: 3 };
export const SUGGESTED = {
  hoa_don: [{ id: 'k80', name: 'Hóa đơn giấy cuộn K80', paper: 'K80', orient: 'portrait', margin: ROLL, html: () => {
    const s = 'font-size:8.5pt';
    const sum = (l, t, b) => [{ h: b ? B(l) : l }, { h: b ? B(t) : t, pst: right }];
    return P(B('{Ten_Don_Vi}'), `${center}; font-size:10pt`) + P('{Dia_Chi_Don_Vi}', `${center}; ${s}`) + P('ĐT: {Dien_Thoai_Don_Vi}', `${center}; ${s}`)
      + P(`<span style="font-size:13pt">${B('HÓA ĐƠN BÁN HÀNG')}</span>`, `${center}; margin-top:6pt`) + P('Số: {So_Chung_Tu} · {Ngay_Chung_Tu}', `${center}; ${s}; margin-bottom:4pt`)
      + P('KH: {Khach_Hang_Kem_SDT}', s) + P('Đ/c: {Dia_Chi_Nhan_Hang}', `${s}; margin-bottom:4pt`)
      + '<hr>'
      + table(['*', 60], [[{ h: B('Mặt hàng') }, { h: B('T.Tiền'), pst: right }], [{ h: `{Ten_Hang}<br>{So_Luong} {Don_Vi_Tinh} x {Don_Gia}` }, { h: '{Thanh_Tien}', pst: right }]], { border: false, size: 8.5 })
      + '<hr>'
      + table(['*', 70], [sum('Tổng tiền hàng', '{Tong_Tien_Hang}', true), sum('Chiết khấu', '{Chiet_Khau}'), sum('{Ten_VAT}', '{Tien_VAT}'), sum('Phí vận chuyển', '{Phi_Van_Chuyen}'),
        sum('Hàng trả lại', '{Hang_Tra_Lai}'), sum('Nợ cũ', '{No_Cu}'), sum('Tổng thanh toán', '{Tong_Thanh_Toan}', true), sum('{Nhan_Da_Thanh_Toan}', '{Da_Thanh_Toan}'), sum('Còn thanh toán', '{Con_Thanh_Toan}', true)], { border: false, size: 8.5 })
      + P(I('({Con_Thanh_Toan_Bang_Chu})'), `${s}; margin-top:2pt`) + P('STK: {So_Tai_Khoan_Don_Vi}', `${s}; margin-top:4pt`) + P(I('Cảm ơn quý khách!'), `${center}; ${s}; margin-top:6pt`);
  } }],
  phieu_thu: [{ id: 'k80', name: 'Phiếu thu giấy cuộn K80', paper: 'K80', orient: 'portrait', margin: ROLL, html: () => {
    const s = 'font-size:8.5pt';
    return P(B('{Ten_Don_Vi}'), `${center}; font-size:10pt`) + P('{Dia_Chi_Don_Vi}', `${center}; ${s}`)
      + P(`<span style="font-size:13pt">${B('{Tieu_De_Phieu}')}</span>`, `${center}; margin-top:6pt`) + P('Số: {So_Chung_Tu} · {Ngay_Chung_Tu}', `${center}; ${s}; margin-bottom:6pt`)
      + P('Họ tên: {Nguoi_Nop_Tien}', s) + P('Địa chỉ: {Dia_Chi_Nguoi_Nop}', s) + P('{Nhan_Ly_Do}: {Ly_Do}', s)
      + P(B('Số tiền: {So_Tien}'), `${s}; margin-top:4pt`) + P(I('({So_Tien_Bang_Chu})'), s) + P('{Trang_Thai_Phieu}', s)
      + sign([{ title: 'Người nộp tiền', name: '{Nguoi_Nop_Tien}' }, { title: 'Người lập phiếu' }], { size: 8.5, space: 3, mt: 8 });
  } }],
};
export function suggestedTemplates(type) { return (SUGGESTED[type] || []).map((t) => ({ ...t, html: t.html(), sep: DOC_TYPES[type].sep })); }

// Mẫu mặc định (id 'default') của một loại chứng từ
export function defaultTemplate(type, ds) {
  const cfg = ds?.types?.[type] || {};
  return { id: 'default', name: `Mẫu ${DOC_TYPES[type].label.toLowerCase()}`, html: BUILDERS[type](ds), paper: 'A4', orient: 'portrait', margin: { ...DEFAULT_MARGIN }, sep: cfg.sep || DOC_TYPES[type].sep, builtin: true };
}
// Danh sách mẫu của một loại: mẫu riêng đã lưu, chưa có thì mẫu mặc định
export function templatesFor(ds, type) {
  const list = (ds?.templates?.[type] || []).filter((t) => t && typeof t.html === 'string');
  return list.length ? list : [defaultTemplate(type, ds)];
}
export function pickTemplate(ds, type, id) {
  const list = templatesFor(ds, type);
  return list.find((t) => t.id === id) || list.find((t) => t.is_default) || list[0];
}

// ---------- Co bảng theo khổ giấy ----------
// Độ rộng nội dung trang (px, 96 dpi)
export function contentWidthPx(tpl) { const m = marginOf(tpl); return (pageSize(tpl).w - m.left - m.right) * 96 / 25.4; }
// Bảng có tổng độ rộng cột cố định lớn hơn chỗ trống (mẫu A4 in trên giấy K80…): thu nhỏ các cột theo tỷ lệ
export function fitTables(html, widthPx) {
  const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let changed = false;
  for (const tbl of d.body.querySelectorAll('table')) {
    const cols = [...tbl.querySelectorAll(':scope > colgroup > col')];
    const ws = cols.map((c) => { const m = String(c.getAttribute('style') || '').match(/(?:^|;)\s*width:\s*([\d.]+)px/); return m ? Number(m[1]) : 0; });
    const flex = ws.filter((w) => !w).length; const fixed = ws.reduce((a, b) => a + b, 0);
    // Bảng lồng trong ô: chỗ trống là ô chứa nó, ước lượng theo bảng ngoài đã co
    const room = tbl.parentElement?.closest('td,th') ? widthPx / 2 : widthPx;
    if (!fixed || fixed + flex * 24 <= room) continue;
    const k = (room - flex * 24) / fixed;
    cols.forEach((c, i) => { if (ws[i]) c.setAttribute('style', String(c.getAttribute('style') || '').replace(/width:\s*[\d.]+px/, `width: ${Math.max(14, Math.floor(ws[i] * k))}px`)); });
    changed = true;
  }
  return changed ? d.body.innerHTML : html;
}

// ---------- Dựng mẫu thành HTML in ----------
const TOKEN_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
const BLOCKS = 'p,h1,h2,h3,h4,li';
const isEmptyVal = (x) => x === undefined || x === null || x === '' || (typeof x === 'object' && !x.h);
function tokensIn(el) { return [...String(el.textContent || '').matchAll(TOKEN_RE)].map((m) => m[1]).filter((k) => ALL_TOKENS[k]); }
// Ẩn phần tử có chứa biến mà mọi biến đều trống (dòng chiết khấu = 0, email trống…)
function hideEmpty(root, get) {
  for (const el of [...root.querySelectorAll('tr'), ...root.querySelectorAll(BLOCKS)]) {
    if (!el.isConnected) continue;
    const ks = tokensIn(el);
    if (ks.length && ks.every((k) => isEmptyVal(get(k)))) {
      // Ô chứa logo trống trong bảng không viền một dòng: bỏ cả cột để chữ không bị đẩy sang phải
      const td = el.tagName !== 'TR' && el.closest('td,th'); const tbl = td && td.closest('table');
      if (td && tbl && tbl.getAttribute('data-border') !== '1' && tbl.rows.length === 1 && !String(td.textContent).replace(TOKEN_RE, '').trim()) {
        const idx = [...td.parentNode.children].indexOf(td); tbl.querySelectorAll('col')[idx]?.remove(); td.remove();
      } else el.remove();
    }
  }
}
// Thay biến trong các nút chữ
function fill(root, get, doc) {
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const texts = []; while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) {
    const s = t.nodeValue; if (!s.includes('{')) continue;
    TOKEN_RE.lastIndex = 0; if (!TOKEN_RE.test(s)) continue;
    const frag = doc.createDocumentFragment(); let i = 0; TOKEN_RE.lastIndex = 0; let m;
    while ((m = TOKEN_RE.exec(s))) {
      if (!ALL_TOKENS[m[1]]) continue;
      if (m.index > i) frag.appendChild(doc.createTextNode(s.slice(i, m.index)));
      const val = get(m[1]);
      if (val && typeof val === 'object' && val.h) {
        const box = doc.createElement('template'); box.innerHTML = val.h;
        // Khối lớn (bảng) đứng một mình trong đoạn: thay luôn đoạn đó
        const block = t.parentNode.closest?.(BLOCKS);
        if (val.block && block && block.textContent.trim() === m[0]) { block.replaceWith(box.content); frag.textContent = ''; i = s.length; break; }
        frag.appendChild(box.content);
      } else if (!isEmptyVal(val)) {
        String(val).split('\n').forEach((part, j) => { if (j) frag.appendChild(doc.createElement('br')); frag.appendChild(doc.createTextNode(part)); });
      }
      i = m.index + m[0].length;
    }
    if (i < s.length) frag.appendChild(doc.createTextNode(s.slice(i)));
    if (t.isConnected) t.replaceWith(frag);
  }
}
// Dọn: thẻ định dạng rỗng và <br> thừa ở cuối đoạn (do biến trống để lại)
function tidy(root) {
  for (const el of [...root.querySelectorAll('strong,em,u,s,span,sub,sup,mark')].reverse()) if (!el.textContent && !el.querySelector('img,br')) el.remove();
  for (const el of root.querySelectorAll(BLOCKS)) {
    let last = el.lastChild;
    while (last && ((last.nodeType === 3 && !last.nodeValue.trim()) || last.nodeName === 'BR') && el.childNodes.length > 1) { const prev = last.previousSibling; last.remove(); last = prev; }
  }
}

// Lọc HTML của mẫu: chỉ giữ thẻ trình bày, bỏ script, sự kiện on…, đường dẫn javascript: (mẫu do chủ sổ soạn nhưng nhân viên cũng mở)
const ALLOWED = new Set('P,BR,STRONG,B,EM,I,U,S,STRIKE,SUB,SUP,SPAN,MARK,A,TABLE,COLGROUP,COL,TBODY,THEAD,TFOOT,TR,TD,TH,IMG,HR,UL,OL,LI,H1,H2,H3,H4,DIV,FONT,BLOCKQUOTE'.split(','));
export function sanitizeInto(root) {
  for (const el of [...root.querySelectorAll('*')]) {
    if (!el.isConnected) continue;
    if (!ALLOWED.has(el.tagName)) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|TEMPLATE|NOSCRIPT|SVG|MATH|FORM|INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) el.remove(); else el.replaceWith(...el.childNodes); continue; }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase(); const v = String(a.value || '').trim();
      if (n.startsWith('on') || n === 'srcset' || n === 'formaction') el.removeAttribute(a.name);
      else if ((n === 'src' || n === 'href') && !(n === 'src' ? /^(data:image\/(png|jpe?g|gif|webp);|https?:)/i : /^(https?:|mailto:|tel:|#)/i).test(v)) el.removeAttribute(a.name);
      else if (n === 'style' && /expression\(|url\(\s*['"]?\s*javascript:/i.test(v)) el.removeAttribute(a.name);
    }
  }
  return root;
}
export function sanitizeHtml(html) {
  const d = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
  return sanitizeInto(d.body).innerHTML;
}

// html: mẫu; vals: { v, items } từ tokenValues(). Dựng trong tài liệu tách rời (DOMParser) nên không chạy mã nào trong mẫu.
export function renderTemplate(html, vals) {
  const doc = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
  const box = sanitizeInto(doc.body);
  const docGet = (k) => vals.v[k];
  // Dòng bảng chứa biến hàng hóa: nhân bản theo từng mặt hàng
  for (const tr of [...box.querySelectorAll('tr')]) {
    const ks = tokensIn(tr);
    if (!ks.some((k) => ITEM_TOKENS.has(k))) continue;
    for (const it of vals.items) {
      const row = tr.cloneNode(true); tr.parentNode.insertBefore(row, tr);
      const get = (k) => (ITEM_TOKENS.has(k) ? it[k] : vals.v[k]);
      hideEmptyIn(row, get); fill(row, get, doc);
    }
    tr.remove();
  }
  // Biến hàng hóa đặt ngoài bảng: lấy dòng đầu tiên
  const get = (k) => (ITEM_TOKENS.has(k) ? vals.items[0]?.[k] ?? '' : docGet(k));
  hideEmpty(box, get); fill(box, get, doc); tidy(box); sanitizeInto(box);
  return box.innerHTML;
}
// Trong một dòng hàng: chỉ ẩn các đoạn (ghi chú dòng trống), không ẩn cả dòng
function hideEmptyIn(row, get) {
  for (const el of row.querySelectorAll(BLOCKS)) { const ks = tokensIn(el); if (ks.length && ks.every((k) => isEmptyVal(get(k)))) el.innerHTML = ''; }
}

// Kiểm tra tên biến lạ trong mẫu (gõ sai tên) — trả về danh sách tên không có trong danh mục
export function unknownTokens(html) {
  const txt = String(html || '').replace(/<[^>]+>/g, ' ');
  return [...new Set([...txt.matchAll(TOKEN_RE)].map((m) => m[1]).filter((k) => !ALL_TOKENS[k]))];
}

// ---------- Chứng từ in hoàn chỉnh ----------
const FILE_PREFIX = { hoa_don: 'hoa-don', don_dat_hang: 'don-dat-hang', bien_ban: 'bien-ban-ban-giao', phieu_xuat_kho: 'phieu-xuat-kho', hd_van_chuyen: 'hop-dong-van-chuyen',
  de_nghi_tam_ung: 'de-nghi-tam-ung', de_nghi_tt: 'de-nghi-thanh-toan', doi_chieu_sl: 'doi-chieu-so-luong', doi_chieu_tt: 'doi-chieu-cong-no', bao_gia: 'bao-gia' };
// Dựng chứng từ theo mẫu: { html, font, paper, orient, margin, filename, title, code, tplId }
export function buildPrintDoc(type, data, ds, info, tplId) {
  const tpl = pickTemplate(ds, type, tplId);
  const sep = tpl.sep === '.' || tpl.sep === ',' ? tpl.sep : (ds.types[type]?.sep || DOC_TYPES[type].sep);
  const vals = tokenValues(type, data, ds, info, sep);
  const code = String(vals.v.So_Chung_Tu || '');
  const thu = data.kind === 'payment' && data.p.direction !== 'chi';
  const title = type === 'phieu_thu' ? (thu ? 'Phiếu thu' : 'Phiếu chi') : DOC_TYPES[type].label;
  const prefix = type === 'phieu_thu' ? (thu ? 'phieu-thu' : 'phieu-chi') : FILE_PREFIX[type];
  return { html: fitTables(renderTemplate(tpl.html, vals), contentWidthPx(tpl)), font: ds.font || 'Arimo', paper: tpl.paper || 'A4', orient: tpl.orient || 'portrait', margin: marginOf(tpl),
    filename: `${prefix}_${code.replace(/[\/:*?"<>|]+/g, '-')}.pdf`, title, code, tplId: tpl.id, due: vals.due };
}
