import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, dmyhm, todayVN, match, norm, short } from '../lib/format.js';
import { useFunds } from '../lib/lookups.js';
import { exportXlsx, readWorkbook } from '../lib/excel.js';
import { CARRIERS, carrier, lastCarrier, rememberCarrier } from '../lib/carriers.js';
import { Btn, Icon, Pill, Field, Input, Select, DateInput, NumInput, Check, Tabs, Search, Loading, ErrorBox, Note, Table, Modal, KV, Section, ListPage, FilterBox, RadioList } from '../components/ui.jsx';

// Trạng thái vận đơn (giống app Shopee Express / BEST)
export const SHIP_STATUS = {
  cho_lay_hang: ['Chờ lấy hàng', 'neutral'], da_lay_hang: ['Đã lấy hàng', 'info'], dang_trung_chuyen: ['Đang trung chuyển', 'info'],
  dang_giao: ['Đang giao hàng', 'accent'], giao_thanh_cong: ['Giao thành công', 'good'], giao_that_bai: ['Giao thất bại – chờ giao lại', 'warn'],
  dang_hoan: ['Đang hoàn về shop', 'bad'], da_hoan: ['Đã hoàn về shop', 'bad'], da_huy: ['Đã hủy vận đơn', 'mute'], su_co: ['Sự cố (thất lạc / hư hỏng)', 'bad'],
};
export const COD_STATUS = { khong_cod: ['Không thu hộ', 'neutral'], chua_thu: ['Chưa thu', 'neutral'], spx_dang_giu: ['ĐVVC đang giữ tiền', 'warn'], da_ve_tk: ['Đã về tài khoản', 'good'], khong_thu_duoc: ['Không thu được', 'bad'] };
const SP = ({ s }) => { const [t, tone] = SHIP_STATUS[s] || [s, 'neutral']; return <Pill tone={tone}>{t}</Pill>; };
const CP = ({ s }) => { const [t, tone] = COD_STATUS[s] || [s, 'neutral']; return <Pill tone={tone}>{t}</Pill>; };
export const CarrierPill = ({ c }) => <Pill tone={c === 'BEST' ? 'warn' : c === 'SPX' ? 'accent' : 'neutral'}>{carrier(c).short}</Pill>;

// Đọc chữ trạng thái trong file của hãng → mã trạng thái (thứ tự kiểm tra quan trọng)
const RULES = [
  ['da_hoan', ['da hoan', 'hoan hang thanh cong', 'hoan thanh cong', 'da tra hang ve', 'returned']],
  ['dang_hoan', ['dang hoan', 'cho hoan', 'chuyen hoan', 'hoan hang', 'return']],
  ['giao_that_bai', ['khong thanh cong', 'giao khong thanh cong', 'giao that bai', 'giao hang that bai', 'khong giao duoc', 'failed', 'cho giao lai']],
  ['da_lay_hang', ['da giao cho don vi', 'da giao cho dvvc', 'da lay hang', 'lay hang thanh cong', 'picked']],
  ['giao_thanh_cong', ['giao thanh cong', 'giao hang thanh cong', 'da giao', 'delivered']],
  ['dang_giao', ['dang giao', 'out for delivery', 'dang phat']],
  ['cho_lay_hang', ['cho lay hang', 'cho lay', 'chua lay', 'cho shipper', 'da tao don', 'pending']],
  ['su_co', ['that lac', 'hu hong', 'su co', 'lost', 'damaged']],
  ['da_huy', ['huy', 'cancel']],
  ['dang_trung_chuyen', ['trung chuyen', 'van chuyen', 'dang chuyen', 'roi kho', 'den kho', 'nhap kho', 'xuat kho', 'transit', 'buu cuc']],
];
export function mapSpxStatus(text) {
  const t = norm(text);
  if (!t) return null;
  if (/^666\b/.test(t)) return 'giao_thanh_cong';   // mã BEST: 666 - Giao hàng thành công
  if (SHIP_STATUS[t]) return t;
  for (const [code, keys] of RULES) if (keys.some((k) => t.includes(k))) return code;
  return null;
}

