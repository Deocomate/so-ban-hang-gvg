// Phiếu kho riêng theo kiểu KiotViet: Xuất hủy, Xuất dùng nội bộ (đều là phiếu điều chỉnh giảm) và Sản xuất theo định mức.
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, dmy, todayVN, match } from '../lib/format.js';
import { useProducts, productLabel, productSub } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { useTimeFilter, TimeFilter, dateFilters } from '../components/DocFilters.jsx';
import { Btn, Pill, Field, Input, DateInput, NumInput, Check, Search, ErrorBox, Note, Table, Modal, Picker, ListPage, FilterBox, RadioList } from '../components/ui.jsx';
import { DAMAGE_REASONS, INTERNAL_PURPOSES } from './Inventory.jsx';

const linesText = (ls) => (ls || []).slice(0, 4).map((x) => `${x.sku} ${fq(Math.abs(x.qty))}`).join('; ') + ((ls || []).length > 4 ? ` … (+${ls.length - 4})` : '');

// Danh sách phiếu điều chỉnh lọc theo nhóm lý do; `kinds` là các lựa chọn lọc {value, label}, `kindOf` lấy giá trị lọc của một phiếu
function AdjDocsPage({ title, sub, reasons, kinds, kindOf, kindLabel, mode, createLabel, file }) {
  const { open, can } = useApp();
  const time = useTimeFilter('month');
  const [kind, setKind] = useState(''); const [search, setSearch] = useState('');
  const q = useQ('adjustments', [['reason', 'in', reasons], ...dateFilters('adj_date', time)], 'created_at desc', 20000);
  const all = q.data || [];
  const rows = all.filter((a) => (!kind || kindOf(a) === kind) && match(`${a.code} ${a.note || ''} ${(a.lines || []).map((x) => `${x.sku} ${x.name}`).join(' ')}`, search));
  const cost = can('xem_gia_von');
  const total = rows.reduce((s, a) => s - (a.value || 0), 0);
  return (
    <ListPage title={title} sub={sub}
      filters={<>
        <TimeFilter filter={time} />
        <FilterBox title={kindLabel}><RadioList value={kind} onChange={setKind} options={[{ value: '', label: 'Tất cả', count: all.length },
          ...kinds.map((k) => ({ ...k, count: all.filter((a) => kindOf(a) === k.value).length }))]} /></FilterBox>
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã phiếu, hàng hóa, ghi chú…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx(file, [{ name: title, rows: rows.map((a) => ({ ...a, kind: kinds.find((k) => k.value === kindOf(a))?.label, items: linesText(a.lines), total: -(a.value || 0) })),
          columns: [{ key: 'code', label: 'Mã phiếu' }, { key: 'adj_date', label: 'Ngày', type: 'date' }, { key: 'kind', label: kindLabel }, { key: 'items', label: 'Hàng hóa' },
            ...(cost ? [{ key: 'total', label: 'Tổng giá trị' }] : []), { key: 'note', label: 'Ghi chú' }, { key: 'created_by_name', label: 'Người tạo' }] }])}>Xuất Excel</Btn>
        {can('kho') && <Btn kind="primary" icon="plus" onClick={() => open('adjust', { mode })}>{createLabel}</Btn>}
      </>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} empty="Chưa có phiếu trong kỳ" foot={cost ? { v: money(total) } : null} columns={[
        { key: 'c', label: 'Mã phiếu', render: (a) => <><div className="cell-main">{a.code}</div><div className="cell-sub">{dmy(a.adj_date)}</div></> },
        { key: 'k', label: kindLabel, render: (a) => <Pill tone="warn">{kinds.find((k) => k.value === kindOf(a))?.label || a.reason_label}</Pill> },
        { key: 'l', label: 'Hàng hóa', render: (a) => <span className="small">{linesText(a.lines)}</span> },
        { key: 'n', label: 'Ghi chú', render: (a) => <><span className="small">{a.note}</span>{a.created_by_name && <div className="cell-sub">{a.created_by_name}</div>}</> },
        ...(cost ? [{ key: 'v', label: 'Tổng giá trị', align: 'right', render: (a) => money(-(a.value || 0)) }] : []),
      ]} />
    </ListPage>
  );
}

