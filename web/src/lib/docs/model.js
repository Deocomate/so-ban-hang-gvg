// Chứng từ xuất cho khách: hóa đơn bán hàng, đơn đặt hàng, biên bản bàn giao, phiếu xuất kho, phiếu thu/chi.
// Mỗi chứng từ được dựng thành một danh sách "khối" (blocks) trung gian; cùng một danh sách đó
// được vẽ ra bản xem trước HTML (DocPreview) và tệp PDF (pdf.js), nên hai bản luôn khớp nhau.

export const DOC_TYPES = {
  hoa_don: { label: 'Hóa đơn bán hàng', from: ['order'], font: 'Arimo', sep: ',' },
  don_dat_hang: { label: 'Đơn đặt hàng', from: ['order'], font: 'Arimo', sep: ',' },
  bien_ban: { label: 'Biên bản bàn giao', from: ['order', 'delivery'], font: 'Tinos', sep: '.' },
  phieu_xuat_kho: { label: 'Phiếu xuất kho', from: ['order', 'delivery'], font: 'Tinos', sep: '.' },
  phieu_thu: { label: 'Phiếu thu / chi', from: ['payment'], font: 'Tinos', sep: '.' },
};

export const DEFAULT_TEXTS = {
  invoice_notes: [
    '**1. Quý khách hàng vui lòng kiểm tra kỹ số lượng, chất lượng hàng hóa khi được nhận bàn giao. Chúng tôi không chịu trách nhiệm với những lỗi phát sinh sau khi khách hàng đã nghiệm thu.**',
    '**2. Chi phí vận chuyển khi giao hàng (nếu có) không bao gồm chi phí bốc dỡ hàng hóa xuống xe.**',
    '**3. Chính sách đổi trả hàng hóa:**',
    '**  * 3.1. Yêu cầu đối với hàng hóa đổi trả:**',
    '    - Sản phẩm phải được giữ nguyên trạng ban đầu, không sứt mẻ, dính bẩn hoặc vỡ vữa. Cửa hàng không chấp nhận hàng đã qua sử dụng.',
    '**  * 3.2. Quy định về số lượng:**',
    '    - Số lượng hàng trả lại không được vượt quá 10% tổng số lượng đã mua.',
    '**  * 3.3. Thời hạn đổi trả:**',
    '    - Hàng hóa có thể được đổi hoặc trả **trong vòng 10 ngày** kể từ ngày mua hàng.',
    '    - **Sau 10 ngày, hàng trả lại sẽ bị trừ 10% giá trị đơn hàng.**',
    '    - **Từ 30 ngày trở lên, mức khấu trừ tăng lên 20% giá trị đơn hàng.**',
    '    - **Quá 40 ngày, chúng tôi không chấp nhận bất kỳ yêu cầu đổi trả nào.**',
    '**  * 3.4. Quy định đổi trả đối với thùng hàng:**',
    '    - Hàng đổi trả không còn nguyên thùng, hoặc nguyên thùng nhưng thùng bị hư hỏng, sẽ bị trừ 10% giá trị đơn hàng. Chính sách này áp dụng do quy trình đóng gói thủ công, có thể phát sinh chi phí về nhân công, bao bì.',
    '**  * 3.5. Đơn hàng trả lại toàn bộ:** Nếu khách hàng trả lại 100% đơn hàng, giá trị đơn hàng trả lại sẽ bị khấu trừ 10%.',
    '**  * 3.6. Chi phí vận chuyển đến kho và bốc dỡ hàng hóa xuống xe do khách hàng chịu.**',
    'Cửa hàng luôn nỗ lực mang đến dịch vụ tối ưu, mong Quý khách hàng thông cảm và hợp tác để đảm bảo quyền lợi chung!',
  ].join('\n'),
  order_footer: 'Đơn giá trên chưa bao gồm thuế GTGT và chưa bao gồm vận chuyển.',
  handover_closing: 'Bên giao đã bàn giao cho bên nhận đầy đủ số lượng hàng chi tiết như trên, bên nhận đã nhận và đồng ý ký vào biên bản bàn giao này.\nBiên bản được lập thành 02 bản, mỗi bên giữ 01 bản và có giá trị pháp lý như nhau.',
  goods_condition: 'Hàng nguyên kiện, không sứt vỡ',
  form_thu: 'Mẫu số 01 - TT\n(Ban hành kèm theo Thông tư số 88/2021/TT-BTC\nngày 11 tháng 10 năm 2021 của Bộ trưởng Bộ Tài chính)',
  form_chi: 'Mẫu số 02 - TT\n(Ban hành kèm theo Thông tư số 88/2021/TT-BTC\nngày 11 tháng 10 năm 2021 của Bộ trưởng Bộ Tài chính)',
  form_xuat: 'Mẫu số 02 - VT\n(Ban hành kèm theo Thông tư số 88/2021/TT-BTC\nngày 11 tháng 10 năm 2021 của Bộ trưởng Bộ Tài chính)',
};

