// Báo giá: chứng từ độc lập, không giữ hàng, không ghi công nợ. Chỉ khi nhân viên bấm "Chuyển sang đơn" mới sao chép sang một đơn mới.
import { ctx, fail, one, run, insert, uuid, nowIso, num, nz, trimNz, rnd, asDate, today } from '../lib/context.js';
import { requirePerm, nextCode } from './access.js';

const VAT_MODES = ['them', 'da_gom', 'khong'];

// Làm sạch nội dung báo giá và tính lại tiền ở máy chủ: tổng tiền luôn khớp với các dòng hàng
export function normalizeBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  let goods = 0;
  const groups = (Array.isArray(b.groups) ? b.groups : []).map((g) => ({
    name: g.name ?? '', note: g.note ?? '',
    lines: (Array.isArray(g.lines) ? g.lines : []).map((l, i) => {
      if (!trimNz(l.name)) fail(`Nhóm "${g.name ?? ''}", dòng ${i + 1}: thiếu tên sản phẩm`);
      const qty = num(l.qty) ?? 0; const price = num(l.price) ?? 0;
      if (qty < 0 || price < 0) fail(`Dòng "${l.name}": số lượng và đơn giá không được âm`);
      const line = { product_id: nz(l.product_id), name: trimNz(l.name), spec: l.spec ?? '', image: l.image ?? '', note: l.note ?? '', measure: num(l.measure), measure_unit: l.measure_unit ?? '',
        norm: num(l.norm), deduct: num(l.deduct), qty, unit: l.unit ?? '', price, amount: rnd(qty * price) };
      goods += line.amount;
      return line;
    }),
  }));
  if (!groups.some((g) => g.lines.length)) fail('Báo giá chưa có sản phẩm');
  const vat_mode = VAT_MODES.includes(b.vat_mode) ? b.vat_mode : 'khong';
  const vat_rate = num(b.vat_rate) ?? 0;
  if (vat_rate < 0 || vat_rate > 100) fail('Thuế suất VAT không hợp lệ');
  const sq = num(b.ship?.qty) ?? 0; const sp = num(b.ship?.price) ?? 0;
  if (sq < 0 || sp < 0) fail('Tiền vận chuyển không được âm');
  const ship = { qty: sq, unit: b.ship?.unit ?? 'tấn', price: sp, amount: rnd(sq * sp) };
  const vat = vat_mode === 'them' ? rnd(goods * vat_rate / 100) : 0;
  return { groups, vat_mode, vat_rate, ship, terms: b.terms ?? '', show_norm: !!b.show_norm, goods, vat, total: goods + vat + ship.amount };
}

export function save_quote(p) {
  const b = p.book_id;
  requirePerm(b, 'ban_hang');
  const cust = nz(p.customer_id) ? one(`select * from customers where id = ? and book_id = ?`, p.customer_id, b) : null;
  if (nz(p.customer_id) && !cust) fail('Không tìm thấy khách hàng');
  const name = trimNz(p.customer_name) || cust?.name;
  if (!name) fail('Chưa nhập tên khách hàng');
  const template = p.template === 'mosaic' ? 'mosaic' : 'ngoi';
  const body = normalizeBody(p.body);
  const f = { quote_date: asDate(p.quote_date) || today(), template, customer_id: cust?.id ?? null, customer_name: name, address: p.address ?? null, site: p.site ?? null,
    profile_id: nz(p.profile_id), body, total: body.total, updated_at: nowIso() };
  if (nz(p.id)) {
    const q = one(`select * from quotes where id = ? and book_id = ?`, p.id, b);
    if (!q) fail('Không tìm thấy báo giá');
    if (q.order_id) fail('Báo giá đã chuyển sang đơn — không sửa được. Hãy tạo báo giá mới.');
    const keys = Object.keys(f);
    run(`update quotes set ${keys.map((k) => `${k} = ?`).join(', ')} where id = ?`, ...keys.map((k) => f[k]), q.id);
    return { id: q.id, code: q.code };
  }
  const id = uuid(); const code = nextCode(b, 'BG');
  insert('quotes', { id, book_id: b, code, status: 'nhap', ...f, created_by: ctx.uid, created_at: nowIso() });
  return { id, code };
}

export function set_quote_status(p) {
  const q = one(`select * from quotes where id = ?`, p.id);
  if (!q) fail('Không tìm thấy báo giá');
  requirePerm(q.book_id, 'ban_hang');
  if (!['nhap', 'da_gui', 'chot', 'huy'].includes(p.status)) fail('Trạng thái không hợp lệ');
  if (q.order_id && p.status !== 'chot') fail('Báo giá đã chuyển sang đơn');
  run(`update quotes set status = ?, updated_at = ? where id = ?`, p.status, nowIso(), q.id);
  return { ok: true };
}
