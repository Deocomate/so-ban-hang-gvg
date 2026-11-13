// Biến dùng trong mẫu in: viết {Ten_Bien} trong mẫu, khi in được thay bằng dữ liệu của chứng từ.
// Biến nhóm "Hàng hóa" là biến theo dòng: dòng bảng nào chứa biến này sẽ được lặp lại cho từng mặt hàng.
// Giá trị là chuỗi (in nguyên văn) hoặc { h: '<html>' } (đoạn HTML dựng sẵn: logo, bảng đối chiếu…);
// { h, block: true } là khối lớn (bảng) — đặt riêng một dòng trong mẫu thì thay luôn cả dòng đó.
import { fmtNum, phoneFmt, dateLine, moneyWords, profileFor, goodsLines, packLabel, totalKg, fmtKg, weightPerUnit, DEFAULT_TEXTS, runsOf, PER_DELIVERY } from './model.js';

const T = (k, label, desc) => ({ k, label, desc: desc || label });

// Nhóm biến (theo thứ tự hiện trong bảng "Chèn thông tin")
export const TOKEN_GROUPS = [
  { id: 'don_vi', label: 'Đơn vị phát hành', icon: 'store', tokens: [
    T('Logo_Don_Vi', 'Logo đơn vị', 'Ảnh logo của đơn vị phát hành (Cài đặt → Mẫu in → Đơn vị phát hành)'),
    T('Ten_Don_Vi', 'Tên đơn vị', 'Tên in đầu trang (in hoa)'), T('Ten_Phap_Ly', 'Tên pháp lý', 'Tên dùng trong nội dung, ví dụ "Hộ kinh doanh Gốm sứ Mai Hiếu"'),
    T('Ten_Phap_Ly_In_Hoa', 'Tên pháp lý in hoa'), T('Dia_Chi_Don_Vi', 'Địa chỉ đơn vị'), T('Dien_Thoai_Don_Vi', 'Điện thoại đơn vị'),
    T('Email_Don_Vi', 'Email đơn vị'), T('Website_Don_Vi', 'Website đơn vị'), T('Lien_He_Don_Vi', 'Liên hệ gọn', '"ĐT: … - Email: …" trên một dòng'),
    T('Ma_So_Thue_Don_Vi', 'Mã số thuế đơn vị'), T('So_Tai_Khoan_Don_Vi', 'Số tài khoản', 'Dòng số tài khoản ngân hàng của đơn vị'),
    T('Nguoi_Dai_Dien', 'Người đại diện'), T('Chuc_Danh_Dai_Dien', 'Chức danh người đại diện'), T('Chuc_Danh_Dai_Dien_In_Hoa', 'Chức danh đại diện in hoa'),
    T('Ma_Don_Vi_Ngan', 'Ký hiệu đơn vị', 'TH hoặc HKD — dùng trong số đối chiếu'),
  ] },
  { id: 'chung_tu', label: 'Chứng từ', icon: 'quote', tokens: [
    T('Ngay_Thang_Nam', 'Ngày tháng năm', '"Ngày 25 tháng 12 năm 2026"'), T('Ngay_Thang_Nam_Thuong', 'ngày tháng năm (chữ thường)', '"ngày 25 tháng 12 năm 2026"'),
    T('Ngay', 'Ngày'), T('Thang', 'Tháng'), T('Nam', 'Năm'), T('Ngay_Chung_Tu', 'Ngày (dd/mm/yyyy)'),
    T('So_Chung_Tu', 'Số chứng từ', 'Mã phiếu giao, mã đơn, mã phiếu thu… tùy chứng từ'), T('Ma_Don_Hang', 'Mã đơn hàng'), T('Ma_Phieu_Giao', 'Mã phiếu giao'),
    T('Ghi_Chu', 'Ghi chú đơn'), T('Thoi_Gian_In', 'Thời gian in'),
  ] },
  { id: 'khach_hang', label: 'Khách hàng', icon: 'users', tokens: [
    T('Khach_Hang', 'Khách hàng', 'Tên khách hàng'), T('Khach_Hang_In_Hoa', 'Khách hàng in hoa'), T('Khach_Hang_Kem_SDT', 'Khách hàng kèm SĐT', '"Anh Hòa - 0987.654.321"'),
    T('Ma_Khach_Hang', 'Mã khách hàng'), T('So_Dien_Thoai', 'Số điện thoại khách'), T('Dia_Chi_Khach_Hang', 'Địa chỉ khách hàng'),
    T('Cong_No_Hien_Tai', 'Công nợ hiện tại', 'Dư nợ hiện tại của khách'),
  ] },
  { id: 'giao_nhan', label: 'Giao nhận', icon: 'truck', tokens: [
    T('Dia_Chi_Nhan_Hang', 'Địa chỉ nhận hàng'), T('SDT_Nhan_Hang', 'SĐT nhận hàng'), T('Nguoi_Nhan_Hang', 'Người nhận hàng'),
    T('SDT_Kem_Nguoi_Nhan', 'SĐT kèm người nhận', '"0987.654.321 - Anh Hòa"'), T('Nguoi_Nhan_Kem_SDT', 'Người nhận kèm SĐT', '"Anh Hòa - 0987.654.321"'),
    T('Ben_Nhan_Hang', 'Bên nhận hàng'), T('Ben_Nhan_Hang_In_Hoa', 'Bên nhận hàng in hoa'), T('Noi_Lap', 'Nơi lập / kho xuất'),
    T('Dai_Dien_Ben_Giao', 'Đại diện bên giao'), T('Lai_Xe', 'Lái xe'), T('Lai_Xe_In_Hoa', 'Lái xe in hoa'), T('SDT_Lai_Xe', 'SĐT lái xe'),
    T('Ben_Van_Chuyen', 'Bên vận chuyển', '"Tên lái xe - SĐT" (in hoa), trống thì in dấu chấm'), T('CCCD_Lai_Xe', 'CCCD lái xe'), T('Bien_So_Xe', 'Biển số xe'),
    T('Ben_B_Van_Chuyen', 'Bên B (chủ xe) in hoa'), T('Dia_Chi_Ben_B', 'Địa chỉ bên B'), T('Tinh_Trang_Hang', 'Tình trạng hàng hóa'),
    T('So_Ngay_Van_Chuyen', 'Số ngày vận chuyển tối đa'), T('Can_Nang_Gia_Cuoc', 'Cân nặng và giá cước'), T('Thanh_Toan_Cuoc_Tai', 'Thanh toán cước phí tại'),
    T('Ly_Do_Xuat', 'Lý do xuất kho'), T('Chung_Tu_Kem_Theo', 'Số chứng từ gốc kèm theo'),
  ] },
  { id: 'hang_hoa', label: 'Hàng hóa (từng dòng)', icon: 'box', item: true, tokens: [
    T('STT', 'STT', 'Số thứ tự dòng hàng'), T('Ma_Hang', 'Mã hàng'), T('Ten_Hang', 'Tên hàng'), T('Ghi_Chu_Hang', 'Ghi chú dòng hàng'),
    T('Quy_Cach', 'Quy cách đóng gói', '"4 hộp x 140 viên + 40 viên"'), T('Quy_Cach_Ghi_Chu', 'Quy cách + ghi chú', 'Quy cách và ghi chú dòng hàng, mỗi ý một dòng'),
    T('So_Luong', 'Số lượng'), T('Don_Vi_Tinh', 'Đơn vị tính'), T('Don_Vi_Tinh_Thuong', 'Đơn vị tính (chữ thường)'),
    T('Don_Gia', 'Đơn giá', 'Đơn giá sau chiết khấu dòng'), T('Thanh_Tien', 'Thành tiền'), T('So_Hop', 'Số hộp của dòng'),
    T('Kg_Moi_Hop', 'Kg mỗi hộp'), T('Trong_Luong', 'Trọng lượng dòng (kg)'),
  ] },
  { id: 'tong', label: 'Tổng & thanh toán', icon: 'cash', tokens: [
    T('Tong_So_Luong', 'Tổng số lượng'), T('Tong_So_Hop', 'Tổng số hộp'), T('Don_Vi_Dong_Goi', 'Đơn vị đóng gói', '"hộp", "thùng" hoặc "kiện"'),
    T('Tong_Trong_Luong', 'Tổng trọng lượng', '"1,234.5 kg" (trống nếu chưa khai)'), T('Tong_Trong_Luong_So', 'Tổng trọng lượng (số)'),
    T('Ghi_Chu_Trong_Luong', 'Ghi chú trọng lượng', '"(chưa gồm 2 mặt hàng chưa khai trọng lượng)"'),
    T('Tong_Trong_Luong_Kem', 'Kèm tổng trọng lượng', '" · Tổng trọng lượng: … kg" — dùng nối sau dòng tổng'),
    T('Tong_Tien_Hang', 'Tổng tiền hàng'), T('Tong_Tien_Hang_Bang_Chu', 'Tổng tiền hàng bằng chữ'),
    T('Chiet_Khau', 'Chiết khấu', 'Trống khi không chiết khấu (dòng tự ẩn)'), T('No_Cu', 'Nợ cũ'),
    T('Ten_VAT', 'Tên VAT', '"VAT 8%" — trống khi không có VAT'), T('Tien_VAT', 'Tiền VAT', 'Trống khi không có VAT (dòng tự ẩn)'),
    T('Phi_Van_Chuyen', 'Tiền vận chuyển'), T('Hang_Tra_Lai', 'Hàng trả lại', 'Trống khi không trả hàng (dòng tự ẩn)'),
    T('Tong_Thanh_Toan', 'Tổng thanh toán'), T('Nhan_Da_Thanh_Toan', 'Nhãn đã thanh toán', '"Đã thanh toán" hoặc "Khấu trừ tiền cọc"'), T('Da_Thanh_Toan', 'Đã thanh toán / đặt cọc'),
    T('Con_Thanh_Toan', 'Còn thanh toán'), T('Con_Thanh_Toan_Bang_Chu', 'Còn thanh toán bằng chữ'),
  ] },
  { id: 'phieu', label: 'Phiếu thu / chi', icon: 'receipt', tokens: [
    T('Tieu_De_Phieu', 'Tiêu đề phiếu', '"PHIẾU THU" hoặc "PHIẾU CHI"'), T('Mau_So_Phieu', 'Mẫu số phiếu', 'Dòng "Mẫu số 01 - TT…" theo phiếu thu / chi'),
    T('Nhan_Nguoi_Nop', 'Nhãn người nộp', '"người nộp tiền" / "người nhận tiền"'), T('Nhan_Nguoi_Nop_In_Hoa', 'Nhãn người nộp in hoa'),
    T('Nhan_Ly_Do', 'Nhãn lý do', '"Lý do nộp" / "Lý do chi"'), T('Nguoi_Nop_Tien', 'Họ tên người nộp / nhận'), T('Dia_Chi_Nguoi_Nop', 'Địa chỉ người nộp / nhận'),
    T('Ly_Do', 'Lý do'), T('So_Tien', 'Số tiền'), T('So_Tien_Bang_Chu', 'Số tiền bằng chữ'), T('Kem_Theo', 'Kèm theo'), T('Trang_Thai_Phieu', 'Dấu "PHIẾU ĐÃ HỦY"', 'Chỉ hiện khi phiếu đã hủy'),
  ] },
  { id: 'hop_dong', label: 'Hợp đồng', icon: 'contract', tokens: [
    T('So_Hop_Dong', 'Số hợp đồng'), T('Ngay_Ky_Hop_Dong', 'Ngày ký hợp đồng'), T('Tong_Gia_Tri_Hop_Dong', 'Tổng giá trị hợp đồng'),
    T('So_Tien_Tam_Ung', 'Số tiền đề nghị tạm ứng'), T('Noi_Dung_Tam_Ung', 'Nội dung tạm ứng', '" (30% giá trị hợp đồng)" nếu có ghi chú'),
    T('Gia_Tri_Da_Giao', 'Tổng giá trị hàng đã giao'), T('Da_Tam_Ung', 'Đã tạm ứng / thanh toán'), T('Con_Lai_Can_TT', 'Còn lại cần thanh toán'),
    T('So_Tien_De_Nghi_Bang_Chu', 'Số tiền đề nghị bằng chữ'),
    T('Bang_Doi_Chieu_So_Luong', 'Bảng đối chiếu số lượng', 'Bảng dựng sẵn: mỗi ngày giao một hàng, mỗi mặt hàng một cột'),
    T('Bang_Doi_Chieu_Cong_No', 'Bảng đối chiếu công nợ', 'Bảng dựng sẵn: từng đợt giao, VAT, đã thanh toán, còn phải thanh toán'),
    T('Con_No_Doi_Chieu_Bang_Chu', 'Còn nợ đối chiếu bằng chữ'),
  ] },
  { id: 'bao_gia', label: 'Báo giá', icon: 'quote', tokens: [
    T('Ma_Bao_Gia', 'Mã báo giá'), T('Kinh_Gui', 'Kính gửi (khách)'), T('Dia_Chi_Bao_Gia', 'Địa chỉ khách'), T('Dia_Diem_Cong_Trinh', 'Địa điểm công trình'),
    T('Bang_Bao_Gia', 'Bảng báo giá', 'Bảng dựng sẵn: nhóm hàng, hình ảnh, định mức, tổng tiền'), T('Luu_Y_Bao_Gia', 'Lưu ý báo giá', 'Mục "LƯU Ý" của báo giá'),
    T('Tong_Thanh_Toan_Bao_Gia', 'Tổng thanh toán báo giá'),
  ] },
];