// ---------- Cài đặt mẫu chứng từ (settings.docs) ----------
export function profileFromBook(book, settings) {
  const b = settings?.bank;
  return {
    id: 'main', name: String(book?.name || 'CỬA HÀNG').toUpperCase(), legal_name: book?.name || '', address: settings?.shop_address || '',
    phone: settings?.shop_phone || '', email: '', website: '', representative: '', rep_title: 'Người đại diện hộ kinh doanh',
    bank_line: b?.account_no ? `${b.account_no} - ${b.bank_name || 'Ngân hàng'}` : '', logo: '',
  };
}
export function docSettings(book, settings) {
  const d = settings?.docs || {};
  const profiles = Array.isArray(d.profiles) && d.profiles.length ? d.profiles : [profileFromBook(book, settings)];
  const types = {};
  for (const [k, t] of Object.entries(DOC_TYPES)) {
    const u = (d.types || {})[k] || {};
    types[k] = { profile: profiles.some((p) => p.id === u.profile) ? u.profile : profiles[0].id, sep: u.sep || t.sep, show_price: u.show_price !== false,
      show_form: u.show_form !== false, text: u.text ?? null };
  }
  // Một phông chữ cho mọi chứng từ (mặc định Arial / Arimo như mẫu hóa đơn của cửa hàng)
  return { profiles, types, font: d.font === 'Tinos' ? 'Tinos' : 'Arimo' };
}
export function profileFor(ds, type) { return ds.profiles.find((p) => p.id === ds.types[type].profile) || ds.profiles[0]; }

