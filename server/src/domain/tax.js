// Kho hóa đơn đầu vào / đầu ra (dùng chung cho Mua hàng và Thuế HKD) và đối soát doanh thu theo tháng.
import { ctx, fail, one, all, run, insert, uuid, nowIso, num, nz, trimNz, rnd, asDate, today } from '../lib/context.js';
import { requirePerm, bookSettings } from './access.js';
import { calcPl } from './reports.js';

export function save_tax_invoice(p) {
  const b = p.book_id;
  requirePerm(b, p.direction === 'vao' ? 'nhap_hang' : 'ban_hang');
  if (!['vao', 'ra'].includes(p.direction)) fail('Loại hóa đơn không hợp lệ');
  if (!trimNz(p.inv_no)) fail('Thiếu số hóa đơn');
  const amount = rnd(num(p.amount) ?? 0); const rate = num(p.vat_rate) ?? 0;
  if (amount <= 0) fail('Tiền hóa đơn phải lớn hơn 0');
  if (rate < 0 || rate > 100) fail('Thuế suất VAT không hợp lệ');
  const f = { direction: p.direction, inv_no: trimNz(p.inv_no), inv_date: asDate(p.inv_date) || today(), party_name: p.party_name ?? null, party_tax: p.party_tax ?? null,
    profile_id: nz(p.profile_id), amount, vat_rate: rate, vat_amount: rnd(num(p.vat_amount) ?? amount * rate / 100), supplier_id: nz(p.supplier_id), order_id: nz(p.order_id),
    category: p.category ?? null, note: p.note ?? null };
  if (nz(p.id)) {
    const keys = Object.keys(f);
    if (!run(`update tax_invoices set ${keys.map((k) => `${k} = ?`).join(', ')} where id = ? and book_id = ?`, ...keys.map((k) => f[k]), p.id, b).changes) fail('Không tìm thấy hóa đơn');
    return { id: p.id };
  }
  const id = uuid();
  insert('tax_invoices', { id, book_id: b, ...f, created_by: ctx.uid, created_at: nowIso() });
  return { id };
}

export function void_tax_invoice(p) {
  const t = one(`select * from tax_invoices where id = ?`, p.id);
  if (!t) fail('Không tìm thấy hóa đơn');
  requirePerm(t.book_id, 'owner');
  run(`update tax_invoices set voided = 1 where id = ?`, t.id);
  return { ok: true };
}

// p = {year, profile_id}: theo từng tháng, so doanh thu trên sổ với hóa đơn đầu ra và ước tính thuế.
// Thuế là số ước tính để theo dõi, thuế suất lấy từ Cài đặt; không thay cho tờ khai.
export function rpt_tax(p) {
  const b = p.book_id;
  requirePerm(b, 'xem_bao_cao');
  const y = String(Number(p.year) || today().slice(0, 4));
  const s = bookSettings(b); const vatRate = Number(s.vat_rate ?? 0) || 0;
  const inv = all(`select substr(inv_date, 1, 7) as m, direction, sum(amount) as amount, sum(vat_amount) as vat from tax_invoices
    where book_id = ? and voided = 0 and substr(inv_date, 1, 4) = ? and (? is null or profile_id = ? or profile_id is null) group by 1, 2`, b, y, nz(p.profile_id), nz(p.profile_id));
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const m = `${y}-${String(i).padStart(2, '0')}`;
    if (m > today().slice(0, 7)) break;
    const end = new Date(Date.UTC(Number(y), i, 0)).toISOString().slice(0, 10);
    const pl = calcPl(b, `${m}-01`, end);
    const row = (d) => inv.find((x) => x.m === m && x.direction === d) || { amount: 0, vat: 0 };
    const out = row('ra'); const inp = row('vao');
    months.push({ month: m, revenue: pl.revenue, out_amount: out.amount, out_vat: out.vat, in_amount: inp.amount, in_vat: inp.vat, gap: pl.revenue - out.amount, tax_est: rnd(out.amount * vatRate) });
  }
  const sum = (k) => months.reduce((t, r) => t + r[k], 0);
  return { months, totals: Object.fromEntries(['revenue', 'out_amount', 'out_vat', 'in_amount', 'in_vat', 'gap', 'tax_est'].map((k) => [k, sum(k)])), vat_rate: vatRate };
}
