// Kiểm thử: nhân viên, ca, lịch làm việc, chấm công, lương theo ca / giờ / ngày công / cố định, hoa hồng, thưởng, bảng lương, báo cáo
import { freshDb, makeApi, suite, finish, rid, TODAY, daysAgo } from './harness.js';

const { G, C, E } = suite();
freshDb();
const api = makeApi();
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const d0 = daysAgo(6); const d1 = daysAgo(5); const today = TODAY();
const fund = (await api.q('funds', TH))[0].id;
const line = async (ps, code) => (await api.q('paysheet_lines', TH, [['paysheet_id', 'eq', ps]])).find((l) => l.employee_code === code);

G('Thiết lập');
await api.call('update_book_settings', { book_id: TH, settings: { staff_settings: { std_days: 26, std_hours: 8, ot_rate: 1.5, late_grace: 5, paid_leave: true } } });
const ca = (await api.call('save_shift', { book_id: TH, name: 'Ca hành chính', start_time: '08:00', end_time: '17:00', hours: 8 })).id;
await E('Giờ ca sai bị chặn', () => api.call('save_shift', { book_id: TH, name: 'X', start_time: '8h', end_time: '17:00' }), 'HH:MM');
const caToi = await api.call('save_shift', { book_id: TH, name: 'Ca tối', start_time: '18:00', end_time: '22:00' });
C('Ca tự tính số giờ', (await api.one('shifts', TH, [['id', 'eq', caToi.id]])).hours, 4);

G('Hồ sơ và cách tính lương');
const P = (await api.call('save_product', { book_id: TH, name: 'Bình hút lộc', price1: 150000 })).id;
const Q = (await api.call('save_product', { book_id: TH, name: 'Đĩa sứ', price1: 100000 })).id;
await api.call('adjust_stock', { book_id: TH, date: d0, reason: 'dau_ky', lines: [{ product_id: P, qty_delta: 100, unit_cost: 80000 }, { product_id: Q, qty_delta: 100, unit_cost: 50000 }] });
const hh = (await api.call('save_commission_table', { book_id: TH, name: 'Hoa hồng bán lẻ', rules: [
  { scope: 'all', basis: 'doanh_thu', value: 2 }, { scope: 'product', target: P, basis: 'so_luong', value: 10000 }] })).id;
await E('Hoa hồng quá 100% bị chặn', () => api.call('save_commission_table', { book_id: TH, name: 'X', rules: [{ scope: 'all', basis: 'doanh_thu', value: 120 }] }), 'Mức hoa hồng');
const A = await api.call('save_employee', { book_id: TH, name: 'Trần A', pay: { type: 'ngay_cong', rate: 6500000,
  allowances: [{ name: 'Ăn trưa', amount: 30000, per: 'ngay' }], deductions: [{ name: 'Đi muộn', amount: 50000, per: 'lan_muon' }] } });
const B = await api.call('save_employee', { book_id: TH, name: 'Lê B', pay: { type: 'ca', rate: 200000 } });
const Cc = await api.call('save_employee', { book_id: TH, name: 'Phạm C', pay: { type: 'gio', rate: 30000 } });
const D = await api.call('save_employee', { book_id: TH, name: 'Nguyễn D', title: 'Bán hàng', pay: { type: 'co_dinh', rate: 5000000, ot: false, commission_id: hh,
  bonus: [{ from: 5000000, type: 'vnd', value: 300000 }, { from: 1000000, type: 'pct', value: 1 }] } });
C('Mã nhân viên tự tăng', [A.code, D.code], ['NV00001', 'NV00004']);
await E('Loại lương sai bị chặn', () => api.call('save_employee', { book_id: TH, name: 'X', pay: { type: 'khoan' } }), 'Loại lương');

G('Lịch làm việc và chấm công');
await api.call('save_schedule', { book_id: TH, employee_id: A.id, items: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ shift_id: ca, weekday: w })) });
const fill = await api.call('fill_timesheets', { book_id: TH, from: d0, to: today, employee_ids: [A.id] });
C('Chấm theo lịch tạo đủ 7 ngày', fill.created, 7);
C('Chấm lại không tạo trùng', (await api.call('fill_timesheets', { book_id: TH, from: d0, to: today })).created, 0);
await api.call('save_timesheet', { book_id: TH, employee_id: A.id, work_date: d0, shift_id: ca, status: 'nghi_phep' });
await api.call('save_timesheet', { book_id: TH, employee_id: A.id, work_date: d1, shift_id: ca, status: 'di_lam', check_in: '08:20', check_out: '17:00', ot_hours: 2 });
const t1 = await api.one('timesheets', TH, [['employee_id', 'eq', A.id], ['work_date', 'eq', d1]]);
C('Đi muộn 20 phút, giờ làm theo giờ vào ra', [t1.late_minutes, t1.hours, t1.status_label], [20, 8.67, 'Đi làm']);
for (const d of [d0, d1, daysAgo(4)]) await api.call('save_timesheet', { book_id: TH, employee_id: B.id, work_date: d, status: 'di_lam' });
for (const d of [d0, d1]) await api.call('save_timesheet', { book_id: TH, employee_id: Cc.id, work_date: d, status: 'di_lam', check_in: '08:00', check_out: '12:00' });
await E('Không chấm công ngày tương lai', () => api.call('save_timesheet', { book_id: TH, employee_id: B.id, work_date: '2099-01-01' }), 'chưa tới');

G('Doanh số người bán');
const kh = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách lẻ D' })).id;
await api.call('save_sales_order', { book_id: TH, request_id: rid(), customer_id: kh, order_date: today, staff: 'nguyễn d ', deliver_now: true,
  lines: [{ product_id: P, qty: 10, unit_price: 150000 }, { product_id: Q, qty: 2, unit_price: 100000 }] });

