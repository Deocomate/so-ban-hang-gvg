// Tệp PDF "Đơn đặt hàng xưởng": bảng như bảng tính theo dõi đơn (Tên KH · sản phẩm · SL đặt · đã giao theo từng ngày · còn SX · ngày trả)
// thêm cảnh báo hạn giao và thanh tiến độ giao cho từng dòng hàng.
import { qty, dmy } from '../format.js';
import { trackOf, pctText, TRACK_RANK, SOON_DAYS } from '../po-tracking.js';
import { pdfFromDef } from './pdf.js';

// Màu theo trạng thái hạn giao: nền nhóm dòng · chữ · thanh tiến độ
const C = {
  late: { fill: '#fde4e1', ink: '#c0392b', bar: '#d64532' },
  soon: { fill: '#fff3d6', ink: '#a86300', bar: '#e09a12' },
  ok: { fill: null, ink: '#1f5fa8', bar: '#2f74c8' },
  nodate: { fill: null, ink: '#555555', bar: '#7a8794' },
  done: { fill: '#e2efda', ink: '#2e7d32', bar: '#3c9a40' },
};
const RED = '#d0021b';
const LINE = '#000000';
const MAX_DATES = 6; // giao quá 6 lần thì gộp các lần đầu vào cột "Trước đó"

function bar(p, w, color, h) {
  const fillW = Math.max(0, Math.min(p, 1)) * w;
  const shapes = [{ type: 'rect', x: 0, y: 0, w, h, r: h / 2, color: '#e3e3e3' }];
  if (fillW > 0) shapes.push({ type: 'rect', x: 0, y: 0, w: Math.max(fillW, h), h, r: h / 2, color });
  return { canvas: shapes, width: w };
}
const barWithPct = (p, w, color) => ({ columns: [bar(p, w, color, 5), { text: pctText(p), width: '*', fontSize: 8.5, bold: true, color, margin: [4, -1.5, 0, 0] }], columnGap: 0 });

