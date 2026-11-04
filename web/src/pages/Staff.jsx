// Nhân viên theo kiểu KiotViet: danh sách nhân viên, lịch làm việc, bảng chấm công, bảng lương, bảng hoa hồng, thiết lập.
import React, { useMemo, useState } from 'react';
import { useApp, useQ, useAction, useRpcData } from '../lib/store.jsx';
import { money, qty as fq, dmy, todayVN, addDays, monthStart, monthEnd, match } from '../lib/format.js';
import { useProducts, productLabel } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { PeriodPicker, usePeriod } from '../components/Period.jsx';
import {
  Btn, Pill, Field, Input, TextArea, Select, DateInput, NumInput, Check, Tabs, Search, ErrorBox, Note, Table, Modal, ConfirmBtn, Picker, Section, ListPage, FilterBox, RadioList, MonthInput,
} from '../components/ui.jsx';

export const PAY_TYPES = [
  { value: 'ngay_cong', label: 'Theo ngày công chuẩn', rate: 'Lương tháng', hint: 'Lương tháng ÷ ngày công chuẩn × số ngày đi làm (ngày nghỉ có phép tính công nếu bật trong thiết lập)' },
  { value: 'ca', label: 'Theo ca', rate: 'Lương mỗi ca', hint: 'Lương mỗi ca × số ca đi làm' },
  { value: 'gio', label: 'Theo giờ', rate: 'Lương mỗi giờ', hint: 'Lương mỗi giờ × số giờ làm (theo giờ vào / ra, không có thì theo giờ của ca)' },
  { value: 'co_dinh', label: 'Cố định', rate: 'Lương mỗi kỳ', hint: 'Cố định mỗi bảng lương, không phụ thuộc chấm công' },
];
const ALLOW_PER = [{ value: 'thang', label: 'Mỗi kỳ lương' }, { value: 'ngay', label: 'Mỗi ngày đi làm' }];
const DEDUCT_PER = [{ value: 'thang', label: 'Mỗi kỳ lương' }, { value: 'lan_muon', label: 'Mỗi lần đi muộn / về sớm' }, { value: 'nghi_khong_phep', label: 'Mỗi ngày nghỉ không phép' }];
const STATUS = [{ value: 'di_lam', label: 'Đi làm' }, { value: 'nghi_phep', label: 'Nghỉ có phép' }, { value: 'nghi_khong_phep', label: 'Nghỉ không phép' }];
const STATUS_TONE = { di_lam: 'good', nghi_phep: 'info', nghi_khong_phep: 'bad' };
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];   // tuần bắt đầu từ thứ Hai
const weekday = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const mondayOf = (iso) => addDays(iso, -((weekday(iso) + 6) % 7));
const payText = (p) => (p?.type ? `${PAY_TYPES.find((t) => t.value === p.type)?.label}: ${money(p.rate)} đ` : '—');
const useEmployees = (all) => useQ('employees', all ? [] : [['active', 'eq', 'true']], 'code', 2000);
const useShifts = () => useQ('shifts', [['active', 'eq', 'true']], 'start_time', 200);

// ---------- DANH SÁCH NHÂN VIÊN ----------
export function EmployeesPage() {
  const { open, can } = useApp();
  const [st, setSt] = useState('1'); const [search, setSearch] = useState('');
  const q = useEmployees(true);
  const all = q.data || [];
  const rows = all.filter((e) => String(e.active ? 1 : 0) === st && match(`${e.code} ${e.name} ${e.phone || ''} ${e.title || ''}`, search));
  return (
    <ListPage title="Danh sách nhân viên" sub="Hồ sơ và cách tính lương của từng nhân viên. Người bán ghi trên đơn trùng tên hoặc mã nhân viên thì doanh số được tính cho người đó."
      filters={<FilterBox title="Trạng thái"><RadioList value={st} onChange={setSt} options={[{ value: '1', label: 'Đang làm việc', count: all.filter((e) => e.active).length },
        { value: '0', label: 'Đã nghỉ', count: all.filter((e) => !e.active).length }]} /></FilterBox>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm theo mã, tên nhân viên" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('nhan-vien.xlsx', [{ name: 'Nhân viên', rows: rows.map((e) => ({ ...e, pay_text: payText(e.pay) })), columns: [{ key: 'code', label: 'Mã' },
          { key: 'name', label: 'Tên' }, { key: 'phone', label: 'Điện thoại' }, { key: 'id_no', label: 'CMND/CCCD' }, { key: 'title', label: 'Chức danh' }, { key: 'dept', label: 'Phòng ban' },
          { key: 'start_date', label: 'Ngày vào làm', type: 'date' }, { key: 'pay_text', label: 'Lương' }] }])}>Xuất Excel</Btn>
        {can('owner') && <Btn kind="primary" icon="plus" onClick={() => open('employee', {})}>Nhân viên</Btn>}
      </>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} empty="Chưa có nhân viên" onRow={can('owner') ? (e) => open('employee', { id: e.id }) : undefined} columns={[
        { key: 'c', label: 'Mã nhân viên', render: (e) => <b>{e.code}</b> },
        { key: 'n', label: 'Tên nhân viên', render: (e) => <><div className="cell-main">{e.name}</div><div className="cell-sub">{[e.title, e.dept].filter(Boolean).join(' · ')}</div></> },
        { key: 'p', label: 'Số điện thoại', render: (e) => e.phone || '—' },
        { key: 'i', label: 'Số CMND/CCCD', render: (e) => e.id_no || '—' },
        { key: 'u', label: 'Tài khoản', render: (e) => (e.user_email ? <span className="small">{e.user_email}</span> : <span className="muted small">—</span>) },
        ...(can('owner') ? [{ key: 'l', label: 'Lương', render: (e) => <span className="small">{payText(e.pay)}</span> }] : []),
      ]} />
    </ListPage>
  );
}

