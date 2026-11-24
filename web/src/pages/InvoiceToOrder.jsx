// Tạo ngược đơn đặt hàng từ hóa đơn bán ngay: chọn một hoặc nhiều hóa đơn của cùng khách, gộp thành một đơn đặt hàng.
// Hệ thống tự tìm nhóm hóa đơn liên quan (chung mặt hàng, gần ngày nhau) và tích sẵn; các hóa đơn khác của khách xếp theo tháng để tích thêm.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useAction } from '../lib/store.jsx';
import { useCustomers } from '../lib/lookups.js';
import { money, dmy } from '../lib/format.js';
import { Btn, Modal, Note, Loading, ErrorBox, Picker, Field, Pill } from '../components/ui.jsx';

const monthOf = (d) => `Tháng ${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function InvoiceToOrderDialog({ invoice_id: invoiceId, onClose }) {
  const { rpc, open } = useApp();
  const customers = useCustomers();
  const { run, busy } = useAction();
  // Nguồn danh sách: mở từ một hóa đơn thì lấy khách của hóa đơn đó và chọn sẵn nhóm liên quan; đổi khách thì tải danh sách của khách mới
  const [src, setSrc] = useState(invoiceId ? { invoice_id: invoiceId } : null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  useEffect(() => {
    if (!src) return undefined;
    let live = true;
    setData(null); setError(null); setSel(new Set());
    rpc('invoice_merge_candidates', src).then((r) => {
      if (!live) return;
      setData(r);
      setSel(new Set(r.picked.length ? r.picked : r.groups.length === 1 ? r.groups[0] : []));
    }).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [src]);
  const cust = data?.customer_id ?? src?.customer_id ?? null;

  const byId = useMemo(() => new Map((data?.invoices || []).map((x) => [x.id, x])), [data]);
  const months = useMemo(() => {
    const m = new Map();
    for (const x of [...(data?.invoices || [])].reverse()) m.set(monthOf(x.order_date), [...(m.get(monthOf(x.order_date)) || []), x]);
    return [...m.entries()];
  }, [data]);
  const picked = [...sel].map((id) => byId.get(id)).filter(Boolean);
  const vats = new Set(picked.map((x) => x.vat_rate));
  const total = picked.reduce((s, x) => s + x.order_total, 0);
  const toggle = (id, on) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const groupLabel = (g) => g.map((id) => byId.get(id)).sort((a, b) => a.order_date.localeCompare(b.order_date));

  const submit = async () => {
    const r = await run('make_order_from_invoices', { invoice_ids: [...sel] }, (x) => `Đã tạo đơn đặt hàng ${x.code} từ ${x.invoices.join(', ')}`
      + (x.warnings?.length ? `. Lưu ý: ${x.warnings.join('; ')}` : ''));
    if (r) { onClose(); open('order', { id: r.id }); }
  };

  const row = (x) => (
    <label key={x.id} className="i2o-row">
      <input type="checkbox" checked={sel.has(x.id)} onChange={(e) => toggle(x.id, e.target.checked)} />
      <span><span className="strong">{x.code}</span>{x.state && <div className="cell-sub">{x.state}</div>}</span>
      <span className="nowrap">{dmy(x.order_date)}</span>
      <span className="i2o-prod muted small" title={x.products.join(', ')}>{x.products.join(', ')}</span>
      <span className="r nowrap">{money(x.order_total)}</span>
      <span className="r nowrap small">{x.receivable > 0 ? <span className="bad">nợ {money(x.receivable)}</span> : <span className="good">đã thu đủ</span>}</span>
    </label>
  );

  return (
    <Modal title="Tạo đơn đặt hàng từ hóa đơn" size="lg" onClose={onClose}
      footer={<>
        <span className="small">{picked.length ? <>Đã chọn <b>{picked.length}</b> hóa đơn · tổng <b>{money(total)}</b></> : 'Chưa chọn hóa đơn nào'}</span>
        <span className="grow" />
        <Btn onClick={onClose}>Bỏ qua</Btn>
        <Btn kind="primary" icon="order" busy={busy} disabled={!picked.length || vats.size > 1} onClick={submit}>Tạo đơn đặt hàng</Btn>
      </>}>
      <div className="stack-s">
        <Note>Các hóa đơn được chọn gộp thành <b>một đơn đặt hàng</b>. Phần đã giao của mỗi hóa đơn thành một đợt giao của đơn, giữ nguyên mã HD, ngày, số tiền, tiền đã thu và tồn kho.
          Phần chưa giao (hóa đơn chờ giao, phiếu tạm) thành hàng còn phải giao của đơn, tiền khách đã trả thành tiền cọc; khi giao sẽ lập hóa đơn HD mới.
          Sau đó lập được đối chiếu số lượng, đối chiếu công nợ, hợp đồng theo đơn — không cần xóa hóa đơn làm lại.</Note>
        <Field label="Khách hàng">
          <Picker items={customers.data} value={cust} onChange={(v) => v && v !== cust && setSrc({ customer_id: v })} getLabel={(c) => c.name} getSub={(c) => c.code} placeholder="Chọn khách hàng…" />
        </Field>
        <ErrorBox error={error} />
        {!src ? null : !data ? (!error && <Loading />) : !data.invoices.length ? <Note tone="warn">Khách này chưa có hóa đơn bán ngay nào.</Note> : <>
          {data.groups.length > 0 && (
            <div className="stack-s">
              <div className="strong">Nhóm hóa đơn liên quan (chung mặt hàng, gần ngày nhau)</div>
              {data.groups.map((g, i) => {
                const xs = groupLabel(g); const all = g.every((id) => sel.has(id));
                return (
                  <div key={i} className="i2o-group">
                    <div className="grow">
                      <div><b>{xs.map((x) => x.code).join(', ')}</b></div>
                      <div className="small muted">{dmy(xs[0].order_date)} – {dmy(xs[xs.length - 1].order_date)} · {[...new Set(xs.flatMap((x) => x.products))].join(', ')} · tổng {money(xs.reduce((s, x) => s + x.order_total, 0))}</div>
                    </div>
                    {all ? <Pill tone="good">Đang chọn</Pill> : <Btn small onClick={() => setSel(new Set(g))}>Chọn nhóm này</Btn>}
                  </div>
                );
              })}
            </div>
          )}
          {picked.some((x) => x.status === 'nhap') && picked.some((x) => x.status === 'xac_nhan') && <Note tone="warn">Có phiếu tạm gộp cùng hóa đơn đã xác nhận: đơn đặt hàng sẽ ở trạng thái đã xác nhận và hàng của phiếu tạm được giữ cho đơn.</Note>}
          {vats.size > 1 && <Note tone="warn">Các hóa đơn đã chọn có thuế suất VAT khác nhau nên không gộp vào một đơn được.</Note>}
          <div className="strong">Tất cả hóa đơn của khách</div>
          {months.map(([m, xs]) => (
            <div key={m} className="i2o-month">
              <div className="i2o-mhead small strong">{m}</div>
              {xs.map(row)}
            </div>
          ))}
        </>}
      </div>
    </Modal>
  );
}

