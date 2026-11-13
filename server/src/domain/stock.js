// Kho: ghi sổ kho (giá vốn bình quân gia quyền di động), phiếu điều chỉnh / xuất hủy / xuất dùng nội bộ, phiếu sản xuất, nhập hàng hóa từ Excel kèm tồn đầu kỳ.
import { ctx, fail, one, run, insert, uuid, nowIso, rnd, num, bool, nz, trimNz, coalesce, asDate, today, PRICE_KEYS } from '../lib/context.js';
import { requirePerm, checkDate, nextCode, newMasterCode, once } from './access.js';
import { costMethod, fixedCostOf } from './costing.js';
import { checkTxnDate } from './order-rules.js';

const qty6 = (x) => rnd(x, 6);
export const avgCost = (p) => (p.on_hand > 0 ? p.stock_value / p.on_hand : p.last_cost);

// p_qty > 0: nhập. Giá trị = value (nếu có) hoặc qty × unitCost.
// p_qty < 0: xuất. Giá trị = value (nếu có, vd. trả NCC theo giá mua) hoặc theo giá vốn bình quân hiện tại.
// Trả về giá trị (có dấu) của biến động.
export function postMove(book, pid, date, q, unitCost, docType, docId, docCode, lineId, note, value = null) {
  const p = one(`select * from products where id = ? and book_id = ?`, pid, book);
  if (!p) fail('Không tìm thấy sản phẩm');
  if (p.is_kit) fail(`Sản phẩm "${p.name}" là bộ — không có tồn riêng`);
  if (p.product_type === 'dich_vu') fail(`"${p.name}" là dịch vụ — không quản lý tồn kho`);
  if (!q) return 0;
  let v, nq, nv, adj = 0, inflow = null;
  // Giá trị gốc của dòng nhập có giá (nhập hàng, tồn đầu kỳ, điều chỉnh có đơn giá) hoặc trả NCC theo giá nhập:
  // giữ lại để đổi phương pháp giá vốn qua lại không mất giá nhập thật
  const src = q > 0 ? (value != null ? rnd(value) : unitCost != null ? rnd(q * unitCost) : null) : value != null ? -Math.abs(rnd(value)) : null;
  const move = (o) => insert('stock_moves', { book_id: book, product_id: pid, move_date: date, doc_id: docId, doc_code: docCode, line_id: lineId,
    created_by: ctx.uid, created_at: nowIso(), ...o });
  // Giá vốn cố định: mọi biến động tính theo số lượng × giá vốn cố định, tồn kho luôn bằng số lượng × giá vốn cố định
  if (costMethod(book) === 'fixed') {
    const f = fixedCostOf(p);
    v = rnd(q * f); nq = qty6(p.on_hand + q); nv = rnd(nq * f);
    move({ qty: q, value: v, unit_cost: f, doc_type: docType, balance_qty: nq, balance_value: nv, note, src_value: src });
    run(`update products set on_hand = ?, stock_value = ?, last_cost = ?, fixed_cost = ?, updated_at = ? where id = ?`, nq, nv, f, f, nowIso(), pid);
    return v;
  }
  if (q > 0) {
    v = value != null ? rnd(value) : rnd(q * coalesce(unitCost, avgCost(p)));
    inflow = v / q;
    nq = qty6(p.on_hand + q);
    nv = p.stock_value + v;
    // Đang âm kho (đã bán quá) rồi nhập về: đưa giá trị tồn về đúng giá nhập, phần chênh tính vào giá vốn
    if (p.on_hand < 0 && nq > 0) { adj = rnd(nq * inflow) - nv; nv += adj; }
  } else {
    if (value != null) v = -Math.abs(rnd(value));
    else if (p.on_hand > 0 && -q === p.on_hand) v = -p.stock_value;     // xuất hết: lấy đúng toàn bộ giá trị còn lại
    else v = -rnd(-q * avgCost(p));
    nq = qty6(p.on_hand + q);
    nv = p.stock_value + v;
    if (nq === 0 && nv !== 0) { adj = -nv; nv = 0; }                     // hết hàng mà còn lẻ giá trị: chuyển phần lẻ vào giá vốn
  }
  move({ qty: q, value: v, unit_cost: Math.abs(v / q), doc_type: docType, balance_qty: nq, balance_value: nv - adj, note, src_value: src });
  if (adj !== 0) {
    move({ qty: 0, value: adj, unit_cost: 0, doc_type: 'chenh_lech', balance_qty: nq, balance_value: nv,
      note: 'Chênh lệch làm tròn / âm kho được tính vào giá vốn' });
  }
  run(`update products set on_hand = ?, stock_value = ?, last_cost = ?, updated_at = ? where id = ?`,
    nq, nv, nq > 0 ? nv / nq : q > 0 ? inflow : p.last_cost, nowIso(), pid);
  return v;
}

