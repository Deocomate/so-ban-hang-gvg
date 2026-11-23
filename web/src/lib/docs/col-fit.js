// Độ rộng cột của bảng có viền (bảng hàng hóa, báo giá, đối chiếu…) khi xuất chứng từ.
// - Mặc định: đo nội dung thật của từng cột (chữ dài nhất không ngắt, dòng dài nhất khi không xuống dòng) rồi chia chỗ trống
//   giống trình duyệt: cột số / đơn vị vừa khít, chỗ dư dồn cho cột chữ dài (tên hàng, quy cách) — khổ dọc hay khổ ngang đều cân.
// - Người dùng kéo đường kẻ giữa hai cột trên bản xem trước: lưu tỷ lệ độ rộng theo loại chứng từ + mẫu + hướng giấy.
// Kết quả ghi vào <colgroup> (px) nên bản xem trước, In và PDF (pdf.js đọc colgroup) giống nhau.

export const MIN_COL = 16; // px
// Lề trong ô có viền 4pt mỗi bên + viền
const PAD = (2 * 4 * 4) / 3 + 1;

// Khóa lưu độ rộng người dùng chỉnh: loại chứng từ, mẫu in, hướng giấy
export const colKey = (doc) => `${doc.type || doc.title || ''}|${doc.tplId || ''}|${doc.orient || 'portrait'}`;

// Bảng có viền không nằm trong ô của bảng khác
export const dataTables = (root) => [...root.querySelectorAll('table[data-border="1"]')].filter((t) => !t.parentElement?.closest('td,th'));

// Các ô của bảng kèm chỉ số cột bắt đầu (tính cả ô gộp dòng / gộp cột)
function cellsOf(tbl) {
  const rows = [...tbl.rows]; const taken = rows.map(() => []); const out = []; let n = 0;
  rows.forEach((tr, ri) => {
    let ci = 0;
    for (const td of tr.cells) {
      while (taken[ri][ci]) ci++;
      const cs = Math.max(1, td.colSpan || 1); const rs = Math.max(1, td.rowSpan || 1);
      for (let r = ri; r < Math.min(ri + rs, rows.length); r++) for (let k = ci; k < ci + cs; k++) taken[r][k] = 1;
      out.push({ td, ci, cs }); ci += cs; n = Math.max(n, ci);
    }
  });
  return { cells: out, n };
}

// Chia độ rộng W cho các cột theo [nhỏ nhất, vừa một dòng] của từng cột
function distribute(min, max, W) {
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const sMin = sum(min); const sMax = sum(max);
  if (sMin >= W) return min.map((w) => (w * W) / sMin);
  if (sMax > W) { const k = (W - sMin) / (sMax - sMin); return min.map((m, i) => m + (max[i] - m) * k); }
  // Đủ chỗ cho mọi cột trên một dòng: phần dư cho các cột chữ dài (cột có thể xuống dòng), không cho cột số
  const wt = max.map((m, i) => m - min[i]); const sw = sum(wt);
  const extra = W - sMax;
  return max.map((m, i) => m + extra * (sw > 0 ? wt[i] / sw : m / sMax));
}

let box = null;
function measureBox() {
  if (!box || !box.isConnected) {
    box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(box);
  }
  return box;
}

// html: nội dung chứng từ; shown: HTML đúng như lúc hiển thị (đã nâng cỡ chữ cơ bản); widthPx: độ rộng vùng in; fontCss / basePt: phông và cỡ chữ cơ bản như lúc hiển thị;
// saved: { [chỉ số bảng]: { n, w: [tỷ lệ] } } — độ rộng người dùng đã kéo (khớp số cột mới áp dụng)
export function fitColumns(html, { shown = html, widthPx, fontCss, basePt, saved }) {
  if (typeof document === 'undefined' || !String(html || '').includes('data-border="1"') || !(widthPx > 0)) return html;
  const b = measureBox();
  const inner = document.createElement('div');
  inner.className = 'tpl';
  inner.style.width = `${widthPx}px`; inner.style.fontFamily = fontCss || '';
  if (basePt) inner.style.fontSize = `${basePt}pt`;
  inner.innerHTML = shown;
  b.replaceChildren(inner);
  try {
    const tables = dataTables(inner);
    // Mỗi ô (không gộp cột) nhân bản nội dung vào hai hộp đo: nhỏ nhất (chữ dài nhất) và vừa một dòng
    const probes = tables.map((tbl) => {
      const { cells, n } = cellsOf(tbl); const ps = [];
      for (const c of cells) {
        if (c.cs !== 1 || (!c.td.textContent.trim() && !c.td.querySelector('img'))) continue;
        const kids = [...c.td.childNodes];
        for (const mode of ['min', 'max']) {
          const d = document.createElement('div');
          d.style.cssText = `position:absolute;left:0;top:0;width:${mode}-content;overflow-wrap:normal;word-break:normal;white-space:normal`;
          for (const ch of kids) d.appendChild(ch.cloneNode(true));
          c.td.appendChild(d); ps.push({ ci: c.ci, mode, d });
        }
      }
      return { n, ps };
    });
    const widths = probes.map(({ n, ps }, ti) => {
      const sv = saved?.[ti];
      if (sv && sv.n === n && Array.isArray(sv.w) && sv.w.length === n) return sv.w.map((f) => Math.max(MIN_COL, Number(f) * widthPx));
      const min = Array(n).fill(MIN_COL); const max = Array(n).fill(MIN_COL);
      let seen = false;
      for (const p of ps) {
        const w = p.d.getBoundingClientRect().width; if (!w) continue;
        seen = true; const arr = p.mode === 'min' ? min : max;
        // Dư 3% cho bản xem trước thu nhỏ (chữ ở cỡ nhỏ hiển thị rộng hơn tỷ lệ một chút)
        arr[p.ci] = Math.max(arr[p.ci], Math.ceil(w * 1.03 + PAD));
      }
      if (!seen) return null; // không đo được (chưa có bố cục): giữ độ rộng của mẫu
      for (let i = 0; i < n; i++) max[i] = Math.max(max[i], min[i]);
      return distribute(min, max, widthPx);
    });
    if (!widths.some(Boolean)) return html;
    // Ghi độ rộng vào bản HTML gốc (cùng thứ tự bảng)
    const d = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    dataTables(d.body).forEach((tbl, ti) => {
      const ws = widths[ti]; if (!ws) return;
      tbl.querySelectorAll(':scope > colgroup').forEach((cg) => cg.remove());
      const cg = d.createElement('colgroup');
      for (const w of ws) { const col = d.createElement('col'); col.setAttribute('style', `width:${Math.floor(w)}px`); cg.appendChild(col); }
      tbl.insertBefore(cg, tbl.firstChild);
    });
    return d.body.innerHTML;
  } finally {
    b.replaceChildren();
  }
}
