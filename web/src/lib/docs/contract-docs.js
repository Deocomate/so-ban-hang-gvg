// Chứng từ theo hợp đồng và báo giá: đề nghị tạm ứng / thanh toán, đối chiếu số lượng, đối chiếu kèm thanh toán, hợp đồng vận chuyển, báo giá.
// Dựng cùng dạng danh sách khối như model.js để bản xem trước và tệp PDF giống hệt nhau.
import { P, fmtNum, phoneFmt, dateLine, moneyWords, profileFor, goodsLines, weightPerUnit, DEFAULT_TEXTS, runsOf } from './model.js';

const dmy = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return y ? `${d}/${m}/${y}` : ''; };
const NATION = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'; const MOTTO = 'Độc lập – Tự do – Hạnh phúc';

function nationalHead(blocks) {
  blocks.push(P([{ text: NATION, b: true }], { align: 'center', size: 12 }));
  blocks.push(P([{ text: MOTTO, b: true }], { align: 'center', size: 12 }));
  blocks.push(P('-----------', { align: 'center', size: 11, mb: 8 }));
}
// Đầu bảng đối chiếu: đơn vị bên trái, quốc hiệu bên phải, số hợp đồng và khách hàng ở giữa
function reconcileHead(blocks, title, prof, data, code) {
  const short = prof.legal_name || prof.name;
  blocks.push({ t: 'cols', size: 10, cols: [
    { width: '*', lines: [{ text: String(short).toUpperCase(), b: true }, { text: `Số:......./ĐCCN/${code}` }] },
    { width: '*', align: 'center', lines: [{ text: NATION, b: true }, { text: MOTTO, b: true }] }] });
  blocks.push({ t: 'title', text: title, size: 14, mt: 12, mb: 4 });
  const k = data.k; const o = data.o;
  blocks.push(P(`THEO HỢP ĐỒNG SỐ: ${k.code}`, { align: 'center', size: 11 }));
  blocks.push(P([{ text: `KHÁCH HÀNG: ${String(o.customer_name).toUpperCase()}`, b: true }], { align: 'center', size: 11 }));
  if (o.customer_address) blocks.push(P(`Địa chỉ: ${o.customer_address}`, { align: 'center', size: 10 }));
  if (o.customer_phone) blocks.push(P(`Số điện thoại: ${phoneFmt(o.customer_phone)}`, { align: 'center', size: 10, mb: 8 }));
}
const signPair = (place) => [P(place, { align: 'right', size: 11, mt: 10 }), { t: 'sign', cols: [{ title: 'Đại diện bên mua' }, { title: 'Đại diện bên bán' }], mt: 6, size: 11, space: 60 }];

