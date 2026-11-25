// Giấy tờ đơn hàng: hợp đồng, biên bản giao hàng, giấy chứng nhận xuất xưởng, hóa đơn VAT — bản bên mình và bản đối tác ký gửi lại.
// Bảng theo dõi (trang riêng, trong hồ sơ khách và nhóm khách), khung giấy tờ của một đơn, xem trước tệp đã tải lên.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useQ, useRpcData, useAction } from '../lib/store.jsx';
import { dmy, match, money } from '../lib/format.js';
import { saveFile } from '../lib/excel.js';
import { CONTRACT_KINDS } from '../lib/docs/contract-templates.js';
import { Btn, Icon, Pill, Field, Input, Select, Check, Search, ErrorBox, Loading, Note, Table, Modal, ConfirmBtn, ListPage, FilterBox, RadioList } from '../components/ui.jsx';

export const DOC_LABEL = { hop_dong: 'Hợp đồng', bien_ban: 'Biên bản giao hàng', cn_xuat_xuong: 'Giấy chứng nhận xuất xưởng', hoa_don_vat: 'Hóa đơn VAT' };
const DOC_SHORT = { hop_dong: 'Hợp đồng', bien_ban: 'Biên bản GH', cn_xuat_xuong: 'CN xuất xưởng', hoa_don_vat: 'Hóa đơn VAT' };
const DOC_KEYS = Object.keys(DOC_LABEL);
const SIDE_LABEL = { minh: 'Bên mình', doi_tac: 'Đối tác ký' };
const SIDE_HINT = { minh: 'Bản do mình lập / ký', doi_tac: 'Bản đối tác ký, đóng dấu gửi lại' };
export const STATE = { tai_len: ['Đã tải lên', 'good'], da_lap: ['Đã lập', 'info'], ban_giay: ['Có bản giấy', 'warn'], thieu: ['Còn thiếu', 'bad'], khong_can: ['Không cần', 'mute'] };
const TRACK_BY = { order: 'đặt riêng cho đơn này', customer: 'theo hồ sơ khách hàng', group: 'theo nhóm khách hàng', auto: 'tự động: khách cần xuất hóa đơn VAT' };
const TRACK_OPTS = { auto: 'Theo mặc định', on: 'Luôn theo dõi', off: 'Không theo dõi' };

const readB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error(`Không đọc được tệp ${file.name}`)); r.readAsDataURL(file); });

// Link Google Docs / Sheets / Drive → địa chỉ xem trước nhúng được
export function googlePreview(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)google\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(document|spreadsheets|presentation|file)\/d\/([\w-]+)/);
    if (m) return `https://${u.hostname}/${m[1]}/d/${m[2]}/preview`;
    return null;
  } catch (e) { return null; }
}

// Ô trạng thái nhỏ trong bảng theo dõi
function Slot({ side, s }) {
  const [label, tone] = STATE[s.state];
  return <span className={`dslot ds-${tone}`} title={`${SIDE_LABEL[side]}: ${label}${s.auto ? ` (${s.auto})` : ''}`}>{side === 'minh' ? 'Mình' : 'Đối tác'}</span>;
}
const DocCell = ({ slot }) => (slot.skip ? <span className="muted small">Không cần</span> : <span className="row gap-xs">{Object.entries(slot.sides).map(([k, s]) => <Slot key={k} side={k} s={s} />)}</span>);
export const Legend = () => <div className="row gap-s small muted wrap">{Object.entries(STATE).map(([k, [l, t]]) => <span key={k} className="row gap-xs"><span className={`dslot ds-${t}`}>&nbsp;</span>{l}</span>)}</div>;

