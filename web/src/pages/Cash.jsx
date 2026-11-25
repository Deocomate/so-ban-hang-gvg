import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, dmyhm, todayVN, match, short } from '../lib/format.js';
import { useCustomers, useSuppliers, useFunds, isCashFund } from '../lib/lookups.js';
import { exportXlsx } from '../lib/excel.js';
import { useTimeFilter, TimeFilter, dateFilters, CheckList } from '../components/DocFilters.jsx';
import { cats, groupOf, GROUP_HINT, GROUP_COLORS } from '../lib/expenseCats.js';
import { BrandSplit, SplitMini } from '../components/BrandSplit.jsx';
import { RecurringPanel } from './RecurringExpenses.jsx';
import {
  Btn, Icon, Pill, Field, Input, TextArea, Select, DateInput, NumInput, Check, Tabs, usePageTab, Search, Loading, ErrorBox, Note, Table, Modal, ConfirmBtn, Picker, KV, Section, ListPage, FilterBox, RadioList,
} from '../components/ui.jsx';

export const PAY_KINDS = [
  { value: 'thu_khach', label: 'Thu tiền khách hàng', dir: 'thu', party: 'kh' },
  { value: 'ncc_hoan', label: 'Nhà cung cấp hoàn tiền', dir: 'thu', party: 'ncc' },
  { value: 'thu_khac', label: 'Thu khác', dir: 'thu' },
  { value: 'gop_von', label: 'Chủ góp vốn', dir: 'thu', owner: true },
  { value: 'tra_ncc', label: 'Trả tiền nhà cung cấp / xưởng', dir: 'chi', party: 'ncc' },
  { value: 'hoan_khach', label: 'Hoàn tiền cho khách', dir: 'chi', party: 'kh' },
  { value: 'chi_phi', label: 'Trả chi phí đã ghi', dir: 'chi' },
  { value: 'chi_khac', label: 'Chi khác', dir: 'chi' },
  { value: 'rut_von', label: 'Chủ rút vốn', dir: 'chi', owner: true },
  { value: 'chuyen_quy', label: 'Chuyển tiền giữa các quỹ', dir: 'chuyen', owner: true },
];
const DOC_LABEL = { don_ban: 'Đơn bán', hoa_don: 'Hóa đơn', don_mua: 'Đơn nhập', chi_phi: 'Chi phí', no_dau_ky: 'Nợ đầu kỳ' };
// Khoản trả cho hóa đơn HD của đơn đặt hàng lưu vào đơn kèm phiếu giao: khi sửa phiếu gửi lại theo hóa đơn
const allocKey = (a) => a.delivery_id || a.doc_id;
const allocType = (a) => (a.delivery_id ? 'hoa_don' : a.doc_type);

