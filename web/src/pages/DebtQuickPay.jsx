// Thu / trả nợ nhanh ngay trên báo cáo công nợ: rê chuột vào ô "Còn nợ" hoặc "Tuổi nợ" để mở khung,
// chọn thu hết hay một phần, điền nhanh ngày, quỹ, hình thức, mã giao dịch, ghi chú rồi lưu thành phiếu gắn vào chứng từ.
import React, { useEffect, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, todayVN } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { Btn, NumInput, Input, Select, DateInput, Check } from '../components/ui.jsx';
import { hushHoverCards } from '../components/HoverCard.jsx';
import { reserveTab } from './Documents.jsx';
import { QUICK_FUND_KEY, readFund } from './Sales.jsx';

const METHODS = ['Tiền mặt', 'Chuyển khoản', 'Thẻ / POS', 'COD', 'Bù trừ'];
const ENTER_SUBMITS = new Set(['Số tiền', 'Mã giao dịch', 'Ghi chú']); // Enter ở ô ngày/chọn để dành cho chính ô đó
const PRINT_KEY ='gomsu.debt_quick_print';
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } } };
const methodOf = (fund) => (/mặt|két/i.test(fund?.name || '') ? 'Tiền mặt' : 'Chuyển khoản');

// Số ngày quá hạn (âm = còn bao nhiêu ngày nữa mới đến hạn); null khi chứng từ chưa có hạn trả
export const overdueDays = (d, today = todayVN()) => (d.due_date ? Math.round((new Date(today) - new Date(d.due_date)) / 864e5) : null);

export function agingText(d) {
  const n = overdueDays(d);
  if (n == null) return 'Chưa có hạn trả';
  if (n > 0) return `Quá hạn ${n} ngày (hạn ${dmy(d.due_date)})`;
  if (n === 0) return `Đến hạn hôm nay (${dmy(d.due_date)})`;
  return `Còn ${-n} ngày đến hạn (${dmy(d.due_date)})`;
}