// Nhóm biến dùng được cho từng loại chứng từ
const GOODS = ['don_vi', 'chung_tu', 'khach_hang', 'giao_nhan', 'hang_hoa', 'tong'];
export const GROUPS_FOR = {
  hoa_don: GOODS, don_dat_hang: GOODS, bien_ban: GOODS, phieu_xuat_kho: GOODS, hd_van_chuyen: GOODS,
  phieu_thu: ['don_vi', 'chung_tu', 'phieu'],
  de_nghi_tam_ung: ['don_vi', 'chung_tu', 'khach_hang', 'hop_dong'], de_nghi_tt: ['don_vi', 'chung_tu', 'khach_hang', 'hop_dong'],
  doi_chieu_sl: ['don_vi', 'chung_tu', 'khach_hang', 'hop_dong'], doi_chieu_tt: ['don_vi', 'chung_tu', 'khach_hang', 'hop_dong', 'tong'],
  bao_gia: ['don_vi', 'chung_tu', 'bao_gia'],
};

export const ALL_TOKENS = Object.fromEntries(TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => [t.k, { ...t, group: g.id, item: !!g.item }])));
export const ITEM_TOKENS = new Set(TOKEN_GROUPS.filter((g) => g.item).flatMap((g) => g.tokens.map((t) => t.k)));
export const groupsFor = (type) => (GROUPS_FOR[type] || GOODS).map((id) => TOKEN_GROUPS.find((g) => g.id === id));

