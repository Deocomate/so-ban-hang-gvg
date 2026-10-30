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

// Excel lưu CSV theo bảng mã Windows nếu không chọn UTF-8
const decodeCsv = (buf) => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1258').decode(buf); }
};

// Trả về [{ name, rows, hiddenCols, rowBase, colBase }]: rows là mảng 2 chiều, hiddenCols theo chỉ số trong rows
export async function loadSheets(file) {
  const buf = await file.arrayBuffer();
  // CSV giữ nguyên dạng chữ: tránh tự đổi 11/12/2026 thành ngày kiểu Mỹ và mất số 0 đầu số điện thoại
  const wb = /\.csv$/i.test(file.name || '')
    ? XLSX.read(decodeCsv(buf), { type: 'string', raw: true })
    : XLSX.read(buf, { type: 'array', cellDates: true, cellStyles: true });
  const meta = wb.Workbook?.Sheets || [];
  return wb.SheetNames.filter((n, i) => !meta[i]?.Hidden).map((name) => {
    const ws = wb.Sheets[name];
    const s = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s : { r: 0, c: 0 };
    const hiddenCols = (ws['!cols'] || []).map((c, i) => (c?.hidden ? i - s.c : -1)).filter((i) => i >= 0);
    return { name, rows: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }), hiddenCols, rowBase: s.r, colBase: s.c };
  });
}

export async function readWorkbook(file) {
  return Object.fromEntries((await loadSheets(file)).map((s) => [s.name, s.rows]));
}

const hkey = (h) => norm(h).replace(/\(.*?\)/g, ' ').replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim();
const blank = (v) => v === null || v === undefined || String(v).trim() === '';

export function parseDateCell(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date && !isNaN(v)) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') { // số sê-ri Excel
    if (v < 36526) return 'INVALID'; // trước năm 2000: là số thường, không phải ngày
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const ymd = (y, mo, d) => {
    const t = new Date(Date.UTC(+y, +mo - 1, +d));
    return t.getUTCMonth() === +mo - 1 && t.getUTCDate() === +d ? `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` : 'INVALID';
  };
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return ymd(m[3], m[2], m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return ymd(m[1], m[2], m[3]);
  return 'INVALID';
}

function mapHeader(header, rules) {
  const map = {};
  (header || []).forEach((h, col) => {
    const raw = String(h || '').normalize('NFC').toLowerCase().trim(); const k = hkey(h);
    if (!k) return;
    for (const [field, test] of rules) {
      if (map[field] !== undefined) continue;
      if (test(k, raw)) { map[field] = col; break; }
    }
  });
  return map;
}

// Tìm dòng tiêu đề trong 10 dòng đầu; không nhận ra cột nào thì lấy dòng có dữ liệu đầu tiên
export function findHeader(rows, rules) {
  let best = { idx: -1, map: {}, score: 0 };
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const map = mapHeader(rows[i], rules); const score = Object.keys(map).length;
    if (score > best.score) best = { idx: i, map, score };
  }
  if (best.idx >= 0) return best;
  return { idx: Math.max(0, rows.findIndex((r) => (r || []).some((c) => !blank(c)))), map: {}, score: 0 };
}

// Sheet dữ liệu là sheet khớp NHIỀU CỘT nhất, không phải sheet nhiều dòng nhất: file của khách thường kèm
// các sheet đối chiếu, tra cứu cũng có cột "Tên hàng"
export function guessSheet(sheets, rules) {
  const usable = sheets.filter((s) => !/huong dan|ton dau/.test(norm(s.name)));
  let best = null;
  for (const s of usable) {
    const h = findHeader(s.rows, rules);
    if (h.map.name === undefined) continue;
    if (!best || h.score > best.score || (h.score === best.score && s.rows.length > best.rows)) best = { name: s.name, score: h.score, rows: s.rows.length };
  }
  return best?.name ?? usable[0]?.name ?? sheets[0]?.name ?? null;
}

// Danh sách cột của sheet kèm trường phần mềm đoán được. Cột nhận ra thì chọn sẵn, cột lạ để người dùng tự gán.
export function guessColumns(sheet, headerIdx, rules) {
  const header = sheet.rows[headerIdx] || [];
  const body = sheet.rows.slice(headerIdx + 1);
  const width = Math.max(header.length, ...body.map((r) => (r || []).length), 0);
  const fieldOf = Object.fromEntries(Object.entries(mapHeader(header, rules)).map(([f, col]) => [col, f]));
  const out = [];
  for (let index = 0; index < width; index++) {
    const values = body.map((r) => (r || [])[index]).filter((v) => !blank(v));
    if (blank(header[index]) && !values.length) continue;
    out.push({
      index, letter: XLSX.utils.encode_col(index + (sheet.colBase || 0)), header: String(header[index] ?? '').trim(), field: fieldOf[index] || '',
      on: !!fieldOf[index], filled: values.length, samples: [...new Set(values.map(textCell))].slice(0, 3), hidden: (sheet.hiddenCols || []).includes(index),
    });
  }
  return out;
}

