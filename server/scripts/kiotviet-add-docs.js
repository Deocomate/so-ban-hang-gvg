// Nạp bổ sung chứng từ KiotViet phát sinh sau lần chuyển (khách vẫn dùng KiotViet song song) vào sổ đang chạy.
// Dựng lại bằng chính hàm nghiệp vụ như kiotviet-convert.js, giữ mã và giờ tạo KiotViet. Chứng từ có mã đã có trong sổ thì bỏ qua,
// nên chạy lại cùng tệp không ghi trùng. Tất cả trong một giao dịch: lỗi ở đâu thì không ghi gì.
// Hỗ trợ: hàng mới, khách hàng mới, phiếu điều chỉnh công nợ khách (CB…), hóa đơn bán thẳng, hóa đơn từ đặt hàng (giao trên đơn đặt),
// đặt hàng, phiếu thu khách; hóa đơn/đặt hàng đã hủy trên KiotViet (KiotViet "sửa" hóa đơn bằng cách hủy rồi lập bản .01, .02…)
// thì hủy theo trong sổ; phiếu thu đã mất khỏi sổ công nợ KiotViet thì hủy theo.
// Loại khác (trả hàng, nhập hàng…) thì dừng và báo, không bỏ qua im lặng.
// Phiếu thu lập trên sổ mới (không mang mã KiotViet "TT…") được giữ nguyên; công nợ đối chiếu = nợ KiotViet trừ các phiếu đó.
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
const vnd = (n) => Math.round(n).toLocaleString('vi-VN');
// Sổ công nợ từng khách: tệp cũ ghi "ledger" là danh sách phiếu CB, tệp mới ghi "ledgers" là toàn bộ sổ công nợ theo mã khách
const ledgers = K.ledgers || null;
const debtAdjusts = K.ledger || Object.entries(ledgers || {}).flatMap(([code, rows]) => rows.filter((r) => r.DocumentType === 1)
  .map((r) => ({ side: 'customers', PartnerCode: code, Code: r.DocumentCode, TransDate: r.TransDate, Value: r.Value })));
const expected = K.expectedDebts || Object.fromEntries((K.customers || []).filter((c) => ledgers?.[c.Code]).map((c) => [c.Code, Math.round(c.Debt || 0)]));

openDb(config.dbPath);
const db = ctx.db;
const book = db.prepare(`select b.id, b.name, m.user_id from books b join book_members m on m.book_id = b.id and m.role = 'owner'
  where b.short_name = ? and b.is_demo = 0 order by b.created_at limit 1`).get(short);
if (!book) { console.error(`Không tìm thấy sổ "${short}"`); process.exit(1); }
const B = book.id;
const call = (fn, p) => callRpc(book.user_id, fn, { book_id: B, ...p });
const sql = (q, ...a) => db.prepare(q).run(...a);
const get = (q, ...a) => db.prepare(q).get(...a);
const rows = (q, ...a) => db.prepare(q).all(...a);

const unsupported = [
  ...(K.returns || []).map((x) => `${x.Code}: trả hàng`),
  ...(K.purchaseOrders || []).map((x) => `${x.Code}: nhập hàng`),
  ...(K.invoices || []).filter((x) => ![1, 2].includes(x.Status)).map((x) => `${x.Code}: hóa đơn trạng thái ${x.Status}`),
  ...(K.orders || []).filter((x) => ![1, 3, 4].includes(x.Status)).map((x) => `${x.Code}: đặt hàng trạng thái ${x.Status}`),
  ...debtAdjusts.filter((x) => x.side !== 'customers').map((x) => `${x.Code}: điều chỉnh công nợ NCC`),
  ...(K.cashflow || []).filter((x) => x.PartnerType !== 'C' || x.Amount <= 0).map((x) => `${x.Code}: phiếu quỹ không phải thu của khách`),
];
if (unsupported.length) { console.error('Có chứng từ chưa hỗ trợ nạp bổ sung, chưa ghi gì:\n' + unsupported.join('\n')); process.exit(1); }

