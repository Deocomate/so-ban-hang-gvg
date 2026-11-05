// Danh mục: sản phẩm (kể cả bộ), khách hàng, nhà cung cấp, quỹ tiền, nợ đầu kỳ, nhập danh sách từ Excel.
import { ctx, fail, one, run, insert, uuid, nowIso, num, int, bool, nz, trimNz, rnd, asDate, today, coalesce, PRICE_KEYS } from '../lib/context.js';
import { requirePerm, newMasterCode, nextCode, once } from './access.js';
import { doAdjust, saveUnits } from './stock.js';

export const PRODUCT_TYPES = { hang: 'Hàng hóa', dich_vu: 'Dịch vụ', combo: 'Combo - đóng gói', san_xuat: 'Hàng sản xuất' };
const nonNeg = (v, msg) => { const x = num(v); if ((x ?? 0) < 0) fail(msg); return x; };

// Hàng hóa. product_type: hang | dich_vu (không quản lý kho) | combo (bộ, trừ kho từng thành phần) | san_xuat (có định mức thành phần).
// Khi tạo mới: cost = giá vốn, opening_qty = tồn ban đầu → tự lập phiếu "Tồn đầu kỳ". Dịch vụ: cost là giá vốn tính khi bán.
export function save_product(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  if ((num(p.units_per_pack) ?? 1) <= 0) fail('Số lượng mỗi hộp phải lớn hơn 0');
  if ((num(p.pack_weight) ?? 0) < 0 || (num(p.unit_weight) ?? 0) < 0) fail('Trọng lượng không được âm');
  if ((num(p.norm_m2) ?? 0) < 0 || (num(p.norm_m) ?? 0) < 0) fail('Định mức không được âm');
  if (!trimNz(p.name)) fail('Thiếu tên sản phẩm');
  if (PRICE_KEYS.some((k) => (num(p[k]) ?? 0) < 0)) fail('Giá bán không được âm');
  const type = nz(p.product_type) || ((bool(p.is_kit) ?? false) ? 'combo' : 'hang');
  if (!PRODUCT_TYPES[type]) fail('Loại hàng không hợp lệ');
  const kit = type === 'combo'; const svc = type === 'dich_vu';
  const low = nonNeg(p.low_stock, 'Định mức tồn không được âm') ?? 0;
  const max = nonNeg(p.max_stock, 'Định mức tồn không được âm');
  if (max != null && max > 0 && max < low) fail('Định mức tồn cao nhất phải lớn hơn hoặc bằng tồn thấp nhất');
  const dimUnit = nz(p.dim_unit) || 'cm';
  if (!['cm', 'm'].includes(dimUnit)) fail('Đơn vị kích thước chỉ nhận cm hoặc m');
  const images = (Array.isArray(p.images) ? p.images : []).filter((x) => typeof x === 'string' && x);
  if (images.length > 5) fail('Tối đa 5 ảnh cho một hàng hóa');
  const cost = nonNeg(p.cost, 'Giá vốn không được âm');
  const openQty = nonNeg(p.opening_qty, 'Tồn kho ban đầu không được âm') ?? 0;
  let pid = nz(p.id); let s = trimNz(p.sku);
  const fields = {
    name: trimNz(p.name), category: p.category ?? null, brand: p.brand ?? null, pattern: p.pattern ?? null, size: p.size ?? null, color: p.color ?? null,
    unit: nz(p.unit) || 'Cái', image_url: images[0] ?? (Array.isArray(p.images) ? null : p.image_url ?? null),
    ...Object.fromEntries(PRICE_KEYS.map((k) => [k, num(p[k]) ?? 0])),
    low_stock: svc ? 0 : low, is_kit: kit ? 1 : 0, active: (bool(p.active) ?? true) ? 1 : 0, note: p.note ?? null,
    pack_unit: trimNz(p.pack_unit) || 'hộp', units_per_pack: num(p.units_per_pack),
    pack_weight: num(p.pack_weight), unit_weight: num(p.unit_weight), material: p.material ?? null, norm_m2: num(p.norm_m2), norm_m: num(p.norm_m),
    product_type: type, description: p.description ?? null, order_note: trimNz(p.order_note), max_stock: svc ? null : max, location: svc ? null : trimNz(p.location),
    width: nonNeg(p.width, 'Kích thước không được âm'), length: nonNeg(p.length, 'Kích thước không được âm'), dim_unit: dimUnit,
    sell_direct: (bool(p.sell_direct) ?? true) ? 1 : 0, updated_at: nowIso(),
  };
  fields.images = images.length ? images : fields.image_url ? [fields.image_url] : [];
  if (!pid) {
    if (!s) s = newMasterCode(b, 'SP', 'products');
    if (one(`select 1 from products where book_id = ? and lower(sku) = lower(?)`, b, s)) fail(`Mã SKU "${s}" đã tồn tại`);
    pid = uuid();
    insert('products', { id: pid, book_id: b, sku: s, ...fields, last_cost: cost ?? 0, created_at: nowIso() });
  } else {
    const old = one(`select * from products where id = ? and book_id = ?`, pid, b);
    if (!old) fail('Không tìm thấy sản phẩm');
    if (!s) s = old.sku;
    if (s.toLowerCase() !== old.sku.toLowerCase() && one(`select 1 from products where book_id = ? and lower(sku) = lower(?) and id <> ?`, b, s, pid)) {
      fail(`Mã SKU "${s}" đã tồn tại`);
    }
    const used = () => one(`select 1 from stock_moves where product_id = ?`, pid) || one(`select 1 from sales_order_lines where product_id = ?`, pid);
    if (kit !== !!old.is_kit && used()) fail('Sản phẩm đã có giao dịch — không thể đổi giữa hàng đơn lẻ và bộ. Hãy tạo mã mới.');
    if (svc && old.product_type !== 'dich_vu' && (old.on_hand !== 0 || one(`select 1 from stock_moves where product_id = ?`, pid))) {
      fail('Hàng đã có tồn kho hoặc phát sinh nhập xuất — không đổi thành dịch vụ được. Hãy tạo mã mới.');
    }
    if (!svc && old.product_type === 'dich_vu' && one(`select 1 from delivery_lines where product_id = ?`, pid)) {
      fail('Dịch vụ đã bán — không đổi thành hàng quản lý kho được. Hãy tạo mã mới.');
    }
    if (svc && one(`select 1 from kit_items where component_id = ?`, pid) || svc && one(`select 1 from bom_items where component_id = ?`, pid)) {
      fail('Hàng đang là thành phần của combo / hàng sản xuất — không đổi thành dịch vụ được');
    }
    const keys = Object.keys(fields);
    run(`update products set sku = ?, ${keys.map((k) => `${k} = ?`).join(', ')} where id = ?`, s, ...keys.map((k) => fields[k]), pid);
    if (svc && cost != null) run(`update products set last_cost = ? where id = ?`, cost, pid);
  }
  if (kit) {
    run(`delete from kit_items where kit_id = ?`, pid);
    let n = 0;
    for (const c of p.components || []) {
      if (c.product_id === pid) fail('Bộ không thể chứa chính nó');
      if (!one(`select 1 from products where id = ? and book_id = ? and is_kit = 0 and product_type <> 'dich_vu'`, c.product_id, b)) fail('Thành phần của bộ phải là hàng hóa có tồn kho trong cùng sổ');
      const q = num(c.qty) ?? 0;
      if (q <= 0) fail('Số lượng thành phần phải lớn hơn 0');
      run(`insert into kit_items (kit_id, component_id, qty) values (?, ?, ?) on conflict (kit_id, component_id) do update set qty = qty + excluded.qty`, pid, c.product_id, q);
      n++;
    }
    if (!n) fail('Bộ sản phẩm cần ít nhất 1 thành phần');
  }
  if (type === 'san_xuat' && Array.isArray(p.bom)) {
    run(`delete from bom_items where product_id = ?`, pid);
    const seen = new Set();
    for (const c of p.bom) {
      if (!c.product_id) continue;
      if (c.product_id === pid) fail('Hàng thành phần không được trùng với hàng sản xuất');
      if (seen.has(c.product_id)) fail('Một hàng thành phần chỉ ghi một dòng');
      seen.add(c.product_id);
      if (!one(`select 1 from products where id = ? and book_id = ? and is_kit = 0 and product_type <> 'dich_vu'`, c.product_id, b)) fail('Hàng thành phần phải là hàng hóa có tồn kho trong cùng sổ');
      const q = num(c.qty) ?? 0;
      if (q <= 0) fail('Số lượng thành phần phải lớn hơn 0');
      insert('bom_items', { book_id: b, product_id: pid, component_id: c.product_id, qty: q });
    }
  }
  if (Array.isArray(p.units)) saveUnits(b, pid, fields.unit, p.units);
  if (!nz(p.id) && openQty > 0) {
    if (kit || svc) fail(`${PRODUCT_TYPES[type]} không có tồn kho riêng — bỏ trống ô Tồn kho`);
    requirePerm(b, 'owner');
    doAdjust(b, asDate(p.opening_date) || today(), 'dau_ky', `Tồn đầu kỳ khi tạo hàng ${s}`, [{ product_id: pid, qty_delta: openQty, unit_cost: cost ?? 0 }]);
  }
  return { id: pid, sku: s };
}

