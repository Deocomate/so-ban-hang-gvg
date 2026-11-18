// Chi phí định kỳ hằng tháng: lịch ngày 1–31, kéo thẻ sang ngày khác để đổi ngày ghi, kéo mẫu nhanh (thuê nhà, Claude AI…) vào 1 ngày để tạo.
import React, { useEffect, useMemo, useState } from 'react';
import { GripVertical, Play, Pause } from 'lucide-react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN, short } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { cats, GROUP_COLORS } from '../lib/expenseCats.js';
import { BrandSplit, SplitMini } from '../components/BrandSplit.jsx';
import { Btn, Pill, Field, Input, Select, NumInput, Check, ErrorBox, Note, Modal, ConfirmBtn, Loading } from '../components/ui.jsx';

// Mẫu nhanh: kéo vào lịch hoặc bấm để tạo
const PRESETS = [
  { name: 'Thuê nhà / cửa hàng', category: 'Thuê nhà / cửa hàng', day: 1 },
  { name: 'Claude AI', category: 'Phần mềm, ứng dụng', day: 1 },
  { name: 'ChatGPT / phần mềm khác', category: 'Phần mềm, ứng dụng', day: 1 },
  { name: 'Internet, điện thoại', category: 'Internet, điện thoại', day: 5 },
  { name: 'Tiền điện', category: 'Tiền điện', day: 10 },
  { name: 'Tiền nước', category: 'Tiền nước', day: 10 },
  { name: 'Lương nhân viên', category: 'Lương', day: 31 },
  { name: 'Phí dịch vụ, an ninh, vệ sinh', category: 'Phí dịch vụ, an ninh, vệ sinh', day: 1 },
];
const dayLabel = (d) => (d >= 31 ? 'cuối tháng' : `ngày ${d}`);
const monthLabel = (m) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '');
const groupIdx = (tree, g) => Math.max(0, tree.findIndex((x) => x.group === g));