const exists = (table, code) => !!get(`select 1 from ${table} where book_id = ? and code = ?`, B, code);
const setCode = (table, id, code, created) => {
  sql(`update ${table} set code = ?, created_at = ? where id = ?`, code, kvIso(created), id);
  sql(`update stock_moves set doc_code = ? where doc_id = ?`, code, id);
};
const orderByCode = (code) => get(`select * from sales_orders where book_id = ? and code = ?`, B, code);
// Hàng: mã KiotViet đã ghép sang mã mới thì dùng mã mới; mã cũ trùng mã mới của hàng khác thì đã được đổi thành "<mã>-KV" lúc chuyển
const skuOf = (code) => mapping[code] || (get(`select 1 from products where book_id = ? and sku = ?`, B, `${code}-KV`) ? `${code}-KV` : code);
const productOf = (code) => {
  const p = get(`select id from products where book_id = ? and sku = ?`, B, skuOf(code));
  if (!p) throw new Error(`Không tìm thấy hàng ${code} (mã trong sổ ${skuOf(code)})`);
  return p.id;
};
// Hóa đơn không chọn khách trên KiotViet là khách lẻ
const customerOf = (code) => {
  const c = get(`select id from customers where book_id = ? and code = ?`, B, code || 'KL');
  if (!c) throw new Error(`Không tìm thấy khách ${code}`);
  return c.id;
};
const saleLines = (ls) => ls.filter((l) => l.Quantity > 0).map((l) => {
  const price = l.Price ?? 0; const disc = l.Discount || 0;
  if (disc >= 0 && disc < price) return { product_id: productOf(l.ProductCode), qty: l.Quantity, unit_price: price, discount_pct: pct(disc, price), note: l.Note || null };
  return { product_id: productOf(l.ProductCode), qty: l.Quantity, unit_price: Math.max(price - disc, 0), discount_pct: 0,
    note: [l.Note, `Giá niêm yết ${vnd(price)}, điều chỉnh ${vnd(-disc)}`].filter(Boolean).join(' · ') };
});
// Thu khác: "VAT" là thuế theo tỷ lệ trên phiếu, còn lại (tiền vận chuyển) ghi vào phí vận chuyển
const surcharge = (doc) => {
  const list = doc.Surcharges || [];
  const vat = list.find((s) => String(s.Name || '').toUpperCase() === 'VAT');
  return { vatRate: vat ? vat.Ratio || 0 : 0, ship: Math.round(list.filter((s) => s !== vat).reduce((t, s) => t + (s.Price || 0), 0)) };
};
const remaining = (id) => get(`select remaining_total, status from v_open_docs where book_id = ? and doc_type = 'don_ban' and doc_id = ?`, B, id);
// Phiếu thu KiotViet đang gắn với chứng từ nào (sau khi KiotViet chuyển tiền của hóa đơn bị sửa sang bản mới, hoặc của đặt hàng sang hóa đơn)
const payHome = new Map();
for (const d of [...(K.orders || []), ...(K.invoices || [])]) {
  if (d.Status === 2 || d.Status === 4) continue;
  for (const p of d.Payments || []) if (p.Amount > 0 && !/^TTTU/.test(p.Code)) payHome.set(p.Code, d.Code);
}

const done = []; const skipped = [];
const createdNow = new Set();   // hóa đơn vừa lập ở trạng thái hủy trong lần chạy này
// Xung đột: chứng từ KiotViet đã hủy nhưng trên sổ mới đã có người giao hàng. Không tự hủy phần người dùng đã làm; khách đó để nguyên, báo lại.
const conflicts = []; const conflictCust = new Set();
const touched = new Set();
const viaOrder = [];   // hóa đơn giao trên đơn đặt: sau cùng trừ tiền cọc của đơn vào hóa đơn
const tOf = (x) => x.PurchaseDate || x.CreatedDate;
const events = [
  ...(K.products || []).map((x) => ({ t: x.CreatedDate, k: 0, x, run: addProduct })),
  ...(K.customers || []).map((x) => ({ t: x.CreatedDate, k: 1, x, run: addCustomer })),
  ...debtAdjusts.map((x) => ({ t: x.TransDate, k: 2, x, run: addDebtAdjust })),
  ...(K.orders || []).map((x) => ({ t: x.CreatedDate || tOf(x), k: 3, x, run: addOrder })),
  ...(K.invoices || []).map((x) => ({ t: x.CreatedDate || tOf(x), k: 4, x, run: addInvoice })),
  // Giờ phiếu thu chỉ ghi đến phút, nên xếp theo giờ tạo để phiếu cọc đứng sau đơn của nó
  ...(K.cashflow || []).map((x) => ({ t: x.CreatedDate || x.TransDate, k: 5, x, run: addPayment })),
  // Hủy theo KiotViet: sau khi các bản thay thế đã lập
  ...(K.invoices || []).filter((x) => x.Status === 2).map((x) => ({ t: x.ModifiedDate || x.CreatedDate, k: 6, x, run: cancelInvoice })),
  ...(K.orders || []).filter((x) => x.Status === 4).map((x) => ({ t: x.ModifiedDate || x.CreatedDate, k: 6, x, run: cancelOrder })),
].sort((a, b) => kvIso(a.t).localeCompare(kvIso(b.t)) || a.k - b.k);

