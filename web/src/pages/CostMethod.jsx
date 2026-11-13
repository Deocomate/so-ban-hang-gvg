// Đổi phương pháp tính giá vốn: chọn cách tính → chọn phạm vi áp dụng → xem trước chênh lệch → xác nhận (máy chủ sao lưu trước khi đổi).
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useRpcData } from '../lib/store.jsx';
import { money, dmy, dmyhm, todayVN } from '../lib/format.js';
import { Btn, Field, DateInput, NumInput, Check, Note, Table, Modal, Loading, ErrorBox, Pill } from '../components/ui.jsx';

export const COST_LABEL = { avg: 'Giá vốn trung bình', fixed: 'Giá vốn cố định' };
const METHODS = [
  { value: 'avg', title: 'Giá vốn trung bình', text: 'Tính lại sau mỗi lần nhập hàng, trả hàng nhập, sản xuất: giá vốn = tổng giá trị tồn ÷ số lượng tồn. Lãi lỗ phản ánh đúng giá nhập thật.' },
  { value: 'fixed', title: 'Giá vốn cố định', text: 'Mỗi hàng hóa một giá vốn cố định (mặc định là giá nhập đầu tiên, sửa được). Nhập giá khác không làm đổi giá vốn; tồn kho = số lượng × giá vốn cố định.' },
];

const addDay = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const diffCls = (d) => (d > 0 ? 'good' : d < 0 ? 'bad' : 'muted');
const signed = (d) => (d > 0 ? '+' : '') + money(d);

