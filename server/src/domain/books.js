// Sổ, thiết lập, thành viên & quyền, tài khoản nhận tiền, xuất dữ liệu sao lưu.
import { ctx, fail, one, all, run, insert, uuid, nowIso, json, num, nz, outRows } from '../lib/context.js';
import { requirePerm, loadMembers, bookSettings } from './access.js';

export const DEFAULT_EXPENSE_CATS = [
  { group: 'Mặt bằng', items: ['Thuê nhà / cửa hàng', 'Thuê kho', 'Phí dịch vụ, an ninh, vệ sinh'] },
  { group: 'Điện, nước, internet', items: ['Tiền điện', 'Tiền nước', 'Internet, điện thoại', 'Gas, rác thải'] },
  { group: 'Công cụ dụng cụ', items: ['Kệ, tủ, bàn trưng bày', 'Thiết bị (máy in, camera, đèn, điện thoại livestream)', 'Dụng cụ đóng gói, bán hàng', 'Sửa chữa, bảo trì'] },
  { group: 'Marketing', items: ['Quảng cáo Facebook', 'Quảng cáo TikTok', 'Quảng cáo khác (Google, Zalo…)', 'KOC / KOL, affiliate', 'Chụp ảnh, quay video, đạo cụ', 'In ấn, biển bảng, catalog', 'Quà tặng, khuyến mãi, hàng mẫu'] },
  { group: 'Chi phí bán hàng', items: ['Phí vận chuyển (ship, COD)', 'Bao bì, đóng gói', 'Phí sàn TMĐT', 'Phí ngân hàng, thanh toán', 'Hoa hồng bán hàng, CTV', 'Hàng tặng kèm'] },
  { group: 'Nhân sự', items: ['Lương', 'Thưởng', 'Bảo hiểm, phụ cấp', 'Ăn uống, liên hoan'] },
  { group: 'Quản lý & khác', items: ['Phần mềm, ứng dụng', 'Thuế môn bài, lệ phí', 'Văn phòng phẩm', 'Tiếp khách', 'Chi phí khác'] },
];

// Đơn vị đứng tên trên chứng từ. Thanh Hải là công ty, Mai Hiếu là hộ kinh doanh; mỗi sổ khai báo cả hai và chọn được trên từng chứng từ.
const LEGAL_ENTITIES = [
  { id: 'thanh_hai', name: 'CÔNG TY TNHH SẢN XUẤT VÀ THƯƠNG MẠI THANH HẢI', legal_name: 'Công ty TNHH Sản xuất và Thương mại Thanh Hải',
    address: 'Số 41B Giang Cao, Xã Bát Tràng, Huyện Gia Lâm, Thành phố Hà Nội', phone: '0913.381.021', email: 'gshaithanh@gmail.com', website: 'www.gomsuxaydung.com',
    tax_code: '0101716287', representative: 'Vũ Mạnh Hải', rep_title: 'Giám đốc', bank_line: '1027833793 - Vietcombank Hưng Yên', logo: '' },
  { id: 'mai_hieu', name: 'HỘ KINH DOANH GỐM SỨ MAI HIẾU', legal_name: 'Hộ kinh doanh Gốm sứ Mai Hiếu',
    address: 'Số 18 Thôn 2 Giang Cao - Xã Bát Tràng - Hà Nội', phone: '0966.55.8808', email: 'vtmai88@gmail.com', website: '',
    tax_code: '', representative: '', rep_title: 'Người đại diện hộ kinh doanh', bank_line: '1106738888 - Vietcombank Hưng Yên', logo: '' },
];

// Hóa đơn bán lẻ của Thanh Hải đứng tên Mai Hiếu; các chứng từ còn lại mặc định đứng tên công ty
export const defaultDocs = (variant) => ({ profiles: LEGAL_ENTITIES, types: variant === 'TH' ? { hoa_don: { profile: 'mai_hieu' } } : {} });

const VARIANTS = {
  TH: { price_names: ['Giá lẻ', 'Giá đại lý', 'Giá công trình', 'Giá đại lý II'], channels: ['Bán tại cửa hàng'],
    categories: ['Ngói', 'Gạch thông gió', 'Lan can - con tiện', 'Đèn vườn', 'Linh vật - phong thủy', 'Phụ kiện mái', 'Khác'] },
  VG: { price_names: ['Giá lẻ', 'Giá sỉ', 'Giá CTV'], channels: ['Facebook', 'TikTok'],
    categories: ['Đồ thờ', 'Bình hút lộc', 'Ấm chén', 'Lọ hoa', 'Mosaic', 'Khác'] },
  AN: { price_names: ['Giá lẻ', 'Giá đại lý', 'Giá công trình'], channels: ['Bán tại cửa hàng'], categories: ['Tranh mosaic', 'Khác'] },
};

