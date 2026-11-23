// Chuyển tệp PDF chứng từ thành ảnh PNG độ phân giải cao để gửi khách xem trên điện thoại.
// Vẽ lại chính tệp PDF (pdf.js) nên ảnh giống hệt PDF. Tệp dựng với pdfBlob(…, { onePage: true }) nên mỗi chứng từ là một trang dài;
// gộp nhiều chứng từ thì các trang nối dọc trên nền trắng.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

let pdfjsP = null;
function loadPdfjs() {
  if (!pdfjsP) pdfjsP = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = workerUrl; return m; });
  return pdfjsP;
}

const GAP = 48; // khoảng trắng giữa các chứng từ khi gộp (px)

// pdfBlob → mỗi trang một canvas; scale(số trang) chọn độ nét
export async function pdfPages(pdfBlob, scaleOf = () => 2) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()) }).promise;
  try {
    const scale = scaleOf(pdf.numPages);
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      // Trang rất dài (ảnh một trang): giảm độ nét để canvas không vượt giới hạn của trình duyệt (~32.000 px)
      const one = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(scale, 30000 / one.height, 30000 / one.width) });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      c.dataset.w = one.width; c.dataset.h = one.height; // kích thước trang (pt)
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      pages.push(c);
    }
    return pages;
  } finally { pdf.destroy(); }
}

// pdfBlob → PNG (Blob). scale 3 ≈ 216 dpi: A4 rộng khoảng 1785 px; nhiều trang thì giảm bớt để ảnh không quá lớn.
export async function pdfToImageBlob(pdfBlob) {
  const pages = await pdfPages(pdfBlob, (n) => (n > 3 ? 2 : 3));
  const out = pages.length === 1 ? pages[0] : (() => {
    const o = document.createElement('canvas'); o.width = Math.max(...pages.map((p) => p.width));
    o.height = pages.reduce((s, p) => s + p.height, 0) + GAP * (pages.length - 1);
    const g = o.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, o.width, o.height);
    let y = 0; for (const p of pages) { g.drawImage(p, 0, y); y += p.height + GAP; }
    return o;
  })();
  return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('Không tạo được ảnh'))), 'image/png'));
}