function addProduct(p) {
  const sku = skuOf(p.Code);
  if (get(`select 1 from products where book_id = ? and sku = ?`, B, sku)) return skipped.push(`${p.Code}: hàng đã có (${sku})`);
  const cat = [...(K.invoices || []), ...(K.orders || [])].flatMap((d) => d.Details || []).find((l) => l.ProductCode === p.Code && l.CategoryTree)?.CategoryTree;
  const r = call('save_product', { sku, name: p.Name || p.Code, unit: p.Unit || 'Cái', category: p.CategoryName || cat || null,
    brand: p.TradeMarkName || null, price1: p.BasePrice || 0, price2: p.BasePrice || 0, price3: p.BasePrice || 0, price4: p.BasePrice || 0, price5: p.BasePrice || 0,
    cost: p.Cost || 0, note: `Tạo trên KiotViet ${kvDate(p.CreatedDate).split('-').reverse().join('/')}${p.FullName && p.FullName !== p.Name ? `: ${p.FullName}` : ''}` });
  sql('update products set created_at = ? where id = ?', kvIso(p.CreatedDate), r.id);
  done.push(`hàng ${sku} ${p.Name} giá ${vnd(p.BasePrice || 0)}`);
}

function addCustomer(c) {
  if (exists('customers', c.Code)) return skipped.push(`${c.Code}: khách đã có`);
  const r = call('save_party', { type: 'kh', code: c.Code, name: c.Name || c.Code, phone: c.ContactNumber || null, address: c.Address || null,
    kind: c.Groups || (c.Type === 1 ? 'Công ty' : null), note: c.Comments || null,
    extra: Object.fromEntries(Object.entries({ email: c.Email, tax_code: c.TaxCode, tax_name: c.Organization,
      gender: c.Gender === true ? 'Nam' : c.Gender === false ? 'Nữ' : null, province: c.LocationName, ward: c.WardName }).filter(([, v]) => v != null && v !== '')) });
  sql('update customers set created_at = ? where id = ?', kvIso(c.CreatedDate), r.id);
  done.push(`khách ${c.Code} ${c.Name}`);
}

function addDebtAdjust(a) {
  if (get(`select 1 from opening_debts where book_id = ? and code = ?`, B, a.Code)) return skipped.push(`${a.Code}: đã có`);
  const r = call('save_opening_debt', { party_type: 'kh', party_id: customerOf(a.PartnerCode), amount: a.Value, debt_date: kvDate(a.TransDate),
    note: 'Điều chỉnh công nợ trên KiotViet' });
  sql(`update opening_debts set code = ?, created_at = ? where id = ?`, a.Code, kvIso(a.TransDate), r.id);
  touched.add(a.PartnerCode); done.push(`${a.Code} điều chỉnh nợ ${a.PartnerCode} ${vnd(a.Value)}`);
}

