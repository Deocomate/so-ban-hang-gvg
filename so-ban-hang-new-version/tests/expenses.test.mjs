// Kiểm thử: chi phí phân nhóm + phân bổ dần — chạy: node tests/expenses.test.mjs
import { freshDb, makeApi, check, expectError, summary, SQL_FILES } from './harness.mjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

const db = await freshDb();
const api = makeApi(db);
const rid = () => crypto.randomUUID();
const log = []; let group = '';
const G = (n) => { group = n; };
const C = (name, actual, expected, tol) => { const ok = check(`[${group}] ${name}`, actual, expected, tol); log.push({ group, name, expected, actual, ok }); return ok; };
const E = async (name, fn, pat) => { const before = summary().failed; await expectError(`[${group}] ${name}`, fn, pat); log.push({ group, name, expected: 'Báo lỗi / chặn', actual: summary().failed === before ? 'Đã chặn' : 'KHÔNG chặn', ok: summary().failed === before }); };
const [{ d: TODAY }] = await api.sql(`select app.today()::text d`);
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
const parts = await api.sql(`select alloc_date::text d, amount::float a from app.v_expense_alloc where expense_id = $1 order by part_no`, [cam.id]);
C('Chia 12 phần, phần đầu đúng ngày phát sinh', [parts.length, parts[0].d, parts[1].d], [12, d0, addM(d0, 1)]);
C('Mỗi tháng 1.000.000, cộng lại đủ 12.000.000', [parts[0].a, parts.reduce((s, x) => s + x.a, 0)], [1000000, 12000000]);
const mp0 = await pl(m0, mEnd(m0)); const mp1 = await pl(addM(m0, 1), mEnd(addM(m0, 1)));
C('Lãi lỗ tháng mua chỉ tính 1.000.000 chi phí camera', mp0.expenses, 1000000);
C('Tháng sau tiếp tục tính 1.000.000', mp1.expenses, 1000000);
C('Tiền ra khỏi quỹ tháng mua = 12.000.000 (dòng tiền thật)', mp0.cash_out, 12000000);
const rent = await exp({ date: d0, category: 'Thuê nhà / cửa hàng', amount: 10000000, alloc_months: 3, description: 'Tiền nhà trả trước 3 tháng' });
const rp = await api.sql(`select amount::float a from app.v_expense_alloc where expense_id = $1 order by part_no`, [rent.id]);
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

G('4. Nâng cấp cơ sở dữ liệu đã cài (không mất dữ liệu)');
const here = path.dirname(new URL(import.meta.url).pathname);
const old = new PGlite();
for (const f of SQL_FILES.filter((x) => x !== '09_expenses.sql')) await old.exec(fs.readFileSync(path.join(here, '..', 'db', f), 'utf8'));
// sổ cũ: danh mục cũ, chi phí tên cũ
await old.exec(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'cu@gomsu.vn')`);
await old.exec(`select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', false)`);
const ob = (await old.query(`select public.bootstrap('{}'::jsonb) r`)).rows[0].r[0].id;
await old.query(`update app.books set settings = (settings - 'expense_cats') || '{"expense_groups":["Thuê mặt bằng","Quảng cáo - Marketing","Khác"]}'::jsonb`);
await old.query(`insert into app.expenses (book_id, code, exp_date, category, amount) values ($1, 'CP00001', app.today(), 'Thuê mặt bằng', 8000000), ($1, 'CP00002', app.today(), 'Quảng cáo - Marketing', 2000000)`, [ob]);
await old.exec(fs.readFileSync(path.join(here, '..', 'db', '09_expenses.sql'), 'utf8'));
const up = (await old.query(`select code, category, expense_group, alloc_months, amount::float from app.expenses where book_id = $1 order by code`, [ob])).rows;
C('Chi phí cũ giữ nguyên số tiền, tự xếp nhóm', up.map((x) => [x.category, x.expense_group, x.amount, x.alloc_months]), [['Thuê mặt bằng', 'Mặt bằng', 8000000, 1], ['Quảng cáo - Marketing', 'Marketing', 2000000, 1]]);
const us = (await old.query(`select settings -> 'expense_cats' c from app.books where id = $1`, [ob])).rows[0].c;
C('Sổ cũ được thêm danh mục 2 cấp', us.length, 7);
const ex2 = (await old.query(`select (public.rpt_overview(jsonb_build_object('book_id', $1::text, 'from', app.today() - 30, 'to', app.today())) ->> 'expenses')::float e`, [ob])).rows[0].e;
C('Lãi lỗ sau nâng cấp vẫn đủ 10.000.000', ex2, 10000000);
await old.exec(fs.readFileSync(path.join(here, '..', 'db', '09_expenses.sql'), 'utf8'));
C('Chạy lại tệp nâng cấp lần 2 không lỗi, không nhân đôi', (await old.query(`select count(*)::int n from app.expenses`)).rows[0].n, 2);

const s = summary();
fs.writeFileSync(new URL('./last-results-exp.json', import.meta.url), JSON.stringify({ today: TODAY, ...s, log }, null, 2));
console.log(`\nĐẠT: ${s.passed}   LỖI: ${s.failed}`);
for (const f of s.failures) console.log('  ✗ ' + f);
process.exit(s.failed ? 1 : 0);