// Dòng dữ liệu theo đúng các cột đang chọn. Cột không chọn coi như không có trong file.
export function buildRows(sheet, headerIdx, columns) {
  const on = columns.filter((c) => c.on && c.field);
  const rows = [];
  for (let i = headerIdx + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i] || [];
    if (on.every((c) => blank(r[c.index]))) continue;
    const o = { __row: i + 1 + (sheet.rowBase || 0) };
    for (const c of on) o[c.field] = r[c.index];
    rows.push(o);
  }
  return rows;
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
    ['price2', (k) => k === pn[1] || ['gia si', 'gia ban si', 'gia dai ly', 'gia dai ly i', 'gia dai ly 1', 'gia ban 2', 'gia 2'].includes(k)],
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

// Các trường có thể nhập, theo đúng thứ tự trên file mẫu. type: text, num, pack (số kèm chữ), date, tier
export function importFields(kind, pn = []) {
  if (kind === 'products') {
    return [
      ['sku', 'Mã SKU'], ['name', 'Tên hàng hóa'], ['category', 'Chủng loại'], ['pattern', 'Mẫu'], ['size', 'Kích thước'], ['color', 'Màu sắc / men'], ['unit', 'ĐVT'],
      ['cost', 'Giá vốn', 'num'], ['price1', pn[0] || 'Giá 1', 'num'], ['price2', pn[1] || 'Giá 2', 'num'], ['price3', pn[2] || 'Giá 3', 'num'],
      ['qty', 'Số lượng tồn', 'num'], ['low_stock', 'Tồn tối thiểu', 'num'], ['units_per_pack', 'Số viên/hộp', 'pack'], ['pack_unit', 'Đơn vị đóng gói'],
      ['pack_weight', 'Trọng lượng/thùng (kg)', 'pack'], ['unit_weight', 'Trọng lượng/viên (kg)', 'pack'], ['note', 'Ghi chú'],
    ].map(([key, label, type = 'text']) => ({ key, label, type }));
  }
  const kh = kind === 'kh';
  return [
    ['code', kh ? 'Mã KH' : 'Mã NCC'], ['name', kh ? 'Tên khách hàng' : 'Tên nhà cung cấp'], ['phone', 'Điện thoại'], ['address', 'Địa chỉ'], ['contact', 'Người liên hệ'],
    ...(kh ? [['kind', 'Loại khách'], ['price_tier', 'Mức giá', 'tier']] : []), ['credit_days', 'Số ngày được nợ', 'num'],
    ...(kh ? [['credit_limit', 'Hạn mức nợ', 'num']] : []), ['opening_debt', 'Nợ đầu kỳ', 'num'], ['due_date', 'Hạn trả nợ đầu kỳ', 'date'], ['note', 'Ghi chú'],
  ].map(([key, label, type = 'text']) => ({ key, label, type }));
}

export function importRules(kind, pn = []) {
  const keys = new Set(importFields(kind, pn).map((f) => f.key));
  return (kind === 'products' ? productRules(pn) : partyRules(kind)).filter(([f]) => keys.has(f));
}

// Lấy số đầu tiên trong ô kiểu "140 viên/ thùng", "28kg/ thùng", "0,20"
const leadNum = (v) => { if (typeof v === 'number') return v; const m = String(v ?? '').match(/\d+(?:[.,]\d+)?/); return m ? Number(m[0].replace(',', '.')) : NaN; };
const packWord = (v) => { const m = norm(String(v ?? '')).match(/\/\s*(thung|hop|kien|bao|pallet)\b/); return m ? { thung: 'thùng', hop: 'hộp', kien: 'kiện', bao: 'bao', pallet: 'pallet' }[m[1]] : ''; };
const numField = (v) => (blank(v) ? null : parseNum(v));
const parseTier = (v, pn) => { const t = norm(v); const idx = pn.findIndex((n) => norm(n) === t); return idx >= 0 ? idx + 1 : Number(v); };
const dmyText = (v) => { const [y, m, d] = parseDateCell(v).split('-'); return `${d}/${m}/${y}`; };
function textCell(v) { return v instanceof Date ? dmyText(v) : String(v ?? '').trim(); }
const showValue = (type, v, pn) => (v === null || v === undefined || v === '' ? '(trống)' : type === 'tier' ? pn[v - 1] || v : typeof v === 'number' ? v.toLocaleString('vi-VN') : v);