// id: sửa phiếu đã lập (giữ mã, loại phiếu); không có id là lập phiếu mới
export function PaymentForm({ id: editId, kind: kind0 = 'thu_khach', party_id: party0, alloc, onClose }) {
  const { can, open, toast, settings } = useApp();
  // Thu / chi bằng ngoại tệ (Thiết lập → Cửa hàng → Quản lý tiền tệ): số tiền đồng = ngoại tệ × tỷ giá
  const curs = settings.currencies || [];
  const [fx, setFx] = useState({ code: '', amount: null, rate: null });
  const fxCur = curs.find((c) => c.code === fx.code);
  const customers = useCustomers(); const suppliers = useSuppliers(); const funds = useFunds();
  const { run, busy } = useAction();
  const [kind, setKind] = useState(kind0);
  const [party, setParty] = useState(party0 || '');
  const [amount, setAmount] = useState(alloc?.amount > 0 ? alloc.amount : null);
  const [fee, setFee] = useState(null);
  const [fund, setFund] = useState(''); const [toFund, setToFund] = useState('');
  const [date, setDate] = useState(todayVN()); const [method, setMethod] = useState('Chuyển khoản'); const [note, setNote] = useState(''); const [refNo, setRefNo] = useState('');
  const [al, setAl] = useState(alloc ? { [alloc.doc_id]: alloc.amount > 0 ? alloc.amount : null } : {});
  // Như KiotViet: tiền trả cho từng chứng từ tự chia theo số tiền thu, cho đến khi người dùng tự sửa một dòng
  const [manual, setManual] = useState(false);
  const [reason, setReason] = useState('');
  // Sửa phiếu: nạp phiếu một lần; số tiền phiếu đang trả cho từng chứng từ được cộng lại vào số còn phải trả
  const editQ = useQ('payments', [['id', 'eq', editId || '']], null, 1, !!editId);
  const [edit, setEdit] = useState(null);
  useEffect(() => {
    const x = editQ.data?.[0];
    if (!x || edit) return;
    const al0 = Object.fromEntries((x.allocations || []).map((a) => [allocKey(a), a.amount]));
    setEdit({ ...x, orig: al0, types: Object.fromEntries((x.allocations || []).map((a) => [allocKey(a), allocType(a)])) });
    setKind(x.kind); setParty(x.party_id || ''); setAmount(x.amount); setFee(x.fee || null); setFund(x.fund_id); setToFund(x.to_fund_id || '');
    setDate(x.pay_date); setMethod(x.method || 'Tiền mặt'); setNote(x.note || ''); setRefNo(x.ref_no || ''); setAl(al0); setManual(true);
  }, [editQ.data]);
  const orig = edit?.orig || {};
  const def = PAY_KINDS.find((k) => k.value === kind);
  // Như KiotViet: phiếu thu / phiếu chi chỉ chọn Tiền mặt / Chuyển khoản, quỹ đi theo hình thức (không hỏi quỹ, phí sàn, mã giao dịch).
  // Chuyển tiền giữa các quỹ vẫn chọn quỹ đi, quỹ đến.
  const isThu = def?.dir === 'thu';
  const simple = kind !== 'chuyen_quy' && !editId;
  const allFunds = funds.data || [];
  const cashFunds = allFunds.filter(isCashFund); const bankFunds = allFunds.filter((f) => !isCashFund(f));
  const thuMethod = isCashFund(allFunds.find((f) => f.id === fund)) ? 'Tiền mặt' : 'Chuyển khoản';
  const pickThuMethod = (m) => { const list = m === 'Tiền mặt' ? cashFunds : bankFunds; if (!list.some((f) => f.id === fund)) setFund(list[0]?.id || ''); };
  const docTypes = kind === 'thu_khach' || kind === 'hoan_khach' ? ['don_ban', 'no_dau_ky', ...(edit ? ['hoa_don'] : [])] : kind === 'tra_ncc' || kind === 'ncc_hoan' ? ['don_mua', 'no_dau_ky', 'chi_phi'] : kind === 'chi_phi' ? ['chi_phi'] : [];
  const docsQ = useQ('open_docs', kind === 'chi_phi' ? [['doc_type', 'eq', 'chi_phi'], ['party_id', 'is_null']] : [['party_id', 'eq', party || '00000000-0000-0000-0000-000000000000']], 'doc_date', 500, docTypes.length > 0 && (!!party || kind === 'chi_phi'));
  const refund = kind === 'hoan_khach' || kind === 'ncc_hoan';
  // Thu tiền khách: không tự chia vào các đơn / hóa đơn. Phiếu mở từ một chứng từ chỉ trả cho đúng chứng từ đó, phần dư là khách trả trước;
  // phiếu lập ở Sổ quỹ chỉ ghi theo ngày (sửa phiếu cũ vẫn thấy và sửa được phần đã gắn)
  const noSplit = kind === 'thu_khach';
  const docs = useMemo(() => (docsQ.data || []).filter((d) => docTypes.includes(d.doc_type) && (d.doc_type !== 'hoa_don' || orig[d.doc_id] != null)
    && (!noSplit || edit || d.doc_id === alloc?.doc_id || al[d.doc_id])).map((d) => {
    const mine = orig[d.doc_id] || 0;   // phần phiếu đang sửa đã trả cho chứng từ này
    return { ...d, remaining_due: d.remaining_due + mine, limit: (refund ? (d.doc_type === 'no_dau_ky' ? -d.remaining_total : d.paid_net - d.due_now) : d.remaining_total) + mine };
  }).filter((d) => d.limit > 0 && (refund || d.status !== 'huy') || al[d.doc_id]), [docsQ.data, kind, al, edit]);
  useEffect(() => { if (!fund && funds.data?.length) setFund(funds.data[0].id); }, [funds.data]);
  useEffect(() => { if (!alloc && !(edit && party === (edit.party_id || ''))) { setAl({}); setManual(false); } }, [kind, party]);
  const allocated = Object.values(al).reduce((s, v) => s + (Number(v) || 0), 0);
  // Chia số tiền cho các chứng từ: chứng từ đang mở (nếu mở phiếu từ một đơn) trước, rồi chứng từ cũ trước; phần dư là trả trước
  const distribute = (total) => {
    if (noSplit) {
      if (!alloc) return {};
      const d = docs.find((x) => x.doc_id === alloc.doc_id);
      const v = Math.min(Number(total) || 0, d ? d.limit : Infinity);
      return v > 0 ? { [alloc.doc_id]: v } : {};
    }
    let left = Number(total) || 0; const next = {};
    const order = [...docs].sort((a, b) => (a.doc_id === alloc?.doc_id ? -1 : b.doc_id === alloc?.doc_id ? 1 : a.doc_date < b.doc_date ? -1 : 1));
    if (alloc && !order.some((d) => d.doc_id === alloc.doc_id)) order.unshift({ doc_id: alloc.doc_id, limit: Infinity, remaining_due: Infinity });
    for (const pass of ['due', 'total']) for (const d of order) {
      if (left <= 0) break;
      const cap = pass === 'due' && !refund ? Math.min(d.limit, Math.max(0, d.remaining_due)) : d.limit;
      const already = next[d.doc_id] || 0; const a = Math.min(cap - already, left);
      if (a > 0) { next[d.doc_id] = already + a; left -= a; }
    }
    return next;
  };
  // Bớt tiền ở các dòng sau cùng cho tổng không vượt số tiền phiếu (giữ thứ tự người dùng đã chia)
  const trim = (cur, total) => {
    let over = Object.values(cur).reduce((s, v) => s + (Number(v) || 0), 0) - (Number(total) || 0); const next = { ...cur };
    for (const k of Object.keys(next).reverse()) {
      if (over <= 0) break;
      const cut = Math.min(Number(next[k]) || 0, over); next[k] = (Number(next[k]) || 0) - cut || null; over -= cut;
    }
    return next;
  };
  const autoFill = () => { setManual(false); setAl(distribute(amount)); };
  // Đổi số tiền thu: chưa sửa tay thì chia lại; đã sửa tay thì chỉ bớt khi tổng đang vượt
  const changeAmount = (v) => { setAmount(v); setAl((cur) => (!manual ? distribute(v) : trim(cur, v))); };
  // Sửa tiền một dòng: tổng các dòng vượt số tiền thu thì tăng số tiền thu cho bằng
  const changeLine = (id, v) => {
    setManual(true);
    const next = { ...al, [id]: v }; setAl(next);
    const sum = Object.values(next).reduce((s, x) => s + (Number(x) || 0), 0);
    if (!fxCur && sum > (Number(amount) || 0)) setAmount(sum);
  };
  const over = allocated - (Number(amount) || 0);
  const partyList = def?.party === 'kh' ? customers.data : def?.party === 'ncc' ? suppliers.data : null;
  const partyRow = partyList?.find((p) => p.id === party);
  const submit = async () => {
    if (over > 0) return;
    const allocations = Object.entries(al).filter(([, v]) => Number(v) > 0).map(([doc_id, v]) => ({ doc_id, doc_type: docs.find((d) => d.doc_id === doc_id)?.doc_type || edit?.types[doc_id] || alloc?.doc_type, amount: Number(v) }));
    if (editId) {
      const r = await run('update_payment', { id: editId, date, fund_id: fund, to_fund_id: toFund || null, party_id: party || null, amount, fee, method, ref_no: refNo, note, reason, allocations },
        (x) => (x.changes.length ? `Đã sửa phiếu ${x.code}` : `Phiếu ${x.code} không có gì thay đổi`));
      if (r) onClose();
      return;
    }
    const fxp = fxCur ? { fx: { code: fx.code, amount: fx.amount, rate: fx.rate ?? fxCur.rate } } : {};
    const r = await run('create_payment', { kind, date, fund_id: fund, to_fund_id: toFund || null, party_id: party || null, amount,
      fee: simple ? 0 : fee, method: simple ? thuMethod : method, ref_no: simple ? null : refNo, note, allocations, ...fxp },
      (x) => `Đã lập ${def.dir === 'thu' ? 'phiếu thu' : def.dir === 'chi' ? 'phiếu chi' : 'phiếu chuyển quỹ'} ${x.code}`);
    if (r) onClose();
  };
  const kinds = PAY_KINDS.filter((k) => !k.owner || can('owner') || k.value === kind);
  if (editId && !edit) return <Modal title="Sửa phiếu" onClose={onClose}>{editQ.error ? <ErrorBox error={editQ.error} /> : <Loading />}</Modal>;
  return (
    <Modal title={edit ? `Sửa ${def?.dir === 'thu' ? 'phiếu thu' : def?.dir === 'chi' ? 'phiếu chi' : 'phiếu chuyển quỹ'} ${edit.code}` : def?.dir === 'thu' ? 'Thu tiền' : def?.dir === 'chi' ? 'Chi tiền' : 'Chuyển quỹ'} onClose={onClose} size="lg"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} disabled={over > 0} onClick={submit} icon={edit ? 'check' : def?.dir === 'thu' ? 'in' : 'out'}>{edit ? 'Lưu thay đổi' : 'Lưu phiếu'}</Btn></>}>
      {edit && <Note>Giữ nguyên mã phiếu {edit.code}. Quỹ, công nợ và tiền trả trước được tính lại theo nội dung mới như khi hủy phiếu rồi lập lại; lần sửa được ghi vào lịch sử phiếu.</Note>}
      <div className="grid">
        <Field label="Loại phiếu"><Select disabled={!!edit} value={kind} onChange={(v) => { setKind(v); if (PAY_KINDS.find((k) => k.value === v)?.party !== def?.party) setParty(''); }}
          options={kinds.map((k) => ({ value: k.value, label: (k.dir === 'thu' ? 'Thu · ' : k.dir === 'chi' ? 'Chi · ' : '') + k.label }))} /></Field>
        {def?.party && <Field label={def.party === 'kh' ? 'Khách hàng' : 'Nhà cung cấp'} required hint={partyRow ? (def.party === 'kh' ? `Đang nợ ${money(partyRow.receivable)} · trả trước ${money(partyRow.prepaid)}` : `Mình đang nợ ${money(partyRow.payable)} · đã trả trước ${money(partyRow.prepaid)}`) : null}>
          <Picker items={partyList || []} value={party} onChange={setParty} getLabel={(p) => p.name} getSub={(p) => p.code + (p.phone ? ' · ' + p.phone : '')} />
        </Field>}
        {curs.length > 0 && !edit && <Field label="Tiền tệ"><Select value={fx.code} onChange={(v) => { setFx({ code: v, amount: null, rate: null }); }} options={[{ value: '', label: 'VND' }, ...curs.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))]} /></Field>}
        {fxCur && <Field label={`Số tiền ${fxCur.code}`} required><NumInput money={false} min={0} value={fx.amount} onChange={(v) => { setFx((s) => ({ ...s, amount: v })); changeAmount(Math.round((Number(v) || 0) * (Number(fx.rate ?? fxCur.rate) || 0))); }} /></Field>}
        {fxCur && <Field label="Tỷ giá" hint={`Mặc định ${money(fxCur.rate)} đ/${fxCur.code}`}><NumInput min={0} value={fx.rate ?? fxCur.rate} onChange={(v) => { setFx((s) => ({ ...s, rate: v })); changeAmount(Math.round((Number(fx.amount) || 0) * (Number(v) || 0))); }} /></Field>}
        <Field label={fxCur ? 'Quy đổi ra đồng' : isThu ? 'Số tiền thu' : 'Số tiền chi'} required><NumInput value={amount} onChange={changeAmount} placeholder="0" disabled={!!fxCur} /></Field>
        {simple ? <>
          <Field label="Hình thức"><div className="seg" role="radiogroup" aria-label="Hình thức">{['Tiền mặt', 'Chuyển khoản'].map((m) => (
            <button type="button" key={m} role="radio" aria-checked={thuMethod === m} className={thuMethod === m ? 'on' : ''}
              disabled={!(m === 'Tiền mặt' ? cashFunds : bankFunds).length} onClick={() => pickThuMethod(m)}>{m}</button>))}</div></Field>
          {thuMethod === 'Chuyển khoản' && bankFunds.length > 1 && <Field label={isThu ? 'Vào tài khoản' : 'Từ tài khoản'}><Select value={fund} onChange={setFund} options={bankFunds.map((f) => ({ value: f.id, label: f.name }))} /></Field>}
        </> : <>
          <Field label={isThu ? 'Vào quỹ' : 'Từ quỹ'}><Select value={fund} onChange={(v) => { setFund(v); if (['Tiền mặt', 'Chuyển khoản'].includes(method)) setMethod(isCashFund(allFunds.find((f) => f.id === v)) ? 'Tiền mặt' : 'Chuyển khoản'); }} options={allFunds.map((f) => ({ value: f.id, label: `${f.name} (${money(f.balance)})` }))} /></Field>
          {kind === 'chuyen_quy' && <Field label="Sang quỹ"><Select value={toFund} onChange={setToFund} placeholder="Chọn quỹ nhận" options={allFunds.filter((f) => f.id !== fund).map((f) => ({ value: f.id, label: f.name }))} /></Field>}
        </>}
        <Field label="Ngày"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        {!simple && <Field label="Hình thức"><Select value={method} onChange={setMethod} options={['Tiền mặt', 'Chuyển khoản', 'Thẻ / POS', 'TikTok Shop', 'COD', 'Bù trừ']} /></Field>}
        {!simple && <Field label="Mã giao dịch" hint="Nếu có"><Input value={refNo} onChange={setRefNo} /></Field>}
        {edit && kind === 'thu_khach' && <Field label="Phí sàn / thu hộ bị trừ" hint="Ghi vào chi phí, quỹ nhận số tiền trừ phí"><NumInput value={fee} onChange={setFee} placeholder="0" /></Field>}
        <Field label="Nội dung" wide><Input value={note} onChange={setNote} placeholder="vd. Đại lý chuyển khoản đợt 2" /></Field>
        {edit && <Field label="Lý do sửa" wide hint="Ghi vào lịch sử phiếu"><Input value={reason} onChange={setReason} placeholder="vd. Ghi nhầm số tiền" /></Field>}
      </div>
      {noSplit && !edit && !alloc && party && <Note>Phiếu thu ghi theo ngày và trừ vào tổng công nợ của khách, không chia vào hóa đơn nào. Muốn trả cho một hóa đơn cụ thể thì bấm <b>Thu tiền</b> ngay ở hóa đơn đó.</Note>}
      {docTypes.length > 0 && (party || kind === 'chi_phi') && (!noSplit || edit || alloc) && (
        <Section title={refund ? 'Hoàn theo chứng từ' : 'Trả cho chứng từ nào'} actions={!noSplit && <Btn small onClick={autoFill}>{refund ? 'Tự chia' : 'Trả chứng từ cũ trước'}</Btn>}>
          {noSplit && alloc && !docs.some((d) => d.doc_id === alloc.doc_id) ? (
            // Thu cho một hóa đơn HD của đơn đặt hàng (không nằm trong danh sách đơn còn mở): trả đúng hóa đơn đó, phần dư là khách trả trước
            <div className="row gap"><span>Trả cho hóa đơn <b>{alloc.code}</b></span><span className="grow" />
              <NumInput value={al[alloc.doc_id]} onChange={(v) => changeLine(alloc.doc_id, v)} style={{ maxWidth: 160 }} aria-label={`Số tiền trả cho ${alloc.code}`} /></div>
          ) : !docsQ.data ? <Loading /> : docs.length === 0 ? <div className="muted small">Không có chứng từ nào đang mở{refund ? ' có tiền trả dư' : ''}. {kind === 'thu_khach' ? 'Toàn bộ số tiền sẽ ghi là khách trả trước.' : ''}</div> : (
            <Table dense rows={docs} rowKey="doc_id" columns={[
              { key: 'c', label: 'Chứng từ', render: (d) => <><b>{d.code}</b><div className="cell-sub">{DOC_LABEL[d.doc_type]} · {dmy(d.doc_date)}{d.due_date ? ' · hạn ' + dmy(d.due_date) : ''}</div></> },
              { key: 't', label: 'Tổng', align: 'right', render: (d) => money(d.total) },
              { key: 'p', label: 'Đã trả', align: 'right', render: (d) => money(d.paid_net) },
              { key: 'r', label: refund ? 'Có thể hoàn' : 'Còn phải trả', align: 'right', render: (d) => <>{money(d.limit)}{!refund && d.remaining_due > 0 && d.remaining_due < d.limit && <div className="cell-sub">đến hạn {money(d.remaining_due)}</div>}</> },
              { key: 'a', label: refund ? 'Số tiền hoàn' : 'Số tiền trả', align: 'right', render: (d) => <NumInput value={al[d.doc_id]} onChange={(v) => changeLine(d.doc_id, v)} style={{ maxWidth: 130 }} /> },
            ]} />
          )}
          {over > 0 ? (
            <Note tone="warn">
              <div>Bạn đang ghi trả cho các {refund ? 'chứng từ' : 'đơn'} tổng <b>{money(allocated)} đ</b>, nhiều hơn số tiền {isThu ? 'thu' : 'của phiếu'} <b>{money(amount || 0)} đ</b>. Chọn một cách để sửa:</div>
              <div className="row gap-s" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <Btn small kind="primary" onClick={() => setAl(trim(al, amount))}>Giữ {money(amount || 0)} đ, bớt tiền ở các dòng</Btn>
                {!fxCur && <Btn small onClick={() => setAmount(allocated)}>Tăng số tiền {isThu ? 'thu' : 'phiếu'} lên {money(allocated)} đ</Btn>}
              </div>
            </Note>
          ) : (
            <div className="small muted">Đã chia {money(allocated)} / {money(amount || 0)}.{' '}
              {(Number(amount) || 0) - allocated > 0 && (kind === 'thu_khach' ? `Còn ${money((amount || 0) - allocated)} sẽ ghi là khách trả trước.` : kind === 'tra_ncc' ? `Phần còn lại ghi là trả trước cho nhà cung cấp.` : '')}</div>
          )}
        </Section>
      )}
      {kind === 'chi_phi' && <Note>Chi phí mới hãy ghi ở mục <b>Chi phí</b> (có tùy chọn trả ngay). Mục này để trả các chi phí đã ghi nhưng chưa trả.</Note>}
    </Modal>
  );
}

