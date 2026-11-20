// Mua hàng kiểu KiotViet: danh sách Nhập hàng, Đặt hàng nhập, Trả hàng nhập; chi tiết phiếu, nhận hàng theo đơn đặt, in phiếu.
// Màn tạo / sửa phiếu ở PurchasePos.jsx.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, todayVN, match, dmyhm } from '../lib/format.js';
import { KIND_LABEL } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { moneyWords } from '../lib/docs/model.js';
import { useTimeFilter, TimeFilter } from '../components/DocFilters.jsx';
import {
  Btn, Icon, Pill, Field, Input, TextArea, DateInput, NumInput, Check, Search, Loading, Tabs,
  ErrorBox, Note, Table, Modal, ConfirmBtn, KV, Section, ListPage, FilterBox, RadioList, InlineDetail,
} from '../components/ui.jsx';
import { ExtraCosts } from '../components/ExtraCosts.jsx';

const TONE = { 'Phiếu tạm': 'warn', 'Đã nhập hàng': 'good', 'Hoàn thành': 'good', 'Đã trả hàng': 'good', 'Đã xác nhận NCC': 'info', 'Nhập một phần': 'info', 'Đã hủy': 'mute' };
const StatusTag = ({ label }) => <Pill tone={TONE[label] || 'neutral'}>{label}</Pill>;

// Lọc trạng thái nhiều lựa chọn như KiotViet (ô đánh dấu)
function StatusChecks({ options, value, onChange, counts }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {options.map((o) => <Check key={o} checked={value.includes(o)} onChange={(v) => onChange(v ? [...value, o] : value.filter((x) => x !== o))}>
        {o}{counts?.[o] ? <span className="muted small"> ({counts[o]})</span> : null}</Check>)}
    </div>
  );
}
const countBy = (rows, k) => rows.reduce((m, r) => ({ ...m, [r[k]]: (m[r[k]] || 0) + 1 }), {});

// ===================== NHẬP HÀNG =====================
// Mỗi dòng là một phiếu nhập: phiếu nhập thẳng (PN, kể cả phiếu tạm) hoặc một đợt nhận hàng theo đơn đặt (NK)
export function PurchasesPage() {
  const { open, can } = useApp();
  const time = useTimeFilter('month');
  const [st, setSt] = useState(['Phiếu tạm', 'Đã nhập hàng']);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null); // phiếu đang xổ chi tiết ngay trong bảng (như KiotViet)
  const pos = useQ('purchase_orders', [['mode', 'eq', 'nhap']], 'created_at desc', 5000);
  const recs = useQ('receipts', [['po_mode', 'eq', 'dat']], 'created_at desc', 5000);
  const all = useMemo(() => (pos.data && recs.data ? [
    ...pos.data.map((o) => ({ id: o.id, po_id: o.id, code: o.code, date: o.order_date, at: o.created_at, supplier_code: o.supplier_code, supplier_name: o.supplier_name,
      invoice_no: o.invoice_no, need: o.order_total, paid: o.paid_net, status_label: o.status_label, by: o.created_by_name, note: o.note })),
    ...recs.data.map((r) => ({ id: r.id, po_id: r.po_id, code: r.code, sub: `theo đơn ${r.po_code}`, date: r.receipt_date, at: r.created_at, supplier_code: r.supplier_code,
      supplier_name: r.supplier_name, invoice_no: r.invoice_no, need: r.status_label === 'Đã hủy' ? 0 : r.value, paid: null, status_label: r.status_label, by: r.created_by_name, note: r.note })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))) : null), [pos.data, recs.data]);
  const inTime = (all || []).filter((r) => time.inRange(r.date) && match(`${r.code} ${r.supplier_name} ${r.supplier_code || ''} ${r.invoice_no || ''} ${r.sub || ''} ${r.note || ''}`, search));
  const rows = inTime.filter((r) => st.includes(r.status_label));
  return (
    <ListPage title="Nhập hàng"
      filters={<>
        <TimeFilter filter={time} />
        <FilterBox title="Trạng thái"><StatusChecks options={['Phiếu tạm', 'Đã nhập hàng', 'Đã hủy']} value={st} onChange={setSt} counts={countBy(inTime, 'status_label')} /></FilterBox>
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Theo mã phiếu, nhà cung cấp, số hóa đơn…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('nhap-hang.xlsx', [{ name: 'Nhập hàng', rows, columns: [
          { key: 'code', label: 'Mã nhập hàng' }, { key: 'date', label: 'Thời gian', type: 'date' }, { key: 'supplier_code', label: 'Mã NCC' }, { key: 'supplier_name', label: 'Nhà cung cấp' },
          { key: 'invoice_no', label: 'Số hóa đơn đầu vào' }, { key: 'need', label: 'Cần trả NCC' }, { key: 'status_label', label: 'Trạng thái' }, { key: 'by', label: 'Người tạo' }] }])}>Xuất file</Btn>
        {can('nhap_hang') && <Btn kind="primary" icon="plus" onClick={() => open('po-form', { mode: 'nhap' })}>Nhập hàng</Btn>}
      </>}>
      <ErrorBox error={pos.error || recs.error} />
      <Table rows={rows && all ? rows : null} onRow={(r) => setOpenId((x) => (x === r.id ? null : r.id))} empty="Không tìm thấy phiếu nhập hàng nào trong thời gian này"
        expandKey={openId} expand={(r) => <InlineDetail><PoDetail id={r.po_id} onClose={() => setOpenId(null)} /></InlineDetail>}
        foot={rows.length ? { c: `${rows.length} phiếu`, n: money(rows.reduce((s, r) => s + (r.need || 0), 0)) } : null} columns={[
          { key: 'c', label: 'Mã nhập hàng', render: (r) => <><span className="strong">{r.code}</span>{r.sub && <span className="muted small"> · {r.sub}</span>}</> },
          { key: 't', label: 'Thời gian', className: 'nowrap', render: (r) => `${dmy(r.date)} ${dmyhm(r.at).slice(11)}` },
          { key: 'sc', label: 'Mã NCC', render: (r) => r.supplier_code },
          { key: 's', label: 'Nhà cung cấp', className: 'col-clip', render: (r) => <span title={r.supplier_name}>{r.supplier_name}</span> },
          { key: 'hd', label: 'Số hóa đơn', render: (r) => r.invoice_no || '' },
          { key: 'n', label: 'Cần trả NCC', align: 'right', render: (r) => money(r.need) },
          { key: 'st', label: 'Trạng thái', render: (r) => <StatusTag label={r.status_label} /> },
        ]} />
    </ListPage>
  );
}

