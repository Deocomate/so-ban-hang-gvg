// Kiểm thử: chia chi phí cho nhiều thương hiệu + chi phí định kỳ hằng tháng — chạy: node test/expense-split-recurring.test.js
import { freshDb, makeApi, suite, finish, rid, TODAY as today } from './harness.js';
import { callService } from '../src/domain/rpc.js';
import { runAllRecurring, dueDate } from '../src/domain/expense-recurring.js';

freshDb();
const api = makeApi();
const { G, C, E } = suite();
const TODAY = today();
const addM = (iso, n) => { const t = new Date(iso.slice(0, 7) + '-01T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + n); return t.toISOString().slice(0, 7); };
const owner = await api.user('chu@gomsu.vn'); const staff = await api.user('nv@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const id = (s) => books.find((b) => b.short_name === s).id;
const TH = id('TH'); const VG = id('VG'); const AN = id('AN');
const fund = (await api.q('funds', TH)).find((f) => f.name === 'Tiền mặt').id;
const exp = async (p) => api.call('save_expense', { book_id: TH, request_id: rid(), ...p });
const rows = async (b, f = []) => api.q('expenses', b, f);
const pl = async (b) => (await api.call('rpt_overview', { book_id: b, from: TODAY.slice(0, 8) + '01', to: TODAY })).expenses;
const plBefore = { TH: await pl(TH), VG: await pl(VG), AN: await pl(AN) };

G('1. Chia 1 khoản lương cho 3 thương hiệu');
const sal = await exp({ date: TODAY, category: 'Lương', amount: 10000000, description: 'Lương kế toán', pay_now: { fund_id: fund },
  split: [{ book_id: TH, pct: 50 }, { book_id: VG, pct: 30 }, { book_id: AN, pct: 20 }] });
C('Báo đã chia 3 phần', sal.split, 3);
const root = (await rows(TH, [['id', 'eq', sal.id]]))[0];
C('Khoản gốc giữ đủ 10.000.000, đã trả', [root.amount, root.paid, root.unpaid], [10000000, 10000000, 0]);
C('Khoản gốc chỉ tính 50% vào lãi lỗ sổ TH', root.pl_amount, 5000000);
const vg = (await rows(VG, [['split_of', 'eq', sal.id]]))[0];
const an = (await rows(AN, [['split_of', 'eq', sal.id]]))[0];
C('Sổ VG nhận 3.000.000, coi như đã trả (không nợ)', [vg.amount, vg.unpaid, vg.expense_group], [3000000, 0, 'Nhân sự']);
C('Sổ AN nhận 2.000.000, ghi rõ nguồn', [an.amount, an.split_of_code, an.split_of_book], [2000000, root.code, 'TH']);
C('Lãi lỗ từng sổ tăng đúng phần', [await pl(TH) - plBefore.TH, await pl(VG) - plBefore.VG, await pl(AN) - plBefore.AN], [5000000, 3000000, 2000000]);
C('Phần chia không nằm trong chứng từ cần trả', (await api.q('open_docs', VG)).some((d) => d.doc_id === vg.id), false);

G('2. Sửa, chặn sai, hủy');
const rent = await exp({ date: TODAY, category: 'Thuê nhà / cửa hàng', amount: 10000000, split: [{ book_id: TH, pct: 33.33 }, { book_id: VG, pct: 33.33 }, { book_id: AN, pct: 33.34 }] });
const parts = async () => (await Promise.all([VG, AN].map((b) => rows(b, [['split_of', 'eq', rent.id]])))).flat().map((x) => x.amount);
C('Làm tròn: 3.333.000 + 3.333.000 + 3.334.000 = đủ 10 triệu', [(await rows(TH, [['id', 'eq', rent.id]]))[0].pl_amount, ...(await parts())], [3333000, 3333000, 3334000]);
await exp({ id: rent.id, date: TODAY, category: 'Thuê nhà / cửa hàng', amount: 6000000, split: [{ book_id: VG, pct: 100 }] });
C('Sửa: chuyển 100% sang VG → TH không tính lãi lỗ, AN bỏ phần chia', [(await rows(TH, [['id', 'eq', rent.id]]))[0].pl_amount, ...(await parts())], [0, 6000000]);
await E('Tổng tỷ lệ khác 100% bị chặn', () => exp({ date: TODAY, category: 'Lương', amount: 1000, split: [{ book_id: TH, pct: 50 }, { book_id: VG, pct: 40 }] }), '100%');
await E('Không sửa được phần chia ở sổ nhận', () => api.call('save_expense', { book_id: VG, request_id: rid(), id: vg.id, date: TODAY, category: 'Lương', amount: 1 }), 'khoản gốc');
await E('Không hủy được phần chia ở sổ nhận', () => api.call('void_expense', { id: vg.id, reason: 'x' }), 'khoản gốc');
await api.call('void_expense', { id: rent.id, reason: 'Ghi nhầm' });
C('Hủy khoản gốc → phần chia ở sổ khác cũng hủy', (await rows(VG, [['split_of', 'eq', rent.id]]))[0].voided, true);
await api.call('upsert_member', { book_id: TH, email: 'nv@gomsu.vn', role: 'staff', perms: { chi_phi: true } });
api.as(staff);
await E('Nhân viên không thuộc sổ VG không chia sang VG được', () => exp({ date: TODAY, category: 'Lương', amount: 1000, split: [{ book_id: TH, pct: 50 }, { book_id: VG, pct: 50 }] }), 'quyền');
api.as(owner);

G('3. Chi phí định kỳ');
C('Ngày 31 tháng 2 → ngày cuối tháng', [dueDate('2026-02', 31), dueDate('2028-02', 30), dueDate('2026-04', 15)], ['2026-02-28', '2028-02-29', '2026-04-15']);
const start = addM(TODAY, -2);
const ai = await api.call('save_recurring', { book_id: TH, name: 'Claude AI', category: 'Phần mềm, ứng dụng', amount: 500000, day: 1, start_month: start, fund_id: fund });
C('Lưu lần đầu ghi bù 3 kỳ đã đến hạn (2 tháng trước → tháng này)', ai.created.length, 3);
const aiRows = await rows(TH, [['recur_id', 'eq', ai.id]]);
C('Mỗi kỳ 500.000, đúng ngày 1, đã trả từ quỹ', aiRows.map((x) => [x.exp_date.slice(8), x.amount, x.unpaid]).sort(), [['01', 500000, 0], ['01', 500000, 0], ['01', 500000, 0]]);
C('Diễn giải ghi tháng', aiRows.some((x) => x.description === `Claude AI · tháng ${TODAY.slice(5, 7)}/${TODAY.slice(0, 4)}`), true);
C('Chạy lịch lại không ghi trùng', callService(runAllRecurring).created, 0);
const rec = (await api.q('expense_recurring', TH)).find((r) => r.id === ai.id);
C('Xem: đã ghi 3 kỳ, tổng 1.500.000, kỳ tới tháng sau', [rec.runs, rec.total, rec.next_month], [3, 1500000, addM(TODAY, 1)]);
const house = await api.call('save_recurring', { book_id: TH, name: 'Thuê nhà showroom', category: 'Thuê nhà / cửa hàng', amount: 9000000, day: 28, start_month: addM(TODAY, 1),
  split: [{ book_id: TH, pct: 60 }, { book_id: VG, pct: 40 }] });
C('Bắt đầu tháng sau → chưa ghi gì', house.created.length, 0);
await api.call('save_recurring', { book_id: TH, id: house.id, day: 5 });
const h2 = (await api.q('expense_recurring', TH)).find((r) => r.id === house.id);
C('Kéo thả đổi ngày: chỉ đổi ngày, giữ tỷ lệ chia', [h2.day, h2.amount, h2.split.length], [5, 9000000, 2]);
await api.call('save_recurring', { book_id: TH, id: house.id, start_month: TODAY.slice(0, 7), day: 1 });
const hr = (await rows(TH, [['recur_id', 'eq', house.id]]))[0];
C('Kỳ định kỳ có chia thương hiệu → VG nhận 40%', [hr.pl_amount, (await rows(VG, [['split_of', 'eq', hr.id]]))[0].amount], [5400000, 3600000]);
await E('Ghi ngay tháng đã ghi bị chặn', () => api.call('run_recurring', { book_id: TH, id: house.id, now: true }), 'đã ghi');
const net = await api.call('save_recurring', { book_id: TH, name: 'Internet', category: 'Internet, điện thoại', amount: 300000, day: 31, start_month: addM(TODAY, 1) });
await E('Ghi ngay tháng ngoài thời gian áp dụng bị chặn', () => api.call('run_recurring', { book_id: TH, id: net.id, now: true }), 'ngoài thời gian');
await api.call('save_recurring', { book_id: TH, id: net.id, start_month: TODAY.slice(0, 7), day: 31, active: 0 });
C('Tạm dừng → không ghi', (await rows(TH, [['recur_id', 'eq', net.id]])).length, 0);
const now = await api.call('run_recurring', { book_id: TH, id: net.id, now: true });
C('Ghi ngay tháng này (trước ngày hẹn)', [now.created.length, (await rows(TH, [['recur_id', 'eq', net.id]]))[0].exp_date], [1, TODAY]);
await E('Số tiền 0 bị chặn', () => api.call('save_recurring', { book_id: TH, name: 'x', category: 'Lương', amount: 0 }), 'lớn hơn 0');
await E('Ngày 32 bị chặn', () => api.call('save_recurring', { book_id: TH, name: 'x', category: 'Lương', amount: 1, day: 32 }), 'từ 1 đến 31');
await api.call('delete_recurring', { id: ai.id });
C('Xóa định kỳ: các kỳ đã ghi vẫn giữ', [(await api.q('expense_recurring', TH)).some((r) => r.id === ai.id), (await rows(TH, [['recur_id', 'eq', ai.id]])).length], [false, 3]);

finish('Chia chi phí thương hiệu + chi phí định kỳ');