// Bảng theo dõi giấy tờ: params = {track, customer_id?, group?}
export function DocsBoardTable({ rows, error, showCustomer = true, onTrack }) {
  const { open, can } = useApp();
  const [needFor, setNeedFor] = useState(null);
  const edit = can('ban_hang');
  return (
    <>
      <ErrorBox error={error} />
      {needFor && <NeedDialog row={needFor} onClose={() => setNeedFor(null)} />}
      <Table rows={rows} empty="Không có đơn nào" onRow={(r) => open('order-docs', { order_id: r.id })} columns={[
        { key: 'o', label: 'Đơn hàng', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.order_date)} · {money(r.order_total)}</div></> },
        ...(showCustomer ? [{ key: 'k', label: 'Khách hàng', render: (r) => <>{r.customer_name || '—'}<div className="cell-sub">{r.company ? 'Công ty' : 'Khách lẻ'}</div></> }] : []),
        ...DOC_KEYS.map((k) => ({ key: k, label: DOC_SHORT[k], render: (r) => <><DocCell slot={r.slots[k]} />{k === 'hop_dong' && r.contract_kind && <div className="cell-sub">{CONTRACT_KINDS[r.contract_kind]?.short}</div>}</> })),
        { key: 'm', label: 'Còn thiếu', align: 'right', render: (r) => (onTrack ? (can('ban_hang') && <Btn small onClick={(e) => { e.stopPropagation(); onTrack(r); }}>Bật theo dõi</Btn>)
          : <span className="row gap-xs" style={{ justifyContent: 'flex-end' }}>{r.missing ? <Pill tone="bad">{r.missing}/{r.total}</Pill> : <Pill tone="good">Đủ</Pill>}
            {edit && <Btn small kind="ghost" icon="edit" title="Chọn giấy tờ cần có cho đơn này" aria-label="Chọn giấy tờ cần có" onClick={(e) => { e.stopPropagation(); setNeedFor(r); }} />}</span>) },
      ]} />
    </>
  );
}

// Danh sách giấy tờ cần có của một đơn (không phải đơn nào cũng cần đủ 4 loại)
export function NeedChecks({ value, onChange, disabled }) {
  return <div className="row gap wrap">{DOC_KEYS.map((k) => <Check key={k} disabled={disabled} checked={value.includes(k)}
    onChange={(v) => onChange(DOC_KEYS.filter((x) => (x === k ? v : value.includes(x))))}>{DOC_LABEL[k]}</Check>)}</div>;
}
function NeedDialog({ row, onClose }) {
  const { run, busy } = useAction();
  const [keys, setKeys] = useState(row.need || DOC_KEYS);
  const save = async (v) => { if (await run('set_order_docs_need', { order_id: row.id, keys: v }, 'Đã lưu giấy tờ cần có')) onClose(); };
  return (
    <Modal title={`Giấy tờ cần có · đơn ${row.code}`} subtitle={row.customer_name} onClose={onClose}
      footer={<><Btn busy={busy} onClick={() => save(null)}>Theo mặc định của khách</Btn><span className="grow" /><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={() => save(keys)}>Lưu</Btn></>}>
      <Note>Bỏ chọn giấy tờ đơn này không cần — đơn chỉ bị tính thiếu với các giấy tờ được chọn.</Note>
      <NeedChecks value={keys} onChange={setKeys} />
    </Modal>
  );
}

// Tổng hợp nhanh cho hồ sơ khách / nhóm khách
export function DocsBoardMini({ params, showCustomer }) {
  const b = useRpcData('order_docs_board', { track: 'on', ...params });
  const rows = b.data || [];
  const missing = rows.filter((r) => r.missing > 0).length;
  return (
    <div className="stack-s">
      {b.data && <div className="row gap-s wrap"><span className="small">{rows.length} đơn đang theo dõi giấy tờ</span>{missing > 0 ? <Pill tone="bad">{missing} đơn còn thiếu</Pill> : rows.length > 0 && <Pill tone="good">Đủ giấy tờ</Pill>}<span className="grow" /><Legend /></div>}
      {b.loading && !b.data ? <Loading /> : <DocsBoardTable rows={rows} error={b.error} showCustomer={showCustomer} />}
    </div>
  );
}

// Màu tổng của một giấy tờ: xấu nhất trong hai bên (thiếu > có bản giấy > đã lập > đã tải lên)
function slotTone(slot) {
  if (slot.skip) return 'mute';
  const st = Object.values(slot.sides).map((s) => s.state);
  if (st.includes('thieu')) return 'bad';
  if (st.includes('ban_giay')) return 'warn';
  if (st.includes('da_lap')) return 'info';
  return 'good';
}