// ===================== ĐẶT HÀNG NHẬP =====================
const PO_STATUSES = ['Phiếu tạm', 'Đã xác nhận NCC', 'Nhập một phần', 'Hoàn thành', 'Đã hủy'];
export function PurchaseOrdersPage() {
  const { open, can } = useApp();
  const time = useTimeFilter('month');
  const [st, setSt] = useState(['Phiếu tạm', 'Đã xác nhận NCC', 'Nhập một phần', 'Hoàn thành']);
  const [kind, setKind] = useState('');
  const [extra, setExtra] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const { data, error } = useQ('purchase_orders', [['mode', 'eq', 'dat']], 'created_at desc', 5000);
  // Đơn chưa xong luôn hiện dù đặt từ trước kỳ đang xem
  const inTime = (data || []).filter((o) => (time.inRange(o.order_date) || (o.status !== 'huy' && o.remaining_qty > 0))
    && (!kind || o.kind === kind) && match(`${o.code} ${o.supplier_name} ${o.supplier_code || ''} ${o.sales_order_code || ''} ${o.invoice_no || ''} ${o.note || ''}`, search)
    && (extra !== 'late' || o.is_late) && (extra !== 'debt' || o.payable > 0));
  const rows = inTime.filter((o) => st.includes(o.status_label));
  return (
    <ListPage title="Đặt hàng nhập"
      filters={<>
        <TimeFilter filter={time} />
        <FilterBox title="Trạng thái"><StatusChecks options={PO_STATUSES} value={st} onChange={setSt} counts={countBy(inTime, 'status_label')} /></FilterBox>
        <FilterBox title="Loại đơn"><RadioList value={kind} onChange={setKind} options={[{ value: '', label: 'Tất cả' }, { value: 'mua_san', label: 'Mua hàng có sẵn' }, { value: 'dat_sx', label: 'Đặt xưởng sản xuất' }]} /></FilterBox>
        <FilterBox title="Cần chú ý"><RadioList value={extra} onChange={setExtra} options={[{ value: '', label: 'Không lọc' },
          { value: 'late', label: 'Trễ hẹn nhận', count: (data || []).filter((o) => o.is_late).length }, { value: 'debt', label: 'Còn nợ NCC', count: (data || []).filter((o) => o.payable > 0).length }]} /></FilterBox>
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Theo mã đơn, nhà cung cấp, đơn bán…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('dat-hang-nhap.xlsx', [{ name: 'Đặt hàng nhập', rows, columns: [
          { key: 'code', label: 'Mã đặt hàng nhập' }, { key: 'order_date', label: 'Thời gian', type: 'date' }, { key: 'supplier_name', label: 'Nhà cung cấp' }, { key: 'kind', label: 'Loại', get: (r) => KIND_LABEL[r.kind] },
          { key: 'expected_date', label: 'Ngày nhập dự kiến', type: 'date' }, { key: 'wait_days', label: 'Số ngày chờ' }, { key: 'order_total', label: 'Cần trả NCC' },
          { key: 'received_value', label: 'Đã nhận (giá trị)' }, { key: 'paid_net', label: 'Đã trả' }, { key: 'payable', label: 'Còn nợ' }, { key: 'status_label', label: 'Trạng thái' }, { key: 'progress', label: 'Tiến độ' }] }])}>Xuất file</Btn>
        {can('nhap_hang') && <Btn kind="primary" icon="plus" onClick={() => open('po-form', { mode: 'dat' })}>Đặt hàng nhập</Btn>}
      </>}>
      <ErrorBox error={error} />
      <Table rows={data ? rows : null} onRow={(o) => setOpenId((x) => (x === o.id ? null : o.id))} rowClass={(o) => (o.is_late ? 'row-late' : '')} empty="Không có đơn đặt hàng nhập phù hợp"
        expandKey={openId} expand={(o) => <InlineDetail><PoDetail id={o.id} onClose={() => setOpenId(null)} /></InlineDetail>}
        foot={rows.length ? { c: `${rows.length} đơn`, t: money(rows.reduce((s, o) => s + (o.order_total || 0), 0)) } : null} columns={[
          { key: 'c', label: 'Mã đặt hàng nhập', render: (o) => <><div className="cell-main">{o.code}</div><div className="cell-sub">{KIND_LABEL[o.kind]}{o.sales_order_code ? ` · cho ${o.sales_order_code}` : ''}</div></> },
          { key: 'd', label: 'Thời gian', render: (o) => dmy(o.order_date) },
          { key: 's', label: 'Nhà cung cấp', render: (o) => <>{o.supplier_name}{o.kind === 'dat_sx' && o.prod_step && o.remaining_qty > 0 && <div className="cell-sub">{o.prod_step}</div>}</> },
          { key: 'e', label: 'Ngày nhập dự kiến', render: (o) => <>{dmy(o.expected_date)}{o.is_late && <> <Pill tone="bad">trễ</Pill></>}</> },
          { key: 'w', label: 'Số ngày chờ', align: 'right', render: (o) => (o.wait_days != null ? fq(o.wait_days) : '—') },
          { key: 't', label: 'Cần trả NCC', align: 'right', render: (o) => <>{money(o.order_total)}{o.payable > 0 && <div className="cell-sub bad">nợ {money(o.payable)}</div>}</> },
          { key: 'st', label: 'Trạng thái', render: (o) => <StatusTag label={o.status_label} /> },
        ]} />
    </ListPage>
  );
}

