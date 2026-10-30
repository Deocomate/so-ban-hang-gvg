// Đọc trạng thái vận đơn (chữ tiếng Việt / tiếng Anh / mã số của hãng) → mã trạng thái của phần mềm.
export const CODES = ['cho_lay_hang','da_lay_hang','dang_trung_chuyen','dang_giao','giao_thanh_cong','giao_that_bai','dang_hoan','da_hoan','da_huy','su_co'];

export const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

// Thứ tự kiểm tra quan trọng (giống phần đọc file Excel trên giao diện)
const RULES: [string, string[]][] = [
  ['da_hoan', ['da hoan', 'hoan hang thanh cong', 'hoan thanh cong', 'da tra hang ve', 'returned']],
  ['dang_hoan', ['dang hoan', 'cho hoan', 'chuyen hoan', 'hoan hang', 'return']],
  ['giao_that_bai', ['khong thanh cong', 'giao khong thanh cong', 'giao that bai', 'giao hang that bai', 'khong giao duoc', 'failed', 'cho giao lai']],
  ['da_lay_hang', ['da giao cho don vi', 'da giao cho dvvc', 'da lay hang', 'lay hang thanh cong', 'da nhan hang', 'picked']],
  ['giao_thanh_cong', ['giao thanh cong', 'giao hang thanh cong', 'da giao', 'delivered', 'signed']],
  ['dang_giao', ['dang giao', 'out for delivery', 'dang phat']],
  ['cho_lay_hang', ['cho lay hang', 'cho lay', 'chua lay', 'cho shipper', 'da tao don', 'pending']],
  ['su_co', ['that lac', 'hu hong', 'su co', 'lost', 'damaged']],
  ['da_huy', ['huy', 'cancel']],
  ['dang_trung_chuyen', ['trung chuyen', 'van chuyen', 'dang chuyen', 'roi kho', 'den kho', 'nhap kho', 'xuat kho', 'transit', 'buu cuc', 'arrived', 'departed']],
];

// Mã số đã biết của từng hãng (chỉ ghi những mã có nguồn xác nhận)
const NUMERIC: Record<string, Record<string, string>> = {
  BEST: { '666': 'giao_thanh_cong' },   // "666 - Giao hàng thành công" (tài liệu kết nối BEST của Getfly)
};

export function mapStatus(carrier: string, code: unknown, text: unknown): string | null {
  const c = String(code ?? '').trim();
  const known = NUMERIC[carrier]?.[c] || NUMERIC[carrier]?.[String(text ?? '').trim().split(/[\s-]/)[0]];
  if (known) return known;
  for (const v of [text, code]) {
    const t = norm(v);
    if (!t) continue;
    if (CODES.includes(t)) return t;
    for (const [k, keys] of RULES) if (keys.some((x) => t.includes(x))) return k;
  }
  return null;
}

const pick = (o: any, keys: string[]) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };

// Lấy (mã vận đơn, trạng thái, mô tả, thời gian, nơi) từ dữ liệu hãng gửi — dò theo các tên trường thường gặp.
export function extractItems(body: any) {
  const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.items) ? body.items
    : body?.data && typeof body.data === 'object' ? [body.data] : [body];
  return list.map((o: any) => ({
    tracking_no: pick(o, ['billcode', 'billCode', 'bill_code', 'waybillNo', 'waybill_no', 'waybillCode', 'waybill', 'mailNo', 'mail_no', 'trackingNo', 'tracking_no', 'tracking_number', 'trackingNumber']),
    code: pick(o, ['statusCode', 'status_code', 'scanType', 'scan_type', 'status', 'state', 'orderStatus', 'order_status']),
    text: pick(o, ['statusName', 'status_name', 'statusDesc', 'status_desc', 'scanTypeName', 'description', 'desc', 'remark', 'message']),
    at: pick(o, ['time', 'scanTime', 'scan_time', 'updateTime', 'update_time', 'operateTime', 'operate_time', 'statusTime', 'created_at', 'date']),
    location: pick(o, ['siteName', 'site_name', 'site', 'location', 'address', 'city']),
  }));
}

// Thời gian kiểu "2026-10-24 09:30:00" (giờ Việt Nam) hoặc số giây/mili-giây → ISO
export function toIso(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const s = String(v).trim();
  if (/^\d{10,13}$/.test(s)) return toIso(Number(s));
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(s.replace(' ', 'T') + '+07:00').toISOString();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '12').padStart(2, '0')}:${m[5] || '00'}:00+07:00`).toISOString();
  const d = new Date(s); return isNaN(+d) ? null : d.toISOString();
}