// Tạo nhiều mã con theo thuộc tính (mẫu, kích thước, màu, chất liệu) trong một lần lưu
export function create_product_variants(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const vs = p.variants || [];
  if (!vs.length) fail('Chưa có biến thể nào');
  if (vs.length > 200) fail('Tối đa 200 biến thể mỗi lần');
  const skus = vs.map((v) => trimNz(v.sku)?.toLowerCase()).filter(Boolean);
  if (new Set(skus).size !== skus.length) fail('Mã SKU của các biến thể bị trùng nhau');
  const base = p.base || {};
  return { created: vs.map((v) => save_product({ ...base, ...v, book_id: b, id: null, units: base.units, components: base.components, bom: base.bom })) };
}

// Xóa hàng chưa từng phát sinh giao dịch; đã có giao dịch thì chỉ ngừng kinh doanh
export function delete_product(p) {
  const pr = one(`select * from products where id = ?`, p.id);
  if (!pr) fail('Không tìm thấy sản phẩm');
  requirePerm(pr.book_id, 'danh_muc');
  const refs = [
    ['stock_moves', 'product_id'], ['sales_order_lines', 'product_id'], ['purchase_order_lines', 'product_id'], ['kit_items', 'component_id'],
    ['bom_items', 'component_id'], ['production_lines', 'product_id'], ['productions', 'product_id'], ['stock_adjustment_lines', 'product_id'],
  ];
  if (refs.some(([t, c]) => one(`select 1 from ${t} where ${c} = ? limit 1`, pr.id))) {
    fail(`${pr.sku} đã có giao dịch hoặc là thành phần của hàng khác — không xóa được. Hãy bỏ chọn "Đang kinh doanh" để ngừng bán.`);
  }
  run(`delete from products where id = ?`, pr.id);
  return { ok: true };
}

