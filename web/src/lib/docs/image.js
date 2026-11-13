// Chuyển tệp PDF chứng từ thành ảnh PNG độ phân giải cao để gửi khách xem trên điện thoại.
// Vẽ lại chính tệp PDF (pdf.js) nên ảnh giống hệt PDF; các trang nối dọc thành một ảnh dài.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

let pdfjsP = null;
function loadPdfjs() {
  if (!pdfjsP) pdfjsP = import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = workerUrl; return m; });
  return pdfjsP;
}

const GAP = 24; // khoảng cách giữa các trang (px)

// pdfBlob → PNG (Blob). scale 3 ≈ 216 dpi: A4 rộng khoảng 1785 px; nhiều trang thì giảm bớt để ảnh không quá lớn.
export async function pdfToImageBlob(pdfBlob) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()) }).promise;
  try {
    const scale = pdf.numPages > 3 ? 2 : 3;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      pages.push(c);
    }
    const out = pages.length === 1 ? pages[0] : (() => {
      const o = document.createElement('canvas'); o.width = Math.max(...pages.map((p) => p.width));
      o.height = pages.reduce((s, p) => s + p.height, 0) + GAP * (pages.length - 1);
      const g = o.getContext('2d'); g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, o.width, o.height);
      let y = 0; for (const p of pages) { g.drawImage(p, 0, y); y += p.height + GAP; }
      return o;
    })();
    return await new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('Không tạo được ảnh'))), 'image/png'));
  } finally { pdf.destroy(); }
}
