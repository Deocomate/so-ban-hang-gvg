// Danh sách hàm ứng dụng được gọi qua POST /api/rpc/:fn (tên và tham số giữ nguyên như bản Supabase cũ).
// Mỗi lời gọi chạy trong 1 giao dịch: hoặc thành công trọn vẹn, hoặc không ghi gì.
import { ctx, AppError } from '../lib/context.js';
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
import { set_member_password } from '../lib/auth.js';

const pick = (mod, names) => Object.fromEntries(names.map((n) => {
  if (typeof mod[n] !== 'function') throw new Error(`Thiếu hàm ${n}`);
  return [n, mod[n]];
}));

export const RPC = {
  ...pick(books, ['bootstrap', 'my_books', 'update_book_settings', 'upsert_member', 'remove_member', 'save_bank_account', 'export_book']),
  ...pick(catalog, ['save_product', 'save_party', 'save_fund', 'save_opening_debt', 'delete_opening_debt', 'import_parties']),
  ...pick(stock, ['adjust_stock', 'import_products']),
  ...pick(cash, ['create_payment', 'void_payment', 'save_expense', 'void_expense']),
  ...pick(sales, ['save_sales_order', 'confirm_sales_order', 'cancel_sales_order', 'cancel_remaining', 'deliver', 'sales_return']),
  ...pick(purchases, ['save_purchase_order', 'confirm_purchase_order', 'cancel_purchase_order', 'cancel_po_remaining', 'set_prod_step', 'receive', 'supplier_return']),
  ...pick(reports, ['rpt_overview', 'rpt_drill', 'rpt_monthly', 'rpt_products', 'rpt_groups', 'rpt_stock', 'rpt_expenses']),
  ...pick(query, ['q']),
  ...pick(notify, ['my_notifications', 'mark_notifications_read', 'save_notify_prefs', 'save_push_sub', 'delete_push_sub', 'demo_run_scheduled']),
  ...pick(shipping, ['create_shipment', 'update_shipment', 'update_shipment_status', 'settle_cod', 'import_shipment_statuses', 'carrier_webhook_log']),
  ...pick(bank, ['assign_bank_txn', 'ignore_bank_txn', 'demo_simulate']),
  ...pick(documents, ['get_doc_info', 'save_doc_info']),
  set_member_password,
};

export function callRpc(uid, fn, p) {
  if (!Object.hasOwn(RPC, fn)) throw new AppError(`Không có chức năng "${fn}"`, 404);
  const params = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
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