export function CostMethodModal({ onClose }) {
  const { rpc, toast, loadBooks, refresh, book } = useApp();
  const info = useRpcData('cost_method_info', {});
  const [method, setMethod] = useState(null);
  const [mode, setMode] = useState('from');
  const [from, setFrom] = useState('');
  const [fixed, setFixed] = useState({});
  const [pv, setPv] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const [ok, setOk] = useState(false);
  const cur = info.data?.method;
  const minFrom = info.data?.lock_date ? addDay(info.data.lock_date, 1) : null;
  useEffect(() => {
    if (!info.data) return;
    setMethod((m) => m ?? (cur === 'fixed' ? 'avg' : 'fixed'));
    const def = todayVN().slice(0, 8) + '01';
    setFrom((f) => f || (minFrom && minFrom > def ? minFrom : def));
  }, [info.data]);
  // Đổi lựa chọn thì bản xem trước cũ không còn đúng
  useEffect(() => { setPv(null); setOk(false); setErr(''); }, [method, mode, from]);
  const params = () => ({ method, mode, from: mode === 'from' ? from : undefined, fixed_costs: method === 'fixed' ? fixed : undefined });
  const preview = async () => {
    setBusy('pv'); setErr(''); setOk(false);
    try { setPv(await rpc('cost_method_preview', params())); } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  const apply = async () => {
    setBusy('ok');
    try {
      const r = await rpc('change_cost_method', { ...params(), confirm: true });
      await loadBooks(); refresh();
      toast(`Đã đổi sang ${r.label.toLowerCase()}${r.backup ? ` · đã sao lưu ${r.backup}` : ''}`);
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  if (!info.data) return <Modal title="Phương pháp tính giá vốn" onClose={onClose} size="lg">{info.error ? <ErrorBox error={info.error} /> : <Loading />}</Modal>;
  const sameNew = mode === 'new' && method === cur;
  return (
    <Modal title="Phương pháp tính giá vốn" subtitle={`Sổ ${book.name} đang dùng: ${COST_LABEL[cur]}`} onClose={onClose} size="xl"
      footer={<>
        <Btn onClick={onClose}>Hủy</Btn>
        {!pv ? <Btn kind="primary" icon="search" busy={busy === 'pv'} disabled={sameNew || (mode === 'from' && !from)} onClick={preview}>Xem trước thay đổi</Btn>
          : <Btn kind="danger" busy={busy === 'ok'} disabled={!ok} onClick={apply}>Đổi sang {COST_LABEL[method].toLowerCase()}</Btn>}
      </>}>
      <div className="stack">
        <div className="cm-step"><span className="cm-n">1</span><b>Chọn cách tính</b></div>
        <div className="cm-methods" role="radiogroup" aria-label="Cách tính giá vốn">
          {METHODS.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={method === m.value} className={`cm-card${method === m.value ? ' on' : ''}`} onClick={() => setMethod(m.value)}>
              <span className="cm-card-h"><span className="rl-dot" /><b>{m.title}</b>{cur === m.value && <Pill tone="info">Đang dùng</Pill>}</span>
              <span className="cm-card-t">{m.text}</span>
            </button>
          ))}
        </div>

        <div className="cm-step"><span className="cm-n">2</span><b>Áp dụng cho</b></div>
        <div className="cm-methods" role="radiogroup" aria-label="Phạm vi áp dụng">
          <button type="button" role="radio" aria-checked={mode === 'from'} className={`cm-card${mode === 'from' ? ' on' : ''}`} onClick={() => setMode('from')}>
            <span className="cm-card-h"><span className="rl-dot" /><b>Tính lại từ một ngày</b></span>
            <span className="cm-card-t">Giá vốn mọi chứng từ từ ngày chọn đến nay được tính lại: lãi lỗ các tháng đó, giá vốn trên đơn đã giao và giá trị tồn kho thay đổi theo.</span>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'new'} className={`cm-card${mode === 'new' ? ' on' : ''}`} onClick={() => setMode('new')}>
            <span className="cm-card-h"><span className="rl-dot" /><b>Chỉ chứng từ mới</b></span>
            <span className="cm-card-t">Chứng từ đã có giữ nguyên giá vốn. Từ hôm nay giá vốn tính theo cách mới{method === 'fixed' ? '; tồn kho hiện tại được đánh giá lại theo giá vốn cố định' : ''}.</span>
          </button>
        </div>
        {mode === 'from' && (
          <div className="row gap" style={{ alignItems: 'flex-end' }}>
            <Field label="Tính lại từ ngày" hint={minFrom ? `Sổ đã khóa đến ${dmy(info.data.lock_date)}: chỉ chọn được từ ${dmy(minFrom)}` : `Sổ có dữ liệu kho từ ${dmy(info.data.first_date)}`}>
              <DateInput value={from} onChange={setFrom} min={minFrom || undefined} max={todayVN()} />
            </Field>
            <Btn small onClick={() => setFrom(minFrom && minFrom > info.data.first_date ? minFrom : info.data.first_date)}>Từ đầu sổ</Btn>
          </div>
        )}
        {sameNew && <Note>Sổ đang dùng {COST_LABEL[cur].toLowerCase()}. Chọn cách tính khác, hoặc chọn “Tính lại từ một ngày” để tính lại theo cách hiện tại.</Note>}

        <Note tone="warn">
          <b>Lưu ý trước khi đổi.</b> {mode === 'from'
            ? <>Lãi lỗ, giá vốn hàng bán và giá trị tồn kho từ ngày {dmy(from)} sẽ khác số đã xem hoặc đã xuất trước đây. Doanh thu, công nợ, tiền thu chi và giá nhập trên phiếu nhập không đổi.</>
            : <>Đơn và phiếu đã có không đổi. Báo cáo từ hôm nay sẽ dùng cách tính mới, nên so sánh với các tháng trước có thể lệch do khác cách tính.</>}
          {' '}Máy chủ tự sao lưu toàn bộ dữ liệu trước khi đổi; sau này vẫn đổi lại được.
        </Note>

        <ErrorBox error={err} />
        {busy === 'pv' && <Loading text="Đang tính thử trên bản sao dữ liệu…" />}
        {pv && <CostPreview pv={pv} method={method} fixed={fixed} setFixed={setFixed} onRecalc={preview} busy={busy === 'pv'} />}
        {pv && <Check checked={ok} onChange={setOk}>Tôi đã xem bảng chênh lệch và đồng ý đổi sang <b>{COST_LABEL[method].toLowerCase()}</b>{mode === 'from' ? ` từ ngày ${dmy(pv.from)}` : ' cho chứng từ mới'}.</Check>}

        {info.data.history.length > 0 && (
          <details className="cm-history"><summary className="small muted">Lịch sử đổi phương pháp ({info.data.history.length})</summary>
            <ul className="small">{[...info.data.history].reverse().map((h, i) => <li key={i}>{dmyhm(h.at)}: {COST_LABEL[h.from]} → <b>{COST_LABEL[h.to]}</b> · {h.mode === 'new' ? 'chỉ chứng từ mới' : `tính lại từ ${dmy(h.since)}`}</li>)}</ul>
          </details>
        )}
      </div>
    </Modal>
  );
}

function Delta({ label, a, b }) {
  const d = Math.round(b - a);
  return (
    <div className="cm-kpi">
      <div className="cm-kpi-l">{label}</div>
      <div className="cm-kpi-v">{money(b)}</div>
      <div className="small"><span className="muted">trước: {money(a)}</span> · <b className={diffCls(d)}>{d ? signed(d) : 'không đổi'}</b></div>
    </div>
  );
}