export function RecurringPanel() {
  const { open, can, settings } = useApp();
  const tree = cats(settings);
  const q = useQ('expense_recurring', [], 'day', 500);
  const { run, busy } = useAction();
  const [hover, setHover] = useState(null);
  const edit = can('chi_phi');
  const list = q.data || [];
  const live = list.filter((r) => r.active);
  const perMonth = live.reduce((s, r) => s + r.amount, 0);
  const next = live.filter((r) => r.next_date).sort((a, b) => a.next_date.localeCompare(b.next_date))[0];
  const today = Number(todayVN().slice(8, 10));
  const byDay = useMemo(() => {
    const m = {}; for (const r of list) (m[Math.min(r.day, 31)] ||= []).push(r); return m;
  }, [list]);

  const move = (id, day) => {
    const r = list.find((x) => x.id === id);
    if (r && r.day !== day) run('save_recurring', { id, day }, `Đã dời “${r.name}” sang ${dayLabel(day)} hằng tháng`);
  };
  const onDrop = (day) => (e) => {
    e.preventDefault(); setHover(null);
    const id = e.dataTransfer.getData('text/rec-id'); const preset = e.dataTransfer.getData('text/rec-preset');
    if (id) move(id, day);
    else if (preset) open('recurring', { preset: { ...JSON.parse(preset), day } });
  };

  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi rec-kpi"><span className="kpi-label">Chi định kỳ mỗi tháng</span><span className="kpi-value">{money(perMonth)}</span><span className="kpi-sub">{live.length} khoản đang chạy</span></div>
        <div className="kpi rec-kpi"><span className="kpi-label">Kỳ ghi tới</span><span className="kpi-value">{next ? dmy(next.next_date) : '—'}</span><span className="kpi-sub">{next ? `${next.name} · ${money(next.amount)}` : 'Chưa có khoản nào'}</span></div>
        <div className="kpi rec-kpi"><span className="kpi-label">Đã ghi từ định kỳ</span><span className="kpi-value">{short(list.reduce((s, r) => s + (r.total || 0), 0))}</span><span className="kpi-sub">{list.reduce((s, r) => s + (r.runs || 0), 0)} khoản chi phí</span></div>
      </div>
      <Note>Mỗi tháng đến ngày hẹn, phần mềm tự ghi 1 khoản chi phí (và tự lập phiếu chi nếu chọn quỹ trả). Ngày 29–31 ở tháng ngắn hơn sẽ ghi vào ngày cuối tháng.</Note>
      <ErrorBox error={q.error} />
      <div className="rec-wrap">
        {edit && <aside className="rec-presets">
          <div className="field-label">Mẫu nhanh — kéo vào 1 ngày trên lịch</div>
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="rec-preset" draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/rec-preset', JSON.stringify(p)); e.dataTransfer.effectAllowed = 'copy'; }}
              onClick={() => open('recurring', { preset: p })}>
              <GripVertical size={14} /><span>{p.name}</span>
            </button>))}
          <Btn kind="primary" icon="plus" onClick={() => open('recurring', {})}>Khoản định kỳ mới</Btn>
        </aside>}
        <div className="rec-cal" role="grid" aria-label="Lịch ghi chi phí hằng tháng">
          {q.loading && !q.data ? <Loading /> : Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
            const items = byDay[d] || []; const sum = items.filter((r) => r.active).reduce((s, r) => s + r.amount, 0);
            return (
              <div key={d} role="gridcell" className={`rec-day${d === today ? ' today' : ''}${hover === d ? ' over' : ''}`}
                onDragOver={(e) => { if (!edit) return; e.preventDefault(); if (hover !== d) setHover(d); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(null); }} onDrop={onDrop(d)}
                onDoubleClick={() => edit && open('recurring', { preset: { day: d } })}>
                <div className="rec-day-head"><b>{d === 31 ? '31 · cuối' : d}</b>{sum > 0 && <small>{short(sum)}</small>}</div>
                {items.map((r) => (
                  <div key={r.id} className={`rec-card${r.active ? '' : ' off'}`} draggable={edit}
                    style={{ '--gc': GROUP_COLORS[groupIdx(tree, r.expense_group) % GROUP_COLORS.length] }}
                    onDragStart={(e) => { e.dataTransfer.setData('text/rec-id', r.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={() => open('recurring', { id: r.id })} title={`${r.name} · ${money(r.amount)} — kéo sang ngày khác để đổi ngày ghi`}>
                    <span className="rec-card-name">{r.name}</span>
                    <span className="rec-card-amt">{short(r.amount)}</span>
                    <SplitMini split={r.split} />
                  </div>))}
              </div>
            );
          })}
        </div>
      </div>
      {list.length > 0 && <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Khoản định kỳ</th><th>Ngày ghi</th><th>Thời gian</th><th>Trả tiền</th><th>Kỳ tới</th><th className="r">Mỗi kỳ</th><th /></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id} className={r.active ? '' : 'row-void'}>
              <td><div className="cell-main">{r.name}</div><div className="cell-sub">{r.expense_group} · {r.category}</div>{r.split?.length > 0 && <SplitMini split={r.split} />}</td>
              <td>{dayLabel(r.day)}</td>
              <td>từ {monthLabel(r.start_month)}{r.end_month ? ` đến ${monthLabel(r.end_month)}` : ''}<div className="cell-sub">đã ghi {r.runs} kỳ · {money(r.total)}</div></td>
              <td>{r.fund_name ? <Pill tone="good">Tự chi từ {r.fund_name}</Pill> : <Pill tone="warn">Ghi nợ, trả sau</Pill>}</td>
              <td>{!r.active ? <Pill tone="mute">Tạm dừng</Pill> : r.next_date ? dmy(r.next_date) : <Pill tone="mute">Đã hết hạn</Pill>}</td>
              <td className="r">{money(r.amount)}</td>
              <td>{edit && <div className="row gap-s">
                <Btn small onClick={() => run('save_recurring', { id: r.id, active: r.active ? 0 : 1 }, r.active ? 'Đã tạm dừng' : 'Đã chạy lại')}>{r.active ? <Pause size={14} /> : <Play size={14} />}</Btn>
                {r.active && r.next_month === todayVN().slice(0, 7) && <Btn small busy={busy} onClick={() => run('run_recurring', { id: r.id, now: true }, (x) => `Đã ghi ${x.created.join(', ')}`)}>Ghi ngay</Btn>}
                <Btn small onClick={() => open('recurring', { id: r.id })}>Sửa</Btn>
              </div>}</td>
            </tr>))}</tbody>
        </table>
      </div>}
    </div>
  );
}