function ListEditor({ rows, onChange, pers, label, addLabel }) {
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="field-label">{label}</div>
      {rows.map((r, i) => (
        <div key={i} className="row gap-s">
          <Input value={r.name} onChange={(v) => set(i, { name: v })} placeholder="Tên khoản" style={{ maxWidth: 200 }} />
          <NumInput value={r.amount} onChange={(v) => set(i, { amount: v })} style={{ maxWidth: 150 }} />
          <div style={{ minWidth: 210 }}><Select value={r.per} onChange={(v) => set(i, { per: v })} options={pers} /></div>
          <Btn small kind="ghost" icon="x" aria-label="Bỏ dòng" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div><Btn small icon="plus" onClick={() => onChange([...rows, { name: '', amount: null, per: pers[0].value }])}>{addLabel}</Btn></div>
    </div>
  );
}

export function EmployeeForm({ id, onClose }) {
  const { rpc } = useApp();
  const { run, busy } = useAction();
  const members = useQ('members', [], 'display_name', 200);
  const tables = useQ('commission_tables', [['active', 'eq', 'true']], 'name', 200);
  const [tab, setTab] = useState('info');
  const [f, setF] = useState({ code: '', name: '', phone: '', id_no: '', title: '', dept: '', address: '', start_date: todayVN(), user_id: '', note: '', active: true,
    pay: { type: 'ngay_cong', rate: null, std_days: null, ot: true, ot_rate: null, allowances: [], deductions: [], bonus: [], commission_id: '' } });
  const [loaded, setLoaded] = useState(!id);
  React.useEffect(() => {
    if (id) rpc('q', { view: 'employees', filters: [['id', 'eq', id]] }).then(([e]) => {
      setF((s) => ({ ...s, ...e, phone: e.phone || '', id_no: e.id_no || '', title: e.title || '', dept: e.dept || '', address: e.address || '', note: e.note || '',
        user_id: e.user_id || '', active: !!e.active, pay: { ...s.pay, ...(e.pay || {}), commission_id: e.pay?.commission_id || '' } }));
      setLoaded(true);
    });
  }, [id]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setPay = (k, v) => setF((s) => ({ ...s, pay: { ...s.pay, [k]: v } }));
  const T = PAY_TYPES.find((t) => t.value === f.pay.type);
  const setTier = (i, patch) => setPay('bonus', f.pay.bonus.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <Modal title={id ? `Nhân viên ${f.code}` : 'Thêm nhân viên'} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} disabled={!loaded} onClick={async () => {
        if (await run('save_employee', { id: id || null, ...f, user_id: f.user_id || null, pay: { ...f.pay, commission_id: f.pay.commission_id || null } }, 'Đã lưu nhân viên')) onClose();
      }}>Lưu</Btn></>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'info', label: 'Thông tin' }, { value: 'pay', label: 'Thiết lập lương' }]} />
      {tab === 'info' ? (
        <div className="grid">
          <Field label="Mã nhân viên" hint="Để trống: tự tạo"><Input value={f.code} onChange={(v) => set('code', v)} /></Field>
          <Field label="Tên nhân viên" required><Input value={f.name} onChange={(v) => set('name', v)} autoFocus={!id} /></Field>
          <Field label="Số điện thoại"><Input value={f.phone} onChange={(v) => set('phone', v)} /></Field>
          <Field label="Số CMND/CCCD"><Input value={f.id_no} onChange={(v) => set('id_no', v)} /></Field>
          <Field label="Chức danh"><Input value={f.title} onChange={(v) => set('title', v)} placeholder="vd. Bán hàng" /></Field>
          <Field label="Phòng ban"><Input value={f.dept} onChange={(v) => set('dept', v)} placeholder="vd. Cửa hàng" /></Field>
          <Field label="Ngày vào làm"><DateInput value={f.start_date} onChange={(v) => set('start_date', v)} /></Field>
          <Field label="Tài khoản đăng nhập"><Select value={f.user_id} onChange={(v) => set('user_id', v)} placeholder="(không có)"
            options={(members.data || []).map((m) => ({ value: m.user_id, label: `${m.display_name || m.email}${m.email ? ` · ${m.email}` : ''}` }))} /></Field>
          <Field label="Địa chỉ" wide><Input value={f.address} onChange={(v) => set('address', v)} /></Field>
          <Field label="Ghi chú" wide><TextArea value={f.note} onChange={(v) => set('note', v)} /></Field>
          {id && <Check checked={f.active} onChange={(v) => set('active', v)}>Đang làm việc</Check>}
        </div>
      ) : (
        <div className="stack">
          <div className="grid">
            <Field label="Loại lương chính"><Select value={f.pay.type} onChange={(v) => setPay('type', v)} options={PAY_TYPES} /></Field>
            <Field label={T.rate} required><NumInput value={f.pay.rate} onChange={(v) => setPay('rate', v)} /></Field>
            {f.pay.type === 'ngay_cong' && <Field label="Ngày công chuẩn" hint="Để trống: theo thiết lập chung"><NumInput money={false} min={1} max={31} value={f.pay.std_days} onChange={(v) => setPay('std_days', v)} /></Field>}
          </div>
          <div className="muted small">{T.hint}</div>
          <div className="row gap"><Check checked={f.pay.ot !== false} onChange={(v) => setPay('ot', v)}>Tính lương làm thêm giờ</Check>
            {f.pay.ot !== false && <Field label="Hệ số làm thêm" hint="Để trống: theo thiết lập chung"><NumInput money={false} min={1} value={f.pay.ot_rate} onChange={(v) => setPay('ot_rate', v)} style={{ maxWidth: 120 }} /></Field>}</div>
          <ListEditor rows={f.pay.allowances} onChange={(v) => setPay('allowances', v)} pers={ALLOW_PER} label="Phụ cấp" addLabel="Thêm phụ cấp" />
          <ListEditor rows={f.pay.deductions} onChange={(v) => setPay('deductions', v)} pers={DEDUCT_PER} label="Giảm trừ" addLabel="Thêm giảm trừ" />
          <div className="stack" style={{ gap: 6 }}>
            <div className="field-label">Thưởng theo doanh thu (bậc thang, lấy mốc cao nhất đạt được)</div>
            {f.pay.bonus.map((b, i) => (
              <div key={i} className="row gap-s">
                <span className="small muted">Doanh thu từ</span><NumInput value={b.from} onChange={(v) => setTier(i, { from: v })} style={{ maxWidth: 160 }} />
                <span className="small muted">thưởng</span><NumInput money={b.type === 'vnd'} value={b.value} onChange={(v) => setTier(i, { value: v })} style={{ maxWidth: 140 }} />
                {['vnd', 'pct'].map((t) => <button key={t} type="button" className={`chip${b.type === t ? ' on' : ''}`} onClick={() => setTier(i, { type: t })}>{t === 'vnd' ? 'VND' : '% doanh thu'}</button>)}
                <Btn small kind="ghost" icon="x" aria-label="Bỏ mốc" onClick={() => setPay('bonus', f.pay.bonus.filter((_, j) => j !== i))} />
              </div>
            ))}
            <div><Btn small icon="plus" onClick={() => setPay('bonus', [...f.pay.bonus, { from: null, type: 'pct', value: null }])}>Thêm mốc thưởng</Btn></div>
          </div>
          <Field label="Bảng hoa hồng"><Select value={f.pay.commission_id} onChange={(v) => setPay('commission_id', v)} placeholder="(không tính hoa hồng)"
            options={(tables.data || []).map((t) => ({ value: t.id, label: t.name }))} /></Field>
        </div>
      )}
    </Modal>
  );
}

