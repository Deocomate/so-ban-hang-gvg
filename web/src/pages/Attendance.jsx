// Chấm công theo tháng (như Bảng công của app lịch công việc): lưới T2–CN cả tháng, mỗi ngày một ô màu + chữ, bấm ô để chấm.
// - "Chấm công của tôi": trang riêng của nhân viên — nút Vào ca / Ra ca (giờ máy chủ), lưới tháng của mình, công + lương tạm tính, phiếu lương.
// - "Bảng chấm công": người có quyền chấm công xem cả nhóm (tab Tổng hợp + tab từng người); chủ cửa hàng thấy thêm lương tạm tính.
import React, { useEffect, useState } from 'react';
import { useApp, useAction, useRpcData } from '../lib/store.jsx';
import { money, qty as fq, dmy, todayVN, addDays, addMonths, match } from '../lib/format.js';
import { exportXlsx } from '../lib/excel.js';
import { Btn, Icon, Pill, Field, Input, NumInput, Tabs, Search, ErrorBox, Note, Table, Modal, Loading, MonthInput, usePageTab } from '../components/ui.jsx';

const ST = {
  di_lam: { label: 'Đủ công', cell: 'Đủ công', cls: 'work' },
  nua_ngay: { label: 'Nửa ngày', cell: 'Nửa ngày', cls: 'half' },
  nghi_phep: { label: 'Nghỉ có phép', cell: 'Phép', cls: 'paid' },
  nghi_khong_phep: { label: 'Nghỉ không phép', cell: 'Nghỉ KL', cls: 'off' },
};
const WORKING = ['di_lam', 'nua_ngay'];
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WD_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const dayName = (iso) => `${WD_LONG[dow(iso)]}, ${iso.slice(8)}/${iso.slice(5, 7)}`;
/** 7.5 → "7g30"; long: "7 giờ 30 phút" */
const fmtH = (h, long) => {
  const m = Math.round((+h || 0) * 60); const H = Math.floor(m / 60); const M = m % 60;
  return long ? `${H} giờ${M ? ` ${M} phút` : ''}` : M ? `${H}g${String(M).padStart(2, '0')}` : `${H}g`;
};
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const PAY_TYPE = { ngay_cong: 'Theo ngày công', ca: 'Theo ca', gio: 'Theo giờ', co_dinh: 'Cố định' };

// ---------- dữ liệu tháng ----------
function useMonth() {
  const [month, setMonth] = useState(() => { try { return sessionStorage.getItem('att-month') || todayVN().slice(0, 7); } catch (e) { return todayVN().slice(0, 7); } });
  useEffect(() => { try { sessionStorage.setItem('att-month', month); } catch (e) { /* bỏ qua */ } }, [month]);
  const q = useRpcData('att_month', { month });
  return { month, setMonth, q, data: q.data };
}
const entriesOf = (data, empId, date) => (data?.entries || []).filter((t) => t.employee_id === empId && t.work_date === date);
const lockOf = (data, empId, date) => (data?.locks || []).find((l) => l.employee_id === empId && date >= l.period_from && date <= l.period_to);
const schedOf = (data, empId, date) => (data?.schedules || []).filter((s) => s.employee_id === empId && s.weekday === dow(date));
// Ngày phải đi làm: theo lịch làm việc; người chưa có lịch thì mọi ngày trừ Chủ nhật
const expected = (data, empId, date) => ((data?.schedules || []).some((s) => s.employee_id === empId) ? schedOf(data, empId, date).length > 0 : dow(date) !== 0);

function MonthNav({ month, setMonth }) {
  const cur = todayVN().slice(0, 7);
  return (
    <div className="row gap-s att-nav">
      <Btn small icon="back" aria-label="Tháng trước" onClick={() => setMonth(addMonths(month + '-01', -1).slice(0, 7))} />
      <div style={{ minWidth: 150 }}><MonthInput value={month} onChange={(v) => v && setMonth(v.slice(0, 7))} /></div>
      <Btn small icon="chev" aria-label="Tháng sau" onClick={() => setMonth(addMonths(month + '-01', 1).slice(0, 7))} />
      {month !== cur && <Btn small onClick={() => setMonth(cur)}>Tháng này</Btn>}
    </div>
  );
}