export function RecurringForm({ id, preset, onClose }) {
  const { settings, can, q: query } = useApp();
  const funds = useFunds(can('thu_chi'));
  const { run, busy } = useAction();
  const tree = cats(settings);
  const groupOfCat = (c) => tree.find((g) => g.items.includes(c))?.group || tree[0].group;
  const p0 = preset || {};
  const [f, setF] = useState({ name: p0.name || '', group: p0.category ? groupOfCat(p0.category) : tree[0].group, category: p0.category || tree[0].items[0], amount: null,
    day: p0.day || 1, start_month: todayVN().slice(0, 7), end_month: '', pay: false, fund_id: '', split: [], active: true, note: '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const [loaded, setLoaded] = useState(!id);
  useEffect(() => { if (!f.fund_id && funds.data?.length) set('fund_id', funds.data[0].id); }, [funds.data]);
  useEffect(() => {
    if (id) query('expense_recurring', [['id', 'eq', id]]).then(([r]) => {
      setF((s) => ({ ...s, name: r.name, group: r.expense_group || groupOfCat(r.category), category: r.category, amount: r.amount, day: r.day, start_month: r.start_month,
        end_month: r.end_month || '', pay: !!r.fund_id, fund_id: r.fund_id || s.fund_id, split: r.split || [], active: !!r.active, note: r.note || '' }));
      setLoaded(true);
    });
  }, [id]);
  const items = tree.find((x) => x.group === f.group)?.items || [];
  const firstDue = (() => {
    const m = f.start_month || todayVN().slice(0, 7);
    const last = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    return `${m}-${String(Math.min(f.day, last)).padStart(2, '0')}`;
  })();
  const save = async () => {
    const r = await run('save_recurring', { id: id || null, name: f.name, category: f.category, expense_group: f.group, amount: f.amount, day: f.day,
      start_month: f.start_month, end_month: f.end_month || null, fund_id: f.pay ? f.fund_id : null, split: f.split, active: f.active ? 1 : 0, note: f.note },
    (x) => (x.created.length ? `Đã lưu và ghi ${x.created.length} kỳ đã đến hạn: ${x.created.join(', ')}` : 'Đã lưu chi phí định kỳ'));
    if (r) onClose();
  };
  return (
    <Modal title={id ? 'Sửa chi phí định kỳ' : 'Chi phí định kỳ mới'} size="lg" onClose={onClose}
      subtitle="Khoản chi lặp lại mỗi tháng (thuê nhà, phần mềm AI, internet, lương…). Đến ngày hẹn phần mềm tự ghi chi phí."
      footer={<>
        {id && <ConfirmBtn kind="danger" busy={busy} onConfirm={async () => { if (await run('delete_recurring', { id }, 'Đã xóa chi phí định kỳ (các kỳ đã ghi vẫn giữ)')) onClose(); }}>Xóa</ConfirmBtn>}
        <span className="grow" />
        <Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} disabled={!loaded} onClick={save}>Lưu</Btn>
      </>}>
      <div className="grid">
        <Field label="Tên khoản" required wide><Input value={f.name} onChange={(v) => set('name', v)} placeholder="vd. Thuê nhà showroom, Claude AI Pro" autoFocus /></Field>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="field-label">Nhóm chi phí</div>
        <div className="row gap-s">{tree.map((g) => <button key={g.group} type="button" className={`chip${f.group === g.group ? ' on' : ''}`}
          onClick={() => setF((s) => ({ ...s, group: g.group, category: g.items[0] || s.category }))}>{g.group}</button>)}</div>
      </div>
      <div className="grid">
        <Field label="Khoản mục" required><Select value={f.category} onChange={(v) => set('category', v)} options={[...new Set([...items, f.category])].map((x) => ({ value: x, label: x }))} /></Field>
        <Field label="Số tiền mỗi tháng" required><NumInput value={f.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Bắt đầu từ tháng"><input className="inp" type="month" value={f.start_month} onChange={(e) => set('start_month', e.target.value)} /></Field>
        <Field label="Đến tháng (bỏ trống = không hạn)"><input className="inp" type="month" value={f.end_month} min={f.start_month} onChange={(e) => set('end_month', e.target.value)} /></Field>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="field-label">Ngày ghi hằng tháng <span className="muted small">· kỳ đầu: {dmy(firstDue)}{firstDue <= todayVN() && !id ? ' (các kỳ đã đến hạn sẽ được ghi ngay khi lưu)' : ''}</span></div>
        <div className="rec-daypick">{Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <button key={d} type="button" className={`rec-dp${f.day === d ? ' on' : ''}`} onClick={() => set('day', d)}>{d === 31 ? 'Cuối' : d}</button>))}</div>
      </div>
      {can('thu_chi') && <div className="row gap"><Check checked={f.pay} onChange={(v) => set('pay', v)}>Tự lập phiếu chi trả luôn từ quỹ</Check>
        {f.pay && <Select value={f.fund_id} onChange={(v) => set('fund_id', v)} options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} style={{ maxWidth: 260 }} />}</div>}
      {!f.pay && <div className="muted small">Không chọn quỹ: mỗi kỳ ghi thành khoản “chưa trả”, khi trả tiền bấm “Trả” ở danh sách chi phí.</div>}
      <BrandSplit value={f.split} onChange={(v) => set('split', v)} amount={f.amount} />
      <div className="grid">
        <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => set('note', v)} /></Field>
      </div>
      {id && <Check checked={f.active} onChange={(v) => set('active', v)}>Đang chạy (bỏ chọn để tạm dừng)</Check>}
    </Modal>
  );
}