// Thẻ Giấy tờ trong hồ sơ khách: bên trái danh sách đơn của khách (lọc, tìm, thấy ngay đơn nào còn thiếu giấy tờ gì),
// bên phải là giấy tờ của đơn đang chọn để xem, tải lên, đánh dấu bản giấy ngay tại chỗ.
export function CustomerDocsWorkspace({ customerId }) {
  const b = useRpcData('order_docs_board', { track: 'all', customer_id: customerId });
  const [st0, setSt] = useState(null); const [search, setSearch] = useState(''); const [pick, setPick] = useState(null);
  const all = b.data || [];
  const needs = (r) => r.track.on && r.missing > 0;
  const st = st0 || (all.some(needs) ? 'need' : 'all'); // chưa chọn lọc: có đơn thiếu thì hiện đơn thiếu, không thì hiện tất cả
  const rows = all.filter((r) => (st === 'all' || (st === 'need' ? needs(r) : st === 'done' ? r.track.on && !r.missing : !r.track.on)) && match(`${r.code} ${r.contract_code || ''}`, search));
  const cur = rows.find((r) => r.id === pick) || rows[0] || null;
  const cnt = { need: all.filter(needs).length, done: all.filter((r) => r.track.on && !r.missing).length, off: all.filter((r) => !r.track.on).length };
  if (b.loading && !b.data) return <Loading />;
  return (
    <div className="cdocs">
      <ErrorBox error={b.error} />
      <div className="cdocs-list">
        <div className="seg" role="group" aria-label="Lọc đơn theo giấy tờ">
          <button type="button" title="Đơn còn thiếu giấy tờ" className={st === 'need' ? 'on' : ''} onClick={() => setSt('need')}>Thiếu ({cnt.need})</button>
          <button type="button" title="Đơn đã đủ giấy tờ" className={st === 'done' ? 'on' : ''} onClick={() => setSt('done')}>Đủ ({cnt.done})</button>
          <button type="button" title="Đơn không theo dõi giấy tờ" className={st === 'off' ? 'on' : ''} onClick={() => setSt('off')}>Bỏ qua ({cnt.off})</button>
          <button type="button" className={st === 'all' ? 'on' : ''} onClick={() => setSt('all')}>Tất cả ({all.length})</button>
        </div>
        <Search value={search} onChange={setSearch} placeholder="Tìm mã đơn, số hợp đồng…" />
        <div className="cdocs-items">
          {rows.length === 0 && <div className="muted small cdocs-empty">{all.length ? 'Không có đơn nào trong mục này' : 'Khách chưa có đơn hàng'}</div>}
          {rows.map((r) => (
            <button type="button" key={r.id} className={`cdocs-item${cur?.id === r.id ? ' on' : ''}`} onClick={() => setPick(r.id)}>
              <span className="cdocs-top"><b>{r.code}</b><span className="grow" />
                {!r.track.on ? <Pill tone="mute">Không theo dõi</Pill> : r.missing ? <Pill tone="bad">Thiếu {r.missing}/{r.total}</Pill> : <Pill tone="good">Đủ</Pill>}</span>
              <span className="cell-sub">{dmy(r.order_date)} · {money(r.order_total)}</span>
              <span className="row gap-xs wrap">{DOC_KEYS.map((k) => <span key={k} className={`dslot ds-${slotTone(r.slots[k])}`} title={`${DOC_LABEL[k]}${r.slots[k].skip ? ': không cần' : ''}`}>{DOC_SHORT[k]}</span>)}</span>
            </button>))}
        </div>
      </div>
      <div className="cdocs-detail">
        {cur ? <>
          <div className="cdocs-title"><b>Đơn {cur.code}</b><span className="small muted">{dmy(cur.order_date)} · {money(cur.order_total)}</span></div>
          <OrderDocsPanel key={cur.id} orderId={cur.id} order={{ customer_name: cur.customer_name }} />
        </> : <div className="muted cdocs-empty">Chọn một đơn ở bên trái để xem giấy tờ.</div>}
      </div>
    </div>
  );
}