export function PaymentDetail({ id, onClose }) {
  const { can, open } = useApp();
  const q = useQ('payments', [['id', 'eq', id]]);
  const { run, busy } = useAction();
  const p = q.data?.[0];
  if (!p) return <Modal title="Phiếu" onClose={onClose}>{q.error ? <ErrorBox error={q.error} /> : <Loading />}</Modal>;
  return (
    <Modal title={`${p.direction === 'thu' ? 'Phiếu thu' : p.direction === 'chi' ? 'Phiếu chi' : 'Chuyển quỹ'} ${p.code}`} onClose={onClose} size="md"
      subtitle={<span className="row gap-s">{p.kind_label} · {dmy(p.pay_date)} {p.voided && <Pill tone="bad">Đã hủy</Pill>}</span>}
      footer={<Btn icon="dl" onClick={() => open('doc', { kind: 'payment', id })}>Xuất phiếu PDF</Btn>}>
      <KV items={[
        [p.direction === 'thu' ? 'Ngày nhận' : 'Ngày', dmy(p.pay_date)],
        ['Số tiền', <b>{money(p.amount)} đ</b>], p.fee > 0 && ['Phí sàn bị trừ', money(p.fee) + ' đ'], p.fee > 0 && ['Thực vào quỹ', money(p.cash_amount) + ' đ'],
        ['Hình thức', [p.method, p.fund_name + (p.to_fund_name ? ' → ' + p.to_fund_name : '')].filter(Boolean).join(' · ')], p.ref_no && ['Mã giao dịch', p.ref_no],
        ['Đối tượng', p.party_name || '—'], ['Nội dung', p.note || '—'], ['Người ghi', p.created_by_name || '—'],
        p.unallocated > 0 && p.party_type && [p.party_type === 'kh' && p.kind === 'thu_khach' ? 'Khách trả trước' : 'Chưa trả cho chứng từ nào', <b className="good">{money(p.unallocated)} đ</b>],
        p.voided && ['Lý do hủy', p.void_reason],
      ]} />
      {(p.allocations || []).length > 0 && <Table dense rows={p.allocations} rowKey="doc_id" onRow={(a) => (a.doc_type === 'don_ban' ? open('order', { id: a.doc_id }) : a.doc_type === 'don_mua' ? open('po', { id: a.doc_id }) : null)}
        foot={{ c: 'Tổng', a: money(p.allocated) }} columns={[
          { key: 'c', label: p.kind === 'hoan_khach' || p.kind === 'ncc_hoan' ? 'Hoàn theo chứng từ' : 'Trả cho', render: (a) => <><b>{a.doc_code}</b><div className="cell-sub">{DOC_LABEL[a.doc_type]}</div></> },
          { key: 'a', label: 'Số tiền', align: 'right', render: (a) => money(a.amount) },
        ]} />}
      {(p.edit_log || []).length > 0 && (
        <Section title="Lịch sử sửa phiếu">
          {[...p.edit_log].reverse().map((h, i) => (
            <div key={i} className="small" style={{ marginBottom: 6 }}>
              <b>{dmyhm(h.at)}</b>{h.by_name ? ` · ${h.by_name}` : ''}{h.reason ? ` · ${h.reason}` : ''}
              <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>{(h.changes || []).map((c, j) => <li key={j}>{c}</li>)}</ul>
            </div>
          ))}
        </Section>
      )}
      {can('thu_chi') && !p.voided && (!['gop_von', 'rut_von', 'chuyen_quy'].includes(p.kind) || can('owner')) && (
        <Section title="Sửa phiếu">
          <div className="muted small">Sửa ngày, số tiền, quỹ, đối tượng, nội dung hoặc phần trả cho từng đơn mà vẫn giữ mã phiếu {p.code}.</div>
          <div className="row gap"><Btn icon="edit" onClick={() => open('payment', { id })}>Sửa phiếu</Btn></div>
        </Section>
      )}
      {can('owner') && !p.voided && (
        <Section title="Hủy phiếu">
          <div className="muted small">Phiếu hủy vẫn giữ trong lịch sử, chỉ không còn tính vào quỹ và công nợ. Tiền không thu / chi thật thì hủy; ghi nhầm thông tin thì dùng Sửa phiếu.</div>
          <div className="row gap"><ConfirmBtn kind="danger" busy={busy} onConfirm={async () => { if (await run('void_payment', { id }, 'Đã hủy phiếu ' + p.code)) onClose(); }}>Hủy phiếu</ConfirmBtn></div>
        </Section>
      )}
    </Modal>
  );
}

