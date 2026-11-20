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
      {track === 'on' ? <Note>Mặc định chỉ theo dõi đơn của khách công ty (loại khách "Công ty" hoặc có mã số thuế). Không phải đơn nào cũng cần đủ 4 loại: bấm nút sửa ở cột "Còn thiếu" để chọn giấy tờ cần có cho từng đơn, hoặc đặt mặc định cho khách ở hồ sơ khách (thẻ Thông tin xuất hóa đơn).</Note>
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
      <div className="card stack-s">
        <div className="row gap-s wrap"><span className="small strong">Giấy tờ cần có cho đơn này</span>
          <span className="small muted">{d.need_by === 'order' ? '— chọn riêng cho đơn' : d.need_by === 'customer' ? '— theo mặc định của khách' : '— đủ 4 loại'}</span>
          <span className="grow" />
          {edit && d.need_by === 'order' && <button className="link-btn small" onClick={() => run('set_order_docs_need', { order_id: orderId, keys: null }, 'Đã đặt lại theo mặc định của khách')}>Theo mặc định của khách</button>}</div>
        <NeedChecks value={d.need} disabled={!edit || busy} onChange={(v) => run('set_order_docs_need', { order_id: orderId, keys: v }, 'Đã lưu giấy tờ cần có')} />
      </div>
      {!d.track.on && <Note>Đơn này không bắt buộc đủ giấy tờ. Vẫn có thể tải lên để lưu trữ; chọn "Luôn theo dõi" nếu cần kiểm tra thiếu đủ.</Note>}
      <div className="odocs">
        {DOC_KEYS.map((k) => <DocRow key={k} k={k} slot={d.slots[k]} d={d} orderId={orderId} order={order} edit={edit} busy={busy} run={run} open={open} />)}
      </div>
    </div>
  );
}

function DocRow({ k, slot, d, orderId, order, edit, busy, run, open }) {
  const k0 = d.contract;
  const make = {
    hop_dong: k0 ? <Btn small icon="contract" onClick={() => open('contract-writer', { id: k0.id })}>{k0.gdoc_url && !k0.has_body ? 'Mở hợp đồng' : 'Soạn / sửa hợp đồng'}</Btn>
      : edit && <Btn small icon="contract" onClick={() => open('contract-writer', { order_id: orderId })}>Soạn hợp đồng</Btn>,
    bien_ban: <Btn small icon="print" onClick={() => open('doc', { kind: 'order', id: orderId, type: 'bien_ban' })}>In biên bản</Btn>,
    cn_xuat_xuong: <Btn small icon="print" onClick={() => open('doc', { kind: 'order', id: orderId, type: 'cn_xuat_xuong' })}>Lập giấy chứng nhận</Btn>,
    hoa_don_vat: <>{edit && <Btn small icon="invoice" onClick={() => open('tax-invoice', { direction: 'ra', preset: { order_id: orderId, order_code: d.code, party_name: order?.customer_name || '' } })}>Ghi số hóa đơn</Btn>}
      <Btn small onClick={() => open('doc', { kind: 'order', id: orderId, type: 'yeu_cau_vat' })}>Phiếu yêu cầu xuất HĐ</Btn></>,
  }[k];
  return (
    <div className={`odoc${slot.skip ? ' skip' : ''}`}>
      <div className="odoc-head">
        <b>{DOC_LABEL[k]}</b>
        {k === 'hop_dong' && k0 && <span className="small muted">{CONTRACT_KINDS[k0.kind]?.label} · số {k0.code}</span>}
        <span className="grow" />
        {!slot.skip && make}
        {slot.skip && <span className="small muted">Không cần cho đơn này</span>}
      </div>
      {!slot.skip && <div className="odoc-sides">{Object.entries(slot.sides).map(([side, s]) => <SideCell key={side} side={side} s={s} k={k} orderId={orderId} edit={edit} run={run} open={open} />)}</div>}
    </div>
  );
}

function SideCell({ side, s, k, orderId, edit, run, open }) {
  const { rpc, toast, refresh } = useApp();
  const input = useRef(null); const [up, setUp] = useState(false); const [linkOpen, setLinkOpen] = useState(false); const [link, setLink] = useState({ name: '', url: '' });
  const [label, tone] = STATE[s.state];
  const paper = s.files.find((f) => f.kind === 'paper');
  const files = s.files.filter((f) => f.kind !== 'paper');
  const base = { order_id: orderId, doc_key: k, side };
  const upload = async (list) => {
    setUp(true);
    try {
      for (const f of list) await rpc('upload_order_doc', { ...base, name: f.name, mime: f.type, base64: await readB64(f) });
      toast(list.length > 1 ? `Đã tải lên ${list.length} tệp` : `Đã tải lên ${list[0].name}`); refresh();
    } catch (e) { toast(e.message, 'err'); } finally { setUp(false); }
  };
  return (
    <div className="odoc-side"
      onDragOver={(e) => { if (edit) e.preventDefault(); }} onDrop={(e) => { if (!edit) return; e.preventDefault(); const l = [...(e.dataTransfer.files || [])]; if (l.length) upload(l); }}>
      <div className="row gap-s"><span className="small strong" title={SIDE_HINT[side]}>{SIDE_LABEL[side]}</span><Pill tone={tone}>{label}</Pill>{s.auto && <span className="small muted">{s.auto}</span>}</div>
      {files.map((f) => (
        <div key={f.id} className="row gap-s odoc-file">
          <Icon name={f.kind === 'link' ? 'link' : /^image\//.test(f.mime || '') ? 'image' : 'file'} size={15} />
          <a href="#" className="grow ellipsis" onClick={(e) => { e.preventDefault(); open('doc-file', { file: f }); }} title="Xem trước">{f.name}</a>
          {edit && !f.legacy && <ConfirmBtn small icon="x" onConfirm={() => run('delete_order_doc', { id: f.id }, 'Đã xóa')}>Xóa</ConfirmBtn>}
        </div>
      ))}
      {paper && <div className="row gap-s small"><Icon name="check" size={14} /> Có bản giấy · {dmy(paper.created_at?.slice(0, 10))}{edit && <button className="link-btn small" onClick={() => run('delete_order_doc', { id: paper.id }, 'Đã bỏ đánh dấu')}>bỏ</button>}</div>}
      {edit && <div className="row gap-xs wrap">
        <input ref={input} type="file" hidden multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ''; if (l.length) upload(l); }} />
        <Btn small icon="up" busy={up} onClick={() => input.current?.click()}>Tải lên</Btn>
        <Btn small icon="link" onClick={() => setLinkOpen((x) => !x)}>Gắn link</Btn>
        {!paper && <Btn small icon="check" onClick={() => run('mark_order_doc_paper', base, 'Đã đánh dấu có bản giấy')}>Có bản giấy</Btn>}
      </div>}
      {linkOpen && <div className="row gap-xs">
        <Input value={link.url} onChange={(v) => setLink((x) => ({ ...x, url: v }))} placeholder="Link Google Drive / Docs…" />
        <Btn small kind="primary" onClick={async () => { if (await run('add_order_doc_link', { ...base, url: link.url, name: link.name }, 'Đã gắn link')) { setLinkOpen(false); setLink({ name: '', url: '' }); } }}>Lưu</Btn>
      </div>}
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
