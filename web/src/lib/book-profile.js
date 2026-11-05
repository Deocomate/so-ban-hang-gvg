// Hồ sơ sổ theo ngành hàng, đọc từ settings của sổ: có đóng gói hộp/thùng không, trường hàng hóa nào sổ không dùng.
// Sổ cũ chưa có khóa nào thì hiện đủ như trước.
export const PACK_FIELDS = ['units_per_pack', 'pack_unit', 'pack_weight'];

export function bookProfile(settings = {}) {
  const packaging = settings.packaging !== false;
  const hidden = new Set([...(settings.hide_fields || []), ...(packaging ? [] : PACK_FIELDS)]);
  // Cột "Định mức" chung chỉ có nghĩa khi sổ còn dùng ít nhất một loại định mức
  if (hidden.has('norm_m2') && hidden.has('norm_m')) hidden.add('norm');
  return { packaging, hidden, has: (field) => !hidden.has(field) };
}

// Sổ không đóng gói: bỏ quy cách hộp/thùng khỏi hàng hóa để màn bán hàng và chứng từ không tính, không in số hộp.
// Trọng lượng/đơn vị vẫn giữ để tính tổng kg khi gửi hàng.
export function packView(p, settings) {
  if (!p || settings?.packaging !== false) return p;
  return { ...p, units_per_pack: null, pack_weight: null };
}
