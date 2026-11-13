import { useMemo } from 'react';
import { useQ } from './store.jsx';

export const useProducts = (enabled = true) => useQ('products', [['active', 'eq', 'true']], 'sku', 5000, enabled);
export const useAllProducts = () => useQ('products', [], 'sku', 5000);
export const useCustomers = () => useQ('customers', [], 'name', 5000);
export const useSuppliers = () => useQ('suppliers', [], 'name', 5000);
export const useFunds = (enabled = true) => useQ('funds', [['active', 'eq', 'true']], 'sort', 50, enabled);

export const KIND_LABEL = { ban_san: 'Bán sẵn', dat_hang: 'Đặt hàng riêng', mua_san: 'Mua hàng sẵn', dat_sx: 'Đặt xưởng sản xuất' };
export const tierPrice = (p, tier) => p[`price${tier}`] ?? p.price1;
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
  if (u) { const own = u.prices?.[tier - 1]; return own != null ? own : tierPrice(p, tier) * u.conv; }
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
// Bảng giá được dùng cho khách (theo nhóm khách) và người đang đăng nhập
export const booksFor = (books, cust, uid) => (books || []).filter((b) => (!b.cust_groups || b.cust_groups.includes(cust?.kind)) && (!b.user_ids || b.user_ids.includes(uid)));
// Bảng giá tự chọn khi đổi khách: bảng dành riêng cho nhóm của khách (bảng áp dụng cho mọi nhóm thì để người bán tự chọn)
export const autoBookFor = (books, cust) => (cust?.kind ? (books || []).find((b) => b.cust_groups?.includes(cust.kind)) || null : null);
