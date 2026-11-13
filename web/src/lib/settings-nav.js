// Danh mục Thiết lập theo cách KiotViet sắp xếp: cột trái chia nhóm, mỗi mục gồm các thẻ, mỗi thẻ gồm các dòng thiết lập.
// Đây là nguồn duy nhất cho cột trái, mục lục "Trên trang này", ô tìm kiếm và menu bánh răng trên thanh trên cùng.
// access: 'owner' (quản lý sổ), 'admin' (tổng quản trị), 'all' (mọi người dùng).

const row = (id, title, desc) => ({ id, title, desc });

export const SETTING_GROUPS = [
  { title: 'Quản lý', items: [
    { id: 'hang-hoa', label: 'Hàng hóa', icon: 'vase', access: 'owner', cards: [
      { id: 'thong-tin', title: 'Thông tin hàng hóa', rows: [
        { id: 'units', title: 'Đơn vị tính', desc: 'Quản lý hàng hóa theo đơn vị tính khác nhau như viên, m², bộ, thùng.' },
        { id: 'fields', title: 'Thuộc tính', desc: 'Chọn các trường thông tin hàng hóa sổ đang dùng như thương hiệu, chất liệu, định mức.' },
        { id: 'packaging', title: 'Quy cách đóng gói', desc: 'Hàng đóng hộp, thùng: hiện quy cách đóng gói và in “x hộp x y viên” trên chứng từ.' },
        { id: 'categories', title: 'Nhóm hàng', desc: 'Quản lý hàng hóa theo chủng loại, đặc tính, công năng.' },
        { id: 'brands', title: 'Thương hiệu', desc: 'Thương hiệu nhà sản xuất hoặc dòng sản phẩm, lấy từ thông tin từng hàng hóa.' },
        { id: 'locations', title: 'Vị trí', desc: 'Quản lý hàng hóa theo vị trí bán hàng hoặc lưu trữ như giá, kệ, kho bãi.' },
        row('barcode', 'Mã vạch hàng hóa', 'Quản lý hàng hóa bằng mã vạch chuẩn hoặc mã vạch do cửa hàng tạo ra.'),
        row('suggest', 'Tự động gợi ý thông tin hàng hóa', 'Tự gợi ý tên, mã, mô tả, hình ảnh khi tạo hàng hóa.'),
      ] },
      { id: 'gia', title: 'Giá vốn, giá bán', rows: [
        { id: 'cost', title: 'Phương pháp tính giá vốn', desc: 'Giá vốn trung bình hoặc giá vốn cố định; xem trước chênh lệch lãi lỗ trước khi đổi.' },
        { id: 'pricebook', title: 'Bảng giá', desc: 'Giá bán theo từng mức giá cho từng hàng hóa.' },
      ] },
      { id: 'san-xuat', title: 'Sản xuất', rows: [
        { id: 'production', title: 'Sản xuất hàng hóa', desc: 'Thiết lập nguyên liệu thành phần và ghi nhận hàng hóa thành phẩm.' },
      ] },
      { id: 'bao-hanh', title: 'Bảo hành, bảo trì', rows: [
        row('warranty', 'Bảo hành, bảo trì, yêu cầu sửa chữa', 'Quản lý bảo hành và sửa chữa hàng hóa với nhắc lịch và hẹn trả khách.'),
      ] },
      { id: 'nguoi-dung', title: 'Người dùng', rows: [
        row('cat-perm', 'Phân quyền người dùng theo nhóm hàng', 'Nhân viên chỉ quản lý các nhóm hàng cụ thể.'),
      ] },
      { id: 'khac', title: 'Khác', rows: [
        { id: 'oversell', title: 'Cho phép giao dịch khi hết tồn kho', desc: 'Vẫn bán, giao hàng khi tồn không đủ (tồn có thể âm). Tắt để chặn giao vượt tồn.' },
      ] },
    ] },
    { id: 'mua-hang', label: 'Mua hàng', icon: 'import', access: 'owner', cards: [
      { id: 'ncc', title: 'Nhà cung cấp', rows: [
        { id: 'suppliers', title: 'Danh sách nhà cung cấp', desc: 'Thông tin, công nợ phải trả và lịch sử giao dịch với nhà cung cấp.' },
      ] },
      { id: 'nhap', title: 'Nhập hàng, đặt hàng nhập', rows: [
        { id: 'po', title: 'Đặt hàng nhập', desc: 'Tạo và quản lý đơn đặt hàng nhập, đơn đặt xưởng sản xuất.' },
        { id: 'prod_steps', title: 'Các bước sản xuất (đơn đặt xưởng)', desc: 'Các bước theo dõi tiến độ đơn đặt xưởng, theo thứ tự.' },
        row('po-cost', 'Quản lý chi phí nhập hàng', 'Theo dõi các chi phí nhập hàng phát sinh như phí dịch vụ, phí lưu kho.'),
      ] },
      { id: 'dich-vu', title: 'Mua dịch vụ', rows: [
        { id: 'services', title: 'Mua dịch vụ', desc: 'Ghi nhận chi phí dịch vụ có hóa đơn, công nợ phải trả và hóa đơn đầu vào.' },
      ] },
    ] },
    { id: 'don-hang', label: 'Đơn hàng', icon: 'order', access: 'owner', cards: [
      { id: 'quan-ly', title: 'Quản lý đơn hàng', rows: [
        { id: 'channels', title: 'Kênh bán', desc: 'Hiện ở ô “Kênh” khi tạo đơn; báo cáo doanh thu tách theo kênh.' },
        { id: 'oversell', title: 'Cho phép giao dịch khi hết tồn kho', desc: 'Vẫn bán, giao hàng khi tồn không đủ (tồn có thể âm). Tắt để chặn giao vượt tồn.' },
        { id: 'charges', title: 'Quản lý thu khác', desc: 'Các khoản thu thêm trên hóa đơn: VAT và tiền vận chuyển.' },
        row('confirm', 'Hiển thị xác nhận trước khi hoàn thành đơn hàng', 'Thêm bước xác nhận cuối trước khi hoàn thành đơn.'),
        row('return-limit', 'Giới hạn thời gian trả hàng', 'Khoảng thời gian khách được phép trả hàng sau khi mua.'),
        row('lock-time', 'Không cho phép thay đổi thời gian giao dịch', 'Tùy chỉnh việc đổi ngày giờ cho từng loại giao dịch.'),
        row('shift', 'Thiết lập kết ca làm việc', 'Thu ngân đối chiếu tiền mặt và nộp báo cáo bàn giao cuối ca.'),
      ] },
      { id: 'hddt', title: 'Hóa đơn điện tử', rows: [
        row('einv-lock', 'Chặn chỉnh sửa/hủy hóa đơn đã phát hành HĐĐT', 'Không cho sửa hoặc hủy hóa đơn đã phát hành hóa đơn điện tử.'),
      ] },
      { id: 'ma', title: 'Mã giao dịch', rows: [
        { id: 'codes', title: 'Quy tắc tạo mã giao dịch', desc: 'Phần mềm tự tạo mã cho đơn, phiếu giao, phiếu thu chi… theo thứ tự tạo.' },
      ] },
    ] },
    { id: 'khach-hang', label: 'Khách hàng', icon: 'users', access: 'owner', cards: [
      { id: 'quan-ly', title: 'Quản lý khách hàng', rows: [
        { id: 'price_names', title: 'Mức giá bán', desc: 'Mỗi khách gắn một mức giá; khi tạo đơn, giá tự điền theo mức của khách.' },
        { id: 'customer_groups', title: 'Nhóm khách hàng', desc: 'Phân nhóm khách để lọc, báo cáo và cập nhật nhóm theo điều kiện.' },
        { id: 'due_warn', title: 'Cảnh báo công nợ khách hàng', desc: 'Nhắc các khoản công nợ sắp đến hạn hoặc đã quá hạn.' },
        row('kh-owner', 'Quản lý khách hàng theo người phụ trách', 'Gán một hoặc nhiều người phụ trách cho khách, nhóm khách.'),
        row('kh-ncc', 'Quản lý khách hàng đồng thời là nhà cung cấp', 'Theo dõi công nợ của đối tác vừa là khách, vừa là nhà cung cấp.'),
        row('kh-required', 'Thiết lập thông tin bắt buộc', 'Bắt buộc nhập các trường thông tin khách hàng.'),
      ] },
      { id: 'cham-soc', title: 'Chăm sóc khách hàng', rows: [
        row('points', 'Tích điểm', 'Khách tích điểm khi mua, đổi điểm để thanh toán.'),
        row('promo', 'Khuyến mại', 'Áp dụng khuyến mại theo hàng hóa hoặc giá trị đơn hàng.'),
        row('voucher', 'Voucher', 'Phát hành và áp dụng phiếu mua hàng.'),
        row('coupon', 'Coupon', 'Phát hành và áp dụng mã giảm giá.'),
      ] },
    ] },
    { id: 'so-quy', label: 'Sổ quỹ', icon: 'wallet', access: 'owner', cards: [
      { id: 'quy', title: 'Quỹ tiền', rows: [{ id: 'funds', title: 'Quỹ tiền', desc: 'Tiền mặt, tài khoản ngân hàng, ví điện tử và số dư đầu kỳ.' }] },
      { id: 'tai-khoan', title: 'Tài khoản ngân hàng', rows: [{ id: 'bank', title: 'Tài khoản nhận chuyển khoản', desc: 'Ngân hàng, số tài khoản dùng để in mã QR trên đơn và phiếu.' }] },
      { id: 'chi-phi', title: 'Danh mục chi phí', rows: [{ id: 'expense', title: 'Nhóm và khoản mục chi phí', desc: 'Chọn khi ghi chi phí vận hành; nhóm chi phí cho phí sàn.' }] },
    ] },
    { id: 'thue', label: 'Thuế & Kế toán', icon: 'tax', access: 'owner', cards: [
      { id: 'thue', title: 'Thuế', rows: [
        { id: 'vat_rate', title: 'Thuế GTGT trên doanh thu', desc: 'Dùng để ước tính lãi lỗ hằng tháng. Hộ kinh doanh bán hàng hóa: 1%.' },
        { id: 'pit_rate', title: 'Thuế TNCN trên lợi nhuận', desc: 'Dùng để ước tính lãi lỗ hằng tháng. Hộ doanh thu trên 3 tỷ: 17%.' },
        { id: 'default_vat', title: 'VAT mặc định trên hóa đơn, báo giá', desc: 'Thuế suất tự điền khi thêm VAT vào đơn, báo giá, hóa đơn đầu vào.' },
        { id: 'tax_files', title: 'Hồ sơ kê khai', desc: 'Sổ sách, hóa đơn đầu vào, đầu ra theo kỳ.' },
      ] },
      { id: 'hddt', title: 'Hóa đơn điện tử', rows: [
        row('einvoice', 'Kết nối hóa đơn điện tử', 'Xuất hóa đơn điện tử, khai báo chữ ký số, thiết lập phát hành.'),
      ] },
    ] },
    { id: 'mau-in', label: 'Mẫu in', icon: 'print', access: 'owner', cards: [
      { id: 'mau', title: 'Mẫu chứng từ', rows: [{ id: 'docs', title: 'Mẫu in đơn, phiếu, báo giá', desc: 'Nội dung, điều khoản và cách trình bày các chứng từ in ra.' }] },
    ] },
  ] },
  { title: 'Tiện ích', items: [
    { id: 'giao-hang', label: 'Giao hàng', icon: 'truck', access: 'owner', cards: [
      { id: 'hang', title: 'Đơn vị vận chuyển', rows: [{ id: 'carriers', title: 'Kết nối đơn vị vận chuyển', desc: 'Nhận trạng thái vận đơn, COD tự động từ BEST Express, Shopee Express.' }] },
    ] },
    { id: 'thanh-toan', label: 'Thanh toán', icon: 'qr', access: 'owner', cards: [
      { id: 'chuyen-khoan', title: 'Thanh toán chuyển khoản', rows: [
        { id: 'qr', title: 'Mã QR chuyển khoản', desc: 'Mã QR VietQR in trên đơn, phiếu với đúng số tiền còn phải trả.' },
        { id: 'sepay', title: 'Nhận tiền về tự động (SePay)', desc: 'Tự ghi phiếu thu và gạch nợ đúng đơn khi tiền về tài khoản.' },
      ] },
    ] },
    { id: 'thong-bao', label: 'Thông báo', icon: 'bell', access: 'all', cards: [
      { id: 'dien-thoai', title: 'Thông báo điện thoại', rows: [{ id: 'push', title: 'Thông báo trên điện thoại này', desc: 'Nhận thông báo đơn, tiền về, công nợ ngay trên màn hình khóa.' }] },
    ] },
  ] },
  { title: 'Cửa hàng', items: [
    { id: 'cua-hang', label: 'Thông tin cửa hàng', icon: 'store', access: 'owner', cards: [
      { id: 'thong-tin', title: 'Thông tin cửa hàng', rows: [{ id: 'shop', title: 'Tên, điện thoại, địa chỉ', desc: 'In trên đầu đơn, phiếu; lời nhắn cuối phiếu.' }] },
      { id: 'kinh-doanh', title: 'Mục tiêu kinh doanh', rows: [{ id: 'target', title: 'Mục tiêu doanh thu mỗi tháng', desc: 'Dùng cho thẻ Doanh thu / Mục tiêu ở Tổng quan.' }] },
      { id: 'tien-te', title: 'Quản lý tiền tệ', rows: [
        row('currency', 'Ngoại tệ và tỷ giá', 'Thu chi bằng ngoại tệ quy đổi theo tỷ giá; định dạng số thập phân của giá.'),
      ] },
    ] },
    { id: 'nguoi-dung', label: 'Quản lý người dùng', icon: 'group', access: 'admin', cards: [
      { id: 'tai-khoan', title: 'Tài khoản người dùng', rows: [{ id: 'users', title: 'Tài khoản người dùng', desc: 'Mời, khóa tài khoản và gán quyền ở từng sổ.' }] },
      { id: 'vai-tro', title: 'Quản lý vai trò', rows: [{ id: 'roles', title: 'Vai trò', desc: 'Bộ quyền mặc định theo vai trò để phân quyền nhanh.' }] },
    ] },
    { id: 'bao-mat', label: 'Bảo mật', icon: 'shield', access: 'admin', cards: [
      { id: 'bao-mat', title: 'Bảo mật', rows: [
        row('export-auth', 'Xác thực khi xuất file', 'Nhập lại mật khẩu trước khi xuất file đơn, khách hàng, hàng hóa.'),
        row('2fa', 'Xác thực 2 lớp cho tài khoản nhân viên', 'Yêu cầu mã xác thực khi nhân viên đăng nhập trên thiết bị lạ.'),
      ] },
      { id: 'nhat-ky', title: 'Nhật ký bảo mật', rows: [{ id: 'seclog', title: 'Nhật ký đăng nhập, đổi quyền', desc: 'Các lần đăng nhập, đổi mật khẩu, đổi quyền người dùng.' }] },
    ] },
    { id: 'tai-khoan', label: 'Tài khoản của tôi', icon: 'users', access: 'all', cards: [
      { id: 'tai-khoan', title: 'Tài khoản của tôi', rows: [{ id: 'me', title: 'Tên, email, mật khẩu', desc: 'Đổi mật khẩu, xem quyền của bạn ở sổ này.' }] },
    ] },
  ] },
  { title: 'Dữ liệu', items: [
    { id: 'khoa-so', label: 'Khóa sổ', icon: 'lock', access: 'owner', cards: [
      { id: 'khoa-so', title: 'Khóa sổ', rows: [{ id: 'lock_date', title: 'Khóa sổ đến hết ngày', desc: 'Không ai sửa, thêm chứng từ có ngày trước hoặc bằng ngày này. Dùng sau khi chốt sổ tháng.' }] },
    ] },
    { id: 'lich-su', label: 'Lịch sử thao tác', icon: 'history', access: 'owner', cards: [
      { id: 'nhat-ky', title: 'Lịch sử thao tác', rows: [{ id: 'audit', title: 'Nhật ký thay đổi', desc: 'Theo dõi thao tác thêm, sửa, xóa dữ liệu của mọi người dùng.' }] },
    ] },
    { id: 'du-lieu', label: 'Nhập / sao lưu dữ liệu', icon: 'database', access: 'owner', cards: [
      { id: 'nhap', title: 'Nhập dữ liệu từ Excel', rows: [{ id: 'import', title: 'Nhập hàng hóa, khách hàng, nhà cung cấp', desc: 'Kèm tồn đầu kỳ và nợ đầu kỳ, có bước xem trước.' }] },
      { id: 'sao-luu', title: 'Sao lưu và khôi phục', rows: [
        { id: 'backup', title: 'Sao lưu dữ liệu sổ', desc: 'Tải toàn bộ dữ liệu ra Excel hoặc JSON; nhập bản sao lưu JSON.' },
        row('purge', 'Xóa dữ liệu gian hàng', 'Đặt lịch xóa dữ liệu cũ và nhận thông báo khi xóa xong.'),
      ] },
    ] },
  ] },
];