function isBadCell(type, v, pn) {
  if (blank(v)) return false;
  if (type === 'num') return Number.isNaN(parseNum(v));
  if (type === 'pack') return Number.isNaN(leadNum(v));
  if (type === 'date') return parseDateCell(v) === 'INVALID';
  if (type === 'tier') return ![1, 2, 3].includes(parseTier(v, pn));
  return false;
}

// Ô sai định dạng trong một cột: [{ row, value }]
export function badCells(sheet, headerIdx, col, field, pn = []) {
  const out = [];
  for (let i = headerIdx + 1; i < sheet.rows.length; i++) {
    const v = (sheet.rows[i] || [])[col.index];
    if (isBadCell(field.type, v, pn)) out.push({ row: i + 1 + (sheet.rowBase || 0), value: textCell(v) });
  }
  return out;
}

// Cảnh báo cấp file. tone "bad" chặn không cho đi tiếp.
export function columnIssues(kind, columns, fields, sheet, headerIdx, pn = []) {
  const idKey = kind === 'products' ? 'sku' : 'code';
  const idLabel = kind === 'products' ? 'Mã SKU' : 'Mã';
  const name = (c) => `“${c.header || `cột ${c.letter}`}”`;
  const list = (xs) => xs.map(name).join(', ');
  const on = columns.filter((c) => c.on && c.field);
  const keys = new Set(on.map((c) => c.field));
  const out = [];
  if (!columns.some((c) => c.field)) out.push({ tone: 'bad', text: 'Không nhận ra cột nào. Hãy kiểm tra lại sheet và dòng tiêu đề, hoặc tự chọn “Nhập vào” cho từng cột.' });
  else if (!keys.has('name') && !keys.has(idKey)) out.push({ tone: 'bad', text: `Cần chọn ít nhất cột Tên hoặc cột ${idLabel} để biết mỗi dòng là gì.` });
  else {
    if (!keys.has('name')) out.push({ tone: 'warn', text: `Không có cột Tên: chỉ cập nhật được các mã đã có trong sổ, mã chưa có sẽ báo lỗi.` });
    if (!keys.has(idKey)) out.push({ tone: 'warn', text: `Không có cột ${idLabel}: mọi dòng đều được tạo mới với mã tự cấp, không cập nhật được dữ liệu đã có.` });
  }
  for (const c of on) {
    const field = fields.find((f) => f.key === c.field);
    const bad = badCells(sheet, headerIdx, c, field, pn);
    if (bad.length) out.push({ tone: 'warn', text: `Cột ${name(c)} có ${bad.length} ô sai định dạng ${{ date: '(cần dd/mm/yyyy)', tier: '(cần 1, 2, 3 hoặc đúng tên mức giá)' }[field.type] || '(cần là số)'}, ví dụ dòng ${bad[0].row}: “${bad[0].value}”. Các dòng này sẽ bị bỏ qua, trừ khi sửa file hoặc bỏ chọn cột.` });
  }
  const empty = on.filter((c) => !c.filled);
  if (empty.length) out.push({ tone: 'info', text: `Cột trống ${list(empty)}: nhập bình thường. Hàng mới để trống các ô này, dữ liệu đã có trong sổ được giữ nguyên.` });
  const left = columns.filter((c) => c.filled && !c.field);
  if (left.length) out.push({ tone: 'warn', text: `Có dữ liệu nhưng chưa có chỗ nhập: ${list(left)}. Các cột này sẽ không được nhập, trừ khi chọn “Nhập vào” cho chúng.` });
  const hidden = on.filter((c) => c.hidden && c.filled);
  if (hidden.length) out.push({ tone: 'warn', text: `Cột đang ẩn trong Excel nhưng có dữ liệu: ${list(hidden)}. Bỏ chọn nếu không muốn nhập.` });
  return out;
}

// Trạng thái một dòng sau khi kiểm tra: err, upd, same (không có gì đổi), dup (nghi trùng hàng đã có), new
export const rowState = (x) => (x.errors.length ? 'err' : x.existing ? (x.changes.length ? 'upd' : 'same') : x.dup ? 'dup' : 'new');