function addOrder(o) {
  if (exists('sales_orders', o.Code)) return skipped.push(`${o.Code}: đặt hàng đã có`);
  const sc = surcharge(o);
  const r = call('save_sales_order', { kind: 'dat_hang', status: 'nhap', customer_id: customerOf(o.CustomerCode), order_date: kvDate(o.PurchaseDate),
    due_date: o.ExpectedDeliveryDate ? kvDate(o.ExpectedDeliveryDate) : null, staff: o.SoldBy || null, discount: o.Discount || 0,
    shipping_fee: sc.ship, vat_rate: sc.vatRate, note: o.Description || null, lines: saleLines(o.Details || []) });
  setCode('sales_orders', r.id, o.Code, o.CreatedDate);
  touched.add(o.CustomerCode); done.push(`${o.Code} đặt hàng ${o.CustomerCode} ${vnd(o.Total)}`);
}

// Hóa đơn lập từ đặt hàng: giao trên chính đơn đặt trong sổ. Đơn còn là phiếu tạm thì sửa dòng hàng theo bản cuối trên KiotViet rồi xác nhận.
function deliverFromOrder(i) {
  const o = orderByCode(i.OrderCode);
  if (!o) throw new Error(`${i.Code}: không tìm thấy đặt hàng ${i.OrderCode} trong sổ`);
  if (o.status === 'huy') throw new Error(`${i.Code}: đặt hàng ${i.OrderCode} đã hủy trong sổ`);
  const kvo = (K.orders || []).find((x) => x.Code === i.OrderCode);
  const sc = surcharge(i);
  if (o.status === 'nhap') {
    const lines = saleLines(kvo?.Details || i.Details || []);
    call('save_sales_order', { id: o.id, kind: 'dat_hang', status: 'nhap', customer_id: o.customer_id, order_date: o.order_date, due_date: o.due_date,
      staff: o.staff, discount: i.Discount || 0, shipping_fee: sc.ship, vat_rate: sc.vatRate, note: o.note, lines });
    call('confirm_sales_order', { id: o.id });
  }
  const ours = rows(`select * from sales_order_lines where order_id = ? order by line_no`, o.id);
  const used = new Set();
  const req = (i.Details || []).filter((l) => l.Quantity > 0).map((l) => {
    const pid = productOf(l.ProductCode);
    const ol = ours.find((x) => !used.has(x.id) && x.product_id === pid && x.qty - x.cancelled_qty - x.delivered_qty >= l.Quantity - 1e-9);
    if (!ol) throw new Error(`${i.Code}: dòng ${l.ProductCode} × ${l.Quantity} không khớp phần còn lại của đặt hàng ${i.OrderCode}`);
    used.add(ol.id);
    return { order_line_id: ol.id, qty: l.Quantity };
  });
  const d = call('deliver', { order_id: o.id, date: kvDate(i.PurchaseDate), shipping_fee: sc.ship, lines: req, override: true });
  setCode('deliveries', d.id, i.Code, i.CreatedDate);
  viaOrder.push({ i, orderId: o.id, kvo });
  return o.id;
}

function addInvoice(i) {
  if (exists('deliveries', i.Code) || exists('sales_orders', i.Code)) return skipped.push(`${i.Code}: hóa đơn đã có`);
  if (i.Status === 1 && i.OrderCode) {
    deliverFromOrder(i);
    touched.add(i.CustomerCode); done.push(`${i.Code} hóa đơn từ ${i.OrderCode} ${i.CustomerCode} ${vnd(i.Total)}`);
    return;
  }
  const sc = surcharge(i);
  const pb = i.PriceBook && i.PriceBook !== 'Bảng giá chung' ? `Bảng giá KiotViet: ${i.PriceBook}` : null;
  const live = i.Status === 1;
  const r = call('save_sales_order', { kind: 'ban_san', status: 'nhap', deliver_now: live, override: true, customer_id: customerOf(i.CustomerCode),
    order_date: kvDate(i.PurchaseDate), staff: i.SoldBy || null, discount: i.Discount || 0, shipping_fee: sc.ship, vat_rate: sc.vatRate,
    channel: i.SaleChannelName || null, note: [i.Description, pb].filter(Boolean).join('\n') || null, lines: saleLines(i.Details || []) });
  setCode('sales_orders', r.id, i.Code, i.CreatedDate);
  if (!live) {
    createdNow.add(i.Code);
    // Bản đã bị sửa/hủy trên KiotViet trước khi kịp nạp: giữ trong sổ ở trạng thái hủy để tra lại lịch sử, như lần chuyển đầu
    call('cancel_sales_order', { id: r.id, reason: 'Hóa đơn đã hủy trên KiotViet' });
    return done.push(`${i.Code} hóa đơn đã hủy trên KiotViet (ghi để tra lịch sử) ${i.CustomerCode || 'khách lẻ'} ${vnd(i.Total)}`);
  }
  const d = get(`select id from deliveries where order_id = ?`, r.id);
  setCode('deliveries', d.id, i.Code, i.CreatedDate);
  const total = remaining(r.id)?.remaining_total;
  if (total != null && Math.abs(total - i.Total) >= 1) throw new Error(`${i.Code}: tổng tiền trong sổ ${total} khác KiotViet ${i.Total}`);
  touched.add(i.CustomerCode || 'KL'); done.push(`${i.Code} hóa đơn ${i.CustomerCode || 'khách lẻ'} ${vnd(i.Total)}`);
}

