// Danh mục: sản phẩm (kể cả bộ), khách hàng, nhà cung cấp, quỹ tiền, nợ đầu kỳ, nhập danh sách từ Excel.
import { ctx, fail, one, run, insert, uuid, nowIso, num, int, bool, nz, trimNz, rnd, asDate, today, coalesce } from '../lib/context.js';
import { requirePerm, newMasterCode, nextCode, once } from './access.js';

export function save_product(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  if ((num(p.units_per_pack) ?? 1) <= 0) fail('Số lượng mỗi hộp phải lớn hơn 0');
  if ((num(p.pack_weight) ?? 0) < 0 || (num(p.unit_weight) ?? 0) < 0) fail('Trọng lượng không được âm');
  if (!trimNz(p.name)) fail('Thiếu tên sản phẩm');
  if ((num(p.price1) ?? 0) < 0 || (num(p.price2) ?? 0) < 0 || (num(p.price3) ?? 0) < 0) fail('Giá bán không được âm');
  let pid = nz(p.id); let s = trimNz(p.sku); const kit = bool(p.is_kit) ?? false;
  const fields = {
    name: trimNz(p.name), category: p.category ?? null, pattern: p.pattern ?? null, size: p.size ?? null, color: p.color ?? null,
    unit: nz(p.unit) || 'Cái', image_url: p.image_url ?? null, price1: num(p.price1) ?? 0, price2: num(p.price2) ?? 0, price3: num(p.price3) ?? 0,
    low_stock: num(p.low_stock) ?? 0, is_kit: kit ? 1 : 0, active: (bool(p.active) ?? true) ? 1 : 0, note: p.note ?? null,
    pack_unit: trimNz(p.pack_unit) || 'hộp', units_per_pack: num(p.units_per_pack),
    pack_weight: num(p.pack_weight), unit_weight: num(p.unit_weight), updated_at: nowIso(),
  };
  if (!pid) {
    if (!s) s = newMasterCode(b, 'SP', 'products');
    if (one(`select 1 from products where book_id = ? and lower(sku) = lower(?)`, b, s)) fail(`Mã SKU "${s}" đã tồn tại`);
    pid = uuid();
    insert('products', { id: pid, book_id: b, sku: s, ...fields, created_at: nowIso() });
  } else {
    const old = one(`select * from products where id = ? and book_id = ?`, pid, b);
    if (!old) fail('Không tìm thấy sản phẩm');
    if (!s) s = old.sku;
    if (s.toLowerCase() !== old.sku.toLowerCase() && one(`select 1 from products where book_id = ? and lower(sku) = lower(?) and id <> ?`, b, s, pid)) {
      fail(`Mã SKU "${s}" đã tồn tại`);
    }
    if (kit !== !!old.is_kit && (one(`select 1 from stock_moves where product_id = ?`, pid) || one(`select 1 from sales_order_lines where product_id = ?`, pid))) {
      fail('Sản phẩm đã có giao dịch — không thể đổi giữa hàng đơn lẻ và bộ. Hãy tạo mã mới.');
    }
    const keys = Object.keys(fields);
    run(`update products set sku = ?, ${keys.map((k) => `${k} = ?`).join(', ')} where id = ?`, s, ...keys.map((k) => fields[k]), pid);
  }
  if (kit) {
    run(`delete from kit_items where kit_id = ?`, pid);
    let n = 0;
    for (const c of p.components || []) {
      if (c.product_id === pid) fail('Bộ không thể chứa chính nó');
      if (!one(`select 1 from products where id = ? and book_id = ? and is_kit = 0`, c.product_id, b)) fail('Thành phần của bộ phải là sản phẩm đơn lẻ trong cùng sổ');
      const q = num(c.qty) ?? 0;
      if (q <= 0) fail('Số lượng thành phần phải lớn hơn 0');
      run(`insert into kit_items (kit_id, component_id, qty) values (?, ?, ?) on conflict (kit_id, component_id) do update set qty = qty + excluded.qty`, pid, c.product_id, q);
      n++;
    }
    if (!n) fail('Bộ sản phẩm cần ít nhất 1 thành phần');
  }
  return { id: pid, sku: s };
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
  const extra = k === 'kh' ? { kind: p.kind ?? null, price_tier: int(p.price_tier) ?? 1, credit_limit: num(p.credit_limit) ?? 0 } : {};
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