export function DebtQuickPay({ doc: d, isKh, close }) {
  const { open, bookId } = useApp();
  const funds = useFunds();
  const pays = useQ('doc_payments', [['doc_id', 'eq', d.doc_id]], 'pay_date desc', 3);
  const { run, busy } = useAction();
  const verb = isKh ? 'Thu' : 'Trả';
  const due = Math.max(d.remaining_due, 0);
  // Đơn mới giao/nhận một phần: được trả trước cả phần chưa giao, tối đa số còn phải trả cả chứng từ
  const max = Math.max(d.remaining_total ?? due, due);
  const chips = [...[0.3, 0.5, 0.7].map((f) => [`${f * 100}%`, Math.round((due * f) / 1000) * 1000]),
    ...(max > due ? [['Cả chứng từ', max]] : [])].filter(([, v]) => v > 0 && v < max + 1);

  const [mode, setMode] = useState('full');
  const [amount, setAmount] = useState(null);
  const [date, setDate] = useState(todayVN());
  const [fund, setFund] = useState(readFund);
  const [method, setMethod] = useState(null);
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [print, setPrint] = useState(() => store.get(PRINT_KEY) === '1');
  useEffect(() => {
    if (funds.data?.length && !funds.data.some((f) => f.id === fund)) setFund(funds.data[0].id);
  }, [funds.data]);
  const fundRow = (funds.data || []).find((f) => f.id === fund);
  const meth = method || methodOf(fundRow);

  const amt = mode === 'full' ? due : Number(amount) || 0;
  const tooMuch = amt > max;
  const left = due - amt;
  const ok = amt > 0 && !tooMuch && !!fund && !!date;

  const submit = async () => {
    if (!ok || busy) return;
    store.set(QUICK_FUND_KEY, fund);
    const tab = print ? reserveTab() : null;
    const r = await run('create_payment', {
      kind: isKh ? 'thu_khach' : 'tra_ncc', date, fund_id: fund, party_id: d.party_id, amount: amt, method: meth,
      ref_no: refNo.trim() || null, note: note.trim() || null, allocations: [{ doc_type: d.doc_type, doc_id: d.doc_id, amount: amt }],
    }, (x) => `${isKh ? 'Đã thu' : 'Đã trả'} ${money(amt)} đ cho ${d.code} – phiếu ${x.code}. ${left > 0 ? `Còn nợ ${money(left)} đ` : 'Đã hết nợ'}`);
    if (!r) { tab?.cancel(); return; }
    hushHoverCards(2000);
    close();
    if (tab) { const p = { kind: 'payment', id: r.id, type: 'phieu_thu' }; if (!tab.go({ book: bookId, ...p })) open('doc', p); }
  };
  const openFull = () => {
    close();
    open('payment', { kind: isKh ? 'thu_khach' : 'tra_ncc', party_id: d.party_id, alloc: { doc_type: d.doc_type, doc_id: d.doc_id, code: d.code, amount: amt > 0 && !tooMuch ? amt : due } });
  };
  const late = overdueDays(d) > 0;

  return (
    <div className="qe dq" onKeyDown={(e) => { if (e.key === 'Enter' && ENTER_SUBMITS.has(e.target.getAttribute?.('aria-label'))) { e.preventDefault(); submit(); } }}>
      <div className="qe-head">
        <b>{isKh ? 'Thu nợ khách hàng' : 'Trả nợ nhà cung cấp'}</b>
        <span className="muted small">{d.party_name || '—'} · {d.code} · {dmy(d.doc_date)}</span>
      </div>

      <div className={`dq-age ${late ? 'bad' : ''}`}>{agingText(d)}</div>

      <div className="qe-sum">
        <span>{isKh ? 'Đã giao' : 'Đã nhận'}</span><b>{money(d.due_now)}</b>
        <span>Đã {isKh ? 'thu' : 'trả'}</span><b>{money(d.paid_net)}</b>
        <span className="strong">Còn nợ</span><b className="warn">{money(due)}</b>
      </div>

      <div className="seg" role="radiogroup" aria-label="Cách thanh toán">
        <button type="button" role="radio" aria-checked={mode === 'full'} className={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>{verb} hết</button>
        <button type="button" role="radio" aria-checked={mode === 'part'} className={mode === 'part' ? 'on' : ''} onClick={() => setMode('part')}>{verb} một phần</button>
      </div>

      {mode === 'part' && (
        <div className="qe-anim">
          <NumInput value={amount} onChange={setAmount} min={0} max={max} placeholder={`Tối đa ${money(max)}`} autoFocus aria-label="Số tiền" />
          {chips.length > 0 && <div className="qe-chips">{chips.map(([l, v]) => <button type="button" key={l} className={Number(amount) === v ? 'on' : ''} title={`${money(v)} đ`} onClick={() => setAmount(v)}>{l}</button>)}</div>}
          {tooMuch && <div className="field-err">Vượt quá số còn phải {isKh ? 'thu' : 'trả'} {money(max)} đ</div>}
        </div>
      )}

      <div className="dq-grid">
        <label className="dq-f"><span>Ngày {isKh ? 'thu' : 'trả'}</span><DateInput value={date} onChange={(v) => v && setDate(v)} max={todayVN()} aria-label="Ngày" /></label>
        <label className="dq-f"><span>{isKh ? 'Thu vào quỹ' : 'Chi từ quỹ'}</span><Select value={fund} onChange={setFund} options={(funds.data || []).map((f) => ({ value: f.id, label: f.name }))} aria-label="Quỹ" /></label>
        <label className="dq-f"><span>Hình thức</span><Select value={meth} onChange={setMethod} options={METHODS} aria-label="Hình thức" /></label>
        <label className="dq-f"><span>Mã giao dịch</span><Input value={refNo} onChange={setRefNo} placeholder="Không bắt buộc" aria-label="Mã giao dịch" /></label>
        <label className="dq-f dq-wide"><span>Ghi chú</span><Input value={note} onChange={setNote} placeholder={isKh ? 'VD: khách hẹn trả nốt cuối tháng' : 'VD: trả đợt 2'} aria-label="Ghi chú" /></label>
      </div>

      {amt > 0 && !tooMuch && (
        <div className={`dq-after ${left <= 0 ? 'good' : ''}`}>
          {left > 0 ? <>Sau khi {verb.toLowerCase()}: còn nợ <b>{money(left)} đ</b></> : left < 0 ? <>Hết nợ, {isKh ? 'thu' : 'trả'} trước <b>{money(-left)} đ</b> cho phần chưa {isKh ? 'giao' : 'nhận'}</> : <>Sau khi {verb.toLowerCase()}: <b>hết nợ chứng từ này</b></>}
        </div>
      )}

      <Btn kind="primary" icon={isKh ? 'in' : 'out'} busy={busy} disabled={!ok} onClick={submit}>
        {verb} {amt > 0 ? money(amt) + ' đ' : ''} và lưu</Btn>
      <div className="row gap dq-foot">
        <Check checked={print} onChange={(v) => { setPrint(v); store.set(PRINT_KEY, v ? '1' : '0'); }}>Mở phiếu để in</Check>
        <span className="grow" />
        <button type="button" className="link-btn small" onClick={openFull}>Phiếu đầy đủ…</button>
      </div>

      {(pays.data || []).length > 0 && (
        <div className="dq-hist">
          <div className="muted small">Lần {isKh ? 'thu' : 'trả'} gần đây</div>
          {pays.data.map((p) => (
            <button type="button" key={p.payment_id} className="dq-hist-row" onClick={() => { close(); open('pay-detail', { id: p.payment_id }); }}>
              <span>{dmy(p.pay_date)}</span><span className="muted">{p.code}{p.fund_name ? ` · ${p.fund_name}` : ''}</span><b>{money(p.signed_amount ?? p.amount)}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
