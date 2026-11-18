// Tệp PDF "Đơn đặt hàng xưởng": bảng như bảng tính theo dõi đơn (Tên KH · sản phẩm · SL đặt · còn SX · ngày trả)
// thêm phần tổng quan, cảnh báo hạn giao và thanh tiến độ giao cho từng đơn, từng dòng hàng.
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

// Thanh tiến độ vẽ bằng canvas; mark = mốc thời gian đã trôi qua (0–1)
function bar(p, w, color, { h = 6, mark = null } = {}) {
  const fillW = Math.max(0, Math.min(p, 1)) * w;
  const shapes = [{ type: 'rect', x: 0, y: 0, w, h, r: h / 2, color: '#e3e3e3' }];
  if (fillW > 0) shapes.push({ type: 'rect', x: 0, y: 0, w: Math.max(fillW, h), h, r: h / 2, color });
  if (mark != null) shapes.push({ type: 'line', x1: mark * w, y1: -2, x2: mark * w, y2: h + 2, lineWidth: 1.2, lineColor: '#333333' });
  return { canvas: shapes, width: w };
}
const barWithPct = (p, w, color, opts) => ({ columns: [bar(p, w, color, opts), { text: pctText(p), width: '*', fontSize: 8.5, bold: true, color, margin: [4, -1.5, 0, 0] }], columnGap: 0 });

const unitOf = (l) => l.unit || '';
const legend = () => ({
  columns: [['late', 'Quá hạn'], ['soon', `Sắp đến hạn (≤ ${SOON_DAYS} ngày)`], ['ok', 'Còn hạn'], ['done', 'Đã giao đủ']].map(([k, label]) => ({
    width: 'auto', columns: [{ canvas: [{ type: 'rect', x: 0, y: 1, w: 9, h: 9, color: C[k].fill || '#ffffff', lineColor: C[k].bar, lineWidth: 1 }], width: 13 }, { text: label, fontSize: 8.5, width: 'auto' }], margin: [0, 0, 16, 0],
  })).concat([{ width: '*', text: '| = mốc thời gian đã trôi qua; thanh nằm sau vạch là giao chậm hơn kế hoạch', fontSize: 8.5, italics: true, color: '#555555', alignment: 'right' }]),
  margin: [0, 6, 0, 8],
});

function kpi(label, value, sub, color) {
  return { stack: [{ text: label, fontSize: 8.5, color: '#555555' }, { text: value, fontSize: 15, bold: true, color: color || '#000000', margin: [0, 1, 0, 0] }, sub ? (typeof sub === 'string' ? { text: sub, fontSize: 8.5, color: '#555555' } : sub) : ''] };
}

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
  if (o.last_receipt_date) stack.push({ text: `Lần giao gần nhất: ${dmy(o.last_receipt_date)}`, fontSize: 8, color: '#555555', margin: [0, 3, 0, 0] });
  return { stack, rowSpan: rs, alignment: 'center', fillColor: col.fill || undefined, margin: [0, 1, 0, 1] };
}

// Ô "Tên KH" của một đơn: tên khách, mã đơn, tiến độ giao cả đơn
function nameCell(o, t, rs) {
  const col = C[t.key] || C.nodate;
  return {
    rowSpan: rs, fillColor: col.fill || undefined, margin: [0, 1, 0, 1],
    stack: [
      { text: o.sales_customer_name || o.code, bold: true, fontSize: 11 },
      { text: o.sales_customer_name ? `Đơn ${o.code}` : (o.sales_order_code ? `Theo đơn bán ${o.sales_order_code}` : ''), fontSize: 8.5, color: '#555555', margin: [0, 1, 0, 5] },
      { text: 'Tiến độ cả đơn', fontSize: 8, color: '#555555' },
      { ...barWithPct(t.pct, 62, col.bar, { h: 7, mark: t.open && t.timePct != null ? t.timePct : null }), margin: [0, 2, 0, 2] },
      { text: `Đã giao ${qty(t.got)} / ${qty(t.eff)}`, fontSize: 8.5 },
    ],
  };
}

