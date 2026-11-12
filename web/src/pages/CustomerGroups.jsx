// Nhóm khách hàng: danh sách nhóm, giảm giá theo nhóm (tự áp khi lập đơn), điều kiện tự thêm / tự bỏ khách, thành viên nhóm.
import React, { useState } from 'react';
import { useApp, useAction } from '../lib/store.jsx';
import { money, match } from '../lib/format.js';
import { useCustomers } from '../lib/lookups.js';
import { Btn, Pill, Field, Input, TextArea, Select, NumInput, Search, ErrorBox, Note, Table, Modal, ConfirmBtn, Picker, ListPage, FilterBox, RadioList } from '../components/ui.jsx';

const FIELDS = [{ value: 'orders', label: 'Số lần mua hàng' }, { value: 'total', label: 'Tổng bán' }, { value: 'net', label: 'Tổng bán trừ trả hàng' },
  { value: 'debt', label: 'Công nợ hiện tại' }, { value: 'area', label: 'Khu vực (địa chỉ có chứa)' }];
const OPS = [{ value: 'gte', label: 'Lớn hơn hoặc bằng' }, { value: 'lte', label: 'Nhỏ hơn hoặc bằng' }];
const DAYS = [{ value: '0', label: 'Toàn thời gian' }, { value: '30', label: '30 ngày gần nhất' }, { value: '90', label: '90 ngày gần nhất' },
  { value: '180', label: '180 ngày gần nhất' }, { value: '365', label: '365 ngày gần nhất' }];
const fieldLabel = (v) => FIELDS.find((x) => x.value === v)?.label || v;
const condText = (info) => (info?.conds?.length
  ? info.conds.map((c) => (c.field === 'area' ? `Địa chỉ có “${c.value}”` : `${fieldLabel(c.field)} ${c.op === 'gte' ? '≥' : '≤'} ${c.field === 'orders' ? c.value : money(c.value)}`)).join(' và ')
    + (info.days ? ` · ${info.days} ngày gần nhất` : '')
  : '');
const discountText = (info) => (info?.discount ? (info.discount_type === 'pct' ? `${info.discount}%` : `${money(info.discount)} đ`) : '');

