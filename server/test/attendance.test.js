// Kiểm thử: nhân viên tự chấm công (vào/ra ca, chấm ngày, nửa ngày), quyền xem công và lương theo tháng
import { freshDb, makeApi, suite, finish, TODAY, daysAgo } from './harness.js';

const { G, C, E } = suite();
freshDb();
const api = makeApi();
const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
const VG = books.find((b) => b.short_name === 'VG').id;
const today = TODAY();
const month = today.slice(0, 7);
// Ngày đã qua trong cùng tháng (đầu tháng thì dùng chính hôm nay)
const past = today.slice(8) === '01' ? today : daysAgo(1);

const lan = await api.user('lan@gomsu.vn');
const hoa = await api.user('hoa@gomsu.vn');
const hr = await api.user('nhansu@gomsu.vn');
for (const e of ['lan@gomsu.vn', 'hoa@gomsu.vn']) await api.call('upsert_member', { book_id: TH, email: e, role: 'staff', perms: {} });
await api.call('upsert_member', { book_id: TH, email: 'nhansu@gomsu.vn', role: 'staff', perms: { cham_cong: true } });
const ca = (await api.call('save_shift', { book_id: TH, name: 'Ca ngày', start_time: '00:00', end_time: '23:59', hours: 8 })).id;
const L = await api.call('save_employee', { book_id: TH, name: 'Lan', user_id: lan, pay: { type: 'ngay_cong', rate: 2600000, std_days: 26 } });
const H = await api.call('save_employee', { book_id: TH, name: 'Hoa', user_id: hoa, pay: { type: 'co_dinh', rate: 5000000 } });
await api.call('save_schedule', { book_id: TH, employee_id: L.id, items: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ shift_id: ca, weekday: w })) });

G('Sổ cho biết tài khoản có hồ sơ nhân viên');
api.as(lan);
C('Lan có employee_id ở sổ TH', (await api.call('my_books')).find((b) => b.id === TH).employee_id, L.id);
api.as(hr);
C('Nhân sự chưa gắn hồ sơ', (await api.call('my_books')).find((b) => b.id === TH).employee_id, null);

G('Nhân viên tự vào / ra ca');
api.as(lan);
const vin = await api.call('att_clock', { book_id: TH, action: 'in' });
C('Vào ca theo lịch hôm nay', vin.shift, 'Ca ngày');
await E('Không vào ca 2 lần', () => api.call('att_clock', { book_id: TH, action: 'in' }), 'đang trong ca');
const m1 = await api.call('att_month', { book_id: TH, month });
const t1 = m1.entries.find((t) => t.work_date === today);
C('Dòng chấm công tự chấm có giờ vào, chưa có giờ ra', [t1.status, !!t1.check_in, t1.check_out, t1.self_marked], ['di_lam', true, null, 1]);
api.as(hoa);
await E('Chưa vào ca thì không ra ca được', () => api.call('att_clock', { book_id: TH, action: 'out' }), 'chưa bấm');
api.as(hr);
await E('Tài khoản chưa gắn hồ sơ không tự chấm được', () => api.call('att_clock', { book_id: TH, action: 'in' }), 'chưa gắn');
api.as(lan);
await E('Không tự chấm ở sổ không phải thành viên', () => api.call('att_clock', { book_id: VG, action: 'in' }), 'không có quyền');

G('Nhân viên chỉ xem và chấm của mình');
C('Lan chỉ thấy chính mình, thấy lương của mình', [m1.employees.map((e) => e.name), m1.can_manage, m1.can_pay, !!m1.employees[0].pay], [['Lan'], false, false, true]);
await api.call('att_save_day', { book_id: TH, employee_id: L.id, work_date: past, shift_id: past === today ? ca : null, status: 'nua_ngay', ot_hours: 5, note: 'Chiều đi khám' });
const half = (await api.call('att_month', { book_id: TH, month })).entries.find((t) => t.work_date === past && t.status === 'nua_ngay');
C('Nửa ngày: nửa số giờ, nhân viên không tự ghi làm thêm', [half.hours, half.ot_hours, half.note], [4, 0, 'Chiều đi khám']);
await E('Không chấm cho người khác', () => api.call('att_save_day', { book_id: TH, employee_id: H.id, work_date: past, status: 'di_lam' }), 'chính mình');
await E('Không chấm ngày tương lai', () => api.call('att_save_day', { book_id: TH, employee_id: L.id, work_date: '2099-01-01', status: 'di_lam' }), 'chưa tới');
await E('Nhân viên không xem bảng công qua truy vấn chung', () => api.q('timesheets', TH), 'Chấm công');

G('Người có quyền chấm công xem cả nhóm, không thấy lương');
api.as(hr);
const m2 = await api.call('att_month', { book_id: TH, month });
C('Thấy Lan và Hoa, không có lương', [m2.employees.map((e) => e.name).sort(), m2.employees.every((e) => e.pay === null), m2.can_manage], [['Hoa', 'Lan'], true, true]);
await api.call('att_save_day', { book_id: TH, employee_id: H.id, work_date: past, status: 'di_lam', check_in: '08:00', check_out: '17:00', ot_hours: 1 });
const hRow = (await api.call('att_month', { book_id: TH, month })).entries.find((t) => t.employee_id === H.id);
C('Quản lý chấm: không đánh dấu tự chấm, có làm thêm', [hRow.self_marked, hRow.ot_hours, hRow.hours], [0, 1, 9]);