const TABS = [
  { value: 'running', label: 'Đang chạy', f: (s) => !['giao_thanh_cong', 'da_hoan', 'da_huy'].includes(s.status) },
  { value: 'cho_lay_hang', label: 'Chờ lấy hàng', f: (s) => s.status === 'cho_lay_hang' },
  { value: 'dang_giao', label: 'Đang giao', f: (s) => ['da_lay_hang', 'dang_trung_chuyen', 'dang_giao'].includes(s.status) },
  { value: 'problem', label: 'Có vấn đề', f: (s) => ['giao_that_bai', 'dang_hoan', 'su_co'].includes(s.status) },
  { value: 'giao_thanh_cong', label: 'Giao thành công', f: (s) => s.status === 'giao_thanh_cong' },
  { value: 'cod', label: 'COD chờ hãng chuyển', f: (s) => s.cod_status === 'spx_dang_giu' },
  { value: 'hoan', label: 'Hoàn / hủy', f: (s) => ['da_hoan', 'da_huy'].includes(s.status) },
  { value: 'all', label: 'Tất cả', f: () => true },
];

export function ShippingPage() {
  const { open, can } = useApp();
  const q = useQ('shipments', [], 'status_at desc', 3000);
  const [tab, setTab] = useState('running'); const [search, setSearch] = useState(''); const [cr, setCr] = useState('');
  const rows = (q.data || []).filter((s) => !cr || s.carrier === cr);
  const t = TABS.find((x) => x.value === tab);
  const list = useMemo(() => rows.filter(t.f).filter((s) => match(`${s.tracking_no} ${s.code} ${s.order_code} ${s.customer_name || ''} ${s.receiver_phone || ''}`, search)), [rows, tab, search]);
  const codHeld = rows.filter((s) => s.cod_status === 'spx_dang_giu');
  const sum = (a, k) => a.reduce((x, s) => x + Number(s[k] || 0), 0);
  return (
    <ListPage title="Vận chuyển" sub="Theo dõi vận đơn Shopee Express và BEST Express theo đúng các trạng thái trên app của hãng. Tiền thu hộ (COD) hãng giữ đến khi đối soát về tài khoản."
      filters={<>
        <FilterBox title="Trạng thái"><RadioList value={tab} onChange={setTab} options={TABS.map((x) => ({ value: x.value, label: x.label, count: rows.filter(x.f).length }))} /></FilterBox>
        <FilterBox title="Đơn vị vận chuyển"><RadioList value={cr} onChange={setCr} options={[{ value: '', label: 'Tất cả hãng' }, ...CARRIERS.map((c) => ({ value: c.code, label: c.name }))]} /></FilterBox>
      </>}
      search={<Search value={search} onChange={setSearch} placeholder="Tìm mã vận đơn, mã đơn, khách, SĐT…" />}
      actions={<>
        <Btn icon="dl" onClick={() => exportXlsx('van-don.xlsx', [{ name: 'Vận đơn', rows: list, columns: [
          { key: 'carrier_name', label: 'Đơn vị vận chuyển' }, { key: 'tracking_no', label: 'Mã vận đơn' }, { key: 'order_code', label: 'Đơn' }, { key: 'customer_name', label: 'Khách' }, { key: 'receiver_phone', label: 'SĐT nhận' },
          { key: 'status_label', label: 'Trạng thái' }, { key: 'status_at', label: 'Cập nhật', get: (s) => dmyhm(s.status_at) }, { key: 'cod_amount', label: 'COD' },
          { key: 'cod_status_label', label: 'Tiền COD' }, { key: 'ship_fee', label: 'Cước' }] }])}>Xuất Excel</Btn>
        {can('ban_hang') && <Btn icon="up" onClick={() => open('ship-import', {})}>Cập nhật từ file Excel</Btn>}
        {can('thu_chi') && <Btn kind="primary" icon="cash" onClick={() => open('cod-settle', {})}>Đối soát COD</Btn>}
      </>}>
      <div className="kpis kpis-4">
        <button className="kpi" onClick={() => setTab('running')}><span className="kpi-label">Đang chạy</span><span className="kpi-value">{rows.filter(TABS[0].f).length}</span></button>
        <button className={`kpi ${rows.filter(TABS[3].f).length ? 'alertk' : ''}`} onClick={() => setTab('problem')}><span className="kpi-label">Có vấn đề</span><span className="kpi-value">{rows.filter(TABS[3].f).length}</span><span className="kpi-sub">giao thất bại, đang hoàn, sự cố</span></button>
        <button className="kpi key" onClick={() => setTab('cod')}><span className="kpi-label">COD {cr ? carrier(cr).short : 'hãng'} đang giữ</span><span className="kpi-value">{short(sum(codHeld, 'cod_amount'))}</span><span className="kpi-sub">{codHeld.length} vận đơn chờ đối soát</span></button>
        <button className="kpi" onClick={() => setTab('giao_thanh_cong')}><span className="kpi-label">Giao thành công</span><span className="kpi-value">{rows.filter((s) => s.status === 'giao_thanh_cong').length}</span></button>
      </div>
      <ErrorBox error={q.error} />
      <Table rows={q.data ? list : null} onRow={(s) => open('ship', { id: s.id })} rowClass={(s) => (['giao_that_bai', 'dang_hoan', 'su_co'].includes(s.status) ? 'row-late' : '')}
        empty={<span>Chưa có vận đơn. Mở một đơn bán → <b>Tạo vận đơn</b>, hoặc nhập mã vận đơn khi giao hàng.</span>} columns={[
          { key: 't', label: 'Vận đơn', render: (s) => <><div className="row gap-s"><CarrierPill c={s.carrier} /><b>{s.tracking_no}</b></div><div className="cell-sub">{s.code} · đơn {s.order_code}</div></> },
          { key: 'c', label: 'Người nhận', render: (s) => <>{s.receiver_name || s.customer_name}<div className="cell-sub">{s.receiver_phone || s.channel || ''}</div></> },
          { key: 's', label: 'Trạng thái', render: (s) => <><SP s={s.status} /><div className="cell-sub">{dmyhm(s.status_at)}{s.days_in_status > 2 && !s.is_final ? ` · ${s.days_in_status} ngày chưa đổi` : ''}</div></> },
          { key: 'd', label: 'Chi tiết mới nhất', render: (s) => <span className="small">{s.status_detail || '—'}</span> },
          { key: 'cod', label: 'COD', align: 'right', render: (s) => (s.cod_amount > 0 ? <>{money(s.cod_amount)}<div><CP s={s.cod_status} /></div></> : '—') },
        ]} />
    </ListPage>
  );
}