function diffFields(o, old, fields, skip, pn) {
  const out = [];
  for (const f of fields) {
    if (skip.includes(f.key)) continue;
    const v = o[f.key];
    if (v === null || v === undefined || v === '') continue;
    const was = old[f.key];
    const same = f.type === 'text' ? String(was ?? '') === String(v) : Number(was ?? NaN) === Number(v);
    if (!same) out.push(`${f.label}: ${showValue(f.type, was, pn)} → ${showValue(f.type, v, pn)}`);
  }
  return out;
}

// Sheet "Tồn đầu kỳ" kiểu file Google Sheet cũ: lấy số lượng + giá vốn theo SKU
export const openingSheet = (sheets) => sheets.find((s) => /ton dau/.test(norm(s.name))) || null;
export function mergeOpening(rows, sheet) {
  const rules = [['sku', (k) => k.startsWith('sku') || k.startsWith('ma')], ['qty', (k) => k.startsWith('so luong') || k === 'sl'], ['cost', (k) => k.includes('gia von') || k.includes('don gia')]];
  const h = findHeader(sheet.rows, rules);
  const op = buildRows(sheet, h.idx, Object.entries(h.map).map(([field, index]) => ({ field, index, on: true })));
  const bySku = Object.fromEntries(op.filter((r) => r.sku).map((r) => [String(r.sku).trim().toLowerCase(), r]));
  return rows.map((r) => {
    const o = bySku[String(r.sku || '').trim().toLowerCase()];
    return o ? { ...r, qty: o.qty, cost: blank(r.cost) ? o.cost : r.cost } : r;
  });
}

const SAMPLE_ROWS = new Set(['nad-l-do|ngoi am duong co l', '|binh hut loc men lam 30cm', 'nghe-40-vhg|nghe phong thuy 40cm', '|dai ly minh phat', '|xuong gom hung thinh']);
const isSample = (code, name) => SAMPLE_ROWS.has(`${code.toLowerCase()}|${norm(name)}`);

// Kiểm tra trước khi nhập; trả về dòng đã chuẩn hóa + lỗi/cảnh báo.
// Ô trống hoặc cột không chọn đều nghĩa là "không có thông tin": hàng mới để trống, hàng đã có giữ nguyên.
export function validateProducts(rows, existing, pn = []) {
  const fields = importFields('products', pn);
  const exist = new Map(existing.map((p) => [p.sku.toLowerCase(), p]));
  const ident = (p) => [p.name, p.size, p.color, p.pattern, p.unit].map(norm).join('|');
  const idents = new Map(existing.map((p) => [ident(p), p]));
  const seen = new Map(); const combos = new Map();
  const out = rows.map((r) => {
    const o = {
      __row: r.__row, sku: textCell(r.sku), name: textCell(r.name), category: textCell(r.category),
      pattern: textCell(r.pattern), size: textCell(r.size), color: textCell(r.color),
      unit: textCell(r.unit), note: textCell(r.note),
      cost: numField(r.cost), price1: numField(r.price1), price2: numField(r.price2), price3: numField(r.price3),
      qty: numField(r.qty), low_stock: numField(r.low_stock), errors: [], warnings: [], changes: [],
      ...(!blank(r.units_per_pack) ? { units_per_pack: leadNum(r.units_per_pack) } : {}),
      ...(!blank(r.pack_unit) ? { pack_unit: textCell(r.pack_unit) } : packWord(r.units_per_pack) || packWord(r.pack_weight) ? { pack_unit: packWord(r.units_per_pack) || packWord(r.pack_weight) } : {}),
      ...(!blank(r.pack_weight) ? { pack_weight: leadNum(r.pack_weight) } : {}),
      ...(!blank(r.unit_weight) ? { unit_weight: leadNum(r.unit_weight) } : {}),
    };
    const old = o.sku ? exist.get(o.sku.toLowerCase()) : null;
    if (!o.name && !old) o.errors.push(o.sku ? `Mã ${o.sku} chưa có trong sổ nên cần có tên hàng` : 'Thiếu tên hàng');
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
    }
    if (old) {
      o.existing = true;
      o.changes = diffFields(o, old, fields, ['sku', 'cost', 'qty'], pn);
      if (o.qty !== null && !Number.isNaN(o.qty) && o.qty !== old.on_hand) o.warnings.push(`SKU đã có: giữ tồn ${showValue('num', old.on_hand)}, bỏ qua số lượng trong file. Tồn chỉ đổi qua phiếu nhập/xuất/điều chỉnh.`);
      if (o.cost !== null && !Number.isNaN(o.cost) && old.avg_cost !== undefined && o.cost !== old.avg_cost) o.warnings.push(`SKU đã có: giữ giá vốn ${showValue('num', old.avg_cost)}, bỏ qua giá vốn trong file. Giá vốn chỉ đổi khi nhận hàng.`);
    } else if (o.name) {
      if (o.qty > 0 && o.cost === null) o.warnings.push('Có số lượng nhưng thiếu giá vốn (sẽ ghi 0)');
      if (o.price1 === null) o.warnings.push(`Chưa có ${pn[0] || 'giá bán mức 1'}`);
      const twin = idents.get(ident(o));
      if (twin) {
        o.warnings.push(`Giống hàng đã có trong sổ: ${twin.sku} (tên, mẫu, cỡ, màu, ĐVT)`);
        if (!o.sku) o.dup = true;
      }
    }
    if (!old && isSample(o.sku, o.name)) o.warnings.push('Giống dòng ví dụ của file mẫu: xóa đi nếu không phải hàng thật');
    const ck = ident(o);
    if (o.name && combos.has(ck)) o.warnings.push(`Giống hệt dòng ${combos.get(ck)} (tên, mẫu, cỡ, màu, ĐVT) — có thể nhập trùng`); else combos.set(ck, o.__row);
    return o;
  });
  return out;
}