export function CashPage() {
  const { open, can } = useApp();
  const time = useTimeFilter('month');
  const [types, setTypes] = useState(['thu', 'chi', 'chuyen']); const [states, setStates] = useState(['ok']);
  const [search, setSearch] = useState(''); const [fundF, setFundF] = useState('');
  const funds = useFunds();
  const pays = useQ('payments', dateFilters('pay_date', time), 'created_at desc', 20000);
  const base = useMemo(() => (pays.data || []).filter((p) => (!fundF || p.fund_id === fundF || p.to_fund_id === fundF)
    && match(`${p.code} ${p.party_name || ''} ${p.note || ''} ${p.kind_label}`, search)), [pays.data, search, fundF]);
  const rows = useMemo(() => base.filter((p) => types.includes(p.direction) && states.includes(p.voided ? 'huy' : 'ok')), [base, types, states]);
  const sum = (d) => rows.filter((p) => p.direction === d && !p.voided).reduce((s, p) => s + p.cash_amount, 0);
  return (
    <ListPage title="Sổ quỹ – thu chi"
      filters={<>
        <TimeFilter filter={time} />
        <FilterBox title="Loại chứng từ"><CheckList value={types} onChange={setTypes} options={[
          { value: 'thu', label: 'Phiếu thu', count: base.filter((p) => p.direction === 'thu').length }, { value: 'chi', label: 'Phiếu chi', count: base.filter((p) => p.direction === 'chi').length },
          { value: 'chuyen', label: 'Chuyển quỹ', count: base.filter((p) => p.direction === 'chuyen').length }]} /></FilterBox>
        <FilterBox title="Trạng thái"><CheckList value={states} onChange={setStates} options={[
          { value: 'ok', label: 'Đã thanh toán', count: base.filter((p) => !p.voided).length }, { value: 'huy', label: 'Đã hủy', count: base.filter((p) => p.voided).length }]} /></FilterBox>
        {(funds.data || []).length > 1 && <FilterBox title="Quỹ tiền"><RadioList value={fundF} onChange={setFundF} options={[{ value: '', label: 'Tất cả quỹ' }, ...(funds.data || []).map((f) => ({ value: f.id, label: f.name }))]} /></FilterBox>}
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm số phiếu, khách, nội dung…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('thu-chi.xlsx', [{ name: 'Thu chi', rows, columns: [
          { key: 'code', label: 'Số phiếu' }, { key: 'pay_date', label: 'Ngày', type: 'date' }, { key: 'kind_label', label: 'Loại' }, { key: 'party_name', label: 'Đối tượng' },
          { key: 'fund_name', label: 'Quỹ' }, { key: 'amount', label: 'Số tiền' }, { key: 'fee', label: 'Phí sàn' }, { key: 'cash_amount', label: 'Tiền thực' }, { key: 'note', label: 'Nội dung' },
          { key: 'voided', label: 'Đã hủy', get: (p) => (p.voided ? 'Có' : '') }] }])}>Xuất Excel</Btn>
        <Btn kind="primary" icon="in" onClick={() => open('payment', { kind: 'thu_khach' })}>Lập phiếu thu</Btn>
        <Btn kind="primary" icon="out" onClick={() => open('payment', { kind: 'tra_ncc' })}>Lập phiếu chi</Btn>
      </>}>
      <div className="kpis">
        {(funds.data || []).map((f) => <button key={f.id} className={`kpi${fundF === f.id ? ' key' : ''}`} onClick={() => setFundF(fundF === f.id ? '' : f.id)}><span className="kpi-label">{f.name}</span><span className="kpi-value">{money(f.balance)}</span><span className="kpi-sub">Số dư hiện tại · đầu sổ {short(f.opening_balance)}</span></button>)}
      </div>
      <div className="lp-sum"><span>Tổng thu <b className="good">{money(sum('thu'))}</b></span><span>Tổng chi <b className="bad">{money(sum('chi'))}</b></span><span>Chênh lệch <b>{money(sum('thu') - sum('chi'))}</b></span></div>
      <ErrorBox error={pays.error} />
      <Table rows={pays.data ? rows : null} expand={(p, close) => <PaymentDetail id={p.id} onClose={close} />} columns={[
        { key: 'c', label: 'Phiếu', render: (p) => <><div className="cell-main">{p.code}</div><div className="cell-sub">{dmy(p.pay_date)}</div></> },
        { key: 'k', label: 'Loại', render: (p) => <>{p.kind_label}<div className="cell-sub">{p.fund_name}{p.to_fund_name ? ' → ' + p.to_fund_name : ''}</div></> },
        { key: 'p', label: 'Đối tượng / nội dung', render: (p) => <>{p.party_name || '—'}<div className="cell-sub">{p.note}</div></> },
        { key: 'al', label: 'Trả cho', render: (p) => <span className="small">{(p.allocations || []).map((a) => a.doc_code).join(', ') || (p.party_type ? <span className="muted">trả trước</span> : '')}</span> },
        { key: 'a', label: 'Số tiền', align: 'right', render: (p) => <span className={p.direction === 'thu' ? 'good strong' : p.direction === 'chi' ? 'bad strong' : ''}>{p.direction === 'chi' ? '−' : p.direction === 'thu' ? '+' : ''}{money(p.cash_amount)}{p.fee > 0 && <div className="cell-sub">phí sàn {money(p.fee)}</div>}</span> },
      ]} />
    </ListPage>
  );
}