// ===================== TRẢ HÀNG NHẬP =====================
export function SupplierReturnsPage() {
  const { open, can } = useApp();
  const time = useTimeFilter('month');
  const [st, setSt] = useState(['Đã trả hàng']);
  const [search, setSearch] = useState('');
  const { data, error } = useQ('supplier_returns', [], 'created_at desc', 5000);
  const inTime = (data || []).filter((r) => time.inRange(r.return_date) && match(`${r.code} ${r.supplier_name} ${r.po_code || ''} ${r.reason || ''}`, search));
  const rows = inTime.filter((r) => st.includes(r.status_label));
  return (
    <ListPage title="Trả hàng nhập"
      filters={<>
        <TimeFilter filter={time} />
        <FilterBox title="Trạng thái"><StatusChecks options={['Đã trả hàng', 'Đã hủy']} value={st} onChange={setSt} counts={countBy(inTime, 'status_label')} /></FilterBox>
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Theo mã phiếu trả, nhà cung cấp…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('tra-hang-nhap.xlsx', [{ name: 'Trả hàng nhập', rows, columns: [
          { key: 'code', label: 'Mã trả hàng nhập' }, { key: 'return_date', label: 'Thời gian', type: 'date' }, { key: 'supplier_name', label: 'Nhà cung cấp' }, { key: 'po_code', label: 'Theo phiếu' },
          { key: 'goods_total', label: 'Tổng tiền hàng' }, { key: 'discount', label: 'Giảm giá' }, { key: 'value', label: 'NCC cần trả' }, { key: 'refunded', label: 'NCC đã trả' },
          { key: 'reason', label: 'Lý do' }, { key: 'status_label', label: 'Trạng thái' }] }])}>Xuất file</Btn>
        {can('nhap_hang') && <Btn kind="primary" icon="plus" onClick={() => open('po-return', {})}>Trả hàng nhập</Btn>}
      </>}>
      <ErrorBox error={error} />
      <Table rows={data ? rows : null} empty="Không có phiếu trả hàng nhập trong thời gian này" onRow={(r) => open('sret', { id: r.id })}
        foot={rows.length ? { c: `${rows.length} phiếu`, g: money(rows.reduce((s, r) => s + (r.goods_total || 0), 0)), v: money(rows.reduce((s, r) => s + (r.value || 0), 0)) } : null} columns={[
          { key: 'c', label: 'Mã trả hàng nhập', render: (r) => <><div className="cell-main">{r.code}</div>{r.po_code && <div className="cell-sub">theo {r.po_code}</div>}</> },
          { key: 't', label: 'Thời gian', render: (r) => dmy(r.return_date) },
          { key: 's', label: 'Nhà cung cấp', render: (r) => <>{r.supplier_name}{r.reason && <div className="cell-sub">{r.reason}</div>}</> },
          { key: 'g', label: 'Tổng tiền hàng', align: 'right', render: (r) => money(r.goods_total) },
          { key: 'd', label: 'Giảm giá', align: 'right', render: (r) => (r.discount ? money(r.discount) : '—') },
          { key: 'v', label: 'NCC cần trả', align: 'right', render: (r) => money(r.value) },
          { key: 'p', label: 'NCC đã trả', align: 'right', render: (r) => (r.refunded ? money(r.refunded) : '—') },
          { key: 'st', label: 'Trạng thái', render: (r) => <StatusTag label={r.status_label} /> },
        ]} />
    </ListPage>
  );
}

function CancelBox({ busy, onCancel, label, hint }) {
  const [on, setOn] = useState(false); const [reason, setReason] = useState('');
  if (!on) return <div className="row gap"><Btn onClick={() => setOn(true)}>{label}</Btn>{hint && <span className="muted small">{hint}</span>}</div>;
  return (
    <div className="row gap">
      <Input value={reason} onChange={setReason} placeholder="Lý do (bắt buộc)" style={{ maxWidth: 360 }} autoFocus />
      <ConfirmBtn kind="danger" busy={busy} onConfirm={async () => { if (await onCancel(reason)) setOn(false); }}>Xác nhận hủy</ConfirmBtn>
      <Btn onClick={() => setOn(false)}>Thôi</Btn>
    </div>
  );
}

const exportLines = (code, lines) => exportXlsx(`${code}.xlsx`, [{ name: code, rows: lines, columns: [
  { key: 'sku', label: 'Mã hàng' }, { key: 'product_name', label: 'Tên hàng' }, { key: 'unit', label: 'ĐVT' }, { key: 'eff_qty', label: 'Số lượng' },
  { key: 'unit_price', label: 'Đơn giá' }, { key: 'discount', label: 'Giảm giá' }, { key: 'price_net', label: 'Giá nhập' }, { key: 'goods_total', label: 'Thành tiền' }] }]);