// Bản mới nhất còn hiệu lực của một hóa đơn bị sửa trên KiotViet (HD001237.01 → HD001237.02)
const successorOf = (code) => {
  const base = code.split('.')[0];
  const live = (K.invoices || []).filter((x) => x.Status === 1 && x.Code.split('.')[0] === base && x.Code !== code).sort((a, b) => b.Code.localeCompare(a.Code))[0];
  return live ? orderByCode(live.Code) : null;
};

function cancelInvoice(i) {
  const o = orderByCode(i.Code);
  if (!o) return;   // vừa lập ở trạng thái hủy, hoặc chưa từng nạp
  if (o.status === 'huy') return createdNow.has(i.Code) ? null : skipped.push(`${i.Code}: đã hủy trong sổ`);
  for (const d of rows(`select id from deliveries where order_id = ?`, o.id)) call('cancel_delivery', { id: d.id, reason: `Hóa đơn ${i.Code} đã hủy trên KiotViet` });
  // Tiền đã thu cho bản bị hủy chuyển sang bản thay thế (như KiotViet làm khi sửa hóa đơn); phần dư thành tiền khách trả trước
  const allocs = rows(`select a.id, a.amount, p.code from payment_allocations a join payments p on p.id = a.payment_id
    where a.doc_type = 'don_ban' and a.doc_id = ? and p.voided = 0 order by p.created_at`, o.id);
  const next = successorOf(i.Code);
  const moved = [];
  for (const a of allocs) {
    const left = next ? Math.max(remaining(next.id)?.remaining_total ?? 0, 0) : 0;
    const m = Math.min(a.amount, left);
    if (m > 0) { sql(`update payment_allocations set doc_id = ?, amount = ? where id = ?`, next.id, m, a.id); moved.push(`${a.code} ${vnd(m)} sang ${next.code}`); }
    else sql(`delete from payment_allocations where id = ?`, a.id);
    if (m < a.amount) moved.push(`${a.code} ${vnd(a.amount - m)} thành tiền trả trước`);
  }
  call('cancel_sales_order', { id: o.id, reason: `Hóa đơn đã hủy trên KiotViet${next ? `, thay bằng ${next.code}` : ''}` });
  touched.add(i.CustomerCode || 'KL'); done.push(`${i.Code} hủy theo KiotViet${moved.length ? ` (${moved.join('; ')})` : ''}`);
}

function cancelOrder(o) {
  const x = orderByCode(o.Code);
  if (!x) return skipped.push(`${o.Code}: đặt hàng đã hủy trên KiotViet, chưa từng nạp`);
  if (x.status === 'huy') return skipped.push(`${o.Code}: đã hủy trong sổ`);
  const sent = rows(`select code from deliveries where order_id = ?`, x.id).map((d) => d.code);
  if (sent.length) {
    conflictCust.add(o.CustomerCode);
    return conflicts.push(`${o.Code} (${o.CustomerCode}): KiotViet đã hủy nhưng trên sổ mới đã giao ${sent.join(', ')}; chưa hủy, khách này để nguyên`);
  }
  sql(`delete from payment_allocations where doc_type = 'don_ban' and doc_id = ?`, x.id);
  call('cancel_sales_order', { id: x.id, reason: 'Đặt hàng đã hủy trên KiotViet' });
  touched.add(o.CustomerCode); done.push(`${o.Code} hủy đặt hàng theo KiotViet`);
}