export function validateParties(rows, existing, priceNames, kind = 'kh') {
  const fields = importFields(kind, priceNames);
  const exist = new Map(existing.map((p) => [String(p.code).toLowerCase(), p]));
  const ident = (p) => [p.name, String(p.phone || '').replace(/\D/g, '')].map(norm).join('|');
  const idents = new Map(existing.map((p) => [ident(p), p]));
  const seen = new Map();
  return rows.map((r) => {
    const tier = blank(r.price_tier) ? null : parseTier(r.price_tier, priceNames);
    // Excel coi số điện thoại là số nên mất số 0 ở đầu
    const phone = typeof r.phone === 'number' && /^[1-9]\d{8,9}$/.test(String(r.phone)) ? `0${r.phone}` : textCell(r.phone);
    const o = {
      __row: r.__row, code: textCell(r.code), name: textCell(r.name), phone,
      address: textCell(r.address), contact: textCell(r.contact), kind: textCell(r.kind),
      price_tier: tier, credit_days: numField(r.credit_days), credit_limit: numField(r.credit_limit),
      opening_debt: numField(r.opening_debt), due_date: parseDateCell(r.due_date), note: textCell(r.note), errors: [], warnings: [], changes: [],
    };
    const old = o.code ? exist.get(o.code.toLowerCase()) : null;
    if (!o.name && !old) o.errors.push(o.code ? `Mã ${o.code} chưa có trong sổ nên cần có tên` : 'Thiếu tên');
    if (o.price_tier !== null && ![1, 2, 3].includes(o.price_tier)) o.errors.push('Mức giá phải là 1, 2, 3 hoặc đúng tên mức giá');
    if (o.due_date === 'INVALID') o.errors.push('Hạn trả không đúng dạng dd/mm/yyyy');
    for (const f of ['credit_days', 'credit_limit', 'opening_debt']) if (Number.isNaN(o[f])) o.errors.push('Có ô số không hợp lệ');
    if (o.code) {
      const k = o.code.toLowerCase();
      if (seen.has(k)) o.errors.push(`Mã trùng với dòng ${seen.get(k)}`); else seen.set(k, o.__row);
    }
    if (old) {
      o.existing = true;
      o.changes = diffFields(o, old, fields, ['code', 'opening_debt', 'due_date'], priceNames);
      if (o.opening_debt && o.opening_debt !== old.opening) o.warnings.push('Mã đã có: bỏ qua nợ đầu kỳ');
    } else if (o.name) {
      const twin = idents.get(ident(o));
      if (twin) {
        o.warnings.push(`Giống đối tượng đã có trong sổ: ${twin.code} (tên, điện thoại)`);
        if (!o.code) o.dup = true;
      }
    }
    if (!old && isSample(o.code, o.name)) o.warnings.push('Giống dòng ví dụ của file mẫu: xóa đi nếu không phải dữ liệu thật');
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
    ['• Không dùng cột nào thì để trống cả cột, xóa hẳn cột, hoặc bỏ chọn cột đó khi nhập đều được. Hàng đã có trong sổ sẽ giữ nguyên các ô để trống.'],
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
    ['• Không dùng cột nào thì để trống cả cột, xóa hẳn cột, hoặc bỏ chọn cột đó khi nhập đều được. Mã đã có trong sổ sẽ giữ nguyên các ô để trống.'],
    isKh ? [`• Mức giá: ghi 1, 2, 3 hoặc đúng tên: ${priceNames.join(' / ')}.`] : [''],
  ]), 'Hướng dẫn');
  return new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]);
}
