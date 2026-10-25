// Kho: ghi sổ kho (giá vốn bình quân gia quyền di động), phiếu điều chỉnh, nhập hàng hóa từ Excel kèm tồn đầu kỳ.
import { ctx, fail, one, run, insert, uuid, nowIso, rnd, num, nz, trimNz, coalesce, asDate, today } from '../lib/context.js';
import { requirePerm, checkDate, nextCode, newMasterCode, once } from './access.js';

const qty6 = (x) => rnd(x, 6);
export const avgCost = (p) => (p.on_hand > 0 ? p.stock_value / p.on_hand : p.last_cost);

// p_qty > 0: nhập. Giá trị = value (nếu có) hoặc qty × unitCost.
// p_qty < 0: xuất. Giá trị = value (nếu có, vd. trả NCC theo giá mua) hoặc theo giá vốn bình quân hiện tại.
// Trả về giá trị (có dấu) của biến động.
export function postMove(book, pid, date, q, unitCost, docType, docId, docCode, lineId, note, value = null) {
  const p = one(`select * from products where id = ? and book_id = ?`, pid, book);
  if (!p) fail('Không tìm thấy sản phẩm');
  if (p.is_kit) fail(`Sản phẩm "${p.name}" là bộ — không có tồn riêng`);
  if (!q) return 0;
  let v, nq, nv, adj = 0, inflow = null;
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
  const move = (o) => insert('stock_moves', { book_id: book, product_id: pid, move_date: date, doc_id: docId, doc_code: docCode, line_id: lineId,
    created_by: ctx.uid, created_at: nowIso(), ...o });
  move({ qty: q, value: v, unit_cost: Math.abs(v / q), doc_type: docType, balance_qty: nq, balance_value: nv - adj, note });
  if (adj !== 0) {
    move({ qty: 0, value: adj, unit_cost: 0, doc_type: 'chenh_lech', balance_qty: nq, balance_value: nv,
      note: 'Chênh lệch làm tròn / âm kho được tính vào giá vốn' });
  }
  run(`update products set on_hand = ?, stock_value = ?, last_cost = ?, updated_at = ? where id = ?`,
    nq, nv, nq > 0 ? nv / nq : q > 0 ? inflow : p.last_cost, nowIso(), pid);
  return v;
}

export function doAdjust(book, date, reason, note, lines, check = true) {
  checkDate(book, date);
  const code = nextCode(book, 'DC');
  const id = uuid();
  insert('stock_adjustments', { id, book_id: book, code, adj_date: date, reason, note, created_by: ctx.uid, created_at: nowIso() });
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
    if (['vo', 'loi', 'that_thoat', 'hang_tra_loi'].includes(reason) && (p.lines || []).some((x) => num(x.qty_delta) > 0)) {
      fail('Hàng vỡ/lỗi/thất thoát chỉ được ghi giảm số lượng');
    }
    if (['khac', 'kiem_ke'].includes(reason) && !trimNz(p.note)) fail('Hãy ghi rõ lý do điều chỉnh');
    return doAdjust(b, asDate(p.date) || today(), reason, p.note ?? null, p.lines || []);
  });
}

// ---------- IMPORT HÀNG HÓA (1 lần, kèm tồn đầu kỳ) ----------
// Dòng có SKU đã tồn tại: chỉ cập nhật thông tin & giá, KHÔNG đổi tồn kho.
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
      if (!trimNz(row.name)) fail(`Dòng ${i}: thiếu tên hàng hóa`);
      const q = num(row.qty) ?? 0;
      const cst = num(row.cost);
      if (q < 0) fail(`Dòng ${i}: số lượng không được âm`);
      if ((cst ?? 0) < 0 || (num(row.price1) ?? 0) < 0 || (num(row.price2) ?? 0) < 0 || (num(row.price3) ?? 0) < 0) fail(`Dòng ${i}: giá không được âm`);
      let s = trimNz(row.sku); let ex = null;
      if (s) {
        if (seen.has(s.toLowerCase())) fail(`Dòng ${i}: SKU "${s}" bị lặp trong file`);
        seen.add(s.toLowerCase());
        ex = one(`select * from products where book_id = ? and lower(sku) = lower(?)`, b, s);
      }
      if (ex) {
        run(`update products set name = ?, category = coalesce(?, category), pattern = coalesce(?, pattern), size = coalesce(?, size),
            color = coalesce(?, color), unit = coalesce(?, unit), units_per_pack = coalesce(?, units_per_pack), pack_unit = coalesce(?, pack_unit),
            price1 = coalesce(?, price1), price2 = coalesce(?, price2), price3 = coalesce(?, price3), low_stock = coalesce(?, low_stock),
            note = coalesce(?, note), updated_at = ? where id = ?`,
          trimNz(row.name), nz(row.category), nz(row.pattern), nz(row.size), nz(row.color), nz(row.unit), num(row.units_per_pack), trimNz(row.pack_unit),
          num(row.price1), num(row.price2), num(row.price3), num(row.low_stock), nz(row.note), nowIso(), ex.id);
        updated++;
        if (q > 0) { skipped++; warn.push(`Dòng ${i}: SKU ${ex.sku} đã có — bỏ qua số lượng ${q} (tồn chỉ đổi qua phiếu điều chỉnh)`); }
      } else {
        if (!s) s = newMasterCode(b, 'SP', 'products');
        const id = uuid();
        insert('products', { id, book_id: b, sku: s, name: trimNz(row.name), category: nz(row.category), pattern: nz(row.pattern), size: nz(row.size),
          color: nz(row.color), unit: nz(row.unit) || 'Cái', price1: num(row.price1) ?? 0, price2: num(row.price2) ?? 0, price3: num(row.price3) ?? 0,
          low_stock: num(row.low_stock) ?? 0, note: nz(row.note), last_cost: cst ?? 0, units_per_pack: num(row.units_per_pack),
          pack_unit: trimNz(row.pack_unit) || 'hộp', created_at: nowIso(), updated_at: nowIso() });
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
