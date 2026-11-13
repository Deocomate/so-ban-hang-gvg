// Danh sách hàm ứng dụng được gọi qua POST /api/rpc/:fn (tên và tham số giữ nguyên như bản Supabase cũ).
// Mỗi lời gọi chạy trong 1 giao dịch: hoặc thành công trọn vẹn, hoặc không ghi gì.
import fs from 'node:fs';
import path from 'node:path';
import { ctx, AppError, today } from '../lib/context.js';
import { config } from '../config.js';
import { setUser } from './access.js';
import * as books from './books.js';
import * as catalog from './catalog.js';
import * as stock from './stock.js';
import * as cash from './cash.js';
import * as sales from './sales.js';
import * as purchases from './purchases.js';
import * as reports from './reports.js';
import * as query from './query.js';
import * as notify from './notify.js';
import * as shipping from './shipping.js';
import * as bank from './bank.js';
import * as documents from './documents.js';
import * as drivers from './drivers.js';
import * as quotes from './quotes.js';
import * as contracts from './contracts.js';
import * as tax from './tax.js';
import * as groups from './customer-groups.js';
import * as staff from './staff.js';
import * as priceBooks from './price-books.js';
import * as users from './users.js';
import * as receivables from './receivables.js';
import { import_book } from './import-backup.js';
import * as costing from './costing.js';
import * as warranty from './warranty.js';
import * as loyalty from './loyalty.js';
import * as shifts from './shifts.js';
import * as purge from './purge.js';

const pick = (mod, names) => Object.fromEntries(names.map((n) => {
  if (typeof mod[n] !== 'function') throw new Error(`Thiếu hàm ${n}`);
  return [n, mod[n]];
}));

export const RPC = {
  ...pick(books, ['bootstrap', 'my_books', 'update_book_settings', 'upsert_member', 'remove_member', 'save_bank_account', 'export_book']),
  ...pick(catalog, ['save_product', 'create_product_variants', 'delete_product', 'save_party', 'save_prices', 'save_fund', 'save_opening_debt', 'delete_opening_debt', 'import_parties']),
  ...pick(stock, ['adjust_stock', 'save_production', 'import_products']),
  ...pick(cash, ['create_payment', 'void_payment', 'save_expense', 'void_expense']),
  ...pick(receivables, ['customer_ledger', 'preview_receipt', 'record_receipt', 'apply_prepaid']),
  ...pick(sales, ['save_sales_order', 'confirm_sales_order', 'cancel_sales_order', 'cancel_remaining', 'deliver', 'cancel_delivery', 'sales_return']),
  ...pick(purchases, ['save_purchase_order', 'confirm_purchase_order', 'cancel_purchase_order', 'cancel_po_remaining', 'set_prod_step', 'receive', 'supplier_return', 'cancel_receipt', 'cancel_supplier_return']),
  ...pick(reports, ['rpt_end_of_day', 'rpt_overview', 'rpt_drill', 'rpt_monthly', 'rpt_products', 'rpt_groups', 'rpt_stock', 'rpt_expenses', 'rpt_dashboard', 'rpt_factory', 'rpt_break_even', 'rpt_brands']),
  ...pick(query, ['q']),
  ...pick(notify, ['my_notifications', 'mark_notifications_read', 'save_notify_prefs', 'save_push_sub', 'delete_push_sub', 'demo_run_scheduled']),
  ...pick(shipping, ['create_shipment', 'update_shipment', 'update_shipment_status', 'settle_cod', 'import_shipment_statuses', 'carrier_webhook_log']),
  ...pick(bank, ['assign_bank_txn', 'ignore_bank_txn', 'demo_simulate']),
  ...pick(documents, ['get_doc_info', 'save_doc_info']),
  ...pick(drivers, ['save_driver', 'save_trip', 'delete_trip', 'pay_driver']),
  ...pick(quotes, ['save_quote', 'set_quote_status']),
  ...pick(contracts, ['save_contract', 'set_contract_reconciled', 'upload_attachment', 'get_attachment', 'delete_attachment']),
  ...pick(tax, ['save_tax_invoice', 'void_tax_invoice', 'rpt_tax']),
  ...pick(staff, ['save_employee', 'save_shift', 'save_schedule', 'save_timesheet', 'delete_timesheet', 'fill_timesheets', 'save_commission_table',
    'create_paysheet', 'recalc_paysheet', 'adjust_paysheet_line', 'close_paysheet', 'cancel_paysheet', 'rpt_staff']),
  ...pick(groups, ['save_customer_group', 'delete_customer_group', 'set_customer_group', 'refresh_customer_groups']),
  ...pick(priceBooks, ['save_price_book', 'delete_price_book', 'save_price_book_items', 'import_price_book_items', 'apply_price_formula']),
  ...pick(users, ['admin_reset_2fa', 'admin_overview', 'admin_save_user', 'admin_resend_invite', 'admin_send_reset', 'admin_set_status', 'admin_logout_user',
    'admin_save_role', 'admin_delete_role', 'admin_security_log']),
  ...pick(costing, ['cost_method_info', 'cost_method_preview', 'change_cost_method']),
  ...pick(warranty, ['warranty_lookup', 'save_warranty_claim', 'set_warranty_status', 'warranty_claims']),
  ...pick(loyalty, ['adjust_points', 'point_history', 'save_promotion', 'save_coupon', 'issue_vouchers', 'cancel_voucher', 'loyalty_lists', 'preview_promos', 'active_promotions', 'order_promos']),
  ...pick(shifts, ['current_shift', 'open_shift', 'close_shift', 'shift_list']),
  ...pick(purge, ['purge_preview', 'schedule_purge', 'cancel_purge', 'purge_jobs']),
  ...pick(books, ['save_currency_rates', 'verify_my_password', 'book_staff', 'save_member_categories']),
  import_book,
};

// Thao tác sửa hàng loạt dữ liệu cũ: sao lưu nguyên CSDL trước (ngoài giao dịch, vì VACUUM INTO không chạy trong giao dịch)
const BACKUP_FIRST = { change_cost_method: 'truoc-doi-gia-von', schedule_purge: 'truoc-xoa-du-lieu' };
function backupBefore(label) {
  const file = ctx.db.pragma('database_list').find((d) => d.name === 'main')?.file;
  if (!file) return null;
  fs.mkdirSync(config.backupDir, { recursive: true });
  const out = path.join(config.backupDir, `gomsu-${today()}-${label}-${Date.now()}.db`);
  ctx.db.prepare('vacuum into ?').run(out);
  return out;
}

export function callRpc(uid, fn, p) {
  if (!Object.hasOwn(RPC, fn)) throw new AppError(`Không có chức năng "${fn}"`, 404);
  const params = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  if (BACKUP_FIRST[fn] && params.confirm === true) params.backup_file = backupBefore(BACKUP_FIRST[fn]);
  setUser(uid);
  try {
    return ctx.db.transaction(() => RPC[fn](params))();
  } finally {
    setUser(null);
  }
}

// Việc của máy chủ (webhook, lịch tự động): không có người dùng đăng nhập
export function callService(fn, ...args) {
  setUser(null);
  return ctx.db.transaction(() => fn(...args))();
}
