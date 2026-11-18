// Tab "Đơn nhập" trong hộp nhà cung cấp: theo dõi đơn chưa giao (quá hạn / sắp hạn / tiến độ), tích chọn nhiều đơn và xuất một tệp PDF.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../lib/store.jsx';
import { money, dmy, qty, todayVN } from '../lib/format.js';
import { saveFile } from '../lib/excel.js';
import { trackOf, pctText, TRACK_RANK, SOON_DAYS } from '../lib/po-tracking.js';
import { Btn, Icon, Pill, StatusPill, RECEIVE, Loading, ErrorBox, Modal } from '../components/ui.jsx';

const TONE = { late: 'bad', soon: 'warn', ok: 'info', nodate: 'neutral', done: 'good', nhap: 'neutral', huy: 'mute' };
const FILTERS = [
  { value: 'open', label: 'Chưa giao xong', test: (t) => t.open },
  { value: 'late', label: 'Quá hạn', test: (t) => t.key === 'late' },
  { value: 'soon', label: `Sắp đến hạn (≤ ${SOON_DAYS} ngày)`, test: (t) => t.key === 'soon' },
  { value: 'done', label: 'Đã giao đủ', test: (t) => t.key === 'done' },
  { value: 'all', label: 'Tất cả', test: () => true },
];
const canPick = (o) => o.status === 'xac_nhan';
const byUrgency = (a, b) => TRACK_RANK[a.t.key] - TRACK_RANK[b.t.key] || String(a.expected_date || '9').localeCompare(String(b.expected_date || '9')) || String(b.order_date).localeCompare(String(a.order_date));

function Progress({ t }) {
  return (
    <div className="po-prog" title={`Đã giao ${qty(t.got)} / ${qty(t.eff)}`}>
      <div className={`po-prog-bar po-${t.key}`}><span style={{ width: `${Math.min(t.pct, 1) * 100}%` }} />{t.timePct != null && t.open && <i style={{ left: `${t.timePct * 100}%` }} title="Mốc thời gian đã trôi qua" />}</div>
      <div className="cell-sub">{pctText(t.pct)} · còn {qty(t.left)}</div>
    </div>
  );
}

// Xem trước tệp PDF trước khi tải về: vẽ từng trang bằng pdf.js nên điện thoại cũng xem được
function PdfPreview({ blob, name, count, onClose, onSave }) {
  const box = useRef(null);
  const [state, setState] = useState({ ready: false, error: null, pages: 0 });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { pdfPages } = await import('../lib/docs/image.js');
        const pages = await pdfPages(blob, () => 2);
        if (!alive || !box.current) return;
        pages.forEach((c, i) => { c.className = 'pdf-page'; c.setAttribute('aria-label', `Trang ${i + 1}`); });
        box.current.replaceChildren(...pages);
        setState({ ready: true, error: null, pages: pages.length });
      } catch (e) { if (alive) setState({ ready: false, error: e.message, pages: 0 }); }
    })();
    return () => { alive = false; };
  }, [blob]);
  return createPortal(
    <Modal title="Xem trước PDF" subtitle={`${name} · ${count} đơn${state.pages ? ` · ${state.pages} trang` : ''}`} size="xl" onClose={onClose}
      footer={<><Btn onClick={onClose}>Đóng</Btn><span className="grow" /><Btn kind="primary" icon="dl" busy={saving} disabled={!state.ready}
        onClick={async () => { setSaving(true); try { await onSave(); } finally { setSaving(false); } }}>Tải PDF về</Btn></>}>
      {!state.ready && !state.error && <Loading />}
      {state.error && <ErrorBox error={'Không xem trước được: ' + state.error} />}
      <div ref={box} className="pdf-preview" hidden={!state.ready} />
    </Modal>,
    document.body,
  );
}