// ===================== CHI PHÍ =====================
// service: phiếu mua dịch vụ (bắt buộc nhà cung cấp, có số hóa đơn đầu vào, trả ngay được một phần)
export function ExpenseForm({ id, service, onClose }) {
  const { settings, can, rpc } = useApp();
  const suppliers = useSuppliers(); const funds = useFunds(can('thu_chi'));
  const { run, busy } = useAction();
  const tree = cats(settings);
  const [f, setF] = useState({ date: todayVN(), group: tree[0].group, category: tree[0].items[0], custom: '', description: '', amount: null, alloc_months: 1,
    supplier_id: '', note: '', payNow: !service, fund_id: '', method: 'Tiền mặt', invoice_no: '', pay_amount: null, split: [] });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  useEffect(() => { if (!f.fund_id && funds.data?.length) set('fund_id', funds.data[0].id); }, [funds.data]);
  useEffect(() => {
    if (id) rpc('q', { view: 'expenses', filters: [['id', 'eq', id]] }).then(([e]) => {
      const g = e.expense_group || groupOf(settings, e.category) || tree[0].group;
      const known = tree.find((x) => x.group === g)?.items.includes(e.category);
      setF((s) => ({ ...s, date: e.exp_date, group: g, category: known ? e.category : '__other', custom: known ? '' : e.category, description: e.description || '',
        amount: e.amount, alloc_months: e.alloc_months || 1, supplier_id: e.supplier_id || '', note: e.note || '', payNow: false, invoice_no: e.invoice_no || '', split: (e.split || []).map(({ book_id, pct }) => ({ book_id, pct })) }));
    });
  }, [id]);
  const items = tree.find((x) => x.group === f.group)?.items || [];
  const category = f.category === '__other' ? f.custom.trim() : f.category;
  const perMonth = f.amount && f.alloc_months > 1 ? Math.round(f.amount / f.alloc_months) : null;
  return (
    <Modal title={service ? (id ? 'Sửa phiếu mua dịch vụ' : 'Tạo phiếu mua dịch vụ') : id ? 'Sửa chi phí' : 'Ghi chi phí'} onClose={onClose} size="lg"
      subtitle={service ? 'Dịch vụ mua của nhà cung cấp (vận chuyển, gia công, sửa chữa…): tính vào chi phí vận hành, phần chưa trả ghi vào công nợ nhà cung cấp.'
        : 'Chi phí vận hành tính vào lợi nhuận theo ngày phát sinh. Tiền nhập hàng KHÔNG ghi ở đây (đã nằm trong giá vốn).'}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('save_expense', { id: id || null, service: !!service, date: f.date, expense_group: f.group, category, description: f.description, amount: f.amount,
          alloc_months: Number(f.alloc_months) || 1, supplier_id: f.supplier_id || null, invoice_no: f.invoice_no, note: f.note, split: f.split,
          pay_now: f.payNow && can('thu_chi') ? { fund_id: f.fund_id, method: f.method, amount: service && f.pay_amount != null ? f.pay_amount : null } : null },
        (x) => `Đã ghi ${service ? 'phiếu mua dịch vụ' : 'chi phí'} ${x.code} · ${x.expense_group}${x.split ? ` · chia ${x.split} thương hiệu` : ''}${x.payment_code ? ' · phiếu chi ' + x.payment_code : ''}`);
        if (r) onClose();
      }}>Lưu</Btn></>}>
      {service && <div className="grid">
        <Field label="Nhà cung cấp" required wide><Picker items={suppliers.data} value={f.supplier_id} onChange={(v) => set('supplier_id', v)} getLabel={(s) => s.name}
          getSub={(s) => [s.code, s.phone].filter(Boolean).join(' · ')} placeholder="Tìm nhà cung cấp dịch vụ" /></Field>
        <Field label="Số hóa đơn đầu vào"><Input value={f.invoice_no} onChange={(v) => set('invoice_no', v)} placeholder="vd. 0001234" /></Field>
      </div>}
      <div className="stack" style={{ gap: 6 }}>
        <div className="field-label">{service ? 'Loại chi' : 'Nhóm chi phí'}</div>
        <div className="row gap-s">{tree.map((g) => <button key={g.group} type="button" className={`chip${f.group === g.group ? ' on' : ''}`}
          onClick={() => setF((s) => ({ ...s, group: g.group, category: g.items[0] || '__other', custom: '' }))}>{g.group}</button>)}</div>
        {GROUP_HINT[f.group] && <div className="muted small">{GROUP_HINT[f.group]}</div>}
      </div>
      <div className="grid">
        <Field label="Khoản mục" required><Select value={f.category} onChange={(v) => set('category', v)} options={[...items.map((x) => ({ value: x, label: x })), { value: '__other', label: '+ Khoản khác (tự ghi)…' }]} /></Field>
        {f.category === '__other' && <Field label="Tên khoản mục"><Input value={f.custom} onChange={(v) => set('custom', v)} placeholder="vd. Phí đăng ký mã vạch" autoFocus /></Field>}
        <Field label="Số tiền" required><NumInput value={f.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Ngày phát sinh"><DateInput value={f.date} onChange={(v) => set('date', v)} max={todayVN()} /></Field>
        <Field label="Phân bổ vào lãi lỗ" hint={perMonth ? `≈ ${money(perMonth)} đ / tháng trong ${f.alloc_months} tháng` : 'Tính hết vào tháng phát sinh'}>
          <Select value={String(f.alloc_months)} onChange={(v) => set('alloc_months', Number(v))} options={[1, 2, 3, 6, 12, 18, 24, 36].map((n) => ({ value: String(n), label: n === 1 ? 'Không phân bổ (1 tháng)' : `Chia đều ${n} tháng` }))} /></Field>
        <Field label="Diễn giải" wide><Input value={f.description} onChange={(v) => set('description', v)} placeholder="vd. Tiền thuê showroom tháng 10 / Quảng cáo video bình hút lộc" /></Field>
        {!service && <Field label="Ghi nợ nhà cung cấp dịch vụ (nếu chưa trả)" wide><Select value={f.supplier_id} onChange={(v) => set('supplier_id', v)} placeholder="(không)" options={(suppliers.data || []).map((s) => ({ value: s.id, label: s.name }))} /></Field>}
      </div>
      <BrandSplit value={f.split} onChange={(v) => set('split', v)} amount={f.amount} />
      {f.alloc_months > 1 && <Note>Tiền vẫn trả 1 lần {f.amount ? money(f.amount) + ' đ' : ''} (quỹ giảm ngay); chỉ phần tính vào lãi lỗ được chia đều {f.alloc_months} tháng, từ tháng {f.date.slice(5, 7)}/{f.date.slice(0, 4)}.</Note>}
      {!id && can('thu_chi') && <div className="row gap"><Check checked={f.payNow} onChange={(v) => set('payNow', v)}>{service ? 'Trả ngay' : 'Đã trả ngay'}</Check>
        {f.payNow && <Select value={f.fund_id} onChange={(v) => set('fund_id', v)} options={(funds.data || []).map((x) => ({ value: x.id, label: `${x.name} (${money(x.balance)})` }))} style={{ maxWidth: 260 }} />}
        {f.payNow && service && <NumInput value={f.pay_amount ?? f.amount} onChange={(v) => set('pay_amount', v)} placeholder="Số tiền trả" style={{ maxWidth: 180 }} aria-label="Số tiền trả ngay" />}</div>}
      {!f.payNow && <div className="muted small">Chưa trả: chi phí vẫn tính vào lợi nhuận đúng kỳ; khi trả tiền, lập phiếu chi gắn vào khoản này (không bị tính 2 lần).</div>}
    </Modal>
  );
}