// ---------- Tạo vận đơn ----------
export function ShipmentForm({ order_id, delivery_id, cod, onClose }) {
  const { can } = useApp();
  const o = useQ('sales_orders', [['id', 'eq', order_id]]);
  const dels = useQ('deliveries', [['order_id', 'eq', order_id]], 'created_at desc');
  const { run, busy } = useAction();
  const d = o.data?.[0];
  const [f, setF] = useState(null);
  useEffect(() => {
    if (d && !f) setF({ carrier: lastCarrier(), tracking_no: '', cod_amount: cod ?? Math.max(0, d.remaining_to_pay), ship_fee: null, delivery_id: delivery_id || '',
      receiver_name: d.customer_name, receiver_phone: d.customer_phone || '', receiver_address: d.customer_address || '', note: '' });
  }, [d]);
  useEffect(() => { if (f && !f.delivery_id && dels.data?.length) setF((s) => ({ ...s, delivery_id: dels.data[0].id })); }, [dels.data, f]);
  if (!d || !f) return <Modal title="Tạo vận đơn" onClose={onClose}><Loading /></Modal>;
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal title={`Tạo vận đơn – đơn ${d.code}`} subtitle={d.customer_name} onClose={onClose} size="md"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => {
        const r = await run('create_shipment', { order_id, ...f, delivery_id: f.delivery_id || null }, (x) => `Đã tạo vận đơn ${carrier(f.carrier).short} ${x.tracking_no}`);
        if (r) { rememberCarrier(f.carrier); onClose(); }
      }}>Lưu vận đơn</Btn></>}>
      <Note>Tạo đơn gửi trên app / trang quản lý của hãng như bình thường, rồi dán <b>mã vận đơn</b> vào đây. Từ đó trạng thái giao, tiền COD và thông báo đều gắn với đơn này.</Note>
      <div className="seg">{CARRIERS.map((c) => <button key={c.code} className={f.carrier === c.code ? 'on' : ''} onClick={() => set('carrier', c.code)}>{c.name}</button>)}</div>
      <div className="grid">
        <Field label={`Mã vận đơn ${carrier(f.carrier).short}`} required wide><Input value={f.tracking_no} onChange={(v) => set('tracking_no', v.toUpperCase())} placeholder={carrier(f.carrier).hint} autoFocus /></Field>
        <Field label="Tiền thu hộ (COD)" hint={`Đơn còn phải trả ${money(d.remaining_to_pay)}. Để 0 nếu khách đã chuyển khoản.`}><NumInput value={f.cod_amount} onChange={(v) => set('cod_amount', v || 0)} /></Field>
        <Field label="Cước vận chuyển (dự kiến)"><NumInput value={f.ship_fee} onChange={(v) => set('ship_fee', v)} /></Field>
        <Field label="Gắn với phiếu giao"><Select value={f.delivery_id} onChange={(v) => set('delivery_id', v)} placeholder="(chưa giao trong sổ)" options={(dels.data || []).map((x) => ({ value: x.id, label: `${x.code} · ${dmy(x.delivery_date)}` }))} /></Field>
        <Field label="Người nhận"><Input value={f.receiver_name} onChange={(v) => set('receiver_name', v)} /></Field>
        <Field label="SĐT người nhận"><Input value={f.receiver_phone} onChange={(v) => set('receiver_phone', v)} inputMode="tel" /></Field>
        <Field label="Địa chỉ nhận" wide><Input value={f.receiver_address} onChange={(v) => set('receiver_address', v)} /></Field>
      </div>
      {d.delivery_count === 0 && <Note tone="warn">Đơn này chưa ghi giao hàng trong sổ. Khi đưa hàng cho đơn vị vận chuyển, nhớ bấm <b>Giao hàng</b> ở đơn để trừ kho và ghi doanh thu.</Note>}
    </Modal>
  );
}

