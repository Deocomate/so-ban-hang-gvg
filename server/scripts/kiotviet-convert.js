// Chuyển dữ liệu xuất từ KiotViet (tệp JSON lấy qua API quản lý KiotViet) thành bản sao lưu gomsu-backup-v1 của sổ Thanh Hải.
// Mọi chứng từ được dựng lại bằng chính hàm nghiệp vụ của hệ thống trên một CSDL tạm trong bộ nhớ, theo đúng thứ tự thời gian,
// nên giá vốn, sổ kho, công nợ do hệ thống tự tính. Mã chứng từ, ngày giờ tạo của KiotViet được giữ nguyên.
// Phần nào không dựng lại được (hoặc lệch) được ghi vào báo cáo trả về, không bỏ qua im lặng.
import crypto from 'node:crypto';
import { openDb } from '../src/db/index.js';
import { ctx, nowIso } from '../src/lib/context.js';
import { callRpc } from '../src/domain/rpc.js';
import { setUser, bookSettings as bookSettingsOf } from '../src/domain/access.js';
import { doAdjust } from '../src/domain/stock.js';
import { custBalances, suppBalances } from '../src/domain/reports.js';

// Mức giá trong sổ ← bảng giá KiotViet (đã chốt với khách 05/11/2026). Mức thiếu giá lấy giá bán chung.
export const PRICE_TIER_BOOKS = { price1: 0, price2: 'Đại lý MẸ', price3: 'Công trình', price4: 'Đại lý MAI', price5: 'Giá công trình' };
// Nhóm khách KiotViet → mức giá mặc định
export const GROUP_TIER = { 'Khách lẻ': 1, 'ĐẠI LÝ CẤP 1': 2, 'Công trình': 3, 'Khách buôn': 4 };
const SURCHARGE_VAT = 'VAT';
const OPENING_DATE = '2020-07-31';   // trước chứng từ đầu tiên trên KiotViet (01/08/2020)

const DEL_RE = /\{DEL\d*\}$/;
const kvDate = (s) => String(s).slice(0, 10);                       // KiotViet trả giờ Việt Nam (+07:00)
const kvIso = (s) => new Date(s).toISOString();
const r0 = (x) => Math.round(x);
const stripUnit = (name, unit) => {
  const n = String(name || '').trim();
  const suf = unit ? ` (${unit})` : null;
  return suf && n.endsWith(suf) ? n.slice(0, -suf.length).trim() : n;
};
const pct = (disc, price) => (disc && price ? (disc / price) * 100 : 0);
const lineSum = (ls) => ls.reduce((t, l) => t + (l.SubTotal ?? l.Quantity * ((l.Price || 0) - (l.Discount || 0))), 0);