// Menu bánh răng trên thanh trên cùng: nhóm lớn kèm dòng mô tả, như KiotViet
export const GEAR_MENU = [
  { to: 'hang-hoa', label: 'Hàng hóa', icon: 'vase', sub: 'Thông tin, Giá vốn, Nhập hàng, Nhà cung cấp' },
  { to: 'don-hang', label: 'Đơn hàng', icon: 'order', sub: 'Đặt hàng, Bán hàng, Trả hàng, Kết ca' },
  { to: 'khach-hang', label: 'Khách hàng', icon: 'users', sub: 'Tích điểm, Khuyến mại, Voucher, Coupon' },
  { to: 'so-quy', label: 'Sổ quỹ', icon: 'wallet', sub: 'Quỹ tiền, Tài khoản ngân hàng, Chi phí' },
  { to: 'giao-hang', label: 'Tiện ích', icon: 'truck', sub: 'Giao hàng, Thanh toán, Thông báo' },
  { to: 'cua-hang', label: 'Cửa hàng', icon: 'store', sub: 'Thông tin, Tiền tệ, Người dùng, Bảo mật' },
  { to: 'khoa-so', label: 'Dữ liệu và Lịch sử thao tác', icon: 'shield', sub: 'Khóa sổ, Lịch sử thao tác, Xóa dữ liệu' },
];