// ---------- Chi tiết vận đơn ----------
export function ShipmentDetail({ id, onClose }) {
  const { open, can, toast, backend, book } = useApp();
  const q = useQ('shipments', [['id', 'eq', id]]);
  const { run, busy } = useAction();
  const [st, setSt] = useState(''); const [note, setNote] = useState(''); const [edit, setEdit] = useState(null);
  const s = q.data?.[0];
  if (!s) return <Modal title="Vận đơn" onClose={onClose}>{q.error ? <ErrorBox error={q.error} /> : <Loading />}</Modal>;
  const cinfo = carrier(s.carrier);
  const copy = async () => { try { await navigator.clipboard.writeText(s.tracking_no); toast('Đã chép mã ' + s.tracking_no); } catch (e) { toast('Mã vận đơn: ' + s.tracking_no); } };
  return (
    <Modal title={`Vận đơn ${cinfo.short} ${s.tracking_no}`} subtitle={<span className="row gap-s"><SP s={s.status} /> {s.cod_amount > 0 && <CP s={s.cod_status} />} · đơn {s.order_code} · {s.customer_name}</span>} onClose={onClose} size="lg"
      footer={<>
        <Btn icon="copy" onClick={copy}>Chép mã</Btn>
        {cinfo.track && <a className="btn btn-ghost" href={cinfo.track} target="_blank" rel="noreferrer"><Icon name="link" size={17} /><span>Tra trên trang {cinfo.short}</span></a>}
        <span className="grow" />
        <Btn icon="order" onClick={() => open('order', { id: s.order_id })}>Mở đơn {s.order_code}</Btn>
        {['dang_hoan', 'da_hoan'].includes(s.status) && can('ban_hang') && <Btn kind="primary" icon="back" onClick={async () => {
          const [o] = await backend.rpc('q', { book_id: book.id, view: 'sales_orders', filters: [['id', 'eq', s.order_id]] });
          if (o?.delivered_value > 0) open('return', { order: o }); else toast('Đơn chưa ghi giao hàng nên không cần nhập lại kho', 'err');
        }}>Nhận hàng hoàn → nhập lại kho</Btn>}
      </>}>
      <div className="grid-2">
        <KV items={[['Đơn vị vận chuyển', cinfo.name], ['Người nhận', `${s.receiver_name || '—'}${s.receiver_phone ? ' · ' + s.receiver_phone : ''}`], ['Địa chỉ', s.receiver_address || '—'],
          ['Tiền thu hộ (COD)', s.cod_amount > 0 ? `${money(s.cod_amount)} đ` : 'Không'], ['Cước vận chuyển', s.ship_fee ? money(s.ship_fee) + ' đ' : '—'],
          s.cod_payment_codes?.length > 0 && ['Phiếu thu COD', s.cod_payment_codes.join(', ')], ['Phiếu giao', s.delivery_code || 'chưa gắn'],
          ['Theo dõi tự động', s.tracking_registered_at ? `Đã bật · lần cập nhật ${dmyhm(s.last_sync_at)}` : (s.last_sync_at ? `Có · lần nhận gần nhất ${dmyhm(s.last_sync_at)}` : 'Chưa (cập nhật tay hoặc nhập file Excel)')], s.note && ['Ghi chú', s.note]]} />
        {can('ban_hang') && !s.order_cancelled && (
          <Section title="Cập nhật trạng thái">
            <div className="muted small">Xem trạng thái trên app {cinfo.short} rồi chọn ở đây. Mỗi lần đổi được lưu vào lịch sử và gửi thông báo.</div>
            <Select value={st} onChange={setSt} placeholder="Chọn trạng thái mới…" options={Object.entries(SHIP_STATUS).map(([value, [label]]) => ({ value, label, disabled: value === s.status }))} />
            <Input value={note} onChange={setNote} placeholder="Ghi chú (vd. khách hẹn giao lại thứ 7)" />
            <div><Btn kind="soft" busy={busy} disabled={!st} onClick={async () => { if (await run('update_shipment_status', { id, status: st, note }, 'Đã cập nhật trạng thái')) { setSt(''); setNote(''); } }}>Lưu trạng thái</Btn>
              {' '}<Btn small onClick={() => setEdit({ cod_amount: s.cod_amount, ship_fee: s.ship_fee, receiver_phone: s.receiver_phone, receiver_address: s.receiver_address, note: s.note || '' })}>Sửa COD / thông tin</Btn></div>
          </Section>
        )}
      </div>
      {edit && <div className="section"><div className="grid">
        <Field label="COD"><NumInput value={edit.cod_amount} onChange={(v) => setEdit((x) => ({ ...x, cod_amount: v || 0 }))} /></Field>
        <Field label="Cước vận chuyển"><NumInput value={edit.ship_fee} onChange={(v) => setEdit((x) => ({ ...x, ship_fee: v || 0 }))} /></Field>
        <Field label="SĐT nhận"><Input value={edit.receiver_phone} onChange={(v) => setEdit((x) => ({ ...x, receiver_phone: v }))} /></Field>
        <Field label="Địa chỉ" wide><Input value={edit.receiver_address} onChange={(v) => setEdit((x) => ({ ...x, receiver_address: v }))} /></Field>
        <Field label="Ghi chú" wide><Input value={edit.note} onChange={(v) => setEdit((x) => ({ ...x, note: v }))} /></Field>
      </div><div className="row gap"><Btn kind="primary" busy={busy} onClick={async () => { if (await run('update_shipment', { id, ...edit }, 'Đã lưu')) setEdit(null); }}>Lưu</Btn><Btn onClick={() => setEdit(null)}>Thôi</Btn></div></div>}
      {s.status === 'da_hoan' && <Note tone="warn">{cinfo.short} đã hoàn hàng. Khi nhận lại hàng, bấm <b>Nhận hàng hoàn → nhập lại kho</b> để ghi phiếu khách trả: hàng về kho, đảo doanh thu và công nợ. Hàng vỡ thì bỏ chọn “Nhập lại để bán”.</Note>}
      <Section title="Hành trình">
        <ol className="timeline">{(s.events || []).map((e, i) => (
          <li key={i} className={i === 0 ? 'now' : ''}><div className="row gap-s"><b>{e.label || e.status || 'Cập nhật'}</b><span className="muted small">{dmyhm(e.at)}</span>
            <span className="muted small">· {e.source === 'tu_dong' ? 'tự động' : e.source === 'tay' ? 'cập nhật tay' : 'hệ thống'}</span></div>
            {(e.detail || e.location) && <div className="small">{[e.detail, e.location].filter(Boolean).join(' · ')}</div>}</li>))}</ol>
      </Section>
    </Modal>
  );
}

