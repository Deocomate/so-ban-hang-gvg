// Mã vạch Code 128 (bộ ký tự B: chữ, số, ký hiệu ASCII) vẽ bằng SVG, và in tem mã vạch hàng hóa.
const P = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '
  + '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '
  + '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '
  + '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '
  + '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '
  + '114131 311141 411131 211412 211214 211232 2331112').split(' ');

export function code128(text) {
  const s = String(text ?? '');
  if (!s || [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126)) return null;
  const vals = [...s].map((c) => c.charCodeAt(0) - 32);
  const check = (104 + vals.reduce((t, v, i) => t + v * (i + 1), 0)) % 103;
  return [104, ...vals, check, 106].map((v) => P[v]).join('');
}

// SVG mã vạch: rộng theo số mô-đun, cao h (đơn vị mô-đun); trả về chuỗi rỗng nếu mã có ký tự không in được
export function barcodeSvg(text, { h = 40, module = 1 } = {}) {
  const w = code128(text);
  if (!w) return '';
  let x = 10; let rects = '';
  [...w].forEach((d, i) => { const n = Number(d) * module; if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${n}" height="${h}"/>`; x += n; });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges"><g fill="#000">${rects}</g></svg>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// In tem: mỗi hàng in n tem (tên, giá, mã vạch, mã số) trên khổ giấy tem 50×30 mm
export function printLabels(items, { shop = '' } = {}) {
  const labels = items.flatMap(({ product: p, count, price }) => Array.from({ length: Math.max(1, count | 0) }, () => {
    const code = p.barcode || p.sku;
    return `<div class="lb"><div class="sh">${esc(shop)}</div><div class="nm">${esc(p.name)}</div><div class="bc">${barcodeSvg(code)}</div><div class="cd">${esc(code)}</div>${price != null ? `<div class="pr">${Number(price).toLocaleString('vi-VN')} đ</div>` : ''}</div>`;
  })).join('');
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Tem mã vạch</title><style>
    @page { size: 50mm 30mm; margin: 0 } body { margin: 0; font-family: Arial, sans-serif }
    .lb { width: 50mm; height: 30mm; box-sizing: border-box; padding: 1.5mm 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; overflow: hidden }
    .sh { font-size: 6pt } .nm { font-size: 7pt; font-weight: bold; text-align: center; max-height: 2.4em; overflow: hidden }
    .bc { width: 100%; height: 11mm } .bc svg { width: 100%; height: 100% } .cd { font-size: 7pt; letter-spacing: 1px } .pr { font-size: 9pt; font-weight: bold }
  </style></head><body>${labels}<script>window.onload = () => { window.print(); }</script></body></html>`);
  w.document.close();
  return true;
}