G('Bảng lương');
const ps = await api.call('create_paysheet', { book_id: TH, name: 'Lương tuần thử', from: d0, to: today });
C('Bảng lương có 4 người', ps.lines, 4);
const la = await line(ps.id, A.code);
C('Ngày công chuẩn: 7 ngày (gồm 1 ngày phép) × 250.000', la.base, 1750000);
C('Làm thêm 2 giờ × 31.250 × 1,5', la.ot, 93750);
C('Phụ cấp ăn trưa theo ngày đi làm, trừ 1 lần đi muộn', [la.allowance, la.deduction], [180000, 50000]);
C('Tổng lương A', la.total, 1973750);
C('Theo ca: 3 ca × 200.000', (await line(ps.id, B.code)).total, 600000);
C('Theo giờ: 8 giờ × 30.000', (await line(ps.id, Cc.code)).total, 240000);
const ld = await line(ps.id, D.code);
C('Cố định + hoa hồng (10 × 10.000 + 2% × 200.000) + thưởng 1% doanh thu', [ld.base, ld.commission, ld.bonus, ld.total], [5000000, 104000, 17000, 5121000]);
C('Chi tiết ghi doanh số', ld.breakdown.revenue, 1700000);
await api.call('adjust_paysheet_line', { book_id: TH, id: la.id, adjust: 26250, note: 'Thưởng chuyên cần' });
await api.call('recalc_paysheet', { book_id: TH, id: ps.id });
const la2 = await line(ps.id, A.code);
C('Tính lại giữ khoản cộng tay', [la2.adjust, la2.total, la2.breakdown.adjust_note], [26250, 2000000, 'Thưởng chuyên cần']);
await api.call('close_paysheet', { book_id: TH, id: ps.id });
const sheet = await api.one('paysheets', TH, [['id', 'eq', ps.id]]);
C('Chốt: tổng và còn phải trả', [sheet.status_label, sheet.total, sheet.unpaid], ['Đã chốt', 7961000, 7961000]);
const exA = await api.one('expenses', TH, [['id', 'eq', (await line(ps.id, A.code)).expense_id]]);
C('Chốt sinh chi phí Lương nhóm Nhân sự', [exA.category, exA.expense_group, exA.amount], ['Lương', 'Nhân sự', 2000000]);
await E('Không sửa chấm công trong kỳ đã chốt', () => api.call('save_timesheet', { book_id: TH, employee_id: A.id, work_date: d1, shift_id: ca, status: 'nghi_phep' }), 'đã chốt');
await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'chi_phi', fund_id: fund, amount: 2000000, date: today, allocations: [{ doc_type: 'chi_phi', doc_id: exA.id, amount: 2000000 }] });
const la3 = await line(ps.id, A.code);
C('Trả lương A', [la3.paid, la3.unpaid], [2000000, 0]);
await E('Đã trả lương thì không hủy được', () => api.call('cancel_paysheet', { book_id: TH, id: ps.id }), 'hủy phiếu chi');
const pl = await api.call('rpt_overview', { book_id: TH, from: d0, to: today });
C('Lương vào chi phí vận hành', pl.expenses, 7961000);

const thang = await api.call('create_paysheet', { book_id: TH, name: 'Lương cả tháng', from: d0, to: '2099-12-31', employee_ids: [B.id] });
await api.call('close_paysheet', { book_id: TH, id: thang.id });
const exT = await api.one('expenses', TH, [['id', 'eq', (await line(thang.id, B.code)).expense_id]]);
C('Chốt trước hết kỳ: chi phí ghi ngày không quá hôm nay', exT.exp_date <= today, true);
await api.call('cancel_paysheet', { book_id: TH, id: thang.id });
C('Hủy bảng lương chưa trả: chi phí bị hủy', (await api.one('expenses', TH, [['id', 'eq', exT.id]])).voided, true);

G('Báo cáo');
const rs = await api.call('rpt_staff', { book_id: TH, from: d0, to: today });
C('Báo cáo nhân viên: doanh số, lãi gộp, hoa hồng của D', (({ orders, revenue, gross_profit, commission }) => [orders, revenue, gross_profit, commission])(rs.find((x) => x.code === D.code)), [1, 1700000, 800000, 104000]);
const eod = await api.call('rpt_end_of_day', { book_id: TH, date: today });
C('Cuối ngày: doanh thu, số lần giao, chi lương', [eod.summary.revenue, eod.summary.deliveries, eod.summary.cash_out], [1700000, 1, 2000000]);
C('Cuối ngày: hàng bán theo mặt hàng', eod.products.map((x) => [x.name, x.qty]), [['Bình hút lộc', 10], ['Đĩa sứ', 2]]);

G('Quyền');
const nv = await api.user('nv@gomsu.vn');
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', role: 'staff', perms: { cham_cong: true } });
const F = await api.call('save_employee', { book_id: TH, name: 'Võ F', pay: { type: 'ca', rate: 180000 } });
api.as(nv);
await api.call('save_timesheet', { book_id: TH, employee_id: F.id, work_date: today, status: 'di_lam' });
C('Nhân viên có quyền chấm công chấm được', (await api.q('timesheets', TH, [['employee_id', 'eq', F.id]])).length, 1);
C('Nhân viên không xem được cách tính lương', (await api.one('employees', TH, [['id', 'eq', A.id]])).pay ?? null, null);
await E('Nhân viên không lập bảng lương', () => api.call('create_paysheet', { book_id: TH, from: d0, to: today }), 'chủ cửa hàng');
await E('Nhân viên không xem bảng lương', () => api.q('paysheets', TH), 'chủ cửa hàng');

finish('Nhân viên · chấm công · bảng lương');
