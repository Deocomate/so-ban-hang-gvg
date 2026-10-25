import { useQ } from './store.jsx';

export const useProducts = (enabled = true) => useQ('products', [['active', 'eq', 'true']], 'sku', 5000, enabled);
export const useAllProducts = () => useQ('products', [], 'sku', 5000);
export const useCustomers = () => useQ('customers', [], 'name', 5000);
export const useSuppliers = () => useQ('suppliers', [], 'name', 5000);
export const useFunds = (enabled = true) => useQ('funds', [['active', 'eq', 'true']], 'sort', 50, enabled);

export const KIND_LABEL = { ban_san: 'Bán sẵn', dat_hang: 'Đặt hàng riêng', mua_san: 'Mua hàng sẵn', dat_sx: 'Đặt xưởng sản xuất' };
export const tierPrice = (p, tier) => (tier === 2 ? p.price2 : tier === 3 ? p.price3 : p.price1);
export const productLabel = (p) => `${p.sku} · ${p.name}`;
export const productSub = (p) => [p.size, p.color, p.pattern].filter(Boolean).join(' · ');