// ---------- LỊCH LÀM VIỆC ----------
export function SchedulePage() {
  const { open, can } = useApp();
  const emps = useEmployees(); const shifts = useShifts();
  const sch = useQ('work_schedules', [], 'start_time', 5000);
  const [search, setSearch] = useState('');
  const rows = (emps.data || []).filter((e) => match(`${e.code} ${e.name}`, search));
  const cell = (eid, wd) => (sch.data || []).filter((w) => w.employee_id === eid && w.weekday === wd);
  return (
    <ListPage title="Lịch làm việc" sub="Lịch lặp lại hằng tuần của từng nhân viên. Bảng chấm công dùng lịch này để chấm nhanh “đi làm” cho cả tuần."
      search={<Search value={search} onChange={setSearch} placeholder="Tìm nhân viên" />}
      actions={!(shifts.data || []).length && can('owner') && <Btn kind="primary" icon="plus" onClick={() => open('shift', {})}>Tạo ca làm việc</Btn>}>
      <ErrorBox error={emps.error || sch.error} />
      {shifts.data && !shifts.data.length && <Note tone="warn">Chưa có ca làm việc. Tạo ca ở Nhân viên → Thiết lập nhân viên.</Note>}
      <Table rows={emps.data && sch.data ? rows : null} empty="Chưa có nhân viên" onRow={can('cham_cong') ? (e) => open('schedule', { employee: e }) : undefined} columns={[
        { key: 'n', label: 'Nhân viên', render: (e) => <><div className="cell-main">{e.name}</div><div className="cell-sub">{e.code}</div></> },
        ...ORDER.map((wd) => ({ key: 'd' + wd, label: WEEKDAYS[wd], render: (e) => <div className="stack" style={{ gap: 2 }}>{cell(e.id, wd).map((w) => <Pill key={w.shift_id} tone="accent">{w.shift_name}</Pill>)}</div> })),
      ]} />
    </ListPage>
  );
}

export function ScheduleForm({ employee, onClose }) {
  const shifts = useShifts();
  const sch = useQ('work_schedules', [['employee_id', 'eq', employee.id]], 'start_time', 200);
  const { run, busy } = useAction();
  const [sel, setSel] = useState(null);
  const cur = sel || new Set((sch.data || []).map((w) => `${w.shift_id}|${w.weekday}`));
  const toggle = (k) => { const s = new Set(cur); if (s.has(k)) s.delete(k); else s.add(k); setSel(s); };
  return (
    <Modal title={`Lịch làm việc · ${employee.name}`} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const items = [...cur].map((k) => { const [shift_id, wd] = k.split('|'); return { shift_id, weekday: Number(wd) }; });
        if (await run('save_schedule', { employee_id: employee.id, items }, 'Đã lưu lịch làm việc')) onClose();
      }}>Lưu</Btn></>}>
      <Table dense rows={shifts.data} empty="Chưa có ca làm việc" columns={[
        { key: 's', label: 'Ca', render: (s) => <><b>{s.name}</b><div className="cell-sub">{s.start_time} – {s.end_time}</div></> },
        ...ORDER.map((wd) => ({ key: 'd' + wd, label: WEEKDAYS[wd], align: 'center', render: (s) => <Check checked={cur.has(`${s.id}|${wd}`)} onChange={() => toggle(`${s.id}|${wd}`)} /> })),
      ]} />
    </Modal>
  );
}