export function defaultSettings(variant) {
  return {
    vat_rate: 0.01,
    pit_rate: 0.17,
    ...(VARIANTS[variant] || VARIANTS.TH),
    docs: defaultDocs(variant),
    units: ['Cái', 'Viên', 'Cặp', 'Bộ', 'Đôi', 'Chiếc', 'm²', 'Thùng'],
    customer_groups: ['Khách lẻ', 'Khách sỉ', 'Công trình'],
    default_vat: 8,
    monthly_target: 0,
    expense_groups: DEFAULT_EXPENSE_CATS.map((g) => g.group),
    expense_cats: DEFAULT_EXPENSE_CATS,
    fee_category: 'Phí sàn TMĐT',
    prod_steps: ['Chờ sản xuất', 'Đang sản xuất', 'Đang trong lò', 'Đã sản xuất, chưa giao hàng', 'Đang giao về'],
    allow_oversell: false,
    due_warn_days: 3,
    lock_date: null,
    staff_default_perms: { ban_hang: true, thu_chi: true, nhap_hang: false, kho: false, danh_muc: false, chi_phi: false, xem_gia_von: false, xem_bao_cao: false },
  };
}

// Sổ tạo trong CSDL chạy thử (DEMO_MODE) được đánh dấu là sổ mẫu
export const demoFlag = { on: false };

export function createBook(name, short, owner) {
  const id = uuid(); const now = nowIso();
  insert('books', { id, name, short_name: short, is_demo: demoFlag.on ? 1 : 0, settings: defaultSettings(short), created_at: now });
  insert('book_members', { book_id: id, user_id: owner, role: 'owner', display_name: 'Chủ cửa hàng', created_at: now });
  insert('funds', { id: uuid(), book_id: id, name: 'Tiền mặt', sort: 1 });
  insert('funds', { id: uuid(), book_id: id, name: 'Tài khoản ngân hàng', sort: 2 });
  insert('customers', { id: uuid(), book_id: id, code: 'KL', name: 'Khách lẻ', kind: 'Khách lẻ', price_tier: 1, created_at: now });
  return id;
}

// Lần đầu đăng nhập: nếu hệ thống chưa có sổ nào, người đầu tiên thành chủ cửa hàng của cả 3 sổ.
// Chế độ chạy thử: sổ mẫu cũng tính là đã có sổ, để người đăng ký sau không tạo thêm bộ sổ trùng tên.
export function bootstrap() {
  if (!ctx.uid) fail('Bạn chưa đăng nhập', 401);
  if (!one(`select 1 from book_members where user_id = ?`, ctx.uid)) {
    if (one(`select 1 from books ${demoFlag.on ? '' : 'where is_demo = 0'}`)) {
      fail('Tài khoản này chưa được cấp quyền vào sổ nào. Hãy nhờ chủ cửa hàng thêm email của bạn trong Cài đặt → Người dùng.', 403);
    }
    createDefaultBooks(ctx.uid);
    loadMembers();
  }
  return my_books();
}

export function createDefaultBooks(owner) {
  createBook('Gốm sứ Thanh Hải', 'TH', owner);
  createBook('Gốm Vũ Gia', 'VG', owner);
  createBook('Anamtile', 'AN', owner);
}

// Hệ thống đã chạy trước khi có Anamtile: thêm sổ thứ ba cho chủ sổ Thanh Hải
export function addAnamtileBook() {
  const th = one(`select b.is_demo, m.user_id from books b join book_members m on m.book_id = b.id and m.role = 'owner' where b.short_name = 'TH' order by b.created_at limit 1`);
  if (!th || one(`select 1 from books where short_name = 'AN'`)) return;
  run(`update books set is_demo = ? where id = ?`, th.is_demo, createBook('Anamtile', 'AN', th.user_id));
}

export function my_books() {
  return outRows(all(`select b.id, b.name, b.short_name, b.is_demo, b.settings, m.role, m.perms, m.display_name
    from books b join book_members m on m.book_id = b.id and m.user_id = ? order by b.created_at, b.rowid`, ctx.uid));
}

export function update_book_settings(p) {
  const b = p.book_id; const s = p.settings || {};
  requirePerm(b, 'owner');
  if ('vat_rate' in s && (num(s.vat_rate) < 0 || num(s.vat_rate) > 0.2)) fail('Thuế suất GTGT không hợp lệ');
  if ('price_names' in s && (!Array.isArray(s.price_names) || ![3, 4].includes(s.price_names.length))) fail('Cần 3 hoặc 4 tên mức giá');
  if ('price_names' in s && s.price_names.length < 4 && one(`select 1 from customers where book_id = ? and price_tier = 4`, b)) fail('Còn khách hàng đang dùng mức giá 4 — hãy đổi mức giá của họ trước');
  const settings = { ...bookSettings(b), ...s };
  run(`update books set settings = ?, name = coalesce(?, name) where id = ?`, settings, nz(p.name), b);
  const r = one(`select settings, name from books where id = ?`, b);
  return { settings: json(r.settings), name: r.name };
}