// Giấy đề nghị tạm ứng / thanh toán
function requestDoc(type, data, ds, info, prof, N) {
  const k = data.k; const o = data.o; const isAdv = type === 'de_nghi_tam_ung';
  const blocks = []; const legal = prof.legal_name || prof.name;
  nationalHead(blocks);
  const title = isAdv ? 'GIẤY ĐỀ NGHỊ TẠM ỨNG' : 'GIẤY ĐỀ NGHỊ THANH TOÁN';
  blocks.push({ t: 'title', text: title, size: 17, mt: 4, mb: 10 });
  blocks.push(P([{ text: 'Kính gửi: ', b: true }, { text: String(o.customer_name).toUpperCase(), b: true }], { align: 'center', size: 12 }));
  if (o.customer_address) blocks.push(P(`Địa chỉ: ${o.customer_address}`, { align: 'center', size: 12, mb: 10 }));
  const para = (t, x = {}) => P(t, { size: 12, lh: 1.5, ...x });
  blocks.push(para(`Lời đầu tiên, ${legal} xin trân trọng cảm ơn sự hợp tác và tin cậy của Quý khách hàng trong thời gian vừa qua.`, { indent: 24 }));
  blocks.push(para([{ text: 'Căn cứ theo Hợp đồng số ' }, { text: k.code, b: true }, { text: ` ký ngày ${dmy(k.sign_date)} giữa ${o.customer_name} và ${legal}.` }], { indent: 24 }));
  blocks.push(para(`Chúng tôi kính đề nghị Quý khách hàng ${isAdv ? 'tạm ứng' : 'thanh toán'} số tiền theo hợp đồng là:`, { indent: 24 }));
  const rows = isAdv
    ? [['Tổng giá trị hợp đồng', o.order_total], [`Số tiền đề nghị tạm ứng${k.advance_note ? ` (${k.advance_note})` : ''}`, k.advance_amount]]
    : [['Tổng giá trị hàng đã giao', o.delivered_value], ['Số tiền đã tạm ứng / thanh toán', o.paid_net], ['Số tiền còn lại cần thanh toán', Math.max(o.delivered_value - o.paid_net, 0)]];
  blocks.push({ t: 'cols', size: 12, gap: 4, cols: [{ width: '*', lines: rows.map(([l]) => ({ text: `- ${l}:` })) }, { width: 130, align: 'right', lines: rows.map(([, v]) => ({ text: `${N(v)} đồng` })) }] });
  const words = isAdv ? k.advance_amount : Math.max(o.delivered_value - o.paid_net, 0);
  blocks.push(para([{ text: `(Bằng chữ: ${moneyWords(words)})`, i: true }], { indent: 24, mt: 4 }));
  blocks.push(para('Quý khách hàng thanh toán cho chúng tôi bằng chuyển khoản theo thông tin sau:'));
  blocks.push(para([{ text: 'Thông tin chuyển khoản:', b: true }]));
  blocks.push(para(`Chủ tài khoản: ${legal}`));
  blocks.push(para(`Số tài khoản: ${prof.bank_line || ''}`));
  blocks.push(para([{ text: 'Rất mong sự hợp tác của Quý khách hàng!', i: true }], { align: 'center' }));
  const dt = info[`date_${type}`]; const [y, m, d] = String(dt || '').split('-');
  blocks.push(P([{ text: `Hà Nội, ngày ${d} tháng ${m} năm ${y}`, b: true, i: true }], { align: 'right', size: 12, mt: 4 }));
  blocks.push(P([{ text: isAdv ? 'Người đề nghị tạm ứng' : 'Người đề nghị thanh toán', b: true }], { align: 'right', size: 12, mt: 2 }));
  return { blocks, filename: `${isAdv ? 'de-nghi-tam-ung' : 'de-nghi-thanh-toan'}_${k.code.replace(/\//g, '-')}.pdf`, title: isAdv ? 'Đề nghị tạm ứng' : 'Đề nghị thanh toán', code: k.code };
}

// Bảng đối chiếu số lượng: mỗi ngày giao một hàng, mỗi mặt hàng một cột
function qtyReconcile(data, ds, info, prof, N, code) {
  const blocks = []; const rows = data.allDl;
  reconcileHead(blocks, 'BẢNG ĐỐI CHIẾU SỐ LƯỢNG GIAO HÀNG', prof, data, code);
  const prods = [...new Map(rows.map((r) => [r.product_id, r.product_name])).entries()];
  const days = [...new Set(rows.map((r) => r.delivery_date))].sort();
  const qty = (day, pid) => rows.filter((r) => r.delivery_date === day && r.product_id === pid).reduce((s, r) => s + Number(r.qty), 0);
  const body = days.map((day) => [{ text: dmy(day), align: 'center' }, ...prods.map(([pid]) => ({ text: qty(day, pid) ? N(qty(day, pid)) : '', align: 'center' }))]);
  body.push([{ text: 'Tổng giao hàng', b: true }, ...prods.map(([pid]) => ({ text: N(rows.filter((r) => r.product_id === pid).reduce((s, r) => s + Number(r.qty), 0)), align: 'center', b: true }))]);
  blocks.push({ t: 'table', widths: [80, ...prods.map(() => '*')], head: [{ text: 'Ngày', b: true, align: 'center' }, ...prods.map(([, n]) => ({ text: n, b: true, align: 'center' }))], body, size: 10, pad: 4 });
  blocks.push(...signPair(`Hà Nội, ${dateLine(info.date_doi_chieu_sl, false)}`));
  return { blocks, filename: `doi-chieu-so-luong_${data.k.code.replace(/\//g, '-')}.pdf`, title: 'Đối chiếu số lượng', code: data.k.code };
}