// ---------- Đối soát COD ----------
export function CodSettleDialog({ bank_txn, carrier: cr0, onClose }) {
  const { can } = useApp();
  const guess = cr0 || (/BEST/i.test(bank_txn?.content || '') ? 'BEST' : /SPX|SHOPEE/i.test(bank_txn?.content || '') ? 'SPX' : 'SPX');
  const [cr, setCr] = useState(guess);
  const q = useQ('shipments', [['cod_status', 'eq', 'spx_dang_giu'], ['carrier', 'eq', cr]], 'status_at', 2000);
  const ci = carrier(cr);
  const funds = useFunds(true);
  const { run, busy } = useAction();
  const [sel, setSel] = useState({}); const [recv, setRecv] = useState(bank_txn?.amount ?? null); const [fund, setFund] = useState(''); const [date, setDate] = useState(todayVN());
  useEffect(() => { if (!fund && funds.data?.length) setFund((funds.data.find((f) => /ngân hàng|tài khoản/i.test(f.name)) || funds.data[0]).id); }, [funds.data]);
  useEffect(() => { if (q.data) setSel(Object.fromEntries(q.data.map((s) => [s.id, true]))); }, [q.data]);
  const chosen = (q.data || []).filter((s) => sel[s.id]);
  const tot = chosen.reduce((a, s) => a + Number(s.cod_amount), 0);
  const fee = tot - (Number(recv) || 0);
  return (
    <Modal title={`Đối soát tiền COD ${ci.name}`} subtitle={bank_txn ? `Khoản tiền về ${money(bank_txn.amount)} đ · ${bank_txn.content || ''}` : `${ci.short} chuyển 1 khoản gộp nhiều vận đơn, đã trừ cước`} onClose={onClose} size="lg"
      footer={<><span className="muted small grow">{chosen.length} vận đơn · COD {money(tot)} − tiền về {money(recv)} = <b>cước/phí {ci.short} {money(fee)}</b></span>
        <Btn onClick={onClose}>Thôi</Btn>
        <Btn kind="primary" busy={busy} disabled={!chosen.length || !(recv > 0) || fee < 0} onClick={async () => {
          const r = await run('settle_cod', { shipment_ids: chosen.map((s) => s.id), received: recv, fund_id: fund, date, bank_txn_id: bank_txn?.id || null },
            (x) => `Đã đối soát ${x.count} vận đơn · phiếu thu ${x.payments.join(', ')}`);
          if (r) onClose();
        }}>Xác nhận đối soát</Btn></>}>
      <div className="seg">{CARRIERS.filter((c) => c.code !== 'KHAC').map((c) => <button key={c.code} className={cr === c.code ? 'on' : ''} onClick={() => setCr(c.code)}>{c.name}</button>)}</div>
      <Note>Chọn đúng các vận đơn có trong bảng đối soát {ci.short} gửi. Mỗi lần đối soát chỉ một hãng (SPX và BEST chuyển tiền riêng). Mỗi vận đơn sinh 1 phiếu thu gạch nợ đơn tương ứng; phần chênh lệch (cước, phí thu hộ) ghi vào chi phí “Vận chuyển”.</Note>
      <div className="grid">
        <Field label={`Số tiền ${ci.short} thực chuyển về`}><NumInput value={recv} onChange={setRecv} disabled={!!bank_txn} /></Field>
        <Field label="Vào quỹ"><Select value={fund} onChange={setFund} options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Ngày tiền về"><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
      </div>
      {fee < 0 && <Note tone="bad">Tiền về lớn hơn tổng COD đã chọn — hãy chọn thêm vận đơn.</Note>}
      <Table dense rows={q.data} empty={`Không có vận đơn nào ${ci.short} đang giữ tiền`} columns={[
        { key: 'x', label: '', width: 36, render: (s) => <input type="checkbox" checked={!!sel[s.id]} onChange={(e) => setSel((m) => ({ ...m, [s.id]: e.target.checked }))} /> },
        { key: 't', label: 'Vận đơn', render: (s) => <><b>{s.tracking_no}</b><div className="cell-sub">đơn {s.order_code} · {s.customer_name}</div></> },
        { key: 'd', label: 'Giao thành công', render: (s) => dmy(s.status_at) },
        { key: 'c', label: 'COD', align: 'right', render: (s) => money(s.cod_amount) },
      ]} />
    </Modal>
  );
}

