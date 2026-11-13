// Hộp thoại chi tiết của các thiết lập kiểu KiotViet: phân quyền nhóm hàng, khóa thời gian giao dịch, giới hạn trả hàng,
// thông tin bắt buộc của khách, tích điểm, hóa đơn điện tử, tiền tệ, xóa dữ liệu cũ.
import React, { useEffect, useState } from 'react';
import { useApp, useRpcData } from '../lib/store.jsx';
import { money, dmy, dmyhm, todayVN } from '../lib/format.js';
import { Btn, Field, Input, Select, NumInput, DateInput, Check, Note, Table, Loading, ErrorBox, Pill } from '../components/ui.jsx';
import { EditModal, useSaveSettings } from './SettingsShell.jsx';

export const TXN_KINDS = { ban_hang: 'Đơn bán, giao hàng', tra_hang: 'Khách trả hàng', nhap_hang: 'Nhập hàng', tra_ncc: 'Trả hàng nhập', thu_chi: 'Phiếu thu, chi', kho: 'Điều chỉnh kho, xuất hủy, sản xuất' };
export const CUSTOMER_FIELDS = { phone: 'Điện thoại', address: 'Địa chỉ', contact: 'Người liên hệ', kind: 'Nhóm khách', email: 'Email', birthday: 'Ngày sinh',
  gender: 'Giới tính', tax_code: 'Mã số thuế', tax_name: 'Tên đơn vị xuất hóa đơn', tax_address: 'Địa chỉ xuất hóa đơn' };

function Checks({ map, value, onChange }) {
  return <div className="stack-s">{Object.entries(map).map(([k, l]) => <Check key={k} checked={value.includes(k)} onChange={(v) => onChange(v ? [...value, k] : value.filter((x) => x !== k))}>{l}</Check>)}</div>;
}