// Đơn vị ghi trên dòng đơn bán / đơn nhập: tên đơn vị và quy đổi lấy từ danh mục, số lượng và đơn giá vẫn theo đơn vị cơ bản
export function lineUnit(pr, name) {
  const n = trimNz(name);
  if (!n || n.toLowerCase() === String(pr.unit).toLowerCase()) return { unit_name: null, unit_conv: 1 };
  const u = one(`select name, conv from product_units where product_id = ? and lower(name) = lower(?)`, pr.id, n);
  if (!u) fail(`${pr.sku}: không có đơn vị "${n}"`);
  return { unit_name: u.name, unit_conv: u.conv };
}

// Lý do chỉ ghi giảm: xuất hủy (vỡ, lỗi, thất thoát, hàng trả lỗi) và xuất dùng nội bộ
export const DAMAGE_REASONS = ['vo', 'loi', 'that_thoat', 'hang_tra_loi'];
export const INTERNAL_PURPOSES = ['Văn phòng phẩm, dụng cụ làm việc', 'Vật tư tiêu hao, công cụ dụng cụ', 'Sự kiện, hội nghị nội bộ',
  'Bồi thường, đền bù', 'Mẫu trưng bày, demo sản phẩm', 'Quà tặng khách hàng, đối tác', 'Khác'];
const codePrefix = (reason) => (DAMAGE_REASONS.includes(reason) ? 'XH' : reason === 'noi_bo' ? 'XNB' : 'DC');

export function doAdjust(book, date, reason, note, lines, check = true, purpose = null) {
  checkDate(book, date);
  const code = nextCode(book, codePrefix(reason));
  const id = uuid();
  insert('stock_adjustments', { id, book_id: book, code, adj_date: date, reason, note, purpose, created_by: ctx.uid, created_at: nowIso() });
  let n = 0;
  for (const l of lines || []) {
    const q = num(l.qty_delta);
    if (!q) continue;
    const pr = one(`select * from products where id = ? and book_id = ?`, l.product_id, book);
    if (!pr) fail('Không tìm thấy sản phẩm trong sổ');
    if (pr.is_kit) fail(`"${pr.name}" là bộ — hãy điều chỉnh từng thành phần`);
    if (q < 0 && check && pr.on_hand + q < 0) fail(`Không thể giảm ${-q} ${pr.unit} "${pr.name}": tồn hiện tại chỉ còn ${pr.on_hand}`);
    const uc = num(l.unit_cost);
    if (q > 0 && (uc ?? 0) < 0) fail('Giá vốn không được âm');
    const lid = uuid();
    insert('stock_adjustment_lines', { id: lid, adjustment_id: id, book_id: book, product_id: pr.id, qty_delta: q, unit_cost: 0, value: 0 });
    const v = postMove(book, pr.id, date, q, uc, reason === 'dau_ky' ? 'dau_ky' : 'dieu_chinh', id, code, lid, note, num(l.value));
    run(`update stock_adjustment_lines set value = ?, unit_cost = ? where id = ?`, v, Math.abs(v / q), lid);
    n++;
  }
  if (!n) fail('Phiếu điều chỉnh chưa có dòng nào');
  return { id, code };
}