// ---------- lưới tháng ----------
function cellInfo(data, emp, date) {
  const rows = entriesOf(data, emp.id, date);
  if (!rows.length) {
    if (date > data.today) return { cls: 'future', text: '' };
    return expected(data, emp.id, date) ? { cls: 'none', text: 'Chưa chấm' } : { cls: 'rest', text: 'Nghỉ' };
  }
  const main = rows.find((r) => WORKING.includes(r.status)) || rows[0];
  const st = ST[main.status];
  const work = rows.filter((r) => WORKING.includes(r.status));
  const open = work.find((r) => r.check_in && !r.check_out);
  const timed = work.some((r) => r.check_in && r.check_out);
  const hours = work.reduce((s, r) => s + r.hours + r.ot_hours, 0);
  let text = st.cell;
  if (open) text = `Vào ${open.check_in}`;
  else if (timed) text = fmtH(hours);
  return { cls: st.cls, text, late: work.some((r) => r.late_minutes > 0 || r.early_minutes > 0), self: rows.some((r) => r.self_marked), many: rows.length > 1 };
}

function MonthGrid({ data, emp, onPick }) {
  const first = `${data.month}-01`;
  const lead = (dow(first) + 6) % 7;
  const days = [];
  for (let d = first; d <= data.to; d = addDays(d, 1)) days.push(d);
  return (
    <div className="att-grid" role="grid" aria-label={`Bảng công ${emp.name}`}>
      {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((w) => <div key={w} className={`att-wd${w === 'CN' ? ' sun' : ''}`} role="columnheader">{w}</div>)}
      {Array.from({ length: lead }, (_, i) => <div key={'b' + i} className="att-blank" />)}
      {days.map((d) => {
        const c = cellInfo(data, emp, d); const lk = lockOf(data, emp.id, d);
        const st = Object.values(ST).find((s) => s.cls === c.cls);
        return (
          <button key={d} type="button" role="gridcell" disabled={d > data.today}
            className={`att-cell st-${c.cls}${d === data.today ? ' today' : ''}${dow(d) === 0 ? ' sun' : ''}`}
            aria-label={`${dayName(d)}: ${c.text || 'chưa tới'}${c.late ? ', đi muộn hoặc về sớm' : ''}${c.self ? ', nhân viên tự chấm' : ''}${lk ? ', kỳ lương đã chốt' : ''}`}
            onClick={() => onPick(d)}>
            <span className="att-top">
              <span className="att-day">{Number(d.slice(8))}{lk && <Icon name="lock" size={11} />}</span>
              <span className="att-flags" aria-hidden="true">{c.late && <i className="f-late" title="Đi muộn / về sớm">M</i>}{c.self && <i className="f-self" title="Nhân viên tự chấm">T</i>}{c.many && <i title="Nhiều ca">+</i>}</span>
            </span>
            {st && <span className="att-mark" aria-hidden="true" />}
            <span className="att-text">{c.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="att-legend small muted">
      {Object.values(ST).map((s) => <span key={s.cls} className={`st-${s.cls}`}><span className="att-mark" />{s.label}</span>)}
      <span><i className="f-late">M</i> đi muộn / về sớm</span><span><i className="f-self">T</i> nhân viên tự chấm</span><span><Icon name="lock" size={11} /> kỳ lương đã chốt</span>
    </div>
  );
}

// ---------- chấm một ngày ----------
function DayEditor({ data, emp, date, onClose }) {
  const { rpc, refresh, toast } = useApp();
  const self = emp.id === data.me_id && !data.can_manage;
  const lk = lockOf(data, emp.id, date);
  const rows = entriesOf(data, emp.id, date);
  const sched = schedOf(data, emp.id, date);
  const [shiftId, setShiftId] = useState(rows[0]?.shift_id || sched[0]?.shift_id || '');
  const cur = rows.find((r) => (r.shift_id || '') === shiftId) || null;
  const [f, setF] = useState({});
  useEffect(() => setF({ check_in: cur?.check_in || '', check_out: cur?.check_out || '', ot_hours: cur?.ot_hours || null, note: cur?.note || '' }), [cur?.id, shiftId]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [undo, setUndo] = useState(null);
  const working = cur && WORKING.includes(cur.status);
  const save = async (patch, msg) => {
    setBusy(true); setErr('');
    const before = cur;
    try {
      await rpc('att_save_day', { employee_id: emp.id, work_date: date, shift_id: shiftId || null, status: cur?.status || 'di_lam', check_in: f.check_in, check_out: f.check_out,
        ot_hours: f.ot_hours || 0, note: f.note || null, ...patch });
      refresh(); setUndo({ before, msg });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const doUndo = async () => {
    const b = undo.before; setUndo(null);
    await save(b ? { status: b.status, check_in: b.check_in, check_out: b.check_out, ot_hours: b.ot_hours, note: b.note } : { status: 'xoa' });
    setUndo(null); toast('Đã hoàn tác');
  };
  const canTime = !lk && (!cur || working);
  return (
    <Modal title={dayName(date)} subtitle={`${emp.name}${cur ? ` · ${cur.self_marked ? 'nhân viên tự chấm' : 'quản lý chấm'}` : ''}`} onClose={onClose} size="sm">
      <div className="stack">
        {lk && <Note tone="warn">Ngày này thuộc bảng lương {lk.code} đã chốt — không sửa được.</Note>}
        {data.shifts.length > 0 && (
          <div className="field"><span className="field-label">Ca</span>
            <div className="att-seg">
              {[{ id: '', name: 'Không theo ca' }, ...data.shifts].map((s) => (
                <button key={s.id} type="button" className={`chip${shiftId === s.id ? ' on' : ''}`} onClick={() => setShiftId(s.id)}>
                  {s.name}{s.start_time ? <span className="muted"> {s.start_time}–{s.end_time}</span> : ''}{rows.some((r) => (r.shift_id || '') === s.id) ? ' •' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field" role="group" aria-label="Chấm công"><span className="field-label">Chấm công (bấm là lưu)</span>
          <div className="att-seg">
            {Object.entries(ST).map(([k, s]) => (
              <button key={k} type="button" disabled={!!lk || busy} className={`att-opt st-${s.cls}${cur?.status === k ? ' on' : ''}`} aria-pressed={cur?.status === k}
                onClick={() => save({ status: k }, s.label)}><span className="att-mark" />{s.label}</button>
            ))}
            <button type="button" disabled={!!lk || busy || !cur} className={`att-opt st-none${!cur ? ' on' : ''}`} onClick={() => save({ status: 'xoa' }, 'Chưa chấm')}>Chưa chấm</button>
          </div>
        </div>
        {undo && <div className="row gap-s small"><Icon name="check" size={14} /><span>Đã lưu: {undo.msg || 'giờ làm'}</span><button type="button" className="link-btn" onClick={doUndo}>Hoàn tác</button></div>}
        {canTime && (
          <div className="att-times">
            <Field label="Giờ vào">
              <div className="row gap-s"><Input type="time" value={f.check_in} onChange={(v) => setF((s) => ({ ...s, check_in: v }))} />
                {date === data.today && <Btn small onClick={() => setF((s) => ({ ...s, check_in: nowHM() }))}>Bây giờ</Btn>}</div>
            </Field>
            <Field label="Giờ ra">
              <div className="row gap-s"><Input type="time" value={f.check_out} onChange={(v) => setF((s) => ({ ...s, check_out: v }))} />
                {date === data.today && <Btn small onClick={() => setF((s) => ({ ...s, check_out: nowHM() }))}>Bây giờ</Btn>}</div>
            </Field>
            {!self && <Field label="Làm thêm (giờ)"><NumInput money={false} min={0} value={f.ot_hours} onChange={(v) => setF((s) => ({ ...s, ot_hours: v }))} /></Field>}
            <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => setF((s) => ({ ...s, note: v }))} placeholder="vd. đi khám, đổi ca…" /></Field>
            <div className="row gap-s" style={{ gridColumn: '1 / -1' }}>
              {cur && working && <span className="small muted">{fmtH(cur.hours, true)}{cur.late_minutes ? ` · muộn ${cur.late_minutes} phút` : ''}{cur.early_minutes ? ` · về sớm ${cur.early_minutes} phút` : ''}{cur.ot_hours ? ` · làm thêm ${fq(cur.ot_hours)}g` : ''}</span>}
              <span className="grow" />
              <Btn kind="primary" busy={busy} onClick={() => save({ status: cur?.status || 'di_lam' }, 'Giờ làm')}>Lưu giờ</Btn>
            </div>
            {self && <div className="small muted" style={{ gridColumn: '1 / -1' }}>Giờ làm thêm do quản lý ghi.</div>}
          </div>
        )}
        {err && <Note tone="bad">{err}</Note>}
      </div>
    </Modal>
  );
}

// ---------- tổng hợp công & lương ----------
const congText = (s) => `${fq(s.days)} công${s.half_days ? ` (${s.half_days} nửa ngày)` : ''}`;
function Kpis({ emp }) {
  const s = emp.summary;
  return (
    <div className="kpis kpis-4 att-kpis">
      <div className="kpi key"><span className="kpi-label">Ngày công</span><span className="kpi-value">{fq(s.days)}</span><span className="kpi-sub">{s.half_days ? `${s.half_days} ngày nửa công · ` : ''}chuẩn {s.std_days}</span></div>
      <div className="kpi"><span className="kpi-label">Giờ làm</span><span className="kpi-value">{fmtH(s.hours, true)}</span><span className="kpi-sub">{s.ot_hours ? `làm thêm ${fq(s.ot_hours)} giờ` : 'không làm thêm'}</span></div>
      <div className="kpi"><span className="kpi-label">Nghỉ</span><span className="kpi-value">{s.leave_days + s.absent_days}</span><span className="kpi-sub">{s.leave_days} có phép · {s.absent_days} không phép</span></div>
      <div className="kpi"><span className="kpi-label">Đi muộn / về sớm</span><span className="kpi-value">{s.lates}</span><span className="kpi-sub">{s.self_count} lần tự chấm</span></div>
    </div>
  );
}

function PayCard({ emp, title = 'Lương tạm tính tháng này' }) {
  const p = emp.pay; const s = emp.summary;
  if (!p) return null;
  const paid = p.rate ? Math.round((p.base * s.std_days) / p.rate * 100) / 100 : 0; // số công được trả (gồm ngày phép nếu thiết lập tính công)
  const base = p.type === 'ngay_cong' ? `${money(p.rate)} ÷ ${s.std_days} × ${fq(paid)} công${paid > s.days ? ` (gồm ${fq(paid - s.days)} ngày phép)` : ''}` : p.type === 'ca' ? `${money(p.rate)} × ${fq(s.shifts)} ca`
    : p.type === 'gio' ? `${money(p.rate)} × ${fq(s.hours)} giờ` : 'Cố định mỗi kỳ';
  const lines = [['Lương chính', p.base, `${PAY_TYPE[p.type] || ''} · ${base}`], ['Làm thêm', p.ot], ['Thưởng doanh thu', p.bonus], ['Hoa hồng', p.commission], ['Phụ cấp', p.allowance], ['Giảm trừ', -p.deduction]]
    .filter(([, v], i) => i === 0 || v);
  return (
    <section className="card stack-s">
      <div className="row"><b className="grow">{title}</b><span className="kpi-value att-total">{money(p.total)} đ</span></div>
      {lines.map(([l, v, sub]) => (
        <div key={l} className="row att-payline"><span className="grow">{l}{sub && <div className="small muted">{sub}</div>}</span><span className={v < 0 ? 'bad' : ''}>{v < 0 ? `−${money(-v)}` : money(v)}</span></div>
      ))}
      <div className="small muted">Tạm tính theo chấm công đến hôm nay; số chính thức theo bảng lương chủ cửa hàng chốt.</div>
    </section>
  );
}

// Link trang chấm công để nhân viên lưu lại / chủ gửi cho nhân viên (đăng nhập xong mở thẳng trang này)
export const attLink = () => `${location.origin}${location.pathname}#cham-cong-cua-toi`;
export function CopyAttLink({ label = 'Link chấm công' }) {
  const { toast } = useApp();
  const link = attLink();
  const box = React.useRef(null);
  // Cách cũ (chọn chữ trong ô + lệnh copy) khi trình duyệt chặn API bộ nhớ tạm (trang http, khung nhúng, chưa cấp quyền)
  const legacyCopy = () => { const el = box.current; if (!el) return false; el.focus(); el.select(); try { return document.execCommand('copy'); } catch (e) { return false; } };
  const copy = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch (e) { ok = legacyCopy(); }
    toast(ok ? 'Đã chép link chấm công' : 'Trình duyệt chặn chép tự động — bấm vào ô link rồi Ctrl+C', ok ? undefined : 'err');
  };
  return (
    <div className="att-link">
      <span className="small muted">{label}</span>
      <input ref={box} readOnly value={link} aria-label={label} onFocus={(e) => e.target.select()} />
      <Btn small icon="copy" onClick={copy}>Sao chép</Btn>
    </div>
  );
}

// ---------- TRANG CỦA NHÂN VIÊN ----------
function ClockCard({ data, emp }) {
  const { run, busy } = useAction();
  const [now, setNow] = useState(nowHM());
  useEffect(() => { const t = setInterval(() => setNow(nowHM()), 15000); return () => clearInterval(t); }, []);
  const rows = entriesOf(data, emp.id, data.today);
  const open = rows.find((r) => WORKING.includes(r.status) && r.check_in && !r.check_out);
  const done = rows.filter((r) => r.check_in && r.check_out);
  const off = rows.find((r) => !WORKING.includes(r.status));
  const sched = schedOf(data, emp.id, data.today);
  const locked = lockOf(data, emp.id, data.today);
  return (
    <section className="card att-clock">
      <div className="grow stack-s">
        <div className="small muted">{dayName(data.today)}{sched.length ? ` · lịch: ${sched.map((s) => `${s.name} ${s.start_time}–${s.end_time}`).join(', ')}` : ''}</div>
        <div className="att-now"><Icon name="clock" size={22} />{now}</div>
        <div className="small">
          {open ? <>Đang trong ca{open.shift_name ? ` ${open.shift_name}` : ''} từ <b>{open.check_in}</b>{open.late_minutes ? <span className="warn"> · muộn {open.late_minutes} phút</span> : ''}</>
            : off ? <>Hôm nay: <b>{ST[off.status].label}</b></>
              : done.length ? <>Đã chấm: {done.map((r) => `${r.check_in}–${r.check_out}`).join(', ')}</> : 'Chưa vào ca hôm nay'}
        </div>
      </div>
      {!locked && (open
        ? <Btn kind="primary" className="att-big" busy={busy} icon="out" onClick={() => run('att_clock', { action: 'out' }, (x) => `Đã ra ca lúc ${x.check_out}`)}>Ra ca</Btn>
        : <Btn kind="primary" className="att-big" busy={busy} icon="in" disabled={!!off} onClick={() => run('att_clock', { action: 'in' }, (x) => `Đã vào ca lúc ${x.check_in}${x.shift ? ` (${x.shift})` : ''}${x.late > 0 ? ` · muộn ${x.late} phút` : ''}`)}>Vào ca</Btn>)}
    </section>
  );
}

export function MyAttendancePage() {
  const { month, setMonth, q, data } = useMonth();
  const [pick, setPick] = useState(null);
  const emp = data?.employees.find((e) => e.id === data.me_id);
  return (
    <div className="stack">
      <div className="page-head"><div className="grow"><h1 className="page-title">Chấm công của tôi</h1></div><MonthNav month={month} setMonth={setMonth} /></div>
      <CopyAttLink label="Link chấm công của bạn (lưu lại để mở nhanh)" />
      <ErrorBox error={q.error} />
      {!data ? <Loading /> : !data.linked ? (
        <Note tone="warn">Tài khoản của bạn chưa gắn với hồ sơ nhân viên nào nên chưa chấm công được. Nhờ chủ cửa hàng mở Nhân viên › Danh sách nhân viên, chọn tên bạn và gắn ô “Tài khoản đăng nhập”.</Note>
      ) : (
        <>
          {month === data.today.slice(0, 7) && <ClockCard data={data} emp={emp} />}
          <div className="att-layout">
            <section className="card stack-s">
              <div className="row"><b className="grow">Bảng công tháng {Number(month.slice(5))}/{month.slice(0, 4)}</b><span className="small muted">Bấm vào ngày để chấm</span></div>
              <MonthGrid data={data} emp={emp} onPick={setPick} />
              <Legend />
            </section>
            <div className="stack">
              <Kpis emp={emp} />
              <PayCard emp={emp} title={month === data.today.slice(0, 7) ? 'Lương tạm tính tháng này' : 'Lương tạm tính tháng'} />
            </div>
          </div>
          <section className="card stack-s">
            <b>Phiếu lương</b>
            <Table dense rows={data.payslips} empty="Chưa có bảng lương nào" columns={[
              { key: 'c', label: 'Bảng lương', render: (l) => <><div className="cell-main">{l.name}</div><div className="cell-sub">{l.code} · {dmy(l.period_from)} – {dmy(l.period_to)}</div></> },
              { key: 'b', label: 'Lương chính', align: 'right', render: (l) => money(l.base) },
              { key: 'o', label: 'Cộng thêm', align: 'right', render: (l) => money(l.ot + l.bonus + l.commission + l.allowance + Math.max(0, l.adjust)) },
              { key: 'd', label: 'Trừ', align: 'right', render: (l) => money(l.deduction + Math.max(0, -l.adjust)) },
              { key: 't', label: 'Thực nhận', align: 'right', render: (l) => <b>{money(l.total)}</b> },
              { key: 's', label: 'Trạng thái', render: (l) => (l.status === 'tam' ? <Pill tone="warn">Tạm tính</Pill> : l.unpaid > 0 ? <Pill tone="info">Chờ trả {money(l.unpaid)}</Pill> : <Pill tone="good">Đã trả</Pill>) },
            ]} />
          </section>
        </>
      )}
      {pick && emp && <DayEditor data={data} emp={emp} date={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

// ---------- TRANG CỦA CHỦ / NHÂN SỰ ----------
export function AttendanceBoardPage(props) {
  const { open } = useApp();
  const { month, setMonth, q, data } = useMonth();
  const { run, busy } = useAction();
  const [tab, setTab] = usePageTab(props, 'tong-hop');
  const [search, setSearch] = useState('');
  const [pick, setPick] = useState(null);
  const emps = data?.employees || [];
  const emp = emps.find((e) => e.id === tab);
  const rows = emps.filter((e) => match(`${e.code} ${e.name} ${e.title || ''}`, search));
  const pay = !!data?.can_pay;
  const missing = (e) => {
    let n = 0;
    for (let d = data.from; d <= data.to && d <= data.today; d = addDays(d, 1)) if (expected(data, e.id, d) && !entriesOf(data, e.id, d).length) n += 1;
    return n;
  };
  const xlsx = () => exportXlsx(`bang-cong-${month}.xlsx`, [{ name: `Công ${month}`, rows: emps.map((e) => ({ code: e.code, name: e.name, ...e.summary, total: e.pay?.total })), columns: [
    { key: 'code', label: 'Mã' }, { key: 'name', label: 'Nhân viên' }, { key: 'days', label: 'Ngày công' }, { key: 'half_days', label: 'Nửa ngày' }, { key: 'leave_days', label: 'Nghỉ có phép' },
    { key: 'absent_days', label: 'Nghỉ không phép' }, { key: 'hours', label: 'Giờ làm' }, { key: 'ot_hours', label: 'Làm thêm (giờ)' }, { key: 'lates', label: 'Muộn / sớm' },
    { key: 'self_count', label: 'Lần tự chấm' }, ...(pay ? [{ key: 'total', label: 'Lương tạm tính' }] : [])] }]);
  return (
    <div className="stack">
      <div className="page-head"><div className="grow"><h1 className="page-title">Bảng chấm công</h1></div>
        <MonthNav month={month} setMonth={setMonth} />
        <Btn icon="check" busy={busy} disabled={!data || data.from > data.today} onClick={() => run('fill_timesheets', { from: data.from, to: data.to }, (x) => `Đã chấm ${x.created} ca theo lịch`)}>Chấm theo lịch</Btn>
        <Btn icon="dl" disabled={!data} onClick={xlsx}>Xuất Excel</Btn>
        {pay && <Btn kind="primary" icon="cash" onClick={() => open('paysheet-new', {})}>Lập bảng lương</Btn>}
      </div>
      <ErrorBox error={q.error} />
      {!data ? <Loading /> : (
        <>
          <Tabs value={emp ? tab : 'tong-hop'} onChange={setTab} tabs={[{ value: 'tong-hop', label: 'Tổng hợp' }, ...emps.map((e) => ({ value: e.id, label: e.name }))]} />
          {!emp ? (
            <section className="card stack-s">
              <div className="row gap"><Search value={search} onChange={setSearch} placeholder="Tìm nhân viên" /><span className="grow" />
                {pay && <span className="small muted">Tổng lương tạm tính: <b>{money(emps.reduce((s, e) => s + (e.pay?.total || 0), 0))} đ</b></span>}</div>
              <CopyAttLink label="Link chấm công gửi cho nhân viên" />
              <Table rows={rows} empty="Chưa có nhân viên — thêm ở Nhân viên › Danh sách nhân viên" onRow={(e) => setTab(e.id)} columns={[
                { key: 'n', label: 'Nhân viên', render: (e) => <><div className="cell-main">{e.name}{!e.active && <> <Pill tone="mute">đã nghỉ</Pill></>}</div>
                  <div className="cell-sub">{e.code}{e.title ? ` · ${e.title}` : ''}{!e.linked ? ' · chưa gắn tài khoản' : ''}</div></> },
                { key: 'c', label: 'Ngày công', align: 'right', render: (e) => <b>{fq(e.summary.days)}</b> },
                { key: 'h', label: 'Giờ làm', align: 'right', render: (e) => fmtH(e.summary.hours) },
                { key: 'o', label: 'Làm thêm', align: 'right', render: (e) => (e.summary.ot_hours ? `${fq(e.summary.ot_hours)}g` : '—') },
                { key: 'p', label: 'Nghỉ (phép / không)', align: 'right', render: (e) => `${e.summary.leave_days} / ${e.summary.absent_days}` },
                { key: 'l', label: 'Muộn / sớm', align: 'right', render: (e) => (e.summary.lates ? <span className="warn">{e.summary.lates}</span> : '0') },
                { key: 'm', label: 'Chưa chấm', align: 'right', render: (e) => { const n = missing(e); return n ? <span className="bad">{n} ngày</span> : <span className="good">Đủ</span>; } },
                { key: 's', label: 'Tự chấm', align: 'right', render: (e) => e.summary.self_count },
                ...(pay ? [{ key: 't', label: 'Lương tạm tính', align: 'right', render: (e) => <b>{money(e.pay.total)}</b> }] : []),
              ]} />
              <div className="small muted">Bấm vào một người để xem lưới công từng ngày và sửa. “Chưa chấm” = ngày có lịch làm (hoặc T2–T7 nếu chưa xếp lịch) đến hôm nay mà chưa có chấm công.</div>
            </section>
          ) : (
            <div className="att-layout">
              <section className="card stack-s">
                <div className="row gap-s"><b className="grow">{emp.name} · {congText(emp.summary)}</b>
                  {!emp.linked && <Pill tone="warn">Chưa gắn tài khoản — chưa tự chấm được</Pill>}</div>
                <MonthGrid data={data} emp={emp} onPick={setPick} />
                <Legend />
              </section>
              <div className="stack"><Kpis emp={emp} />{pay && <PayCard emp={emp} title="Lương tạm tính" />}</div>
            </div>
          )}
        </>
      )}
      {pick && emp && <DayEditor data={data} emp={emp} date={pick} onClose={() => setPick(null)} />}
    </div>
  );
}