// Một dòng file mẫu nhập hàng hóa (bản TH) → trường của save_product. Đọc như chức năng nhập Excel của ứng dụng:
// giá theo tên mức giá của sổ, "Định mức" dạng "27 viên/m2" / "5 viên/m dài", số đầu tiên trong ô quy cách.
const plain = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();
const leadNum = (v) => { if (typeof v === 'number') return v; const m = String(v ?? '').match(/\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : null; };
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
export function catalogFields(r, priceNames) {
  const col = (label) => { const k = Object.keys(r).find((x) => plain(x).replace(/\s*\*$/, '') === plain(label)); return k ? r[k] : null; };
  const norm = txt(col('Định mức'));
  const n = leadNum(norm);
  const byM = norm && /\/\s*(m\s*dai|md)\b/.test(plain(norm));
  return {
    sku: txt(col('Mã SKU')), name: txt(col('Tên hàng hóa')), category: txt(col('Nhóm hàng')), material: txt(col('Chất liệu')),
    size: txt(col('Kích thước (mm)')) ?? txt(col('Kích thước')), color: txt(col('Màu sắc')), brand: txt(col('Thương hiệu')), unit: txt(col('ĐVT')) || 'Cái',
    norm_m2: norm && !byM ? n : null, norm_m: norm && byM ? n : null,
    cost: leadNum(col('Giá vốn')) ?? 0,
    ...Object.fromEntries(priceNames.map((name, i) => [`price${i + 1}`, leadNum(col(name)) ?? 0])),
    low_stock: leadNum(col('Tồn tối thiểu')) ?? 0, units_per_pack: leadNum(col('Số viên/hộp')),
    pack_unit: txt(col('Đơn vị đóng gói'))?.toLowerCase() || undefined,
    pack_weight: leadNum(col('Trọng lượng/thùng (kg)')), unit_weight: leadNum(col('Trọng lượng/viên (kg)')), note: txt(col('Ghi chú')),
  };
}

const HIDDEN_NOTE = 'Chứng từ ở chi nhánh cũ đã xóa trên KiotViet (không mở được đầu phiếu), dựng lại từ sổ công nợ và chi tiết dòng hàng';
export function withHiddenDocs(K, ledger, hidden) {
  const docs = Object.assign({}, ...[].concat(hidden || []).map((h) => h?.docs || {}));
  if (!Object.keys(docs).length || !ledger) return K;
  const rowOf = new Map(['customers', 'suppliers'].flatMap((side) => Object.entries(ledger[side] || {})
    .flatMap(([pid, l]) => (l.rows || []).map((r) => [`${side}:${r.DocumentId}`, { ...r, PartnerId: Number(pid) }]))));
  const have = new Set([...(K.invoices || []), ...(K.returns || []), ...(K.purchaseOrders || [])].map((x) => x.Code));
  const invoices = []; const returns = []; const purchases = [];
  for (const [id, d] of Object.entries(docs)) {
    if (d.type === 2) {
      // Phiếu nhập chi nhánh cũ: có đủ đầu phiếu
      if (d.head && !have.has(d.head.Code)) purchases.push({ ...d.head, Details: d.details, Description: [d.head.Description, HIDDEN_NOTE].filter(Boolean).join('\n'), hidden: true });
      continue;
    }
    const r = rowOf.get(`customers:${id}`);
    if (!r || have.has(r.DocumentCode)) continue;
    if (d.type === 3) {
      const goods = lineSum(d.details); const value = r.Value;
      const cust = (K.customers || []).find((c) => c.Id === r.PartnerId);
      invoices.push({ Id: Number(id), Code: r.DocumentCode, PurchaseDate: r.TransDate, CreatedDate: r.TransDate, CustomerId: r.PartnerId, Status: 1, StatusValue: 'Hoàn thành',
        CustomerCode: cust?.Code, CustomerName: cust?.Name, CustomerContactNumber: cust?.ContactNumber, CustomerAddress: cust?.Address, Total: value, PaidAmount: null,
        Details: d.details, Discount: Math.max(goods - value, 0), Description: HIDDEN_NOTE, hidden: true,
        InvoiceOrderSurcharges: value > goods ? [{ SurchargeId: 'chenh_lech', SurchargeName: 'Thu khác', Price: value - goods }] : [] });
    } else if (d.type === 4 && d.head) {
      returns.push({ ...d.head, Details: d.details, CustomerId: d.head.CustomerId ?? r.PartnerId, Description: [d.head.Description, HIDDEN_NOTE].filter(Boolean).join('\n'), hidden: true });
    }
  }
  return { ...K, invoices: [...(K.invoices || []), ...invoices], returns: [...(K.returns || []), ...returns], purchaseOrders: [...(K.purchaseOrders || []), ...purchases] };
}

// ledger (không bắt buộc): sổ công nợ KiotViet {customers: {id: {code, rows}}, suppliers: {...}}, lấy từ customers/{id}/debt và suppliers/{id}/debt.
// Dòng loại 1 (mã CB…) là phiếu điều chỉnh công nợ, không có trong sổ quỹ: ghi thành khoản nợ có ngày, mã CB giữ nguyên.
// hidden (không bắt buộc, một tệp hoặc mảng tệp): {docs: {DocumentId: {type: 2|3|4, head, details}}} — phiếu nhập (2), hóa đơn (3),
// trả hàng (4) của chi nhánh cũ đã xóa, có trong sổ công nợ nhưng không có trong danh sách. Hóa đơn không mở được đầu phiếu thì
// dựng lại từ dòng sổ công nợ (ngày, khách, giá trị) và chi tiết dòng hàng.
// catalog (không bắt buộc): danh mục hàng mới của khách {rows: dòng Excel theo file mẫu nhập, images: {số dòng: {full, thumb}},
// mapping: {mã KiotViet: mã mới}}. Có danh mục thì tên, giá, quy cách, ảnh lấy theo file; tồn kho vẫn theo KiotViet.
export function convertKiotViet(K0, { today, ledger = null, hidden = null, catalog = null, log = () => {} } = {}) {
  const K = withHiddenDocs(K0, ledger, hidden);
  openDb(':memory:');
  const uid = crypto.randomUUID();
  ctx.db.prepare('insert into users (id, email, name, password_hash, created_at) values (?, ?, ?, ?, ?)').run(uid, 'chuyen-doi@kiotviet.local', 'Chuyển từ KiotViet', 'x', nowIso());
  const B = callRpc(uid, 'bootstrap', {}).find((b) => b.short_name === 'TH').id;
  const call = (fn, p) => callRpc(uid, fn, { book_id: B, ...p });
  const direct = (f) => { setUser(uid); try { return ctx.db.transaction(f)(); } finally { setUser(null); } };
  const sql = (q, ...a) => ctx.db.prepare(q).run(...a);
  const get = (q, ...a) => ctx.db.prepare(q).get(...a);
  const rows = (q, ...a) => ctx.db.prepare(q).all(...a);

  const report = { warnings: [], skipped: [], fallbacks: [], adjustments: { customers: [], suppliers: [], stock: [] } };
  const warn = (m) => report.warnings.push(m);

  // ---------- cài đặt sổ ----------
  const groups = [...new Set(['Khách lẻ', ...(K.customerGroups || []).map((g) => g.Name)])];
  call('update_book_settings', { settings: { customer_groups: groups, allow_oversell: true, lock_date: null } });
  const settingsPatch = { customer_groups: groups };

  // ---------- hàng hóa ----------
  const books = Object.fromEntries((K.priceBooks || []).filter((b) => b.Id > 0).map((b) => [b.Name, b.Id]));
  // Lấy danh sách theo một bảng giá: Price là giá chung, giá của bảng nằm ở Pb1
  const priceIn = (bookId) => Object.fromEntries(((K.priceBookItems || {})[bookId] || []).map((x) => [x.Id, bookId ? x.Pb1 ?? x.Price : x.Price]));
  const tierPrice = Object.fromEntries(Object.entries(PRICE_TIER_BOOKS).map(([k, name]) => [k, name === 0 ? priceIn(0) : priceIn(books[name])]));
  const detailOf = K.productDetails || {};
  const prodId = new Map();          // KiotViet ProductId → id trong sổ
  const prodByCode = new Map();      // mã KiotViet (cả mã đã xóa) → id
  // Danh mục mới (file Excel của khách): tạo đủ các mã mới; hàng KiotViet đã ghép dùng mã mới, chưa ghép thì giữ mã cũ và ngừng kinh doanh
  const newSku = new Map();          // mã mới → id
  if (catalog) {
    const names = bookSettingsOf(B).price_names || [];
    for (const r of catalog.rows || []) {
      const fields = catalogFields(r, names);
      const img = (catalog.images || {})[r._row];
      const res = call('save_product', { ...fields, ...(img ? { images: [img.full], thumb: img.thumb } : {}) });
      newSku.set(fields.sku, res.id);
      if (r['Số lượng tồn'] != null && r['Số lượng tồn'] !== '') warn(`${fields.sku}: bỏ qua "Số lượng tồn" trong file mới, tồn kho lấy theo KiotViet`);
    }
  }
  const mapping = catalog?.mapping || {};
  const freeSku = (code) => (newSku.has(code) || prodByCode.has(code) ? `${code}-KV` : code);
  for (const p of K.products || []) {
    if (catalog && mapping[p.Code] && newSku.has(mapping[p.Code])) { prodId.set(p.Id, newSku.get(mapping[p.Code])); prodByCode.set(p.Code, newSku.get(mapping[p.Code])); continue; }
    if (catalog && mapping[p.Code]) warn(`${p.Code}: mã ghép ${mapping[p.Code]} không có trong danh mục mới, giữ mã cũ`);
    const det = detailOf[p.Id] || {};
    const attr = (n) => (det.ProductAttributes || []).find((a) => a.Name === n)?.Value ?? null;
    const base = tierPrice.price1[p.Id] ?? p.BasePrice ?? 0;
    const prices = Object.fromEntries(Object.keys(PRICE_TIER_BOOKS).map((k) => [k, tierPrice[k][p.Id] ?? base]));
    const kg = Number(String(attr('KG') ?? '').replace(',', '.'));
    const sku = catalog ? freeSku(p.Code) : p.Code;
    const r = call('save_product', {
      sku, name: stripUnit(p.FullName || p.Name, p.Unit) || p.Code, category: p.CategoryName || null, brand: p.TradeMarkName || det.TradeMarkName || null,
      unit: p.Unit || 'Cái', size: attr('KT'), unit_weight: kg > 0 ? kg : null, ...prices,
      low_stock: p.MinQuantity || 0, max_stock: p.MaxQuantity || null, sell_direct: p.AllowsSale !== false, cost: p.Cost || 0,
      active: catalog ? false : p.isActive !== false,
      note: catalog ? `Mã KiotViet ${p.Code}, chưa có trong danh mục mới` : p.MasterCode ? `Mã KiotViet: ${p.MasterCode}` : null,
    });
    prodId.set(p.Id, r.id); prodByCode.set(p.Code, r.id);
    if (p.CreatedDate) sql('update products set created_at = ? where id = ?', kvIso(p.CreatedDate), r.id);
  }
  // Hàng đã xóa trên KiotViet nhưng còn trong lịch sử: tạo lại ở trạng thái ngừng kinh doanh, giữ đúng mã cũ
  const allLines = [
    ...(K.invoices || []).flatMap((x) => x.Details || []), ...(K.orders || []).flatMap((x) => x.Details || x.OrderDetails || []),
    ...(K.returns || []).flatMap((x) => x.Details || []), ...(K.purchaseOrders || []).flatMap((x) => x.Details || []),
    ...(K.purchaseReturns || []).flatMap((x) => x.Details || []), ...(K.stockTakes || []).flatMap((x) => x.Details || []),
  ];
  let deletedProducts = 0;
  for (const l of allLines) {
    if (prodId.has(l.ProductId)) continue;
    const code = l.ProductCode || `KV-${l.ProductId}`;
    if (prodByCode.has(code)) { prodId.set(l.ProductId, prodByCode.get(code)); continue; }
    const r = call('save_product', { sku: newSku.has(code) ? `${code}-KV` : code, name: stripUnit(l.ProductFullName || l.ProductName, l.Unit) || code, unit: l.Unit || 'Cái',
      category: l.CategoryTree || null, active: false, sell_direct: false, note: 'Hàng đã xóa trên KiotViet, còn trong lịch sử chứng từ' });
    prodId.set(l.ProductId, r.id); prodByCode.set(code, r.id); deletedProducts++;
  }
  const P = (l) => prodId.get(l.ProductId);

  // ---------- khách hàng, nhà cung cấp ----------
  const custId = new Map(); const custCode = new Set();
  const walkIn = get(`select id from customers where book_id = ? and code = 'KL'`, B).id;
  const addCustomer = (c, deleted) => {
    let code = c.Code || `KV-KH-${c.Id}`;
    if (custCode.has(code.toLowerCase())) code = `${code}-${c.Id}`;
    // Nhóm khách: Groups là chuỗi tên nhóm, CustomerGroupNames là mảng (mỗi khách KiotViet ở tối đa 1 nhóm)
    const group = (Array.isArray(c.CustomerGroupNames) ? c.CustomerGroupNames[0] : null) || c.Groups || null;
    const r = call('save_party', {
      type: 'kh', code, name: c.Name || code, phone: c.ContactNumber || null, address: c.Address || null,
      kind: group, price_tier: GROUP_TIER[group] || 1, note: c.Comments || null,
      extra: Object.fromEntries(Object.entries({
        customer_type: c.CustomerType || (c.Type === 1 ? 'Công ty' : null), email: c.Email, tax_code: c.TaxCode, tax_name: c.Organization,
        gender: c.Gender === true ? 'Nam' : c.Gender === false ? 'Nữ' : null, birthday: c.BirthDate ? kvDate(c.BirthDate) : null,
        province: c.LocationName, ward: c.WardName,
      }).filter(([, v]) => v != null && v !== '')),
    });
    custCode.add(code.toLowerCase()); custId.set(c.Id, r.id);
    if (deleted) sql(`update customers set active = 0, note = ? where id = ?`, 'Khách đã xóa trên KiotViet, còn trong lịch sử chứng từ', r.id);
    if (c.CreatedDate) sql('update customers set created_at = ? where id = ?', kvIso(c.CreatedDate), r.id);
    return r.id;
  };
  for (const c of K.customers || []) addCustomer(c, false);
  const C = (id, embedded) => {
    if (!id) return walkIn;
    if (custId.has(id)) return custId.get(id);
    return addCustomer({ Id: id, Code: embedded?.Code, Name: embedded?.Name || 'Khách đã xóa', ContactNumber: embedded?.ContactNumber, Address: embedded?.Address }, true);
  };
  const supId = new Map(); const supCode = new Set();
  const addSupplier = (s, deleted) => {
    let code = s.Code || `KV-NCC-${s.Id}`;
    if (supCode.has(code.toLowerCase())) code = `${code}-${s.Id}`;
    const r = call('save_party', { type: 'ncc', code, name: s.Name || code, phone: s.Phone || null,
      address: [s.Address, s.LocationName].filter(Boolean).join(', ') || null, note: s.Comments || null });
    supCode.add(code.toLowerCase()); supId.set(s.Id, r.id);
    if (deleted) sql(`update suppliers set active = 0, note = ? where id = ?`, 'Nhà cung cấp đã xóa trên KiotViet, còn trong lịch sử chứng từ', r.id);
    if (s.CreatedDate) sql('update suppliers set created_at = ? where id = ?', kvIso(s.CreatedDate), r.id);
    return r.id;
  };
  for (const s of K.suppliers || []) addSupplier(s, s.isActive === false);
  const S = (id, embedded) => {
    if (id && supId.has(id)) return supId.get(id);
    if (id) return addSupplier({ Id: id, Code: embedded?.Code, Name: embedded?.Name || 'NCC đã xóa', Phone: embedded?.Phone }, true);
    if (!supId.has(0)) addSupplier({ Id: 0, Code: 'KV-NCC-KHONG-RO', Name: 'Nhà cung cấp không ghi trên KiotViet' }, true);
    return supId.get(0);
  };

  // ---------- bảng giá riêng trong file danh mục (khối "Giá <tên>", vd. "Giá Bái Đính") ----------
  // Bảng "Giá X" chỉ áp dụng cho nhóm khách X; khách đang theo dõi có tên chứa X được đưa vào nhóm này,
  // nên khi bán cho họ màn bán hàng tự chọn bảng giá; hàng ngoài bảng vẫn bán theo giá thường.
  for (const pb of catalog?.price_books || []) {
    const group = String(pb.name).replace(/^giá\s+/i, '').trim();
    const named = (K.customers || []).filter((c) => plain(c.Name).includes(plain(group)));
    // Khách đã ở nhóm khác thì giữ nhóm cũ (đổi nhóm làm mất mức giá / ưu đãi của nhóm đó), chỉ báo lại
    const members = named.filter((c) => !get(`select kind from customers where id = ?`, custId.get(c.Id)).kind);
    for (const c of named.filter((x) => !members.includes(x))) warn(`${c.Code} ${c.Name} đã thuộc nhóm khác, chưa đưa vào nhóm "${group}" của bảng giá "${pb.name}"`);
    for (const c of members) sql(`update customers set kind = ? where id = ?`, group, custId.get(c.Id));
    if (!settingsPatch.customer_groups.includes(group)) {
      settingsPatch.customer_groups = [...settingsPatch.customer_groups, group];
      call('update_book_settings', { settings: { customer_groups: settingsPatch.customer_groups } });
    }
    const { id } = call('save_price_book', { name: pb.name, cust_groups: [group], allow_others: true });
    const rows = []; const missing = [];
    for (const it of pb.items || []) (newSku.has(it.sku) ? rows.push({ product_id: newSku.get(it.sku), price: it.price }) : missing.push(it.sku));
    call('save_price_book_items', { price_book_id: id, rows });
    report.price_books = [...(report.price_books || []), { ten: pb.name, nhom_khach: group, khach: members.map((c) => `${c.Code} ${c.Name}`), so_mat_hang: rows.length, thieu_ma: missing }];
    if (missing.length) warn(`Bảng giá "${pb.name}": mã ${missing.join(', ')} không có trong danh mục mới`);
  }

  // ---------- quỹ ----------
  const funds = rows(`select id, name from funds where book_id = ? order by sort`, B);
  const fundOf = (method) => (method === 'Cash' || !method ? funds[0].id : funds[1].id);

  // ---------- tiện ích ghi mã, giờ tạo ----------
  const setCode = (table, id, code, created) => {
    sql(`update ${table} set code = ?${created ? ', created_at = ?' : ''} where id = ?`, ...(created ? [code, kvIso(created), id] : [code, id]));
    sql(`update stock_moves set doc_code = ? where doc_id = ?`, code, id);
  };
  const surcharge = (doc) => {
    const list = doc.InvoiceOrderSurcharges || [];
    const vat = list.find((s) => (s.SurchargeName || '').toUpperCase() === SURCHARGE_VAT || s.SurchargeId === (K.surcharges || []).find((x) => x.Name === SURCHARGE_VAT)?.Id);
    // Tỷ lệ VAT ghi trên từng phiếu (có phiếu 4,5% hay 10%), không lấy mức mặc định của loại thu khác
    const goods = lineSum(doc.Details || doc.OrderDetails || []) - (doc.Discount || 0);
    const vatRate = !vat ? 0 : vat.SurValueRatio ?? (goods > 0 && (vat.Price ?? vat.SurValue) ? Math.round((vat.Price ?? vat.SurValue) / goods * 10000) / 100
      : (K.surcharges || []).find((x) => x.Id === vat.SurchargeId)?.ValueRatio ?? 0);
    const ship = list.filter((s) => s !== vat).reduce((t, s) => t + (s.Price ?? s.SurValue ?? 0), 0);
    return { vatRate, ship: r0(ship) };
  };
  const staffOf = (d) => d.SoldBy?.GivenName || d.User?.GivenName || null;
  const noteOf = (d, extra) => [d.Description, extra].filter(Boolean).join('\n') || null;

  // ---------- chứng từ theo thời gian ----------
  const PRIORITY = { adj: 0, order: 1, invoice: 2, po: 3, ret: 4, pret: 5, stock: 6, pay: 7 };
  const adjRows = (side) => Object.entries(ledger?.[side] || {}).flatMap(([pid, l]) => (l.rows || [])
    .filter((r) => r.DocumentType === 1 && r.Value).map((r) => ({ ...r, side, PartnerId: Number(pid), Code: r.DocumentCode })));
  const events = [
    ...adjRows('customers').map((x) => ({ t: x.TransDate, k: 'adj', x })),
    ...adjRows('suppliers').map((x) => ({ t: x.TransDate, k: 'adj', x })),
    ...(K.orders || []).map((x) => ({ t: x.PurchaseDate, k: 'order', x })),
    ...(K.invoices || []).map((x) => ({ t: x.PurchaseDate, k: 'invoice', x })),
    ...(K.purchaseOrders || []).map((x) => ({ t: x.PurchaseDate, k: 'po', x })),
    ...(K.returns || []).map((x) => ({ t: x.ReturnDate, k: 'ret', x })),
    ...(K.purchaseReturns || []).map((x) => ({ t: x.ReturnDate, k: 'pret', x })),
    ...(K.stockTakes || []).map((x) => ({ t: x.AdjustmentDate || x.CreatedDate, k: 'stock', x })),
    ...(K.cashflow || []).map((x) => ({ t: x.TransDate, k: 'pay', x })),
  ].sort((a, b) => kvIso(a.t).localeCompare(kvIso(b.t)) || PRIORITY[a.k] - PRIORITY[b.k]);

  const orderMap = new Map();     // KiotViet đặt hàng Id → {id, lines: Map(OrderDetailId → line id)}
  const invMap = new Map();       // KiotViet hóa đơn Id → {orderId, dl: Map(InvoiceDetailId → delivery line id)}
  const poMap = new Map();        // KiotViet phiếu nhập Id → {id, gl: Map(PurchaseOrderDetailId → receipt line id)}
  const poByCode = new Map(); const retByCode = new Map();
  const payToDoc = new Map();     // KiotViet payment Id → id đơn bán trong sổ
  for (const i of K.invoices || []) for (const p of i.Payments || []) payToDoc.set(p.Id, { kv: 'inv', id: i.Id });
  for (const o of K.orders || []) for (const p of o.Payments || []) if (!payToDoc.has(p.Id)) payToDoc.set(p.Id, { kv: 'ord', id: o.Id });

  // Giảm giá dòng của KiotViet là số tiền mỗi đơn vị; giảm âm (bán cao hơn giá niêm yết) hoặc lớn hơn đơn giá thì ghi thẳng giá thực bán
  const saleLines = (ls) => ls.filter((l) => l.Quantity > 0).map((l) => {
    const price = l.Price ?? 0; const disc = l.Discount || 0;
    if (disc >= 0 && disc < price) return { product_id: P(l), qty: l.Quantity, unit_price: price, discount_pct: pct(disc, price), note: l.Note || null };
    return { product_id: P(l), qty: l.Quantity, unit_price: Math.max(price - disc, 0), discount_pct: 0,
      note: [l.Note, `Giá niêm yết ${price.toLocaleString('vi-VN')}, điều chỉnh ${(-disc).toLocaleString('vi-VN')}`].filter(Boolean).join(' · ') };
  });

  function doOrder(o) {
    const lines = o.Details || o.OrderDetails || [];
    const sc = surcharge(o);
    const r = call('save_sales_order', { kind: 'dat_hang', status: o.Status === 1 ? 'nhap' : 'xac_nhan', customer_id: C(o.CustomerId, o.Customer),
      order_date: kvDate(o.PurchaseDate), due_date: o.ExpectedDeliveryDate ? kvDate(o.ExpectedDeliveryDate) : null, staff: staffOf(o),
      discount: o.Discount || 0, shipping_fee: sc.ship, vat_rate: sc.vatRate, note: noteOf(o), lines: saleLines(lines) });
    setCode('sales_orders', r.id, o.Code, o.CreatedDate);
    const ours = rows(`select id from sales_order_lines where order_id = ? order by line_no`, r.id);
    const lm = new Map(); lines.filter((l) => l.Quantity > 0).forEach((l, i) => lm.set(l.Id, ours[i].id));
    orderMap.set(o.Id, { id: r.id, lines: lm, kv: o });
  }

  // Hóa đơn sinh từ đặt hàng: giao trên đơn đặt nếu các dòng khớp, nếu không thì lập thành hóa đơn riêng
  function deliverFromOrder(i, om) {
    const lines = (i.Details || []).filter((l) => l.Quantity > 0);
    const req = [];
    for (const l of lines) {
      const olid = om.lines.get(l.OrderDetailId);
      if (!olid) return `dòng ${l.ProductCode} không có trong đặt hàng`;
      const ol = get(`select * from sales_order_lines where id = ?`, olid);
      if (ol.product_id !== P(l) || Math.abs(ol.unit_price * (1 - ol.discount_pct / 100) - (l.Price - (l.Discount || 0))) > 0.5) return `giá/mã dòng ${l.ProductCode} khác đặt hàng`;
      if (l.Quantity > ol.qty - ol.cancelled_qty - ol.delivered_qty + 1e-9) return `số lượng ${l.ProductCode} vượt phần còn lại của đặt hàng`;
      req.push({ order_line_id: olid, qty: l.Quantity, kv: l });
    }
    const o = get(`select * from sales_orders where id = ?`, om.id);
    const first = get(`select count(*) n from deliveries where order_id = ?`, o.id).n === 0;
    const sc = surcharge(i);
    // VAT và giảm giá tính theo hóa đơn thực xuất; đơn đã giao đợt trước với mức khác thì không gộp được
    if (!first && (o.vat_rate !== sc.vatRate || o.discount !== (i.Discount || 0))) return 'VAT/giảm giá khác đợt giao trước';
    if (o.status === 'nhap') call('confirm_sales_order', { id: o.id });
    if (first) sql(`update sales_orders set vat_rate = ?, discount = ? where id = ?`, sc.vatRate, i.Discount || 0, o.id);
    const d = call('deliver', { order_id: o.id, date: kvDate(i.PurchaseDate), shipping_fee: sc.ship, lines: req.map(({ order_line_id, qty }) => ({ order_line_id, qty })) });
    setCode('deliveries', d.id, i.Code, i.CreatedDate);
    const dls = rows(`select id, order_line_id from delivery_lines where delivery_id = ?`, d.id);
    const dl = new Map(); for (const x of req) dl.set(x.kv.Id, dls.find((y) => y.order_line_id === x.order_line_id).id);
    invMap.set(i.Id, { orderId: o.id, dl });
    return null;
  }

  function doInvoice(i) {
    const om = i.OrderId ? orderMap.get(i.OrderId) : null;
    if (om && i.Status === 1) {
      const why = deliverFromOrder(i, om);
      if (!why) return;
      report.fallbacks.push(`${i.Code}: lập thành hóa đơn riêng vì ${why} (đặt hàng ${om.kv.Code})`);
    }
    const sc = surcharge(i);
    const pbName = i.PriceBook?.Name && i.PriceBook.Name !== 'Bảng giá chung' ? `Bảng giá KiotViet: ${i.PriceBook.Name.replace(DEL_RE, ' (đã xóa)')}` : null;
    const fromOrder = i.OrderCode ? `Từ đặt hàng ${i.OrderCode}` : null;
    const done = i.Status === 1;
    const r = call('save_sales_order', { kind: 'ban_san', status: 'nhap', deliver_now: done, customer_id: C(i.CustomerId, i.Customer),
      order_date: kvDate(i.PurchaseDate), staff: staffOf(i), discount: i.Discount || 0, shipping_fee: sc.ship, vat_rate: sc.vatRate,
      channel: i.SaleChannelName || null, note: noteOf(i, [pbName, fromOrder].filter(Boolean).join(' · ')), lines: saleLines(i.Details || []) });
    setCode('sales_orders', r.id, i.Code, i.CreatedDate);
    if (!done) {
      call('cancel_sales_order', { id: r.id, reason: 'Hóa đơn đã hủy trên KiotViet' });
      return;
    }
    const d = get(`select id from deliveries where order_id = ?`, r.id);
    setCode('deliveries', d.id, i.Code, i.CreatedDate);
    const kvl = (i.Details || []).filter((l) => l.Quantity > 0);
    const dls = rows(`select x.id from delivery_lines x join sales_order_lines l on l.id = x.order_line_id where x.delivery_id = ? order by l.line_no`, d.id);
    invMap.set(i.Id, { orderId: r.id, dl: new Map(kvl.map((l, k) => [l.Id, dls[k].id])) });
  }

  function doReturn(t) {
    if (t.Status !== 1) { report.skipped.push(`${t.Code}: phiếu trả hàng đã hủy trên KiotViet, không nhập`); return; }
    const im = invMap.get(t.InvoiceId);
    if (!im) { report.skipped.push(`${t.Code}: không tìm thấy hóa đơn gốc ${t.Invoice?.Code || t.InvoiceId}`); return; }
    const lines = (t.Details || []).filter((l) => l.Quantity > 0).map((l) => ({ delivery_line_id: im.dl.get(l.InvoiceDetailId), qty: l.Quantity, restock: true }));
    if (lines.some((l) => !l.delivery_line_id)) { report.skipped.push(`${t.Code}: dòng hàng trả không khớp hóa đơn ${t.Invoice?.Code}`); return; }
    const r = call('sales_return', { order_id: im.orderId, date: kvDate(t.ReturnDate), reason: t.Description || null, fee: t.ReturnFee || 0, lines });
    sql(`update sales_returns set code = ?, created_at = ? where id = ?`, t.Code, kvIso(t.CreatedDate || t.ReturnDate), r.id);
    sql(`update stock_moves set doc_code = ? where doc_id = ?`, t.Code, r.id);
    retByCode.set(t.Code, im.orderId);
  }

  function doPurchase(p) {
    const done = p.Status === 3;
    const lines = (p.Details || []).filter((l) => l.Quantity > 0);
    const r = call('save_purchase_order', { mode: 'nhap', receive_now: done, supplier_id: S(p.SupplierId, p.Supplier), order_date: kvDate(p.PurchaseDate),
      discount: p.Discount || 0, note: noteOf(p), lines: lines.map((l) => ({ product_id: P(l), qty: l.Quantity, unit_price: l.Price ?? 0, discount: l.Discount || 0, note: l.Description || null })) });
    setCode('purchase_orders', r.id, p.Code, p.CreatedDate);
    poByCode.set(p.Code, r.id);
    if (!done) { call('cancel_purchase_order', { id: r.id, reason: 'Phiếu nhập đã hủy trên KiotViet' }); return; }
    const g = get(`select id from goods_receipts where po_id = ?`, r.id);
    sql(`update goods_receipts set code = ?, created_at = ? where id = ?`, p.Code, kvIso(p.CreatedDate || p.PurchaseDate), g.id);
    sql(`update stock_moves set doc_code = ? where doc_id = ?`, p.Code, g.id);
    const gls = rows(`select x.id from goods_receipt_lines x join purchase_order_lines l on l.id = x.po_line_id where x.receipt_id = ? order by l.line_no`, g.id);
    poMap.set(p.Id, { id: r.id, gl: new Map(lines.map((l, k) => [l.Id, gls[k].id])) });
  }

  function doPurchaseReturn(t) {
    if (t.Status !== 1) { report.skipped.push(`${t.Code}: phiếu trả hàng nhập chưa hoàn thành trên KiotViet, không nhập`); return; }
    const pm = poMap.get(t.PurchaseOrderId);
    const lines = (t.Details || []).filter((l) => l.Quantity > 0);
    // KiotViet cho trả hàng nhập cả khi tồn không đủ, hệ thống thì chặn: bù đúng phần thiếu bằng phiếu kiểm kho có ghi chú, ngay trước phiếu trả
    const need = new Map();
    for (const l of lines) need.set(P(l), (need.get(P(l)) || 0) + l.Quantity);
    const short = [...need].map(([pid, q]) => ({ product_id: pid, qty_delta: q - get(`select on_hand from products where id = ?`, pid).on_hand })).filter((x) => x.qty_delta > 0);
    if (short.length) {
      const fix = direct(() => doAdjust(B, kvDate(t.ReturnDate), 'kiem_ke', `Bù tồn để ghi nhận phiếu trả hàng nhập ${t.Code} (KiotViet cho trả khi tồn không đủ)`, short, false));
      report.warnings.push(`${t.Code}: tồn không đủ để trả NCC, đã lập phiếu bù ${fix.code}`);
    }
    const r = pm && lines.every((l) => pm.gl.has(l.PurchaseOrderDetailId))
      ? call('supplier_return', { po_id: pm.id, date: kvDate(t.ReturnDate), discount: t.Discount || 0, note: noteOf(t),
        lines: lines.map((l) => ({ receipt_line_id: pm.gl.get(l.PurchaseOrderDetailId), qty: l.Quantity, unit_price: l.ReturnPrice ?? l.BuyPrice })) })
      : call('supplier_return', { supplier_id: S(t.SupplierId, t.Supplier), date: kvDate(t.ReturnDate), discount: t.Discount || 0, note: noteOf(t),
        lines: lines.map((l) => ({ product_id: P(l), qty: l.Quantity, unit_price: l.ReturnPrice ?? l.BuyPrice })) });
    sql(`update supplier_returns set code = ?, created_at = ? where id = ?`, t.Code, kvIso(t.CreatedDate || t.ReturnDate), r.id);
    sql(`update stock_moves set doc_code = ? where doc_id = ?`, t.Code, r.id);
  }

  function doStockTake(s) {
    const lines = (s.Details || []).filter((l) => l.AdjustmentValue).map((l) => ({
      product_id: P(l), qty_delta: l.AdjustmentValue, unit_cost: l.AdjustmentValue > 0 && l.Cost ? l.Cost / l.AdjustmentValue : null,
    }));
    if (!lines.length) { report.skipped.push(`${s.Code}: phiếu kiểm kho không có chênh lệch, không cần nhập`); return; }
    const note = s.Description || 'Kiểm kho trên KiotViet';
    const r = direct(() => doAdjust(B, kvDate(s.AdjustmentDate || s.CreatedDate), 'kiem_ke', note, lines, false));
    setCode('stock_adjustments', r.id, s.Code, s.CreatedDate);
  }

  const remaining = (docType, docId) => get(`select remaining_total, paid_net, due_now, status from v_open_docs where book_id = ? and doc_type = ? and doc_id = ?`, B, docType, docId);
  function doPay(c) {
    const amount = Math.abs(c.Amount || 0);
    if (!amount) return;
    const cancelled = c.Status === 1 || /hủy/i.test(c.StatusValue || '');
    const isCust = c.PartnerType === 'C' || c.partnerType === 'C';
    const kind = isCust ? (c.Amount > 0 ? 'thu_khach' : 'hoan_khach') : (c.Amount < 0 ? 'tra_ncc' : 'ncc_hoan');
    const party = isCust ? C(c.PartnerId, { Code: c.PartnerCode, Name: c.PartnerName, ContactNumber: c.ContactNumber, Address: c.Address })
      : S(c.PartnerId, { Code: c.PartnerCode, Name: c.PartnerName });
    let allocations = []; let auto = false;
    if (!cancelled) {
      let target = null;
      if (kind === 'thu_khach') {
        const link = payToDoc.get(c.Id);
        target = link ? (link.kv === 'inv' ? invMap.get(link.id)?.orderId : orderMap.get(link.id)?.id) : null;
        // phiếu thu của hóa đơn đã lập lại trên đặt hàng khác, hoặc không ghi liên kết: tìm theo mã (TTHD000045 → HD000045, TTDH… → DH…)
        if (!target && link?.kv === 'inv') target = rows(`select id from sales_orders where book_id = ? and code = ?`, B, (K.invoices.find((x) => x.Id === link.id) || {}).Code)[0]?.id;
        if (!target && /^TT(HD|DH)/.test(c.Code)) {
          const code = String(c.Code).slice(2);
          target = rows(`select id from sales_orders where book_id = ? and code = ?`, B, code)[0]?.id
            ?? rows(`select order_id as id from deliveries where book_id = ? and code = ?`, B, code)[0]?.id;
        }
        if (target) {
          const d = remaining('don_ban', target);
          const a = d && d.status !== 'huy' ? Math.min(amount, Math.max(d.remaining_total, 0)) : 0;
          if (a > 0) allocations = [{ doc_type: 'don_ban', doc_id: target, amount: a }];
        } else auto = true;
      } else if (kind === 'hoan_khach') {
        target = retByCode.get(String(c.Code).replace(/^TT/, ''));
        const d = target && remaining('don_ban', target);
        const a = d ? Math.min(amount, Math.max(d.paid_net - d.due_now, 0)) : 0;
        if (a > 0) allocations = [{ doc_type: 'don_ban', doc_id: target, amount: a }];
      } else if (kind === 'tra_ncc') {
        target = poByCode.get(String(c.Code).replace(/^PC/, ''));
        if (target) {
          const d = remaining('don_mua', target);
          const a = d && d.status !== 'huy' ? Math.min(amount, Math.max(d.remaining_total, 0)) : 0;
          if (a > 0) allocations = [{ doc_type: 'don_mua', doc_id: target, amount: a }];
        } else auto = true;
      }
    }
    const r = call('create_payment', { kind, date: kvDate(c.TransDate), fund_id: fundOf(c.Method), party_id: party, amount, method: c.Method === 'Transfer' ? 'Chuyển khoản' : c.Method === 'Cash' ? 'Tiền mặt' : c.Method || null,
      note: [c.Description, c.CashGroup].filter(Boolean).join(' · ') || null, allocations, auto_allocate: auto });
    sql(`update payments set code = ?, created_at = ? where id = ?`, c.Code, kvIso(c.CreatedDate || c.TransDate), r.id);
    if (cancelled) call('void_payment', { id: r.id, reason: 'Phiếu đã hủy trên KiotViet' });
  }

  // Điều chỉnh công nợ: khách + là tăng nợ phải thu; NCC trong sổ KiotViet ghi âm là tăng nợ phải trả
  function doDebtAdjust(a) {
    const isCust = a.side === 'customers';
    const party = isCust ? C(a.PartnerId) : S(a.PartnerId);
    const r = call('save_opening_debt', { party_type: isCust ? 'kh' : 'ncc', party_id: party, amount: isCust ? a.Value : -a.Value,
      debt_date: kvDate(a.TransDate), note: 'Điều chỉnh công nợ trên KiotViet' });
    sql(`update opening_debts set code = ?, created_at = ? where id = ?`, a.Code, kvIso(a.TransDate), r.id);
  }

  const HANDLERS = { adj: doDebtAdjust, order: doOrder, invoice: doInvoice, po: doPurchase, ret: doReturn, pret: doPurchaseReturn, stock: doStockTake, pay: doPay };
  let n = 0;
  for (const e of events) {
    try { HANDLERS[e.k](e.x); } catch (err) { throw new Error(`Lỗi khi dựng ${e.x.Code} (${e.k}): ${err.message}`); }
    if (++n % 500 === 0) log(`Đã dựng ${n}/${events.length} chứng từ`);
  }

  // ---------- trạng thái cuối của đặt hàng ----------
  for (const { id, kv } of orderMap.values()) {
    const o = get(`select status from sales_orders where id = ?`, id);
    const delivered = get(`select count(*) n from deliveries where order_id = ?`, id).n > 0;
    const open = get(`select count(*) n from sales_order_lines where order_id = ? and qty - cancelled_qty - delivered_qty > 0`, id).n > 0;
    if (kv.Status === 4 && !delivered) call('cancel_sales_order', { id, reason: 'Đặt hàng đã hủy trên KiotViet' });
    else if ((kv.Status === 4 || kv.Status === 3) && open && o.status === 'xac_nhan') call('cancel_remaining', { id, reason: kv.Status === 3 ? 'Đặt hàng đã kết thúc trên KiotViet' : 'Đặt hàng đã hủy trên KiotViet' });
  }

  // ---------- đối chiếu, bù chênh lệch ----------
  const at = today;
  const kvDebtC = new Map((K.customers || []).map((c) => [custId.get(c.Id), c.Debt || 0]));
  const ourC = new Map(custBalances(B, at).map((x) => [x.party_id, x.balance]));
  for (const [id, debt] of kvDebtC) {
    const diff = r0(debt - (ourC.get(id) || 0));
    if (Math.abs(diff) >= 1) {
      call('save_opening_debt', { party_type: 'kh', party_id: id, amount: diff, debt_date: OPENING_DATE, note: 'Chênh lệch công nợ khi chuyển từ KiotViet (để khớp số nợ KiotViet ngày xuất dữ liệu)' });
      report.adjustments.customers.push({ code: get(`select code from customers where id = ?`, id).code, kiotviet: debt, he_thong: ourC.get(id) || 0, bu: diff });
    }
  }
  const kvDebtS = new Map((K.suppliers || []).map((s) => [supId.get(s.Id), s.Debt || 0]));
  const ourS = new Map(suppBalances(B, at).map((x) => [x.party_id, x.balance]));
  for (const [id, debt] of kvDebtS) {
    const diff = r0(debt - (ourS.get(id) || 0));
    if (Math.abs(diff) >= 1) {
      call('save_opening_debt', { party_type: 'ncc', party_id: id, amount: diff, debt_date: OPENING_DATE, note: 'Chênh lệch công nợ khi chuyển từ KiotViet (để khớp số nợ KiotViet ngày xuất dữ liệu)' });
      report.adjustments.suppliers.push({ code: get(`select code from suppliers where id = ?`, id).code, kiotviet: debt, he_thong: ourS.get(id) || 0, bu: diff });
    }
  }
  // Khách / NCC đã xóa trên KiotViet và Khách lẻ: KiotViet không theo dõi nợ, đưa về 0 để tổng phải thu / phải trả khớp
  const zeroOut = (ptype, table, balances, known) => {
    for (const [id, bal] of balances) {
      if (known.has(id) || Math.abs(bal) < 1) continue;
      call('save_opening_debt', { party_type: ptype, party_id: id, amount: -r0(bal), debt_date: at,
        note: 'Đối tượng đã xóa / khách lẻ trên KiotViet không còn theo dõi công nợ: đưa số dư về 0 khi chuyển dữ liệu' });
      report.adjustments[ptype === 'kh' ? 'customers' : 'suppliers'].push({ code: get(`select code from ${table} where id = ?`, id).code, kiotviet: 0, he_thong: bal, bu: -r0(bal), ghi_chu: 'không theo dõi nợ' });
    }
  };
  zeroOut('kh', 'customers', custBalances(B, at).map((x) => [x.party_id, x.balance]), new Set(kvDebtC.keys()));
  zeroOut('ncc', 'suppliers', suppBalances(B, at).map((x) => [x.party_id, x.balance]), new Set(kvDebtS.keys()));
  // Tồn kho mỗi mã trong sổ = tổng tồn KiotViet của các mã ghép vào nó
  const stockFix = [];
  const target = new Map(); const kvCodes = new Map();
  for (const p of K.products || []) {
    const id = prodId.get(p.Id);
    target.set(id, (target.get(id) || 0) + (p.OnHand || 0));
    (kvCodes.get(id) || kvCodes.set(id, []).get(id)).push(p.Code);
  }
  for (const [id, want] of target) {
    const cur = get(`select sku, on_hand from products where id = ?`, id);
    const diff = Math.round((want - cur.on_hand) * 1e6) / 1e6;
    if (!diff) continue;
    const cost = (K.products || []).find((p) => prodId.get(p.Id) === id)?.Cost || null;
    stockFix.push({ product_id: id, qty_delta: diff, unit_cost: cost });
    const kc = kvCodes.get(id);
    report.adjustments.stock.push({ code: cur.sku, ma_kiotviet: kc.join(', '), kiotviet: want, he_thong: cur.on_hand, bu: diff });
  }
  // Hàng đã xóa trên KiotViet (không thuộc danh sách hàng KiotViet đang có) không còn tồn: đưa về 0
  for (const x of rows(`select id, sku, on_hand from products where book_id = ? and active = 0 and on_hand <> 0`, B)) {
    if (target.has(x.id)) continue;
    stockFix.push({ product_id: x.id, qty_delta: -x.on_hand, unit_cost: null });
    report.adjustments.stock.push({ code: x.sku, kiotviet: 0, he_thong: x.on_hand, bu: -x.on_hand, ghi_chu: 'hàng đã xóa' });
  }
  if (stockFix.length) {
    const r = direct(() => doAdjust(B, at, 'kiem_ke', 'Chênh lệch tồn kho khi chuyển từ KiotViet (để khớp tồn KiotViet ngày xuất dữ liệu)', stockFix, false));
    report.adjustments.stock_doc = r.code;
  }

  // Số chứng từ tiếp theo không trùng mã cũ của KiotViet cùng tiền tố
  for (const [kind, table] of [['DH', 'sales_orders'], ['PN', 'purchase_orders']]) {
    const max = Math.max(0, ...rows(`select code from ${table} where book_id = ? and code like ?`, B, kind + '%').map((x) => Number(/^[A-Z]+(\d+)$/.exec(x.code)?.[1] || 0)));
    sql(`insert into doc_counters (book_id, kind, last_no) values (?, ?, ?) on conflict (book_id, kind) do update set last_no = max(last_no, excluded.last_no)`, B, kind, max);
  }

  // ---------- số liệu kiểm tra ----------
  const cnt = (t, w = '') => get(`select count(*) n from ${t} where book_id = ? ${w}`, B).n;
  report.counts = {
    products: cnt('products'), products_deleted: deletedProducts, customers: cnt('customers'), suppliers: cnt('suppliers'),
    sales_orders: cnt('sales_orders'), deliveries: cnt('deliveries'), sales_returns: cnt('sales_returns'), purchase_orders: cnt('purchase_orders'),
    supplier_returns: cnt('supplier_returns'), stock_adjustments: cnt('stock_adjustments'), payments: cnt('payments'), payments_voided: cnt('payments', 'and voided = 1'),
    ...(catalog ? {
      danh_muc_moi: newSku.size, danh_muc_moi_co_anh: Object.keys(catalog.images || {}).length,
      kiotviet_da_ghep: (K.products || []).filter((p) => newSku.has(mapping[p.Code])).length,
      kiotviet_chua_ghep: (K.products || []).filter((p) => !newSku.has(mapping[p.Code])).length,
    } : {}),
  };
  const revenue = get(`select coalesce(sum(x.revenue), 0) s from delivery_lines x where x.book_id = ?`, B).s
    - get(`select coalesce(sum(x.revenue), 0) s from sales_return_lines x where x.book_id = ?`, B).s;
  // Doanh thu thuần KiotViet: tiền hàng − giảm giá của hóa đơn hoàn thành, trừ hàng trả (phí trả hàng cửa hàng giữ lại tính vào doanh thu)
  const kvRevenue = (K.invoices || []).filter((i) => i.Status === 1).reduce((t, i) => t + lineSum(i.Details || []) - (i.Discount || 0), 0)
    - (K.returns || []).filter((t) => t.Status === 1).reduce((t, r) => t + (r.TotalReturn || 0) - (r.ReturnFee || 0), 0);
  report.totals = {
    doanh_thu_thuan_he_thong: r0(revenue), doanh_thu_thuan_kiotviet: r0(kvRevenue),
    no_khach_he_thong: r0(custBalances(B, at).reduce((t, x) => t + x.balance, 0)), no_khach_kiotviet: r0((K.customers || []).reduce((t, c) => t + (c.Debt || 0), 0)),
    no_ncc_he_thong: r0(suppBalances(B, at).reduce((t, x) => t + x.balance, 0)), no_ncc_kiotviet: r0((K.suppliers || []).reduce((t, c) => t + (c.Debt || 0), 0)),
  };

  // ---------- xuất bản sao lưu ----------
  const backup = callRpc(uid, 'export_book', { book_id: B });
  backup.book_members = [];
  // Thông báo sinh ra khi dựng lại chứng từ cũ (đơn xác nhận…) không mang sang, tránh gửi hàng loạt thông báo đẩy về đơn nhiều năm trước
  backup.notifications = [];
  backup.settings_patch = settingsPatch;
  backup.source = { from: 'kiotviet', exported_at: today };
  return { backup, report };
}