export function adjust_stock(p) {
  const b = p.book_id; const reason = p.reason || 'khac';
  requirePerm(b, reason === 'dau_ky' ? 'owner' : 'kho');
  return once(p, b, 'adjust_stock', () => {
    if (DAMAGE_REASONS.includes(reason) && (p.lines || []).some((x) => num(x.qty_delta) > 0)) {
      fail('Hàng vỡ/lỗi/thất thoát chỉ được ghi giảm số lượng');
    }
    if (reason === 'noi_bo' && (p.lines || []).some((x) => num(x.qty_delta) > 0)) fail('Xuất dùng nội bộ chỉ được ghi giảm số lượng');
    const purpose = reason === 'noi_bo' ? trimNz(p.purpose) : null;
    if (reason === 'noi_bo' && !INTERNAL_PURPOSES.includes(purpose)) fail('Chọn loại xuất dùng nội bộ');
    if (['khac', 'kiem_ke'].includes(reason) && !trimNz(p.note)) fail('Hãy ghi rõ lý do điều chỉnh');
    if (reason !== 'dau_ky') checkTxnDate(b, 'kho', asDate(p.date) || today());
    return doAdjust(b, asDate(p.date) || today(), reason, p.note ?? null, p.lines || [], true, purpose);
  });
}

// ---------- SẢN XUẤT ----------
// Xuất các thành phần theo giá vốn bình quân, nhập thành phẩm với giá trị bằng tổng giá trị đã xuất.
// p = {date, product_id, qty, note, lines: [{product_id, qty}], save_bom}: save_bom ghi lại số lượng/1 thành phẩm làm định mức cho lần sau.
export function save_production(p) {
  const b = p.book_id;
  requirePerm(b, 'kho');
  return once(p, b, 'save_production', () => {
    const d = asDate(p.date) || today();
    checkDate(b, d);
    checkTxnDate(b, 'kho', d);
    const pr = one(`select * from products where id = ? and book_id = ?`, p.product_id, b);
    if (!pr) fail('Chọn mặt hàng sản xuất');
    if (pr.is_kit) fail(`"${pr.name}" là bộ — không sản xuất thành hàng tồn riêng`);
    const q = num(p.qty);
    if (!(q > 0)) fail('Số lượng sản xuất phải lớn hơn 0');
    const lines = []; const seen = new Set();
    for (const l of p.lines || []) {
      const lq = num(l.qty);
      if (!l.product_id || !lq) continue;
      if (lq < 0) fail('Số lượng thành phần không được âm');
      if (l.product_id === pr.id) fail('Thành phần không được trùng với mặt hàng sản xuất');
      if (seen.has(l.product_id)) fail('Một thành phần chỉ ghi một dòng');
      seen.add(l.product_id);
      const c = one(`select * from products where id = ? and book_id = ?`, l.product_id, b);
      if (!c) fail('Không tìm thấy thành phần trong sổ');
      if (c.is_kit) fail(`"${c.name}" là bộ — hãy ghi từng thành phần`);
      if (c.on_hand < lq) fail(`Không đủ "${c.name}": cần ${lq} ${c.unit}, tồn chỉ còn ${c.on_hand}`);
      lines.push({ c, qty: lq });
    }
    if (!lines.length) fail('Phiếu sản xuất chưa có thành phần nào');
    const code = nextCode(b, 'SX'); const id = uuid();
    insert('productions', { id, book_id: b, code, prod_date: d, product_id: pr.id, qty: q, value: 0, note: p.note ?? null, created_by: ctx.uid, created_at: nowIso() });
    let total = 0;
    for (const l of lines) {
      const lid = uuid();
      insert('production_lines', { id: lid, production_id: id, book_id: b, product_id: l.c.id, qty: l.qty, value: 0 });
      const v = -postMove(b, l.c.id, d, -l.qty, null, 'san_xuat', id, code, lid, p.note ?? null);
      run(`update production_lines set value = ? where id = ?`, v, lid);
      total += v;
    }
    postMove(b, pr.id, d, q, null, 'san_xuat', id, code, null, p.note ?? null, total);
    run(`update productions set value = ? where id = ?`, total, id);
    if (p.save_bom) {
      run(`delete from bom_items where product_id = ?`, pr.id);
      for (const l of lines) insert('bom_items', { book_id: b, product_id: pr.id, component_id: l.c.id, qty: qty6(l.qty / q) });
    }
    return { id, code, value: total };
  });
}