const unitOf = (l) => l.unit || '';
const dm = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`; // 22/9 như bảng tính
const legend = () => ({
  columns: [['late', 'Quá hạn'], ['soon', `Sắp đến hạn (≤ ${SOON_DAYS} ngày)`], ['ok', 'Còn hạn'], ['done', 'Đã giao đủ']].map(([k, label]) => ({
    width: 'auto', columns: [{ canvas: [{ type: 'rect', x: 0, y: 1, w: 9, h: 9, color: C[k].fill || '#ffffff', lineColor: C[k].bar, lineWidth: 1 }], width: 13 }, { text: label, fontSize: 8.5, width: 'auto' }], margin: [0, 0, 16, 0],
  })),
  margin: [0, 6, 0, 8],
});

// Ô "Ngày trả dự kiến" của một đơn
function dueCell(o, t, rs) {
  const col = C[t.key] || C.nodate;
  const stack = [
    { text: [{ text: 'Đặt: ', bold: true, color: RED }, dmy(o.order_date)], fontSize: 9.5 },
    { text: [{ text: 'Giao: ', bold: true, color: RED }, { text: o.expected_date ? dmy(o.expected_date) : 'chưa hẹn', bold: true }], fontSize: 9.5, margin: [0, 2, 0, 4] },
    { text: t.label, bold: true, color: col.ink, fontSize: 10 },
  ];
  if (t.open && t.behind && t.key !== 'late') stack.push({ text: 'Chậm so với kế hoạch', color: C.soon.ink, fontSize: 8.5, bold: true });
  if (t.open && t.perDay) stack.push({ text: `Cần giao ~${qty(t.perDay)}/ngày để kịp hạn`, fontSize: 8.5, color: '#333333', margin: [0, 2, 0, 0] });
  if (t.open && t.key === 'late') stack.push({ text: `Còn ${qty(t.left)} chưa giao`, fontSize: 8.5, color: col.ink, margin: [0, 2, 0, 0] });
  return { stack, rowSpan: rs, alignment: 'center', fillColor: col.fill || undefined, margin: [0, 1, 0, 1] };
}

// Số đã giao theo ngày cho từng dòng đơn: { dates: [iso…], cell(lineId, idx) }; quá MAX_DATES ngày thì cột đầu là "Trước đó"
function deliveriesOf(receipts) {
  const by = {}; // ngày → po_line_id → số lượng
  for (const r of receipts) {
    const ls = typeof r.lines === 'string' ? JSON.parse(r.lines || '[]') : r.lines || [];
    const d = String(r.receipt_date).slice(0, 10); by[d] ||= {};
    for (const l of ls) if (l && l.po_line_id) by[d][l.po_line_id] = (by[d][l.po_line_id] || 0) + (Number(l.qty) || 0);
  }
  const all = Object.keys(by).sort();
  const cut = all.length > MAX_DATES ? all.length - (MAX_DATES - 1) : 0;
  const cols = cut ? [{ label: 'Trước đó', dates: all.slice(0, cut) }, ...all.slice(cut).map((d) => ({ label: dm(d), dates: [d] }))] : all.map((d) => ({ label: dm(d), dates: [d] }));
  return { cols, val: (lineId, c) => c.dates.reduce((s, d) => s + (by[d][lineId] || 0), 0) };
}

export async function poTrackingPdf({ supplier, orders, lines, receipts = [], today }) {
  const list = orders.map((o) => ({ ...o, t: o.t || trackOf(o, today) }))
    .sort((a, b) => TRACK_RANK[a.t.key] - TRACK_RANK[b.t.key] || String(a.expected_date || '9').localeCompare(String(b.expected_date || '9')));
  const byPo = {}; const rcByPo = {};
  for (const l of lines) (byPo[l.po_id] ||= []).push(l);
  for (const r of receipts) if (!r.cancelled_at) (rcByPo[r.po_id] ||= []).push(r);
  const [yy, mm] = today.split('-');

  const content = [
    { text: `ĐƠN ĐẶT HÀNG XƯỞNG ${yy} - THÁNG ${Number(mm)}`, fontSize: 22, bold: true, alignment: 'center' },
    { text: [{ text: 'Xưởng / NCC: ', color: '#555555' }, { text: supplier.name, bold: true }, supplier.phone ? `  ·  ${supplier.phone}` : '', { text: `   ·   Cập nhật ngày ${dmy(today)}`, color: '#555555' }], alignment: 'center', fontSize: 10.5, margin: [0, 3, 0, 6] },
  ];

  // ---------- Cần chú ý: đơn quá hạn / sắp hạn / đang chậm ----------
  const watch = list.filter((o) => o.t.key === 'late' || o.t.key === 'soon' || (o.t.open && o.t.behind));
  if (watch.length) {
    content.push({ text: 'CẦN CHÚ Ý', bold: true, fontSize: 11, color: RED, margin: [0, 4, 0, 3] });
    content.push({
      ul: watch.map((o) => {
        const col = C[o.t.key] || C.nodate; const who = o.sales_customer_name ? `${o.sales_customer_name} (${o.code})` : o.code;
        return { text: [
          { text: who, bold: true }, ': ',
          { text: o.t.key === 'ok' ? 'chậm so với kế hoạch' : o.t.label.toLowerCase(), bold: true, color: col.ink },
          ` — hạn giao ${dmy(o.expected_date)}, mới giao ${pctText(o.t.pct)} (${qty(o.t.got)}/${qty(o.t.eff)}), còn ${qty(o.t.left)} chưa giao`,
          o.t.perDay ? `, cần ~${qty(o.t.perDay)}/ngày` : '',
        ], fontSize: 9.5, margin: [0, 1, 0, 1] };
      }),
    });
  }
  content.push(legend());

  // ---------- Bảng chi tiết ----------
  // Mỗi đơn là MỘT dòng của bảng chính, trong đó là bảng con (gộp ô Tên KH / Ngày trả theo số dòng hàng)
  // → đơn không bị cắt đôi khi sang trang, tiêu đề cột lặp lại mỗi trang. Bảng chính không có lề trong; bảng con lề PAD
  // nên độ rộng bảng con = độ rộng cột chính − 2·PAD, các cột thẳng hàng với dòng tiêu đề.
  // Cột "Đã giao" của bảng con chia đều thành từng ngày giao của đơn đó, dòng đầu bảng con ghi các ngày.
  const PAD = 4; const WIDTHS = [110, '*', 52, 32, 180, 50, 66, 110];
  const inner = (w) => (w === '*' ? '*' : w - 2 * PAD);
  const hd = (text, color) => ({ text, bold: true, alignment: 'center', color, fillColor: '#f2f2f2', fontSize: 10.5, margin: [PAD, 3.5, PAD, 3.5] });
  const body = [[hd('Tên KH'), hd('Tên sản phẩm'), hd('Số lượng đặt', RED), hd('ĐVT', RED), hd('Đã giao', RED), hd('Còn SX'), hd('Tiến độ'), hd('Ngày trả dự kiến')]];
  const innerLayout = {
    hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.6), vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0 : 0.6),
    hLineColor: () => LINE, vLineColor: () => LINE, paddingLeft: () => PAD, paddingRight: () => PAD, paddingTop: () => 3.5, paddingBottom: () => 3.5,
  };
  for (const o of list) {
    const ls = (byPo[o.id] || []).filter((l) => l.eff_qty > 0);
    if (!ls.length) continue;
    const t = o.t; const col = C[t.key] || C.nodate; const fill = col.fill || undefined;
    const dv = deliveriesOf(rcByPo[o.id] || []);
    const k = Math.max(dv.cols.length, 1);
    const head = dv.cols.length > 0; const rs = ls.length + (head ? 1 : 0);
    const nameCell = { text: o.sales_customer_name || o.code, bold: true, fontSize: 11, rowSpan: rs, fillColor: fill, margin: [0, 1, 0, 1] };
    const widths = [inner(WIDTHS[0]), '*', inner(WIDTHS[2]), inner(WIDTHS[3]), ...Array(k).fill(WIDTHS[4] / k - 2 * PAD), inner(WIDTHS[5]), inner(WIDTHS[6]), inner(WIDTHS[7])];
    const rows = [];
    if (head) {
      const sub = { text: '', fillColor: '#f7f7f7' };
      rows.push([nameCell, sub, sub, sub, ...dv.cols.map((c) => ({ text: c.label, bold: true, color: RED, alignment: 'center', fontSize: 9.5, fillColor: '#f7f7f7' })), sub, sub, dueCell(o, t, rs)]);
    }
    ls.forEach((l, i) => {
      const got = Math.min(l.received_qty || 0, l.eff_qty); const p = l.eff_qty > 0 ? got / l.eff_qty : 0; const left = Math.max(l.remaining_qty || 0, 0);
      const first = !head && i === 0;
      rows.push([
        first ? nameCell : {},
        { stack: [{ text: l.product_name, fontSize: 10 }, l.note ? { text: l.note, fontSize: 8, italics: true, color: '#555555' } : ''], fillColor: fill },
        { text: qty(l.eff_qty), alignment: 'center', fillColor: fill },
        { text: unitOf(l), alignment: 'center', fillColor: fill },
        ...(head ? dv.cols.map((c) => { const v = dv.val(l.id, c); return { text: v ? qty(v) : '', alignment: 'center', fillColor: fill }; }) : [{ text: '', fillColor: fill }]),
        { text: qty(left), alignment: 'center', bold: true, color: left > 0 ? '#000000' : C.done.ink, fillColor: left > 0 ? fill : C.done.fill },
        { ...barWithPct(p, 32, (left <= 0 ? C.done : col).bar), fillColor: fill, margin: [0, 3, 0, 0] },
        first ? dueCell(o, t, rs) : {},
      ]);
    });
    body.push([{ table: { widths, body: rows }, layout: innerLayout, colSpan: 8 }, {}, {}, {}, {}, {}, {}, {}]);
  }
  content.push({
    table: { headerRows: 1, dontBreakRows: true, widths: WIDTHS, body },
    layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => LINE, vLineColor: () => LINE, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
  });

  return pdfFromDef({
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [24, 24, 24, 30], content,
    info: { title: `Đơn đặt hàng xưởng – ${supplier.name}`, creator: 'Sổ bán hàng gốm sứ' },
    defaultStyle: { font: 'Tinos', fontSize: 10, lineHeight: 1.05 },
    footer: (page, pages) => ({ columns: [{ text: `${supplier.name} · ${list.length} đơn · xuất ngày ${dmy(today)}`, fontSize: 8, color: '#777777' }, { text: `Trang ${page}/${pages}`, alignment: 'right', fontSize: 8, color: '#777777' }], margin: [24, 8, 24, 0] }),
  });
}