// ---------- BẢNG CHẤM CÔNG ----------
export function TimesheetPage() {
  const { open, can } = useApp();
  const [mon, setMon] = useState(mondayOf(todayVN()));
  const days = ORDER.map((_, i) => addDays(mon, i));
  const emps = useEmployees();
  const ts = useQ('timesheets', [['work_date', 'gte', days[0]], ['work_date', 'lte', days[6]]], 'work_date', 10000);
  const { run, busy } = useAction();
  const [search, setSearch] = useState('');
  const rows = (emps.data || []).filter((e) => match(`${e.code} ${e.name}`, search));
  const cell = (eid, d) => (ts.data || []).filter((t) => t.employee_id === eid && t.work_date === d);
  const today = todayVN();
  const sum = (eid) => { const x = (ts.data || []).filter((t) => t.employee_id === eid && t.status === 'di_lam'); return { n: x.length, h: x.reduce((s, t) => s + t.hours + t.ot_hours, 0) }; };
  return (
    <ListPage title="Bảng chấm công" sub="Bấm vào ô để chấm công một ngày. “Chấm theo lịch” điền đi làm cho các ca trong lịch tuần chưa chấm (không quá hôm nay)."
      filters={<FilterBox title="Tuần"><div className="small"><b>{dmy(days[0])}</b> – <b>{dmy(days[6])}</b></div>
        <div className="row gap-s" style={{ marginTop: 8 }}><Btn small icon="back" aria-label="Tuần trước" onClick={() => setMon(addDays(mon, -7))} />
          <Btn small onClick={() => setMon(mondayOf(today))}>Tuần này</Btn><Btn small icon="chev" aria-label="Tuần sau" onClick={() => setMon(addDays(mon, 7))} /></div></FilterBox>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm nhân viên" />}
      actions={can('cham_cong') && <Btn kind="primary" icon="check" busy={busy} disabled={days[0] > today}
        onClick={() => run('fill_timesheets', { from: days[0], to: days[6] }, (x) => `Đã chấm ${x.created} ca theo lịch`)}>Chấm theo lịch</Btn>}>
      <ErrorBox error={emps.error || ts.error} />
      <Table rows={emps.data && ts.data ? rows : null} empty="Chưa có nhân viên" columns={[
        { key: 'n', label: 'Nhân viên', render: (e) => <><div className="cell-main">{e.name}</div><div className="cell-sub">{sum(e.id).n} ca · {fq(sum(e.id).h)} giờ</div></> },
        ...days.map((d) => ({ key: d, label: <>{WEEKDAYS[weekday(d)]}<div className="cell-sub">{d.slice(8)}/{d.slice(5, 7)}</div></>, render: (e) => (
          <div className="stack" style={{ gap: 2, minWidth: 64 }}>
            {cell(e.id, d).map((t) => <button key={t.id} type="button" className="link-btn" onClick={() => open('timesheet', { employee: e, date: d, entry: t })}>
              <Pill tone={STATUS_TONE[t.status]}>{t.status === 'di_lam' ? (t.shift_name || `${fq(t.hours)}h`) : t.status === 'nghi_phep' ? 'Phép' : 'Nghỉ'}{t.late_minutes > 0 ? ' · muộn' : ''}{t.ot_hours > 0 ? ` +${fq(t.ot_hours)}h` : ''}</Pill></button>)}
            {can('cham_cong') && d <= today && <button type="button" className="link-btn small muted" onClick={() => open('timesheet', { employee: e, date: d })}>+ chấm</button>}
          </div>) })),
      ]} />
    </ListPage>
  );
}

export function TimesheetForm({ employee, date, entry, onClose }) {
  const shifts = useShifts();
  const { run, busy } = useAction();
  const [f, setF] = useState({ shift_id: entry?.shift_id || '', status: entry?.status || 'di_lam', check_in: entry?.check_in || '', check_out: entry?.check_out || '',
    ot_hours: entry?.ot_hours || null, note: entry?.note || '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal title={`Chấm công · ${employee.name}`} subtitle={`${WEEKDAYS[weekday(date)]}, ${dmy(date)}`} onClose={onClose}
      footer={<>{entry && <ConfirmBtn kind="danger" icon="x" busy={busy} onConfirm={async () => { if (await run('delete_timesheet', { id: entry.id }, 'Đã xóa chấm công')) onClose(); }}>Xóa</ConfirmBtn>}
        <span className="grow" /><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
          if (await run('save_timesheet', { employee_id: employee.id, work_date: date, ...f, shift_id: f.shift_id || null }, 'Đã chấm công')) onClose();
        }}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Ca"><Select value={f.shift_id} onChange={(v) => set('shift_id', v)} placeholder="(không theo ca)" disabled={!!entry}
          options={(shifts.data || []).map((s) => ({ value: s.id, label: `${s.name} (${s.start_time} – ${s.end_time})` }))} /></Field>
        <Field label="Trạng thái"><Select value={f.status} onChange={(v) => set('status', v)} options={STATUS} /></Field>
        {f.status === 'di_lam' && <>
          <Field label="Giờ vào" hint="HH:MM, để trống: theo giờ ca"><Input value={f.check_in} onChange={(v) => set('check_in', v)} placeholder="08:00" /></Field>
          <Field label="Giờ ra"><Input value={f.check_out} onChange={(v) => set('check_out', v)} placeholder="17:00" /></Field>
          <Field label="Làm thêm (giờ)"><NumInput money={false} min={0} value={f.ot_hours} onChange={(v) => set('ot_hours', v)} /></Field>
        </>}
        <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>
    </Modal>
  );
}

// ---------- BẢNG LƯƠNG ----------
export function PaysheetsPage() {
  const { open } = useApp();
  const [st, setSt] = useState('');
  const q = useQ('paysheets', [], 'created_at desc', 500);
  const all = q.data || [];
  const rows = all.filter((s) => !st || s.status === st);
  return (
    <ListPage title="Bảng lương" sub="Lập bảng lương theo kỳ từ chấm công, doanh số và cách tính lương của từng người. Chốt bảng lương để ghi chi phí lương; trả lương bằng phiếu chi."
      filters={<FilterBox title="Trạng thái"><RadioList value={st} onChange={setSt} options={[{ value: '', label: 'Tất cả', count: all.length },
        ...[['tam', 'Tạm tính'], ['chot', 'Đã chốt'], ['huy', 'Đã hủy']].map(([v, l]) => ({ value: v, label: l, count: all.filter((s) => s.status === v).length }))]} /></FilterBox>}
      actions={<Btn kind="primary" icon="plus" onClick={() => open('paysheet-new', {})}>Bảng tính lương</Btn>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} empty="Chưa có bảng lương" onRow={(s) => open('paysheet', { id: s.id })} rowClass={(s) => (s.status === 'huy' ? 'row-void' : '')} columns={[
        { key: 'c', label: 'Mã', render: (s) => <><div className="cell-main">{s.code}</div><div className="cell-sub">{s.name}</div></> },
        { key: 'k', label: 'Kỳ làm việc', render: (s) => `${dmy(s.period_from)} – ${dmy(s.period_to)}` },
        { key: 'n', label: 'Nhân viên', align: 'right', render: (s) => s.employees },
        { key: 't', label: 'Tổng lương', align: 'right', render: (s) => money(s.total) },
        { key: 'p', label: 'Đã trả', align: 'right', render: (s) => money(s.paid) },
        { key: 'u', label: 'Còn cần trả', align: 'right', render: (s) => money(s.unpaid) },
        { key: 's', label: 'Trạng thái', render: (s) => <Pill tone={s.status === 'chot' ? 'good' : s.status === 'tam' ? 'warn' : 'mute'}>{s.status_label}</Pill> },
      ]} />
    </ListPage>
  );
}

export function PaysheetNewForm({ onClose }) {
  const { open } = useApp();
  const { run, busy } = useAction();
  const [m, setM] = useState(todayVN().slice(0, 7));
  const [r, setR] = useState({ from: monthStart(todayVN()), to: monthEnd(todayVN()) });
  const [name, setName] = useState('');
  const pick = (v) => { setM(v); setR({ from: v + '-01', to: monthEnd(v + '-01') }); };
  return (
    <Modal title="Bảng tính lương" onClose={onClose}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const x = await run('create_paysheet', { name: name || null, ...r }, (y) => `Đã lập ${y.code} cho ${y.lines} nhân viên`);
        if (x) { onClose(); open('paysheet', { id: x.id }); }
      }}>Tạo bảng lương</Btn></>}>
      <div className="grid">
        <Field label="Tháng"><MonthInput value={m} onChange={pick} /></Field>
        <Field label="Tên bảng lương" hint={`Để trống: Bảng lương ${m.slice(5)}/${m.slice(0, 4)}`}><Input value={name} onChange={setName} /></Field>
        <Field label="Từ ngày"><DateInput value={r.from} onChange={(v) => setR((s) => ({ ...s, from: v }))} /></Field>
        <Field label="Đến ngày"><DateInput value={r.to} onChange={(v) => setR((s) => ({ ...s, to: v }))} /></Field>
      </div>
      <Note>Lương tính cho tất cả nhân viên đang làm việc. Lương theo ngày công và cố định tính cho cả kỳ; bảng lương tạm tính có thể tính lại khi bổ sung chấm công.</Note>
    </Modal>
  );
}

