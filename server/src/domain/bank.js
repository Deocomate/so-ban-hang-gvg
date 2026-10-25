// Tiền về tài khoản (SePay / Casso): tự gạch nợ đơn theo mã đơn trong nội dung chuyển khoản, ghi tay, bỏ qua.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, nz, trimNz, rnd, asTs, today, vnDate, json, vnd } from '../lib/context.js';
import { requirePerm, once, bookSettings } from './access.js';
import { normAcct } from './books.js';
import { doPayment } from './cash.js';
import { notify } from './notify.js';
import { ingestTracking } from './shipping.js';

// Quỹ nhận tiền chuyển khoản của sổ
export function bankFund(book) {
  const funds = all(`select id, name from funds where book_id = ? and active = 1 order by sort`, book);
  const cfg = bookSettings(book).bank?.fund_id;
  return funds.find((f) => f.id === cfg)?.id
    ?? funds.find((f) => /ngân hàng|tài khoản|bank/i.test(f.name.toLowerCase()))?.id
    ?? funds[funds.length - 1]?.id ?? null;
}

const txnDate = (t) => { const d = vnDate(t.txn_at); return d < today() ? d : today(); };

// Ghi tiền khách chuyển vào 1 đơn (dùng cho tự động và ghi tay)
function postBankToOrder(txnId, book, orderId, auto) {
  const t = one(`select * from bank_txns where id = ?`, txnId);
  const o = one(`select * from v_sales_orders where id = ? and book_id = ?`, orderId, book);
  if (!o) fail('Không tìm thấy đơn hàng');
  if (o.status !== 'xac_nhan') fail(`Đơn ${o.code} chưa xác nhận hoặc đã hủy`);
  const rem = one(`select remaining_total from v_open_docs where doc_type = 'don_ban' and doc_id = ?`, o.id)?.remaining_total ?? 0;
  const alloc = Math.min(t.amount, Math.max(rem, 0));
  const fid = bankFund(book);
  if (!fid) fail('Sổ chưa có quỹ tài khoản ngân hàng');
  const pay = doPayment(book, { kind: 'thu_khach', party_id: o.customer_id, fund_id: fid, date: txnDate(t), amount: t.amount, method: 'Chuyển khoản',
    note: (auto ? 'Tự động ghi khi tiền về TK' : 'Ghi từ tiền về TK') + ' · ND: ' + String(t.content ?? '').slice(0, 120),
    allocations: alloc > 0 ? [{ doc_type: 'don_ban', doc_id: o.id, amount: alloc }] : [] });
  run(`update bank_txns set status = 'da_ghi', book_id = ?, order_id = ?, payment_ids = ?, handled_by = ?, handled_at = ?, match_note = ? where id = ?`,
    book, o.id, [pay.id], ctx.uid, nowIso(),
    (auto ? 'Tự khớp theo mã đơn ' : 'Ghi tay vào đơn ') + o.code + (t.amount > alloc ? ` · khách trả dư ${vnd(t.amount - alloc)} (tính là trả trước)` : ''), t.id);
  return { payment_code: pay.code, order_code: o.code, customer: o.customer_name, allocated: alloc, excess: t.amount - alloc, remaining_after: Math.max(rem - alloc, 0) };
}

// Nhận 1 giao dịch từ SePay/Casso — chỉ máy chủ gọi.
// p = {provider, ext_id, account_no, amount, direction:'in'|'out', content, txn_at, ref, counter_name, code?, raw, demo?}
export function ingestBankTxn(p) {
  const amt = Math.abs(rnd(num(p.amount)) ?? 0);
  if (!amt) fail('Số tiền giao dịch không hợp lệ');
  const ex = one(`select id, status from bank_txns where provider = ? and ext_id = ?`, String(p.provider), String(p.ext_id));
  if (ex) return { duplicate: true, id: ex.id, status: ex.status };
  const acct = normAcct(p.account_no); const dir = p.direction || 'in';

  // Sổ nào dùng tài khoản này
  const books = all(`select id, short_name, is_demo, settings from books order by created_at, rowid`);
  let cands = acct ? books.filter((b) => normAcct(json(b.settings).bank?.account_no) === acct) : [];
  if (!cands.length) cands = books.filter((b) => !b.is_demo || p.demo === true);
  const id = uuid();
  insert('bank_txns', { id, provider: String(p.provider), ext_id: String(p.ext_id), account_no: acct, amount: amt, direction: dir, content: p.content ?? null,
    txn_at: asTs(p.txn_at) || nowIso(), ref: p.ref ?? null, counter_name: p.counter_name ?? null, candidate_books: cands.map((b) => b.id), raw: p.raw ?? null,
    book_id: cands.length === 1 ? cands[0].id : null, status: dir === 'out' ? 'bo_qua' : 'cho_xu_ly', match_note: dir === 'out' ? 'Tiền ra khỏi tài khoản' : null,
    received_at: nowIso() });
  if (dir === 'out') return { id, status: 'bo_qua' };

  // Tìm mã đơn trong nội dung: <mã sổ>DH<5 số>, ví dụ THDH00012 / VG DH00007
  const norm = `${p.code ?? ''} ${p.content ?? ''}`.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  let foundBook = null, foundOrder = null;
  for (const b of cands) {
    let m = norm.match(new RegExp(String(b.short_name).toUpperCase() + 'DH(\\d{5})(?!\\d)'));
    if (!m && cands.length === 1) m = norm.match(/DH(\d{5})(?!\d)/);
    if (m) {
      const o = one(`select id from sales_orders where book_id = ? and code = ?`, b.id, 'DH' + m[1]);
      if (o) { foundBook = b.id; foundOrder = o.id; break; }
    }
  }

  if (foundOrder) {
    try {
      const res = ctx.db.transaction(() => postBankToOrder(id, foundBook, foundOrder, true))();
      notify(foundBook, 'tien_ve', 'good', `💰 +${vnd(amt)} · ${res.order_code}`,
        `${res.customer ?? ''} chuyển khoản. Đã gạch nợ đơn ${res.order_code}`
        + (res.remaining_after > 0 ? `, đơn còn nợ ${vnd(res.remaining_after)}` : ', đơn đã thu đủ')
        + (res.excess > 0 ? `. Khách trả dư ${vnd(res.excess)} (tính là trả trước)` : ''),
        'order:' + foundOrder, 'bank:' + id);
      return { id, status: 'da_ghi', ...res };
    } catch (e) {
      run(`update bank_txns set book_id = ?, order_id = ?, match_note = ? where id = ?`, foundBook, foundOrder, 'Có mã đơn nhưng chưa ghi được tự động: ' + e.message, id);
    }
  } else {
    run(`update bank_txns set match_note = ? where id = ?`,
      /(SPX|SHOPEEEXPRESS|SHOPEE)/.test(norm) ? 'Có thể là tiền COD từ Shopee Express — dùng “Đối soát COD”'
        : /(BESTEXPRESS|BESTINC|BEST)/.test(norm) ? 'Có thể là tiền COD từ BEST Express — dùng “Đối soát COD”'
          : 'Không tìm thấy mã đơn trong nội dung chuyển khoản', id);
  }

  const t = one(`select * from bank_txns where id = ?`, id);
  for (const bid of t.book_id ? [t.book_id] : json(t.candidate_books, [])) {
    notify(bid, 'tien_ve', 'warn', `💰 +${vnd(amt)} · chưa khớp đơn`,
      (t.counter_name != null ? t.counter_name + ' · ' : '') + `ND: “${String(t.content ?? '').slice(0, 90)}”. ${t.match_note}. Mở “Tiền về TK” để ghi vào đơn.`,
      'bank:' + id, `bank:${id}:${bid}`);
  }
  return { id, status: t.status, note: t.match_note };
}

