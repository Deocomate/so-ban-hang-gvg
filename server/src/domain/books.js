// Sổ, thiết lập, thành viên & quyền, tài khoản nhận tiền, xuất dữ liệu sao lưu.
import { ctx, fail, one, all, run, insert, uuid, nowIso, json, num, nz, outRows } from '../lib/context.js';
import { requirePerm, requireAdmin, loadMembers, bookSettings, effectivePerms } from './access.js';
import { checkMyPassword } from '../lib/auth.js';

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

// Hồ sơ sổ theo ngành hàng. packaging: hàng đóng hộp/thùng (in quy cách, tính số hộp). hide_fields: trường hàng hóa sổ không dùng.
export const VARIANTS = {
  TH: { price_names: ['Giá lẻ', 'Giá đại lý I', 'Giá công trình', 'Giá đại lý II', 'Giá công trình lẻ'], channels: ['Bán tại cửa hàng'], packaging: true, hide_fields: [],
    categories: ['Ngói', 'Gạch thông gió', 'Lan can - con tiện', 'Đèn vườn', 'Linh vật - phong thủy', 'Phụ kiện mái', 'Khác'] },
  VG: { price_names: ['Giá lẻ', 'Giá sỉ', 'Giá CTV', 'Giá CH'], channels: ['Facebook', 'TikTok'], packaging: false, hide_fields: ['brand', 'material', 'norm_m2', 'norm_m'],
    categories: ['Đồ thờ', 'Bình hút lộc', 'Ấm chén', 'Lọ hoa', 'Mosaic', 'Khác'] },
  AN: { price_names: ['Giá lẻ', 'Giá đại lý', 'Giá công trình'], channels: ['Bán tại cửa hàng'], packaging: true, hide_fields: [], categories: ['Tranh mosaic', 'Khác'] },
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
    allow_oversell: true,   // bán được cả khi tồn không đủ (tồn âm); chủ sổ tắt được trong Cài đặt
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

// Lần đầu đăng nhập: nếu hệ thống chưa có sổ nào, người đầu tiên thành Tổng quản trị, Quản lý cả 3 sổ.
// Chế độ chạy thử: sổ mẫu cũng tính là đã có sổ, để người đăng ký sau không tạo thêm bộ sổ trùng tên.
export function bootstrap() {
  if (!ctx.uid) fail('Bạn chưa đăng nhập', 401);
  if (!one(`select 1 from book_members where user_id = ?`, ctx.uid)) {
    if (one(`select 1 from books ${demoFlag.on ? '' : 'where is_demo = 0'}`)) {
      fail('Tài khoản này chưa được cấp quyền vào sổ nào. Hãy nhờ Tổng quản trị cấp quyền trong Cài đặt → Người dùng & quyền.', 403);
    }
    createDefaultBooks(ctx.uid);
    run(`update users set is_admin = 1 where id = ?`, ctx.uid);
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

// Sổ của người đang đăng nhập; perms là quyền hiệu lực (đã gộp vai trò mẫu và phần chỉnh riêng)
export function my_books() {
  return outRows(all(`select b.id, b.name, b.short_name, b.is_demo, b.settings, m.role, m.role_id, r.name as role_name, m.perms, m.display_name
    from books b join book_members m on m.book_id = b.id and m.user_id = ? left join roles r on r.id = m.role_id order by b.created_at, b.rowid`, ctx.uid))
    .map((b) => ({ ...b, perms: effectivePerms(b.role, b.role_id, b.perms) }));
}

export function update_book_settings(p) {
  const b = p.book_id; const s = p.settings || {};
  requirePerm(b, 'owner');
  if ('vat_rate' in s && (num(s.vat_rate) < 0 || num(s.vat_rate) > 0.2)) fail('Thuế suất GTGT không hợp lệ');
  if ('packaging' in s && typeof s.packaging !== 'boolean') fail('Thiết lập đóng gói không hợp lệ');
  if ('price_multipliers' in s && (!Array.isArray(s.price_multipliers) || s.price_multipliers.length < 1 || s.price_multipliers.length > 8
    || s.price_multipliers.some((x) => typeof x !== 'number' || !(x > 1) || x > 20))) fail('Hệ số giá phải là số lớn hơn 1 và không quá 20 (tối đa 8 hệ số)');
  if ('hide_fields' in s && (!Array.isArray(s.hide_fields) || s.hide_fields.some((f) => typeof f !== 'string'))) fail('Danh sách trường ẩn không hợp lệ');
  if ('price_names' in s && (!Array.isArray(s.price_names) || s.price_names.length < 3 || s.price_names.length > 5)) fail('Cần từ 3 đến 5 tên mức giá');
  if ('price_names' in s && s.price_names.some((x) => typeof x !== 'string' || !x.trim())) fail('Tên mức giá không được để trống ở giữa');
  const unused = 'price_names' in s && one(`select max(price_tier) t from customers where book_id = ? and price_tier > ?`, b, s.price_names.length)?.t;
  if (unused) fail(`Còn khách hàng đang dùng mức giá ${unused} — hãy đổi mức giá của họ trước`);
  const cur = bookSettings(b);
  // Mẫu in lưu riêng bằng save_print_templates: lưu phần khác của "docs" (đơn vị phát hành, phông…) không được làm mất mẫu
  if (s.docs && typeof s.docs === 'object' && !('templates' in s.docs) && cur.docs?.templates) s.docs = { ...s.docs, templates: cur.docs.templates };
  if (s.docs?.templates !== undefined) checkTemplates(s.docs.templates);
  const settings = { ...cur, ...s };
  run(`update books set settings = ?, name = coalesce(?, name) where id = ?`, settings, nz(p.name), b);
  const r = one(`select settings, name from books where id = ?`, b);
  return { settings: json(r.settings), name: r.name };
}

// ---------- Mẫu in (Cài đặt → Mẫu in) ----------
// settings.docs.templates = { <loại chứng từ>: [{ id, name, html, paper, orient, margin:{top,right,bottom,left} (mm), sep, is_default, updated_at }] }
const DOC_KINDS = ['hoa_don', 'don_dat_hang', 'bien_ban', 'phieu_xuat_kho', 'phieu_thu', 'hd_van_chuyen', 'de_nghi_tam_ung', 'doi_chieu_sl', 'doi_chieu_tt', 'de_nghi_tt', 'bao_gia'];
const PAPERS = ['A4', 'A5', 'K80', 'K58'];
const MAX_TEMPLATE = 600000; const MAX_ALL_TEMPLATES = 3000000;
function cleanTemplate(t, i) {
  if (!t || typeof t !== 'object') fail('Mẫu in không hợp lệ');
  const name = String(t.name ?? '').trim().slice(0, 120); if (!name) fail(`Mẫu in thứ ${i + 1} chưa có tên`);
  const html = String(t.html ?? ''); if (!html.trim()) fail(`Mẫu "${name}" đang trống`);
  if (html.length > MAX_TEMPLATE) fail(`Mẫu "${name}" quá lớn — hãy dùng ảnh nhỏ hơn`);
  const id = String(t.id ?? '').trim().slice(0, 40); if (!/^[A-Za-z0-9_-]+$/.test(id)) fail('Mã mẫu in không hợp lệ');
  const m = t.margin && typeof t.margin === 'object' ? t.margin : {};
  const mm = (v, d) => { const n = num(v); if (n === null || n === undefined) return d; if (n < 0 || n > 50) fail('Lề giấy phải từ 0 đến 50 mm'); return n; };
  return { id, name, html, paper: PAPERS.includes(t.paper) ? t.paper : 'A4', orient: t.orient === 'landscape' ? 'landscape' : 'portrait',
    margin: { top: mm(m.top, 10), right: mm(m.right, 14), bottom: mm(m.bottom, 10), left: mm(m.left, 14) },
    sep: t.sep === '.' ? '.' : ',', is_default: !!t.is_default, updated_at: String(t.updated_at || nowIso()).slice(0, 40) };
}
function cleanList(list) {
  if (!Array.isArray(list)) fail('Danh sách mẫu in không hợp lệ');
  if (list.length > 20) fail('Mỗi loại chứng từ tối đa 20 mẫu in');
  const out = list.map(cleanTemplate);
  if (new Set(out.map((t) => t.id)).size !== out.length) fail('Trùng mã mẫu in');
  // Đúng một mẫu mặc định
  if (out.length) { const d = Math.max(0, out.findIndex((t) => t.is_default)); out.forEach((t, i) => { t.is_default = i === d; }); }
  return out;
}
function checkTemplates(all) {
  if (!all || typeof all !== 'object' || Array.isArray(all)) fail('Mẫu in không hợp lệ');
  for (const k of Object.keys(all)) { if (!DOC_KINDS.includes(k)) fail('Loại chứng từ không hợp lệ'); all[k] = cleanList(all[k]); }
  if (JSON.stringify(all).length > MAX_ALL_TEMPLATES) fail('Tổng dung lượng mẫu in quá lớn — hãy bớt ảnh trong mẫu');
}
// p = { book_id, doc_type, templates:[…] } — thay danh sách mẫu của một loại chứng từ; danh sách rỗng = quay về mẫu mặc định
export function save_print_templates(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  if (!DOC_KINDS.includes(p.doc_type)) fail('Loại chứng từ không hợp lệ');
  const list = cleanList(p.templates ?? []);
  const cur = bookSettings(b); const docs = cur.docs && typeof cur.docs === 'object' ? cur.docs : {};
  const templates = { ...(docs.templates || {}) };
  if (list.length) templates[p.doc_type] = list; else delete templates[p.doc_type];
  if (JSON.stringify(templates).length > MAX_ALL_TEMPLATES) fail('Tổng dung lượng mẫu in quá lớn — hãy bớt ảnh trong mẫu');
  run(`update books set settings = ? where id = ?`, { ...cur, docs: { ...docs, templates } }, b);
  return { templates: list };
}

// Cấp quyền 1 người ở 1 sổ (chỉ Tổng quản trị). role_id: vai trò mẫu; perms: phần chỉnh riêng từng ô (true/false) so với vai trò.
// Không có vai trò và không gửi perms → quyền mặc định của sổ.
export function setMembership(b, userId, { role = 'staff', role_id: roleId = null, perms, display_name: displayName } = {}) {
  if (!['owner', 'staff'].includes(role)) fail('Vai trò không hợp lệ');
  if (!one(`select 1 from books where id = ?`, b)) fail('Không tìm thấy sổ');
  const rid = role === 'staff' ? nz(roleId) : null;
  if (rid && !one(`select 1 from roles where id = ?`, rid)) fail('Không tìm thấy vai trò');
  if (role !== 'owner' && one(`select 1 from users where id = ? and is_admin = 1`, userId)) fail('Tổng quản trị luôn là Quản lý sổ — hãy bỏ quyền Tổng quản trị trước');
  const ov = role === 'owner' ? {} : perms ?? (rid ? {} : bookSettings(b).staff_default_perms ?? {});
  run(`insert into book_members (book_id, user_id, role, role_id, perms, display_name, created_at) values (?, ?, ?, ?, ?, ?, ?)
    on conflict (book_id, user_id) do update set role = excluded.role, role_id = excluded.role_id, perms = excluded.perms,
      display_name = coalesce(excluded.display_name, book_members.display_name)`, b, userId, role, rid, cleanPerms(ov), nz(displayName), nowIso());
}
const cleanPerms = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => typeof v === 'boolean' || v === 'true' || v === 'false').map(([k, v]) => [k, v === true || v === 'true']));

export function upsert_member(p) {
  requireAdmin();
  const u = one(`select id from users where lower(email) = lower(?)`, String(p.email ?? '').trim());
  if (!u) fail(`Chưa có tài khoản nào dùng email "${p.email ?? ''}". Hãy mời người này trong Cài đặt → Người dùng & quyền.`);
  if (u.id === ctx.uid && (p.role || 'staff') !== 'owner') fail('Không thể tự hạ quyền của chính mình');
  setMembership(p.book_id, u.id, p);
  loadMembers();
  return { user_id: u.id };
}

export function remove_member(p) {
  requireAdmin();
  if (p.user_id === ctx.uid) fail('Không thể tự xóa chính mình khỏi sổ');
  if (one(`select 1 from users where id = ? and is_admin = 1`, p.user_id)) fail('Tổng quản trị luôn có quyền ở mọi sổ — hãy bỏ quyền Tổng quản trị trước');
  run(`delete from book_members where book_id = ? and user_id = ?`, p.book_id, p.user_id);
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
const EXPORT_TABLES = ['books', 'book_members', 'funds', 'products', 'product_units', 'price_books', 'customers', 'suppliers', 'opening_debts', 'sales_orders', 'sales_order_lines',
  'deliveries', 'delivery_lines', 'sales_returns', 'sales_return_lines', 'purchase_orders', 'purchase_order_lines', 'goods_receipts',
  'goods_receipt_lines', 'supplier_returns', 'supplier_return_lines', 'stock_adjustments', 'stock_adjustment_lines', 'productions', 'production_lines', 'bom_items', 'stock_moves',
  'payments', 'payment_allocations', 'expenses', 'doc_counters', 'shipments', 'shipment_events', 'bank_txns', 'notifications', 'doc_info',
  'drivers', 'driver_trips', 'quotes', 'contracts', 'tax_invoices',
  'employees', 'shifts', 'work_schedules', 'timesheets', 'commission_tables', 'paysheets', 'paysheet_lines'];

export function export_book(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  const r = {};
  for (const t of EXPORT_TABLES) r[t] = outRows(all(`select * from ${t} where ${t === 'books' ? 'id' : 'book_id'} = ?`, b));
  // Tiền về chưa xác định sổ (2 sổ dùng chung tài khoản) cũng thuộc về sổ này
  r.bank_txns.push(...outRows(all(`select * from bank_txns where book_id is null and exists (select 1 from json_each(candidate_books) where value = ?)`, b)));
  r.kit_items = all(`select k.* from kit_items k join products pr on pr.id = k.kit_id where pr.book_id = ?`, b);
  r.price_book_items = all(`select i.* from price_book_items i join price_books pb on pb.id = i.price_book_id where pb.book_id = ?`, b);
  r.exported_at = nowIso();
  r.format = 'gomsu-backup-v1';
  return r;
}

// ---------- Tiền tệ: ngoại tệ, tỷ giá và lịch sử đổi tỷ giá (Thiết lập → Cửa hàng → Quản lý tiền tệ) ----------
// currencies = [{code, name, rate}] — rate: số đồng cho 1 đơn vị ngoại tệ. price_decimals: số chữ số thập phân của giá bán, giá vốn (0–2).
export function save_currency_rates(p) {
  const b = p.book_id; requirePerm(b, 'owner');
  const s = bookSettings(b); const old = new Map((s.currencies || []).map((c) => [c.code, c]));
  const list = (Array.isArray(p.currencies) ? p.currencies : []).map((c) => ({ code: String(c.code ?? '').trim().toUpperCase(), name: String(c.name ?? '').trim(), rate: num(c.rate) }));
  const seen = new Set();
  for (const c of list) {
    if (!/^[A-Z]{3}$/.test(c.code)) fail('Mã ngoại tệ gồm 3 chữ cái, vd. USD, EUR, CNY');
    if (c.code === 'VND') fail('VND là tiền mặc định, không thêm làm ngoại tệ');
    if (seen.has(c.code)) fail(`Ngoại tệ ${c.code} bị lặp`); seen.add(c.code);
    if (!(c.rate > 0)) fail(`Nhập tỷ giá ${c.code}`);
  }
  const dec = p.price_decimals === undefined ? s.price_decimals ?? 0 : Number(p.price_decimals);
  if (![0, 1, 2].includes(dec)) fail('Số chữ số thập phân chỉ từ 0 đến 2');
  const hist = [...(s.fx_history || [])];
  for (const c of list) if (old.get(c.code)?.rate !== c.rate) hist.push({ at: nowIso(), by: ctx.uid, code: c.code, rate: c.rate });
  run(`update books set settings = ? where id = ?`, JSON.stringify({ ...s, currencies: list, price_decimals: dec, fx_history: hist.slice(-500) }), b);
  return { currencies: list, price_decimals: dec };
}

// Xác thực khi xuất file: nhập lại mật khẩu trước khi tải danh sách ra Excel
export function verify_my_password(p) {
  requirePerm(p.book_id, null);
  if (!checkMyPassword(ctx.uid, p.password)) fail('Mật khẩu không đúng', 403);
  return { ok: true };
}

// Phân quyền theo nhóm hàng: nhóm hàng nhân viên được xem / bán (rỗng = mọi nhóm)
export function book_staff(p) {
  requirePerm(p.book_id, 'owner');
  return all(`select m.user_id, m.role, m.categories, coalesce(m.display_name, u.name, u.email) as name, u.email from book_members m join users u on u.id = m.user_id
    where m.book_id = ? order by m.role desc, name`, p.book_id).map((m) => ({ ...m, categories: json(m.categories, []) }));
}
export function save_member_categories(p) {
  requirePerm(p.book_id, 'owner');
  const cats = [...new Set((Array.isArray(p.categories) ? p.categories : []).map((c) => String(c).trim()).filter(Boolean))];
  if (!run(`update book_members set categories = ? where book_id = ? and user_id = ? and role = 'staff'`, JSON.stringify(cats), p.book_id, p.user_id).changes) fail('Không tìm thấy nhân viên của sổ');
  return { categories: cats };
}
