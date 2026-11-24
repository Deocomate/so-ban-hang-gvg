// Thông tin riêng từng chứng từ in (người nhận, SĐT, địa chỉ giao, lái xe, tình trạng hàng…) — lưu để in lại giống lần trước.
import { ctx, fail, one, run, json, nowIso } from '../lib/context.js';
import { requirePerm } from './access.js';

// customer: bảng đối chiếu gộp nhiều hóa đơn của một khách (đơn vị đứng tên, đầu trang sửa riêng)
const REF_TABLES = { order: 'sales_orders', delivery: 'deliveries', payment: 'payments', contract: 'contracts', quote: 'quotes', customer: 'customers' };
const FIELDS = ['recv_name', 'recv_phone', 'recv_address', 'driver_name', 'driver_phone', 'handover_rep', 'goods_condition', 'box_total', 'old_debt',
  'doc_date', 'note', 'place', 'reason', 'payer_name', 'payer_address', 'attach', 'recv_party', 'date_hoa_don', 'date_don_dat_hang', 'date_bien_ban',
  'date_phieu_xuat_kho', 'profile_hoa_don', 'profile_don_dat_hang', 'profile_bien_ban', 'profile_phieu_xuat_kho', 'profile_phieu_thu', 'profile_hd_van_chuyen', 'profile_de_nghi_tam_ung', 'profile_doi_chieu_sl', 'profile_doi_chieu_tt', 'profile_de_nghi_tt',
  'date_hd_van_chuyen', 'date_de_nghi_tam_ung', 'date_doi_chieu_sl', 'date_doi_chieu_tt', 'date_de_nghi_tt', 'vehicle', 'id_no', 'transit_days', 'freight_note', 'pay_at', 'carrier_party', 'carrier_address',
  // Phiếu yêu cầu xuất hóa đơn VAT; vat_skip = '1': đơn không cần xuất hóa đơn (tắt lời nhắc)
  'date_yeu_cau_vat', 'profile_yeu_cau_vat', 'vat_buyer', 'vat_unit', 'vat_tax_code', 'vat_address', 'vat_email', 'vat_pay_method', 'vat_bank', 'vat_rate', 'vat_note', 'vat_skip',
  // Giấy chứng nhận xuất xưởng
  'date_cn_xuat_xuong', 'profile_cn_xuat_xuong', 'cert_buyer', 'cert_address', 'cert_project', 'cert_site', 'cert_result'];

const HEADER_KEY = /^hdr_[a-z_]{2,30}_(name|legal_name|address|phone|email|website|tax_code|bank_line|representative|logo)$/;

function checkRef(book, type, id) {
  const t = REF_TABLES[type];
  if (!t || !one(`select 1 from ${t} where id = ? and book_id = ?`, id, book)) fail('Không tìm thấy chứng từ');
}

// p = {book_id, ref_type, ref_id}
export function get_doc_info(p) {
  requirePerm(p.book_id, null);
  checkRef(p.book_id, p.ref_type, p.ref_id);
  return json(one(`select data from doc_info where ref_type = ? and ref_id = ?`, p.ref_type, p.ref_id)?.data);
}

// p = {book_id, ref_type, ref_id, data:{…}}  (chỉ lưu các trường cho phép, mỗi trường tối đa 500 ký tự)
export function save_doc_info(p) {
  const b = p.book_id; const t = p.ref_type;
  requirePerm(b, t === 'payment' ? 'thu_chi' : 'ban_hang');
  checkRef(b, t, p.ref_id);
  const d = {};
  for (const k of FIELDS) if (p.data && k in p.data) d[k] = p.data[k] == null ? null : String(p.data[k]).slice(0, 500);
  // Đầu trang sửa riêng cho chứng từ: hdr_<loại chứng từ>_<trường>
  for (const k of Object.keys(p.data || {})) if (HEADER_KEY.test(k)) d[k] = p.data[k] == null ? null : String(p.data[k]).slice(0, 500);
  const cur = json(one(`select data from doc_info where ref_type = ? and ref_id = ?`, t, p.ref_id)?.data);
  run(`insert into doc_info (book_id, ref_type, ref_id, data, updated_by, updated_at) values (?, ?, ?, ?, ?, ?)
    on conflict (ref_type, ref_id) do update set data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  b, t, p.ref_id, { ...cur, ...d }, ctx.uid, nowIso());
  return { ok: true };
}