const visibleTxn = (b, id) => {
  const t = one(`select * from bank_txns where id = ?`, id);
  if (!t || !(t.book_id === b || (t.book_id == null && json(t.candidate_books, []).includes(b)))) fail('Không tìm thấy giao dịch');
  return t;
};

// Ghi tay giao dịch chưa khớp vào 1 đơn hoặc vào công nợ chung của 1 khách
export function assign_bank_txn(p) {
  const b = p.book_id;
  requirePerm(b, 'thu_chi');
  return once(p, b, 'assign_bank_txn', () => {
    const t = visibleTxn(b, p.id);
    if (t.status !== 'cho_xu_ly') fail('Giao dịch này đã được xử lý');
    if (nz(p.order_id)) return postBankToOrder(t.id, b, p.order_id, false);
    if (!nz(p.customer_id)) fail('Chọn đơn hàng hoặc khách hàng');
    const pay = doPayment(b, { kind: 'thu_khach', party_id: p.customer_id, fund_id: bankFund(b), date: txnDate(t), amount: t.amount, method: 'Chuyển khoản',
      auto_allocate: true, note: 'Ghi từ tiền về TK · ND: ' + String(t.content ?? '').slice(0, 120) });
    run(`update bank_txns set status = 'da_ghi', book_id = ?, payment_ids = ?, handled_by = ?, handled_at = ?, match_note = ? where id = ?`,
      b, [pay.id], ctx.uid, nowIso(), 'Ghi tay vào công nợ khách (tự trừ các khoản nợ cũ nhất trước)', t.id);
    return { payment_code: pay.code };
  });
}

export function ignore_bank_txn(p) {
  const b = p.book_id;
  requirePerm(b, 'thu_chi');
  const t = visibleTxn(b, p.id);
  if (t.status === 'da_ghi') fail('Giao dịch đã ghi vào sổ — muốn bỏ thì hủy phiếu thu tương ứng');
  if (!trimNz(p.reason)) fail('Ghi lý do (vd. tiền cá nhân, chuyển giữa tài khoản…)');
  run(`update bank_txns set status = 'bo_qua', book_id = ?, match_note = ?, handled_by = ?, handled_at = ? where id = ?`,
    b, 'Bỏ qua: ' + p.reason, ctx.uid, nowIso(), t.id);
  return { ok: true };
}

// Sổ dữ liệu mẫu: giả lập tiền về / hãng vận chuyển cập nhật
export function demo_simulate(p) {
  const b = p.book_id;
  requirePerm(b, 'owner');
  const bk = one(`select * from books where id = ?`, b);
  if (!bk.is_demo) fail('Chỉ dùng trong sổ dữ liệu mẫu');
  if (p.what === 'bank') {
    return ingestBankTxn({ provider: 'demo', ext_id: uuid(), demo: true, account_no: json(bk.settings).bank?.account_no, amount: p.amount, direction: 'in',
      content: p.content, counter_name: nz(p.counter_name), txn_at: nowIso() });
  }
  const s = one(`select * from shipments where id = ? and book_id = ?`, p.shipment_id, b);
  if (!s) fail('Không tìm thấy vận đơn');
  return ingestTracking({ tracking_no: s.tracking_no, mapped_status: p.status, events: [{ at: nowIso(), detail: p.detail, location: p.location }] });
}
