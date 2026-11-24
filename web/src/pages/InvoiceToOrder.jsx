// Liên kết hóa đơn bán ngay với đơn đặt hàng: chọn một hoặc nhiều hóa đơn của cùng khách rồi gộp thành một đơn đặt hàng mới,
// hoặc gắn vào đơn đặt hàng đã có (lập hóa đơn trước, đặt đơn sau) — hàng của hóa đơn trừ vào phần còn phải giao của đơn.
// Hệ thống tự tìm nhóm hóa đơn liên quan (chung mặt hàng, gần ngày nhau) và đơn đặt hàng phù hợp; các hóa đơn khác của khách xếp theo tháng để tích thêm.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useAction } from '../lib/store.jsx';
import { useCustomers } from '../lib/lookups.js';
import { money, dmy, qty as fq } from '../lib/format.js';
import { Btn, Modal, Note, Loading, ErrorBox, Picker, Field, Pill } from '../components/ui.jsx';

const monthOf = (d) => `Tháng ${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function InvoiceToOrderDialog({ invoice_id: invoiceId, order_id: orderId, onClose }) {
  const { rpc, open } = useApp();
  const customers = useCustomers();
  const { run, busy } = useAction();
  // Nguồn danh sách: mở từ một hóa đơn / đơn đặt hàng thì lấy khách của nó và chọn sẵn; đổi khách thì tải danh sách của khách mới
  const [src, setSrc] = useState(invoiceId ? { invoice_id: invoiceId } : orderId ? { order_id: orderId } : null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [target, setTarget] = useState(''); // '' = tạo đơn đặt hàng mới; id = gắn vào đơn có sẵn
  useEffect(() => {
    if (!src) return undefined;
    let live = true;
    setData(null); setError(null); setSel(new Set()); setTarget('');
    rpc('invoice_merge_candidates', src).then((r) => {
      if (!live) return;
      setData(r); setTarget(r.target || '');
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
  const tgt = (data?.orders || []).find((x) => x.id === target) || null;
  const vats = new Set([...picked.map((x) => x.vat_rate), ...(tgt && picked.length ? [tgt.vat_rate] : [])]);
  const total = picked.reduce((s, x) => s + x.order_total, 0);
  const toggle = (id, on) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const groupLabel = (g) => g.map((id) => byId.get(id)).sort((a, b) => a.order_date.localeCompare(b.order_date));

  const submit = async () => {
    const r = await run('make_order_from_invoices', { invoice_ids: [...sel], order_id: target || undefined },
      (x) => (x.attached ? `Đã gắn ${x.invoices.join(', ')} vào đơn ${x.code}` : `Đã tạo đơn đặt hàng ${x.code} từ ${x.invoices.join(', ')}`)
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
  const orderRow = (x) => (
    <label key={x.id} className="i2o-row i2o-order">
      <input type="radio" name="i2o-target" checked={target === x.id} onChange={() => setTarget(x.id)} />
      <span><span className="strong">Gắn vào {x.code}</span>{x.status === 'nhap' && <div className="cell-sub">Phiếu tạm</div>}</span>
      <span className="nowrap">{dmy(x.order_date)}</span>
      <span className="i2o-prod muted small" title={x.products.join(', ')}>{x.products.join(', ')}</span>
      <span className="r nowrap">{money(x.order_total)}</span>
      <span className="r nowrap small">{x.remaining_qty > 0 ? `còn giao ${fq(x.remaining_qty)}` : 'đã giao đủ'}</span>
    </label>
  );

  return (
    <Modal title={tgt ? `Gắn hóa đơn vào đơn ${tgt.code}` : 'Liên kết hóa đơn với đơn đặt hàng'} size="lg" onClose={onClose}
      footer={<>
        <span className="small">{picked.length ? <>Đã chọn <b>{picked.length}</b> hóa đơn · tổng <b>{money(total)}</b></> : 'Chưa chọn hóa đơn nào'}</span>
        <span className="grow" />
        <Btn onClick={onClose}>Bỏ qua</Btn>
        <Btn kind="primary" icon="order" busy={busy} disabled={!picked.length || vats.size > 1} onClick={submit}>{tgt ? `Gắn vào ${tgt.code}` : 'Tạo đơn đặt hàng'}</Btn>
      </>}>
      <div className="stack-s">
        <Note>Phần đã giao của mỗi hóa đơn thành một đợt giao của đơn đặt hàng, giữ nguyên mã HD, ngày, số tiền, tiền đã thu và tồn kho.
          {tgt ? <> Gắn vào đơn có sẵn: hàng trong hóa đơn <b>trừ vào phần còn phải giao</b> của đơn (cùng mặt hàng), nên đơn không bị tính trùng; lấy quá số đặt thì đơn tăng theo.</>
            : <> Phần chưa giao (hóa đơn chờ giao, phiếu tạm) thành hàng còn phải giao của đơn, tiền khách đã trả thành tiền cọc.</>}
          {' '}Sau đó lập được đối chiếu số lượng (có số đặt, đã giao, còn phải giao), đối chiếu công nợ, hợp đồng theo đơn.</Note>
        <Field label="Khách hàng">
          <Picker items={customers.data} value={cust} onChange={(v) => v && v !== cust && setSrc({ customer_id: v })} getLabel={(c) => c.name} getSub={(c) => c.code} placeholder="Chọn khách hàng…" />
        </Field>
        <ErrorBox error={error} />
        {!src ? null : !data ? (!error && <Loading />) : <>
          <div className="strong">Đơn đặt hàng</div>
          <div className="i2o-month">
            <label className="i2o-row i2o-order">
              <input type="radio" name="i2o-target" checked={!target} onChange={() => setTarget('')} />
              <span className="strong" style={{ gridColumn: '2 / -1' }}>Tạo đơn đặt hàng mới từ các hóa đơn đã chọn</span>
            </label>
            {data.orders.map(orderRow)}
          </div>
          {!data.invoices.length ? <Note tone="warn">Khách này chưa có hóa đơn bán ngay nào để liên kết.</Note> : <>
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
            {picked.some((x) => x.status === 'nhap') && (picked.some((x) => x.status === 'xac_nhan') || tgt?.status === 'xac_nhan') && <Note tone="warn">Có phiếu tạm gộp cùng chứng từ đã xác nhận: đơn đặt hàng sẽ ở trạng thái đã xác nhận và hàng của phiếu tạm được giữ cho đơn.</Note>}
            {vats.size > 1 && <Note tone="warn">{tgt ? `Hóa đơn đã chọn phải cùng thuế suất VAT với đơn ${tgt.code}.` : 'Các hóa đơn đã chọn có thuế suất VAT khác nhau nên không gộp vào một đơn được.'}</Note>}
            <div className="strong">Tất cả hóa đơn của khách</div>
            {months.map(([m, xs]) => (
              <div key={m} className="i2o-month">
                <div className="i2o-mhead small strong">{m}</div>
                {xs.map(row)}
              </div>
            ))}
          </>}
        </>}
      </div>
    </Modal>
  );
}
