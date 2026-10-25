// Thu chi tiền (phiếu thu/chi, phân bổ vào chứng từ, phí sàn), hủy phiếu, chi phí phân nhóm + phân bổ dần.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, int, bool, nz, trimNz, rnd, asDate, today, json } from '../lib/context.js';
import { requirePerm, checkDate, nextCode, once, bookSettings, setting } from './access.js';
import { DEFAULT_EXPENSE_CATS } from './books.js';

// Nhóm lớn của 1 khoản mục (theo danh mục của sổ; tên cũ trước bản phân nhóm cũng được hiểu)
const LEGACY_GROUPS = {
  'thuê mặt bằng': 'Mặt bằng', 'điện nước - vận hành': 'Điện, nước, internet', 'quảng cáo - marketing': 'Marketing',
  'vận chuyển': 'Chi phí bán hàng', 'bao bì - đóng gói': 'Chi phí bán hàng', 'phí sàn tmđt': 'Chi phí bán hàng',
  'phí ngân hàng': 'Chi phí bán hàng', 'nhân sự': 'Nhân sự',
};
export function expenseGroupOf(book, cat) {
  const c = String(cat ?? '').trim().toLowerCase();
  const cats = bookSettings(book).expense_cats || DEFAULT_EXPENSE_CATS;
  for (const g of cats) {
    if (String(g.group).toLowerCase() === c || (g.items || []).some((i) => String(i).toLowerCase() === c)) return g.group;
  }
  return LEGACY_GROUPS[c] || 'Quản lý & khác';
}

export function insertExpense(book, e) {
  const id = uuid();
  const code = nextCode(book, 'CP');
  insert('expenses', { id, book_id: book, code, created_by: ctx.uid, created_at: nowIso(), alloc_months: 1, ...e,
    expense_group: trimNz(e.expense_group) || expenseGroupOf(book, e.category) });
  return one(`select * from expenses where id = ?`, id);
}

// Gợi ý phân bổ: trả các khoản đã đến hạn (hàng đã giao/nhận, nợ đầu kỳ) – cũ trước
export function suggestAlloc(book, ptype, party, amount) {
  let left = amount; const res = [];
  for (const d of all(`select * from v_open_docs where book_id = ? and party_type = ? and party_id = ? and status <> 'huy' and remaining_due > 0
      order by doc_date, code`, book, ptype, party)) {
    if (left <= 0) break;
    const a = Math.min(d.remaining_due, d.remaining_total, left);
    if (a > 0) { res.push({ doc_type: d.doc_type, doc_id: d.doc_id, amount: a }); left -= a; }
  }
  return res;
}