// ===================== CHI TIẾT PHIẾU NHẬP / ĐƠN ĐẶT =====================
// Như KiotViet: nhà cung cấp, mã phiếu, trạng thái; thẻ Thông tin (người tạo, ngày nhập, bảng hàng, ghi chú + tổng tiền) trước,
// lịch sử thanh toán, nhập kho / trả hàng, tiến độ sản xuất để ở thẻ riêng. Nút: Hủy · Sao chép · Xuất file … Mở phiếu · Lưu · Trả hàng nhập · In
export function PoDetail({ id, onClose }) {
  const { open, can, settings } = useApp();
  const o = useQ('purchase_orders', [['id', 'eq', id]]);
  const lines = useQ('purchase_order_lines', [['po_id', 'eq', id]], 'line_no');
  const recs = useQ('receipts', [['po_id', 'eq', id]], 'created_at');
  const rets = useQ('supplier_returns', [['po_id', 'eq', id]], 'created_at');
  const pays = useQ('doc_payments', [['doc_id', 'eq', id]], 'pay_date');
  const { run, busy } = useAction();
  const [tab, setTab] = useState('info');
  const [info, setInfo] = useState(null); // ghi chú / số hóa đơn đang sửa ngay trong chi tiết (nút Lưu)
  const [askCancel, setAskCancel] = useState(false);
  const [reason, setReason] = useState('');
  const d = o.data?.[0];
  if (!d) return <Modal title="Phiếu nhập" onClose={onClose} size="lg">{o.error ? <ErrorBox error={o.error} /> : <Loading />}</Modal>;
  const isNhap = d.mode === 'nhap';
  const steps = settings.prod_steps || [];
  const curIdx = steps.indexOf(d.prod_step);
  const payKind = d.prepaid > 0 && d.remaining_to_pay < 0 ? 'ncc_hoan' : 'tra_ncc';
  const canBuy = can('nhap_hang');
  const live = d.status !== 'huy';
  // Phiếu nhập: mở lại sửa được cả khi đã nhập kho (phần mềm tự nhập lại); đơn đặt: chỉ khi chưa nhận hàng
  const editable = canBuy && live && (isNhap || d.received_qty === 0);
  const activeRecs = (recs.data || []).filter((r) => !r.cancelled_at);
  const hasReturn = (rets.data || []).some((r) => !r.cancelled_at);
  const cur = info || { note: d.note || '', invoice_no: d.invoice_no || '' };
  const dirty = !!info && (cur.note !== (d.note || '') || cur.invoice_no !== (d.invoice_no || ''));
  const setCur = (k, v) => setInfo({ ...cur, [k]: v });
  const saveInfo = async () => { if (await run('update_po_info', { id, ...cur }, 'Đã lưu thông tin phiếu')) setInfo(null); };
  const doCancel = async () => {
    if (!reason.trim()) return;
    const r = await run('cancel_purchase_order', { id, reason: reason.trim() }, (x) => `Đã hủy ${d.code}`
      + (x.receipts?.length ? ` · tự hủy lần nhập ${x.receipts.join(', ')}, hàng đã xuất lại khỏi kho` : '') + (x.paid > 0 ? ` · nhà cung cấp cần hoàn lại ${money(x.paid)} đ` : ''));
    if (r) { setAskCancel(false); setReason(''); }
  };
  const qtySum = (lines.data || []).reduce((t, l) => t + (l.unit_conv && l.unit_conv !== 1 ? l.eff_qty / l.unit_conv : l.eff_qty), 0);
  return (
    <Modal title={d.supplier_name} onClose={onClose} size="xl"
      subtitle={<span className="row gap-s">{d.code} · {isNhap ? 'Phiếu nhập hàng' : KIND_LABEL[d.kind]} <StatusTag label={d.status_label} /> {d.is_late && <Pill tone="bad">trễ hẹn nhận</Pill>}</span>}
      footer={<>
        {canBuy && live && <Btn icon="trash" onClick={() => { setReason(''); setAskCancel(true); }}>Hủy</Btn>}
        {canBuy && <Btn icon="copy" onClick={() => { onClose(); open('po-form', { copy_id: id }); }}>Sao chép</Btn>}
        <Btn icon="dl" onClick={() => exportLines(d.code, lines.data || [])}>Xuất file</Btn>
        <span className="grow" />
        {!isNhap && d.status === 'nhap' && canBuy && <Btn kind="soft" busy={busy} onClick={() => run('confirm_purchase_order', { id }, 'Đã xác nhận với nhà cung cấp')}>Xác nhận NCC</Btn>}
        {can('thu_chi') && d.status !== 'nhap' && live && (d.remaining_to_pay > 0 || payKind === 'ncc_hoan') && <Btn kind="soft" icon="out" onClick={() => open('payment', { kind: payKind, party_id: d.supplier_id,
          alloc: { doc_type: 'don_mua', doc_id: d.id, code: d.code, amount: payKind === 'tra_ncc' ? d.remaining_to_pay : d.paid_net - d.received_value } })}>{payKind === 'tra_ncc' ? (d.received_value === 0 ? 'Đặt cọc / trả tiền' : 'Trả tiền NCC') : 'NCC hoàn tiền'}</Btn>}
        {canBuy && !isNhap && d.status === 'xac_nhan' && d.remaining_qty > 0 && <Btn kind="soft" icon="in" onClick={() => open('receive', { po: d })}>Nhận hàng</Btn>}
        {editable && <Btn kind="primary" icon="edit" onClick={() => { onClose(); open('po-form', { id }); }}>{isNhap ? 'Mở phiếu' : 'Chỉnh sửa'}</Btn>}
        {canBuy && live && <Btn icon="check" busy={busy} disabled={!dirty} onClick={saveInfo} title="Lưu ghi chú, số hóa đơn vừa sửa">Lưu</Btn>}
        {canBuy && d.received_value > 0 && live && <Btn icon="return" onClick={() => open('po-return', { po_id: d.id })}>Trả hàng nhập</Btn>}
        <Btn icon="print" onClick={() => open('po-print', { kind: 'po', id })}>In</Btn>
      </>}>
      {askCancel && (
        <Modal title={isNhap ? 'Hủy phiếu nhập' : 'Hủy đơn đặt hàng nhập'} size="sm" onClose={() => setAskCancel(false)}
          footer={<><Btn onClick={() => setAskCancel(false)}>Bỏ qua</Btn><Btn kind="danger" busy={busy} disabled={!reason.trim() || hasReturn} onClick={doCancel}>Đồng ý</Btn></>}>
          <div className="stack-s">
            {hasReturn ? <Note tone="warn">{d.code} đã có phiếu trả hàng nhập nên không hủy được. Hàng còn lại muốn trả nhà cung cấp: dùng "Trả hàng nhập".</Note> : <>
              <div>Khi hủy <b>{d.code}</b>, phần mềm sẽ tự động:</div>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {activeRecs.length > 0 && <li>Hủy {activeRecs.length} lần nhập kho: hàng xuất lại khỏi kho, công nợ nhà cung cấp giảm theo</li>}
                {d.paid_net > 0 && <li>Số tiền đã trả {money(d.paid_net)} đ thành tiền nhà cung cấp cần hoàn lại (bấm "NCC hoàn tiền" khi nhận lại)</li>}
                {d.remaining_qty > 0 && !isNhap && <li>Bỏ phần hàng chưa nhận</li>}
              </ul>
              <Input value={reason} onChange={setReason} placeholder="Lý do hủy (bắt buộc)" autoFocus />
            </>}
          </div>
        </Modal>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'info', label: 'Thông tin' },
        { value: 'pay', label: `Lịch sử thanh toán${pays.data?.length ? ` (${pays.data.length})` : ''}` },
        { value: 'stock', label: `${isNhap ? 'Nhập kho & trả hàng' : 'Nhận hàng & trả hàng'}${activeRecs.length ? ` (${activeRecs.length})` : ''}` },
        ...(d.kind === 'dat_sx' && live ? [{ value: 'prod', label: 'Tiến độ sản xuất' }] : []),
      ]} />
      {tab === 'info' && <>
        {isNhap && d.status === 'nhap' && <Note tone="warn">Phiếu tạm chưa nhập kho. Bấm “Mở phiếu” rồi “Hoàn thành” để nhập kho và ghi công nợ nhà cung cấp.</Note>}
        <div className="od-info">
          <label><span>Người tạo</span><b>{d.created_by_name || '—'}</b></label>
          <label><span>{isNhap ? 'Ngày nhập' : 'Ngày đặt'}</span><b>{dmy(activeRecs[0]?.receipt_date || d.order_date)}</b></label>
          <label><span>Nhà cung cấp</span><a href="#" onClick={(e) => { e.preventDefault(); open('party-detail', { type: 'ncc', id: d.supplier_id }); }}>{d.supplier_name}{d.supplier_code ? ` (${d.supplier_code})` : ''}</a></label>
          {d.supplier_phone && <label><span>Điện thoại</span><b>{d.supplier_phone}</b></label>}
          <label><span>Số hóa đơn</span>{canBuy && live ? <Input value={cur.invoice_no} onChange={(v) => setCur('invoice_no', v)} placeholder="Số hóa đơn đầu vào" aria-label="Số hóa đơn" /> : <b>{d.invoice_no || '—'}</b>}</label>
          {!isNhap && <label><span>Dự kiến nhận</span><b className={d.is_late ? 'bad' : ''}>{d.expected_date ? dmy(d.expected_date) : '—'}{d.wait_days != null ? ` · chờ ${fq(d.wait_days)} ngày` : ''}</b></label>}
          {d.sales_order_code && <label><span>Cho đơn bán</span><a href="#" onClick={(e) => { e.preventDefault(); open('order', { id: d.sales_order_id }); }}>{d.sales_order_code} · {d.sales_customer_name}</a></label>}
          {d.cancel_reason && <label><span>Lý do hủy</span><b className="bad">{d.cancel_reason}</b></label>}
        </div>
        <Table dense rows={lines.data} columns={[
          { key: 'sku', label: 'Mã hàng', render: (l) => <a href="#" onClick={(e) => { e.preventDefault(); open('product-detail', { id: l.product_id }); }}>{l.sku}</a> },
          { key: 'n', label: 'Tên hàng', render: (l) => <><div>{l.product_name}{l.unit ? ` (${l.unit_name || l.unit})` : ''}</div>{l.note && <div className="cell-sub">{l.note}</div>}{l.sales_order_code && <div className="cell-sub">giữ cho đơn {l.sales_order_code}</div>}</> },
          { key: 'q', label: 'Số lượng', align: 'right', render: (l) => <>{fq(l.unit_conv && l.unit_conv !== 1 ? l.eff_qty / l.unit_conv : l.eff_qty)}{l.cancelled_qty > 0 && <div className="cell-sub">hủy {fq(l.cancelled_qty)}</div>}</> },
          { key: 'u', label: 'Đơn giá', align: 'right', render: (l) => money(l.unit_price * (l.unit_conv || 1)) },
          { key: 'dc', label: 'Giảm giá', align: 'right', render: (l) => (l.discount ? money(l.discount * (l.unit_conv || 1)) : '') },
          { key: 'c', label: 'Giá nhập', align: 'right', render: (l) => money(l.price_net * (l.unit_conv || 1)) },
          { key: 't', label: 'Thành tiền', align: 'right', render: (l) => <b>{money(l.goods_total)}</b> },
          ...(!isNhap ? [{ key: 'r', label: 'Đã nhận', align: 'right', render: (l) => <>{fq(l.received_qty)}{l.remaining_qty > 0 && <div className="cell-sub">còn chờ {fq(l.remaining_qty)}</div>}</> }] : []),
          ...((lines.data || []).some((l) => l.returned_qty > 0) ? [{ key: 'rt', label: 'Đã trả NCC', align: 'right', render: (l) => (l.returned_qty > 0 ? fq(l.returned_qty) : '') }] : []),
        ]} />
        <div className="od-foot">
          <div className="od-note">
            {canBuy && live ? <TextArea rows={4} value={cur.note} onChange={(v) => setCur('note', v)} placeholder="Ghi chú…" aria-label="Ghi chú" />
              : <div className="od-note-text">{d.note || <span className="muted">Không có ghi chú</span>}</div>}
            {d.discount > 0 && <div className="muted small">Giảm giá cả phiếu được chia vào giá nhập từng dòng theo tỷ lệ tiền hàng (giá vốn tính theo giá đã giảm).</div>}
          </div>
          <div className="totals od-totals">
            <span>Tổng số lượng</span><span className="r">{fq(qtySum)}</span>
            <span>Tổng tiền hàng ({fq(d.line_count)})</span><span className="r">{money(d.goods_total)}</span>
            <span>Giảm giá</span><span className="r">{money(d.discount || 0)}</span>
            <span>Cần trả NCC</span><span className="r strong">{money(d.order_total)}</span>
            {!isNhap && <><span>Đã nhận (giá trị)</span><span className="r">{money(d.received_value)}</span></>}
            <span>Tiền đã trả NCC</span><span className="r strong">{money(d.paid_net)}</span>
            {d.payable > 0 && <><span className="strong bad">Còn nợ NCC</span><span className="r strong bad">{money(d.payable)}</span></>}
            {payKind === 'ncc_hoan' && <><span className="strong bad">NCC cần hoàn lại</span><span className="r strong bad">{money(d.paid_net - d.received_value)}</span></>}
            {d.prepaid > 0 && payKind !== 'ncc_hoan' && <><span>Đã cọc / trả trước</span><span className="r good">{money(d.prepaid)}</span></>}
            {d.pay_due_date && <><span>Hạn trả</span><span className={`r ${d.overdue_days > 0 ? 'bad' : ''}`}>{dmy(d.pay_due_date)}{d.overdue_days > 0 ? ` (quá ${d.overdue_days} ngày)` : ''}</span></>}
          </div>
        </div>
      </>}
      {tab === 'pay' && (
        <Table dense rows={pays.data} empty="Chưa trả tiền" onRow={(r) => open('pay-detail', { id: r.payment_id })} rowKey="payment_id" columns={[
          { key: 'c', label: 'Phiếu', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.pay_date)} · {r.fund_name}</div></> },
          { key: 'k', label: 'Loại', render: (r) => (r.kind === 'ncc_hoan' ? <Pill tone="warn">NCC hoàn tiền</Pill> : 'Trả tiền NCC') },
          { key: 'a', label: 'Số tiền', align: 'right', render: (r) => money(r.signed_amount) },
        ]} />
      )}
      {tab === 'stock' && <>
        <Table dense rows={recs.data} empty={isNhap ? 'Chưa nhập kho (phiếu tạm)' : 'Chưa nhận hàng'} columns={[
          { key: 'c', label: isNhap ? 'Lần nhập kho' : 'Đợt nhận', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.receipt_date)}{r.note ? ' · ' + r.note : ''}</div></> },
          { key: 'l', label: 'Hàng', render: (r) => (r.lines || []).map((x) => `${x.sku} × ${fq(x.qty)}`).join('; ') },
          { key: 'v', label: 'Giá trị', align: 'right', render: (r) => (r.cancelled_at ? <Pill tone="mute">Đã hủy</Pill> : money(r.value)) },
          ...(!isNhap && canBuy ? [{ key: 'x', label: '', render: (r) => (!r.cancelled_at && !r.returned_qty ? <ReceiptCancel id={r.id} code={r.code} /> : null) }] : []),
        ]} />
        {(rets.data || []).length > 0 && <Table dense rows={rets.data} onRow={(r) => open('sret', { id: r.id })} columns={[
          { key: 'c', label: 'Trả hàng nhập', render: (r) => <><b>{r.code}</b><div className="cell-sub">{dmy(r.return_date)}{r.reason ? ' · ' + r.reason : ''}</div></> },
          { key: 'v', label: 'NCC cần trả', align: 'right', render: (r) => (r.cancelled_at ? <Pill tone="mute">Đã hủy</Pill> : money(r.value)) },
        ]} />}
        {!isNhap && live && canBuy && d.received_qty > 0 && d.remaining_qty > 0 && (
          <Section title="Hủy phần chưa nhận"><CancelBox busy={busy} label="Hủy phần chưa nhận" hint="Hàng đã nhận giữ nguyên; muốn bỏ một đợt đã nhận thì hủy đợt đó ở bảng trên."
            onCancel={(why) => run('cancel_po_remaining', { id, reason: why }, 'Đã hủy phần chưa nhận')} /></Section>
        )}
      </>}
      {tab === 'prod' && (
        <Section title="Tiến độ sản xuất" actions={d.prod_step_at && <span className="muted small">cập nhật {dmyhm(d.prod_step_at)}</span>}>
          <div className="steps">
            {steps.map((st, i) => <button key={st} className={`step${i < curIdx ? ' done' : i === curIdx ? ' cur' : ''}`} disabled={busy || !(d.status === 'xac_nhan' && d.remaining_qty > 0)} onClick={() => run('set_prod_step', { id, step: st }, 'Đã cập nhật: ' + st)}>{i < curIdx && <Icon name="check" size={13} />}{st}</button>)}
            <span className={`step${d.received_qty > 0 ? ' cur' : ''}`} style={{ cursor: 'default' }}>{d.received_qty > 0 ? 'Đã nhận một phần' : 'Nhận hàng (tự động)'}</span>
          </div>
          <div className="muted small">Bấm vào bước để cập nhật khi xưởng báo. “Đã nhận một phần / đã nhận đủ” tự chuyển khi lập phiếu nhận hàng.</div>
        </Section>
      )}
    </Modal>
  );
}