// ---------- Định dạng ----------
export function fmtNum(v, sep = ',') {
  const n = Number(v) || 0; const neg = n < 0; const a = Math.abs(n);
  const int = Math.floor(a + 1e-9); let frac = Math.round((a - int) * 100);
  const s = String(int).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const dec = sep === ',' ? '.' : ',';
  return (neg ? '-' : '') + s + (frac ? dec + String(frac).padStart(2, '0').replace(/0$/, '') : '');
}
export function phoneFmt(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7)}` : String(p || '');
}
export function dateLine(iso, cap = true) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!y) return `${cap ? 'Ngày' : 'ngày'} ..... tháng ..... năm .........`;
  return `${cap ? 'Ngày' : 'ngày'} ${d} tháng ${m} năm ${y}`;
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function read3(n, full) {
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10; const w = [];
  if (full || h) w.push(DIGITS[h], 'trăm');
  if (t > 1) { w.push(DIGITS[t], 'mươi'); if (u === 1) w.push('mốt'); else if (u === 5) w.push('lăm'); else if (u === 4) w.push('tư'); else if (u) w.push(DIGITS[u]); }
  else if (t === 1) { w.push('mười'); if (u === 5) w.push('lăm'); else if (u) w.push(DIGITS[u]); }
  else if (u) { if (full || h) w.push('linh'); w.push(DIGITS[u]); }
  return w.join(' ');
}
// "Mười ba triệu tám trăm nghìn đồng chẵn"
export function moneyWords(v, chan = true) {
  let n = Math.round(Math.abs(Number(v) || 0)); const neg = Number(v) < 0;
  if (!n) return 'Không đồng';
  const even = n % 1000 === 0;
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']; const parts = [];
  const groups = []; while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  for (let i = groups.length - 1; i >= 0; i--) { const g = groups[i]; if (!g) continue; parts.push(read3(g, i < groups.length - 1) + (units[i] ? ' ' + units[i] : '')); }
  const s = (neg ? 'âm ' : '') + parts.join(' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng' + (chan && even ? ' chẵn' : '');
}

// Quy cách đóng gói: 600 viên, 140 viên/hộp → "4 hộp x 140 viên + 40 viên"; boxes = số hộp (hộp lẻ tính 1)
export function packing(qty, perPack, packUnit = 'hộp', unit = '') {
  const q = Number(qty) || 0; const per = Number(perPack) || 0; const u = String(unit || '').toLowerCase(); const pu = packUnit || 'hộp';
  if (!per || q <= 0) return { text: '', boxes: 0, full: 0, rest: 0 };
  const full = Math.floor(q / per + 1e-9); const rest = Math.round((q - full * per) * 100) / 100;
  let text = '';
  if (full > 0) text = `${full} ${pu} x ${fmtNum(per, '.')} ${u}`.trim();
  if (rest > 0) text += (text ? ' + ' : '') + `${fmtNum(rest, '.')} ${u}`.trim();
  return { text, boxes: full + (rest > 0 ? 1 : 0), full, rest };
}

// Trọng lượng: ưu tiên kg / đơn vị (viên…); nếu chỉ có kg / thùng thì chia theo số viên mỗi thùng
export function weightPerUnit(p) {
  if (!p) return 0;
  const u = Number(p.unit_weight) || 0; if (u > 0) return u;
  const pw = Number(p.pack_weight) || 0; const per = Number(p.units_per_pack) || 0;
  return pw > 0 && per > 0 ? pw / per : 0;
}
export function weightOf(qty, p) { const w = weightPerUnit(p); return w ? Math.round((Number(qty) || 0) * w * 100) / 100 : null; }
export const fmtKg = (v, sep = ',') => `${fmtNum(Math.round((Number(v) || 0) * 10) / 10, sep)} kg`;

// Đánh dấu **đậm** trong văn bản ghi chú → [{text, b}]
export function runsOf(line) {
  const out = []; const re = /\*\*(.+?)\*\*/g; let i = 0; let m;
  while ((m = re.exec(line))) { if (m.index > i) out.push({ text: line.slice(i, m.index) }); out.push({ text: m[1], b: true }); i = m.index + m[0].length; }
  if (i < line.length) out.push({ text: line.slice(i) });
  return out.length ? out : [{ text: ' ' }];
}

// ---------- Nạp dữ liệu ----------
// src: {kind:'order'|'delivery'|'payment', id}
export async function loadDocData(q, rpc, src) {
  if (src.kind === 'payment') {
    const [p] = await q('payments', [['id', 'eq', src.id]]);
    if (!p) throw new Error('Không tìm thấy phiếu');
    let party = null;
    if (p.party_type === 'kh' && p.party_id) [party] = await q('customers', [['id', 'eq', p.party_id]]);
    if (p.party_type === 'ncc' && p.party_id) [party] = await q('suppliers', [['id', 'eq', p.party_id]]);
    const info = await rpc('get_doc_info', { ref_type: 'payment', ref_id: src.id });
    return { kind: 'payment', p, party, info: info || {} };
  }
  let d = null; let dlines = null; let orderId = src.id;
  if (src.kind === 'delivery') {
    [d] = await q('deliveries', [['id', 'eq', src.id]]);
    if (!d) throw new Error('Không tìm thấy phiếu giao');
    orderId = d.order_id;
    dlines = await q('delivery_lines', [['delivery_id', 'eq', src.id]]);
  }
  const [o] = await q('sales_orders', [['id', 'eq', orderId]]);
  if (!o) throw new Error('Không tìm thấy đơn hàng');
  const [lines, dels, custs] = await Promise.all([
    q('sales_order_lines', [['order_id', 'eq', orderId]], 'line_no'),
    q('deliveries', [['order_id', 'eq', orderId]], 'created_at'),
    o.customer_id ? q('customers', [['id', 'eq', o.customer_id]]) : Promise.resolve([]),
  ]);
  const ids = [...new Set([...(lines || []), ...(dlines || [])].map((l) => l.product_id))];
  const prods = ids.length ? await q('products', [['id', 'in', ids]]) : [];
  const orderInfo = (await rpc('get_doc_info', { ref_type: 'order', ref_id: orderId })) || {};
  const delInfo = d ? (await rpc('get_doc_info', { ref_type: 'delivery', ref_id: d.id })) || {} : null;
  return { kind: src.kind, o, lines, dels, d, dlines, cust: custs[0] || null, prods: Object.fromEntries(prods.map((p) => [p.id, p])), orderInfo, delInfo };
}

// Thông tin sửa được của chứng từ được lưu ở đâu (đơn / phiếu giao / phiếu thu)
export function infoRef(type, data) {
  if (data.kind === 'payment') return { ref_type: 'payment', ref_id: data.p.id };
  if ((type === 'bien_ban' || type === 'phieu_xuat_kho') && data.d) return { ref_type: 'delivery', ref_id: data.d.id };
  return { ref_type: 'order', ref_id: data.o.id };
}
export function currentInfo(type, data) {
  if (data.kind === 'payment') return data.info;
  if ((type === 'bien_ban' || type === 'phieu_xuat_kho') && data.d) return { ...pick(data.orderInfo, ['recv_phone', 'recv_address', 'recv_name', 'recv_party']), ...data.delInfo };
  return data.orderInfo;
}
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o && o[k]).map((k) => [k, o[k]]));

// Các ô sửa được cho từng loại chứng từ
export function editableFields(type, data) {
  const dateKey = type === 'phieu_thu' ? 'doc_date' : `date_${type}`;
  const D = { key: dateKey, label: 'Ngày trên chứng từ', kind: 'date' };
  if (type === 'hoa_don') return [D, { key: 'recv_phone', label: 'SĐT nhận hàng' }, { key: 'recv_address', label: 'Địa chỉ nhận hàng', wide: true },
    { key: 'box_total', label: 'Tổng số hộp', kind: 'num' }, { key: 'old_debt', label: 'Nợ cũ', kind: 'money' }];
  if (type === 'don_dat_hang') return [D, { key: 'recv_phone', label: 'SĐT nhận hàng' }, { key: 'recv_address', label: 'Địa chỉ nhận hàng', wide: true }, { key: 'note', label: 'Ghi chú', wide: true }];
  if (type === 'bien_ban') return [D, { key: 'place', label: 'Nơi lập biên bản', wide: true }, { key: 'handover_rep', label: 'Đại diện bên giao' },
    { key: 'driver_name', label: 'Bên vận chuyển / lái xe' }, { key: 'driver_phone', label: 'SĐT lái xe' }, { key: 'recv_party', label: 'Bên nhận hàng', wide: true },
    { key: 'recv_address', label: 'Địa chỉ giao hàng', wide: true }, { key: 'recv_phone', label: 'SĐT nhận hàng' }, { key: 'recv_name', label: 'Người nhận hàng' },
    { key: 'goods_condition', label: 'Tình trạng hàng hóa', wide: true }, { key: 'box_total', label: 'Tổng số hộp', kind: 'num' }];
  if (type === 'phieu_xuat_kho') return [D, { key: 'recv_name', label: 'Người nhận hàng' }, { key: 'recv_address', label: 'Địa chỉ (bộ phận)', wide: true },
    { key: 'place', label: 'Xuất tại kho (ngăn lô)' }, { key: 'attach', label: 'Số chứng từ gốc kèm theo' }];
  return [D, { key: 'payer_name', label: data.p?.direction === 'chi' ? 'Người nhận tiền' : 'Người nộp tiền' }, { key: 'payer_address', label: 'Địa chỉ', wide: true },
    { key: 'reason', label: data.p?.direction === 'chi' ? 'Lý do chi' : 'Lý do nộp', wide: true }, { key: 'attach', label: 'Kèm theo (chứng từ gốc)' }];
}

// Giá trị mặc định khi chưa sửa
export function defaults(type, data, ds) {
  const prof = profileFor(ds, type);
  if (data.kind === 'payment') {
    const p = data.p; const pa = data.party || {};
    const allocs = (p.allocations || []).map((a) => a.doc_code).filter(Boolean);
    return { doc_date: p.pay_date, payer_name: p.party_name || '', payer_address: pa.address || '',
      reason: [p.kind_label, allocs.length ? `cho ${allocs.join(', ')}` : '', p.note || ''].filter(Boolean).join(' – '), attach: '' };
  }
  const o = data.o; const c = data.cust || {};
  const useDel = (type === 'bien_ban' || type === 'phieu_xuat_kho') && data.d;
  const g = goodsLines(type, data);
  const oldDebt = c.balance !== undefined && c.balance !== null ? Number(c.balance) - (Number(o.delivered_value || 0) - Number(o.paid_net || 0)) : 0;
  const docDate = type === 'don_dat_hang' ? o.order_date : useDel ? data.d.delivery_date : (o.last_delivery_date || o.order_date);
  return {
    [`date_${type}`]: docDate, recv_phone: o.customer_phone || '', recv_address: o.customer_address || '', recv_name: o.customer_name || '', recv_party: o.customer_name || '',
    box_total: String(g.reduce((s, l) => s + l.boxes, 0) || ''), old_debt: String(Math.round(oldDebt)), note: o.note || '',
    place: type === 'phieu_xuat_kho' ? 'Kho hàng' : `kho hàng thuộc ${prof.legal_name || prof.name}`, handover_rep: prof.representative || '',
    driver_name: '', driver_phone: '', goods_condition: DEFAULT_TEXTS.goods_condition, attach: '',
  };
}

// Dòng hàng của chứng từ
export function goodsLines(type, data) {
  const useDel = (type === 'bien_ban' || type === 'phieu_xuat_kho') && data.d;
  const noteOf = Object.fromEntries((data.lines || []).map((l) => [l.id, l.note || '']));
  const src = useDel ? data.dlines.map((l) => ({ product_id: l.product_id, sku: l.sku, name: l.product_name, unit: l.unit, qty: Number(l.qty), price: Number(l.unit_price_net), total: Number(l.revenue), note: noteOf[l.order_line_id] || '' }))
    : data.lines.filter((l) => Number(l.eff_qty) > 0).map((l) => ({ product_id: l.product_id, sku: l.sku, name: l.product_name, unit: l.unit, qty: Number(l.eff_qty),
      price: Number(l.unit_price) * (1 - Number(l.discount_pct || 0) / 100), total: Number(l.line_total), note: l.note || '' }));
  return src.map((l) => { const p = data.prods[l.product_id] || {}; const pk = packing(l.qty, p.units_per_pack, p.pack_unit, l.unit); return { ...l, pack: pk.text, boxes: pk.boxes, packUnit: p.units_per_pack ? (p.pack_unit || 'hộp') : null, kg: weightOf(l.qty, p), sub: [pk.text, l.note].filter(Boolean).join('\n') }; });
}
// "hộp" / "thùng" theo quy cách các dòng hàng; trộn nhiều loại thì gọi chung "kiện"
export function packLabel(g) { const u = [...new Set(g.map((l) => l.packUnit).filter(Boolean))]; return u.length === 1 ? u[0] : u.length ? 'kiện' : 'hộp'; }
export function totalKg(g) { const w = g.reduce((s, l) => s + (l.kg || 0), 0); return { kg: w, missing: g.filter((l) => l.kg === null).length };
}

// ---------- Dựng khối ----------
const P = (runs, o = {}) => ({ t: 'p', runs: typeof runs === 'string' ? [{ text: runs }] : runs, ...o });
const L = (label, value, o = {}) => P([{ text: label, b: !!o.lb }, { text: value || '', b: !!o.vb }], o);

function headerLines(prof, opt = {}) {
  const lines = [{ text: prof.name, b: true, size: opt.nameSize || 12 }];
  if (prof.address) lines.push({ text: `Địa chỉ: ${prof.address}` });
  if (opt.compactContact) {
    const c = [prof.phone && `ĐT: ${prof.phone}`, prof.email && `Email: ${prof.email}`].filter(Boolean).join(' - ');
    if (c) lines.push({ text: c });
    if (prof.website) lines.push({ text: `Website: ${prof.website}` });
  } else {
    if (prof.phone) lines.push({ text: `Điện thoại: ${prof.phone}` });
    if (prof.email) lines.push({ text: `Email: ${prof.email}` });
    if (prof.website) lines.push({ text: `Website: ${prof.website}` });
  }
  if (prof.bank_line && opt.bank !== false) lines.push({ text: `STK: ${prof.bank_line}` });
  return lines;
}

export function buildDoc(type, data, ds, info) {
  const prof = profileFor(ds, type); const cfg = ds.types[type]; const sep = cfg.sep;
  const N = (v) => fmtNum(v, sep);
  const font = ds.font || 'Arimo';
  const text = (k) => (cfg.text && cfg.text[k] !== undefined && cfg.text[k] !== null ? cfg.text[k] : DEFAULT_TEXTS[k]);
  const blocks = [];

  if (type === 'hoa_don' || type === 'don_dat_hang') {
    const o = data.o; const isInv = type === 'hoa_don';
    const g = goodsLines(type, data);
    blocks.push({ t: 'letterhead', logo: prof.logo, lines: headerLines(prof, { nameSize: 12 }), size: isInv ? 10.5 : 9, gap: isInv ? 2.5 : 2 });
    blocks.push({ t: 'title', text: isInv ? 'HÓA ĐƠN BÁN HÀNG' : 'ĐƠN ĐẶT HÀNG', size: 18, mt: 8 });
    blocks.push(P(dateLine(info[`date_${type}`]), { align: 'center', size: 9.5, mb: 10 }));
    const phone = info.recv_phone || o.customer_phone;
    if (isInv) {
      blocks.push(P([{ text: 'Khách hàng: ', b: true }, { text: `${o.customer_name}${o.customer_phone ? ' - ' + phoneFmt(o.customer_phone) : ''}`, b: true }], { size: 9.5 }));
      blocks.push(P(`Địa chỉ: ${info.recv_address || o.customer_address || ''}`, { size: 9.5 }));
      blocks.push(P(`SĐT: ${phone || ''}`, { size: 9.5, mb: 10 }));
    } else {
      blocks.push(P([{ text: `Bên đặt hàng (Bên A): ${o.customer_name}`, b: true }], { size: 10 }));
      blocks.push(P(`Địa chỉ: ${info.recv_address || o.customer_address || ''}`, { size: 10 }));
      blocks.push(P(`SĐT: ${phone || ''}`, { size: 10 }));
      blocks.push(P([{ text: `Bên nhận đặt hàng (Bên B): ${prof.legal_name || prof.name}`, b: true }], { size: 10 }));
      if (prof.address) blocks.push(P(`Địa chỉ: ${prof.address}`, { size: 10 }));
      if (prof.representative) blocks.push(P(`Người đại diện: ${prof.representative}`, { size: 10 }));
      if (prof.phone) blocks.push(P(`SĐT: ${prof.phone}`, { size: 10 }));
      blocks.push(P([{ text: 'I. TÊN HÀNG, SỐ LƯỢNG VÀ ĐƠN GIÁ', b: true }], { size: 10, mt: 6, mb: 4 }));
    }
    const head = isInv ? ['STT', 'Tên hàng', 'Số lượng', 'ĐVT', 'Đơn giá', 'Thành tiền'] : ['STT', 'Tên hàng', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền'];
    const widths = isInv ? [28, '*', 70, 52, 72, 80] : [28, '*', 44, 44, 72, 82];
    const body = g.map((l, i) => {
      const nameCell = { text: l.name, sub: l.sub };
      const q = { text: N(l.qty), align: 'center' }; const u = { text: l.unit, align: 'center' };
      return [{ text: String(i + 1), align: 'center' }, nameCell, ...(isInv ? [q, u] : [u, q]), { text: N(l.price), align: 'right' }, { text: N(l.total), align: 'right' }];
    });
    const goods = g.reduce((s, l) => s + l.total, 0);
    const ship = Math.max(0, Number(o.order_total || 0) - Number(o.goods_total || 0));
    const disc = Math.max(0, goods - Number(o.goods_total || 0));
    const ret = Number(o.returned_value || 0);
    const paid = Number(o.paid_net || 0);
    const sumRow = (label, v, bold) => [{ text: '' }, { text: label, colSpan: 4, align: 'right', b: bold }, {}, {}, {}, { text: N(v), align: 'right', b: bold }];
    const rows = [...body];
    let due;
    if (isInv) {
      rows.push([{ text: `Tổng cộng: ${info.box_total || 0} ${packLabel(g)}`, colSpan: 6, b: true }, {}, {}, {}, {}, {}]);
      const old = Number(info.old_debt || 0);
      const total = goods - disc + old + ship - ret;
      due = total - paid;
      rows.push(sumRow('Tổng tiền hàng:', goods, true));
      if (disc > 0) rows.push(sumRow('Chiết khấu:', -disc));
      rows.push(sumRow('Nợ cũ:', old));
      rows.push(sumRow('Tiền vận chuyển', ship));
      if (ret > 0) rows.push(sumRow('Hàng trả lại', -ret));
      rows.push(sumRow('Tổng thanh toán', total));
      rows.push(sumRow('Đã thanh toán', paid));
      rows.push(sumRow('Còn thanh toán', due, true));
      rows.push([{ runs: [{ text: 'Bằng chữ:  ', b: true, i: true }, { text: moneyWords(due), i: true }], colSpan: 6 }, {}, {}, {}, {}, {}]);
    } else {
      due = goods - disc + ship - ret - paid;
      rows.push(sumRow('Tổng tiền hàng:', goods, true));
      if (disc > 0) rows.push(sumRow('Chiết khấu:', -disc, true));
      rows.push(sumRow('Tiền vận chuyển:', ship, true));
      if (ret > 0) rows.push(sumRow('Hàng trả lại:', -ret, true));
      rows.push(sumRow('Đặt cọc:', paid, true));
      rows.push(sumRow('Còn thanh toán:', due, true));
      rows.push([{ runs: [{ text: `Bằng chữ: ${moneyWords(due)}.`, b: true, i: true }], colSpan: 6 }, {}, {}, {}, {}, {}]);
      rows.push([{ runs: [{ text: `Ghi chú: ${info.note || ''}`, b: true, i: true }], colSpan: 6 }, {}, {}, {}, {}, {}]);
    }
    blocks.push({ t: 'table', widths, head: head.map((h) => ({ text: h, b: true, align: 'center' })), body: rows, size: 9.5 });
    if (isInv) {
      const notes = text('invoice_notes');
      if (notes && notes.trim()) {
        blocks.push(P([{ text: 'GHI CHÚ:', b: true }], { size: 11, mt: 14, mb: 2 }));
        for (const ln of notes.split('\n')) {
          const lead = (ln.match(/^\s*/)[0].length);
          blocks.push(P(runsOf(ln.trim()), { size: 8.2, indent: lead >= 4 ? 10 : lead >= 2 ? 4 : 0, lh: 1.1 }));
        }
      }
      blocks.push({ t: 'sign', cols: [{ title: 'Người mua hàng' }, { title: 'Người bán hàng' }], mt: 10, size: 9.5, space: 30 });
    } else {
      const ft = text('order_footer');
      if (ft) blocks.push(P([{ text: ft, b: true, i: true }], { align: 'center', size: 9.5, mt: 18 }));
    }
    return { font, blocks, filename: `${isInv ? 'hoa-don' : 'don-dat-hang'}_${o.code}.pdf`, title: isInv ? 'Hóa đơn bán hàng' : 'Đơn đặt hàng', code: o.code, due };
  }

  if (type === 'bien_ban') {
    const o = data.o; const g = goodsLines(type, data);
    blocks.push({ t: 'letterhead', logo: prof.logo, lines: headerLines(prof, { nameSize: 10.5, compactContact: true, bank: false }), size: 10, gap: 4, rule: true, centerTitle: true });
    blocks.push({ t: 'title', text: 'BIÊN BẢN BÀN GIAO HÀNG HÓA', size: 14, mt: 20, mb: 12 });
    blocks.push(P([{ text: `Hôm nay, ${dateLine(info.date_bien_ban, false)}`, i: true }, { text: `, tại ${info.place || ''}, chúng tôi gồm có:` }], { size: 11, lh: 1.35, mb: 3 }));
    const party = (label, name) => P([{ text: `${label}: ${String(name || '').toUpperCase()}`, b: true }], { size: 11, mt: 3 });
    blocks.push(party('A. BÊN GIAO HÀNG', prof.legal_name || prof.name));
    if (prof.address) blocks.push(P(`Địa chỉ: ${prof.address}`, { size: 11, mt: 3 }));
    blocks.push(P(`Đại diện giao hàng: ${info.handover_rep || ''}`, { size: 11, mt: 3 }));
    blocks.push(party('B. BÊN VẬN CHUYỂN', [info.driver_name, info.driver_phone && phoneFmt(info.driver_phone)].filter(Boolean).join(' - ') || '..............................................'));
    blocks.push(party('C. BÊN NHẬN HÀNG', info.recv_party || o.customer_name));
    blocks.push(P(`Địa chỉ: ${data.cust?.address || o.customer_address || ''}`, { size: 11, mt: 3 }));
    blocks.push(P('Bên giao bàn giao cho bên nhận lô hàng chi tiết như sau:', { size: 11, mt: 3, mb: 6 }));
    const rows = g.map((l, i) => [{ text: String(i + 1), align: 'center' }, l.note ? { text: l.name, sub: l.note } : { text: l.name }, { text: N(l.qty), align: 'center' }, { text: String(l.unit || '').toLowerCase(), align: 'center' }, { text: l.pack, align: 'center' }]);
    { const tk = totalKg(g); rows.push([{ text: `Tổng cộng: ${info.box_total || 0} ${packLabel(g)}${tk.kg > 0 ? ` · Tổng trọng lượng: ${fmtKg(tk.kg, sep)}${tk.missing ? ' (chưa gồm ' + tk.missing + ' mặt hàng chưa khai)' : ''}` : ''}`, colSpan: 5, align: 'right', b: true }, {}, {}, {}, {}]); }
    blocks.push({ t: 'table', widths: [30, '*', 58, 50, 150], head: ['STT', 'Tên hàng hoá', 'Số lượng', 'ĐVT', 'Quy cách đóng gói'].map((h) => ({ text: h, b: true, align: 'center' })), body: rows, size: 10.5, pad: 4 });
    blocks.push(P([{ text: `Địa chỉ giao hàng: ${info.recv_address || o.customer_address || ''}`, b: true }], { size: 11, mt: 6 }));
    blocks.push(P([{ text: `SĐT nhận hàng: ${[info.recv_phone && phoneFmt(info.recv_phone), info.recv_name].filter(Boolean).join(' - ')}`, b: true }], { size: 11, mt: 4 }));
    blocks.push(P(`Tình trạng hàng hóa: ${info.goods_condition || ''}`, { size: 11, mt: 4 }));
    for (const ln of String(text('handover_closing') || '').split('\n').filter(Boolean)) blocks.push(P(ln, { size: 11, mt: 4, lh: 1.35 }));
    blocks.push({ t: 'sign', cols: [{ title: 'ĐẠI DIỆN BÊN GIAO', name: info.handover_rep }, { title: 'LÁI XE', name: info.driver_name }, { title: 'ĐẠI DIỆN BÊN NHẬN' }], mt: 24, size: 11, upper: true, space: 56 });
    const code = data.d ? data.d.code : o.code;
    return { font, blocks, filename: `bien-ban-ban-giao_${code}.pdf`, title: 'Biên bản bàn giao', code };
  }

  if (type === 'phieu_xuat_kho') {
    const o = data.o; const g = goodsLines(type, data); const showPrice = cfg.show_price;
    blocks.push({ t: 'cols', cols: [{ width: '*', lines: [{ text: `Đơn vị: ${prof.legal_name || prof.name}`, b: true }, prof.address && { text: `Địa chỉ: ${prof.address}` }].filter(Boolean) },
      cfg.show_form ? { width: 220, align: 'center', lines: text('form_xuat').split('\n').map((t, i) => ({ text: t, b: i === 0, i: i > 0, size: i ? 8 : 9.5 })) } : null].filter(Boolean), size: 10 });
    blocks.push({ t: 'title', text: 'PHIẾU XUẤT KHO', size: 16, mt: 16 });
    blocks.push(P([{ text: dateLine(info.date_phieu_xuat_kho), i: true }], { align: 'center', size: 11 }));
    blocks.push(P(`Số: ${data.d ? data.d.code : o.code}`, { align: 'center', size: 11, mb: 10 }));
    blocks.push(P(`- Họ và tên người nhận hàng: ${info.recv_name || o.customer_name || ''}`, { size: 11, mt: 2 }));
    blocks.push(P(`- Địa chỉ (bộ phận): ${info.recv_address || o.customer_address || ''}`, { size: 11, mt: 2 }));
    blocks.push(P(`- Lý do xuất kho: Xuất bán theo đơn hàng ${o.code}${data.d ? `, phiếu giao ${data.d.code}` : ''}`, { size: 11, mt: 2 }));
    blocks.push(P(`- Xuất tại kho (ngăn lô): ${info.place || ''}`, { size: 11, mt: 2, mb: 8 }));
    const head = ['STT', 'Tên, nhãn hiệu, quy cách hàng hóa', 'Mã số', 'ĐVT', 'Số lượng', ...(showPrice ? ['Đơn giá', 'Thành tiền'] : [])];
    const widths = showPrice ? [26, '*', 52, 36, 56, 62, 76] : [30, '*', 70, 50, 70];
    const rows = g.map((l, i) => [{ text: String(i + 1), align: 'center' }, { text: l.name, sub: l.sub }, { text: l.sku || '', align: 'center' }, { text: l.unit, align: 'center' },
      { text: N(l.qty), align: 'right' }, ...(showPrice ? [{ text: N(l.price), align: 'right' }, { text: N(l.total), align: 'right' }] : [])]);
    const tq = g.reduce((s, l) => s + l.qty, 0); const tt = g.reduce((s, l) => s + l.total, 0);
    rows.push([{ text: '' }, { text: 'Cộng', b: true, align: 'center' }, { text: '' }, { text: '' }, { text: N(tq), align: 'right', b: true }, ...(showPrice ? [{ text: '' }, { text: N(tt), align: 'right', b: true }] : [])]);
    blocks.push({ t: 'table', widths, head: head.map((h) => ({ text: h, b: true, align: 'center' })), body: rows, size: 10, pad: 3 });
    if (showPrice) blocks.push(P(`- Tổng số tiền (viết bằng chữ): ${moneyWords(tt)}`, { size: 11, mt: 8 }));
    { const tk = totalKg(g); if (tk.kg > 0) blocks.push(P(`- Tổng trọng lượng: ${fmtKg(tk.kg, sep)}${tk.missing ? ` (chưa gồm ${tk.missing} mặt hàng chưa khai trọng lượng)` : ''}`, { size: 11, mt: showPrice ? 3 : 8 })); }
    blocks.push(P(`- Số chứng từ gốc kèm theo: ${info.attach || ''}`, { size: 11, mt: 3 }));
    blocks.push(P([{ text: dateLine(info.date_phieu_xuat_kho), i: true }], { align: 'right', size: 11, mt: 10 }));
    blocks.push({ t: 'sign', cols: [{ title: 'NGƯỜI LẬP BIỂU', note: '(Ký, họ tên)' }, { title: 'NGƯỜI NHẬN HÀNG', note: '(Ký, họ tên)' }, { title: 'THỦ KHO', note: '(Ký, họ tên)' },
      { title: String(prof.rep_title || 'Người đại diện').toUpperCase(), note: '(Ký, họ tên, đóng dấu)', name: prof.representative }], mt: 6, size: 9.5, upper: true, space: 52 });
    const code = data.d ? data.d.code : o.code;
    return { font, blocks, filename: `phieu-xuat-kho_${code}.pdf`, title: 'Phiếu xuất kho', code };
  }

  // Phiếu thu / chi
  const p = data.p; const thu = p.direction !== 'chi';
  blocks.push({ t: 'cols', cols: [{ width: '*', lines: [{ text: `Đơn vị: ${prof.legal_name || prof.name}`, b: true }, prof.address && { text: `Địa chỉ: ${prof.address}` }].filter(Boolean) },
    cfg.show_form ? { width: 220, align: 'center', lines: text(thu ? 'form_thu' : 'form_chi').split('\n').map((t, i) => ({ text: t, b: i === 0, i: i > 0, size: i ? 8 : 9.5 })) } : null].filter(Boolean), size: 10 });
  blocks.push({ t: 'title', text: thu ? 'PHIẾU THU' : 'PHIẾU CHI', size: 16, mt: 16 });
  blocks.push(P([{ text: dateLine(info.doc_date), i: true }], { align: 'center', size: 11 }));
  blocks.push(P(`Số: ${p.code}`, { align: 'center', size: 11, mb: 12 }));
  const who = thu ? 'người nộp tiền' : 'người nhận tiền';
  blocks.push(P(`Họ và tên ${who}: ${info.payer_name || ''}`, { size: 11, mt: 4 }));
  blocks.push(P(`Địa chỉ: ${info.payer_address || ''}`, { size: 11, mt: 4 }));
  blocks.push(P(`${thu ? 'Lý do nộp' : 'Lý do chi'}: ${info.reason || ''}`, { size: 11, mt: 4 }));
  blocks.push(P([{ text: 'Số tiền: ' }, { text: `${fmtNum(p.amount, sep)} đồng`, b: true }, { text: `  (Viết bằng chữ): ${moneyWords(p.amount)}` }], { size: 11, mt: 4 }));
  blocks.push(P(`Kèm theo: ${info.attach || '......'} chứng từ gốc.`, { size: 11, mt: 4 }));
  if (p.voided) blocks.push(P([{ text: 'PHIẾU ĐÃ HỦY', b: true }], { size: 12, mt: 6, color: '#b3261e' }));
  blocks.push(P([{ text: dateLine(info.doc_date), i: true }], { align: 'right', size: 11, mt: 10 }));
  blocks.push({ t: 'sign', cols: [{ title: String(prof.rep_title || 'Người đại diện').toUpperCase(), note: '(Ký, họ tên, đóng dấu)', name: prof.representative }, { title: 'NGƯỜI LẬP BIỂU', note: '(Ký, họ tên)' },
    { title: thu ? 'NGƯỜI NỘP TIỀN' : 'NGƯỜI NHẬN TIỀN', note: '(Ký, họ tên)', name: info.payer_name }, { title: 'THỦ QUỸ', note: '(Ký, họ tên)' }], mt: 6, size: 9.5, upper: true, space: 52 });
  blocks.push(P(`Đã nhận đủ số tiền (viết bằng chữ): ${moneyWords(p.amount)}`, { size: 11, mt: 10 }));
  return { font, blocks, filename: `${thu ? 'phieu-thu' : 'phieu-chi'}_${p.code}.pdf`, title: thu ? 'Phiếu thu' : 'Phiếu chi', code: p.code };
}