function addPayment(c) {
  if (exists('payments', c.Code)) return skipped.push(`${c.Code}: phiếu thu đã có`);
  if (c.Status !== 0) throw new Error(`${c.Code}: phiếu quỹ đã hủy trên KiotViet, chưa hỗ trợ`);
  const funds = db.prepare(`select id from funds where book_id = ? order by sort`).all(B);
  // Phiếu thu theo chứng từ: KiotViet cho biết phiếu đang thuộc chứng từ nào; không có thì đoán theo mã TTDH000068 → DH000068, TTHD… → HD…
  const docCode = payHome.get(c.Code) || (/^TT(HD|DH)/.test(c.Code) ? c.Code.slice(2).replace(/-\d+$/, '') : null);
  const target = docCode && (orderByCode(docCode)?.id ?? get(`select order_id as id from deliveries where book_id = ? and code = ?`, B, docCode)?.id);
  const left = target && remaining(target);
  const a = left && left.status !== 'huy' ? Math.min(c.Amount, Math.max(left.remaining_total, 0)) : 0;
  const r = call('create_payment', { kind: 'thu_khach', date: kvDate(c.TransDate), fund_id: c.Method === 'Cash' || !c.Method ? funds[0].id : funds[1].id,
    party_id: customerOf(c.PartnerCode), amount: c.Amount, method: c.Method === 'Transfer' ? 'Chuyển khoản' : c.Method === 'Cash' ? 'Tiền mặt' : c.Method || null,
    note: [c.Description, c.CashGroup].filter(Boolean).join(' · ') || null,
    allocations: a > 0 ? [{ doc_type: 'don_ban', doc_id: target, amount: a }] : [], auto_allocate: !target });
  sql(`update payments set code = ?, created_at = ? where id = ?`, c.Code, kvIso(c.CreatedDate || c.TransDate), r.id);
  touched.add(c.PartnerCode || 'KL'); done.push(`${c.Code} thu ${c.PartnerCode || 'khách lẻ'} ${vnd(c.Amount)}${a > 0 ? ` cho ${docCode}` : target ? ` trả trước (${docCode} còn là phiếu tạm)` : ''}`);
}

// Phiếu thu mang mã KiotViet trong sổ mà sổ công nợ KiotViet của khách không còn (KiotViet xóa tiền cọc khi hủy đặt hàng): hủy theo
function voidMissingPayments() {
  if (!ledgers) return;
  for (const [code, list] of Object.entries(ledgers)) {
    if (conflictCust.has(code)) continue;
    const kvCodes = new Set(list.map((r) => r.DocumentCode));
    for (const p of rows(`select p.id, p.code, p.amount from payments p join customers c on c.id = p.party_id
        where p.book_id = ? and c.code = ? and p.voided = 0 and p.code like 'TT%'`, B, code)) {
      if (kvCodes.has(p.code)) continue;
      sql(`delete from payment_allocations where payment_id = ?`, p.id);
      call('void_payment', { id: p.id, reason: 'Phiếu đã hủy trên KiotViet' });
      touched.add(code); done.push(`${p.code} hủy phiếu thu ${code} ${vnd(p.amount)} (KiotViet đã hủy)`);
    }
  }
}