// ---------- Dựng giá trị ----------
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dmy = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return y ? `${d}/${m}/${y}` : ''; };
const upper = (s) => String(s || '').toUpperCase();
const nowText = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
// Văn bản nhiều dòng có **đậm** → HTML
export const richText = (txt) => String(txt || '').split('\n').map((ln) => runsOf(ln).map((r) => (r.b ? `<strong>${esc(r.text)}</strong>` : esc(r.text))).join('')).join('<br>');
// Bảng dựng sẵn (cùng kiểu bảng có viền của mẫu)
function htmlTable(head, rows, widthsPt, size) {
  const col = widthsPt.map((w) => (w === '*' ? '<col>' : `<col style="width:${Math.round(w * 4 / 3)}px">`)).join('');
  const cell = (c) => {
    if (!c) return '';
    const st = [c.align && `text-align:${c.align}`].filter(Boolean).join(';');
    const inner = c.h ?? (c.b ? `<strong>${esc(c.text)}</strong>` : esc(c.text));
    const sub = c.sub ? `<br><em>${esc(c.sub).replace(/\n/g, '<br>')}</em>` : '';
    return `<td${c.colSpan ? ` colspan="${c.colSpan}"` : ''}${st ? ` style="${st}"` : ''}><p>${inner}${sub}</p></td>`;
  };
  const tr = (r) => `<tr>${r.filter((c) => c !== null).map(cell).join('')}</tr>`;
  return `<table data-border="1" style="font-size:${size}pt"><colgroup>${col}</colgroup><tbody>${tr(head.map((h) => ({ text: h, b: true, align: 'center' })))}${rows.map(tr).join('')}</tbody></table>`;
}