export function DamagePage() {
  return <AdjDocsPage title="Xuất hủy"
    reasons={[...DAMAGE_REASONS.map((r) => r.value), 'hang_tra_loi']} kinds={[...DAMAGE_REASONS, { value: 'hang_tra_loi', label: 'Hàng khách trả bị lỗi' }]}
    kindOf={(a) => a.reason} kindLabel="Lý do" mode="huy" createLabel="Xuất hủy" file="xuat-huy.xlsx" />;
}

export function InternalUsePage() {
  return <AdjDocsPage title="Xuất dùng nội bộ"
    reasons={['noi_bo']} kinds={INTERNAL_PURPOSES.map((x) => ({ value: x, label: x }))} kindOf={(a) => a.purpose} kindLabel="Loại xuất"
    mode="noi_bo" createLabel="Xuất dùng nội bộ" file="xuat-dung-noi-bo.xlsx" />;
}

export function ProductionPage() {
  const { open, can } = useApp();
  const time = useTimeFilter('month');
  const [search, setSearch] = useState('');
  const q = useQ('productions', dateFilters('prod_date', time), 'created_at desc', 20000);
  const rows = (q.data || []).filter((x) => match(`${x.code} ${x.sku} ${x.name} ${x.note || ''}`, search));
  const cost = can('xem_gia_von');
  return (
    <ListPage title="Sản xuất"
      filters={<TimeFilter filter={time} />}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã phiếu, mặt hàng…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('san-xuat.xlsx', [{ name: 'Sản xuất', rows: rows.map((x) => ({ ...x, items: linesText(x.lines) })), columns: [{ key: 'code', label: 'Mã sản xuất' },
          { key: 'prod_date', label: 'Ngày', type: 'date' }, { key: 'sku', label: 'Mã hàng' }, { key: 'name', label: 'Tên hàng' }, { key: 'qty', label: 'Số lượng' }, { key: 'items', label: 'Thành phần' },
          ...(cost ? [{ key: 'value', label: 'Giá trị' }] : []), { key: 'note', label: 'Ghi chú' }] }])}>Xuất Excel</Btn>
        {can('kho') && <Btn kind="primary" icon="plus" onClick={() => open('production', {})}>Tạo phiếu sản xuất</Btn>}
      </>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} empty="Chưa có phiếu sản xuất trong kỳ" onRow={(x) => open('stockcard', { product_id: x.product_id })} columns={[
        { key: 'c', label: 'Mã sản xuất', render: (x) => <><div className="cell-main">{x.code}</div><div className="cell-sub">{dmy(x.prod_date)}</div></> },
        { key: 'p', label: 'Mặt hàng', render: (x) => <><div className="cell-main">{x.sku} · {x.name}</div><div className="cell-sub">{x.note}</div></> },
        { key: 'q', label: 'Số lượng', align: 'right', render: (x) => <b>{fq(x.qty)} {x.unit}</b> },
        { key: 'l', label: 'Thành phần', render: (x) => <span className="small">{linesText(x.lines)}</span> },
        ...(cost ? [{ key: 'v', label: 'Giá trị', align: 'right', render: (x) => <>{money(x.value)}<div className="cell-sub">{money(x.unit_cost)} / {x.unit}</div></> }] : []),
      ]} />
    </ListPage>
  );
}