export function SupplierOrdersTab({ supplier, orders }) {
  const { open, q, toast } = useApp();
  const today = todayVN();
  const rows = useMemo(() => (orders.data || []).map((o) => ({ ...o, t: trackOf(o, today) })), [orders.data, today]);
  const count = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, rows.filter((o) => f.test(o.t)).length])), [rows]);
  const [filter, setFilter] = useState(null);
  const cur = filter || (count.open ? 'open' : 'all'); // có đơn đang chờ hàng thì mở thẳng danh sách cần theo dõi
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.value === cur);
    const list = rows.filter((o) => f.test(o.t));
    return cur === 'all' || cur === 'done' ? list : [...list].sort(byUrgency);
  }, [rows, cur]);
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  // Đơn đã chọn mà không còn trong danh sách (bị hủy, tải lại) thì bỏ chọn
  useEffect(() => { setSel((s) => { const ids = new Set(rows.filter(canPick).map((o) => o.id)); const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n; }); }, [rows]);

  const pickable = shown.filter(canPick);
  const allOn = pickable.length > 0 && pickable.every((o) => sel.has(o.id));
  const someOn = pickable.some((o) => sel.has(o.id));
  const headRef = useRef(null);
  useEffect(() => { if (headRef.current) headRef.current.indeterminate = someOn && !allOn; }, [someOn, allOn]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel((s) => { const n = new Set(s); pickable.forEach((o) => (allOn ? n.delete(o.id) : n.add(o.id))); return n; });

  const openRows = rows.filter((o) => o.t.open).sort(byUrgency);
  const chosen = rows.filter((o) => sel.has(o.id)).sort(byUrgency);
  const chosenLeft = chosen.reduce((s, o) => s + o.t.left, 0);

  const exportPdf = async (list, which) => {
    if (!list.length) return;
    setBusy(which);
    try {
      const ids = list.map((o) => o.id);
      const [lines, receipts] = await Promise.all([
        q('purchase_order_lines', [['po_id', 'in', ids]], 'line_no', 10000),
        q('receipts', [['po_id', 'in', ids], ['cancelled_at', 'is_null']], 'receipt_date', 10000), // số đã giao theo từng ngày
      ]);
      const { poTrackingPdf } = await import('../lib/docs/po-tracking-pdf.js');
      const blob = await poTrackingPdf({ supplier, orders: list, lines, receipts, today });
      setPreview({ blob, name: `theo-doi-don-dat_${supplier.code || 'ncc'}_${today}.pdf`, count: list.length });
    } catch (e) { toast('Không tạo được PDF: ' + e.message, 'err'); } finally { setBusy(null); }
  };
  const [preview, setPreview] = useState(null);
  const savePreview = async () => {
    const { blob, name, count } = preview;
    if (await saveFile(name, blob)) { toast(`Đã tải ${name} (${count} đơn)`); setPreview(null); }
  };

  if (!orders.data) return <Loading />;
  return (
    <div className="stack po-track">
      <div className="po-track-head">
        <div className="seg" role="tablist" aria-label="Lọc đơn nhập">
          {FILTERS.map((f) => (
            <button key={f.value} role="tab" aria-selected={cur === f.value} className={cur === f.value ? 'on' : ''} onClick={() => setFilter(f.value)}>
              {f.label} <span className={`po-count ${count[f.value] && (f.value === 'late' ? 'bad' : f.value === 'soon' ? 'warn' : '')}`}>{count[f.value]}</span>
            </button>
          ))}
        </div>
        <span className="grow" />
        <Btn kind="primary" icon="dl" busy={busy === 'open'} disabled={!openRows.length || !!busy} onClick={() => exportPdf(openRows, 'open')}
          title="Gộp mọi đơn chưa giao xong vào một tệp PDF, xếp đơn gấp lên đầu">
          Xuất tất cả đơn chưa giao ({openRows.length})
        </Btn>
      </div>

      {/* Thanh chọn luôn chiếm chỗ để bảng không nhảy khi tích đơn đầu tiên */}
      <div className={`po-selbar${sel.size ? ' on' : ''}`} role="status">
        <Icon name={sel.size ? 'check' : 'info'} size={16} />
        {sel.size
          ? <span>Đã chọn <b>{sel.size}</b> đơn · còn phải giao <b>{qty(chosenLeft)}</b></span>
          : <span>Tích ô đầu dòng để chọn nhiều đơn và xuất chung một tệp PDF</span>}
        <span className="grow" />
        {sel.size > 0 && <Btn small onClick={() => setSel(new Set())}>Bỏ chọn</Btn>}
        <Btn small kind="primary" icon="dl" busy={busy === 'sel'} disabled={!sel.size || !!busy} onClick={() => exportPdf(chosen, 'sel')}>Xuất PDF {sel.size || ''} đơn đã chọn</Btn>
      </div>

      <div className="table-wrap">
        <table className="tbl dense po-tbl">
          <thead><tr>
            <th className="po-ck"><input ref={headRef} type="checkbox" checked={allOn} disabled={!pickable.length} onChange={toggleAll} aria-label="Chọn tất cả đơn đang hiện" /></th>
            <th>Đơn</th><th>Tiến độ giao</th><th>Hạn giao</th><th className="r">Tổng</th><th className="r">Còn nợ</th><th>Trạng thái</th>
          </tr></thead>
          <tbody>
            {!shown.length && <tr><td colSpan={7} className="tbl-empty">{cur === 'open' ? 'Không có đơn nào đang chờ giao' : 'Không có đơn'}</td></tr>}
            {shown.map((o) => {
              const on = sel.has(o.id);
              return (
                <tr key={o.id} className={`clickable${on ? ' po-on' : ''}${o.t.key === 'late' ? ' row-late' : ''}`} onClick={() => open('po', { id: o.id })}>
                  <td className="po-ck" onClick={(e) => { e.stopPropagation(); if (canPick(o)) toggle(o.id); }}>
                    <input type="checkbox" checked={on} disabled={!canPick(o)} onChange={() => {}} aria-label={`Chọn đơn ${o.code}`} />
                  </td>
                  <td><b>{o.code}</b><div className="cell-sub">{dmy(o.order_date)}{o.sales_customer_name ? ` · ${o.sales_customer_name}` : ''}</div></td>
                  <td>{o.status === 'huy' || o.status === 'nhap' ? <span className="muted">—</span> : <Progress t={o.t} />}</td>
                  <td>{o.expected_date ? dmy(o.expected_date) : <span className="muted">—</span>}
                    {o.status === 'xac_nhan' && <div className="row gap-s po-due"><Pill tone={TONE[o.t.key]}>{o.t.label}</Pill>{o.t.behind && o.t.key !== 'late' && <Pill tone="warn">Chậm tiến độ</Pill>}</div>}
                  </td>
                  <td className="r num">{money(o.order_total)}</td>
                  <td className="r num">{o.payable > 0 ? <b className={o.overdue_days > 0 ? 'bad' : ''}>{money(o.payable)}</b> : '—'}</td>
                  <td><StatusPill map={RECEIVE} value={o.receive_status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {preview && <PdfPreview {...preview} onClose={() => setPreview(null)} onSave={savePreview} />}
      <p className="muted small">Vạch dọc trên thanh tiến độ là mốc thời gian đã trôi qua từ ngày đặt tới hạn giao — thanh xanh nằm sau vạch là đang giao chậm hơn kế hoạch.</p>
    </div>
  );
}