const breakdownText = (b) => [
  b.type === 'ca' ? `${b.shifts} ca` : b.type === 'gio' ? `${fq(b.hours)} giờ` : b.type === 'ngay_cong' ? `${b.days} ngày công${b.leave_days ? ` + ${b.leave_days} phép` : ''} / ${b.std_days}` : 'Cố định',
  b.ot_hours ? `làm thêm ${fq(b.ot_hours)}h` : '', b.lates ? `${b.lates} lần muộn/sớm` : '', b.absent_days ? `${b.absent_days} ngày nghỉ không phép` : '',
  b.revenue ? `doanh số ${money(b.revenue)}` : '', b.adjust_note ? `ghi chú: ${b.adjust_note}` : '',
].filter(Boolean).join(' · ');

export function PaysheetDetail({ id, onClose }) {
  const { open, can } = useApp();
  const s = useQ('paysheets', [['id', 'eq', id]]);
  const lines = useQ('paysheet_lines', [['paysheet_id', 'eq', id]], 'employee_code', 2000);
  const { run, busy } = useAction();
  const [edit, setEdit] = useState(null);
  const ps = s.data?.[0];
  const tam = ps?.status === 'tam';
  const cols = [{ key: 'employee_code', label: 'Mã NV' }, { key: 'employee_name', label: 'Tên' }, { key: 'base', label: 'Lương chính' }, { key: 'ot', label: 'Làm thêm' },
    { key: 'bonus', label: 'Thưởng' }, { key: 'commission', label: 'Hoa hồng' }, { key: 'allowance', label: 'Phụ cấp' }, { key: 'deduction', label: 'Giảm trừ' },
    { key: 'adjust', label: 'Cộng/trừ thêm' }, { key: 'total', label: 'Tổng lương' }, { key: 'paid', label: 'Đã trả' }, { key: 'unpaid', label: 'Còn cần trả' }];
  return (
    <Modal title={ps ? `${ps.code} · ${ps.name}` : 'Bảng lương'} subtitle={ps ? `Kỳ ${dmy(ps.period_from)} – ${dmy(ps.period_to)} · ${ps.status_label}` : ''} onClose={onClose} size="xl"
      footer={ps && <>
        {ps.status !== 'huy' && <ConfirmBtn kind="danger" icon="x" busy={busy} onConfirm={() => run('cancel_paysheet', { id }, 'Đã hủy bảng lương')}>Hủy bảng lương</ConfirmBtn>}
        <span className="grow" />
        <Btn icon="dl" onClick={() => exportXlsx(`${ps.code}.xlsx`, [{ name: ps.code, rows: lines.data || [], columns: cols }])}>Xuất Excel</Btn>
        {tam && <Btn icon="refresh" busy={busy} onClick={() => run('recalc_paysheet', { id }, 'Đã tính lại')}>Tính lại</Btn>}
        {tam && <ConfirmBtn kind="primary" busy={busy} onConfirm={() => run('close_paysheet', { id }, 'Đã chốt bảng lương')}>Chốt bảng lương</ConfirmBtn>}
      </>}>
      {ps && <div className="kpis kpis-3">
        <div className="kpi"><span className="kpi-label">Tổng lương</span><span className="kpi-value">{money(ps.total)}</span></div>
        <div className="kpi"><span className="kpi-label">Đã trả</span><span className="kpi-value">{money(ps.paid)}</span></div>
        <div className="kpi"><span className="kpi-label">Còn cần trả</span><span className="kpi-value">{money(ps.unpaid)}</span></div>
      </div>}
      {tam && <Note>Tạm tính: bổ sung chấm công rồi bấm “Tính lại”. Chốt bảng lương sẽ ghi chi phí “Lương” cho từng người (nhóm Nhân sự) và khóa chấm công trong kỳ.</Note>}
      <ErrorBox error={lines.error} />
      <Table rows={lines.data} empty="Không có nhân viên" foot={lines.data ? { t: money(lines.data.reduce((x, l) => x + l.total, 0)) } : null} columns={[
        { key: 'n', label: 'Nhân viên', render: (l) => <><div className="cell-main">{l.employee_name}</div><div className="cell-sub">{breakdownText(l.breakdown || {})}</div></> },
        { key: 'b', label: 'Lương chính', align: 'right', render: (l) => money(l.base) },
        { key: 'o', label: 'Làm thêm', align: 'right', render: (l) => money(l.ot) },
        { key: 'h', label: 'Thưởng + hoa hồng', align: 'right', render: (l) => money(l.bonus + l.commission) },
        { key: 'a', label: 'Phụ cấp', align: 'right', render: (l) => money(l.allowance) },
        { key: 'd', label: 'Giảm trừ', align: 'right', render: (l) => (l.deduction ? `−${money(l.deduction)}` : '0') },
        { key: 'j', label: 'Cộng/trừ thêm', align: 'right', render: (l) => (edit?.id === l.id
          ? <div className="row gap-s" style={{ justifyContent: 'flex-end' }}><NumInput value={edit.adjust} onChange={(v) => setEdit((e) => ({ ...e, adjust: v }))} style={{ maxWidth: 120 }} />
            <Input value={edit.note} onChange={(v) => setEdit((e) => ({ ...e, note: v }))} placeholder="Lý do" style={{ maxWidth: 120 }} />
            <Btn small kind="primary" busy={busy} onClick={async () => { if (await run('adjust_paysheet_line', { id: l.id, adjust: edit.adjust || 0, note: edit.note }, 'Đã cập nhật')) setEdit(null); }}>Lưu</Btn></div>
          : <>{money(l.adjust)}{tam && <button type="button" className="link-btn small" style={{ marginLeft: 6 }} onClick={() => setEdit({ id: l.id, adjust: l.adjust, note: l.breakdown?.adjust_note || '' })}>sửa</button>}</>) },
        { key: 't', label: 'Tổng lương', align: 'right', render: (l) => <b>{money(l.total)}</b> },
        { key: 'u', label: 'Còn cần trả', align: 'right', render: (l) => (ps?.status === 'chot' ? (l.unpaid > 0 ? money(l.unpaid) : <Pill tone="good">Đã trả</Pill>) : '—') },
        { key: 'x', label: '', render: (l) => ps?.status === 'chot' && l.unpaid > 0 && can('thu_chi') && l.expense_id
          && <Btn small onClick={() => open('payment', { kind: 'chi_phi', alloc: { doc_type: 'chi_phi', doc_id: l.expense_id, code: `${ps.code} · ${l.employee_name}`, amount: l.unpaid } })}>Trả lương</Btn> },
      ]} />
    </Modal>
  );
}