let seq = 0;
export function ProductionForm({ onClose }) {
  const { can, rpc } = useApp();
  const products = useProducts();
  const { run, busy } = useAction();
  const items = useMemo(() => (products.data || []).filter((x) => !x.is_kit && !x.is_service), [products.data]);
  const pmap = useMemo(() => Object.fromEntries(items.map((p) => [p.id, p])), [items]);
  const [f, setF] = useState({ product_id: '', qty: 1, date: todayVN(), note: '', save_bom: true });
  const [bom, setBom] = useState([]);
  const [lines, setLines] = useState([]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setL = (k, patch) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  // Chọn mặt hàng: lấy định mức đã lưu, nhân theo số lượng sản xuất
  useEffect(() => {
    if (!f.product_id) { setBom([]); setLines([]); return; }
    rpc('q', { view: 'bom_items', filters: [['product_id', 'eq', f.product_id]], order: 'sku' }).then((b) => {
      setBom(b);
      setLines(b.length ? b.map((x) => ({ key: ++seq, product_id: x.component_id, per: x.qty, qty: x.qty * (Number(f.qty) || 0) })) : [{ key: ++seq, product_id: '', qty: null }]);
    });
  }, [f.product_id]);
  useEffect(() => { setLines((ls) => ls.map((l) => (l.per ? { ...l, qty: Math.round(l.per * (Number(f.qty) || 0) * 1e6) / 1e6 } : l))); }, [f.qty]);
  const cost = can('xem_gia_von');
  const est = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (pmap[l.product_id]?.avg_cost || 0), 0);
  const out = pmap[f.product_id];
  return (
    <Modal title="Tạo phiếu sản xuất" onClose={onClose} size="lg" subtitle="Thành phần được trừ kho theo giá vốn bình quân; thành phẩm nhập kho với giá vốn bằng tổng giá trị đó."
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('save_production', { date: f.date, product_id: f.product_id, qty: Number(f.qty), note: f.note, save_bom: f.save_bom,
          lines: lines.filter((l) => l.product_id && Number(l.qty) > 0).map((l) => ({ product_id: l.product_id, qty: Number(l.qty) })) }, (x) => 'Đã lập phiếu ' + x.code);
        if (r) onClose();
      }}>Hoàn thành</Btn></>}>
      <div className="grid">
        <Field label="Sản xuất mặt hàng" required wide><Picker items={items} value={f.product_id} onChange={(v) => set('product_id', v)} getLabel={productLabel}
          getSub={(x) => `${productSub(x)} · tồn ${fq(x.on_hand)} ${x.unit}`} placeholder="Tìm mặt hàng" /></Field>
        <Field label={`Số lượng${out ? ` (${out.unit})` : ''}`} required><NumInput money={false} stepper min={0} value={f.qty} onChange={(v) => set('qty', v)} /></Field>
        <Field label="Ngày"><DateInput value={f.date} onChange={(v) => set('date', v)} max={todayVN()} /></Field>
        <Field label="Ghi chú" wide><Input value={f.note} onChange={(v) => set('note', v)} placeholder="vd. Lắp 10 bình hút lộc men lam" /></Field>
      </div>
      {f.product_id && <>
        {!bom.length && <Note>Mặt hàng chưa có định mức. Nhập thành phần cho lần này; bật “Lưu làm định mức” để lần sau tự điền theo số lượng.</Note>}
        <div className="stack">
          {lines.map((l) => {
            const p = pmap[l.product_id]; const short = p && Number(l.qty) > p.on_hand;
            return (
              <div key={l.key} className="row gap" style={{ alignItems: 'flex-end' }}>
                <div className="grow" style={{ minWidth: 220 }}><Field label="Thành phần"><Picker items={items.filter((x) => x.id !== f.product_id)} value={l.product_id}
                  onChange={(v) => setL(l.key, { product_id: v, per: null })} getLabel={productLabel} getSub={(x) => `${productSub(x)} · tồn ${fq(x.on_hand)}`} /></Field></div>
                <Field label="Số lượng cần"><NumInput money={false} stepper min={0} value={l.qty} onChange={(v) => setL(l.key, { qty: v, per: null })} style={{ maxWidth: 160 }} /></Field>
                {p && <span className={`small ${short ? 'bad strong' : 'muted'}`} style={{ paddingBottom: 10 }}>tồn {fq(p.on_hand)} {p.unit}{short ? ' · không đủ' : ''}</span>}
                <Btn small kind="ghost" icon="x" aria-label="Bỏ dòng" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
              </div>
            );
          })}
          <div className="row gap">
            <Btn small icon="plus" onClick={() => setLines((ls) => [...ls, { key: ++seq, product_id: '', qty: null }])}>Thêm thành phần</Btn>
            <Check checked={f.save_bom} onChange={(v) => set('save_bom', v)}>Lưu làm định mức cho mặt hàng này</Check>
            {cost && <span className="muted small">Giá trị ước tính: <b>{money(est)}</b>{Number(f.qty) > 0 ? ` · ${money(est / Number(f.qty))} / ${out?.unit || ''}` : ''}</span>}
          </div>
        </div>
      </>}
    </Modal>
  );
}