export async function poTrackingPdf({ supplier, orders, lines, today }) {
  const list = orders.map((o) => ({ ...o, t: o.t || trackOf(o, today) }))
    .sort((a, b) => TRACK_RANK[a.t.key] - TRACK_RANK[b.t.key] || String(a.expected_date || '9').localeCompare(String(b.expected_date || '9')));
  const byPo = {};
  for (const l of lines) (byPo[l.po_id] ||= []).push(l);

  // ---------- Tổng quan ----------
  const units = new Set(lines.filter((l) => l.eff_qty > 0).map(unitOf));
  const unit = units.size === 1 ? ` ${[...units][0]}` : '';
  const tot = list.reduce((s, o) => ({ eff: s.eff + o.t.eff, got: s.got + o.t.got, left: s.left + o.t.left }), { eff: 0, got: 0, left: 0 });
  const totPct = tot.eff > 0 ? tot.got / tot.eff : 0;
  const late = list.filter((o) => o.t.key === 'late'); const soon = list.filter((o) => o.t.key === 'soon');
  const openN = list.filter((o) => o.t.open).length;
  const [yy, mm] = today.split('-');

  const content = [
    { text: `ĐƠN ĐẶT HÀNG XƯỞNG ${yy} - THÁNG ${Number(mm)}`, fontSize: 22, bold: true, alignment: 'center' },
    { text: [{ text: 'Xưởng / NCC: ', color: '#555555' }, { text: supplier.name, bold: true }, supplier.phone ? `  ·  ${supplier.phone}` : '', { text: `   ·   Cập nhật ngày ${dmy(today)}`, color: '#555555' }], alignment: 'center', fontSize: 10.5, margin: [0, 3, 0, 10] },
    {
      table: { widths: ['*', '*', '*', '*', '*'], body: [[
        kpi('Số đơn', String(list.length), `${openN} đơn đang chờ giao`),
        kpi('Tổng SL đặt', qty(tot.eff) + unit),
        kpi('Đã giao được', qty(tot.got) + unit, { ...barWithPct(totPct, 80, totPct >= 1 ? C.done.bar : C.ok.bar, { h: 7 }), margin: [0, 3, 0, 0] }, C.ok.ink),
        kpi('Còn phải sản xuất', qty(tot.left) + unit, null, tot.left > 0 ? RED : C.done.ink),
        kpi('Hạn giao', `${late.length} quá hạn`, `${soon.length} sắp đến hạn (≤ ${SOON_DAYS} ngày)`, late.length ? C.late.ink : soon.length ? C.soon.ink : C.done.ink),
      ]] },
      layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#bbbbbb', vLineColor: () => '#bbbbbb', paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
    },
  ];

  // ---------- Cần chú ý: đơn quá hạn / sắp hạn / đang chậm ----------
  const watch = list.filter((o) => o.t.key === 'late' || o.t.key === 'soon' || (o.t.open && o.t.behind));
  if (watch.length) {
    content.push({ text: 'CẦN CHÚ Ý', bold: true, fontSize: 11, color: RED, margin: [0, 10, 0, 3] });
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
  // Mỗi đơn là MỘT dòng của bảng chính, trong đó là bảng con đủ 8 cột (gộp ô Tên KH / Ngày trả theo số dòng hàng)
  // → đơn không bị cắt đôi khi sang trang, tiêu đề cột lặp lại mỗi trang. Bảng chính không có lề trong; bảng con lề PAD
  // nên độ rộng bảng con = độ rộng cột chính − 2·PAD, các cột thẳng hàng với dòng tiêu đề.
  const PAD = 4; const WIDTHS = [118, '*', 56, 32, 50, 50, 78, 118];
  const hd = (text, color) => ({ text, bold: true, alignment: 'center', color, fillColor: '#f2f2f2', fontSize: 10.5, margin: [PAD, 3.5, PAD, 3.5] });
  const body = [[hd('Tên KH'), hd('Tên sản phẩm'), hd('Số lượng đặt', RED), hd('ĐVT', RED), hd('Đã giao'), hd('Còn SX'), hd('Tiến độ'), hd('Ngày trả dự kiến')]];
  const innerLayout = {
    hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.6), vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0 : 0.6),
    hLineColor: () => LINE, vLineColor: () => LINE, paddingLeft: () => PAD, paddingRight: () => PAD, paddingTop: () => 3.5, paddingBottom: () => 3.5,
  };
  for (const o of list) {
    const ls = (byPo[o.id] || []).filter((l) => l.eff_qty > 0);
    if (!ls.length) continue;
    const t = o.t; const col = C[t.key] || C.nodate; const fill = col.fill || undefined;
    const rows = ls.map((l, i) => {
      const got = Math.min(l.received_qty || 0, l.eff_qty); const p = l.eff_qty > 0 ? got / l.eff_qty : 0; const left = l.remaining_qty || 0;
      return [
        i === 0 ? nameCell(o, t, ls.length) : {},
        { stack: [{ text: l.product_name, fontSize: 10 }, l.note ? { text: l.note, fontSize: 8, italics: true, color: '#555555' } : ''], fillColor: fill },
        { text: qty(l.eff_qty), alignment: 'center', fillColor: fill },
        { text: unitOf(l), alignment: 'center', fillColor: fill },
        { text: got ? qty(got) : '—', alignment: 'center', color: got ? '#000000' : '#999999', fillColor: fill },
        { text: left > 0 ? qty(left) : 'Đủ', alignment: 'center', bold: true, color: left > 0 ? '#000000' : C.done.ink, fillColor: left > 0 ? fill : C.done.fill },
        { ...barWithPct(p, 44, (left <= 0 ? C.done : col).bar, { h: 5 }), fillColor: fill, margin: [0, 3, 0, 0] },
        i === 0 ? dueCell(o, t, ls.length) : {},
      ];
    });
    body.push([{ table: { widths: WIDTHS.map((w) => (w === '*' ? '*' : w - 2 * PAD)), body: rows }, layout: innerLayout, colSpan: 8 }, {}, {}, {}, {}, {}, {}, {}]);
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
