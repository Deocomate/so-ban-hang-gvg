// Vẽ chứng từ (danh sách khối từ model.js) ra tệp PDF bằng pdfmake.
// Phông chữ Arimo (tương đương Arial) và Tinos (tương đương Times New Roman) – giấy phép Apache 2.0 –
// được nhúng vào PDF nên tiếng Việt hiển thị đúng trên mọi máy và chữ chọn / sao chép được.
import ArimoR from '../../assets/fonts/Arimo-Regular.ttf?url';
import ArimoB from '../../assets/fonts/Arimo-Bold.ttf?url';
import ArimoI from '../../assets/fonts/Arimo-Italic.ttf?url';
import ArimoBI from '../../assets/fonts/Arimo-BoldItalic.ttf?url';
import TinosR from '../../assets/fonts/Tinos-Regular.ttf?url';
import TinosB from '../../assets/fonts/Tinos-Bold.ttf?url';
import TinosI from '../../assets/fonts/Tinos-Italic.ttf?url';
import TinosBI from '../../assets/fonts/Tinos-BoldItalic.ttf?url';

const FONT_URLS = {
  Arimo: { normal: ArimoR, bold: ArimoB, italics: ArimoI, bolditalics: ArimoBI },
  Tinos: { normal: TinosR, bold: TinosB, italics: TinosI, bolditalics: TinosBI },
};
const cache = {};
let pdfMakeP = null;

function b64(buf) {
  const bytes = new Uint8Array(buf); let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
async function fontVfs(family) {
  if (!cache[family]) {
    cache[family] = (async () => {
      const vfs = {}; const def = {};
      await Promise.all(Object.entries(FONT_URLS[family]).map(async ([style, url]) => {
        const r = await fetch(url); if (!r.ok) throw new Error('Không tải được phông chữ');
        const name = `${family}-${style}.ttf`; vfs[name] = b64(await r.arrayBuffer()); def[style] = name;
      }));
      return { vfs, def };
    })().catch((e) => { delete cache[family]; throw e; });
  }
  return cache[family];
}

const run = (r, base = {}) => ({ text: r.text, bold: r.b || base.bold || undefined, italics: r.i || base.italics || undefined, ...(r.size ? { fontSize: r.size } : {}), ...(r.color ? { color: r.color } : {}) });

function cellOf(c, size) {
  if (!c || (c.text === undefined && !c.runs && !c.colSpan)) return {};
  const base = { alignment: c.align || 'left', bold: c.b || undefined, italics: c.i || undefined, ...(c.colSpan ? { colSpan: c.colSpan } : {}) };
  if (c.runs) return { ...base, text: c.runs.map((r) => run(r)) };
  if (c.sub) return { ...base, stack: [{ text: c.text }, { text: c.sub, italics: true, fontSize: size - 0.5 }] };
  return { ...base, text: c.text ?? '' };
}

export function toPdfDef(doc) {
  const content = [];
  for (const b of doc.blocks) {
    if (b.t === 'letterhead') {
      const stack = b.lines.map((l) => ({ text: l.text, bold: l.b, fontSize: l.size || b.size, margin: [0, 0, 0, b.gap ?? 2] }));
      if (b.rule) content.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 3, color: '#1f3864' }, { type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 0.6, lineColor: '#8ea2c6' }], margin: [0, 0, 0, 6] });
      if (b.logo && /^data:image\/(png|jpe?g);base64,/.test(b.logo)) content.push({ columns: [{ image: b.logo, fit: [96, 84], width: 110 }, { stack, width: '*', margin: [6, 2, 0, 0] }], columnGap: 8 });
      else content.push({ stack });
    } else if (b.t === 'cols') {
      content.push({ columns: b.cols.map((c) => ({ width: c.width, alignment: c.align || 'left', stack: c.lines.map((l) => ({ text: l.text, bold: l.b, italics: l.i, fontSize: l.size || b.size, margin: [0, 0, 0, 1.5] })) })), columnGap: 12 });
    } else if (b.t === 'title') {
      content.push({ text: b.text, bold: true, fontSize: b.size, alignment: 'center', margin: [0, b.mt || 0, 0, b.mb || 2] });
    } else if (b.t === 'p') {
      content.push({ text: b.runs.map((r) => run(r)), fontSize: b.size, alignment: b.align || 'left', lineHeight: b.lh || 1.15, color: b.color,
        margin: [b.indent || 0, b.mt || 0, 0, b.mb || 0] });
    } else if (b.t === 'table') {
      const body = [b.head.map((h) => cellOf(h, b.size))];
      for (const row of b.body) {
        const tall = row.some((c) => c && c.sub);
        const out = []; for (const c of row) { const x = cellOf(c, b.size); if (tall && c && !c.sub && x.text !== undefined) x.margin = [0, b.size * 0.6, 0, 0]; out.push(x); }
        body.push(out);
      }
      const pad = b.pad ?? 3;
      content.push({ table: { headerRows: 1, widths: b.widths, body, dontBreakRows: true }, fontSize: b.size,
        layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#000', vLineColor: () => '#000',
          paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => pad, paddingBottom: () => pad } });
    } else if (b.t === 'sign') {
      content.push({ unbreakable: true, margin: [0, b.mt || 0, 0, 0], stack: [
        { columns: b.cols.map((c) => ({ width: '*', alignment: 'center', stack: [{ text: c.title, bold: true, fontSize: b.size },
          c.note ? { text: c.note, italics: true, fontSize: b.size - 1 } : { text: '' }] })) },
        { columns: b.cols.map((c) => ({ width: '*', alignment: 'center', text: c.name || ' ', bold: true, fontSize: b.size })), margin: [0, b.space || 48, 0, 0] },
      ] });
    }
  }
  return {
    pageSize: 'A4', pageMargins: [40, 30, 40, 28], content, info: { title: doc.title + ' ' + (doc.code || ''), creator: 'Sổ bán hàng gốm sứ' },
    defaultStyle: { font: doc.font, fontSize: 10, lineHeight: 1.15 },
  };
}

export async function pdfBlob(doc) {
  if (!pdfMakeP) pdfMakeP = import('pdfmake/build/pdfmake').then((m) => m.default || m);
  const [pdfMake, f] = await Promise.all([pdfMakeP, fontVfs(doc.font)]);
  const def = toPdfDef(doc);
  return new Promise((resolve, reject) => {
    try { pdfMake.createPdf(def, null, { [doc.font]: f.def }, f.vfs).getBlob((b) => resolve(b)); } catch (e) { reject(e); }
  });
}