// Bảng đối chiếu công nợ: từng đợt giao, VAT, đã thanh toán, còn phải thanh toán
function payReconcile(data, ds, info, prof, N, code) {
  const blocks = []; const o = data.o; const rows = data.allDl;
  reconcileHead(blocks, 'BẢNG ĐỐI CHIẾU CÔNG NỢ', prof, data, code);
  const days = [...new Set(rows.map((r) => r.delivery_code))];
  const body = []; let goods = 0;
  days.forEach((dc, i) => {
    const ls = rows.filter((r) => r.delivery_code === dc); const sum = ls.reduce((s, r) => s + Number(r.revenue), 0); goods += sum;
    ls.forEach((l, j) => body.push([{ text: j ? '' : String(i + 1), align: 'center' }, { text: j ? '' : dmy(l.delivery_date), align: 'center' }, { text: l.product_name }, { text: N(l.qty), align: 'right' },
      { text: l.unit, align: 'center' }, { text: N(l.unit_price_net), align: 'right' }, { text: N(l.revenue), align: 'right' }, { text: j ? '' : N(sum), align: 'right', b: true }]));
  });
  const row = (label, v, b) => [{ text: label, colSpan: 7, align: 'right', b }, {}, {}, {}, {}, {}, {}, { text: N(v), align: 'right', b }];
  const vat = Number(o.vat_net) || 0; const ship = Number(o.ship_billed) || 0; const paid = Number(o.paid_net) || 0;
  const total = goods + vat + ship - (Number(o.returned_value) || 0);
  body.push(row('TỔNG TIỀN', goods, true));
  if (Number(o.vat_rate)) body.push(row(`VAT ${fmtNum(o.vat_rate)}%`, vat));
  if (ship) body.push(row('TIỀN VẬN CHUYỂN', ship));
  if (Number(o.returned_value)) body.push(row('HÀNG TRẢ LẠI', -o.returned_value));
  body.push(row('TỔNG THANH TOÁN (1)', total, true));
  body.push(row('ĐÃ THANH TOÁN (2)', paid));
  body.push(row('CÒN THANH TOÁN (3) = (1) - (2)', total - paid, true));
  blocks.push({ t: 'table', widths: [24, 56, '*', 44, 30, 50, 66, 66], head: ['STT', 'Ngày giao', 'Tên hàng', 'Số lượng', 'ĐVT', 'Đơn giá', 'Số tiền', 'Tổng'].map((h) => ({ text: h, b: true, align: 'center' })), body, size: 9, pad: 3 });
  blocks.push(P([{ text: `Bằng chữ: ${moneyWords(total - paid)}.`, i: true, b: true }], { size: 10.5, mt: 6 }));
  blocks.push(...signPair(`Hà Nội, ${dateLine(info.date_doi_chieu_tt, false)}`));
  return { blocks, filename: `doi-chieu-cong-no_${data.k.code.replace(/\//g, '-')}.pdf`, title: 'Đối chiếu kèm thanh toán', code: data.k.code };
}