export function save_party(p) {
  const b = p.book_id; const k = p.type;
  requirePerm(b, 'danh_muc');
  if (!['kh', 'ncc'].includes(k)) fail('Loại đối tượng không hợp lệ');
  const tbl = k === 'kh' ? 'customers' : 'suppliers';
  if (!trimNz(p.name)) fail('Thiếu tên');
  let pid = nz(p.id); let c = trimNz(p.code);
  if (!c && !pid) c = newMasterCode(b, k === 'kh' ? 'KH' : 'NCC', tbl);
  if (c && one(`select 1 from ${tbl} where book_id = ? and lower(code) = lower(?) and id is not ?`, b, c, pid)) fail(`Mã "${c}" đã tồn tại`);
  const common = { name: trimNz(p.name), phone: p.phone ?? null, address: p.address ?? null, contact: p.contact ?? null,
    credit_days: int(p.credit_days) ?? 0, note: p.note ?? null };
  if (k === 'kh' && p.stage != null && !['moi', 'tu_van'].includes(p.stage)) fail('Giai đoạn khách hàng không hợp lệ');
  const extra = k === 'kh' ? { kind: p.kind ?? null, price_tier: int(p.price_tier) ?? 1, credit_limit: num(p.credit_limit) ?? 0, extra: p.extra && typeof p.extra === 'object' ? p.extra : {}, stage: p.stage || 'moi' } : {};
  if (!pid) {
    pid = uuid();
    insert(tbl, { id: pid, book_id: b, code: c, ...common, ...extra, created_at: nowIso() });
  } else {
    const f = { ...common, ...extra, active: (bool(p.active) ?? true) ? 1 : 0 };
    const keys = Object.keys(f);
    const n = run(`update ${tbl} set code = coalesce(?, code), ${keys.map((x) => `${x} = ?`).join(', ')} where id = ? and book_id = ?`,
      c, ...keys.map((x) => f[x]), pid, b).changes;
    if (!n) fail(k === 'kh' ? 'Không tìm thấy khách hàng' : 'Không tìm thấy nhà cung cấp');
  }
  return { id: pid, code: c };
}