// ---------- BẢNG HOA HỒNG ----------
export function CommissionPage() {
  const { open } = useApp();
  const q = useQ('commission_tables', [], 'name', 200);
  return (
    <ListPage title="Bảng hoa hồng" sub="Hoa hồng tính trên doanh số người bán (đã trừ hàng trả lại) theo từng hàng hóa, nhóm hàng hoặc toàn bộ. Gán bảng cho nhân viên ở phần Thiết lập lương."
      actions={<Btn kind="primary" icon="plus" onClick={() => open('commission', {})}>Bảng hoa hồng</Btn>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data} empty="Chưa có bảng hoa hồng" onRow={(t) => open('commission', { table: t })} columns={[
        { key: 'n', label: 'Tên bảng', render: (t) => <><b>{t.name}</b>{!t.active && <> <Pill tone="mute">ngừng</Pill></>}</> },
        { key: 'r', label: 'Số dòng', align: 'right', render: (t) => (t.rules || []).length },
        { key: 'e', label: 'Nhân viên áp dụng', align: 'right', render: (t) => t.employees },
      ]} />
    </ListPage>
  );
}

const BASES = [{ value: 'doanh_thu', label: '% doanh thu' }, { value: 'lai_gop', label: '% lãi gộp' }, { value: 'so_luong', label: 'VND mỗi đơn vị bán' }];
const SCOPES = [{ value: 'all', label: 'Tất cả hàng hóa' }, { value: 'category', label: 'Nhóm hàng' }, { value: 'product', label: 'Hàng hóa' }];
export function CommissionForm({ table, onClose }) {
  const { settings } = useApp();
  const products = useProducts();
  const { run, busy } = useAction();
  const [f, setF] = useState({ name: table?.name || '', active: table ? !!table.active : true, rules: table?.rules || [{ scope: 'all', target: null, basis: 'doanh_thu', value: null }] });
  const setR = (i, patch) => setF((s) => ({ ...s, rules: s.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const cats = useMemo(() => [...new Set([...(settings.categories || []), ...(products.data || []).map((p) => p.category).filter(Boolean)])], [settings, products.data]);
  return (
    <Modal title={table ? `Bảng hoa hồng · ${table.name}` : 'Tạo bảng hoa hồng'} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        if (await run('save_commission_table', { id: table?.id || null, ...f }, 'Đã lưu bảng hoa hồng')) onClose();
      }}>Lưu</Btn></>}>
      <div className="grid"><Field label="Tên bảng" required><Input value={f.name} onChange={(v) => setF((s) => ({ ...s, name: v }))} placeholder="vd. Hoa hồng bán lẻ" /></Field>
        {table && <Check checked={f.active} onChange={(v) => setF((s) => ({ ...s, active: v }))}>Đang áp dụng</Check>}</div>
      <div className="muted small">Mỗi dòng hàng bán lấy mức cụ thể nhất: hàng hóa, rồi nhóm hàng, rồi tất cả.</div>
      <div className="stack">
        {f.rules.map((r, i) => (
          <div key={i} className="row gap-s" style={{ alignItems: 'flex-end' }}>
            <div style={{ minWidth: 160 }}><Select value={r.scope} onChange={(v) => setR(i, { scope: v, target: null })} options={SCOPES} /></div>
            {r.scope === 'category' && <div style={{ minWidth: 180 }}><Select value={r.target || ''} onChange={(v) => setR(i, { target: v })} placeholder="Chọn nhóm hàng" options={cats} /></div>}
            {r.scope === 'product' && <div className="grow" style={{ minWidth: 220 }}><Picker items={products.data} value={r.target || ''} onChange={(v) => setR(i, { target: v })} getLabel={productLabel} placeholder="Chọn hàng hóa" /></div>}
            <div style={{ minWidth: 170 }}><Select value={r.basis} onChange={(v) => setR(i, { basis: v })} options={BASES} /></div>
            <NumInput money={r.basis === 'so_luong'} min={0} max={r.basis === 'so_luong' ? undefined : 100} value={r.value} onChange={(v) => setR(i, { value: v })} style={{ maxWidth: 140 }} />
            <Btn small kind="ghost" icon="x" aria-label="Bỏ dòng" onClick={() => setF((s) => ({ ...s, rules: s.rules.filter((_, j) => j !== i) }))} />
          </div>
        ))}
        <div><Btn small icon="plus" onClick={() => setF((s) => ({ ...s, rules: [...s.rules, { scope: 'product', target: null, basis: 'doanh_thu', value: null }] }))}>Thêm dòng</Btn></div>
      </div>
    </Modal>
  );
}