function docDate(type, data, info) {
  if (data.kind === 'payment') return info.doc_date;
  if (data.kind === 'quote') return data.q.quote_date;
  return info[`date_${type}`];
}

// type: loại chứng từ; data: loadDocData(); ds: docSettings(); info: thông tin đã gộp (mặc định + đã lưu + đang sửa); sep: dấu phân cách nghìn
export function tokenValues(type, data, ds, info, sep = ',') {
  const N = (v) => fmtNum(v, sep);
  const prof = profileFor(ds, type, info);
  const v = {};
  const legal = prof.legal_name || prof.name || '';
  Object.assign(v, {
    Logo_Don_Vi: prof.logo && /^data:image\//.test(prof.logo) ? { h: `<img src="${prof.logo}" style="width:128px">` } : '',
    Ten_Don_Vi: prof.name || '', Ten_Phap_Ly: legal, Ten_Phap_Ly_In_Hoa: upper(legal), Dia_Chi_Don_Vi: prof.address || '', Dien_Thoai_Don_Vi: prof.phone || '',
    Email_Don_Vi: prof.email || '', Website_Don_Vi: prof.website || '', Ma_So_Thue_Don_Vi: prof.tax_code || '', So_Tai_Khoan_Don_Vi: prof.bank_line || '',
    Lien_He_Don_Vi: [prof.phone && `ĐT: ${prof.phone}`, prof.email && `Email: ${prof.email}`].filter(Boolean).join(' - '),
    Nguoi_Dai_Dien: prof.representative || '', Chuc_Danh_Dai_Dien: prof.rep_title || 'Người đại diện', Chuc_Danh_Dai_Dien_In_Hoa: upper(prof.rep_title || 'Người đại diện'),
    Ma_Don_Vi_Ngan: String(legal.split(/\s+/).pop()).slice(0, 2).toUpperCase() === 'HẢ' ? 'TH' : 'HKD',
  });
  const dt = docDate(type, data, info); const [y, m, d] = String(dt || '').slice(0, 10).split('-');
  Object.assign(v, { Ngay_Thang_Nam: dateLine(dt), Ngay_Thang_Nam_Thuong: dateLine(dt, false), Ngay: d || '.....', Thang: m || '.....', Nam: y || '.........', Ngay_Chung_Tu: dmy(dt), Thoi_Gian_In: nowText() });

  const items = [];
  if (data.kind === 'payment') {
    const p = data.p; const thu = p.direction !== 'chi';
    const form = (ds.types.phieu_thu.text || {})[thu ? 'form_thu' : 'form_chi'] ?? DEFAULT_TEXTS[thu ? 'form_thu' : 'form_chi'];
    Object.assign(v, {
      So_Chung_Tu: p.code, Tieu_De_Phieu: thu ? 'PHIẾU THU' : 'PHIẾU CHI',
      Mau_So_Phieu: { h: String(form || '').split('\n').map((t, i) => (i === 0 ? `<strong>${esc(t)}</strong>` : `<em>${esc(t)}</em>`)).join('<br>') },
      Nhan_Nguoi_Nop: thu ? 'người nộp tiền' : 'người nhận tiền', Nhan_Nguoi_Nop_In_Hoa: thu ? 'NGƯỜI NỘP TIỀN' : 'NGƯỜI NHẬN TIỀN', Nhan_Ly_Do: thu ? 'Lý do nộp' : 'Lý do chi',
      Nguoi_Nop_Tien: info.payer_name || '', Dia_Chi_Nguoi_Nop: info.payer_address || '', Ly_Do: info.reason || '', So_Tien: `${N(p.amount)} đồng`, So_Tien_Bang_Chu: moneyWords(p.amount),
      Kem_Theo: info.attach || '......', Trang_Thai_Phieu: p.voided ? { h: '<span style="color:#b3261e"><strong>PHIẾU ĐÃ HỦY</strong></span>' } : '',
    });
    return { v, items };
  }
  if (data.kind === 'quote') {
    const q = data.q;
    Object.assign(v, { So_Chung_Tu: q.code, Ma_Bao_Gia: q.code, Kinh_Gui: q.customer_name || '', Dia_Chi_Bao_Gia: q.address || '', Dia_Diem_Cong_Trinh: q.site || '',
      Bang_Bao_Gia: { h: quoteTable(q, N), block: true }, Luu_Y_Bao_Gia: String(q.body?.terms || '').trim() ? { h: quoteTerms(q.body.terms), block: true } : '',
      Tong_Thanh_Toan_Bao_Gia: N(q.body?.total) });
    return { v, items };
  }

  const o = data.o; const c = data.cust || {};
  Object.assign(v, {
    So_Chung_Tu: data.d ? data.d.code : o.code, Ma_Don_Hang: o.code, Ma_Phieu_Giao: data.d?.code || '', Ghi_Chu: info.note || '',
    Khach_Hang: o.customer_name || '', Khach_Hang_In_Hoa: upper(o.customer_name), Khach_Hang_Kem_SDT: `${o.customer_name || ''}${o.customer_phone ? ' - ' + phoneFmt(o.customer_phone) : ''}`,
    Ma_Khach_Hang: c.code || '', So_Dien_Thoai: phoneFmt(o.customer_phone), Dia_Chi_Khach_Hang: c.address || o.customer_address || '',
    Cong_No_Hien_Tai: c.balance !== undefined && c.balance !== null ? N(c.balance) : '',
  });

  if (data.kind === 'contract') {
    const k = data.k; const remain = Math.max(Number(o.delivered_value) - Number(o.paid_net), 0); const isAdv = type === 'de_nghi_tam_ung';
    Object.assign(v, {
      So_Hop_Dong: k.code, So_Chung_Tu: k.code, Ngay_Ky_Hop_Dong: dmy(k.sign_date), Tong_Gia_Tri_Hop_Dong: N(o.order_total), So_Tien_Tam_Ung: N(k.advance_amount),
      Noi_Dung_Tam_Ung: k.advance_note ? ` (${k.advance_note})` : '', Gia_Tri_Da_Giao: N(o.delivered_value), Da_Tam_Ung: N(o.paid_net), Con_Lai_Can_TT: N(remain),
      So_Tien_De_Nghi_Bang_Chu: moneyWords(isAdv ? k.advance_amount : remain),
    });
    if (type === 'doi_chieu_sl') v.Bang_Doi_Chieu_So_Luong = { h: qtyTable(data.allDl || [], N), block: true };
    if (type === 'doi_chieu_tt') { const t = payTable(data, N); v.Bang_Doi_Chieu_Cong_No = { h: t.html, block: true }; v.Con_No_Doi_Chieu_Bang_Chu = moneyWords(t.due); }
    return { v, items };
  }

  // Đơn hàng / phiếu giao: hóa đơn, đơn đặt hàng, biên bản, phiếu xuất kho, hợp đồng vận chuyển
  const g = goodsLines(type, data);
  g.forEach((l, i) => {
    const p = data.prods[l.product_id] || {}; const per = weightPerUnit(p) * (Number(p.units_per_pack) || 0);
    items.push({ STT: String(i + 1), Ma_Hang: l.sku || '', Ten_Hang: l.name || '', Ghi_Chu_Hang: l.note || '', Quy_Cach: l.pack || '', Quy_Cach_Ghi_Chu: l.sub || '',
      So_Luong: N(l.qty), Don_Vi_Tinh: l.unit || '', Don_Vi_Tinh_Thuong: String(l.unit || '').toLowerCase(), Don_Gia: N(l.price), Thanh_Tien: N(l.total),
      So_Hop: l.boxes ? N(l.boxes) : '', Kg_Moi_Hop: per ? N(Math.round(per * 10) / 10) : '', Trong_Luong: l.kg ? N(Math.round(l.kg * 10) / 10) : '' });
  });
  const tk = totalKg(g); const phone = info.recv_phone || o.customer_phone;
  Object.assign(v, {
    Dia_Chi_Nhan_Hang: info.recv_address || o.customer_address || '', SDT_Nhan_Hang: phone || '', Nguoi_Nhan_Hang: info.recv_name || '',
    SDT_Kem_Nguoi_Nhan: [info.recv_phone && phoneFmt(info.recv_phone), info.recv_name].filter(Boolean).join(' - '),
    Nguoi_Nhan_Kem_SDT: [info.recv_name, info.recv_phone && phoneFmt(info.recv_phone)].filter(Boolean).join(' - '),
    Ben_Nhan_Hang: info.recv_party || o.customer_name || '', Ben_Nhan_Hang_In_Hoa: upper(info.recv_party || o.customer_name), Noi_Lap: info.place || '',
    Dai_Dien_Ben_Giao: info.handover_rep || (type === 'hd_van_chuyen' ? prof.representative || '' : ''), Lai_Xe: info.driver_name || '', Lai_Xe_In_Hoa: upper(info.driver_name), SDT_Lai_Xe: phoneFmt(info.driver_phone),
    Ben_Van_Chuyen: upper([info.driver_name, info.driver_phone && phoneFmt(info.driver_phone)].filter(Boolean).join(' - ')) || '..............................................',
    CCCD_Lai_Xe: info.id_no || '', Bien_So_Xe: info.vehicle || '', Ben_B_Van_Chuyen: upper(info.carrier_party || info.driver_name), Dia_Chi_Ben_B: info.carrier_address || '',
    Tinh_Trang_Hang: info.goods_condition || '', So_Ngay_Van_Chuyen: info.transit_days || '04', Can_Nang_Gia_Cuoc: info.freight_note || 'tính theo từng khách hàng',
    Thanh_Toan_Cuoc_Tai: info.pay_at || 'khách nhận hàng', Chung_Tu_Kem_Theo: info.attach || '',
    Ly_Do_Xuat: `Xuất bán theo đơn hàng ${o.code}${data.d ? `, phiếu giao ${data.d.code}` : ''}`,
    Tong_So_Luong: N(g.reduce((s, l) => s + l.qty, 0)), Tong_So_Hop: info.box_total || '0',
    Don_Vi_Dong_Goi: type === 'hd_van_chuyen' ? (g.find((l) => l.packUnit)?.packUnit || 'hộp') : packLabel(g),
    Tong_Trong_Luong: tk.kg > 0 ? fmtKg(tk.kg, sep) : '', Tong_Trong_Luong_So: N(Math.round(tk.kg * 10) / 10),
    Ghi_Chu_Trong_Luong: tk.kg > 0 && tk.missing ? ` (chưa gồm ${tk.missing} mặt hàng chưa khai trọng lượng)` : '',
    Tong_Trong_Luong_Kem: tk.kg > 0 ? ` · Tổng trọng lượng: ${fmtKg(tk.kg, sep)}${tk.missing ? ` (chưa gồm ${tk.missing} mặt hàng chưa khai)` : ''}` : '',
  });
  const goods = g.reduce((s, l) => s + l.total, 0);
  const isInv = type === 'hoa_don'; const perDel = PER_DELIVERY.includes(type) && !!data.d;
  const vat = perDel ? Number(data.d.vat || 0) : Number(o.vat_total || 0);
  const ship = perDel ? Number(data.d.shipping_fee || 0) : Math.max(0, Number(o.order_total || 0) - Number(o.goods_total || 0) - vat);
  const disc = perDel ? 0 : Math.max(0, goods - Number(o.goods_total || 0));
  const ret = perDel ? 0 : Number(o.returned_value || 0);
  const paid = perDel ? Number(data.d.deposit_used || 0) : Number(o.paid_net || 0);
  const old = isInv ? Number(info.old_debt || 0) : 0;
  const total = goods - disc + old + ship + vat - ret; const due = total - paid;
  Object.assign(v, {
    Tong_Tien_Hang: N(goods), Tong_Tien_Hang_Bang_Chu: moneyWords(goods), Chiet_Khau: disc > 0 ? N(-disc) : '', No_Cu: N(old),
    Ten_VAT: Number(o.vat_rate) > 0 ? `VAT ${fmtNum(o.vat_rate)}%` : '', Tien_VAT: Number(o.vat_rate) > 0 ? N(vat) : '', Phi_Van_Chuyen: N(ship),
    Hang_Tra_Lai: ret > 0 ? N(-ret) : '', Tong_Thanh_Toan: N(total), Nhan_Da_Thanh_Toan: perDel ? 'Khấu trừ tiền cọc' : 'Đã thanh toán', Da_Thanh_Toan: N(paid),
    Con_Thanh_Toan: N(due), Con_Thanh_Toan_Bang_Chu: moneyWords(due),
  });
  return { v, items, due };
}