export function doPayment(book, p) {
  const k = p.kind;
  const dir = ['thu_khach', 'ncc_hoan', 'thu_khac', 'gop_von'].includes(k) ? 'thu'
    : ['hoan_khach', 'tra_ncc', 'chi_phi', 'chi_khac', 'rut_von'].includes(k) ? 'chi' : k === 'chuyen_quy' ? 'chuyen' : null;
  if (!dir) fail('Loại phiếu thu/chi không hợp lệ');
  const pt = ['thu_khach', 'hoan_khach'].includes(k) ? 'kh' : ['tra_ncc', 'ncc_hoan'].includes(k) ? 'ncc' : null;
  const amt = rnd(num(p.amount));
  if (amt == null || amt <= 0) fail('Số tiền phải lớn hơn 0');
  const fee = rnd(num(p.fee)) ?? 0;
  if (fee < 0) fail('Phí không được âm');
  if (fee > 0 && k !== 'thu_khach') fail('Chỉ phiếu thu tiền khách mới có phí sàn/thu hộ');
  if (fee >= amt) fail('Phí sàn phải nhỏ hơn số tiền thu');
  const d = asDate(p.date) || today();
  checkDate(book, d);
  const fid = p.fund_id; let tfid = nz(p.to_fund_id); let pid = nz(p.party_id);
  if (!one(`select 1 from funds where id = ? and book_id = ? and active = 1`, fid, book)) fail('Chưa chọn quỹ / tài khoản hợp lệ');
  if (dir === 'chuyen') {
    if (!tfid || tfid === fid || !one(`select 1 from funds where id = ? and book_id = ?`, tfid, book)) fail('Chọn quỹ nhận khác quỹ chuyển');
  } else tfid = null;
  if (pt === 'kh' && (!pid || !one(`select 1 from customers where id = ? and book_id = ?`, pid, book))) fail('Chưa chọn khách hàng');
  if (pt === 'ncc' && (!pid || !one(`select 1 from suppliers where id = ? and book_id = ?`, pid, book))) fail('Chưa chọn nhà cung cấp');
  if (!pt) pid = null;

  const code = nextCode(book, dir === 'thu' ? 'PT' : dir === 'chi' ? 'PC' : 'CQ');
  const payId = uuid();
  insert('payments', { id: payId, book_id: book, code, pay_date: d, kind: k, direction: dir, fund_id: fid, to_fund_id: tfid, party_type: pt, party_id: pid,
    amount: amt, fee, method: p.method ?? null, note: p.note ?? null, created_by: ctx.uid, created_at: nowIso() });

  let al = Array.isArray(p.allocations) ? p.allocations : [];
  if (!al.length && bool(p.auto_allocate) === true &&['thu_khach', 'tra_ncc'].includes(k)) al = suggestAlloc(book, pt, pid, amt);
  let tot = 0;
  for (const a of al) {
    const dt = a.doc_type; const aa = rnd(num(a.amount));
    if (aa == null || aa <= 0) continue;
    if (!((['thu_khach', 'hoan_khach'].includes(k) && ['don_ban', 'no_dau_ky'].includes(dt))
      || (['tra_ncc', 'ncc_hoan'].includes(k) && ['don_mua', 'no_dau_ky', 'chi_phi'].includes(dt))
      || (k === 'chi_phi' && dt === 'chi_phi'))) fail(`Phiếu "${k}" không thể gắn với loại chứng từ này`);
    const doc = one(`select * from v_open_docs where book_id = ? and doc_type = ? and doc_id = ?`, book, dt, a.doc_id);
    if (!doc) fail('Không tìm thấy chứng từ cần thanh toán');
    if (pt && doc.party_id !== pid) fail(`Chứng từ ${doc.code} không thuộc đối tượng của phiếu`);
    if (k === 'chi_phi' && doc.party_id != null) fail(`Chi phí ${doc.code} ghi nợ nhà cung cấp — hãy dùng phiếu "Trả tiền nhà cung cấp"`);
    if (doc.status === 'huy' && !['hoan_khach', 'ncc_hoan'].includes(k)) fail(`Chứng từ ${doc.code} đã hủy`);
    if (['thu_khach', 'tra_ncc', 'chi_phi'].includes(k)) {
      const lim = doc.remaining_total;
      if (aa > lim) fail(`Số tiền gắn cho ${doc.code} (${aa}) vượt số còn phải trả (${Math.max(lim, 0)})`);
    } else {
      const lim = dt === 'no_dau_ky' ? -doc.remaining_total : doc.paid_net - doc.due_now;
      if (aa > lim) fail(`Số tiền hoàn cho ${doc.code} (${aa}) vượt số đã trả dư (${Math.max(lim, 0)})`);
    }
    insert('payment_allocations', { id: uuid(), payment_id: payId, book_id: book, doc_type: dt, doc_id: a.doc_id, amount: aa });
    tot += aa;
  }
  if (tot > amt) fail(`Tổng số tiền gắn vào chứng từ (${tot}) vượt số tiền phiếu (${amt})`);
  if (k === 'chi_phi' && tot !== amt) fail('Phiếu chi phí phải gắn đủ vào khoản chi phí. Khoản chi không có chứng từ hãy chọn "Chi khác".');

  if (fee > 0) {
    insertExpense(book, { exp_date: d, category: nz(p.fee_category) || setting(book, 'fee_category') || 'Phí sàn TMĐT',
      description: nz(p.fee_note) || 'Phí sàn / thu hộ trừ vào phiếu ' + code, amount: fee, settled_payment_id: payId });
  }
  return { id: payId, code, allocated: tot, unallocated: amt - tot };
}

export function create_payment(p) {
  const b = p.book_id;
  requirePerm(b, 'thu_chi');
  if (['gop_von', 'rut_von', 'chuyen_quy'].includes(p.kind)) requirePerm(b, 'owner');
  return once(p, b, 'create_payment', () => doPayment(b, p));
}