// Tiền cọc của đặt hàng (ghi là trả trước khi đơn còn là phiếu tạm) trừ vào đơn sau khi đã giao thành hóa đơn
function applyDeposits() {
  for (const { i, orderId } of viaOrder) {
    const codes = [...payHome.entries()].filter(([, doc]) => doc === i.OrderCode || doc === i.Code).map(([c]) => c);
    for (const code of codes) {
      const p = get(`select id, amount from payments where book_id = ? and code = ? and voided = 0`, B, code);
      if (!p) continue;
      const used = get(`select coalesce(sum(amount), 0) s from payment_allocations where payment_id = ?`, p.id).s;
      const m = Math.min(p.amount - used, Math.max(remaining(orderId)?.remaining_total ?? 0, 0));
      if (m <= 0) continue;
      sql(`insert into payment_allocations (id, payment_id, book_id, doc_type, doc_id, amount) values (lower(hex(randomblob(16))), ?, ?, 'don_ban', ?, ?)`, p.id, B, orderId, m);
      done.push(`${code} trừ ${vnd(m)} vào ${i.Code}`);
    }
    const left = remaining(orderId)?.remaining_total ?? 0;
    const kvLeft = i.Total - (i.TotalPayment || 0);
    if (Math.abs(left - kvLeft) >= 1) throw new Error(`${i.Code}: còn nợ trong sổ ${left} khác KiotViet ${kvLeft}`);
  }
}

let backup = null;
if (!dry) {
  backup = `${config.dbPath}.truoc-bo-sung-${short}-${nowIso().slice(0, 23).replace(/[-:T.]/g, '')}.bak`;
  sql('vacuum into ?', backup);
  console.log(`Đã sao lưu CSDL: ${backup}`);
}
try {
  db.transaction(() => {
    for (const e of events) {
      try { e.run(e.x); } catch (err) { throw new Error(`${e.x.Code}: ${err.message}`); }
    }
    voidMissingPayments();
    applyDeposits();
    // Số chứng từ tiếp theo không trùng mã KiotViet cùng tiền tố (vd. DH000068.01 → bộ đếm DH ít nhất 68)
    const max = Math.max(0, ...db.prepare(`select code from sales_orders where book_id = ? and code like 'DH%'`).all(B).map((x) => Number(/^DH(\d+)/.exec(x.code)?.[1] || 0)));
    sql(`insert into doc_counters (book_id, kind, last_no) values (?, 'DH', ?) on conflict (book_id, kind) do update set last_no = max(last_no, excluded.last_no)`, B, max);
    // Đối chiếu công nợ với KiotViet: phiếu thu lập trên sổ mới (mã không phải "TT…") KiotViet không có, nên trừ ra trước khi so
    const bal = new Map(custBalances(B, '9999-12-31').map((x) => [x.party_id, Math.round(x.balance)]));
    const ownPaid = (code) => get(`select coalesce(sum(p.amount), 0) s from payments p join customers c on c.id = p.party_id
      where p.book_id = ? and c.code = ? and p.voided = 0 and p.kind = 'thu_khach' and p.code not like 'TT%' and p.created_at >= '2026-11-10'`, B, code).s;
    const mismatch = Object.entries(expected).filter(([code]) => !conflictCust.has(code)).filter(([code, v]) => (bal.get(customerOf(code)) ?? 0) !== Math.round(v - ownPaid(code)))
      .map(([code, v]) => `${code}: sổ ${bal.get(customerOf(code)) ?? 0}, KiotViet ${v}${ownPaid(code) ? ` trừ ${ownPaid(code)} thu trên sổ mới` : ''}`);
    console.log(`Sổ "${book.name}": đã thêm/sửa ${done.length}, bỏ qua ${skipped.length}.`);
    for (const x of done) console.log('  + ' + x);
    for (const x of skipped) console.log('  = ' + x);
    for (const x of conflicts) console.log('  ! ' + x);
    console.log('Công nợ sau khi nạp: ' + [...touched].filter((c) => c !== 'KL').map((code) => {
      const own = ownPaid(code);
      return `${code} ${vnd(bal.get(customerOf(code)) ?? 0)}${expected[code] != null ? ` (KiotViet ${vnd(expected[code])}${own ? `, đã thu thêm trên sổ mới ${vnd(own)}` : ''})` : ''}`;
    }).join('\n  '));
    if (mismatch.length) throw new Error('Công nợ chưa khớp KiotViet: ' + mismatch.join('; '));
    if (dry) throw Object.assign(new Error('chạy thử'), { dry: true });
  })();
  console.log('Đã ghi vào CSDL.');
} catch (e) {
  if (e.dry) console.log('Chạy thử: đã hoàn tác, không ghi gì.');
  else { console.error('Không nạp được, không ghi gì:', e.message); process.exit(1); }
}