// Mua dịch vụ: các khoản chi phí có nhà cung cấp (người nhận), theo dõi cần trả / đã trả / còn phải trả
export function ServicePurchasesPage() {
  const { open, can } = useApp();
  const time = useTimeFilter('month');
  const [st, setSt] = useState(''); const [search, setSearch] = useState('');
  const q = useQ('expenses', [['supplier_id', 'not_null'], ...dateFilters('exp_date', time)], 'exp_date desc', 20000);
  const live = (q.data || []).filter((e) => !e.voided);
  const rows = (q.data || []).filter((e) => (!st ? !e.voided : (st === 'no' ? !e.voided && e.unpaid > 0 : st === 'du' ? !e.voided && e.unpaid <= 0 : e.voided))
    && match(`${e.code} ${e.category} ${e.description || ''} ${e.supplier_name || ''} ${e.invoice_no || ''}`, search));
  const sum = (k) => rows.filter((e) => !e.voided).reduce((s, e) => s + (e[k] || 0), 0);
  return (
    <ListPage title="Mua dịch vụ"
      filters={<>
        <TimeFilter filter={time} />
        <FilterBox title="Trạng thái"><RadioList value={st} onChange={setSt} options={[{ value: '', label: 'Tất cả', count: live.length },
          { value: 'no', label: 'Còn phải trả', count: live.filter((e) => e.unpaid > 0).length }, { value: 'du', label: 'Đã trả đủ', count: live.filter((e) => e.unpaid <= 0).length },
          { value: 'huy', label: 'Đã hủy', count: (q.data || []).filter((e) => e.voided).length }]} /></FilterBox>
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã phiếu, nhà cung cấp, số hóa đơn…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('mua-dich-vu.xlsx', [{ name: 'Mua dịch vụ', rows, columns: [{ key: 'code', label: 'Mã phiếu' }, { key: 'exp_date', label: 'Ngày', type: 'date' },
          { key: 'category', label: 'Loại chi' }, { key: 'supplier_name', label: 'Người nhận' }, { key: 'invoice_no', label: 'Số hóa đơn' }, { key: 'description', label: 'Diễn giải' },
          { key: 'amount', label: 'Cần thanh toán' }, { key: 'paid', label: 'Đã thanh toán' }, { key: 'unpaid', label: 'Còn phải trả' }] }])}>Xuất Excel</Btn>
        {can('chi_phi') && <Btn kind="primary" icon="plus" onClick={() => open('expense', { service: true })}>Tạo phiếu mua</Btn>}
      </>}>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} foot={{ a: money(sum('amount')), p: money(sum('paid')), u: money(sum('unpaid')) }}
        empty="Chưa có phiếu mua dịch vụ trong kỳ" columns={[
          { key: 'c', label: 'Mã phiếu', render: (e) => <><div className="cell-main">{e.code}</div><div className="cell-sub">{dmy(e.exp_date)}</div></> },
          { key: 'g', label: 'Loại chi', render: (e) => <><div className="cell-main">{e.category}</div><div className="cell-sub">{e.description}</div></> },
          { key: 'n', label: 'Người nhận', render: (e) => <><div className="cell-main">{e.supplier_name}</div>{e.invoice_no && <div className="cell-sub">HĐ {e.invoice_no}</div>}</> },
          { key: 'a', label: 'Cần thanh toán', align: 'right', render: (e) => money(e.amount) },
          { key: 'p', label: 'Đã thanh toán', align: 'right', render: (e) => money(e.paid) },
          { key: 'u', label: 'Còn phải trả', align: 'right', render: (e) => (e.voided ? <Pill tone="mute">Đã hủy</Pill> : e.unpaid > 0 ? <b className="warn">{money(e.unpaid)}</b> : <Pill tone="good">Đã trả</Pill>) },
          { key: 'x', label: '', render: (e) => !e.voided && <div className="row gap-s" onClick={(ev) => ev.stopPropagation()}>
            {e.unpaid > 0 && can('thu_chi') && <Btn small onClick={() => open('payment', { kind: 'tra_ncc', party_id: e.supplier_id, alloc: { doc_type: 'chi_phi', doc_id: e.id, code: e.code, amount: e.unpaid } })}>Trả</Btn>}
            {e.paid === 0 && can('chi_phi') && <Btn small onClick={() => open('expense', { id: e.id, service: true })}>Sửa</Btn>}
          </div> },
        ]} />
    </ListPage>
  );
}

