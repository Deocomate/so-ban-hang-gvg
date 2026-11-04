// Nhóm khách hàng: tên nhóm nằm ở customers.kind và danh sách settings.customer_groups; thông tin thêm của nhóm
// (giảm giá, ghi chú, điều kiện tự thêm / tự bỏ khách) nằm ở settings.customer_group_info[tên nhóm].
import { fail, allN, run, num, int, trimNz, rnd, today, addDays } from '../lib/context.js';
import { requirePerm, bookSettings } from './access.js';

// Chỉ số dùng làm điều kiện; tính trong khoảng `days` ngày gần nhất (0 = toàn bộ), trừ công nợ hiện tại và khu vực
export const GROUP_FIELDS = { orders: 'Số lần mua hàng', total: 'Tổng bán', net: 'Tổng bán trừ trả hàng', debt: 'Công nợ hiện tại', area: 'Khu vực' };
const OPS = { gte: (a, b) => a >= b, lte: (a, b) => a <= b, contains: (a, b) => String(a || '').toLowerCase().includes(String(b).toLowerCase()) };

function metrics(b, days) {
  const since = days > 0 ? addDays(today(), -days + 1) : '0000-01-01';
  return allN(`select c.id, c.kind, c.address as area, c.receivable as debt,
      (select count(*) from sales_orders o where o.customer_id = c.id and o.status = 'xac_nhan' and o.order_date >= @since) as orders,
      (select coalesce(sum(o.order_total), 0) from v_sales_orders o where o.customer_id = c.id and o.status = 'xac_nhan' and o.order_date >= @since) as total,
      (select coalesce(sum(x.revenue), 0) from delivery_lines x join deliveries d on d.id = x.delivery_id join sales_orders o on o.id = d.order_id
        where o.customer_id = c.id and d.delivery_date >= @since)
      - (select coalesce(sum(x.revenue), 0) from sales_return_lines x join sales_returns r on r.id = x.return_id join sales_orders o on o.id = r.order_id
        where o.customer_id = c.id and r.return_date >= @since) as net
    from v_customers c where c.book_id = @b and c.active = 1`, { b, since });
}

const matches = (row, conds) => conds.every((c) => OPS[c.op](c.field === 'area' ? row.area : Number(row[c.field]) || 0, c.field === 'area' ? c.value : Number(c.value)));

// Áp điều kiện của một nhóm: khách thỏa điều kiện chưa có nhóm thì thêm vào; khách trong nhóm hết thỏa thì bỏ ra (nếu nhóm bật)
function applyGroup(b, name, info) {
  if (!info?.conds?.length || (!info.auto_add && !info.auto_remove)) return { added: 0, removed: 0 };
  let added = 0; let removed = 0;
  for (const r of metrics(b, int(info.days) ?? 0)) {
    const ok = matches(r, info.conds);
    if (ok && info.auto_add && !trimNz(r.kind)) { run(`update customers set kind = ? where id = ?`, name, r.id); added++; }
    else if (!ok && info.auto_remove && r.kind === name) { run(`update customers set kind = null where id = ?`, r.id); removed++; }
  }
  return { added, removed };
}

export function refreshGroups(b) {
  const s = bookSettings(b); let added = 0; let removed = 0;
  for (const name of s.customer_groups || []) {
    const r = applyGroup(b, name, s.customer_group_info?.[name]);
    added += r.added; removed += r.removed;
  }
  return { added, removed };
}

function cleanInfo(p) {
  const type = p.discount_type === 'pct' ? 'pct' : 'vnd';
  const discount = rnd(num(p.discount) ?? 0, type === 'pct' ? 2 : 0);
  if (discount < 0 || (type === 'pct' && discount > 100)) fail('Giảm giá không hợp lệ');
  const conds = (Array.isArray(p.conds) ? p.conds : []).map((c) => ({ field: c.field, op: c.field === 'area' ? 'contains' : c.op, value: c.field === 'area' ? trimNz(c.value) : num(c.value) }));
  for (const c of conds) {
    if (!GROUP_FIELDS[c.field] || !OPS[c.op]) fail('Điều kiện không hợp lệ');
    if (c.value == null || c.value === '') fail(`Nhập giá trị cho điều kiện "${GROUP_FIELDS[c.field]}"`);
  }
  if (conds.length > 5) fail('Tối đa 5 điều kiện');
  const days = int(p.days) ?? 0;
  if (days < 0 || days > 3650) fail('Khoảng thời gian không hợp lệ');
  return { discount, discount_type: type, note: trimNz(p.note), conds, days, auto_add: !!p.auto_add, auto_remove: !!p.auto_remove };
}

const saveSettings = (b, s) => run(`update books set settings = ? where id = ?`, s, b);

// p = {old_name?, name, discount, discount_type, note, conds, days, auto_add, auto_remove}
export function save_customer_group(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const name = trimNz(p.name); const old = trimNz(p.old_name);
  if (!name) fail('Nhập tên nhóm');
  const s = bookSettings(b);
  const list = [...(s.customer_groups || [])];
  if (list.some((g) => g.toLowerCase() === name.toLowerCase() && g !== old)) fail(`Nhóm "${name}" đã có`);
  const info = { ...(s.customer_group_info || {}) };
  const i = old ? list.indexOf(old) : -1;
  if (i >= 0) list[i] = name; else list.push(name);
  if (old && old !== name) { delete info[old]; run(`update customers set kind = ? where book_id = ? and kind = ?`, name, b, old); }
  info[name] = cleanInfo(p);
  saveSettings(b, { ...s, customer_groups: list, customer_group_info: info });
  return { name, ...applyGroup(b, name, info[name]) };
}

// Xóa nhóm: khách trong nhóm trở thành chưa có nhóm
export function delete_customer_group(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const name = trimNz(p.name);
  const s = bookSettings(b);
  const info = { ...(s.customer_group_info || {}) }; delete info[name];
  saveSettings(b, { ...s, customer_groups: (s.customer_groups || []).filter((g) => g !== name), customer_group_info: info });
  return { removed: run(`update customers set kind = null where book_id = ? and kind = ?`, b, name).changes };
}

// Gán (hoặc bỏ, khi name trống) nhóm cho nhiều khách một lúc
export function set_customer_group(p) {
  const b = p.book_id;
  requirePerm(b, 'danh_muc');
  const name = trimNz(p.name);
  if (name && !(bookSettings(b).customer_groups || []).includes(name)) fail(`Không có nhóm "${name}"`);
  const ids = Array.isArray(p.customer_ids) ? p.customer_ids : [];
  let n = 0;
  for (const id of ids) n += run(`update customers set kind = ? where id = ? and book_id = ?`, name, id, b).changes;
  if (!n) fail('Chưa chọn khách hàng nào');
  return { updated: n };
}

export function refresh_customer_groups(p) {
  requirePerm(p.book_id, 'danh_muc');
  return refreshGroups(p.book_id);
}