// ---------- Cập nhật trạng thái từ file Excel của hãng ----------
export function ShipImportDialog({ onClose }) {
  const { run, busy } = useAction();
  const [rows, setRows] = useState(null); const [err, setErr] = useState(null); const [res, setRes] = useState(null); const [fname, setFname] = useState('');
  const onFile = async (file) => {
    setErr(null); setRes(null); setFname(file.name);
    try {
      const wb = await readWorkbook(file);
      let found = null;
      for (const [sheet, aoa] of Object.entries(wb)) {
        for (let i = 0; i < Math.min(15, aoa.length); i++) {
          const h = (aoa[i] || []).map((c) => norm(c));
          const ti = h.findIndex((c) => /ma van don|tracking|ma spx|van don|bill ?code|ma bill|waybill/.test(c));
          const si = h.findIndex((c) => /trang thai|status/.test(c));
          if (ti >= 0 && si >= 0) { found = { sheet, aoa, i, ti, si, at: h.findIndex((c) => /thoi gian|cap nhat|ngay|time/.test(c)), de: h.findIndex((c) => /mo ta|chi tiet|ghi chu|ly do|description/.test(c)) }; break; }
        }
        if (found) break;
      }
      if (!found) throw new Error('Không thấy cột “Mã vận đơn” và “Trạng thái” trong file. Hãy tải file danh sách đơn từ trang quản lý của hãng (SPX, BEST) hoặc tự lập file có 2 cột này.');
      const out = [];
      for (const r of found.aoa.slice(found.i + 1)) {
        const tn = String(r[found.ti] || '').trim(); if (!tn) continue;
        const raw = String(r[found.si] || '');
        let at = found.at >= 0 ? r[found.at] : null;
        if (at instanceof Date) at = at.toISOString(); else if (typeof at === 'string' && /^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(at)) {
          const m = at.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/); at = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '12').padStart(2, '0')}:${m[5] || '00'}:00+07:00`).toISOString();
        } else at = null;
        out.push({ tracking_no: tn, raw, status: mapSpxStatus(raw), at, detail: found.de >= 0 ? String(r[found.de] || '') : '' });
      }
      setRows(out);
    } catch (e) { setErr(e.message); setRows(null); }
  };
  const ok = (rows || []).filter((r) => r.status);
  return (
    <Modal title="Cập nhật trạng thái vận đơn từ file Excel" onClose={onClose} size="lg"
      footer={res ? <Btn kind="primary" onClick={onClose}>Xong</Btn> : <><Btn onClick={onClose}>Thôi</Btn>
        <Btn kind="primary" busy={busy} disabled={!ok.length} onClick={async () => {
          const r = await run('import_shipment_statuses', { rows: ok.map(({ tracking_no, status, at, detail }) => ({ tracking_no, status, at, detail })) }, (x) => `Đã cập nhật ${x.changed} vận đơn`);
          if (r) setRes(r);
        }}>Cập nhật {ok.length} dòng</Btn></>}>
      <Note>Trên trang quản lý của hãng (SPX, BEST…), tải danh sách đơn ra Excel rồi chọn file ở đây. Dùng được cho mọi hãng vì phần mềm tìm theo mã vận đơn. Phần mềm đọc cột <b>Mã vận đơn</b> và <b>Trạng thái</b>, đổi trạng thái các vận đơn có trong sổ. File gốc không bị sửa; nhập lại cùng file không ghi trùng.</Note>
      <label className="btn btn-soft" style={{ alignSelf: 'flex-start' }}><Icon name="up" /> Chọn file Excel / CSV<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
      {fname && <div className="muted small">{fname}</div>}
      <ErrorBox error={err} />
      {res && <KV items={[['Số dòng', res.rows], ['Vận đơn đổi trạng thái', res.changed], ['Không đổi (trùng hoặc cũ hơn)', res.unchanged],
        ['Mã không có trong sổ', res.not_found.length ? res.not_found.join(', ') : 'không có'], ['Trạng thái không đọc được', res.bad_status.length ? res.bad_status.join(', ') : 'không có']]} />}
      {rows && !res && <Table dense rowKey="__i" rows={rows.map((r, i) => ({ ...r, __i: i }))} columns={[
        { key: 't', label: 'Mã vận đơn', render: (r) => <b>{r.tracking_no}</b> },
        { key: 'r', label: 'Trạng thái trong file', render: (r) => r.raw },
        { key: 's', label: 'Hiểu là', render: (r) => (r.status ? <SP s={r.status} /> : <Pill tone="bad">Không đọc được – bỏ qua</Pill>) },
        { key: 'a', label: 'Thời điểm', render: (r) => (r.at ? dmyhm(r.at) : 'lúc nhập') },
      ]} />}
    </Modal>
  );
}

// Danh sách vận đơn trong màn hình đơn hàng
export function OrderShipments({ order }) {
  const { open, can } = useApp();
  const q = useQ('shipments', [['order_id', 'eq', order.id]], 'created_at');
  if (order.status === 'nhap') return null;
  return (
    <Section title="Vận chuyển" actions={can('ban_hang') && order.status === 'xac_nhan' && <Btn small kind="soft" icon="route" onClick={() => open('ship-form', { order_id: order.id })}>Tạo vận đơn</Btn>}>
      <Table dense rows={q.data} empty="Chưa gửi qua đơn vị vận chuyển" onRow={(s) => open('ship', { id: s.id })} columns={[
        { key: 't', label: 'Vận đơn', render: (s) => <div className="row gap-s"><CarrierPill c={s.carrier} /><b>{s.tracking_no}</b></div> },
        { key: 's', label: 'Trạng thái', render: (s) => <><SP s={s.status} /><div className="cell-sub">{dmyhm(s.status_at)}</div></> },
        { key: 'c', label: 'COD', align: 'right', render: (s) => (s.cod_amount > 0 ? <>{money(s.cod_amount)}<div><CP s={s.cod_status} /></div></> : '—') },
      ]} />
    </Section>
  );
}