export function CategoryPermModal({ onClose }) {
  const { rpc, toast, settings } = useApp();
  const staff = useRpcData('book_staff', {});
  const prods = useRpcData('q', { view: 'products', limit: 5000 });
  const cats = [...new Set([...(settings.categories || []), ...((prods.data || []).map((p) => p.category).filter(Boolean))])].sort();
  const [edit, setEdit] = useState({}); const [busy, setBusy] = useState('');
  const list = (staff.data || []).filter((m) => m.role === 'staff');
  const save = async (m) => {
    setBusy(m.user_id);
    try { await rpc('save_member_categories', { user_id: m.user_id, categories: edit[m.user_id] ?? m.categories }); toast(`Đã lưu nhóm hàng của ${m.name}`); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  return (
    <EditModal title="Phân quyền theo nhóm hàng" size="lg" onClose={onClose}>
      <div className="muted small">Nhân viên chỉ thấy, bán và nhập các hàng thuộc nhóm được chọn. Không chọn nhóm nào = được xem mọi nhóm. Quản lý sổ luôn thấy tất cả.</div>
      {staff.error && <ErrorBox error={staff.error} />}
      {!staff.data ? <Loading /> : list.length === 0 ? <Note>Sổ chưa có nhân viên.</Note> : list.map((m) => {
        const v = edit[m.user_id] ?? m.categories;
        return (
          <div key={m.user_id} className="cat-group">
            <div className="row gap"><b className="grow">{m.name}</b><span className="muted small">{v.length ? `${v.length} nhóm` : 'Mọi nhóm'}</span>
              <Btn small kind="primary" busy={busy === m.user_id} onClick={() => save(m)}>Lưu</Btn></div>
            <div className="taglist">{cats.map((c) => <Check key={c} checked={v.includes(c)} onChange={(on) => setEdit((s) => ({ ...s, [m.user_id]: on ? [...v, c] : v.filter((x) => x !== c) }))}>{c}</Check>)}</div>
          </div>
        );
      })}
    </EditModal>
  );
}

export function TxnLockModal({ onClose }) {
  const { settings } = useApp(); const { save, busy } = useSaveSettings();
  const [v, setV] = useState(settings.lock_txn_kinds || Object.keys(TXN_KINDS));
  return (
    <EditModal title="Không cho phép thay đổi thời gian giao dịch" onClose={onClose} busy={busy} onSave={async () => { if (await save({ lock_txn_time: true, lock_txn_kinds: v })) onClose(); }}>
      <div className="muted small">Loại giao dịch được chọn chỉ ghi được với ngày hôm nay, và khi sửa không đổi được ngày.</div>
      <Checks map={TXN_KINDS} value={v} onChange={setV} />
    </EditModal>
  );
}

export function RequiredFieldsModal({ onClose }) {
  const { settings } = useApp(); const { save, busy } = useSaveSettings();
  const [v, setV] = useState(settings.customer_required || ['phone']);
  return (
    <EditModal title="Thông tin bắt buộc của khách hàng" onClose={onClose} busy={busy} onSave={async () => { if (await save({ customer_required_on: true, customer_required: v })) onClose(); }}>
      <div className="muted small">Tên khách luôn bắt buộc. Thêm hoặc sửa khách thiếu các thông tin dưới đây sẽ không lưu được (nhập từ Excel không áp dụng).</div>
      <Checks map={CUSTOMER_FIELDS} value={v} onChange={setV} />
    </EditModal>
  );
}

export function PointsModal({ onClose }) {
  const { settings } = useApp(); const { save, busy } = useSaveSettings();
  const p0 = settings.points || {};
  const [f, setF] = useState({ earn_amount: p0.earn_amount ?? 100000, redeem: p0.redeem !== false, redeem_value: p0.redeem_value ?? 1000, min_redeem: p0.min_redeem ?? 0 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <EditModal title="Tích điểm" onClose={onClose} busy={busy} onSave={async () => { if (await save({ points_on: true, points: f })) onClose(); }}>
      <Field label="Tích 1 điểm cho mỗi" hint="Tính trên tiền hàng của từng đợt giao; khách trả hàng bị trừ điểm tương ứng. Khách lẻ không tích điểm."><NumInput min={1} value={f.earn_amount} onChange={(v) => set('earn_amount', v)} suffix="đ" /></Field>
      <Check checked={f.redeem} onChange={(v) => set('redeem', v)}>Cho phép đổi điểm để thanh toán đơn hàng</Check>
      {f.redeem && <div className="grid">
        <Field label="1 điểm đổi được"><NumInput min={0} value={f.redeem_value} onChange={(v) => set('redeem_value', v)} suffix="đ" /></Field>
        <Field label="Đổi tối thiểu"><NumInput money={false} min={0} value={f.min_redeem} onChange={(v) => set('min_redeem', v)} suffix="điểm" /></Field>
      </div>}
      <Note>Ví dụ: đơn {money(1000000)} đ được {Math.floor(1000000 / (Number(f.earn_amount) || 1))} điểm{f.redeem ? `, đổi 100 điểm được giảm ${money(100 * (Number(f.redeem_value) || 0))} đ` : ''}.</Note>
    </EditModal>
  );
}

const PROVIDERS = [{ value: '', label: 'Chưa chọn' }, { value: 'viettel', label: 'Viettel S-Invoice' }, { value: 'misa', label: 'MISA meInvoice' }, { value: 'vnpt', label: 'VNPT Invoice' }, { value: 'khac', label: 'Nhà cung cấp khác' }];
export function EinvoiceModal({ onClose }) {
  const { settings, book } = useApp(); const { save, busy } = useSaveSettings();
  const e0 = settings.einvoice || {};
  const [f, setF] = useState({ provider: e0.provider || '', seller_name: e0.seller_name || book.name, tax_code: e0.tax_code || '', address: e0.address || settings.shop_address || '',
    template: e0.template || '1', symbol: e0.symbol || '', email: e0.email || '' });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <EditModal title="Hóa đơn điện tử" size="md" onClose={onClose} busy={busy} onSave={async () => { if (await save({ einvoice: f })) onClose(); }}>
      <div className="grid">
        <Field label="Nhà cung cấp hóa đơn điện tử"><Select value={f.provider} onChange={(v) => set('provider', v)} options={PROVIDERS} /></Field>
        <Field label="Tên người bán" wide><Input value={f.seller_name} onChange={(v) => set('seller_name', v)} /></Field>
        <Field label="Mã số thuế"><Input value={f.tax_code} onChange={(v) => set('tax_code', v)} /></Field>
        <Field label="Email nhận thông báo"><Input value={f.email} onChange={(v) => set('email', v)} /></Field>
        <Field label="Địa chỉ" wide><Input value={f.address} onChange={(v) => set('address', v)} /></Field>
        <Field label="Mẫu số" hint="vd. 1 (hóa đơn GTGT), 2 (hóa đơn bán hàng)"><Input value={f.template} onChange={(v) => set('template', v)} /></Field>
        <Field label="Ký hiệu" hint="vd. C26TAA"><Input value={f.symbol} onChange={(v) => set('symbol', v)} /></Field>
      </div>
      <Note tone="warn">Chưa kết nối trực tiếp với nhà cung cấp: phát hành hóa đơn trên trang của nhà cung cấp, rồi ghi số hóa đơn vào đơn ở <b>Thuế &amp; Kế toán → Hóa đơn đầu ra</b>. Khi có tài khoản API của nhà cung cấp, phần mềm sẽ phát hành thẳng từ đơn.</Note>
    </EditModal>
  );
}

export function CurrencyModal({ onClose }) {
  const { settings, rpc, toast, loadBooks } = useApp();
  const [list, setList] = useState(() => (settings.currencies || []).map((c) => ({ ...c })));
  const [dec, setDec] = useState(settings.price_decimals ?? 0); const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setList((a) => a.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const save = async () => {
    setBusy(true);
    try { await rpc('save_currency_rates', { currencies: list, price_decimals: Number(dec) }); await loadBooks(); toast('Đã lưu tiền tệ'); onClose(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const hist = [...(settings.fx_history || [])].reverse().slice(0, 30);
  return (
    <EditModal title="Quản lý tiền tệ" size="md" onClose={onClose} busy={busy} onSave={save}>
      <Field label="Tiền mặc định"><Input value="VND – Việt Nam đồng" onChange={() => {}} disabled /></Field>
      <div className="field-label">Ngoại tệ &amp; tỷ giá (số đồng cho 1 đơn vị)</div>
      {list.map((c, i) => (
        <div key={i} className="row gap-s">
          <div style={{ width: 90 }}><Input value={c.code} onChange={(v) => set(i, 'code', v.toUpperCase())} placeholder="USD" aria-label="Mã ngoại tệ" /></div>
          <div className="grow"><Input value={c.name} onChange={(v) => set(i, 'name', v)} placeholder="Đô la Mỹ" aria-label="Tên ngoại tệ" /></div>
          <div style={{ width: 150 }}><NumInput min={0} value={c.rate} onChange={(v) => set(i, 'rate', v)} suffix="đ" aria-label="Tỷ giá" /></div>
          <button type="button" className="icon-btn" aria-label="Bỏ ngoại tệ" onClick={() => setList((a) => a.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div><Btn small icon="plus" onClick={() => setList((a) => [...a, { code: '', name: '', rate: null }])}>Thêm ngoại tệ</Btn></div>
      <Field label="Định dạng giá bán, giá vốn" hint="Số chữ số thập phân tối đa khi hiển thị giá (chỉ áp dụng cho tiền mặc định)">
        <Select value={String(dec)} onChange={(v) => setDec(Number(v))} options={[{ value: '0', label: 'Không có số lẻ (5.000)' }, { value: '1', label: '1 số lẻ (5.000,1)' }, { value: '2', label: '2 số lẻ (5.000,12)' }]} />
      </Field>
      {hist.length > 0 && <details><summary className="small muted">Lịch sử đổi tỷ giá</summary>
        <Table dense rows={hist.map((h, i) => ({ ...h, id: i }))} columns={[{ key: 'a', label: 'Thời gian', render: (h) => dmyhm(h.at) }, { key: 'c', label: 'Tiền tệ', render: (h) => h.code }, { key: 'r', label: 'Tỷ giá', align: 'right', render: (h) => money(h.rate) }]} /></details>}
    </EditModal>
  );
}

const PURGE_STATUS = { cho: ['Chờ chạy', 'warn'], xong: ['Đã xóa', 'good'], loi: ['Lỗi', 'bad'], huy: ['Đã hủy', 'mute'] };
export function PurgeSection() {
  const { settings, rpc, toast, refresh } = useApp();
  const jobs = useRpcData('purge_jobs', {});
  const [cut, setCut] = useState(settings.lock_date || ''); const [pv, setPv] = useState(null); const [err, setErr] = useState('');
  const [when, setWhen] = useState('tonight'); const [ok, setOk] = useState(false); const [busy, setBusy] = useState('');
  useEffect(() => { setPv(null); setOk(false); setErr(''); }, [cut]);
  const preview = async () => { setBusy('pv'); setErr(''); try { setPv(await rpc('purge_preview', { cutoff: cut })); } catch (e) { setErr(e.message); } finally { setBusy(''); } };
  const go = async () => {
    setBusy('go');
    try {
      const r = await rpc('schedule_purge', { cutoff: cut, when, confirm: true });
      toast(r.scheduled ? 'Đã đặt lịch xóa lúc 23 giờ tối nay' : 'Đã xóa dữ liệu cũ'); setPv(null); setOk(false); refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <div className="stack">
      <div className="muted small">Xóa đơn, phiếu thu chi, phiếu kho đã khép lại đến hết ngày chọn để sổ gọn hơn. Công nợ từng khách / NCC chuyển thành nợ đầu kỳ, tồn kho thành tồn đầu kỳ, số dư quỹ và điểm tích lũy giữ nguyên. Chỉ xóa được dữ liệu đã khóa sổ. Máy chủ tự sao lưu trước khi xóa.</div>
      <div className="row gap" style={{ alignItems: 'flex-end' }}>
        <Field label="Xóa dữ liệu đến hết ngày" hint={settings.lock_date ? `Sổ đã khóa đến ${dmy(settings.lock_date)}` : 'Hãy khóa sổ trước'}><DateInput value={cut} onChange={setCut} max={settings.lock_date || undefined} /></Field>
        <Btn icon="search" busy={busy === 'pv'} disabled={!cut} onClick={preview}>Xem những gì sẽ xóa</Btn>
      </div>
      <ErrorBox error={err} />
      {pv && <>
        <Table dense rowKey="key" rows={pv.items} columns={[{ key: 'l', label: 'Loại dữ liệu', render: (x) => x.label }, { key: 'n', label: 'Số lượng sẽ xóa', align: 'right', render: (x) => <b>{money(x.count)}</b> }]} />
        <div className="row gap">
          <Check checked={when === 'tonight'} onChange={() => setWhen('tonight')}>Xóa lúc 23 giờ tối nay</Check>
          <Check checked={when === 'now'} onChange={() => setWhen('now')}>Xóa ngay</Check>
        </div>
        <Note tone="warn">Dữ liệu đã xóa không khôi phục được trong phần mềm (chỉ khôi phục được từ bản sao lưu của máy chủ).</Note>
        <Check checked={ok} onChange={setOk}>Tôi hiểu, xóa dữ liệu đến hết ngày {dmy(pv.cutoff)}.</Check>
        <div><Btn kind="danger" busy={busy === 'go'} disabled={!ok} onClick={go}>{when === 'now' ? 'Xóa ngay' : 'Đặt lịch xóa'}</Btn></div>
      </>}
      {(jobs.data || []).length > 0 && (
        <Table dense rows={jobs.data} columns={[
          { key: 'a', label: 'Đặt lúc', render: (j) => dmyhm(j.created_at) }, { key: 'c', label: 'Đến hết ngày', render: (j) => dmy(j.cutoff) },
          { key: 's', label: 'Trạng thái', render: (j) => { const [l, t] = PURGE_STATUS[j.status] || [j.status, 'neutral']; return <Pill tone={t}>{l}</Pill>; } },
          { key: 'r', label: 'Kết quả', render: (j) => <span className="small muted">{j.result?.error || (j.result ? `${j.result.orders} đơn bán, ${j.result.pos} đơn nhập, ${j.result.pays} phiếu thu chi` : '')}</span> },
          { key: 'x', label: '', render: (j) => j.status === 'cho' && <Btn small onClick={async () => { try { await rpc('cancel_purge', { id: j.id }); refresh(); } catch (e) { toast(e.message, 'err'); } }}>Hủy lịch</Btn> },
        ]} />
      )}
    </div>
  );
}