// Hợp đồng vận chuyển theo đợt giao hoặc cả đơn
function transportDoc(data, ds, info, prof, N) {
  const blocks = []; const type = 'hd_van_chuyen'; const g = goodsLines(type, data); const legal = prof.legal_name || prof.name;
  blocks.push({ t: 'cols', size: 10.5, cols: [{ width: '*', lines: [{ text: String(legal).toUpperCase(), b: true }] }, { width: '*', align: 'center', lines: [{ text: NATION, b: true }, { text: MOTTO, b: true }] }] });
  blocks.push({ t: 'title', text: 'HỢP ĐỒNG VẬN CHUYỂN', size: 15, mt: 10, mb: 2 });
  blocks.push(P([{ text: `Hà Nội, ${dateLine(info.date_hd_van_chuyen, false)}`, i: true }], { align: 'center', size: 10.5, mb: 4 }));
  blocks.push(P('Căn cứ chức năng nhiệm vụ, khả năng hàng hóa và vận chuyển của hai bên', { size: 10.5, mb: 4 }));
  const s = 10.5;
  blocks.push(P([{ text: `BÊN A: ${String(legal).toUpperCase()}`, b: true }], { size: s }));
  blocks.push(P(`Đại diện bên giao: ${info.handover_rep || prof.representative || ''}`, { size: s }));
  if (prof.phone) blocks.push(P(`Điện thoại: ${prof.phone}`, { size: s }));
  if (prof.address) blocks.push(P(`Địa chỉ: ${prof.address}`, { size: s }));
  blocks.push(P([{ text: `BÊN B: ${String(info.carrier_party || info.driver_name || '').toUpperCase()}`, b: true }], { size: s, mt: 4 }));
  if (info.carrier_address) blocks.push(P(`Địa chỉ: ${info.carrier_address}`, { size: s }));
  blocks.push(P([{ text: `LÁI XE: ${String(info.driver_name || '').toUpperCase()}`, b: true }], { size: s }));
  blocks.push(P(`CCCD số: ${info.id_no || ''}          Xe BKS: ${info.vehicle || ''}          Điện thoại: ${phoneFmt(info.driver_phone)}`, { size: s, mb: 4 }));
  blocks.push(P([{ text: 'Điều I: Nhận vận chuyển số lượng hàng sau đây:', b: true }], { size: s, mb: 4 }));
  const rows = g.map((l, i) => {
    const p = data.prods[l.product_id] || {}; const per = weightPerUnit(p) * (Number(p.units_per_pack) || 0);
    return [{ text: String(i + 1), align: 'center' }, { text: l.name }, { text: l.pack, align: 'center' }, { text: N(l.qty), align: 'right' }, { text: per ? N(Math.round(per * 10) / 10) : '', align: 'right' }, { text: l.kg ? N(Math.round(l.kg * 10) / 10) : '', align: 'right' }];
  });
  const kg = g.reduce((s2, l) => s2 + (l.kg || 0), 0);
  rows.push([{ text: `Tổng cộng: ${info.box_total || 0} ${g.find((l) => l.packUnit)?.packUnit || 'hộp'}`, colSpan: 5, align: 'right', b: true }, {}, {}, {}, {}, { text: N(Math.round(kg * 10) / 10), align: 'right', b: true }]);
  blocks.push({ t: 'table', widths: [24, '*', 104, 50, 40, 52], head: ['STT', 'Tên hàng', 'Số hộp', 'Tổng viên', 'kg/hộp', 'Tổng kg'].map((h) => ({ text: h, b: true, align: 'center' })), body: rows, size: 9.5, pad: 3 });
  const o = data.o;
  blocks.push(P([{ text: `Địa chỉ giao hàng: ${info.recv_address || o.customer_address || ''}`, b: true }], { size: s, mt: 6 }));
  blocks.push(P([{ text: `Người nhận: ${[info.recv_name, info.recv_phone && phoneFmt(info.recv_phone)].filter(Boolean).join(' - ')}`, b: true }], { size: s }));
  for (const ln of String(DEFAULT_TEXTS.transport_terms).replace('{days}', info.transit_days || '04').split('\n')) blocks.push(P(runsOf(ln), { size: 9.5, mt: 3, lh: 1.25 }));
  blocks.push(P(`Cân nặng và giá cước: ${info.freight_note || 'tính theo từng khách hàng'}`, { size: 9.5, mt: 2 }));
  blocks.push(P(`Thanh toán cước phí tại: ${info.pay_at || 'khách nhận hàng'}`, { size: 9.5, mt: 2 }));
  blocks.push({ t: 'sign', cols: [{ title: 'ĐẠI DIỆN BÊN A', name: info.handover_rep }, { title: 'LÁI XE', name: info.driver_name }, { title: 'ĐẠI DIỆN BÊN B' }], mt: 12, size: 10.5, space: 50 });
  const code = data.d ? data.d.code : o.code;
  return { blocks, filename: `hop-dong-van-chuyen_${code}.pdf`, title: 'Hợp đồng vận chuyển', code };
}