export function save_fund(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  if (!trimNz(p.name)) fail('Thiếu tên quỹ');
  let fid = nz(p.id);
  if (!fid) {
    fid = uuid();
    insert('funds', { id: fid, book_id: b, name: trimNz(p.name), opening_balance: num(p.opening_balance) ?? 0, sort: int(p.sort) ?? 9 });
  } else {
    run(`update funds set name = ?, opening_balance = ?, active = ? where id = ? and book_id = ?`,
      trimNz(p.name), num(p.opening_balance) ?? 0, (bool(p.active) ?? true) ? 1 : 0, fid, b);
  }
  return { id: fid };
}

export function save_opening_debt(p) {
  const b = p.book_id; const pt = p.party_type; const pid = p.party_id;
  requirePerm(b, 'owner');
  if (pt === 'kh' && !one(`select 1 from customers where id = ? and book_id = ?`, pid, b)) fail('Không tìm thấy khách hàng');
  if (pt === 'ncc' && !one(`select 1 from suppliers where id = ? and book_id = ?`, pid, b)) fail('Không tìm thấy nhà cung cấp');
  if (!['kh', 'ncc'].includes(pt)) fail('Loại đối tượng không hợp lệ');
  if (!num(p.amount)) fail('Số tiền nợ đầu kỳ phải khác 0');
  const id = uuid(); const code = nextCode(b, 'DK');
  insert('opening_debts', { id, book_id: b, code, party_type: pt, party_id: pid, amount: rnd(num(p.amount)), debt_date: asDate(p.debt_date) || today(),
    due_date: asDate(p.due_date), note: p.note ?? null, created_by: ctx.uid, created_at: nowIso() });
  return { id, code };
}

export function delete_opening_debt(p) {
  const d = one(`select * from opening_debts where id = ?`, p.id);
  if (!d) fail('Không tìm thấy khoản nợ');
  requirePerm(d.book_id, 'owner');
  if (one(`select 1 from v_alloc_signed where doc_id = ?`, d.id)) fail('Khoản nợ đã có thanh toán — hãy hủy phiếu thu/chi trước');
  run(`delete from opening_debts where id = ?`, d.id);
  return { ok: true };
}

// Sửa nhanh nhiều giá bán trên màn Bảng giá. p.rows = [{id, price1…price5}]
export function save_prices(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  let n = 0;
  for (const r of p.rows || []) {
    const ps = PRICE_KEYS.map((k) => num(r[k]));
    if (ps.some((v) => (v ?? 0) < 0)) fail('Giá bán không được âm');
    n += run(`update products set ${PRICE_KEYS.map((k) => `${k} = coalesce(?, ${k})`).join(', ')}, updated_at = ?
      where id = ? and book_id = ?`, ...ps, nowIso(), r.id, b).changes;
  }
  return { updated: n };
}

// Nhập khách hàng / nhà cung cấp kèm nợ đầu kỳ. Mã đã có: ô trống giữ nguyên giá trị cũ, không ghi đè.
export function import_parties(p) {
  const b = p.book_id; const k = p.type;
  requirePerm(b, 'owner');
  return once(p, b, 'import_parties', () => {
    let i = 0, created = 0, updated = 0, debts = 0, total = 0; const warn = [];
    for (const row of p.rows || []) {
      i++;
      const c = trimNz(row.code);
      const ex = c ? one(`select * from ${k === 'kh' ? 'customers' : 'suppliers'} where book_id = ? and lower(code) = lower(?)`, b, c) : null;
      if (!ex && !trimNz(row.name)) fail(`Dòng ${i}: thiếu tên`);
      const given = Object.fromEntries(Object.entries(row).filter(([, v]) => trimNz(v) !== null));
      const res = save_party({ ...ex, ...given, book_id: b, type: k, id: ex?.id ?? null });
      if (ex) updated++; else created++;
      const amt = num(row.opening_debt) ?? 0;
      if (amt !== 0) {
        if (!ex) {
          save_opening_debt({ book_id: b, party_type: k, party_id: res.id, amount: amt, debt_date: coalesce(nz(row.debt_date), p.debt_date),
            due_date: nz(row.due_date), note: 'Nợ đầu kỳ nhập từ Excel' });
          debts++; total += rnd(amt);
        } else {
          warn.push(`Dòng ${i}: mã ${c} đã có — bỏ qua nợ đầu kỳ ${amt}`);
        }
      }
    }
    return { created, updated, debts, debt_total: total, warnings: warn };
  });
}
