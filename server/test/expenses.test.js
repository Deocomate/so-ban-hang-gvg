// Kiểm thử: chi phí phân nhóm + phân bổ dần — chạy: node test/expenses.test.js
import { freshDb, makeApi, suite, finish, rid, TODAY as today } from './harness.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();
const TODAY = today();
const addM = (iso, n) => { const t = new Date(iso.slice(0, 7) + '-01T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + n); return t.toISOString().slice(0, 10); };
const mEnd = (iso) => { const t = new Date(addM(iso, 1) + 'T00:00:00Z'); t.setUTCDate(0); return t.toISOString().slice(0, 10); };
const owner = await api.user('chu@gomsu.vn'); const staff = await api.user('nv@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', role: 'staff', perms: { chi_phi: true, thu_chi: true } });
const fund = (await api.q('funds', TH)).find((f) => f.name === 'Tiền mặt').id;
const exp = async (p) => api.call('save_expense', { book_id: TH, request_id: rid(), ...p });
const one = async (id) => api.one('expenses', TH, [['id', 'eq', id]]);
const pl = async (from, to) => api.call('rpt_overview', { book_id: TH, from, to });

G('1. Danh mục 2 cấp');
const st = books.find((b) => b.id === TH).settings;
C('Có 7 nhóm chi phí', st.expense_cats.map((g) => g.group), ['Mặt bằng', 'Điện, nước, internet', 'Công cụ dụng cụ', 'Marketing', 'Chi phí bán hàng', 'Nhân sự', 'Quản lý & khác']);
C('Nhóm Marketing có quảng cáo Facebook, TikTok', st.expense_cats.find((g) => g.group === 'Marketing').items.slice(0, 2), ['Quảng cáo Facebook', 'Quảng cáo TikTok']);
const cases = [['Thuê nhà / cửa hàng', 'Mặt bằng'], ['Tiền điện', 'Điện, nước, internet'], ['Kệ, tủ, bàn trưng bày', 'Công cụ dụng cụ'], ['Quảng cáo TikTok', 'Marketing'],
  ['Bao bì, đóng gói', 'Chi phí bán hàng'], ['Lương', 'Nhân sự'], ['Phần mềm, ứng dụng', 'Quản lý & khác'],
  ['Thuê mặt bằng', 'Mặt bằng'], ['Quảng cáo - Marketing', 'Marketing'], ['khoản gì đó mới', 'Quản lý & khác']];
for (const [cat, g] of cases) { const r = await exp({ date: TODAY, category: cat, amount: 100000 }); C(`“${cat}” → ${g}`, (await one(r.id)).expense_group, g); }
const ed = await exp({ date: TODAY, category: 'Tiền điện', amount: 500000 });
await exp({ id: ed.id, date: TODAY, category: 'Tiền nước', amount: 500000 });
C('Sửa khoản mục → nhóm tự cập nhật', (await one(ed.id)).expense_group, 'Điện, nước, internet');
await exp({ id: ed.id, date: TODAY, category: 'Quảng cáo Facebook', amount: 500000 });
C('Đổi sang khoản mục nhóm khác → đổi nhóm', (await one(ed.id)).expense_group, 'Marketing');
// Phí sàn tự sinh từ phiếu thu cũng vào đúng nhóm
const kh = (await api.call('save_party', { book_id: TH, type: 'kh', name: 'Khách TikTok' })).id;
const p1 = await api.call('create_payment', { book_id: TH, request_id: rid(), kind: 'thu_khach', fund_id: fund, party_id: kh, amount: 1000000, fee: 80000, date: TODAY });
const feeRow = (await api.q('expenses', TH)).find((e) => e.settled_payment_id && e.amount === 80000);
C('Phí sàn tự sinh → Chi phí bán hàng · Phí sàn TMĐT', [feeRow.category, feeRow.expense_group], ['Phí sàn TMĐT', 'Chi phí bán hàng']);

G('2. Phân bổ dần (công cụ dụng cụ, tiền nhà trả trước)');
const m0 = addM(TODAY, -2); const d0 = m0.slice(0, 8) + '15';     // ngày 15 của 2 tháng trước
const cam = await exp({ date: d0, category: 'Thiết bị (máy in, camera, đèn, điện thoại livestream)', amount: 12000000, alloc_months: 12, description: 'Camera + đèn livestream', pay_now: { fund_id: fund } });
const cv = await one(cam.id);
C('Lưu số tháng phân bổ và tháng kết thúc', [cv.alloc_months, cv.alloc_end], [12, addM(d0, 11)]);
C('Trả tiền 1 lần đủ 12.000.000 (không chia nhỏ khi trả)', [cv.paid, cv.unpaid], [12000000, 0]);
const parts = await api.sql(`select alloc_date d, amount a from v_expense_alloc where expense_id = ? order by part_no`, [cam.id]);
C('Chia 12 phần, phần đầu đúng ngày phát sinh', [parts.length, parts[0].d, parts[1].d], [12, d0, addM(d0, 1)]);
C('Mỗi tháng 1.000.000, cộng lại đủ 12.000.000', [parts[0].a, parts.reduce((s, x) => s + x.a, 0)], [1000000, 12000000]);
const mp0 = await pl(m0, mEnd(m0)); const mp1 = await pl(addM(m0, 1), mEnd(addM(m0, 1)));
C('Lãi lỗ tháng mua chỉ tính 1.000.000 chi phí camera', mp0.expenses, 1000000);
C('Tháng sau tiếp tục tính 1.000.000', mp1.expenses, 1000000);
C('Tiền ra khỏi quỹ tháng mua = 12.000.000 (dòng tiền thật)', mp0.cash_out, 12000000);
const rent = await exp({ date: d0, category: 'Thuê nhà / cửa hàng', amount: 10000000, alloc_months: 3, description: 'Tiền nhà trả trước 3 tháng' });
const rp = await api.sql(`select amount a from v_expense_alloc where expense_id = ? order by part_no`, [rent.id]);
C('10.000.000 / 3 tháng: 3.333.333 + 3.333.333 + 3.333.334 (không lệch đồng nào)', rp.map((x) => x.a), [3333333, 3333333, 3333334]);
await E('Phân bổ 0 tháng bị chặn', () => exp({ date: TODAY, category: 'Lương', amount: 1000, alloc_months: 0 }), 'phân bổ');
await E('Phân bổ 61 tháng bị chặn', () => exp({ date: TODAY, category: 'Lương', amount: 1000, alloc_months: 61 }), 'phân bổ');

G('3. Báo cáo chi phí khớp lãi lỗ');
const from = m0, to = mEnd(TODAY);
const ov = await pl(from, to);
const rptItem = await api.call('rpt_expenses', { book_id: TH, from, to });
const rptMonth = await api.call('rpt_expenses', { book_id: TH, from, to, by: 'month' });
const drill = await api.call('rpt_drill', { book_id: TH, metric: 'expenses', from, to });
const sum = (a) => a.reduce((s, x) => s + Number(x.amount), 0);
C('Báo cáo theo khoản mục = chi phí trong lãi lỗ', sum(rptItem.filter((x) => x.grp !== 'Hao hụt kho')), ov.expenses);
C('Báo cáo theo tháng = chi phí trong lãi lỗ', sum(rptMonth.filter((x) => x.grp !== 'Hao hụt kho')), ov.expenses);
C('Bấm xem chi tiết chi phí: tổng khớp', sum(drill), ov.expenses);
C('Chi tiết ghi rõ “phân bổ 1/12”', drill.some((x) => /phân bổ 1\/12/.test(x.label)), true);
C('Mỗi dòng báo cáo có nhóm', rptItem.every((x) => x.grp), true);
const mk = rptItem.filter((x) => x.grp === 'Marketing');
C('Nhóm Marketing tách theo từng khoản (Facebook, TikTok…)', mk.map((x) => x.name).sort(), ['Quảng cáo - Marketing', 'Quảng cáo Facebook', 'Quảng cáo TikTok']);
const ccdc = rptMonth.filter((x) => x.grp === 'Công cụ dụng cụ');
C('Công cụ dụng cụ theo tháng: camera 1.000.000/tháng; tháng này thêm kệ 100.000', ccdc.map((x) => x.amount), [1000000, 1000000, 1100000]);
api.as(staff);
await E('Nhân viên không có quyền xem giá vốn không xem báo cáo chi phí', () => api.call('rpt_expenses', { book_id: TH, from, to }), 'quyền');
C('Nhân viên có quyền chi phí vẫn ghi được chi phí theo nhóm', (await exp({ date: TODAY, category: 'Văn phòng phẩm', amount: 50000 })).expense_group, 'Quản lý & khác');
api.as(owner);

finish('Chi phí phân nhóm + phân bổ dần');