export function ExpensesPage(nav) {
  const { open, can, settings } = useApp();
  const [tab, setTab] = usePageTab(nav, 'list', ['list', 'dinh-ky']);
  const time = useTimeFilter('month');
  const [grp, setGrp] = useState(''); const [search, setSearch] = useState('');
  const q = useQ('expenses', dateFilters('exp_date', time), 'exp_date desc', 20000);
  const { run, busy } = useAction();
  const tree = cats(settings);
  const live = (q.data || []).filter((e) => !e.voided);
  const byGrp = {}; for (const e of live) { const g = e.expense_group || 'Quản lý & khác'; byGrp[g] = (byGrp[g] || 0) + e.pl_amount; }
  const order = [...tree.map((g) => g.group), ...Object.keys(byGrp).filter((g) => !tree.some((t) => t.group === g))];
  const rows = live.filter((e) => (!grp || (e.expense_group || 'Quản lý & khác') === grp) && match(`${e.code} ${e.category} ${e.description || ''} ${e.supplier_name || ''}`, search));
  const total = rows.reduce((s, e) => s + e.amount, 0);
  const all = live.reduce((s, e) => s + e.pl_amount, 0);
  return (
    <ListPage title="Chi phí vận hành"
      filters={tab === 'list' ? <TimeFilter filter={time} /> : <div className="muted small">Các khoản chi lặp lại hằng tháng: thuê nhà, phần mềm AI, internet, lương… Kéo thẻ trên lịch để đổi ngày ghi.</div>}
      search={tab === 'list' ? <Search value={search} onChange={setSearch} placeholder="Tìm khoản mục, diễn giải…" /> : <span className="grow" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('chi-phi.xlsx', [{ name: 'Chi phí', rows, columns: [{ key: 'code', label: 'Mã' }, { key: 'exp_date', label: 'Ngày', type: 'date' }, { key: 'expense_group', label: 'Nhóm' },
          { key: 'category', label: 'Khoản mục' }, { key: 'description', label: 'Diễn giải' }, { key: 'amount', label: 'Số tiền' }, { key: 'alloc_months', label: 'Phân bổ (tháng)' },
          { key: 'paid', label: 'Đã trả' }, { key: 'unpaid', label: 'Chưa trả' }, { key: 'supplier_name', label: 'Nợ NCC' }] }])}>Xuất Excel</Btn>
        {can('chi_phi') && (tab === 'list' ? <Btn kind="primary" icon="plus" onClick={() => open('expense', {})}>Ghi chi phí</Btn>
          : <Btn kind="primary" icon="plus" onClick={() => open('recurring', {})}>Khoản định kỳ mới</Btn>)}
      </>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'list', label: 'Khoản chi' }, { value: 'dinh-ky', label: 'Định kỳ hằng tháng' }]} />
      {tab === 'dinh-ky' ? <RecurringPanel /> : <>
      <div className="exp-groups">
        <button className={`exp-card${!grp ? ' on' : ''}`} onClick={() => setGrp('')}><span>Tất cả</span><b>{short(all)}</b><i style={{ width: '100%' }} /></button>
        {order.map((g, idx) => (
          <button key={g} className={`exp-card${grp === g ? ' on' : ''}`} onClick={() => setGrp(grp === g ? '' : g)}>
            <span>{g}</span><b>{byGrp[g] ? short(byGrp[g]) : '—'}</b>
            <i style={{ width: `${all ? Math.max(2, ((byGrp[g] || 0) / all) * 100) : 0}%`, background: GROUP_COLORS[idx % GROUP_COLORS.length] }} />
          </button>))}
      </div>
      <div className="muted small">Số trên thẻ là tiền các khoản ghi trong kỳ (theo ngày phát sinh); khoản chia cho nhiều thương hiệu chỉ tính phần của sổ này. Số tính vào lãi lỗ từng tháng (đã chia phân bổ) xem ở Báo cáo → Chi phí.</div>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? rows : null} foot={{ a: money(total) }} empty="Chưa có chi phí trong kỳ" columns={[
        { key: 'c', label: 'Mã', render: (e) => <><div className="cell-main">{e.code}</div><div className="cell-sub">{dmy(e.exp_date)}</div></> },
        { key: 'g', label: 'Nhóm · khoản mục', render: (e) => <><div className="cell-main">{e.category}</div><div className="cell-sub">{e.expense_group}</div></> },
        { key: 'd', label: 'Diễn giải', render: (e) => <>{e.description}{e.alloc_months > 1 && <div><Pill tone="info">Phân bổ {e.alloc_months} tháng · đến {e.alloc_end ? `${e.alloc_end.slice(5, 7)}/${e.alloc_end.slice(0, 4)}` : ''}</Pill></div>}
          {(e.split?.length > 0 || e.recur_id) && <div className="row gap-s">{e.recur_id && <Pill tone="info">Định kỳ</Pill>}
            {e.split?.length > 0 && <><Pill tone="info">Chia {e.split.length} thương hiệu</Pill><SplitMini split={e.split} /></>}</div>}
          {e.split_of && <div className="cell-sub">Phần chia từ {e.split_of_book_name || e.split_of_book} · {e.split_of_code}</div>}
          {e.settled_payment_code && <div className="cell-sub">trừ vào phiếu thu {e.settled_payment_code}</div>}{e.supplier_name && <div className="cell-sub">nợ {e.supplier_name}</div>}</> },
        { key: 's', label: 'Trạng thái', render: (e) => (e.split_of ? <Pill tone="info">{e.split_of_book} trả tiền</Pill> : e.unpaid > 0 ? <Pill tone="warn">Chưa trả {money(e.unpaid)}</Pill> : <Pill tone="good">Đã trả</Pill>) },
        { key: 'a', label: 'Số tiền', align: 'right', render: (e) => <>{money(e.amount)}{e.pl_amount !== e.amount && <div className="cell-sub">sổ này chịu {money(e.pl_amount)}</div>}{e.alloc_months > 1 && <div className="cell-sub">≈ {money(Math.round(e.amount / e.alloc_months))}/tháng</div>}</> },
        { key: 'x', label: '', render: (e) => !e.voided && <div className="row gap-s" onClick={(ev) => ev.stopPropagation()}>
          {e.unpaid > 0 && can('thu_chi') && <Btn small onClick={() => open('payment', { kind: e.supplier_id ? 'tra_ncc' : 'chi_phi', party_id: e.supplier_id, alloc: { doc_type: 'chi_phi', doc_id: e.id, code: e.code, amount: e.unpaid } })}>Trả</Btn>}
          {e.paid === 0 && !e.settled_payment_id && can('chi_phi') && <Btn small onClick={() => open('expense', { id: e.id })}>Sửa</Btn>}
          {can('owner') && e.paid === 0 && !e.settled_payment_id && <ConfirmBtn small busy={busy} confirmText="Hủy khoản này?" onConfirm={() => run('void_expense', { id: e.id }, 'Đã hủy chi phí')}>Hủy</ConfirmBtn>}
        </div> },
      ]} />
      </>}
    </ListPage>
  );
}
