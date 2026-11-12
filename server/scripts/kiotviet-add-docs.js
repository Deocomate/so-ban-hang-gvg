// Nạp bổ sung chứng từ KiotViet phát sinh sau lần chuyển (khách vẫn dùng KiotViet song song) vào sổ đang chạy.
// Dựng lại bằng chính hàm nghiệp vụ như kiotviet-convert.js, giữ mã và giờ tạo KiotViet. Chứng từ có mã đã có trong sổ thì bỏ qua,
// nên chạy lại cùng tệp không ghi trùng. Tất cả trong một giao dịch: lỗi ở đâu thì không ghi gì.
// Hỗ trợ: khách hàng mới, phiếu điều chỉnh công nợ khách (CB…), hóa đơn bán thẳng (không từ đặt hàng), đặt hàng phiếu tạm, phiếu thu khách.
// Loại khác (trả hàng, nhập hàng, hóa đơn từ đặt hàng…) thì dừng và báo, không bỏ qua im lặng.
// Chạy (khi dịch vụ đã dừng): node scripts/kiotviet-add-docs.js <mã sổ, vd. TH> <tệp phát sinh.json> <tệp ghép mã.json> [--thu]
//   --thu: chạy thử trên CSDL rồi hoàn tác, in kết quả, không sao lưu.
import fs from 'node:fs';
import { openDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import { ctx, nowIso } from '../src/lib/context.js';
import { callRpc } from '../src/domain/rpc.js';
import { custBalances } from '../src/domain/reports.js';

const args = process.argv.slice(2);
const dry = args.includes('--thu');
const [short, file, mapFile] = args.filter((a) => !a.startsWith('--'));
if (!short || !file || !mapFile) { console.error('Cách dùng: node scripts/kiotviet-add-docs.js <mã sổ> <tệp phát sinh.json> <tệp ghép mã.json> [--thu]'); process.exit(1); }
const K = JSON.parse(fs.readFileSync(file, 'utf8'));
const g = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
// Hàng tạo mới trên KiotViet sau lần chuyển: tệp phát sinh có thể kèm "mapping" riêng (mã KiotViet → mã trong sổ)
const mapping = { ...(g.mapping || g), ...(K.mapping || {}) };

const kvDate = (s) => String(s).slice(0, 10);
const kvIso = (s) => new Date(s).toISOString();
const pct = (disc, price) => (disc && price ? (disc / price) * 100 : 0);

openDb(config.dbPath);
const db = ctx.db;
const book = db.prepare(`select b.id, b.name, m.user_id from books b join book_members m on m.book_id = b.id and m.role = 'owner'
  where b.short_name = ? and b.is_demo = 0 order by b.created_at limit 1`).get(short);
if (!book) { console.error(`Không tìm thấy sổ "${short}"`); process.exit(1); }
const B = book.id;
const call = (fn, p) => callRpc(book.user_id, fn, { book_id: B, ...p });
const sql = (q, ...a) => db.prepare(q).run(...a);
const get = (q, ...a) => db.prepare(q).get(...a);

const unsupported = [
  ...(K.returns || []).map((x) => `${x.Code}: trả hàng`),
  ...(K.purchaseOrders || []).map((x) => `${x.Code}: nhập hàng`),
  ...(K.invoices || []).filter((x) => x.OrderCode || x.OrderId).map((x) => `${x.Code}: hóa đơn từ đặt hàng ${x.OrderCode}`),
  ...(K.orders || []).filter((x) => x.Status !== 1).map((x) => `${x.Code}: đặt hàng trạng thái ${x.Status}`),
  ...(K.ledger || []).filter((x) => x.side !== 'customers').map((x) => `${x.Code}: điều chỉnh công nợ NCC`),
  ...(K.cashflow || []).filter((x) => x.PartnerType !== 'C' || x.Amount <= 0).map((x) => `${x.Code}: phiếu quỹ không phải thu của khách`),
];
if (unsupported.length) { console.error('Có chứng từ chưa hỗ trợ nạp bổ sung, chưa ghi gì:\n' + unsupported.join('\n')); process.exit(1); }

const exists = (table, code) => !!get(`select 1 from ${table} where book_id = ? and code = ?`, B, code);
const setCode = (table, id, code, created) => {
  sql(`update ${table} set code = ?, created_at = ? where id = ?`, code, kvIso(created), id);
  sql(`update stock_moves set doc_code = ? where doc_id = ?`, code, id);
};
// Hàng: mã KiotViet đã ghép sang mã mới thì dùng mã mới; mã cũ trùng mã mới của hàng khác thì đã được đổi thành "<mã>-KV" lúc chuyển
const productOf = (code) => {
  const sku = mapping[code] || (get(`select 1 from products where book_id = ? and sku = ?`, B, `${code}-KV`) ? `${code}-KV` : code);
  const p = get(`select id from products where book_id = ? and sku = ?`, B, sku);
  if (!p) throw new Error(`Không tìm thấy hàng ${code} (mã trong sổ ${sku})`);
  return p.id;
};
const customerOf = (code) => {
  const c = get(`select id from customers where book_id = ? and code = ?`, B, code);
  if (!c) throw new Error(`Không tìm thấy khách ${code}`);
  return c.id;
};
const saleLines = (ls) => ls.filter((l) => l.Quantity > 0).map((l) => {
  const price = l.Price ?? 0; const disc = l.Discount || 0;
  if (disc >= 0 && disc < price) return { product_id: productOf(l.ProductCode), qty: l.Quantity, unit_price: price, discount_pct: pct(disc, price), note: l.Note || null };
  return { product_id: productOf(l.ProductCode), qty: l.Quantity, unit_price: Math.max(price - disc, 0), discount_pct: 0,
    note: [l.Note, `Giá niêm yết ${price.toLocaleString('vi-VN')}, điều chỉnh ${(-disc).toLocaleString('vi-VN')}`].filter(Boolean).join(' · ') };
});
// Thu khác: "VAT" là thuế theo tỷ lệ trên phiếu, còn lại (tiền vận chuyển) ghi vào phí vận chuyển
const surcharge = (doc) => {
  const list = doc.Surcharges || [];
  const vat = list.find((s) => String(s.Name || '').toUpperCase() === 'VAT');
  return { vatRate: vat ? vat.Ratio || 0 : 0, ship: Math.round(list.filter((s) => s !== vat).reduce((t, s) => t + (s.Price || 0), 0)) };
};

const done = []; const skipped = [];
const touched = new Set();
const events = [
  ...(K.customers || []).map((x) => ({ t: x.CreatedDate, k: 0, x, run: addCustomer })),
  ...(K.ledger || []).map((x) => ({ t: x.TransDate, k: 1, x, run: addDebtAdjust })),
  ...(K.orders || []).map((x) => ({ t: x.PurchaseDate, k: 2, x, run: addOrder })),
  ...(K.invoices || []).map((x) => ({ t: x.PurchaseDate, k: 3, x, run: addInvoice })),
  // Giờ phiếu thu chỉ ghi đến phút, nên xếp theo giờ tạo để phiếu cọc đứng sau đơn của nó
  ...(K.cashflow || []).map((x) => ({ t: x.CreatedDate || x.TransDate, k: 4, x, run: addPayment })),
].sort((a, b) => kvIso(a.t).localeCompare(kvIso(b.t)) || a.k - b.k);

function addCustomer(c) {
  if (exists('customers', c.Code)) return skipped.push(`${c.Code}: khách đã có`);
  const r = call('save_party', { type: 'kh', code: c.Code, name: c.Name || c.Code, phone: c.ContactNumber || null, address: c.Address || null,
    kind: c.Groups || null, note: c.Comments || null,
    extra: Object.fromEntries(Object.entries({ customer_type: c.Type === 1 ? 'Công ty' : null, email: c.Email, tax_code: c.TaxCode, tax_name: c.Organization,
      gender: c.Gender === true ? 'Nam' : c.Gender === false ? 'Nữ' : null, province: c.LocationName, ward: c.WardName }).filter(([, v]) => v != null && v !== '')) });
  sql('update customers set created_at = ? where id = ?', kvIso(c.CreatedDate), r.id);
  done.push(`khách ${c.Code} ${c.Name}`);
}

function addDebtAdjust(a) {
  if (get(`select 1 from opening_debts where book_id = ? and code = ?`, B, a.Code)) return skipped.push(`${a.Code}: đã có`);
  const r = call('save_opening_debt', { party_type: 'kh', party_id: customerOf(a.PartnerCode), amount: a.Value, debt_date: kvDate(a.TransDate),
    note: 'Điều chỉnh công nợ trên KiotViet' });
  sql(`update opening_debts set code = ?, created_at = ? where id = ?`, a.Code, kvIso(a.TransDate), r.id);
  touched.add(a.PartnerCode); done.push(`${a.Code} điều chỉnh nợ ${a.PartnerCode} ${a.Value.toLocaleString('vi-VN')}`);
}

function addOrder(o) {
  if (exists('sales_orders', o.Code)) return skipped.push(`${o.Code}: đặt hàng đã có`);
  const sc = surcharge(o);
  const r = call('save_sales_order', { kind: 'dat_hang', status: 'nhap', customer_id: customerOf(o.CustomerCode), order_date: kvDate(o.PurchaseDate),
    due_date: o.ExpectedDeliveryDate ? kvDate(o.ExpectedDeliveryDate) : null, staff: o.SoldBy || null, discount: o.Discount || 0,
    shipping_fee: sc.ship, vat_rate: sc.vatRate, note: o.Description || null, lines: saleLines(o.Details || []) });
  setCode('sales_orders', r.id, o.Code, o.CreatedDate);
  touched.add(o.CustomerCode); done.push(`${o.Code} đặt hàng ${o.CustomerCode} ${o.Total.toLocaleString('vi-VN')}`);
}

function addInvoice(i) {
  if (exists('sales_orders', i.Code) || exists('deliveries', i.Code)) return skipped.push(`${i.Code}: hóa đơn đã có`);
  if (i.Status !== 1) throw new Error(`${i.Code}: hóa đơn trạng thái ${i.Status}, chưa hỗ trợ`);
  const sc = surcharge(i);
  const pb = i.PriceBook && i.PriceBook !== 'Bảng giá chung' ? `Bảng giá KiotViet: ${i.PriceBook}` : null;
  const r = call('save_sales_order', { kind: 'ban_san', status: 'nhap', deliver_now: true, customer_id: customerOf(i.CustomerCode),
    order_date: kvDate(i.PurchaseDate), staff: i.SoldBy || null, discount: i.Discount || 0, shipping_fee: sc.ship, vat_rate: sc.vatRate,
    channel: i.SaleChannelName || null, note: [i.Description, pb].filter(Boolean).join('\n') || null, lines: saleLines(i.Details || []) });
  setCode('sales_orders', r.id, i.Code, i.CreatedDate);
  const d = get(`select id from deliveries where order_id = ?`, r.id);
  setCode('deliveries', d.id, i.Code, i.CreatedDate);
  const total = get(`select remaining_total from v_open_docs where book_id = ? and doc_type = 'don_ban' and doc_id = ?`, B, r.id)?.remaining_total;
  if (total != null && Math.abs(total - (i.Total - (i.TotalPayment || 0))) >= 1) throw new Error(`${i.Code}: tổng tiền trong sổ ${total} khác KiotViet ${i.Total}`);
  touched.add(i.CustomerCode); done.push(`${i.Code} hóa đơn ${i.CustomerCode} ${i.Total.toLocaleString('vi-VN')}`);
}

function addPayment(c) {
  if (exists('payments', c.Code)) return skipped.push(`${c.Code}: phiếu thu đã có`);
  if (c.Status !== 0) throw new Error(`${c.Code}: phiếu quỹ đã hủy trên KiotViet, chưa hỗ trợ`);
  const funds = db.prepare(`select id from funds where book_id = ? order by sort`).all(B);
  // Phiếu thu theo chứng từ: TTDH000068 → DH000068, TTHD… → HD…; không tìm thấy thì để hệ thống tự phân bổ theo nợ cũ nhất
  const docCode = /^TT(HD|DH)/.test(c.Code) ? c.Code.slice(2) : null;
  const target = docCode && (get(`select id from sales_orders where book_id = ? and code = ?`, B, docCode)?.id
    ?? get(`select order_id as id from deliveries where book_id = ? and code = ?`, B, docCode)?.id);
  const left = target && get(`select remaining_total, status from v_open_docs where book_id = ? and doc_type = 'don_ban' and doc_id = ?`, B, target);
  const a = left && left.status !== 'huy' ? Math.min(c.Amount, Math.max(left.remaining_total, 0)) : 0;
  const r = call('create_payment', { kind: 'thu_khach', date: kvDate(c.TransDate), fund_id: c.Method === 'Cash' || !c.Method ? funds[0].id : funds[1].id,
    party_id: customerOf(c.PartnerCode), amount: c.Amount, method: c.Method === 'Transfer' ? 'Chuyển khoản' : c.Method === 'Cash' ? 'Tiền mặt' : c.Method || null,
    note: [c.Description, c.CashGroup].filter(Boolean).join(' · ') || null,
    allocations: a > 0 ? [{ doc_type: 'don_ban', doc_id: target, amount: a }] : [], auto_allocate: !target });
  sql(`update payments set code = ?, created_at = ? where id = ?`, c.Code, kvIso(c.CreatedDate || c.TransDate), r.id);
  touched.add(c.PartnerCode); done.push(`${c.Code} thu ${c.PartnerCode} ${c.Amount.toLocaleString('vi-VN')}${a > 0 ? ` cho ${docCode}` : target ? ` trả trước (${docCode} còn là phiếu tạm)` : ''}`);
}

let backup = null;
if (!dry) {
  backup = `${config.dbPath}.truoc-bo-sung-${short}-${nowIso().slice(0, 23).replace(/[-:T.]/g, '')}.bak`;
  sql('vacuum into ?', backup);
  console.log(`Đã sao lưu CSDL: ${backup}`);
}
try {
  db.transaction(() => {
    for (const e of events) e.run(e.x);
    // Số chứng từ tiếp theo không trùng mã KiotViet cùng tiền tố (vd. DH000068.01 → bộ đếm DH ít nhất 68)
    const max = Math.max(0, ...db.prepare(`select code from sales_orders where book_id = ? and code like 'DH%'`).all(B).map((x) => Number(/^DH(\d+)/.exec(x.code)?.[1] || 0)));
    sql(`insert into doc_counters (book_id, kind, last_no) values (?, 'DH', ?) on conflict (book_id, kind) do update set last_no = max(last_no, excluded.last_no)`, B, max);
    // Đối chiếu công nợ với KiotViet (nếu tệp có expectedDebts)
    const bal = new Map(custBalances(B, '9999-12-31').map((x) => [x.party_id, Math.round(x.balance)]));
    const mismatch = Object.entries(K.expectedDebts || {}).filter(([code, v]) => bal.get(customerOf(code)) !== v)
      .map(([code, v]) => `${code}: sổ ${bal.get(customerOf(code)) ?? 0}, KiotViet ${v}`);
    console.log(`Sổ "${book.name}": đã thêm ${done.length}, bỏ qua ${skipped.length}.`);
    for (const x of done) console.log('  + ' + x);
    for (const x of skipped) console.log('  = ' + x);
    console.log('Công nợ sau khi thêm: ' + [...touched].map((code) => `${code} ${(bal.get(customerOf(code)) ?? 0).toLocaleString('vi-VN')}`).join(', '));
    if (mismatch.length) throw new Error('Công nợ chưa khớp KiotViet: ' + mismatch.join('; '));
    if (dry) throw Object.assign(new Error('chạy thử'), { dry: true });
  })();
  console.log('Đã ghi vào CSDL.');
} catch (e) {
  if (e.dry) console.log('Chạy thử: đã hoàn tác, không ghi gì.');
  else { console.error('Không nạp được, không ghi gì:', e.message); process.exit(1); }
}
