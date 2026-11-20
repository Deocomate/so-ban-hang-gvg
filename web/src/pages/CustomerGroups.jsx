import React, { useMemo, useState } from 'react';
import { useApp, useAction, useQ, useRpcData } from '../lib/store.jsx';
import { DocsBoardMini, DocsBoardTable, Legend } from './OrderDocs.jsx';
import { money, match } from '../lib/format.js';
import { useCustomers } from '../lib/lookups.js';
import { isCompany, custExtra } from '../lib/docs/model.js';
import { useTimeFilter, TimeFilter, dateFilters } from '../components/DocFilters.jsx';
import { Btn, Pill, Field, Input, TextArea, Select, NumInput, Search, ErrorBox, Note, Table, Modal, ConfirmBtn, Picker, ListPage, FilterBox, RadioList, Tabs, Loading } from '../components/ui.jsx';

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

// Nhóm khách hàng: chia theo Công ty / Khách lẻ (công ty = loại khách "Công ty" hoặc có mã số thuế), xem theo tháng / năm.
// Nhóm công ty kiểm tra nhanh giấy tờ đơn hàng (hợp đồng, biên bản, CN xuất xưởng, hóa đơn VAT) ngay tại đây.
// Nhóm tùy chỉnh cũ (giảm giá, bảng giá theo nhóm) vẫn giữ để không mất thiết lập giá, mở ở nút "Nhóm giảm giá / bảng giá".
export function CustomerGroupsPage() {
  const { can, open } = useApp();
  const customers = useCustomers();
  const time = useTimeFilter('month');
  const orders = useQ('sales_orders', dateFilters('order_date', time), 'order_date desc', 20000, can('xem_ban_hang'));
  const board = useRpcData('order_docs_board', { track: 'on' }, can('xem_ban_hang'));
  const [seg, setSeg] = useState('cty'); const [by, setBy] = useState('mua'); const [view, setView] = useState('list'); const [search, setSearch] = useState('');
  const [docsOf, setDocsOf] = useState(null); const [oldGroups, setOldGroups] = useState(false);
  const allTime = !time.from && !time.to;
  // Đơn trong kỳ theo khách (bỏ đơn nháp, đã hủy)
  const stats = useMemo(() => {
    const m = {};
    for (const o of orders.data || []) {
      if (!o.customer_id || o.status === 'huy' || o.status === 'nhap') continue;
      const x = m[o.customer_id] || (m[o.customer_id] = { n: 0, total: 0 }); x.n++; x.total += o.order_total || 0;
    }
    return m;
  }, [orders.data]);
  // Giấy tờ của các đơn đang theo dõi, trong kỳ
  const docRows = useMemo(() => (board.data || []).filter((r) => time.inRange(r.order_date)), [board.data, time.from, time.to]);
  const docsBy = useMemo(() => { const m = {}; for (const r of docRows) { const x = m[r.customer_id] || (m[r.customer_id] = { n: 0, miss: 0 }); x.n++; if (r.missing) x.miss++; } return m; }, [docRows]);
  const people = useMemo(() => (customers.data || []).map((c) => ({ ...c, company: isCompany(c), mst: custExtra(c).tax_code || '', st: stats[c.id] || { n: 0, total: 0 }, docs: docsBy[c.id] })), [customers.data, stats, docsBy]);
  // Trong kỳ: khách có mua (mặc định) hoặc khách mới tạo; "Toàn thời gian" thì hiện tất cả khách
  const inTime = people.filter((c) => allTime || (by === 'moi' ? time.inRange(c.created_at) : c.st.n > 0));
  const rows = inTime.filter((c) => (!seg || (seg === 'cty') === c.company) && match(`${c.name} ${c.code} ${c.phone || ''} ${c.mst}`, search));
  const segDocs = docRows.filter((r) => r.company);
  const missingDocs = segDocs.filter((r) => r.missing > 0);
  const sum = (k) => rows.reduce((s, c) => s + (k === 'n' ? c.st.n : k === 'total' ? c.st.total : c.receivable || 0), 0);
  const companies = seg === 'cty';
  return (
    <ListPage title="Nhóm khách hàng" sub="Công ty và khách lẻ theo thời gian"
      filters={<>
        <FilterBox title="Nhóm"><RadioList value={seg} onChange={(v) => { setSeg(v); if (v !== 'cty') setView('list'); }} options={[
          { value: 'cty', label: 'Công ty', count: inTime.filter((c) => c.company).length }, { value: 'le', label: 'Khách lẻ', count: inTime.filter((c) => !c.company).length },
          { value: '', label: 'Tất cả', count: inTime.length }]} /></FilterBox>
        <TimeFilter filter={time} />
        {!allTime && <FilterBox title="Khách trong kỳ"><RadioList value={by} onChange={setBy} options={[{ value: 'mua', label: 'Có mua hàng trong kỳ' }, { value: 'moi', label: 'Khách mới tạo trong kỳ' }]} /></FilterBox>}
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm tên, mã, SĐT, mã số thuế…" />}
      actions={can('danh_muc') && <Btn icon="tag" onClick={() => setOldGroups(true)}>Nhóm giảm giá / bảng giá</Btn>}>
      <ErrorBox error={customers.error || orders.error} />
      <div className="kpis kpis-4">
        <div className="kpi key"><span className="kpi-label">{companies ? 'Công ty' : seg === 'le' ? 'Khách lẻ' : 'Khách hàng'}</span><span className="kpi-value">{rows.length}</span><span className="kpi-sub">{allTime ? 'toàn bộ' : by === 'moi' ? 'mới tạo trong kỳ' : 'có mua trong kỳ'}</span></div>
        <div className="kpi"><span className="kpi-label">Số đơn</span><span className="kpi-value">{sum('n')}</span><span className="kpi-sub">trong kỳ, không tính đơn hủy</span></div>
        <div className="kpi"><span className="kpi-label">Doanh số</span><span className="kpi-value">{money(sum('total'))}</span><span className="kpi-sub">tổng giá trị đơn trong kỳ</span></div>
        {companies ? <div className="kpi"><span className="kpi-label">Giấy tờ đơn hàng</span><span className="kpi-value">{missingDocs.length ? `${missingDocs.length} đơn thiếu` : 'Đủ'}</span>
          <span className="kpi-sub">{segDocs.length} đơn công ty đang theo dõi{segDocs.length > 0 && <> · <button className="link-btn small" onClick={() => setView('docs')}>kiểm tra</button></>}</span></div>
          : <div className="kpi"><span className="kpi-label">Công nợ</span><span className="kpi-value">{money(sum('debt'))}</span><span className="kpi-sub">hiện tại</span></div>}
      </div>
      {companies && <Tabs value={view} onChange={setView} tabs={[{ value: 'list', label: 'Danh sách công ty' }, { value: 'docs', label: `Kiểm tra giấy tờ${missingDocs.length ? ` (${missingDocs.length} thiếu)` : ''}` }]} />}
      {view === 'docs' && companies ? <CompanyDocs rows={segDocs} search={search} loading={board.loading && !board.data} error={board.error} />
        : <Table rows={customers.data && orders.data ? rows : null} empty={allTime ? 'Chưa có khách hàng' : 'Không có khách nào trong khoảng thời gian này'} onRow={(c) => open('party-detail', { type: 'kh', id: c.id })} columns={[
          { key: 'n', label: 'Khách hàng', render: (c) => <><div className="cell-main">{c.name}</div><div className="cell-sub">{[c.code, c.phone].filter(Boolean).join(' · ')}</div></> },
          { key: 't', label: 'Loại', render: (c) => (c.company ? <><Pill tone="info">Công ty</Pill>{c.mst && <div className="cell-sub">MST {c.mst}</div>}</> : <Pill>Khách lẻ</Pill>) },
          { key: 'o', label: 'Đơn trong kỳ', align: 'right', render: (c) => c.st.n || '—' },
          { key: 's', label: 'Doanh số trong kỳ', align: 'right', render: (c) => (c.st.total ? money(c.st.total) : '—') },
          { key: 'r', label: 'Công nợ', align: 'right', render: (c) => money(c.receivable) },
          ...(seg !== 'le' ? [{ key: 'g', label: 'Giấy tờ', render: (c) => (!c.docs ? <span className="muted small">—</span>
            : <button className="link-btn" onClick={(e) => { e.stopPropagation(); setDocsOf(c); }} title="Kiểm tra giấy tờ các đơn của khách">
              {c.docs.miss ? <Pill tone="bad">{c.docs.miss}/{c.docs.n} đơn thiếu</Pill> : <Pill tone="good">{c.docs.n} đơn đủ</Pill>}</button>) }] : []),
        ]} />}
      {docsOf && <Modal title={`Giấy tờ đơn hàng · ${docsOf.name}`} onClose={() => setDocsOf(null)} size="xl" footer={<Btn onClick={() => setDocsOf(null)}>Đóng</Btn>}>
        <DocsBoardMini params={{ customer_id: docsOf.id }} showCustomer={false} />
      </Modal>}
      {oldGroups && <CustomGroupsDialog onClose={() => setOldGroups(false)} />}
    </ListPage>
  );
}

// Kiểm tra nhanh giấy tờ các đơn của khách công ty trong kỳ: còn thiếu / đủ / tất cả
function CompanyDocs({ rows: all, search, loading, error }) {
  const [st, setSt] = useState('thieu');
  const rows = all.filter((r) => (!st || (st === 'thieu' ? r.missing > 0 : !r.missing)) && match(`${r.code} ${r.customer_name} ${r.contract_code || ''}`, search));
  return (
    <div className="stack-s">
      <div className="row gap-s wrap">
        {[['thieu', 'Còn thiếu', all.filter((r) => r.missing > 0).length], ['du', 'Đủ giấy tờ', all.filter((r) => !r.missing).length], ['', 'Tất cả', all.length]].map(([v, l, n]) =>
          <button key={v} type="button" className={`chip${st === v ? ' on' : ''}`} onClick={() => setSt(v)}>{l} ({n})</button>)}
        <span className="grow" /><Legend />
      </div>
      {loading ? <Loading /> : <DocsBoardTable rows={rows} error={error} />}
    </div>
  );
}

// Nhóm tùy chỉnh cũ: giữ để quản lý giảm giá / bảng giá theo nhóm đã thiết lập
function CustomGroupsDialog({ onClose }) {
  const { settings, can, open, loadBooks } = useApp();
  const customers = useCustomers();
  const { run, busy } = useAction();
  const info = settings.customer_group_info || {};
  const all = customers.data || [];
  const groups = [...new Set([...(settings.customer_groups || []), ...all.map((c) => c.kind).filter(Boolean)])].map((name) => {
    const mem = all.filter((c) => c.kind === name);
    return { id: name, name, info: info[name], count: mem.length };
  });
  return (
    <Modal title="Nhóm giảm giá / bảng giá" subtitle="Nhóm tự đặt để áp giảm giá và bảng giá riêng khi lập đơn" onClose={onClose} size="lg"
      footer={<>{can('danh_muc') && <><Btn icon="refresh" busy={busy} onClick={async () => { const r = await run('refresh_customer_groups', {}, (x) => `Đã cập nhật: thêm ${x.added}, bỏ ${x.removed} khách`); if (r) loadBooks(); }}>Cập nhật theo điều kiện</Btn>
        <Btn icon="plus" onClick={() => open('customer-group', {})}>Thêm nhóm</Btn></>}<span className="grow" /><Btn onClick={onClose}>Đóng</Btn></>}>
      <ErrorBox error={customers.error} />
      <Table rows={customers.data ? groups : null} empty="Chưa có nhóm tự đặt" onRow={(g) => open('customer-group', { name: g.name })} columns={[
        { key: 'n', label: 'Tên nhóm', render: (g) => <><div className="cell-main">{g.name}</div>{g.info?.note && <div className="cell-sub">{g.info.note}</div>}</> },
        { key: 'c', label: 'Điều kiện', render: (g) => <span className="small">{condText(g.info) || '—'}</span> },
        { key: 'k', label: 'Số khách', align: 'right', render: (g) => g.count },
        { key: 'd', label: 'Giảm giá', align: 'right', render: (g) => (discountText(g.info) ? <Pill tone="accent">{discountText(g.info)}</Pill> : '—') },
      ]} />
    </Modal>
  );
}

export function CustomerGroupForm({ name: name0, onClose }) {
  const { settings, can, loadBooks } = useApp();
  const customers = useCustomers();
  const { run, busy } = useAction();
  const i0 = (name0 && settings.customer_group_info?.[name0]) || {};
  const [f, setF] = useState({ name: name0 || '', discount: i0.discount || null, discount_type: i0.discount_type || 'vnd', note: i0.note || '',
    conds: i0.conds || [], days: String(i0.days || 0), auto_add: i0.auto_add ?? true, auto_remove: i0.auto_remove ?? false, docs_track: i0.docs_track || '' });
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
      <Field label="Theo dõi giấy tờ đơn hàng của khách trong nhóm" hint="Khách hoặc từng đơn vẫn có thể đặt riêng">
        <Select value={f.docs_track} onChange={(v) => set('docs_track', v)} options={[{ value: '', label: 'Tự động: theo dõi khi khách cần xuất hóa đơn VAT' },
          { value: 'on', label: 'Luôn theo dõi (hợp đồng, biên bản, CN xuất xưởng, hóa đơn VAT)' }, { value: 'off', label: 'Không theo dõi' }]} /></Field>
      <Field label="Ghi chú"><TextArea value={f.note} onChange={(v) => set('note', v)} rows={2} /></Field>
      {name0 && <div className="stack" style={{ gap: 8 }}>
        <div className="field-label">Giấy tờ đơn hàng của nhóm</div>
        <DocsBoardMini params={{ group: name0 }} />
      </div>}
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