function ReceiptCancel({ id, code }) {
  const { run, busy } = useAction();
  return <ConfirmBtn small busy={busy} confirmText={`Hủy ${code}?`} onConfirm={() => run('cancel_receipt', { id, reason: 'Hủy đợt nhận ' + code }, `Đã hủy phiếu nhận ${code}`)}>Hủy</ConfirmBtn>;
}

// ===================== NHẬN HÀNG THEO ĐƠN ĐẶT =====================
export function ReceiveDialog({ po, onClose }) {
  const lines = useQ('purchase_order_lines', [['po_id', 'eq', po.id]], 'line_no');
  const { run, busy } = useAction();
  const [q, setQ] = useState({}); const [c, setC] = useState({});
  const [date, setDate] = useState(todayVN()); const [note, setNote] = useState(''); const [extra, setExtra] = useState([]);
  useEffect(() => { if (lines.data) { setQ(Object.fromEntries(lines.data.filter((l) => l.remaining_qty > 0).map((l) => [l.id, l.remaining_qty]))); setC(Object.fromEntries(lines.data.map((l) => [l.id, Math.round(l.unit_cost)]))); } }, [lines.data]);
  const total = (lines.data || []).reduce((s, l) => s + (Number(q[l.id]) || 0) * (Number(c[l.id]) || 0), 0);
  return (
    <Modal title={`Nhận hàng – ${po.code}`} subtitle={po.supplier_name} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" icon="in" busy={busy} onClick={async () => {
        const r = await run('receive', { po_id: po.id, date, note, extra_costs: extra, lines: Object.entries(q).map(([k, v]) => ({ po_line_id: k, qty: Number(v) || 0, unit_cost: c[k] })) }, (x) => `Đã nhập kho – phiếu ${x.code}`);
        if (r) onClose();
      }}>Nhập kho</Btn></>}>
      <Note>Số lượng tự điền theo phần còn chờ của đơn đặt; sửa theo số thực nhận (nhận được nhiều đợt). Giá vốn bình quân tính lại ngay sau khi nhập.</Note>
      {!lines.data ? <Loading /> : <Table dense rows={lines.data.filter((l) => l.remaining_qty > 0)} columns={[
        { key: 'p', label: 'Hàng hóa', render: (l) => <div className="cell-main">{l.sku} · {l.product_name}</div> },
        { key: 'r', label: 'Còn chờ', align: 'right', render: (l) => fq(l.remaining_qty) },
        { key: 'q', label: 'Thực nhận', align: 'right', render: (l) => <NumInput money={false} stepper min={0} value={q[l.id]} onChange={(v) => setQ((s) => ({ ...s, [l.id]: v }))} style={{ maxWidth: 150, marginLeft: 'auto' }} aria-label="Thực nhận" /> },
        { key: 'c', label: 'Giá nhập', align: 'right', render: (l) => <NumInput value={c[l.id]} onChange={(v) => setC((s) => ({ ...s, [l.id]: v }))} style={{ maxWidth: 130 }} /> },
      ]} />}
      <div className="grid">
        <Field label="Ngày nhận"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        <Field label="Ghi chú"><Input value={note} onChange={setNote} placeholder="vd. Đợt 1, 2 viên nứt đã trả lại xưởng" /></Field>
        <Field label="Giá trị nhập lần này (tăng nợ NCC)"><Input value={money(total + extra.filter((x) => x.payer === 'ncc').reduce((t, x) => t + (Number(x.amount) || 0), 0))} readOnly /></Field>
      </div>
      <ExtraCosts value={extra} onChange={setExtra} />
    </Modal>
  );
}

