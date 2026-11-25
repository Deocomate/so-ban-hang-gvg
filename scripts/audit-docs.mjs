// Rà số tiền trên chứng từ bằng một bản chụp CSDL: dựng chứng từ như giao diện (tokenValues) rồi so với sổ.
// Cách dùng: bash scripts/prod-snapshot.sh <thư-mục> (tải bản chụp CSDL thật, chỉ đọc), rồi
//   node scripts/audit-docs.mjs <thư-mục>/live.db [TH]
// Kiểm: hóa đơn chuyến / bán ngay (giá trị, đã thanh toán, còn phải thanh toán = công nợ khách), đơn đặt hàng,
// đối chiếu công nợ theo đơn và gộp theo khách, phiếu yêu cầu xuất hóa đơn VAT. Không ghi gì vào bản chụp gốc.
import fs from 'node:fs';
const R = new URL('../', import.meta.url).href;
const { openDb } = await import(R + 'server/src/db/index.js');
const { makeApi } = await import(R + 'server/test/harness.js');
const { loadDocData, docSettings, defaults, currentInfo } = await import(R + 'web/src/lib/docs/model.js');
const { tokenValues } = await import(R + 'web/src/lib/docs/tokens.js');
const SRC = process.argv[2]; if (!SRC) { console.error('Thiếu đường dẫn bản chụp CSDL'); process.exit(1); }
const WORK = SRC + '.audit.db';
fs.copyFileSync(SRC, WORK);
for (const x of ['-wal', '-shm']) { try { fs.unlinkSync(WORK + x); } catch (e) { /* */ } }
const db = openDb(WORK);
const api = makeApi();
const num = (s) => (s === '' || s == null ? 0 : Number(String(s).replace(/,/g, '')));
const bad = {}; const seen = {};
const report = (kind, msg) => { (bad[kind] ||= []).push(msg); };
const ONLY = process.argv[3];