// Đơn vị quy đổi: thay toàn bộ danh sách. prices = [mức 1..4], ô trống = giá cơ bản × quy đổi
export function saveUnits(b, pid, baseUnit, units) {
  run(`delete from product_units where product_id = ?`, pid);
  const names = new Set([String(baseUnit).toLowerCase()]);
  units.forEach((u, i) => {
    const name = trimNz(u.name);
    if (!name) fail(`Đơn vị quy đổi dòng ${i + 1}: thiếu tên đơn vị`);
    if (names.has(name.toLowerCase())) fail(`Đơn vị "${name}" bị trùng`);
    names.add(name.toLowerCase());
    const conv = num(u.conv);
    if (!(conv > 0)) fail(`Đơn vị "${name}": giá trị quy đổi phải lớn hơn 0`);
    const prices = (Array.isArray(u.prices) ? u.prices : []).slice(0, 4).map((x) => (x == null || x === '' ? null : num(x)));
    if (prices.some((x) => x != null && x < 0)) fail(`Đơn vị "${name}": giá bán không được âm`);
    insert('product_units', { id: uuid(), book_id: b, product_id: pid, name, conv, prices, sell_direct: (bool(u.sell_direct) ?? true) ? 1 : 0, sort: i });
  });
}

// ---------- IMPORT HÀNG HÓA (1 lần, kèm tồn đầu kỳ) ----------
// Dòng có SKU đã tồn tại: chỉ cập nhật thông tin & giá, KHÔNG đổi tồn kho; ô trống giữ nguyên giá trị cũ.
// Dòng mới: tạo sản phẩm; nếu có số lượng > 0 thì ghi 1 phiếu "Tồn đầu kỳ" theo giá vốn.
export function import_products(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  return once(p, b, 'import_products', () => {
    const d = asDate(p.opening_date) || today();
    let i = 0, created = 0, updated = 0, skipped = 0;
    const ol = []; const seen = new Set(); const warn = [];
    for (const row of p.rows || []) {
      i++;
      const q = num(row.qty) ?? 0;
      const cst = num(row.cost);
      if ((num(row.pack_weight) ?? 0) < 0 || (num(row.unit_weight) ?? 0) < 0) fail(`Dòng ${i}: trọng lượng không được âm`);
      if (q < 0) fail(`Dòng ${i}: số lượng không được âm`);
      if ((cst ?? 0) < 0 || PRICE_KEYS.some((k) => (num(row[k]) ?? 0) < 0)) fail(`Dòng ${i}: giá không được âm`);
      let s = trimNz(row.sku); let ex = null;
      if (s) {
        if (seen.has(s.toLowerCase())) fail(`Dòng ${i}: SKU "${s}" bị lặp trong file`);
        seen.add(s.toLowerCase());
        ex = one(`select * from products where book_id = ? and lower(sku) = lower(?)`, b, s);
      }
      if (!ex && !trimNz(row.name)) fail(`Dòng ${i}: thiếu tên hàng hóa`);
      const type = nz(row.product_type);
      if (type && !['hang', 'dich_vu', 'san_xuat'].includes(type)) fail(`Dòng ${i}: loại hàng nhập từ Excel chỉ nhận Hàng hóa, Dịch vụ, Hàng sản xuất`);
      if (ex && type && type !== ex.product_type) fail(`Dòng ${i}: không đổi loại hàng của ${ex.sku} qua Excel`);
      if (type === 'dich_vu' && q > 0) fail(`Dòng ${i}: dịch vụ không có tồn kho`);
      for (const k of ['max_stock', 'width', 'length']) if ((num(row[k]) ?? 0) < 0) fail(`Dòng ${i}: số âm không hợp lệ`);
      const dimUnit = nz(row.dim_unit);
      if (dimUnit && !['cm', 'm'].includes(dimUnit)) fail(`Dòng ${i}: đơn vị kích thước chỉ nhận cm hoặc m`);
      const sd = row.sell_direct == null || row.sell_direct === '' ? null : ((bool(row.sell_direct) ?? true) ? 1 : 0);
      if (ex) {
        run(`update products set name = coalesce(?, name), category = coalesce(?, category), brand = coalesce(?, brand), pattern = coalesce(?, pattern), size = coalesce(?, size),
            color = coalesce(?, color), unit = coalesce(?, unit), units_per_pack = coalesce(?, units_per_pack), pack_unit = coalesce(?, pack_unit),
            pack_weight = coalesce(?, pack_weight), unit_weight = coalesce(?, unit_weight), material = coalesce(?, material), norm_m2 = coalesce(?, norm_m2), norm_m = coalesce(?, norm_m),
            price1 = coalesce(?, price1), price2 = coalesce(?, price2), price3 = coalesce(?, price3), price4 = coalesce(?, price4), price5 = coalesce(?, price5), low_stock = coalesce(?, low_stock),
            note = coalesce(?, note), max_stock = coalesce(?, max_stock), location = coalesce(?, location), width = coalesce(?, width), length = coalesce(?, length),
            dim_unit = coalesce(?, dim_unit), sell_direct = coalesce(?, sell_direct), description = coalesce(?, description), order_note = coalesce(?, order_note), updated_at = ? where id = ?`,
          trimNz(row.name), nz(row.category), nz(row.brand), nz(row.pattern), nz(row.size), nz(row.color), nz(row.unit), num(row.units_per_pack), trimNz(row.pack_unit),
          num(row.pack_weight), num(row.unit_weight), nz(row.material), num(row.norm_m2), num(row.norm_m), ...PRICE_KEYS.map((k) => num(row[k])), num(row.low_stock), nz(row.note),
          num(row.max_stock), trimNz(row.location), num(row.width), num(row.length), dimUnit, sd, nz(row.description), trimNz(row.order_note), nowIso(), ex.id);
        if (Array.isArray(row.units)) saveUnits(b, ex.id, nz(row.unit) || ex.unit, row.units);
        updated++;
        if (q > 0) { skipped++; warn.push(`Dòng ${i}: SKU ${ex.sku} đã có — bỏ qua số lượng ${q} (tồn chỉ đổi qua phiếu điều chỉnh)`); }
      } else {
        if (!s) s = newMasterCode(b, 'SP', 'products');
        const id = uuid();
        insert('products', { id, book_id: b, sku: s, name: trimNz(row.name), material: nz(row.material), norm_m2: num(row.norm_m2), norm_m: num(row.norm_m), category: nz(row.category), brand: nz(row.brand), pattern: nz(row.pattern), size: nz(row.size),
          color: nz(row.color), unit: nz(row.unit) || 'Cái', ...Object.fromEntries(PRICE_KEYS.map((k) => [k, num(row[k]) ?? 0])),
          low_stock: num(row.low_stock) ?? 0, note: nz(row.note), last_cost: cst ?? 0, units_per_pack: num(row.units_per_pack),
          pack_unit: trimNz(row.pack_unit) || 'hộp', pack_weight: num(row.pack_weight), unit_weight: num(row.unit_weight),
          product_type: type || 'hang', max_stock: type === 'dich_vu' ? null : num(row.max_stock), location: type === 'dich_vu' ? null : trimNz(row.location),
          width: num(row.width), length: num(row.length), dim_unit: dimUnit || 'cm', sell_direct: sd ?? 1, description: nz(row.description), order_note: trimNz(row.order_note),
          created_at: nowIso(), updated_at: nowIso() });
        if (Array.isArray(row.units)) saveUnits(b, id, nz(row.unit) || 'Cái', row.units);
        created++;
        if (q > 0) {
          if (cst == null) warn.push(`Dòng ${i}: ${s} có số lượng nhưng chưa có giá vốn — ghi giá vốn 0`);
          ol.push({ product_id: id, qty_delta: q, unit_cost: cst ?? 0 });
        }
      }
    }
    if (!i) fail('File không có dòng dữ liệu nào');
    const adj = ol.length ? doAdjust(b, d, 'dau_ky', p.note ?? 'Tồn đầu kỳ nhập từ Excel', ol) : null;
    return {
      created, updated, skipped_qty: skipped, opening_lines: ol.length,
      opening_qty: ol.reduce((s, x) => s + x.qty_delta, 0),
      opening_value: adj ? one(`select coalesce(sum(value), 0) v from stock_adjustment_lines where adjustment_id = ?`, adj.id).v : 0,
      adjustment_code: adj?.code ?? null, warnings: warn,
    };
  });
}