// ---------- Bảng dựng sẵn ----------
function qtyTable(rows, N) {
  const prods = [...new Map(rows.map((r) => [r.product_id, r.product_name])).entries()];
  const days = [...new Set(rows.map((r) => r.delivery_date))].sort();
  const qty = (day, pid) => rows.filter((r) => r.delivery_date === day && r.product_id === pid).reduce((s, r) => s + Number(r.qty), 0);
  const body = days.map((day) => [{ text: dmy(day), align: 'center' }, ...prods.map(([pid]) => ({ text: qty(day, pid) ? N(qty(day, pid)) : '', align: 'center' }))]);
  body.push([{ text: 'Tổng giao hàng', b: true }, ...prods.map(([pid]) => ({ text: N(rows.filter((r) => r.product_id === pid).reduce((s, r) => s + Number(r.qty), 0)), align: 'center', b: true }))]);
  return htmlTable(['Ngày', ...prods.map(([, n]) => n)], body, [80, ...prods.map(() => '*')], 10);
}
function payTable(data, N) {
  const o = data.o; const rows = data.allDl || [];
  const codes = [...new Set(rows.map((r) => r.delivery_code))];
  const body = []; let goods = 0;
  codes.forEach((dc, i) => {
    const ls = rows.filter((r) => r.delivery_code === dc); const sum = ls.reduce((s, r) => s + Number(r.revenue), 0); goods += sum;
    ls.forEach((l, j) => body.push([{ text: j ? '' : String(i + 1), align: 'center' }, { text: j ? '' : dmy(l.delivery_date), align: 'center' }, { text: l.product_name }, { text: N(l.qty), align: 'right' },
      { text: l.unit, align: 'center' }, { text: N(l.unit_price_net), align: 'right' }, { text: N(l.revenue), align: 'right' }, { text: j ? '' : N(sum), align: 'right', b: true }]));
  });
  const row = (label, val, b) => [{ text: label, colSpan: 7, align: 'right', b }, null, null, null, null, null, null, { text: N(val), align: 'right', b }];
  const vat = Number(o.vat_net) || 0; const ship = Number(o.ship_billed) || 0; const paid = Number(o.paid_net) || 0;
  const total = goods + vat + ship - (Number(o.returned_value) || 0);
  body.push(row('TỔNG TIỀN', goods, true));
  if (Number(o.vat_rate)) body.push(row(`VAT ${fmtNum(o.vat_rate)}%`, vat));
  if (ship) body.push(row('TIỀN VẬN CHUYỂN', ship));
  if (Number(o.returned_value)) body.push(row('HÀNG TRẢ LẠI', -o.returned_value));
  body.push(row('TỔNG THANH TOÁN (1)', total, true));
  body.push(row('ĐÃ THANH TOÁN (2)', paid));
  body.push(row('CÒN THANH TOÁN (3) = (1) - (2)', total - paid, true));
  return { html: htmlTable(['STT', 'Ngày giao', 'Tên hàng', 'Số lượng', 'ĐVT', 'Đơn giá', 'Số tiền', 'Tổng'], body, [24, 56, '*', 44, 30, 50, 66, 66], 9), due: total - paid };
}
function quoteTable(q, N) {
  const b = q.body || { groups: [] }; const mosaic = q.template === 'mosaic'; const showNorm = !mosaic && b.show_norm;
  const head = ['STT', 'Tên sản phẩm', 'Quy cách', 'Hình ảnh', 'Khối lượng', ...(showNorm ? ['Định mức'] : []), ...(mosaic ? [] : ['Số lượng']), 'ĐVT', mosaic ? 'Giá bán' : 'Đơn giá', 'Thành tiền'];
  const widths = [22, '*', 78, 44, 46, ...(showNorm ? [36] : []), ...(mosaic ? [] : [44]), 26, 52, 62];
  const n = head.length; const multi = b.groups.filter((g) => g.lines.length).length > 1 || b.groups[0]?.name;
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']; const rows = [];
  b.groups.forEach((g, gi) => {
    if (multi) {
      const sum = g.lines.reduce((s, l) => s + l.amount, 0);
      rows.push([{ text: roman[gi] || String(gi + 1), align: 'center', b: true }, { text: g.name || '', sub: g.note || undefined, colSpan: n - 2, b: true }, { text: N(sum), align: 'right', b: true }]);
    }
    g.lines.forEach((l, i) => rows.push([{ text: String(i + 1), align: 'center' }, { text: l.name, sub: l.note || undefined }, { text: l.spec || '' },
      l.image && /^data:image\//.test(l.image) ? { h: `<img src="${l.image}" style="width:50px">`, align: 'center' } : { text: '' },
      { text: l.measure ? `${N(l.measure)} ${l.measure_unit || ''}` : (mosaic ? N(l.qty) : ''), align: 'center' }, ...(showNorm ? [{ text: l.norm ? N(l.norm) : '', align: 'center' }] : []),
      ...(mosaic ? [] : [{ text: N(l.qty), align: 'right' }]), { text: l.unit || '', align: 'center' }, { text: N(l.price), align: 'right' }, { text: N(l.amount), align: 'right' }]));
  });
  const total = (label, val, bold) => [{ text: label, colSpan: n - 1, align: 'right', b: bold }, { text: N(val), align: 'right', b: bold }];
  if (b.ship?.amount) rows.push(total(`Vận chuyển (${N(b.ship.qty)} ${b.ship.unit} × ${N(b.ship.price)})`, b.ship.amount));
  rows.push(total('Tổng tiền', b.goods + (b.ship?.amount || 0), true));
  if (b.vat_mode === 'them') rows.push(total(`VAT ${fmtNum(b.vat_rate)}%`, b.vat));
  rows.push(total('Tổng thanh toán', b.total, true));
  return htmlTable(head, rows, widths, 8.5);
}
function quoteTerms(terms) {
  const lines = String(terms).split('\n').map((ln) => `<p style="font-size:9.5pt; line-height:1.25${/^\s/.test(ln) ? '; margin-left:10pt' : ''}">${richText(ln.trim()) || '&nbsp;'}</p>`);
  return `<p style="font-size:10pt; margin-top:8pt; margin-bottom:2pt"><strong>LƯU Ý:</strong></p>${lines.join('')}`;
}

