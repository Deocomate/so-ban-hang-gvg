import { useMemo } from 'react';
import { useQ } from './store.jsx';

export const useProducts = (enabled = true) => useQ('products', [['active', 'eq', 'true']], 'sku', 5000, enabled);
export const useAllProducts = () => useQ('products', [], 'sku', 5000);
export const useCustomers = () => useQ('customers', [], 'name', 5000);
export const useSuppliers = () => useQ('suppliers', [], 'name', 5000);
export const useFunds = (enabled = true) => useQ('funds', [['active', 'eq', 'true']], 'sort', 50, enabled);
// Hình thức gắn liền với quỹ: quỹ tiền mặt (tên có "mặt"/"két") ↔ Tiền mặt, các quỹ còn lại là tài khoản ngân hàng ↔ Chuyển khoản
export const isCashFund = (f) => /mặt|két/i.test(f?.name || '');

export const KIND_LABEL = { ban_san: 'Bán sẵn', dat_hang: 'Đặt hàng riêng', mua_san: 'Mua hàng sẵn', dat_sx: 'Đặt xưởng sản xuất' };
// tier: 1…5 = mức giá bán, 'cost' = giá vốn bình quân (chỉ có khi được xem giá vốn)
export const tierPrice = (p, tier) => (tier === 'cost' ? p.avg_cost ?? 0 : p[`price${tier}`] ?? p.price1);
export const productLabel = (p) => `${p.sku} · ${p.name}`;
export const productSub = (p) => [p.size, p.color, p.pattern].filter(Boolean).join(' · ');

// ---------- Loại hàng, đơn vị quy đổi, bảng giá ----------
export const PRODUCT_TYPES = [
  { value: 'hang', label: 'Hàng hóa' }, { value: 'dich_vu', label: 'Dịch vụ' },
  { value: 'combo', label: 'Combo - đóng gói' }, { value: 'san_xuat', label: 'Hàng sản xuất' },
];
export const typeLabel = (t) => PRODUCT_TYPES.find((x) => x.value === t)?.label || 'Hàng hóa';
// Các đơn vị bán được của một hàng: đơn vị cơ bản (quy đổi 1) và các đơn vị quy đổi
export const unitsOf = (p) => [{ name: p?.unit || 'Cái', conv: 1, prices: [], sell_direct: true }, ...((p?.units) || [])];
export const findUnit = (p, name) => unitsOf(p).find((u) => name && String(u.name).toLowerCase() === String(name).toLowerCase()) || unitsOf(p)[0];
// Giá 1 đơn vị đã chọn: bảng giá có tên (giá bảng × quy đổi) → giá riêng của đơn vị theo mức giá → giá mức giá × quy đổi
export function priceOf(p, { tier = 1, book = null, unit = null } = {}) {
  const u = unit && unit.conv !== 1 ? unit : null;
  const bp = book?.items?.[p.id];
  if (bp != null) return bp * (u ? u.conv : 1);
  if (u) { const own = tier === 'cost' ? null : u.prices?.[tier - 1]; return own != null ? own : tierPrice(p, tier) * u.conv; }
  return tierPrice(p, tier);
}
// Bảng giá đang hiệu lực kèm giá từng hàng: [{...book, items: {product_id: price}}]
export function usePriceBooks(enabled = true) {
  const books = useQ('price_books', [['in_effect', 'eq', 'true']], 'name', 200, enabled);
  const items = useQ('price_book_items', [], 'price_book_id', 10000, enabled && !!books.data?.length);
  // Giữ nguyên đối tượng giữa các lần vẽ: màn bán hàng theo dõi bảng giá trong useEffect, tạo mới mỗi lần sẽ vẽ lại vô hạn
  const data = useMemo(() => (books.data ? books.data.map((b) => ({ ...b, items: Object.fromEntries((items.data || []).filter((i) => i.price_book_id === b.id).map((i) => [i.product_id, i.price])) })) : null), [books.data, items.data]);
  return { data, loading: books.loading || items.loading };
}
// Ô chọn bảng giá trên đơn / báo giá: từng mức giá bán (+ giá vốn nếu được xem) rồi các bảng giá có tên.
// Giá trị: 'lv:1'…'lv:5', 'lv:cost' hoặc id bảng giá có tên.
export function priceSourceOptions(priceNames, books, canCost, custTier) {
  return [...(canCost ? [{ value: 'lv:cost', label: 'Giá vốn' }] : []),
    ...priceNames.map((n, i) => ({ value: `lv:${i + 1}`, label: n + (i + 1 === custTier ? ' (mức của khách)' : '') })),
    ...(books || []).map((b) => ({ value: b.id, label: 'Bảng giá: ' + b.name }))];
}
// Đọc lại giá trị ô chọn: { price_book_id, price_level } (price_level '' = theo mức giá của khách)
export const parsePriceSource = (v, custTier) => (String(v).startsWith('lv:')
  ? { price_book_id: '', price_level: v.slice(3) === String(custTier) ? '' : v.slice(3) } : { price_book_id: v || '', price_level: '' });
export const priceSourceValue = (f, custTier) => f.price_book_id || `lv:${f.price_level || custTier}`;
export const levelTier = (level, custTier) => (level === 'cost' ? 'cost' : Number(level) || custTier);
// Giá một hàng ở từng mức giá / bảng giá trong ô chọn bảng giá, để chọn giá riêng cho một dòng. Mức giá chưa đặt giá (0) và bảng giá có tên không có hàng này thì bỏ qua.
export function priceChoices(p, { priceNames, books, canCost, custTier, unit = null }) {
  if (!p?.id) return [];
  return priceSourceOptions(priceNames, books, canCost, custTier).flatMap((o) => {
    const s = parsePriceSource(o.value, custTier);
    const book = s.price_book_id ? (books || []).find((b) => b.id === s.price_book_id) : null;
    if (book && book.items?.[p.id] == null) return [];
    const price = priceOf(p, { tier: levelTier(s.price_level, custTier), book, unit });
    return price > 0 ? [{ value: o.value, label: o.label, price }] : [];
  });
}
// Bảng giá được dùng cho khách (theo nhóm khách) và người đang đăng nhập
// Danh sách nhóm khách của sổ (kể cả nhóm cũ còn khách đang dùng mà chưa có trong danh sách)
export const groupNames = (settings, customers) => [...new Set([...(settings?.customer_groups || []), ...(customers || []).map((c) => c.kind).filter(Boolean)])];
export const booksFor = (books, cust, uid) => (books || []).filter((b) => (!b.cust_groups || b.cust_groups.includes(cust?.kind)) && (!b.user_ids || b.user_ids.includes(uid)));
// Bảng giá tự chọn khi đổi khách: bảng dành riêng cho nhóm của khách (bảng áp dụng cho mọi nhóm thì để người bán tự chọn)
export const autoBookFor = (books, cust) => (cust?.kind ? (books || []).find((b) => b.cust_groups?.includes(cust.kind)) || null : null);