// ---------- THIẾT LẬP NHÂN VIÊN ----------
const DEF = { std_days: 26, std_hours: 8, ot_rate: 1.5, late_grace: 5, paid_leave: true };
export function StaffSettingsPage({ go }) {
  const { settings, open, loadBooks } = useApp();
  const shifts = useQ('shifts', [], 'start_time', 200);
  const { run, busy } = useAction();
  const [f, setF] = useState({ ...DEF, ...(settings.staff_settings || {}) });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Thiết lập nhân viên</h1><div className="page-sub">Ca làm việc, ngày công chuẩn, làm thêm giờ và đi muộn dùng chung cho chấm công và bảng lương.</div></div>
        <Btn icon="users" onClick={() => go('cai-dat', 'users')}>Tài khoản đăng nhập & quyền</Btn></div>
      <Section title="Ca làm việc">
        <Table dense rows={shifts.data} empty="Chưa có ca làm việc" onRow={(s) => open('shift', { shift: s })} columns={[
          { key: 'n', label: 'Tên ca', render: (s) => <><b>{s.name}</b>{!s.active && <> <Pill tone="mute">ngừng</Pill></>}</> },
          { key: 't', label: 'Giờ làm', render: (s) => `${s.start_time} – ${s.end_time}` },
          { key: 'h', label: 'Số giờ', align: 'right', render: (s) => fq(s.hours) },
        ]} />
        <div><Btn icon="plus" onClick={() => open('shift', {})}>Thêm ca</Btn></div>
      </Section>
      <Section title="Tính công và lương">
        <div className="grid">
          <Field label="Ngày công chuẩn mỗi tháng"><NumInput money={false} min={1} max={31} value={f.std_days} onChange={(v) => set('std_days', v)} /></Field>
          <Field label="Số giờ mỗi ngày công"><NumInput money={false} min={1} max={24} value={f.std_hours} onChange={(v) => set('std_hours', v)} /></Field>
          <Field label="Hệ số lương làm thêm giờ"><NumInput money={false} min={1} value={f.ot_rate} onChange={(v) => set('ot_rate', v)} /></Field>
          <Field label="Cho phép đi muộn / về sớm (phút)"><NumInput money={false} min={0} value={f.late_grace} onChange={(v) => set('late_grace', v)} /></Field>
        </div>
        <Check checked={f.paid_leave} onChange={(v) => set('paid_leave', v)}>Ngày nghỉ có phép vẫn tính công (lương theo ngày công chuẩn)</Check>
        <div><Btn kind="primary" busy={busy} onClick={async () => {
          if (await run('update_book_settings', { settings: { staff_settings: { std_days: Number(f.std_days) || 26, std_hours: Number(f.std_hours) || 8, ot_rate: Number(f.ot_rate) || 1,
            late_grace: Number(f.late_grace) || 0, paid_leave: !!f.paid_leave } } }, 'Đã lưu thiết lập')) loadBooks();
        }}>Lưu thiết lập</Btn></div>
      </Section>
    </>
  );
}