// Địa chỉ cũ (#cai-dat/<tab>) trước khi chia mục như KiotViet
export const LEGACY_SECTION = { book: 'cua-hang', lists: 'hang-hoa', funds: 'so-quy', bank: 'so-quy', docs: 'mau-in', carriers: 'giao-hang', notify: 'thong-bao',
  users: 'nguoi-dung', roles: 'nguoi-dung', security: 'bao-mat', data: 'du-lieu', audit: 'lich-su', me: 'tai-khoan' };

export const ALL_SECTIONS = SETTING_GROUPS.flatMap((g) => g.items);

export function canSee(sec, { owner, admin }) {
  return sec.access === 'all' || (sec.access === 'owner' && owner) || (sec.access === 'admin' && admin);
}

export function findRow(secId, rowId) {
  const sec = ALL_SECTIONS.find((s) => s.id === secId);
  for (const c of sec?.cards || []) { const r = c.rows.find((x) => x.id === rowId); if (r) return r; }
  return null;
}

// Bỏ dấu để tìm "don vi tinh" vẫn ra "Đơn vị tính"
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// Xếp hạng: cả cụm từ nằm trong tên dòng > cụm từ ở mục/thẻ/mô tả > mọi từ đều có trong tên > từ rải rác
export function searchSettings(q, sections) {
  const phrase = fold(q).trim().replace(/\s+/g, ' ');
  const words = phrase.split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const s of sections) for (const c of s.cards) for (const r of c.rows) {
    const title = fold(r.title); const hay = fold(`${s.label} ${c.title} ${r.title} ${r.desc}`);
    if (!words.every((w) => hay.includes(w))) continue;
    const score = (title.includes(phrase) ? 8 : 0) + (hay.includes(phrase) ? 4 : 0) + (words.every((w) => title.includes(w)) ? 2 : 0) ;
    out.push({ sec: s, card: c, row: r, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 30);
}