// ---------- Dữ liệu mẫu cho trình sửa mẫu ----------
const SAMPLE_PRODS = {
  p1: { id: 'p1', units_per_pack: 140, pack_unit: 'hộp', unit_weight: 2.1 },
  p2: { id: 'p2', units_per_pack: 100, pack_unit: 'hộp', unit_weight: 1.6 },
  p3: { id: 'p3', units_per_pack: null, pack_unit: 'hộp', unit_weight: null },
};
export function sampleData(type) {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  if (type === 'phieu_thu') return { kind: 'payment', p: { id: 's', code: 'PT000123', direction: 'thu', amount: 13800000, pay_date: today, party_name: 'Anh Hòa', kind_label: 'Thu tiền khách hàng', allocations: [{ doc_code: 'HD000456' }], note: '', voided: false }, party: { address: 'Số 10, Phổ Quang, Tân Bình, TP.HCM' }, info: {} };
  if (type === 'bao_gia') return { kind: 'quote', info: {}, q: { id: 's', code: 'BG000045', customer_name: 'Anh Hòa', address: 'Số 10, Phổ Quang, Tân Bình, TP.HCM', site: 'Biệt thự Thảo Điền, TP Thủ Đức', quote_date: today, template: 'ngoi', profile_id: null,
    body: { groups: [{ name: 'Ngói lợp', note: '', lines: [{ name: 'Ngói âm 80 men lam', spec: '80 x 230 mm', note: 'Men lam cổ', measure: 120, measure_unit: 'm²', norm: 42, qty: 5040, unit: 'viên', price: 12000, amount: 60480000 },
      { name: 'Ngói dương 80 men lam', spec: '80 x 230 mm', note: '', measure: 120, measure_unit: 'm²', norm: 42, qty: 5040, unit: 'viên', price: 12000, amount: 60480000 }] }],
    vat_mode: 'them', vat_rate: 8, ship: { qty: 0, unit: 'tấn', price: 0, amount: 0 }, terms: '- Giá đã bao gồm vận chuyển tới chân công trình.\n- Thời gian sản xuất: 30 ngày kể từ khi đặt cọc.', show_norm: true, goods: 120960000, vat: 9676800, total: 130636800 } } };
  const o = { id: 's', code: 'HD000456', customer_name: 'Anh Hòa', customer_phone: '0987654321', customer_address: 'Số 10, Phổ Quang, Tân Bình, TP.HCM', order_date: today, last_delivery_date: today,
    goods_total: 15040000, order_total: 15840000, vat_total: 0, vat_rate: 0, delivered_value: 15840000, paid_net: 2000000, returned_value: 0, note: 'Giao giờ hành chính', vat_net: 0, ship_billed: 800000 };
  const lines = [
    { id: 'l1', product_id: 'p1', sku: 'NA80-ML', product_name: 'Ngói âm 80 men lam', unit: 'Viên', eff_qty: 600, unit_price: 12000, discount_pct: 0, line_total: 7200000, unit_conv: 1, note: '' },
    { id: 'l2', product_id: 'p2', sku: 'ND80-ML', product_name: 'Ngói dương 80 men lam', unit: 'Viên', eff_qty: 560, unit_price: 14000, discount_pct: 0, line_total: 7840000, unit_conv: 1, note: 'Chọn màu đều' },
  ];
  const base = { kind: 'order', o, lines, dels: [], d: null, dlines: null, cust: { code: 'KH000123', address: o.customer_address, balance: 13840000 }, prods: SAMPLE_PRODS,
    orderInfo: {}, delInfo: null, k: null, allDl: null, kInfo: {}, driver: { name: 'Nguyễn An Giang', phone: '0977937690', plate: '29C-123.45', id_no: '001088012345' } };
  if (['de_nghi_tam_ung', 'doi_chieu_sl', 'doi_chieu_tt', 'de_nghi_tt'].includes(type)) {
    const dl = (code, date, pid, name, qty, price) => ({ delivery_code: code, delivery_date: date, product_id: pid, product_name: name, qty, unit: 'Viên', unit_price_net: price, revenue: qty * price });
    return { ...base, kind: 'contract', k: { id: 's', code: 'HĐ-045/2026', sign_date: today, advance_amount: 4752000, advance_note: '30% giá trị hợp đồng', reconciled_at: today, profile_id: null },
      allDl: [dl('GH0001', '2026-11-02', 'p1', 'Ngói âm 80 men lam', 300, 12000), dl('GH0001', '2026-11-02', 'p2', 'Ngói dương 80 men lam', 280, 14000), dl('GH0002', '2026-11-09', 'p1', 'Ngói âm 80 men lam', 300, 12000), dl('GH0002', '2026-11-09', 'p2', 'Ngói dương 80 men lam', 280, 14000)] };
  }
  return base;
}
