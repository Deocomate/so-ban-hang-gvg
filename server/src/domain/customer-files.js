// Kho tài liệu riêng của từng khách hàng (giống một thư mục Google Drive thu nhỏ): thư mục lồng nhau,
// tệp tải lên (hợp đồng, biên bản scan…), link tài liệu ngoài và một link Google Drive riêng của khách.
import { ctx, fail, one, all, run, insert, uuid, nowIso, json, trimNz, inList } from '../lib/context.js';
import { requirePerm } from './access.js';
import { q } from './query.js';

const MAX_FILE = 15 * 1024 * 1024;
const MAX_NAME = 200;
const EDIT = 'ban_hang';

// Khách phải thuộc sổ và người gọi được xem khách này (nhân viên chỉ thấy khách mình phụ trách nếu sổ bật giới hạn)
function customerOf(b, id) {
  const c = q({ book_id: b, view: 'customers', filters: [['id', 'eq', id]], limit: 1 })[0];
  if (!c) fail('Không tìm thấy khách hàng');
  return c;
}
function itemOf(id) {
  const it = one(`select id, book_id, customer_id, parent_id, kind, name, url from customer_files where id = ?`, id);
  if (!it) fail('Không tìm thấy tài liệu');
  return it;
}
const cleanName = (v) => { const n = trimNz(v); if (!n) fail('Thiếu tên'); return n.replace(/[\\/]+/g, '-').slice(0, MAX_NAME); };
export function cleanUrl(v) {
  const u = trimNz(v);
  if (!u) fail('Thiếu đường link');
  let x;
  try { x = new URL(/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`); } catch { fail('Đường link không hợp lệ'); }
  if (!['http:', 'https:'].includes(x.protocol)) fail('Chỉ nhận link bắt đầu bằng http:// hoặc https://');
  return x.href;
}
// Thư mục đích: null = gốc; phải là thư mục của cùng khách
function folderOf(customerId, parentId) {
  if (!parentId) return null;
  const f = one(`select id, customer_id, kind from customer_files where id = ?`, parentId);
  if (!f || f.customer_id !== customerId || f.kind !== 'folder') fail('Thư mục không tồn tại');
  return f.id;
}

// p = {book_id, customer_id} → mọi thư mục / tệp / link (không kèm nội dung tệp) + link Drive riêng
export function customer_files(p) {
  const b = p.book_id;
  requirePerm(b, null);
  const c = customerOf(b, p.customer_id);
  const items = all(`select f.id, f.parent_id, f.kind, f.name, f.url, f.mime, f.size, f.created_at, f.updated_at, coalesce(u.name, u.email) as created_by_name
    from customer_files f left join users u on u.id = f.created_by where f.customer_id = ? order by f.kind <> 'folder', lower(f.name)`, c.id);
  return { items, drive_url: json(c.extra).drive_url || '' };
}

export function create_customer_folder(p) {
  const b = p.book_id;
  requirePerm(b, EDIT);
  const c = customerOf(b, p.customer_id);
  const id = uuid();
  insert('customer_files', { id, book_id: b, customer_id: c.id, parent_id: folderOf(c.id, p.parent_id), kind: 'folder', name: cleanName(p.name), created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

// p = {book_id, customer_id, parent_id, name, mime, base64}
export function upload_customer_file(p) {
  const b = p.book_id;
  requirePerm(b, EDIT);
  const c = customerOf(b, p.customer_id);
  const data = Buffer.from(String(p.base64 ?? ''), 'base64');
  if (!data.length) fail('Tệp trống');
  if (data.length > MAX_FILE) fail(`Tệp "${p.name}" lớn hơn 15 MB — hãy để trên Google Drive rồi gắn link`);
  const id = uuid();
  insert('customer_files', { id, book_id: b, customer_id: c.id, parent_id: folderOf(c.id, p.parent_id), kind: 'file', name: cleanName(p.name),
    mime: trimNz(p.mime), size: data.length, data, created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

// p = {book_id, customer_id, parent_id, name, url}
export function add_customer_link(p) {
  const b = p.book_id;
  requirePerm(b, EDIT);
  const c = customerOf(b, p.customer_id);
  const url = cleanUrl(p.url);
  const id = uuid();
  insert('customer_files', { id, book_id: b, customer_id: c.id, parent_id: folderOf(c.id, p.parent_id), kind: 'link', name: trimNz(p.name) ? cleanName(p.name) : url.slice(0, MAX_NAME),
    url, created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

// Đổi tên (và đổi link nếu là link)
export function update_customer_item(p) {
  const it = itemOf(p.id);
  requirePerm(it.book_id, EDIT);
  customerOf(it.book_id, it.customer_id);
  const url = it.kind === 'link' && p.url !== undefined ? cleanUrl(p.url) : it.url;
  run(`update customer_files set name = ?, url = ?, updated_at = ? where id = ?`, cleanName(p.name ?? it.name), url, nowIso(), it.id);
  return { ok: true };
}

// p = {ids: [...], parent_id}: chuyển nhiều mục vào một thư mục (null = gốc); không được chuyển thư mục vào chính nó / thư mục con của nó
export function move_customer_items(p) {
  const ids = [...new Set(Array.isArray(p.ids) ? p.ids.map(String) : [])];
  if (!ids.length) fail('Chưa chọn mục nào');
  const items = ids.map(itemOf);
  const cid = items[0].customer_id;
  if (items.some((x) => x.customer_id !== cid)) fail('Chỉ chuyển được tài liệu của cùng một khách');
  requirePerm(items[0].book_id, EDIT);
  customerOf(items[0].book_id, cid);
  const target = folderOf(cid, p.parent_id);
  // Tổ tiên của thư mục đích (kể cả chính nó)
  const chain = new Set();
  for (let x = target; x; x = one(`select parent_id from customer_files where id = ?`, x)?.parent_id) chain.add(x);
  for (const it of items) if (it.kind === 'folder' && chain.has(it.id)) fail(`Không chuyển được thư mục "${it.name}" vào chính nó hoặc thư mục con của nó`);
  run(`update customer_files set parent_id = ?, updated_at = ? where id in ${inList(ids)}`, target, nowIso(), ...ids);
  return { moved: ids.length };
}

// Xóa nhiều mục; xóa thư mục thì xóa luôn mọi thứ bên trong
export function delete_customer_items(p) {
  const ids = [...new Set(Array.isArray(p.ids) ? p.ids.map(String) : [])];
  if (!ids.length) fail('Chưa chọn mục nào');
  const items = ids.map(itemOf);
  for (const b of new Set(items.map((x) => x.book_id))) requirePerm(b, EDIT);
  for (const it of items) customerOf(it.book_id, it.customer_id);
  run(`delete from customer_files where id in ${inList(ids)}`, ...ids);
  return { deleted: ids.length };
}

// Tải nội dung một tệp
export function get_customer_file(p) {
  const f = one(`select book_id, customer_id, kind, name, mime, data from customer_files where id = ?`, p.id);
  if (!f || f.kind !== 'file') fail('Không tìm thấy tệp');
  requirePerm(f.book_id, null);
  customerOf(f.book_id, f.customer_id);
  return { name: f.name, mime: f.mime, base64: f.data.toString('base64') };
}

// Link Google Drive riêng của khách (lưu trong thông tin khách hàng); url trống = bỏ link
export function set_customer_drive(p) {
  const b = p.book_id;
  requirePerm(b, EDIT);
  const c = customerOf(b, p.customer_id);
  const url = trimNz(p.url) ? cleanUrl(p.url) : null;
  const extra = json(one(`select extra from customers where id = ?`, c.id)?.extra);
  if (url) extra.drive_url = url; else delete extra.drive_url;
  run(`update customers set extra = ? where id = ?`, JSON.stringify(extra), c.id);
  return { drive_url: url || '' };
}