export function void_payment(p) {
  const pay = one(`select * from payments where id = ?`, p.id);
  if (!pay) fail('Không tìm thấy phiếu');
  requirePerm(pay.book_id, 'owner');
  if (pay.voided) return { ok: true };
  if (!trimNz(p.reason)) fail('Hãy ghi lý do hủy phiếu');
  checkDate(pay.book_id, pay.pay_date);
  run(`update payments set voided = 1, void_reason = ?, voided_at = ? where id = ?`, p.reason, nowIso(), pay.id);
  run(`update expenses set voided = 1, void_reason = ? where settled_payment_id = ?`, 'Hủy theo phiếu ' + pay.code, pay.id);
  // Giao dịch ngân hàng: khi mọi phiếu thu sinh ra từ nó đều đã hủy → chờ ghi lại
  for (const t of all(`select * from bank_txns where exists (select 1 from json_each(payment_ids) where value = ?)`, pay.id)) {
    const ids = json(t.payment_ids, []);
    if (!one(`select 1 from payments where id in (select value from json_each(?)) and voided = 0`, JSON.stringify(ids))) {
      run(`update bank_txns set status = 'cho_xu_ly', payment_ids = '[]', order_id = null, handled_by = null, handled_at = null, match_note = ? where id = ?`,
        `Phiếu thu ${pay.code} đã hủy — giao dịch chờ ghi lại`, t.id);
    }
  }
  // Vận đơn đã đối soát COD bằng phiếu này → hãng coi như vẫn đang giữ tiền
  for (const s of all(`select * from shipments where exists (select 1 from json_each(cod_payment_ids) where value = ?)`, pay.id)) {
    const rest = json(s.cod_payment_ids, []).filter((x) => x !== pay.id);
    run(`update shipments set cod_payment_ids = ?, cod_status = ?, cod_settled_at = ?, updated_at = ? where id = ?`,
      rest, rest.length ? s.cod_status : 'spx_dang_giu', rest.length ? s.cod_settled_at : null, nowIso(), s.id);
  }
  return { ok: true };
}

// ---------- CHI PHÍ ----------
export function save_expense(p) {
  const b = p.book_id;
  requirePerm(b, 'chi_phi');
  return once(p, b, 'save_expense', () => {
    const amt = rnd(num(p.amount));
    if (amt == null || amt <= 0) fail('Số tiền chi phí phải lớn hơn 0');
    if (!trimNz(p.category)) fail('Chọn khoản mục chi phí');
    const am = int(p.alloc_months) ?? 1;
    if (am < 1 || am > 60) fail('Số tháng phân bổ từ 1 đến 60');
    const d = asDate(p.date) || today();
    checkDate(b, d);
    const sid = nz(p.supplier_id); const eid = nz(p.id); const grp = trimNz(p.expense_group);
    if (sid && !one(`select 1 from suppliers where id = ? and book_id = ?`, sid, b)) fail('Không tìm thấy nhà cung cấp');
    let e;
    if (!eid) {
      e = insertExpense(b, { exp_date: d, category: trimNz(p.category), expense_group: grp, alloc_months: am, description: p.description ?? null,
        amount: amt, supplier_id: sid, note: p.note ?? null });
    } else {
      e = one(`select * from expenses where id = ? and book_id = ?`, eid, b);
      if (!e) fail('Không tìm thấy khoản chi phí');
      if (e.voided || e.settled_payment_id) fail('Không thể sửa khoản chi phí này');
      if (one(`select 1 from v_alloc_signed where doc_id = ?`, e.id)) fail('Chi phí đã thanh toán — hãy hủy phiếu chi trước khi sửa');
      checkDate(b, e.exp_date);
      run(`update expenses set exp_date = ?, category = ?, expense_group = ?, alloc_months = ?, description = ?, amount = ?, supplier_id = ?, note = ? where id = ?`,
        d, trimNz(p.category), grp || expenseGroupOf(b, p.category), am, p.description ?? null, amt, sid, p.note ?? null, e.id);
      e = one(`select * from expenses where id = ?`, e.id);
    }
    let pay = null;
    if (nz(p.pay_now?.fund_id)) {
      requirePerm(b, 'thu_chi');
      pay = doPayment(b, { kind: sid ? 'tra_ncc' : 'chi_phi', date: d, fund_id: p.pay_now.fund_id, party_id: sid, amount: amt, method: p.pay_now.method,
        note: 'Trả chi phí ' + e.code + (e.description != null ? ' – ' + e.description : ''),
        allocations: [{ doc_type: 'chi_phi', doc_id: e.id, amount: amt }] });
    }
    return { id: e.id, code: e.code, payment_code: pay?.code ?? null, expense_group: e.expense_group };
  });
}

export function void_expense(p) {
  const e = one(`select * from expenses where id = ?`, p.id);
  if (!e) fail('Không tìm thấy chi phí');
  requirePerm(e.book_id, 'owner');
  if (e.settled_payment_id) fail('Phí sàn này gắn với phiếu thu — hãy hủy phiếu thu');
  if (one(`select 1 from v_alloc_signed where doc_id = ?`, e.id)) fail('Chi phí đã thanh toán — hãy hủy phiếu chi trước');
  if (!trimNz(p.reason)) fail('Hãy ghi lý do hủy');
  checkDate(e.book_id, e.exp_date);
  run(`update expenses set voided = 1, void_reason = ? where id = ?`, p.reason, e.id);
  return { ok: true };
}