// ===================== CHI TIẾT PHIẾU TRẢ HÀNG NHẬP =====================
export function SupplierReturnDetail({ id, onClose }) {
  const { open, can } = useApp();
  const q = useQ('supplier_returns', [['id', 'eq', id]]);
  const { run, busy } = useAction();
  const r = q.data?.[0];
  if (!r) return <Modal title="Trả hàng nhập" onClose={onClose} size="lg">{q.error ? <ErrorBox error={q.error} /> : <Loading />}</Modal>;
  return (
    <Modal title={`Trả hàng nhập ${r.code}`} onClose={onClose} size="lg"
      subtitle={<span className="row gap-s">{r.supplier_name} · {dmy(r.return_date)} <StatusTag label={r.status_label} /></span>}
      footer={<>
        <Btn icon="print" onClick={() => open('po-print', { kind: 'sret', id })}>In</Btn>
        <Btn icon="dl" onClick={() => exportXlsx(`${r.code}.xlsx`, [{ name: r.code, rows: r.lines || [], columns: [{ key: 'sku', label: 'Mã hàng' }, { key: 'name', label: 'Tên hàng' },
          { key: 'unit', label: 'ĐVT' }, { key: 'qty', label: 'Số lượng' }, { key: 'unit_price', label: 'Giá trả lại' }, { key: 'value', label: 'Thành tiền' }] }])}>Xuất file</Btn>
        <span className="grow" />
        {r.po_id && <Btn onClick={() => { onClose(); open('po', { id: r.po_id }); }}>Mở phiếu {r.po_code}</Btn>}
      </>}>
      <div className="grid-2">
        <KV items={[
          ['Nhà cung cấp', <a href="#" onClick={(e) => { e.preventDefault(); open('party-detail', { type: 'ncc', id: r.supplier_id }); }}>{r.supplier_name}</a>],
          ['Theo phiếu nhập', r.po_code || 'Lập riêng (không theo phiếu nhập)'], r.reason && ['Lý do', r.reason], r.created_by_name && ['Người tạo', r.created_by_name],
          r.note && ['Ghi chú', r.note], r.cancel_reason && ['Lý do hủy', r.cancel_reason],
        ]} />
        <div className="card"><div className="totals">
          <span>Tổng tiền hàng</span><span className="r">{money(r.goods_total)}</span>
          <span>Giảm giá</span><span className="r">{money(r.discount)}</span>
          <span className="strong">NCC cần trả</span><span className="r strong">{money(r.value)}</span>
          <span>NCC đã trả</span><span className="r">{money(r.refunded)}{r.refund_code ? ` (${r.refund_code})` : ''}</span>
          <span>Tính vào công nợ</span><span className="r">{money(r.value - r.refunded)}</span>
          {r.cost_value != null && <><span className="muted">Giá trị kho xuất ra</span><span className="r muted">{money(r.cost_value)}</span></>}
        </div></div>
      </div>
      <Section title="Hàng trả">
        <Table dense rows={r.lines} rowKey="id" columns={[
          { key: 'p', label: 'Hàng hóa', render: (l) => <div className="cell-main">{l.sku} · {l.name}</div> },
          { key: 'q', label: 'Số lượng', align: 'right', render: (l) => `${fq(l.qty)} ${l.unit}` },
          ...(can('xem_gia_von') ? [{ key: 'c', label: 'Giá nhập', align: 'right', render: (l) => money(l.unit_cost) }] : []),
          { key: 'u', label: 'Giá trả lại', align: 'right', render: (l) => money(l.unit_price) },
          { key: 'v', label: 'Thành tiền', align: 'right', render: (l) => money(l.value) },
        ]} />
      </Section>
      {!r.cancelled_at && can('nhap_hang') && <Section title="Hủy"><CancelBox busy={busy} label="Hủy phiếu trả" hint="Hàng được nhập lại kho, công nợ NCC trở lại như trước. Có phiếu thu NCC hoàn tiền thì hủy phiếu thu trước."
        onCancel={(reason) => run('cancel_supplier_return', { id, reason }, 'Đã hủy phiếu trả hàng nhập')} /></Section>}
    </Modal>
  );
}