for (const b of db.prepare(`select b.id, b.short_name, b.name, b.settings, (select user_id from book_members m where m.book_id = b.id and m.role = 'owner' limit 1) uid from books b`).all()) {
  if (ONLY && b.short_name !== ONLY) continue;
  api.as(b.uid);
  const q = (view, filters = [], order, limit) => api.q(view, b.id, filters, order, limit);
  const rpc = (fn, p) => api.call(fn, { book_id: b.id, ...p });
  const ds = docSettings({ name: b.name }, JSON.parse(b.settings || '{}'));
  const build = async (type, src) => {
    const data = await loadDocData(q, rpc, src);
    const info = { ...defaults(type, data, ds), ...(currentInfo(type, data) || {}) };
    return { data, info, t: tokenValues(type, data, ds, info) };
  };
  const tag = (s) => `${b.short_name} ${s}`;

  // 1) Hóa đơn bán hàng của từng chuyến (đơn đặt hàng)
  for (const inv of await q('order_invoices', [['order_status', 'neq', 'huy']], 'delivery_date', 100000)) {
    seen.inv = (seen.inv || 0) + 1;
    try {
      const { data, info, t } = await build('hoa_don', { kind: 'delivery', id: inv.id });
      const v = t.v; const total = num(v.Tong_Thanh_Toan) - num(info.old_debt); const due = num(v.Con_Thanh_Toan);
      if (Math.abs(total - inv.total) >= 1) report('Hóa đơn chuyến: giá trị in khác giá trị hóa đơn trong sổ', tag(`${inv.code} in ${total} sổ ${inv.total}`));
      const paidDoc = num(v.Da_Thanh_Toan);
      if (Math.abs(paidDoc - inv.paid) >= 1) report('Hóa đơn chuyến: đã thanh toán in khác sổ', tag(`${inv.code} in ${paidDoc} sổ ${inv.paid}`));
      const bal = Number(data.cust?.balance ?? NaN);
      if (Math.abs(due - bal) >= 1) report('Hóa đơn chuyến: còn phải thanh toán khác công nợ khách', tag(`${inv.code} in ${due} công nợ ${bal}`));
    } catch (e) { report('Lỗi dựng hóa đơn chuyến', tag(`${inv.code}: ${e.message}`)); }
  }
  // 2) Hóa đơn bán ngay (đơn = hóa đơn) và đơn đặt hàng
  for (const o of await q('sales_orders', [['status', 'neq', 'huy'], ['status', 'neq', 'nhap']], 'order_date', 100000)) {
    seen.order = (seen.order || 0) + 1;
    try {
      if (o.kind === 'ban_san') {
        const { data, info, t } = await build('hoa_don', { kind: 'order', id: o.id });
        const v = t.v; const total = num(v.Tong_Thanh_Toan) - num(info.old_debt); const due = num(v.Con_Thanh_Toan);
        if (Math.abs(total - (o.order_total - o.returned_value)) >= 1) report('Hóa đơn bán ngay: giá trị in khác sổ', tag(`${o.code} in ${total} sổ ${o.order_total - o.returned_value}`));
        if (Math.abs(num(v.Da_Thanh_Toan) - o.paid_net) >= 1) report('Hóa đơn bán ngay: đã thanh toán in khác sổ', tag(`${o.code} in ${num(v.Da_Thanh_Toan)} sổ ${o.paid_net}`));
        const bal = Number(data.cust?.balance ?? NaN);
        // Hóa đơn bán ngay chưa giao hết: sổ chỉ ghi nợ phần đã giao, hóa đơn in cả đơn
        if (o.remaining_qty === 0 && Math.abs(due - bal) >= 1) report('Hóa đơn bán ngay: còn phải thanh toán khác công nợ khách', tag(`${o.code} in ${due} công nợ ${bal}`));
      } else {
        const { t } = await build('don_dat_hang', { kind: 'order', id: o.id });
        const due = num(t.v.Con_Thanh_Toan);
        if (Math.abs(due - o.remaining_to_pay) >= 1) report('Đơn đặt hàng: còn thanh toán khác sổ', tag(`${o.code} in ${due} sổ ${o.remaining_to_pay}`));
        if (o.delivery_count > 0) {
          const r = await build('doi_chieu_tt', { kind: 'order', id: o.id });
          const due2 = r.t.v.Con_No_Doi_Chieu_Bang_Chu;
          const expect = o.pay_term === 'don_lon' ? null : Math.max(o.delivered_value - o.paid_net, 0);
          const html = r.t.v.Bang_Doi_Chieu_Cong_No.h;
          if (expect !== null) {
            const m = html.match(/CÒN THANH TOÁN \(3\) = \(1\) - \(2\)<\/strong><\/p><\/td><td><p style="text-align:right"><strong>([\d,.-]+)/);
            const got = m ? num(m[1]) : NaN;
            if (Number.isNaN(got)) report('Rà không đọc được số trên đối chiếu đơn', tag(o.code)); else seen.recRead = (seen.recRead || 0) + 1;
            if (Math.abs(got - expect) >= 1) report('Đối chiếu công nợ: còn thanh toán khác sổ', tag(`${o.code} in ${got} sổ ${expect}`));
            const m1 = html.match(/TỔNG THANH TOÁN \(1\)<\/strong><\/p><\/td><td><p style="text-align:right"><strong>([\d,.-]+)/);
            if (m1 && Math.abs(num(m1[1]) - o.delivered_value) >= 1) report('Đối chiếu công nợ: tổng thanh toán khác giá trị đã giao', tag(`${o.code} in ${num(m1[1])} sổ ${o.delivered_value}`));
          }
          if (!due2) report('Đối chiếu công nợ: thiếu dòng bằng chữ', tag(o.code));
        }
      }
    } catch (e) { report('Lỗi dựng chứng từ đơn', tag(`${o.code}: ${e.message}`)); }
  }
  // 3) Biên bản đối chiếu gộp mọi hóa đơn của từng khách
  const invs = await q('order_invoices', [['order_status', 'neq', 'huy']], 'delivery_date', 100000);
  const sales = (await q('sales_orders', [['status', 'neq', 'huy'], ['status', 'neq', 'nhap']], 'order_date', 100000));
  const custs = [...new Set([...invs.map((x) => x.customer_id), ...sales.filter((o) => o.kind === 'ban_san' && o.delivered_value).map((o) => o.customer_id)])];
  for (const cid of custs) {
    seen.cust = (seen.cust || 0) + 1;
    const ci = invs.filter((x) => x.customer_id === cid); const co = sales.filter((o) => o.kind === 'ban_san' && o.customer_id === cid && o.delivered_value);
    const keys = [...ci.map((x) => `d:${x.id}`), ...co.map((o) => `o:${o.id}`)];
    try {
      const data = await loadDocData(q, rpc, { kind: 'invoices', id: cid, keys });
      const info = { ...defaults('doi_chieu_tt', data, ds), ...(data.info || {}) };
      const html = tokenValues('doi_chieu_tt', data, ds, info).v.Bang_Doi_Chieu_Cong_No.h;
      const grab = (re) => { const m = html.match(re); return m ? num(m[1]) : NaN; };
      const t1 = grab(/TỔNG THANH TOÁN \(1\)<\/strong><\/p><\/td><td><p style="text-align:right"><strong>([\d,.-]+)/);
      const p2 = grab(/ĐÃ THANH TOÁN \(2\)<\/strong><\/p><\/td><td><p style="text-align:right"><strong>([\d,.-]+)/);
      const due = grab(/CÒN THANH TOÁN \(3\) = \(1\) - \(2\)<\/strong><\/p><\/td><td><p style="text-align:right"><strong>([\d,.-]+)/);
      if ([t1, p2, due].some(Number.isNaN)) report('Rà không đọc được số trên đối chiếu gộp', tag(cid.slice(0, 8)));
      seen.custRead = (seen.custRead || 0) + 1;
      const want1 = ci.reduce((s, x) => s + x.total, 0) + co.reduce((s, o) => s + o.delivered_value, 0);
      if (Math.abs(t1 - want1) >= 1) report('Đối chiếu gộp: tổng (1) khác tổng hóa đơn trong sổ', tag(`${cid.slice(0, 8)} in ${t1} sổ ${want1}`));
      if (Math.abs(due - Math.max(t1 - p2, 0)) >= 1) report('Đối chiếu gộp: (3) khác (1) − (2)', tag(`${cid.slice(0, 8)} (1) ${t1} (2) ${p2} (3) ${due}`));
      const oids = [...new Set([...ci.map((x) => x.order_id), ...co.map((o) => o.id)])];
      const paidBook = sales.filter((o) => oids.includes(o.id)).reduce((s, o) => s + o.paid_net, 0);
      if (data.wholeOrders && Math.abs(p2 - paidBook) >= 1) report('Đối chiếu gộp: đã thanh toán (2) khác tiền đã nhận của các đơn', tag(`${cid.slice(0, 8)} in ${p2} sổ ${paidBook}`));
    } catch (e) { report('Lỗi dựng đối chiếu gộp', tag(`${cid.slice(0, 8)}: ${e.message}`)); }
  }
  // 4) Phiếu yêu cầu xuất hóa đơn VAT của từng chuyến: tổng gồm thuế = cộng tiền hàng + thuế
  for (const inv of invs) {
    try {
      const { t } = await build('yeu_cau_vat', { kind: 'delivery', id: inv.id });
      const v = t.v;
      if (Math.abs(num(v.Cong_Tien_Hang) + num(v.Tien_Thue_GTGT) - num(v.Tong_Tien_Thanh_Toan_VAT)) >= 1) report('Yêu cầu VAT: tổng không bằng tiền hàng + thuế', tag(inv.code));
    } catch (e) { report('Lỗi dựng yêu cầu VAT', tag(`${inv.code}: ${e.message}`)); }
  }
}
console.log('Đã rà:', JSON.stringify(seen));
for (const [k, ls] of Object.entries(bad)) { console.log(`\n## ${k}: ${ls.length}`); for (const x of ls.slice(0, 8)) console.log('  ' + x); }
if (!Object.keys(bad).length) console.log('Không thấy sai lệch');