export function OrderDocsPage() {
  const { rpc, toast, refresh } = useApp();
  const [track, setTrack] = useState('on'); const [st, setSt] = useState('thieu'); const [seg, setSeg] = useState(''); const [search, setSearch] = useState('');
  const b = useRpcData('order_docs_board', { track });
  const all = b.data || [];
  const inGroup = all.filter((r) => !seg || (seg === 'cty') === r.company);
  const rows = inGroup.filter((r) => (track === 'off' || !st || (st === 'thieu' ? r.missing > 0 : r.missing === 0)) && match(`${r.code} ${r.customer_name} ${r.contract_code || ''}`, search));
  const turnOn = async (r) => { try { await rpc('set_order_docs_track', { order_id: r.id, track: 'on' }); toast(`Đã bật theo dõi giấy tờ cho đơn ${r.code}`); refresh(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <ListPage title="Giấy tờ đơn hàng" sub="Hợp đồng, biên bản giao hàng, chứng nhận xuất xưởng, hóa đơn VAT của từng đơn"
      filters={<>
        <FilterBox title="Đơn hàng"><RadioList value={track} onChange={setTrack} options={[{ value: 'on', label: 'Đang theo dõi' }, { value: 'off', label: 'Không theo dõi' }]} /></FilterBox>
        {track === 'on' && <FilterBox title="Tình trạng"><RadioList value={st} onChange={setSt} options={[{ value: 'thieu', label: 'Còn thiếu', count: inGroup.filter((r) => r.missing > 0).length },
          { value: 'du', label: 'Đủ giấy tờ', count: inGroup.filter((r) => !r.missing).length }, { value: '', label: 'Tất cả', count: inGroup.length }]} /></FilterBox>}
        <FilterBox title="Nhóm khách hàng"><RadioList value={seg} onChange={setSeg} options={[{ value: '', label: 'Tất cả', count: all.length },
          { value: 'cty', label: 'Công ty', count: all.filter((r) => r.company).length }, { value: 'le', label: 'Khách lẻ', count: all.filter((r) => !r.company).length }]} /></FilterBox>
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã đơn, khách, số hợp đồng…" />}>
      {track === 'on' ? <Note>Mặc định chỉ theo dõi đơn của khách công ty (thuộc nhóm công ty hoặc có mã số thuế). Không phải đơn nào cũng cần đủ 4 loại: bấm nút sửa ở cột "Còn thiếu" để chọn giấy tờ cần có cho từng đơn, hoặc đặt mặc định cho khách ở hồ sơ khách (thẻ Thông tin xuất hóa đơn).</Note>
        : <Note>Các đơn dưới đây không cần theo dõi giấy tờ. Bấm "Bật theo dõi" nếu đơn này cần đủ hồ sơ.</Note>}
      {track === 'on' && <Legend />}
      {b.loading && !b.data ? <Loading /> : <DocsBoardTable rows={rows} error={b.error} onTrack={track === 'off' ? turnOn : null} />}
    </ListPage>
  );
}

// ---------- Giấy tờ của một đơn ----------
export function OrderDocsDialog({ order_id, onClose }) {
  const o = useQ('sales_orders', [['id', 'eq', order_id]]);
  const d = o.data?.[0];
  const { open } = useApp();
  return (
    <Modal title={`Giấy tờ đơn ${d?.code || ''}`} subtitle={d ? `${d.customer_name || ''} · ${dmy(d.order_date)}` : null} onClose={onClose} size="xl"
      footer={<><Btn icon="order" onClick={() => open('order', { id: order_id })}>Mở đơn hàng</Btn><span className="grow" /><Btn onClick={onClose}>Đóng</Btn></>}>
      <OrderDocsPanel orderId={order_id} order={d} />
    </Modal>
  );
}

export function OrderDocsPanel({ orderId, order }) {
  const { can, open } = useApp();
  const q = useRpcData('order_docs', { order_id: orderId });
  const { run, busy } = useAction();
  const d = q.data;
  if (!d) return q.error ? <ErrorBox error={q.error} /> : <Loading />;
  const edit = can('ban_hang');
  const defaultLabel = `Theo mặc định (${d.cust_track !== 'auto' ? `khách: ${d.cust_track === 'on' ? 'theo dõi' : 'không'}` : d.group_track !== 'auto' ? `nhóm ${d.cust_group}: ${d.group_track === 'on' ? 'theo dõi' : 'không'}` : d.company ? 'khách cần xuất VAT' : 'khách lẻ, không theo dõi'})`;
  const cur = d.track.by === 'order' ? (d.track.on ? 'on' : 'off') : 'auto';
  return (
    <div className="stack">
      <div className="row gap wrap">
        <span>{d.track.on ? <Pill tone="info">Đang theo dõi giấy tờ</Pill> : <Pill>Không theo dõi giấy tờ</Pill>} <span className="small muted">— {TRACK_BY[d.track.by]}</span></span>
        <span className="grow" />
        {edit && <div style={{ minWidth: 260 }}><Select value={cur} onChange={(v) => run('set_order_docs_track', { order_id: orderId, track: v }, 'Đã lưu')}
          options={Object.entries(TRACK_OPTS).map(([value, label]) => ({ value, label: value === 'auto' ? defaultLabel : label }))} /></div>}
      </div>
      {d.track.on && <div className="row gap-s"><b>{d.missing ? `Còn thiếu ${d.missing}/${d.total} giấy tờ` : 'Đã đủ giấy tờ'}</b><span className="grow" /><Legend /></div>}
      <div className="row gap-s wrap odoc-need">
        <span className="small strong" title={d.need_by === 'order' ? 'Chọn riêng cho đơn' : d.need_by === 'customer' ? 'Theo mặc định của khách' : 'Đủ 4 loại'}>Cần có:</span>
        <NeedChecks value={d.need} disabled={!edit || busy} onChange={(v) => run('set_order_docs_need', { order_id: orderId, keys: v }, 'Đã lưu giấy tờ cần có')} />
        {edit && d.need_by === 'order' && <Btn small kind="ghost" icon="return" className="btn-ico" title="Đặt lại theo mặc định của khách" aria-label="Đặt lại theo mặc định của khách" onClick={() => run('set_order_docs_need', { order_id: orderId, keys: null }, 'Đã đặt lại theo mặc định của khách')} />}
      </div>
      {!d.track.on && <Note>Đơn này không bắt buộc đủ giấy tờ. Vẫn có thể tải lên để lưu trữ; chọn "Luôn theo dõi" nếu cần kiểm tra thiếu đủ.</Note>}
      <div className="odocs">
        <div className="odoc-cols"><span>Giấy tờ</span>{Object.keys(SIDE_LABEL).map((s) => <span key={s} title={SIDE_HINT[s]}>Bản giấy · {SIDE_LABEL[s]}</span>)}</div>
        {DOC_KEYS.map((k) => <DocRow key={k} k={k} slot={d.slots[k]} d={d} orderId={orderId} order={order} edit={edit} busy={busy} run={run} open={open} />)}
      </div>
    </div>
  );
}

function DocRow({ k, slot, d, orderId, order, edit, busy, run, open }) {
  const { rpc, toast, refresh } = useApp();
  const k0 = d.contract;
  const input = useRef(null); const [up, setUp] = useState(false); const [linkOpen, setLinkOpen] = useState(false); const [link, setLink] = useState({ name: '', url: '' });
  const ico = (icon, title, onClick, extra = {}) => <Btn small icon={icon} className="btn-ico" title={title} aria-label={title} onClick={onClick} {...extra} />;
  const make = {
    hop_dong: k0 ? ico('contract', k0.gdoc_url && !k0.has_body ? 'Mở hợp đồng' : 'Soạn / sửa hợp đồng', () => open('contract-writer', { id: k0.id }))
      : edit && ico('contract', 'Soạn hợp đồng', () => open('contract-writer', { order_id: orderId })),
    bien_ban: ico('print', 'In biên bản', () => open('doc', { kind: 'order', id: orderId, type: 'bien_ban' })),
    cn_xuat_xuong: ico('print', 'Lập giấy chứng nhận', () => open('doc', { kind: 'order', id: orderId, type: 'cn_xuat_xuong' })),
    hoa_don_vat: <>{edit && ico('invoice', 'Ghi số hóa đơn', () => open('tax-invoice', { direction: 'ra', preset: { order_id: orderId, order_code: d.code, party_name: order?.customer_name || '' } }))}
      {ico('quote', 'Phiếu yêu cầu xuất hóa đơn', () => open('doc', { kind: 'order', id: orderId, type: 'yeu_cau_vat' }))}</>,
  }[k];
  // Một bộ tệp / link cho cả giấy tờ (lưu ở ô bên mình, tính cho mọi bên); khi khách ký thì tải bản đã ký lên thay bản cũ
  const base = { order_id: orderId, doc_key: k, side: 'minh' };
  const files = Object.values(slot.sides).flatMap((s) => s.files).filter((f) => f.kind !== 'paper');
  const upload = async (list) => {
    setUp(true);
    try {
      for (const f of list) await rpc('upload_order_doc', { ...base, name: f.name, mime: f.type, base64: await readB64(f) });
      toast(list.length > 1 ? `Đã tải lên ${list.length} tệp` : `Đã tải lên ${list[0].name}`); refresh();
    } catch (e) { toast(e.message, 'err'); } finally { setUp(false); }
  };
  const saveLink = async () => { if (await run('add_order_doc_link', { ...base, url: link.url, name: link.name }, 'Đã gắn link')) { setLinkOpen(false); setLink({ name: '', url: '' }); } };
  return (
    <div className={`odoc${slot.skip ? ' skip' : ''}`}
      onDragOver={(e) => { if (edit && !slot.skip) e.preventDefault(); }} onDrop={(e) => { if (!edit || slot.skip) return; e.preventDefault(); const l = [...(e.dataTransfer.files || [])]; if (l.length) upload(l); }}>
      <div className="odoc-main">
        <div className="odoc-head">
          <div className="odoc-name">
            <b>{DOC_LABEL[k]}</b>
            {k === 'hop_dong' && k0 && <span className="small muted">{CONTRACT_KINDS[k0.kind]?.label} · số {k0.code}</span>}
          </div>
          {slot.skip ? <span className="small muted">Không cần</span> : <span className="row gap-xs">
            {make}
            {edit && <>
              <input ref={input} type="file" hidden multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ''; if (l.length) upload(l); }} />
              {ico('up', 'Tải tệp lên (bản đã ký thì tải lên thay bản cũ)', () => input.current?.click(), { busy: up })}
              {ico('link', 'Gắn link', () => setLinkOpen((x) => !x))}
            </>}
          </span>}
        </div>
        {!slot.skip && files.length > 0 && <div className="odoc-files">{files.map((f) => (
          <span key={f.id} className="odoc-chip">
            <Icon name={f.kind === 'link' ? 'link' : /^image\//.test(f.mime || '') ? 'image' : 'file'} size={14} />
            <a href="#" className="ellipsis" onClick={(e) => { e.preventDefault(); open('doc-file', { file: f }); }} title={`Xem trước: ${f.name}`}>{f.name}</a>
            {edit && !f.legacy && <ConfirmBtn small icon="x" className="btn-ico btn-ico-xs" title="Xóa" confirmText="Xóa?" onConfirm={() => run('delete_order_doc', { id: f.id }, 'Đã xóa')} />}
          </span>))}</div>}
        {!slot.skip && linkOpen && <div className="row gap-xs odoc-link">
          <Input value={link.url} onChange={(v) => setLink((x) => ({ ...x, url: v }))} placeholder="Link Google Drive / Docs…" />
          {ico('check', 'Lưu link', saveLink, { kind: 'primary' })}
        </div>}
      </div>
      {!slot.skip && Object.entries(slot.sides).map(([side, s]) => <PaperTick key={side} side={side} s={s} k={k} orderId={orderId} edit={edit} run={run} />)}
      {slot.skip && <><span /><span /></>}
    </div>
  );
}

// Ô tích "đã có bản giấy" của từng bên, kèm chấm trạng thái
function PaperTick({ side, s, k, orderId, edit, run }) {
  const [label, tone] = STATE[s.state];
  const paper = s.files.find((f) => f.kind === 'paper');
  const base = { order_id: orderId, doc_key: k, side };
  return (
    <div className="odoc-side">
      <span className="odoc-side-label small strong" title={SIDE_HINT[side]}>Bản giấy · {SIDE_LABEL[side]}</span>
      <div className="odoc-line">
        <span className={`sdot ds-${tone}`} title={`${label}${s.auto ? ` (${s.auto})` : ''}`} />
        <span title={paper ? `Có bản giấy ${SIDE_LABEL[side].toLowerCase()} từ ${dmy(paper.created_at?.slice(0, 10))}` : `Đánh dấu đã có bản giấy ${SIDE_LABEL[side].toLowerCase()}`}>
          <Check checked={!!paper} disabled={!edit}
            onChange={(v) => (v ? run('mark_order_doc_paper', base, 'Đã đánh dấu có bản giấy') : run('delete_order_doc', { id: paper.id }, 'Đã bỏ đánh dấu'))}>{null}</Check>
        </span>
      </div>
    </div>
  );
}

// ---------- Xem trước tệp / link ----------
export function DocFilePreview({ file, onClose }) {
  const { rpc, toast } = useApp();
  const [blob, setBlob] = useState(null); const [err, setErr] = useState(null);
  const isLink = file.kind === 'link';
  useEffect(() => {
    if (isLink) return undefined;
    let url = null; let alive = true;
    rpc(file.legacy ? 'get_attachment' : 'get_order_doc', { id: file.id }).then((f) => {
      const b = new Blob([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], { type: f.mime || file.mime || 'application/octet-stream' });
      url = URL.createObjectURL(b); if (alive) setBlob({ url, b, name: f.name, mime: b.type });
    }).catch((e) => alive && setErr(e.message));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [file.id]);
  const gp = isLink ? googlePreview(file.url) : null;
  const mime = blob?.mime || '';
  return (
    <Modal title={file.name} subtitle={isLink ? file.url : null} onClose={onClose} size="xl"
      footer={<>{isLink ? <a className="btn btn-primary" href={file.url} target="_blank" rel="noopener noreferrer"><Icon name="ext" size={16} /> Mở trong tab mới</a>
        : <><Btn icon="ext" disabled={!blob} onClick={() => window.open(blob.url, '_blank', 'noopener')}>Mở tab mới</Btn>
          <Btn kind="primary" icon="dl" disabled={!blob} onClick={async () => { try { await saveFile(blob.name, blob.b); } catch (e) { toast(e.message, 'err'); } }}>Tải về</Btn></>}
        <Btn onClick={onClose}>Đóng</Btn></>}>
      <ErrorBox error={err} />
      {isLink ? (gp ? <><iframe className="doc-frame" src={gp} title={file.name} /><div className="muted small">Không thấy nội dung? Tài liệu cần được chia sẻ cho tài khoản Google đang đăng nhập trên trình duyệt này.</div></>
        : <Note>Link này không xem trước được trong phần mềm. Bấm "Mở trong tab mới".</Note>)
        : !blob ? !err && <Loading />
        : mime === 'application/pdf' ? <iframe className="doc-frame" src={blob.url} title={file.name} />
        : /^image\//.test(mime) ? <div className="doc-img"><img src={blob.url} alt={file.name} /></div>
        : <Note>Tệp {file.name} (Word, Excel…) không xem trước được trên trình duyệt. Bấm "Tải về" để mở bằng phần mềm trên máy.</Note>}
    </Modal>
  );
}