// ===================== IN PHIẾU NHẬP / ĐẶT HÀNG NHẬP / TRẢ HÀNG NHẬP =====================
export function PurchaseSlip({ kind, id, onClose }) {
  const { q, book, settings } = useApp();
  const [d, setD] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        if (kind === 'po') {
          const [o] = await q('purchase_orders', [['id', 'eq', id]]); const lines = await q('purchase_order_lines', [['po_id', 'eq', id]], 'line_no');
          setD({ code: o.code, date: o.order_date, title: o.mode === 'nhap' ? 'PHIẾU NHẬP HÀNG' : 'ĐƠN ĐẶT HÀNG NHẬP', supplier: o.supplier_name, phone: o.supplier_phone, note: o.note,
            invoice: o.invoice_no, expected: o.mode === 'dat' ? o.expected_date : null, goods: o.goods_total, discount: o.discount, total: o.order_total, paid: o.paid_net,
            rows: lines.filter((l) => l.eff_qty > 0).map((l) => ({ id: l.id, sku: l.sku, name: l.product_name, unit: l.unit, qty: l.eff_qty, price: l.unit_price, disc: l.discount, total: l.goods_total })) });
        } else {
          const [r] = await q('supplier_returns', [['id', 'eq', id]]);
          setD({ code: r.code, date: r.return_date, title: 'PHIẾU TRẢ HÀNG NHẬP', supplier: r.supplier_name, note: [r.reason, r.note].filter(Boolean).join(' · '),
            goods: r.goods_total, discount: r.discount, total: r.value, paid: r.refunded, paidLabel: 'NCC đã trả',
            rows: (r.lines || []).map((l) => ({ id: l.id, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, price: l.unit_price, disc: 0, total: Math.round(l.qty * l.unit_price) })) });
        }
      } catch (e) { setErr(e.message); }
    })();
  }, [kind, id]);
  const doPrint = () => { try { window.print(); } catch (e) { /* bỏ qua */ } };
  const R = { textAlign: 'right' };
  return (
    <Modal title="In phiếu" onClose={onClose} size="lg" footer={<><span className="grow" /><Btn onClick={onClose}>Đóng</Btn><Btn kind="primary" icon="print" onClick={doPrint}>In</Btn></>}>
      <ErrorBox error={err} />
      {!d ? !err && <Loading /> : (
        <div className="slip">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div><b style={{ fontSize: 15 }}>{book.name}</b>{settings.shop_address && <div>{settings.shop_address}</div>}{settings.shop_phone && <div>ĐT: {settings.shop_phone}</div>}</div>
            <div style={R}>Số: <b>{d.code}</b><div>Ngày: {dmy(d.date)}</div></div>
          </div>
          <h2>{d.title}</h2>
          <div>Nhà cung cấp: <b>{d.supplier}</b>{d.phone ? ` · ĐT: ${d.phone}` : ''}</div>
          {d.invoice && <div>Số hóa đơn đầu vào: {d.invoice}</div>}
          {d.expected && <div>Ngày nhập dự kiến: {dmy(d.expected)}</div>}
          <table>
            <thead><tr><th>#</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>Giảm giá</th><th>Thành tiền</th></tr></thead>
            <tbody>{d.rows.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td>{l.sku}</td><td>{l.name}</td><td>{l.unit}</td><td style={R}>{fq(l.qty)}</td><td style={R}>{money(l.price)}</td><td style={R}>{l.disc ? money(l.disc) : ''}</td><td style={R}>{money(l.total)}</td></tr>)}</tbody>
          </table>
          <table style={{ marginTop: 6 }}><tbody>
            <tr><td>Tổng tiền hàng</td><td style={R}>{money(d.goods)}</td></tr>
            {d.discount > 0 && <tr><td>Giảm giá</td><td style={R}>−{money(d.discount)}</td></tr>}
            <tr><td><b>{kind === 'po' ? 'Cần trả nhà cung cấp' : 'Nhà cung cấp cần trả'}</b></td><td style={R}><b>{money(d.total)} đ</b></td></tr>
            <tr><td>{d.paidLabel || 'Đã trả nhà cung cấp'}</td><td style={R}>{money(d.paid)}</td></tr>
          </tbody></table>
          <div style={{ marginTop: 6 }}><i>Bằng chữ: {moneyWords(d.total)}</i></div>
          {d.note && <div>Ghi chú: {d.note}</div>}
          <div className="sign">
            <div><b>Nhà cung cấp</b><div className="small">(ký, ghi rõ họ tên)</div></div>
            <div><b>{kind === 'po' ? 'Người nhận hàng' : 'Người giao hàng'}</b><div className="small">(ký, ghi rõ họ tên)</div></div>
            <div><b>Chủ cửa hàng</b><div className="small">(ký, ghi rõ họ tên)</div></div>
          </div>
          <div className="small" style={{ marginTop: 16, color: '#666' }}>In lúc {dmyhm(new Date().toISOString())}</div>
        </div>
      )}
    </Modal>
  );
}