function CostPreview({ pv, method, fixed, setFixed, onRecalc, busy }) {
  const t = pv.totals;
  const [onlyChanged, setOnlyChanged] = useState(true);
  const rows = useMemo(() => pv.products.filter((r) => !onlyChanged || r.cost_before !== r.cost_after || r.cogs_before !== r.cogs_after || r.value_before !== r.value_after), [pv, onlyChanged]);
  const edited = Object.keys(fixed).length > 0;
  return (
    <div className="stack">
      <div className="cm-step"><span className="cm-n">3</span><b>Xem trước {pv.mode === 'from' ? `từ ${dmy(pv.from)} đến hôm nay` : 'thay đổi'}</b></div>
      <div className="cm-kpis">
        {pv.mode === 'from' && <Delta label="Giá vốn hàng bán" a={t.cogs_before} b={t.cogs_after} />}
        {pv.mode === 'from' && <Delta label="Lãi gộp" a={t.gross_before} b={t.gross_after} />}
        {pv.mode === 'from' && <Delta label="Lợi nhuận" a={t.profit_before} b={t.profit_after} />}
        <Delta label="Giá trị tồn kho hiện tại" a={t.inventory_before} b={t.inventory_after} />
        <div className="cm-kpi"><div className="cm-kpi-l">Hàng hóa thay đổi</div><div className="cm-kpi-v">{t.changed_products}</div><div className="small muted">mã có giá vốn hoặc tồn kho khác</div></div>
      </div>
      {pv.mode === 'from' && pv.months.length > 0 && (
        <Table dense rows={pv.months} rowKey="month" columns={[
          { key: 'm', label: 'Tháng', render: (m) => `${m.month.slice(5)}/${m.month.slice(0, 4)}` },
          { key: 'c0', label: 'Giá vốn trước', align: 'right', render: (m) => money(m.before.cogs) },
          { key: 'c1', label: 'Giá vốn sau', align: 'right', render: (m) => <b>{money(m.after.cogs)}</b> },
          { key: 'g', label: 'Lãi gộp sau', align: 'right', render: (m) => money(m.after.gross_profit) },
          { key: 'p', label: 'Lợi nhuận: trước → sau', align: 'right', render: (m) => <>{money(m.before.profit)} → <b>{money(m.after.profit)}</b></> },
          { key: 'd', label: 'Chênh lệch', align: 'right', render: (m) => { const d = Math.round(m.after.profit - m.before.profit); return <b className={diffCls(d)}>{d ? signed(d) : '—'}</b>; } },
        ]} />
      )}
      <div className="row gap">
        <b className="grow">Theo hàng hóa</b>
        <Check checked={onlyChanged} onChange={setOnlyChanged}>Chỉ mã có thay đổi</Check>
        {method === 'fixed' && <Btn small icon="refresh" busy={busy} disabled={!edited} onClick={onRecalc}>Tính lại với giá vốn cố định đã sửa</Btn>}
      </div>
      {method === 'fixed' && <div className="muted small">Giá vốn cố định mặc định là đơn giá lần nhập đầu tiên. Sửa trực tiếp trong bảng rồi bấm “Tính lại”.</div>}
      <Table dense rows={rows} empty="Không có mã nào thay đổi" columns={[
        { key: 'n', label: 'Hàng hóa', render: (r) => <><b>{r.sku}</b><div className="cell-sub">{r.name}</div></> },
        { key: 'q', label: 'Tồn', align: 'right', render: (r) => `${money(r.on_hand)} ${r.unit || ''}` },
        { key: 'c', label: 'Giá vốn: trước → sau', align: 'right', render: (r) => (method === 'fixed'
          ? <div className="row gap-s" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}><span className="muted">{money(r.cost_before)} →</span>
              <NumInput min={0} value={fixed[r.id] ?? r.fixed_cost} onChange={(v) => setFixed((s) => ({ ...s, [r.id]: v ?? 0 }))} style={{ maxWidth: 110 }} aria-label={`Giá vốn cố định ${r.sku}`} /></div>
          : <>{money(r.cost_before)} → <b>{money(r.cost_after)}</b></>) },
        ...(pv.mode === 'from' ? [{ key: 'g', label: 'Giá vốn đã bán: trước → sau', align: 'right', render: (r) => <>{money(r.cogs_before)} → <b>{money(r.cogs_after)}</b></> }] : []),
        { key: 'v', label: 'Giá trị tồn: trước → sau', align: 'right', render: (r) => <>{money(r.value_before)} → <b>{money(r.value_after)}</b></> },
      ]} />
      {pv.products.length >= 300 && <div className="muted small">Hiện 300 mã thay đổi nhiều nhất.</div>}
    </div>
  );
}