// Báo giá: mẫu ngói (nhóm hàng, định mức) và mẫu tranh mosaic
function quoteDoc(data, ds, info, prof, N) {
  const q = data.q; const b = q.body; const blocks = []; const mosaic = q.template === 'mosaic'; const showNorm = !mosaic && b.show_norm;
  blocks.push({ t: 'letterhead', logo: prof.logo, lines: [{ text: prof.name, b: true, size: 12 }, prof.address && { text: `Địa chỉ: ${prof.address}` }, prof.phone && { text: `Điện thoại: ${prof.phone}` }, prof.email && { text: `Email: ${prof.email}` }].filter(Boolean), size: 9.5, gap: 2 });
  blocks.push({ t: 'title', text: 'BÁO GIÁ', size: 17, mt: 8, mb: 6 });
  blocks.push(P([{ text: `Kính gửi: ${q.customer_name}`, b: true }], { size: 10.5 }));
  blocks.push(P(`Địa chỉ: ${q.address || ''}`, { size: 10.5 }));
  blocks.push(P(`Địa điểm công trình: ${q.site || ''}`, { size: 10.5, mb: 4 }));
  blocks.push(P('Trước tiên, công ty gửi lời cảm ơn đến Quý khách hàng đã quan tâm đến sản phẩm của công ty chúng tôi.', { size: 10 }));
  blocks.push(P('Chúng tôi xin gửi Quý khách hàng báo giá dưới đây:', { size: 10, mb: 5 }));
  const head = ['STT', 'Tên sản phẩm', 'Quy cách', 'Hình ảnh', 'Khối lượng', ...(showNorm ? ['Định mức'] : []), ...(mosaic ? [] : ['Số lượng']), 'ĐVT', mosaic ? 'Giá bán' : 'Đơn giá', 'Thành tiền'];
  const widths = [22, '*', 78, 44, 46, ...(showNorm ? [36] : []), ...(mosaic ? [] : [44]), 26, 52, 62];
  const n = head.length; const multi = b.groups.filter((g) => g.lines.length).length > 1 || b.groups[0]?.name;
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']; const rows = [];
  const span = (cells) => { const r = [...cells]; while (r.length < n) r.push({}); return r; };
  b.groups.forEach((g, gi) => {
    if (multi) {
      const sum = g.lines.reduce((s, l) => s + l.amount, 0);
      rows.push(span([{ text: roman[gi] || String(gi + 1), align: 'center', b: true }, { text: g.name || '', sub: g.note || undefined, colSpan: n - 2, b: true }, ...Array(n - 3).fill({}), { text: N(sum), align: 'right', b: true }]));
    }
    g.lines.forEach((l, i) => rows.push([{ text: String(i + 1), align: 'center' }, l.note ? { text: l.name, sub: l.note } : { text: l.name }, { text: l.spec || '' }, l.image ? { image: l.image } : { text: '' },
      { text: l.measure ? `${N(l.measure)} ${l.measure_unit || ''}` : (mosaic ? N(l.qty) : ''), align: 'center' }, ...(showNorm ? [{ text: l.norm ? N(l.norm) : '', align: 'center' }] : []),
      ...(mosaic ? [] : [{ text: N(l.qty), align: 'right' }]), { text: l.unit || '', align: 'center' }, { text: N(l.price), align: 'right' }, { text: N(l.amount), align: 'right' }]));
  });
  const total = (label, v, bold) => { const r = [{ text: label, colSpan: n - 1, align: 'right', b: bold }]; for (let i = 0; i < n - 2; i++) r.push({}); r.push({ text: N(v), align: 'right', b: bold }); return r; };
  if (b.ship?.amount) rows.push(total(`Vận chuyển (${N(b.ship.qty)} ${b.ship.unit} × ${N(b.ship.price)})`, b.ship.amount));
  rows.push(total('Tổng tiền', b.goods + (b.ship?.amount || 0), true));
  if (b.vat_mode === 'them') rows.push(total(`VAT ${fmtNum(b.vat_rate)}%`, b.vat));
  rows.push(total('Tổng thanh toán', b.total, true));
  blocks.push({ t: 'table', widths, head: head.map((h) => ({ text: h, b: true, align: 'center' })), body: rows, size: 8.5, pad: 3 });
  if (String(b.terms || '').trim()) {
    blocks.push(P([{ text: 'LƯU Ý:', b: true }], { size: 10, mt: 8, mb: 2 }));
    for (const ln of b.terms.split('\n')) blocks.push(P(runsOf(ln.trim() || ' '), { size: 9.5, lh: 1.25, indent: /^\s/.test(ln) ? 10 : 0 }));
  }
  const [y, m, d] = String(q.quote_date).split('-');
  blocks.push(P([{ text: `Hà Nội, ngày ${d} tháng ${m} năm ${y}`, i: true }], { align: 'right', size: 10.5, mt: 8 }));
  return { blocks, filename: `bao-gia_${q.code}.pdf`, title: 'Báo giá', code: q.code };
}

export function buildExtraDoc(type, data, ds, info) {
  const prof = profileFor(ds, type, info); const cfg = ds.types[type]; const N = (v) => fmtNum(v, cfg.sep);
  const code = String((prof.legal_name || prof.name).split(/\s+/).pop()).slice(0, 2).toUpperCase() === 'HẢ' ? 'TH' : 'HKD';
  const font = ds.font || 'Arimo';
  let doc;
  if (type === 'de_nghi_tam_ung' || type === 'de_nghi_tt') doc = requestDoc(type, data, ds, info, prof, N);
  else if (type === 'doi_chieu_sl') doc = qtyReconcile(data, ds, info, prof, N, code);
  else if (type === 'doi_chieu_tt') doc = payReconcile(data, ds, info, prof, N, code);
  else if (type === 'hd_van_chuyen') doc = transportDoc(data, ds, info, prof, N);
  else doc = quoteDoc(data, ds, info, prof, N);
  return { font, ...doc };
}