export function upsert_member(p) {
  const b = p.book_id; const role = p.role || 'staff';
  requirePerm(b, 'owner');
  if (!['owner', 'staff'].includes(role)) fail('Vai trò không hợp lệ');
  const u = one(`select id from users where lower(email) = lower(?)`, String(p.email ?? '').trim());
  if (!u) fail(`Chưa có tài khoản nào đăng ký bằng email "${p.email ?? ''}". Hãy nhờ người này đăng ký trước, rồi thêm lại.`);
  const perms = p.perms ?? bookSettings(b).staff_default_perms ?? {};
  if (u.id === ctx.uid && role !== 'owner') fail('Không thể tự hạ quyền của chính mình');
  run(`insert into book_members (book_id, user_id, role, perms, display_name, created_at) values (?, ?, ?, ?, ?, ?)
    on conflict (book_id, user_id) do update set role = excluded.role, perms = excluded.perms,
      display_name = coalesce(excluded.display_name, book_members.display_name)`, b, u.id, role, perms, nz(p.display_name), nowIso());
  loadMembers();
  return { user_id: u.id };
}

export function remove_member(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  if (p.user_id === ctx.uid) fail('Không thể tự xóa chính mình khỏi sổ');
  run(`delete from book_members where book_id = ? and user_id = ?`, b, p.user_id);
  loadMembers();
  return { ok: true };
}

// ---------- TÀI KHOẢN NHẬN TIỀN (QR chuyển khoản) ----------
export const normAcct = (t) => String(t ?? '').replace(/\D/g, '');

// p = {book_id, bank:{bin, bank_name, account_no, account_name, fund_id}}  (lưu vào settings.bank)
export function save_bank_account(p) {
  const b = p.book_id; const bk = p.bank || {};
  requirePerm(b, 'owner');
  const acct = normAcct(bk.account_no);
  const nm = String(bk.account_name ?? '').trim().toUpperCase();
  const settings = bookSettings(b);
  if (!acct) {
    delete settings.bank;
    run(`update books set settings = ? where id = ?`, settings, b);
    return { ok: true, cleared: true };
  }
  if (acct.length < 6 || acct.length > 19) fail('Số tài khoản không hợp lệ');
  if (!/^\d{6}$/.test(String(bk.bin ?? ''))) fail('Chọn ngân hàng');
  if (!nm) fail('Nhập tên chủ tài khoản (in hoa, không dấu, đúng như trên ngân hàng)');
  if (nz(bk.fund_id) && !one(`select 1 from funds where id = ? and book_id = ?`, bk.fund_id, b)) fail('Quỹ không thuộc sổ này');
  settings.bank = { bin: bk.bin, bank_name: bk.bank_name ?? null, account_no: acct, account_name: nm, fund_id: nz(bk.fund_id) };
  run(`update books set settings = ? where id = ?`, settings, b);
  return { ok: true };
}

// ---------- XUẤT TOÀN BỘ DỮ LIỆU 1 SỔ (sao lưu) ----------
const EXPORT_TABLES = ['books', 'book_members', 'funds', 'products', 'customers', 'suppliers', 'opening_debts', 'sales_orders', 'sales_order_lines',
  'deliveries', 'delivery_lines', 'sales_returns', 'sales_return_lines', 'purchase_orders', 'purchase_order_lines', 'goods_receipts',
  'goods_receipt_lines', 'supplier_returns', 'supplier_return_lines', 'stock_adjustments', 'stock_adjustment_lines', 'stock_moves',
  'payments', 'payment_allocations', 'expenses', 'doc_counters', 'shipments', 'shipment_events', 'bank_txns', 'notifications', 'doc_info',
  'drivers', 'driver_trips', 'quotes', 'contracts', 'tax_invoices'];

export function export_book(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  const r = {};
  for (const t of EXPORT_TABLES) r[t] = outRows(all(`select * from ${t} where ${t === 'books' ? 'id' : 'book_id'} = ?`, b));
  // Tiền về chưa xác định sổ (2 sổ dùng chung tài khoản) cũng thuộc về sổ này
  r.bank_txns.push(...outRows(all(`select * from bank_txns where book_id is null and exists (select 1 from json_each(candidate_books) where value = ?)`, b)));
  r.kit_items = all(`select k.* from kit_items k join products pr on pr.id = k.kit_id where pr.book_id = ?`, b);
  r.exported_at = nowIso();
  r.format = 'gomsu-backup-v1';
  return r;
}