export function ShiftForm({ shift, onClose }) {
  const { run, busy } = useAction();
  const [f, setF] = useState({ name: shift?.name || '', start_time: shift?.start_time || '08:00', end_time: shift?.end_time || '17:00', hours: shift?.hours || null, active: shift ? !!shift.active : true });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal title={shift ? `Ca ${shift.name}` : 'Thêm ca làm việc'} onClose={onClose}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => { if (await run('save_shift', { id: shift?.id || null, ...f }, 'Đã lưu ca')) onClose(); }}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Tên ca" required><Input value={f.name} onChange={(v) => set('name', v)} placeholder="vd. Ca sáng" /></Field>
        <Field label="Giờ bắt đầu"><Input value={f.start_time} onChange={(v) => set('start_time', v)} placeholder="08:00" /></Field>
        <Field label="Giờ kết thúc"><Input value={f.end_time} onChange={(v) => set('end_time', v)} placeholder="17:00" /></Field>
        <Field label="Số giờ tính công" hint="Để trống: tính theo giờ bắt đầu – kết thúc"><NumInput money={false} min={0} value={f.hours} onChange={(v) => set('hours', v)} /></Field>
        {shift && <Check checked={f.active} onChange={(v) => set('active', v)}>Đang dùng</Check>}
      </div>
    </Modal>
  );
}

// Báo cáo nhân viên (trang Báo cáo): doanh số, lãi gộp, số đơn, hoa hồng theo kỳ
export function StaffReport() {
  const { can } = useApp();
  const [period, setPeriod] = usePeriod('month');
  const q = useRpcData('rpt_staff', { from: period.from, to: period.to });
  const rows = q.data; const err = q.error;
  const cost = can('xem_gia_von');
  return (
    <div className="stack">
      <div className="row gap"><PeriodPicker value={period} onChange={setPeriod} /><span className="grow" />
        <Btn icon="dl" disabled={!rows} onClick={() => exportXlsx('bao-cao-nhan-vien.xlsx', [{ name: 'Nhân viên', rows, columns: [{ key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên' },
          { key: 'orders', label: 'Số đơn' }, { key: 'revenue', label: 'Doanh số' }, ...(cost ? [{ key: 'gross_profit', label: 'Lãi gộp' }] : []), { key: 'commission', label: 'Hoa hồng' }] }])}>Xuất Excel</Btn></div>
      <ErrorBox error={err} />
      <Note>Doanh số tính theo hàng đã giao trừ hàng trả lại trong kỳ, cho người bán ghi trên đơn trùng tên hoặc mã nhân viên.</Note>
      <Table rows={rows} empty="Chưa có nhân viên" foot={rows ? { r: money(rows.reduce((s, x) => s + x.revenue, 0)), h: money(rows.reduce((s, x) => s + x.commission, 0)) } : null} columns={[
        { key: 'n', label: 'Nhân viên', render: (x) => <><div className="cell-main">{x.name}</div><div className="cell-sub">{x.code}{!x.active ? ' · đã nghỉ' : ''}</div></> },
        { key: 'o', label: 'Số đơn', align: 'right', render: (x) => x.orders },
        { key: 'r', label: 'Doanh số', align: 'right', render: (x) => money(x.revenue) },
        ...(cost ? [{ key: 'g', label: 'Lãi gộp', align: 'right', render: (x) => money(x.gross_profit) }] : []),
        { key: 'h', label: 'Hoa hồng', align: 'right', render: (x) => money(x.commission) },
      ]} />
    </div>
  );
}