export function CustomerGroupsPage() {
  const { settings, can, open, loadBooks } = useApp();
  const customers = useCustomers();
  const { run, busy } = useAction();
  const [search, setSearch] = useState(''); const [only, setOnly] = useState('');
  const info = settings.customer_group_info || {};
  const all = customers.data || [];
  const groups = [...new Set([...(settings.customer_groups || []), ...all.map((c) => c.kind).filter(Boolean)])].map((name) => {
    const mem = all.filter((c) => c.kind === name);
    return { id: name, name, info: info[name], count: mem.length, bought: mem.reduce((s, c) => s + (c.total_bought || 0), 0), debt: mem.reduce((s, c) => s + (c.receivable || 0), 0) };
  });
  const rows = groups.filter((g) => match(g.name, search) && (!only || (only === 'auto' ? g.info?.conds?.length : only === 'discount' ? g.info?.discount : !g.count)));
  const ungrouped = all.filter((c) => !c.kind).length;
  return (
    <ListPage title="Nhóm khách hàng"
      filters={<FilterBox title="Lọc"><RadioList value={only} onChange={setOnly} options={[{ value: '', label: 'Tất cả', count: groups.length },
        { value: 'auto', label: 'Có điều kiện tự động', count: groups.filter((g) => g.info?.conds?.length).length },
        { value: 'discount', label: 'Có giảm giá', count: groups.filter((g) => g.info?.discount).length }, { value: 'empty', label: 'Chưa có khách', count: groups.filter((g) => !g.count).length }]} /></FilterBox>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm theo tên nhóm" />}
      actions={can('danh_muc') && <>
        <Btn icon="refresh" busy={busy} onClick={async () => { const r = await run('refresh_customer_groups', {}, (x) => `Đã cập nhật: thêm ${x.added}, bỏ ${x.removed} khách`); if (r) loadBooks(); }}>Cập nhật theo điều kiện</Btn>
        <Btn kind="primary" icon="plus" onClick={() => open('customer-group', {})}>Nhóm khách hàng</Btn>
      </>}>
      <ErrorBox error={customers.error} />
      {ungrouped > 0 && <Note>{ungrouped} khách hàng chưa thuộc nhóm nào.</Note>}
      <Table rows={customers.data ? rows : null} empty="Chưa có nhóm khách hàng" onRow={(g) => open('customer-group', { name: g.name })} columns={[
        { key: 'n', label: 'Tên nhóm', render: (g) => <><div className="cell-main">{g.name}</div>{g.info?.note && <div className="cell-sub">{g.info.note}</div>}</> },
        { key: 'c', label: 'Điều kiện', render: (g) => <span className="small">{condText(g.info) || '—'}</span> },
        { key: 'k', label: 'Số lượng khách hàng', align: 'right', render: (g) => g.count },
        { key: 'd', label: 'Giảm giá', align: 'right', render: (g) => (discountText(g.info) ? <Pill tone="accent">{discountText(g.info)}</Pill> : '—') },
        { key: 'b', label: 'Tổng bán', align: 'right', render: (g) => money(g.bought) },
        { key: 'r', label: 'Công nợ', align: 'right', render: (g) => money(g.debt) },
      ]} />
    </ListPage>
  );
}

export function CustomerGroupForm({ name: name0, onClose }) {
  const { settings, can, loadBooks } = useApp();
  const customers = useCustomers();
  const { run, busy } = useAction();
  const i0 = (name0 && settings.customer_group_info?.[name0]) || {};
  const [f, setF] = useState({ name: name0 || '', discount: i0.discount || null, discount_type: i0.discount_type || 'vnd', note: i0.note || '',
    conds: i0.conds || [], days: String(i0.days || 0), auto_add: i0.auto_add ?? true, auto_remove: i0.auto_remove ?? false });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setC = (i, patch) => setF((s) => ({ ...s, conds: s.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const members = (customers.data || []).filter((c) => name0 && c.kind === name0);
  const others = (customers.data || []).filter((c) => !name0 || c.kind !== name0);
  const edit = can('danh_muc');
  const save = async () => {
    const r = await run('save_customer_group', { old_name: name0 || null, ...f, days: Number(f.days) },
      (x) => `Đã lưu nhóm ${x.name}${x.added || x.removed ? ` · thêm ${x.added}, bỏ ${x.removed} khách` : ''}`);
    if (r) { await loadBooks(); onClose(); }
  };
  const setMember = (id, g) => run('set_customer_group', { customer_ids: [id], name: g }, g ? 'Đã thêm vào nhóm' : 'Đã bỏ khỏi nhóm');
  return (
    <Modal title={name0 ? `Nhóm ${name0}` : 'Tạo nhóm khách hàng'} onClose={onClose} size="lg"
      footer={edit && <>
        {name0 && <ConfirmBtn kind="danger" icon="x" busy={busy} onConfirm={async () => { if (await run('delete_customer_group', { name: name0 }, 'Đã xóa nhóm')) { await loadBooks(); onClose(); } }}>Xóa nhóm</ConfirmBtn>}
        <span className="grow" /><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={save}>{name0 ? 'Lưu' : 'Tạo nhóm'}</Btn></>}>
      <div className="grid">
        <Field label="Tên nhóm" required><Input value={f.name} onChange={(v) => set('name', v)} placeholder="vd. Đại lý cấp 1" autoFocus={!name0} /></Field>
        <Field label="Giảm giá" hint="Tự áp khi lập đơn mới cho khách trong nhóm">
          <div className="row gap-s"><NumInput money={f.discount_type === 'vnd'} min={0} max={f.discount_type === 'pct' ? 100 : undefined} value={f.discount} onChange={(v) => set('discount', v)} style={{ maxWidth: 160 }} />
            {['vnd', 'pct'].map((t) => <button key={t} type="button" className={`chip${f.discount_type === t ? ' on' : ''}`} onClick={() => set('discount_type', t)}>{t === 'vnd' ? 'VND' : '%'}</button>)}</div></Field>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="field-label">Điều kiện thêm khách hàng vào nhóm</div>
        {f.conds.map((c, i) => (
          <div key={i} className="row gap-s" style={{ alignItems: 'flex-end' }}>
            <div style={{ minWidth: 200 }}><Select value={c.field} onChange={(v) => setC(i, { field: v, op: v === 'area' ? 'contains' : 'gte', value: v === 'area' ? '' : null })} options={FIELDS} /></div>
            {c.field !== 'area' && <div style={{ minWidth: 170 }}><Select value={c.op} onChange={(v) => setC(i, { op: v })} options={OPS} /></div>}
            {c.field === 'area'
              ? <Input value={c.value || ''} onChange={(v) => setC(i, { value: v })} placeholder="vd. Hưng Yên" />
              : <NumInput money={c.field !== 'orders'} min={0} value={c.value} onChange={(v) => setC(i, { value: v })} style={{ maxWidth: 170 }} />}
            <Btn small kind="ghost" icon="x" aria-label="Bỏ điều kiện" onClick={() => set('conds', f.conds.filter((_, j) => j !== i))} />
          </div>
        ))}
        {f.conds.length < 5 && <div><Btn small icon="plus" onClick={() => set('conds', [...f.conds, { field: 'total', op: 'gte', value: null }])}>Thêm điều kiện</Btn></div>}
        {f.conds.length > 0 && <>
          <div className="grid">
            <Field label="Thời gian tính số lần mua, tổng bán"><Select value={f.days} onChange={(v) => set('days', v)} options={DAYS} /></Field>
            <Field label="Khi khách mới thỏa mãn điều kiện"><Select value={f.auto_add ? '1' : '0'} onChange={(v) => set('auto_add', v === '1')}
              options={[{ value: '1', label: 'Tự động thêm vào nhóm (khách chưa có nhóm)' }, { value: '0', label: 'Không thêm vào nhóm' }]} /></Field>
            <Field label="Khi khách không còn thỏa mãn điều kiện"><Select value={f.auto_remove ? '1' : '0'} onChange={(v) => set('auto_remove', v === '1')}
              options={[{ value: '1', label: 'Tự động xóa khỏi nhóm' }, { value: '0', label: 'Không xóa khỏi nhóm' }]} /></Field>
          </div>
          <div className="muted small">Mỗi khách thuộc một nhóm nên chỉ khách chưa có nhóm mới được tự thêm. Đơn tính khi đã xác nhận.</div>
        </>}
      </div>
      <Field label="Ghi chú"><TextArea value={f.note} onChange={(v) => set('note', v)} rows={2} /></Field>
      {name0 && <div className="stack" style={{ gap: 8 }}>
        <div className="field-label">Khách trong nhóm ({members.length})</div>
        {edit && <Picker items={others} value="" onChange={(v) => v && setMember(v, name0)} getLabel={(c) => c.name}
          getSub={(c) => [c.code, c.phone, c.kind ? `đang ở nhóm ${c.kind}` : 'chưa có nhóm'].filter(Boolean).join(' · ')} placeholder="Thêm khách vào nhóm" />}
        <Table dense rows={members} empty="Chưa có khách trong nhóm" columns={[
          { key: 'n', label: 'Khách hàng', render: (c) => <><b>{c.name}</b><div className="cell-sub">{[c.code, c.phone].filter(Boolean).join(' · ')}</div></> },
          { key: 'b', label: 'Tổng bán', align: 'right', render: (c) => money(c.total_bought) },
          { key: 'r', label: 'Công nợ', align: 'right', render: (c) => money(c.receivable) },
          ...(edit ? [{ key: 'x', label: '', render: (c) => <Btn small onClick={() => setMember(c.id, null)}>Bỏ khỏi nhóm</Btn> }] : []),
        ]} />
      </div>}
    </Modal>
  );
}
