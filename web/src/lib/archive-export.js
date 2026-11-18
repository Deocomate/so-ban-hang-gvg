// Tải một bản dữ liệu đã ngắt về máy: tệp zip chứa một thư mục gồm trang xem trực quan (index.html)
// và dữ liệu gốc dạng JSON (mỗi bảng một tệp), tên ghi rõ sổ, mã lần ngắt, khoảng ngày và ngày tải.
import viewer from './archive-viewer.html?raw';
import { makeZip } from './zip.js';
import { saveFile } from './excel.js';

const ddmmyyyy = (d) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : 'dau-so');
const ascii = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function archiveName(a, now = new Date()) {
  const today = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  return [ascii(a.book?.short_name || a.book?.name) || 'so', a.code, 'du-lieu-ngat', `tu-${ddmmyyyy(a.from_date)}`, `den-${ddmmyyyy(a.cutoff)}`, `tai-${today}`].filter(Boolean).join('_');
}

export async function downloadArchive(a) {
  const folder = archiveName(a);
  const { tables, refs, ...meta } = a;
  const files = [
    { name: `${folder}/index.html`, data: viewer },
    { name: `${folder}/DOC-TRUOC.txt`, data: [
      `Dữ liệu đã ngắt khỏi sổ ${a.book?.name || ''} (${a.code})`,
      `Từ ngày ${ddmmyyyy(a.from_date).replace(/-/g, '/')} đến hết ngày ${ddmmyyyy(a.cutoff).replace(/-/g, '/')}.`,
      '',
      'Mở tệp index.html bằng trình duyệt (Chrome, Edge…) để xem báo cáo trực quan.',
      'Thư mục du-lieu chứa dữ liệu gốc dạng JSON: mỗi bảng một tệp, thong-tin.json là thông tin lần ngắt, danh-muc.json là khách hàng / NCC / hàng hóa / quỹ để tra tên.',
      'Giữ nguyên cấu trúc thư mục khi mở index.html.',
    ].join('\r\n') },
    { name: `${folder}/du-lieu/du-lieu.js`, data: `window.ARCHIVE = ${JSON.stringify(a)};\n` },
    { name: `${folder}/du-lieu/thong-tin.json`, data: JSON.stringify(meta, null, 2) },
    { name: `${folder}/du-lieu/danh-muc.json`, data: JSON.stringify(refs, null, 2) },
    ...Object.entries(tables).map(([t, rows]) => ({ name: `${folder}/du-lieu/${t}.json`, data: JSON.stringify(rows, null, 2) })),
  ];
  return saveFile(`${folder}.zip`, await makeZip(files));
}
