import * as XLSX from 'xlsx';
import { norm, parseNum } from './format.js';

export async function saveFile(filename, blob) {
  // Trong trang xem thử của Claude: dùng hộp thoại lưu tệp của nền tảng.
  if (window.claude && typeof window.claude.use === 'function') {
    try {
      const dl = await window.claude.use('downloads');
      if (dl) { await dl.save({ filename, data: blob }); return true; }
    } catch (e) {
      if (e && e.code === 'declined') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  return true;
}

// sheets: [{ name, columns: [{key,label,type?}], rows: [obj] }]
export function buildWorkbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.columns.map((c) => c.label)];
    for (const r of s.rows) aoa.push(s.columns.map((c) => {
      const v = typeof c.get === 'function' ? c.get(r) : r[c.key];
      if (v === null || v === undefined) return '';
      if (c.type === 'date' && v) { const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
      return v;
    }));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = s.columns.map((c) => ({ wch: c.width || Math.max(10, Math.min(40, c.label.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function exportXlsx(filename, sheets) { return saveFile(filename, buildWorkbook(sheets)); }

export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const out = {};
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
    out[n] = rows;
  }
  return out;
}

const hkey = (h) => norm(h).replace(/\(.*?\)/g, ' ').replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim();

export function parseDateCell(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date && !isNaN(v)) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') { // số sê-ri Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return 'INVALID';
}

// Tìm dòng tiêu đề trong 10 dòng đầu, ánh xạ cột theo quy tắc
function mapSheet(aoa, rules) {
  let best = { idx: -1, map: {}, score: 0 };
  for (let i = 0; i < Math.min(10, aoa.length); i++) {
    const map = {}; let score = 0;
    (aoa[i] || []).forEach((h, col) => {
      const raw = String(h || '').toLowerCase().trim(); const k = hkey(h);
      if (!k) return;
      for (const [field, test] of rules) {
        if (map[field] !== undefined) continue;
        if (test(k, raw)) { map[field] = col; score++; break; }
      }
    });
    if (score > best.score) best = { idx: i, map, score };
  }
  if (best.idx < 0) return { rows: [], map: {} };
  const rows = [];
  for (let i = best.idx + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    if (r.every((c) => c === '' || c === null || c === undefined)) continue;
    const o = { __row: i + 1 };
    for (const [f, col] of Object.entries(best.map)) o[f] = r[col];
    rows.push(o);
  }
  return { rows, map: best.map };
}

const eq = (...xs) => (k) => xs.includes(k);
const starts = (...xs) => (k) => xs.some((x) => k.startsWith(x));

export function productRules(priceNames = []) {
  const pn = priceNames.map(hkey);
  return [
    ['sku', (k) => k === 'sku' || k.startsWith('ma sku') || k === 'ma sp' || k === 'ma hang' || k === 'ma san pham' || k === 'ma hang hoa' || k === 'ma'],
    ['name', starts('ten hang', 'ten san pham', 'ten sp', 'ten')],
    ['category', starts('chung loai', 'nhom hang', 'loai hang', 'danh muc', 'nhom')],
    ['color', (k, raw) => raw.startsWith('màu') || k.startsWith('mau sac') || k.startsWith('mau men') || k === 'color'],
    ['pattern', (k, raw) => raw.startsWith('mẫu') || k === 'mau ma' || k === 'kieu dang' || k === 'kieu'],
    ['units_per_pack', (k) => /^so (vien|cai|tam|chiec|luong) ?(\/|tren|moi|1) ?(hop|thung|kien|bao)/.test(k) || k.startsWith('so luong moi hop') || k === 'quy cach dong goi' || k.startsWith('dong goi')],
    ['pack_unit', (k) => k.startsWith('don vi dong goi') || k === 'dvt dong goi'],
    ['unit_weight', (k) => /^(trong luong|khoi luong|kg)\b.*(\/|tren|moi|1) ?(vien|cai|tam|chiec|sp|san pham|don vi)/.test(k) || /^kg ?\/ ?(vien|cai|tam|chiec)/.test(k)],
    ['pack_weight', (k) => /^(trong luong|khoi luong|kg)/.test(k)],
    ['size', (k) => k.startsWith('kich thuoc') || k.startsWith('kich co') || k === 'co' || k === 'size' || k.startsWith('quy cach')],
    ['unit', (k) => k === 'dvt' || k.startsWith('don vi')],
    ['cost', (k) => k.startsWith('gia von') || k.startsWith('gia nhap') || k === 'don gia von' || k.startsWith('don gia von')],
    ['price1', (k) => k === pn[0] || ['gia ban le', 'gia le', 'gia ban 1', 'gia 1', 'gia ban tham khao', 'gia ban'].includes(k)],
    ['price2', (k) => k === pn[1] || ['gia si', 'gia ban si', 'gia dai ly', 'gia ban 2', 'gia 2'].includes(k)],
    ['price3', (k) => k === pn[2] || ['gia cong trinh', 'gia ctv', 'gia ban 3', 'gia 3', 'gia du an'].includes(k)],
    ['qty', (k) => ['so luong', 'sl', 'ton', 'so luong ton', 'sl ton', 'ton dau ky', 'so luong ton dau', 'ton kho', 'sl ton dau'].includes(k) || k.startsWith('so luong ton')],
    ['low_stock', starts('ton toi thieu', 'canh bao ton', 'nguong')],
    ['note', starts('ghi chu')],
  ];
}

export function partyRules(type) {
  return [
    ['code', (k) => ['ma', 'ma kh', 'ma khach', 'ma khach hang', 'ma ncc', 'ma nha cung cap'].includes(k)],
    ['name', starts('ten')],
    ['phone', (k) => k.startsWith('dien thoai') || k.startsWith('so dien thoai') || k === 'sdt' || k === 'dt'],
    ['address', starts('dia chi')],
    ['contact', starts('nguoi lien he', 'lien he')],
    ['kind', (k) => type === 'kh' && (k === 'loai khach' || k === 'loai kh' || k === 'loai')],
    ['price_tier', starts('muc gia', 'bang gia')],
    ['credit_days', starts('so ngay duoc no', 'so ngay no', 'han no', 'dieu khoan')],
    ['credit_limit', starts('han muc')],
    ['opening_debt', starts('no dau ky', 'cong no dau ky', 'so du dau')],
    ['due_date', starts('han tra', 'han thanh toan')],
    ['note', starts('ghi chu')],
  ];
}

// Đọc file hàng hóa: sheet chính + (nếu có) sheet "Tồn đầu kỳ" kiểu file Google Sheet cũ
export function extractProducts(book, priceNames) {
  const names = Object.keys(book);
  const rules = productRules(priceNames);
  let main = null; let mainName = '';
  for (const n of names) {
    if (/ton dau/.test(norm(n)) || /huong dan/.test(norm(n))) continue;
    const r = mapSheet(book[n], rules);
    if (r.map.name !== undefined && (!main || r.rows.length > main.rows.length)) { main = r; mainName = n; }
  }
  if (!main) return { rows: [], sheet: null, columns: [] };
  const openName = names.find((n) => /ton dau/.test(norm(n)));
  if (openName && main.map.qty === undefined) {
    const op = mapSheet(book[openName], [['sku', (k) => k.startsWith('sku') || k.startsWith('ma')], ['qty', (k) => k.startsWith('so luong') || k === 'sl'], ['cost', (k) => k.includes('gia von') || k.includes('don gia')]]);
    const bySku = Object.fromEntries(op.rows.filter((r) => r.sku).map((r) => [String(r.sku).trim().toLowerCase(), r]));
    for (const r of main.rows) { const o = bySku[String(r.sku || '').trim().toLowerCase()]; if (o) { r.qty = o.qty; if (r.cost === undefined || r.cost === '') r.cost = o.cost; } }
  }
  return { rows: main.rows, sheet: mainName, columns: Object.keys(main.map) };
}

export function extractParties(book, type) {
  for (const n of Object.keys(book)) {
    if (/huong dan/.test(norm(n))) continue;
    const r = mapSheet(book[n], partyRules(type));
    if (r.map.name !== undefined) return { rows: r.rows, sheet: n, columns: Object.keys(r.map) };
  }
  return { rows: [], sheet: null, columns: [] };
}

// Lấy số đầu tiên trong ô kiểu "140 viên/ thùng", "28kg/ thùng", "0,20"
const leadNum = (v) => { if (typeof v === 'number') return v; const m = String(v ?? '').match(/\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : NaN; };
const packWord = (v) => { const m = norm(String(v ?? '')).match(/\/\s*(thung|hop|kien|bao|pallet)\b/); return m ? { thung: 'thùng', hop: 'hộp', kien: 'kiện', bao: 'bao', pallet: 'pallet' }[m[1]] : ''; };
const numField = (v) => (v === '' || v === null || v === undefined ? null : parseNum(v));

// Kiểm tra trước khi nhập; trả về dòng đã chuẩn hóa + lỗi/cảnh báo
export function validateProducts(rows, existing) {
  const exist = new Map(existing.map((p) => [p.sku.toLowerCase(), p]));
  const seen = new Map(); const combos = new Map();
  const out = rows.map((r) => {
    const o = {
      __row: r.__row, sku: String(r.sku ?? '').trim(), name: String(r.name ?? '').trim(), category: String(r.category ?? '').trim(),
      pattern: String(r.pattern ?? '').trim(), size: String(r.size ?? '').trim(), color: String(r.color ?? '').trim(),
      unit: String(r.unit ?? '').trim(), note: String(r.note ?? '').trim(),
      cost: numField(r.cost), price1: numField(r.price1), price2: numField(r.price2), price3: numField(r.price3),
      qty: numField(r.qty), low_stock: numField(r.low_stock), errors: [], warnings: [],
      ...(r.units_per_pack !== undefined && r.units_per_pack !== '' ? { units_per_pack: leadNum(r.units_per_pack) } : {}),
      ...(String(r.pack_unit ?? '').trim() ? { pack_unit: String(r.pack_unit).trim() } : packWord(r.units_per_pack) || packWord(r.pack_weight) ? { pack_unit: packWord(r.units_per_pack) || packWord(r.pack_weight) } : {}),
      ...(r.pack_weight !== undefined && r.pack_weight !== '' ? { pack_weight: leadNum(r.pack_weight) } : {}),
      ...(r.unit_weight !== undefined && r.unit_weight !== '' ? { unit_weight: leadNum(r.unit_weight) } : {}),
    };
    if (!o.name) o.errors.push('Thiếu tên hàng');
    // Cột "Quy cách" ghi kiểu "140 viên/ thùng" → hiểu là số viên mỗi thùng
    if (o.units_per_pack === undefined && packWord(o.size) && !Number.isNaN(leadNum(o.size))) { o.units_per_pack = leadNum(o.size); if (!o.pack_unit) o.pack_unit = packWord(o.size); o.size = ''; }
    if (o.units_per_pack !== undefined && (Number.isNaN(o.units_per_pack) || !(o.units_per_pack > 0))) o.errors.push('Số viên/hộp phải là số lớn hơn 0');
    for (const [k, lb] of [['pack_weight', 'Trọng lượng/thùng'], ['unit_weight', 'Trọng lượng/viên']]) if (o[k] !== undefined && (Number.isNaN(o[k]) || o[k] < 0)) o.errors.push(`${lb} không phải số hợp lệ`);
    for (const f of ['cost', 'price1', 'price2', 'price3', 'qty', 'low_stock']) {
      if (Number.isNaN(o[f])) o.errors.push(`Cột ${f === 'qty' ? 'số lượng' : f === 'cost' ? 'giá vốn' : f === 'low_stock' ? 'tồn tối thiểu' : 'giá bán'} không phải số`);
      else if (o[f] !== null && o[f] < 0) o.errors.push('Số âm không hợp lệ');
    }
    if (o.sku) {
      const k = o.sku.toLowerCase();
      if (seen.has(k)) o.errors.push(`SKU trùng với dòng ${seen.get(k)}`); else seen.set(k, o.__row);
      if (exist.has(k)) { o.existing = true; if (o.qty) o.warnings.push('SKU đã có: chỉ cập nhật thông tin & giá, không đổi tồn'); }
    }
    if (!o.existing) {
      if (o.qty > 0 && o.cost === null) o.warnings.push('Có số lượng nhưng thiếu giá vốn (sẽ ghi 0)');
      if (o.price1 === null) o.warnings.push('Chưa có giá bán mức 1');
    }
    const ck = [o.name, o.size, o.color, o.pattern, o.unit].map(norm).join('|');
    if (o.name && combos.has(ck)) o.warnings.push(`Giống hệt dòng ${combos.get(ck)} (tên, mẫu, cỡ, màu, ĐVT) — có thể nhập trùng`); else combos.set(ck, o.__row);
    return o;
  });
  return out;
}

export function validateParties(rows, existing, priceNames) {
  const exist = new Map(existing.map((p) => [String(p.code).toLowerCase(), p]));
  const seen = new Map();
  return rows.map((r) => {
    let tier = r.price_tier;
    if (tier !== undefined && tier !== '') {
      const t = norm(tier); const idx = priceNames.findIndex((n) => norm(n) === t);
      tier = idx >= 0 ? idx + 1 : Number(tier);
    } else tier = null;
    const o = {
      __row: r.__row, code: String(r.code ?? '').trim(), name: String(r.name ?? '').trim(), phone: String(r.phone ?? '').trim(),
      address: String(r.address ?? '').trim(), contact: String(r.contact ?? '').trim(), kind: String(r.kind ?? '').trim(),
      price_tier: tier, credit_days: numField(r.credit_days), credit_limit: numField(r.credit_limit),
      opening_debt: numField(r.opening_debt), due_date: parseDateCell(r.due_date), note: String(r.note ?? '').trim(), errors: [], warnings: [],
    };
    if (!o.name) o.errors.push('Thiếu tên');
    if (o.price_tier !== null && ![1, 2, 3].includes(o.price_tier)) o.errors.push('Mức giá phải là 1, 2, 3 hoặc đúng tên mức giá');
    if (o.due_date === 'INVALID') o.errors.push('Hạn trả không đúng dạng dd/mm/yyyy');
    for (const f of ['credit_days', 'credit_limit', 'opening_debt']) if (Number.isNaN(o[f])) o.errors.push('Có ô số không hợp lệ');
    if (o.code) {
      const k = o.code.toLowerCase();
      if (seen.has(k)) o.errors.push(`Mã trùng với dòng ${seen.get(k)}`); else seen.set(k, o.__row);
      if (exist.has(k)) { o.existing = true; if (o.opening_debt) o.warnings.push('Mã đã có: bỏ qua nợ đầu kỳ'); }
    }
    return o;
  });
}

export function productTemplate(priceNames) {
  const cols = ['Mã SKU (để trống = tự cấp)', 'Tên hàng hóa *', 'Chủng loại', 'Mẫu', 'Kích thước', 'Màu sắc / men', 'ĐVT', 'Giá vốn',
    priceNames[0], priceNames[1], priceNames[2], 'Số lượng tồn', 'Tồn tối thiểu', 'Số viên/hộp', 'Đơn vị đóng gói', 'Trọng lượng/thùng (kg)', 'Trọng lượng/viên (kg)', 'Ghi chú'];
  const ex = [
    ['NAD-L-DO', 'Ngói âm dương cỡ L', 'Ngói', 'Âm dương', 'L', 'Đỏ gốm', 'Viên', 10000, 18000, 16000, 15000, 5000, 1000, 140, 'thùng', 28, 0.2, ''],
    ['', 'Bình hút lộc men lam 30cm', 'Bình hút lộc', 'Hũ tròn', '30cm', 'Men lam', 'Cái', 320000, 650000, 590000, 550000, 12, 3, '', '', 4.5, '', 'Ví dụ SKU để trống'],
    ['NGHE-40-VHG', 'Nghê phong thủy 40cm', 'Linh vật - phong thủy', 'Nghê', '40cm', 'Vàng hoàng gia', 'Đôi', 2000000, 3500000, 3000000, 2800000, 4, 2, '', '', '', '', ''],
  ];
  const guide = [
    ['HƯỚNG DẪN NHẬP HÀNG HÓA'],
    ['• Mỗi dòng là 1 biến thể (mẫu + kích thước + màu + ĐVT) và có 1 mã SKU riêng. Để trống SKU thì hệ thống tự cấp SP00001, SP00002…'],
    ['• Bắt buộc: Tên hàng hóa. Nên có: Giá vốn, 3 mức giá bán, Số lượng tồn.'],
    ['• "Số lượng tồn" + "Giá vốn" được ghi thành phiếu TỒN ĐẦU KỲ (1 lần). Đây không phải giao dịch mua/bán nên không làm tăng doanh thu hay công nợ.'],
    ['• Nếu SKU đã có trong phần mềm: chỉ cập nhật tên, loại, giá… KHÔNG đổi tồn kho (tồn chỉ đổi qua phiếu nhập/xuất/điều chỉnh).'],
    ['• Số tiền ghi số thường (vd 1500000), không cần ký hiệu đ. Xóa 3 dòng ví dụ trước khi nhập.'],
    ['• "Số viên/hộp" + "Đơn vị đóng gói" (hộp, thùng, kiện…): dùng để in quy cách “4 hộp x 140 viên + 40 viên” trên hóa đơn và biên bản bàn giao. Để trống nếu không đóng hộp.'],
    ['• "Trọng lượng/thùng (kg)" và/hoặc "Trọng lượng/viên (kg)": dùng để tính tổng trọng lượng đơn hàng (báo xe, ship). Chỉ cần điền 1 trong 2 cột; có cả 2 thì ưu tiên kg/viên. Ghi kiểu "28kg/ thùng", "140 viên/ thùng", "0,20" cũng được.'],
    [`• 3 cột giá: ${priceNames.join(' / ')} — tương ứng mức giá gán cho từng khách hàng.`],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([cols, ...ex]);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Hàng hóa');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), 'Hướng dẫn');
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]);
}

export function partyTemplate(type, priceNames) {
  const isKh = type === 'kh';
  const cols = isKh
    ? ['Mã KH (để trống = tự cấp)', 'Tên khách hàng *', 'Điện thoại', 'Địa chỉ', 'Người liên hệ', 'Loại khách', 'Mức giá', 'Số ngày được nợ', 'Hạn mức nợ', 'Nợ đầu kỳ', 'Hạn trả nợ đầu kỳ', 'Ghi chú']
    : ['Mã NCC (để trống = tự cấp)', 'Tên nhà cung cấp / xưởng *', 'Điện thoại', 'Địa chỉ', 'Người liên hệ', 'Số ngày được nợ', 'Nợ đầu kỳ', 'Hạn trả nợ đầu kỳ', 'Ghi chú'];
  const ex = isKh
    ? [['', 'Đại lý Minh Phát', '0912000001', 'Bắc Ninh', 'Anh Phát', 'Đại lý', priceNames[1], 30, 200000000, 15000000, '15/11/2026', '']]
    : [['', 'Xưởng gốm Hưng Thịnh', '0988000001', 'Bát Tràng', 'Anh Thịnh', 30, 20000000, '20/11/2026', '']];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([cols, ...ex]);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(12, c.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, isKh ? 'Khách hàng' : 'Nhà cung cấp');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['• Nợ đầu kỳ: số dương = ' + (isKh ? 'khách còn nợ mình' : 'mình còn nợ NCC') + '; số âm = ' + (isKh ? 'khách đã trả trước' : 'mình đã trả trước') + '.'],
    ['• Ngày ghi dạng dd/mm/yyyy.'],
    isKh ? [`• Mức giá: ghi 1, 2, 3 hoặc đúng tên: ${priceNames.join(' / ')}.`] : [''],
  ]), 'Hướng dẫn');
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]);
}