G('Chủ cửa hàng xem công và lương cả nhóm');
api.as(owner);
const m3 = await api.call('att_month', { book_id: TH, month });
const lanRow = m3.employees.find((e) => e.name === 'Lan');
const sameDay = past === today;
C('Công của Lan: 1 ngày + nửa ngày (hoặc 1 nếu cùng ngày)', lanRow.summary.days, sameDay ? 1 : 1.5);
C('Lương tạm tính theo công', lanRow.pay.base, (sameDay ? 1 : 1.5) * 100000);
C('Đếm số lần tự chấm', lanRow.summary.self_count, sameDay ? 1 : 2);
C('Chủ thấy lương cố định + làm thêm của Hoa', [m3.employees.find((e) => e.name === 'Hoa').pay.base, m3.employees.find((e) => e.name === 'Hoa').pay.ot > 0], [5000000, true]);
await api.call('att_save_day', { book_id: TH, employee_id: H.id, work_date: past, status: 'xoa' });
C('Bỏ chấm (về Chưa chấm) xoá dòng', (await api.call('att_month', { book_id: TH, month })).entries.filter((t) => t.employee_id === H.id).length, 0);

G('Ra ca và khoá kỳ đã chốt');
api.as(lan);
await E('Không ra ca ngay trong cùng phút', () => api.call('att_clock', { book_id: TH, action: 'out' }), 'Vừa vào ca');
const open = (await api.call('att_month', { book_id: TH, month })).entries.find((t) => t.work_date === today && t.check_in && !t.check_out);
await api.sql(`update timesheets set check_in = '00:00' where id = ?`, [open.id]);
const out = await api.call('att_clock', { book_id: TH, action: 'out' });
C('Ra ca ghi giờ ra', typeof out.check_out, 'string');
api.as(owner);
const ps = await api.call('create_paysheet', { book_id: TH, from: `${month}-01`, to: today });
await api.call('close_paysheet', { id: ps.id });
api.as(lan);
const m4 = await api.call('att_month', { book_id: TH, month });
C('Lưới tháng biết kỳ đã chốt', m4.locks.length, 1);
C('Nhân viên thấy phiếu lương của mình', [m4.payslips.length, m4.payslips[0].code], [1, ps.code || m4.payslips[0].code]);
await E('Kỳ đã chốt không tự chấm lại được', () => api.call('att_save_day', { book_id: TH, employee_id: L.id, work_date: today, shift_id: ca, status: 'nghi_phep' }), 'đã chốt');

G('Thêm nhân viên kèm email: mời đặt mật khẩu để chấm công');
api.as(owner);
const N = await api.call('save_employee', { book_id: TH, name: 'Ngọc Mới', email: 'Ngoc.Moi@gomsu.vn', pay: { type: 'ngay_cong', rate: 5200000 } });
const nu = (await api.sql(`select id, status from users where email = 'ngoc.moi@gomsu.vn'`))[0];
C('Tạo tài khoản chờ kích hoạt và gắn vào hồ sơ', [N.invited, N.user_id, nu.status], [true, nu.id, 'invited']);
const mem = (await api.sql(`select role, perms from book_members where book_id = ? and user_id = ?`, [TH, nu.id]))[0];
C('Vào sổ là nhân viên, không có quyền nghiệp vụ', [mem.role, mem.perms], ['staff', '{}']);
const mail = (await api.sql(`select subject, body from mail_outbox where to_email = 'ngoc.moi@gomsu.vn' order by id desc limit 1`))[0];
C('Thư mời có link đặt mật khẩu và link chấm công', [mail.subject, /#tai-khoan\/nhan-loi-moi\//.test(mail.body), /#cham-cong-cua-toi/.test(mail.body)], ['Lời mời chấm công trên Sổ bán hàng gốm', true, true]);
C('Danh sách nhân viên biết tài khoản đang chờ kích hoạt', (await api.one('employees', TH, [['id', 'eq', N.id]])).user_status, 'invited');
await api.call('resend_employee_invite', { book_id: TH, id: N.id });
C('Gửi lại thư mời', (await api.sql(`select count(*) n from mail_outbox where to_email = 'ngoc.moi@gomsu.vn'`))[0].n, 2);
await E('Một tài khoản không gắn cho 2 nhân viên', () => api.call('save_employee', { book_id: TH, name: 'Ngọc trùng', email: 'ngoc.moi@gomsu.vn' }), 'đã gắn với nhân viên');
await E('Email sai bị chặn', () => api.call('save_employee', { book_id: TH, name: 'X', email: 'khong-phai-email' }), 'Email không hợp lệ');
const outsider = await api.user('ngoai@gomsu.vn');
const O = await api.call('save_employee', { book_id: TH, name: 'Người có sẵn', email: 'ngoai@gomsu.vn' });
C('Email đã có tài khoản: gắn luôn, không gửi thư mời', [O.user_id, O.invited], [outsider, false]);
await E('Nhân viên đã kích hoạt thì không gửi lại thư mời', () => api.call('resend_employee_invite', { book_id: TH, id: O.id }), 'đã kích hoạt');
api.as(hr);
await E('Chỉ chủ cửa hàng thêm nhân viên kèm email', () => api.call('save_employee', { book_id: TH, name: 'Y', email: 'y@gomsu.vn' }), 'chủ cửa hàng');

finish('Chấm công tự phục vụ · quyền xem công/lương');
