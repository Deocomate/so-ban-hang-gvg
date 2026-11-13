import { DocTemplateSettings } from './Documents.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, dmyhm, todayVN } from '../lib/format.js';
import { exportXlsx, saveFile } from '../lib/excel.js';
import { useAllProducts } from '../lib/lookups.js';
import { BankSettings, NotifySettings, CarrierSettings } from './SettingsExtra.jsx';
import { cats as expCats } from '../lib/expenseCats.js';
import { SETTING_GROUPS, LEGACY_SECTION, canSee } from '../lib/settings-nav.js';
import { SettingsLayout, Card, Row, EditModal, ListEditor, scrollToId, useSaveSettings, useToggle } from './SettingsShell.jsx';
import { Btn, Icon, Pill, Field, Input, Select, DateInput, NumInput, Check, Loading, ErrorBox, Note, Table, Modal, ConfirmBtn, Section } from '../components/ui.jsx';
import { MyAccount } from './Account.jsx';
import { CostMethodModal, COST_LABEL } from './CostMethod.jsx';
import { CategoryPermModal, TxnLockModal, RequiredFieldsModal, PointsModal, EinvoiceModal, CurrencyModal, PurgeSection } from './SettingsMore.jsx';
import { AdminUsers, AdminRoles, SecurityLog } from './Admin.jsx';

// Trang Thiết lập: địa chỉ #cai-dat/<mục>. Địa chỉ cũ theo tab (me, users, notify…) vẫn mở đúng mục mới.
export function SettingsPage({ go, sub, onSub }) {
  const { can, session } = useApp();
  const who = { owner: can('owner'), admin: !!session?.user?.is_admin };
  const groups = SETTING_GROUPS.map((g) => ({ ...g, items: g.items.filter((s) => canSee(s, who)) })).filter((g) => g.items.length);
  const visible = groups.flatMap((g) => g.items);
  const resolve = (v) => { const id = LEGACY_SECTION[v] || v; return visible.find((s) => s.id === id) || visible[0]; };
  const [secId, setSecId] = useState(() => resolve(sub).id);
  const [flash, setFlash] = useState({ row: '', card: '', n: 0 });
  useEffect(() => { if (sub) { const s = resolve(sub); if (s.id !== secId) setSecId(s.id); } }, [sub]);
  useEffect(() => { onSub?.(secId); }, [secId]);
  // Chuông thông báo mở thẳng mục Thông báo
  useEffect(() => { const h = (e) => setSecId(resolve(e.detail).id); window.addEventListener('settings-tab', h); return () => window.removeEventListener('settings-tab', h); }, [visible.length]);
  // Chọn kết quả tìm kiếm: mở mục, cuộn tới dòng (hoặc thẻ chứa dòng) và tô sáng một nhịp
  useEffect(() => {
    if (!flash.n) return undefined;
    const t1 = setTimeout(() => { if (!scrollToId(`set-${flash.row}`)) scrollToId(`card-${flash.card}`); }, 60);
    const t2 = setTimeout(() => setFlash((f) => ({ ...f, row: '' })), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [flash.n]);
  const pick = (id, row, card) => {
    setSecId(id);
    if (row) setFlash((f) => ({ row, card, n: f.n + 1 })); else window.scrollTo(0, 0);
  };
  const sec = visible.find((s) => s.id === secId) || visible[0];
  const Panel = PANELS[sec.id];
  return (
    <SettingsLayout groups={groups} sec={sec} onPick={pick} flash={flash.row}>
      <Panel go={go} />
    </SettingsLayout>
  );
}


// Hộp thoại sửa một danh sách trong cài đặt sổ (đơn vị tính, nhóm hàng, kênh bán…)
function ListModal({ title, keyName, hint, ordered, placeholder, onClose }) {
  const { settings } = useApp();
  const { save, busy } = useSaveSettings();
  const [v, setV] = useState([...(settings[keyName] || [])]);
  return (
    <EditModal title={title} onClose={onClose} busy={busy} onSave={async () => { if (await save({ [keyName]: v })) onClose(); }}>
      {hint && <div className="muted small">{hint}</div>}
      <ListEditor values={v} onChange={setV} ordered={ordered} placeholder={placeholder} />
    </EditModal>
  );
}

// Hộp thoại sửa một con số (thuế suất, số ngày nhắc, mục tiêu…)
function NumberModal({ title, keyName, label, hint, suffix, isMoney, scale = 1, min = 0, max, onClose }) {
  const { settings } = useApp();
  const { save, busy } = useSaveSettings();
  const [v, setV] = useState((settings[keyName] ?? 0) * scale);
  return (
    <EditModal title={title} onClose={onClose} busy={busy} onSave={async () => { if (await save({ [keyName]: (Number(v) || 0) / scale })) onClose(); }}>
      <Field label={label} hint={hint}><NumInput money={!!isMoney} min={min} max={max} step={isMoney ? undefined : 0.5} suffix={suffix} value={v} onChange={setV} /></Field>
    </EditModal>
  );
}

const count = (n, unit) => `${n} ${unit}`;
const pctText = (r) => `${Math.round((Number(r) || 0) * 1000) / 10}%`;


// ---------- Quản lý: Hàng hóa ----------
const PRODUCT_FIELDS = [['brand', 'Thương hiệu'], ['material', 'Chất liệu'], ['norm_m2', 'Định mức m² (viên/m²)'], ['norm_m', 'Định mức mét dài (viên/m)']];

function FieldsModal({ onClose }) {
  const { settings } = useApp();
  const { save, busy } = useSaveSettings();
  const known = PRODUCT_FIELDS.map(([k]) => k);
  const [hidden, setHidden] = useState(new Set(settings.hide_fields || []));
  const toggle = (k, on) => setHidden((s) => { const n = new Set(s); if (on) n.delete(k); else n.add(k); return n; });
  return (
    <EditModal title="Thuộc tính hàng hóa" onClose={onClose} busy={busy}
      onSave={async () => { const keep = (settings.hide_fields || []).filter((k) => !known.includes(k)); if (await save({ hide_fields: [...keep, ...known.filter((k) => hidden.has(k))] })) onClose(); }}>
      <div className="muted small">Trường được chọn hiện trên phiếu hàng hóa, bộ lọc, cột danh sách và tệp nhập Excel. Bỏ chọn chỉ ẩn đi, dữ liệu đã nhập vẫn giữ.</div>
      <div className="stack-s">{PRODUCT_FIELDS.map(([k, l]) => <Check key={k} checked={!hidden.has(k)} onChange={(v) => toggle(k, v)}>{l}</Check>)}</div>
    </EditModal>
  );
}

function ProductsPanel({ go }) {
  const { settings } = useApp();
  const products = useAllProducts();
  const [dlg, setDlg] = useState('');
  const brands = useMemo(() => new Set((products.data || []).map((p) => p.brand).filter(Boolean)).size, [products.data]);
  const hidden = new Set(settings.hide_fields || []);
  const usedFields = PRODUCT_FIELDS.filter(([k]) => !hidden.has(k)).length;
  const pack = useToggle('packaging', { invert: true });
  const oversell = useToggle('allow_oversell');
  const barcode = useToggle('use_barcode'); const suggest = useToggle('product_suggest');
  const warranty = useToggle('warranty'); const catPerm = useToggle('category_perm');
  return (
    <>
      <Card id="thong-tin">
        <Row id="units" value={count((settings.units || []).length, 'đơn vị tính')} onClick={() => setDlg('units')} />
        <Row id="fields" value={count(usedFields, 'thuộc tính')} onClick={() => setDlg('fields')} />
        <Row id="packaging" toggle={pack} />
        <Row id="categories" value={count((settings.categories || []).length, 'nhóm hàng')} onClick={() => setDlg('categories')} />
        {!hidden.has('brand') && <Row id="brands" value={products.data ? count(brands, 'thương hiệu') : '…'} onClick={() => go('san-pham')} />}
        <Row id="locations" value={count((settings.locations || []).length, 'vị trí')} onClick={() => setDlg('locations')} />
        <Row id="barcode" toggle={barcode}>{barcode.checked && <div className="muted small">Phiếu hàng hóa có ô Mã vạch; quét mã vạch ở màn bán hàng thêm ngay dòng hàng; in tem mã vạch ở chi tiết hàng hóa.</div>}</Row>
        <Row id="suggest" toggle={suggest}>{suggest.checked && <div className="muted small">Khi tạo hàng mới, gõ tên sẽ gợi ý các hàng tương tự đã có để chép nhóm, đơn vị, kích thước, giá.</div>}</Row>
      </Card>
      <Card id="gia">
        <Row id="cost" value={COST_LABEL[settings.cost_method === 'fixed' ? 'fixed' : 'avg']} onClick={() => setDlg('cost')} />
        <Row id="pricebook" value={count((settings.price_names || []).length, 'mức giá')} onClick={() => go('bang-gia')} />
      </Card>
      <Card id="san-xuat"><Row id="production" value="Đang bật" onClick={() => go('san-xuat')} /></Card>
      <Card id="bao-hanh"><Row id="warranty" toggle={warranty}>{warranty.checked && <div className="row gap"><span className="muted small grow">Khai thời hạn bảo hành, chu kỳ bảo trì ở từng hàng hóa; tra cứu và lập phiếu sửa chữa ở Đơn hàng → Bảo hành, sửa chữa.</span><Btn small onClick={() => go('bao-hanh')}>Mở trang</Btn></div>}</Row></Card>
      <Card id="nguoi-dung"><Row id="cat-perm" toggle={catPerm}>{catPerm.checked && <div><Btn small icon="users" onClick={() => setDlg('catperm')}>Giao nhóm hàng cho nhân viên</Btn></div>}</Row></Card>
      <Card id="khac"><Row id="oversell" toggle={oversell} /></Card>
      {dlg === 'units' && <ListModal title="Đơn vị tính" keyName="units" placeholder="Thêm đơn vị tính, vd. viên, m², bộ" onClose={() => setDlg('')} />}
      {dlg === 'categories' && <ListModal title="Nhóm hàng" keyName="categories" placeholder="Thêm nhóm hàng" hint="Đổi tên nhóm ở đây không đổi nhóm của các hàng hóa đã có." onClose={() => setDlg('')} />}
      {dlg === 'locations' && <ListModal title="Vị trí" keyName="locations" placeholder="Thêm vị trí, vd. Kho 1, Kệ A" onClose={() => setDlg('')} />}
      {dlg === 'fields' && <FieldsModal onClose={() => setDlg('')} />}
      {dlg === 'cost' && <CostMethodModal onClose={() => setDlg('')} />}
      {dlg === 'catperm' && <CategoryPermModal onClose={() => setDlg('')} />}
    </>
  );
}

// ---------- Quản lý: Mua hàng ----------
function PurchasePanel({ go }) {
  const { settings } = useApp();
  const [dlg, setDlg] = useState(false);
  const poCost = useToggle('po_costs');
  return (
    <>
      <Card id="ncc"><Row id="suppliers" value="Mở danh sách" onClick={() => go('nha-cung-cap')} /></Card>
      <Card id="nhap">
        <Row id="po" value="Đang bật" onClick={() => go('dat-hang-nhap')} />
        <Row id="prod_steps" value={count((settings.prod_steps || []).length, 'bước')} onClick={() => setDlg(true)} />
        <Row id="po-cost" toggle={poCost}>{poCost.checked && <div className="row gap"><span className="muted small grow">Khi nhận hàng, thêm các khoản phí (vận chuyển, bốc xếp…): chia vào giá vốn từng dòng theo giá trị; phần NCC thu hộ cộng vào công nợ NCC.</span>
          <Btn small onClick={() => setDlg('costnames')}>Loại chi phí ({(settings.po_cost_names || []).length})</Btn></div>}</Row>
      </Card>
      <Card id="dich-vu"><Row id="services" value="Đang bật" onClick={() => go('mua-dich-vu')} /></Card>
      {dlg === 'costnames' && <ListModal title="Loại chi phí nhập hàng" keyName="po_cost_names" placeholder="vd. Phí vận chuyển, Bốc xếp, Lưu kho" onClose={() => setDlg(false)} />}
      {dlg === true && <ListModal title="Các bước sản xuất (đơn đặt xưởng)" keyName="prod_steps" ordered placeholder="Thêm bước"
        hint="Theo thứ tự. Trạng thái “Đã nhận một phần / Đã nhận đủ” do phần mềm tự cập nhật khi nhận hàng, không cần thêm ở đây." onClose={() => setDlg(false)} />}
    </>
  );
}

// ---------- Quản lý: Đơn hàng ----------
function OrdersPanel({ go }) {
  const { settings } = useApp();
  const { save } = useSaveSettings();
  const [dlg, setDlg] = useState('');
  const oversell = useToggle('allow_oversell');
  const confirm = useToggle('confirm_complete'); const retLimit = useToggle('return_limit'); const lockTime = useToggle('lock_txn_time');
  const shift = useToggle('shift_on'); const einvLock = useToggle('einvoice_lock');
  return (
    <>
      <Card id="quan-ly">
        <Row id="channels" value={count((settings.channels || []).length, 'kênh bán')} onClick={() => setDlg('channels')} />
        <Row id="oversell" toggle={oversell} />
        <Row id="charges" value="2 loại thu khác" onClick={() => setDlg('charges')} />
        <Row id="confirm" toggle={confirm} />
        <Row id="return-limit" toggle={retLimit}>{retLimit.checked && <div className="row gap-s"><span className="small">Khách được trả hàng trong</span>
          <div style={{ width: 120 }}><NumInput money={false} min={1} value={settings.return_limit_days ?? 7} onChange={(v) => save({ return_limit_days: Number(v) || 7 })} suffix="ngày" aria-label="Số ngày được trả hàng" /></div><span className="small">kể từ ngày giao</span></div>}</Row>
        <Row id="lock-time" toggle={{ ...lockTime, onChange: (v) => (v ? setDlg('lock') : lockTime.onChange(false)) }}>{lockTime.checked && <div><Btn small onClick={() => setDlg('lock')}>Chọn loại giao dịch ({(settings.lock_txn_kinds || []).length})</Btn></div>}</Row>
        <Row id="shift" toggle={shift}>{shift.checked && <div className="row gap"><span className="muted small grow">Thu ngân mở ca, kết ca ở Sổ quỹ → Kết ca.</span><Btn small onClick={() => go('ket-ca')}>Mở trang</Btn></div>}</Row>
      </Card>
      <Card id="hddt"><Row id="einv-lock" toggle={einvLock} /></Card>
      <Card id="ma"><Row id="codes" value="Tăng dần theo thứ tự tạo" onClick={() => setDlg('codes')} /></Card>
      {dlg === 'channels' && <ListModal title="Kênh bán" keyName="channels" ordered placeholder="Thêm kênh bán, vd. Facebook" onClose={() => setDlg('')} />}
      {dlg === 'charges' && <ChargesModal onClose={() => setDlg('')} />}
      {dlg === 'lock' && <TxnLockModal onClose={() => setDlg('')} />}
      {dlg === 'codes' && (
        <EditModal title="Quy tắc tạo mã giao dịch" onClose={() => setDlg('')}>
          <div><div className="field-label">Cách tạo mã giao dịch</div><b>Tăng dần theo thứ tự tạo</b></div>
          <div className="small">Mỗi loại chứng từ có tiền tố riêng (DH đơn bán, GH phiếu giao, BG báo giá…), phần số tăng dần theo thứ tự tạo trong từng sổ.</div>
          <div className="muted small">Ví dụ: DH00001 → DH00002 → DH00003</div>
        </EditModal>
      )}
    </>
  );
}

function ChargesModal({ onClose }) {
  const { settings } = useApp();
  const { save, busy } = useSaveSettings();
  const [vat, setVat] = useState(settings.default_vat ?? 8);
  return (
    <EditModal title="Quản lý thu khác" onClose={onClose} busy={busy} size="md" onSave={async () => { if (await save({ default_vat: Number(vat) || 0 })) onClose(); }}>
      <div className="muted small">Các khoản thu thêm khi bán hàng, chọn trong ô “Thu khác” của màn bán hàng.</div>
      <Table dense rows={[{ id: 'vat', name: 'VAT', how: 'Theo % tiền hàng' }, { id: 'ship', name: 'Tiền vận chuyển', how: 'Nhập số tiền, kèm lái xe và người trả cước' }]} columns={[
        { key: 'n', label: 'Loại thu', render: (r) => <b>{r.name}</b> }, { key: 'h', label: 'Mức thu', render: (r) => r.how },
      ]} />
      <Field label="VAT mặc định trên hóa đơn, báo giá"><NumInput money={false} min={0} max={100} suffix="%" value={vat} onChange={setVat} /></Field>
    </EditModal>
  );
}

// ---------- Quản lý: Khách hàng ----------
const priceNamesToSave = (names) => { const t = names.map((x) => x.trim()); while (t.length > 3 && !t[t.length - 1]) t.pop(); return t; };

function PriceNamesModal({ onClose }) {
  const { settings } = useApp();
  const { save, busy } = useSaveSettings();
  const [v, setV] = useState([...(settings.price_names || []), '', '', '', '', ''].slice(0, 5));
  return (
    <EditModal title="Mức giá bán" onClose={onClose} busy={busy} onSave={async () => { if (await save({ price_names: priceNamesToSave(v) })) onClose(); }}>
      <div className="muted small">Mỗi khách hàng gắn với 1 mức giá; khi tạo đơn, giá tự điền theo mức của khách (vẫn sửa được từng dòng). Muốn dùng mức 5 thì phải đặt tên cả mức 4.</div>
      {v.map((x, i) => <Field key={i} label={`Mức giá ${i + 1}${i >= 3 ? ' (không bắt buộc)' : ''}`}><Input value={x} onChange={(t) => setV((a) => a.map((y, j) => (j === i ? t : y)))} /></Field>)}
    </EditModal>
  );
}

function CustomersPanel({ go }) {
  const { settings } = useApp();
  const [dlg, setDlg] = useState('');
  const owner = useToggle('customer_owner'); const ownerOnly = useToggle('customer_owner_only'); const dual = useToggle('customer_supplier');
  const req = useToggle('customer_required_on'); const points = useToggle('points_on');
  const promo = useToggle('promo_on'); const voucher = useToggle('voucher_on'); const coupon = useToggle('coupon_on');
  const loyaltyLink = <div><Btn small onClick={() => go('khuyen-mai')}>Mở trang Khuyến mại &amp; voucher</Btn></div>;
  return (
    <>
      <Card id="quan-ly">
        <Row id="price_names" value={count((settings.price_names || []).length, 'mức giá')} onClick={() => setDlg('price')} />
        <Row id="customer_groups" value={count((settings.customer_groups || []).length, 'nhóm')} onClick={() => setDlg('groups')} />
        <Row id="due_warn" value={`Nhắc trước ${settings.due_warn_days ?? 3} ngày`} onClick={() => setDlg('due')} />
        <Row id="kh-owner" toggle={owner}>{owner.checked && <Check checked={ownerOnly.checked} onChange={ownerOnly.onChange}>Nhân viên chỉ xem được khách mình phụ trách</Check>}</Row>
        <Row id="kh-ncc" toggle={dual}>{dual.checked && <div className="muted small">Phiếu khách hàng có ô “Đồng thời là nhà cung cấp”; chi tiết khách hiện cả phải thu và phải trả để bù trừ.</div>}</Row>
        <Row id="kh-required" toggle={{ ...req, onChange: (v) => (v ? setDlg('req') : req.onChange(false)) }}>{req.checked && <div><Btn small onClick={() => setDlg('req')}>Chọn thông tin bắt buộc ({(settings.customer_required || []).length})</Btn></div>}</Row>
      </Card>
      <Card id="cham-soc">
        <Row id="points" toggle={{ ...points, onChange: (v) => (v ? setDlg('points') : points.onChange(false)) }}>{points.checked && <div><Btn small onClick={() => setDlg('points')}>1 điểm / {money(settings.points?.earn_amount || 0)} đ{settings.points?.redeem !== false ? ` · đổi ${money(settings.points?.redeem_value || 0)} đ/điểm` : ''}</Btn></div>}</Row>
        <Row id="promo" toggle={promo}>{promo.checked && loyaltyLink}</Row>
        <Row id="voucher" toggle={voucher}>{voucher.checked && loyaltyLink}</Row>
        <Row id="coupon" toggle={coupon}>{coupon.checked && loyaltyLink}</Row>
      </Card>
      {dlg === 'groups' && <ListModal title="Nhóm khách hàng" keyName="customer_groups" placeholder="Thêm nhóm, vd. Đại lý, Công trình"
        hint={<>Tên nhóm để chọn khi sửa khách. Điều kiện tự xếp nhóm và số khách từng nhóm xem ở <a href="#nhom-khach" onClick={() => setDlg('')}>Khách hàng → Nhóm khách hàng</a>.</>} onClose={() => setDlg('')} />}
      {dlg === 'req' && <RequiredFieldsModal onClose={() => setDlg('')} />}
      {dlg === 'points' && <PointsModal onClose={() => setDlg('')} />}
      {dlg === 'price' && <PriceNamesModal onClose={() => setDlg('')} />}
      {dlg === 'due' && <NumberModal title="Cảnh báo công nợ khách hàng" keyName="due_warn_days" label="Nhắc trước hạn" suffix="ngày" hint="Khoản nợ sắp đến hạn trong số ngày này hiện trong chuông thông báo và báo cáo công nợ." onClose={() => setDlg('')} />}
    </>
  );
}

// ---------- Quản lý: Sổ quỹ ----------
function CashPanel() {
  return (
    <>
      <Card id="quy"><Funds /></Card>
      <Card id="tai-khoan"><BankSettings part="account" /></Card>
      <Card id="chi-phi"><ExpenseCats /></Card>
    </>
  );
}

function ExpenseCats() {
  const { settings, book } = useApp();
  const { save, busy } = useSaveSettings();
  const [f, setF] = useState(null);
  useEffect(() => { setF({ cats: JSON.parse(JSON.stringify(expCats(settings))), fee: settings.fee_category || 'Phí sàn TMĐT' }); }, [book.id]);
  if (!f) return <Loading />;
  const setCats = (fn) => setF((s) => ({ ...s, cats: fn(s.cats) }));
  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div className="muted small">Khi ghi chi phí, chọn nhóm rồi chọn khoản mục. Đổi tên khoản mục không làm đổi các khoản đã ghi trước đó.</div>
      {f.cats.map((g, gi) => (
        <div className="cat-group" key={gi}>
          <div className="row gap"><Input value={g.group} onChange={(v) => setCats((c) => c.map((x, j) => (j === gi ? { ...x, group: v } : x)))} style={{ maxWidth: 260, fontWeight: 600 }} aria-label="Tên nhóm" />
            <span className="grow" />{f.cats.length > 1 && <Btn small onClick={() => setCats((c) => c.filter((_, j) => j !== gi))}>Bỏ nhóm</Btn>}</div>
          <TagEditorInline values={g.items} onChange={(v) => setCats((c) => c.map((x, j) => (j === gi ? { ...x, items: v } : x)))} />
        </div>))}
      <div><Btn small icon="plus" onClick={() => setCats((c) => [...c, { group: 'Nhóm mới', items: [] }])}>Thêm nhóm</Btn></div>
      <Field label="Nhóm chi phí cho phí sàn" hint="Phí sàn TMĐT trên đơn được ghi vào nhóm chi phí này"><Input value={f.fee} onChange={(v) => setF((s) => ({ ...s, fee: v }))} style={{ maxWidth: 320 }} /></Field>
      <div><Btn kind="primary" busy={busy} onClick={() => {
        const ec = f.cats.map((g) => ({ group: g.group.trim(), items: g.items })).filter((g) => g.group);
        save({ expense_cats: ec, expense_groups: ec.map((g) => g.group), fee_category: f.fee });
      }}>Lưu danh mục chi phí</Btn></div>
    </div>
  );
}

function TagEditorInline({ values, onChange }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !values.includes(t)) onChange([...values, t]); setV(''); };
  return (
    <div className="taglist">
      {values.map((x) => <span className="tag" key={x}>{x}<button title="Bỏ" onClick={() => onChange(values.filter((y) => y !== x))}>×</button></span>)}
      <Input value={v} onChange={setV} placeholder="Thêm khoản mục…" style={{ maxWidth: 220 }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
      <Btn small icon="plus" onClick={add}>Thêm</Btn>
    </div>
  );
}

// ---------- Quản lý: Thuế & Kế toán, Mẫu in ----------
function TaxPanel({ go }) {
  const { settings } = useApp();
  const [dlg, setDlg] = useState('');
  return (
    <>
      <Card id="thue">
        <Row id="vat_rate" value={pctText(settings.vat_rate)} onClick={() => setDlg('vat')} />
        <Row id="pit_rate" value={pctText(settings.pit_rate)} onClick={() => setDlg('pit')} />
        <Row id="default_vat" value={`${settings.default_vat ?? 8}%`} onClick={() => setDlg('def')} />
        <Row id="tax_files" value="Mở sổ sách" onClick={() => go('thue', 'so')} />
      </Card>
      <Card id="hddt"><Row id="einvoice" value={settings.einvoice?.provider ? 'Đã khai báo' : 'Chưa khai báo'} onClick={() => setDlg('einv')} /></Card>
      <Note>Thuế ở đây chỉ để ước tính lãi lỗ hằng tháng, không thay tờ khai. Quy định thuế hộ kinh doanh có thể thay đổi — nên đối chiếu với cán bộ thuế hoặc kế toán.</Note>
      {dlg === 'einv' && <EinvoiceModal onClose={() => setDlg('')} />}
      {dlg === 'vat' && <NumberModal title="Thuế GTGT trên doanh thu" keyName="vat_rate" scale={100} max={20} label="Thuế suất" suffix="%" hint="Hộ kinh doanh bán hàng hóa: 1%" onClose={() => setDlg('')} />}
      {dlg === 'pit' && <NumberModal title="Thuế TNCN trên lợi nhuận" keyName="pit_rate" scale={100} max={100} label="Thuế suất" suffix="%" hint="Hộ doanh thu trên 3 tỷ: 17%" onClose={() => setDlg('')} />}
      {dlg === 'def' && <NumberModal title="VAT mặc định trên hóa đơn, báo giá" keyName="default_vat" max={100} label="Thuế suất" suffix="%" onClose={() => setDlg('')} />}
    </>
  );
}

const PrintPanel = () => <Card id="mau"><DocTemplateSettings /></Card>;

// ---------- Tiện ích ----------
const DeliveryPanel = () => <Card id="hang"><CarrierSettings /></Card>;
const PaymentPanel = () => <Card id="chuyen-khoan"><BankSettings part="payment" /></Card>;
const NotifyPanel = () => <Card id="dien-thoai"><NotifySettings /></Card>;

// ---------- Cửa hàng ----------
function ShopPanel() {
  const { book, settings } = useApp();
  const { save, busy } = useSaveSettings();
  const [f, setF] = useState(null);
  const [dlg, setDlg] = useState(false);
  useEffect(() => { setF({ name: book.name, shop_phone: settings.shop_phone || '', shop_address: settings.shop_address || '', slip_note: settings.slip_note || '' }); }, [book.id]);
  if (!f) return <Loading />;
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <>
      <Card id="thong-tin">
        <div className="grid">
          <Field label="Tên sổ (thương hiệu)" wide><Input value={f.name} onChange={(v) => set('name', v)} /></Field>
          <Field label="Điện thoại cửa hàng"><Input value={f.shop_phone} onChange={(v) => set('shop_phone', v)} inputMode="tel" /></Field>
          <Field label="Địa chỉ cửa hàng" wide><Input value={f.shop_address} onChange={(v) => set('shop_address', v)} /></Field>
          <Field label="Lời nhắn cuối phiếu" wide><Input value={f.slip_note} onChange={(v) => set('slip_note', v)} placeholder="vd. Số TK: … · Cảm ơn quý khách" /></Field>
        </div>
        <div><Btn kind="primary" busy={busy} onClick={() => save({ shop_phone: f.shop_phone, shop_address: f.shop_address, slip_note: f.slip_note }, f.name)}>Lưu thông tin cửa hàng</Btn></div>
      </Card>
      <Card id="kinh-doanh"><Row id="target" value={settings.monthly_target ? `${money(settings.monthly_target)} đ` : 'Chưa đặt'} onClick={() => setDlg(true)} /></Card>
      <Card id="tien-te"><Row id="currency" value={(settings.currencies || []).length ? (settings.currencies || []).map((c) => c.code).join(', ') : 'Chỉ dùng VND'} onClick={() => setDlg('fx')} /></Card>
      {dlg === 'fx' && <CurrencyModal onClose={() => setDlg(false)} />}
      {dlg === true && <NumberModal title="Mục tiêu doanh thu mỗi tháng" keyName="monthly_target" isMoney label="Doanh thu mục tiêu" suffix="đ" onClose={() => setDlg(false)} />}
    </>
  );
}

const UsersPanel = () => <><Card id="tai-khoan"><AdminUsers /></Card><Card id="vai-tro"><AdminRoles /></Card></>;
function SecurityPanel() {
  const exp = useToggle('export_auth'); const tfa = useToggle('staff_2fa');
  return (
    <>
      <Card id="bao-mat">
        <Row id="export-auth" toggle={exp} />
        <Row id="2fa" toggle={tfa}>{tfa.checked && <div className="muted small">Nhân viên của sổ này cài ứng dụng xác thực (Google Authenticator, Microsoft Authenticator…) ở lần đăng nhập kế tiếp; thiết bị đã xác thực được nhớ 30 ngày. Mất điện thoại: Tổng quản trị bấm “Đặt lại xác thực 2 lớp” ở Quản lý người dùng.</div>}</Row>
      </Card>
      <Card id="nhat-ky"><SecurityLog /></Card>
    </>
  );
}
const AccountPanel = () => <Card id="tai-khoan"><MyAccount /></Card>;

// ---------- Dữ liệu ----------
function LockPanel() {
  const { settings } = useApp();
  const [dlg, setDlg] = useState(false);
  return (
    <>
      <Card id="khoa-so"><Row id="lock_date" value={settings.lock_date ? `Đã khóa đến ${dmy(settings.lock_date)}` : 'Chưa khóa sổ'} onClick={() => setDlg(true)} /></Card>
      {dlg && <LockModal onClose={() => setDlg(false)} />}
    </>
  );
}

function LockModal({ onClose }) {
  const { settings } = useApp();
  const { save, busy } = useSaveSettings();
  const [d, setD] = useState(settings.lock_date || '');
  return (
    <EditModal title="Khóa sổ" onClose={onClose} busy={busy} onSave={async () => { if (await save({ lock_date: d || null })) onClose(); }}>
      <div className="small">Để báo cáo không bị thay đổi, sau ngày khóa sổ không ai sửa, thêm hay xóa chứng từ có ngày từ ngày này trở về trước.</div>
      <Field label="Khóa sổ đến hết ngày" hint="Để trống để mở khóa sổ"><DateInput value={d} onChange={setD} max={todayVN()} /></Field>
    </EditModal>
  );
}

const AuditPanel = () => <Card id="nhat-ky"><AuditLog /></Card>;
const DataPanel = () => <><Card id="nhap"><ImportTools /></Card><Card id="sao-luu"><DataTools /><PurgeSection /></Card></>;

const PANELS = {
  'hang-hoa': ProductsPanel, 'mua-hang': PurchasePanel, 'don-hang': OrdersPanel, 'khach-hang': CustomersPanel, 'so-quy': CashPanel, thue: TaxPanel, 'mau-in': PrintPanel,
  'giao-hang': DeliveryPanel, 'thanh-toan': PaymentPanel, 'thong-bao': NotifyPanel,
  'cua-hang': ShopPanel, 'nguoi-dung': UsersPanel, 'bao-mat': SecurityPanel, 'tai-khoan': AccountPanel,
  'khoa-so': LockPanel, 'lich-su': AuditPanel, 'du-lieu': DataPanel,
};

function Funds() {
  const q = useQ('funds', [], 'sort', 50);
  const [edit, setEdit] = useState(null);
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Note>Số dư đầu kỳ = tiền thực có trong quỹ vào ngày bắt đầu dùng sổ. Số dư hiện tại = đầu kỳ + mọi phiếu thu − phiếu chi (không gồm phiếu đã hủy).</Note>
      <ErrorBox error={q.error} />
      <Table rows={q.data} onRow={(f) => setEdit(f)} columns={[
        { key: 'n', label: 'Quỹ', render: (f) => <><b>{f.name}</b> {!f.active && <Pill tone="mute">ngừng dùng</Pill>}</> },
        { key: 'o', label: 'Số dư đầu kỳ', align: 'right', render: (f) => money(f.opening_balance) },
        { key: 'b', label: 'Số dư hiện tại', align: 'right', render: (f) => <b>{money(f.balance)}</b> },
      ]} />
      <div><Btn icon="plus" onClick={() => setEdit({})}>Thêm quỹ</Btn></div>
      {edit && <FundForm fund={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function FundForm({ fund, onClose }) {
  const { run, busy } = useAction();
  const [f, setF] = useState({ name: '', opening_balance: 0, active: true, ...fund });
  return (
    <Modal title={fund.id ? `Sửa quỹ ${fund.name}` : 'Thêm quỹ'} onClose={onClose} size="sm"
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => { if (await run('save_fund', { id: f.id || null, name: f.name, opening_balance: f.opening_balance, active: f.active }, 'Đã lưu quỹ')) onClose(); }}>Lưu</Btn></>}>
      <Field label="Tên quỹ"><Input value={f.name} onChange={(v) => setF((s) => ({ ...s, name: v }))} placeholder="vd. Tiền mặt, Vietcombank, Ví TikTok" /></Field>
      <Field label="Số dư đầu kỳ"><NumInput value={f.opening_balance} onChange={(v) => setF((s) => ({ ...s, opening_balance: v || 0 }))} /></Field>
      {fund.id && <Check checked={f.active} onChange={(v) => setF((s) => ({ ...s, active: v }))}>Đang dùng</Check>}
    </Modal>
  );
}

// Nhập bản sao lưu JSON (từ bản Supabase cũ hoặc máy chủ khác) vào sổ đang mở — chỉ cho sổ chưa có chứng từ
function RestoreBackup() {
  const { rpc, book, toast, loadBooks, refresh } = useApp();
  const [file, setFile] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState(null);
  const pick = async (e) => {
    setErr(''); setRes(null); setFile(null);
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.format !== 'gomsu-backup-v1' || !Array.isArray(data.books)) throw new Error('Tệp không phải bản sao lưu JSON của Sổ bán hàng gốm');
      setFile({ name: f.name, data });
    } catch (e2) { setErr(e2.message.startsWith('Tệp') ? e2.message : 'Không đọc được tệp JSON: ' + e2.message); }
  };
  const doImport = async () => {
    setBusy(true); setErr('');
    try {
      const r = await rpc('import_book', { data: file.data });
      setRes(r); setFile(null); await loadBooks(); refresh(); toast('Đã nhập dữ liệu vào sổ');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const n = (t) => (file?.data?.[t] || []).length;
  return (
    <Section title="Nhập bản sao lưu JSON (chuyển dữ liệu từ bản cũ)">
      <div className="muted small">Dùng tệp <b>“Tải bản sao lưu JSON”</b> của bản cũ (Supabase) hoặc của máy chủ khác. Dữ liệu được nhập vào sổ đang mở “{book.name}”, sổ này phải <b>chưa có chứng từ</b> (đơn, phiếu thu chi, phiếu kho…). Mỗi sổ nhập một tệp riêng: chọn sổ Thanh Hải → nhập tệp của Thanh Hải, rồi chuyển sang Vũ Gia → nhập tệp của Vũ Gia. Máy chủ tự sao lưu trước khi nhập.</div>
      <div className="row gap"><label className="btn btn-ghost"><Icon name="up" /><span>Chọn tệp .json</span><input type="file" accept=".json,application/json" onChange={pick} hidden /></label></div>
      <ErrorBox error={err} />
      {file && <Note>
        Tệp <b>{file.name}</b>: sổ “{file.data.books[0]?.name}” · {n('products')} sản phẩm · {n('customers')} khách · {n('suppliers')} NCC · {n('sales_orders')} đơn bán · {n('purchase_orders')} đơn nhập · {n('payments')} phiếu thu chi · {n('stock_moves')} dòng sổ kho.
        <div className="row gap" style={{ marginTop: 8 }}>
          <ConfirmBtn kind="primary" busy={busy} onConfirm={doImport}>Nhập vào sổ “{book.name}”</ConfirmBtn>
          <Btn onClick={() => setFile(null)}>Thôi</Btn>
        </div>
      </Note>}
      {res && <Note tone={res.stock_mismatch.length ? 'warn' : 'good'}>
        Đã nhập sổ “{res.book_name}”: {Object.entries(res.counts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ')}.
        {res.stock_mismatch.length ? <div>Tồn kho chưa khớp sổ kho ở các mã: {res.stock_mismatch.join(', ')}.</div> : <div>Tồn kho từng mã khớp sổ kho.</div>}
        {res.staff_to_readd.length > 0 && <div>Tài khoản nhân viên không chuyển theo tệp — hãy thêm lại trong <b>Người dùng &amp; quyền</b>: {res.staff_to_readd.join(', ')}.</div>}
      </Note>}
    </Section>
  );
}

function ImportTools() {
  const { open } = useApp();
  return (
    <div className="stack-l" style={{ maxWidth: 860 }}>
      <Section title="Nhập dữ liệu từ Excel (làm một lần khi bắt đầu)">
        <div className="muted small">Mỗi lần nhập đều có bước xem trước, báo lỗi từng dòng và bảng đối chiếu trước/sau. Tệp gốc của bạn không bị sửa. Nhập lại cùng tệp sẽ không nhân đôi hàng (SKU đã có chỉ cập nhật thông tin, không cộng thêm tồn).</div>
        <div className="row gap">
          <Btn icon="up" onClick={() => open('import', { kind: 'products' })}>Hàng hóa + tồn đầu kỳ</Btn>
          <Btn icon="up" onClick={() => open('import', { kind: 'kh' })}>Khách hàng + nợ đầu kỳ</Btn>
          <Btn icon="up" onClick={() => open('import', { kind: 'ncc' })}>Nhà cung cấp + nợ đầu kỳ</Btn>
        </div>
      </Section>
    </div>
  );
}

function DataTools() {
  const { rpc, book, toast } = useApp();
  const [busy, setBusy] = useState('');
  const backup = async (fmt) => {
    setBusy(fmt);
    try {
      const data = await rpc('export_book', {});
      const stamp = todayVN();
      const base = `sao-luu_${book.short_name || 'so'}_${stamp}`;
      if (fmt === 'json') await saveFile(base + '.json', new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      else {
        const sheets = Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([name, rows]) => {
          const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
          return { name, rows: rows.map((r) => Object.fromEntries(cols.map((c) => [c, typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c]]))), columns: cols.map((c) => ({ key: c, label: c })) };
        });
        await exportXlsx(base + '.xlsx', sheets);
      }
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  return (
    <div className="stack-l" style={{ maxWidth: 860 }}>
      <Section title="Sao lưu">
        <div className="muted small">Tải toàn bộ dữ liệu của sổ “{book.name}” (mọi chứng từ, sổ kho, phiếu thu chi). Nên tải mỗi tháng và cất ở nơi khác ngoài máy tính (Google Drive, USB). Máy chủ còn tự sao lưu cơ sở dữ liệu mỗi đêm (giữ 14 bản gần nhất).</div>
        <div className="row gap">
          <Btn icon="dl" busy={busy === 'xlsx'} onClick={() => backup('xlsx')}>Tải bản sao lưu Excel</Btn>
          <Btn icon="dl" busy={busy === 'json'} onClick={() => backup('json')}>Tải bản sao lưu JSON (khôi phục được)</Btn>
        </div>
      </Section>
      <RestoreBackup />
      {book.is_demo && <Note tone="warn">Đây là sổ DỮ LIỆU MẪU. Dữ liệu mẫu nằm ở cơ sở dữ liệu riêng, không lẫn với sổ thật. Sổ thật được tạo trống khi máy chủ chạy ở chế độ thường.</Note>}
    </div>
  );
}

const TABLE_LABEL = { sales_orders: 'Đơn bán', sales_order_lines: 'Dòng đơn bán', deliveries: 'Phiếu giao', delivery_lines: 'Dòng phiếu giao', sales_returns: 'Phiếu khách trả',
  purchase_orders: 'Đơn nhập', purchase_order_lines: 'Dòng đơn nhập', goods_receipts: 'Phiếu nhận hàng', supplier_returns: 'Phiếu trả NCC', products: 'Sản phẩm', customers: 'Khách hàng',
  suppliers: 'Nhà cung cấp', payments: 'Phiếu thu/chi', payment_allocations: 'Phiếu thu chi theo chứng từ', expenses: 'Chi phí', stock_adjustments: 'Điều chỉnh kho', stock_adjustment_lines: 'Dòng điều chỉnh',
  funds: 'Quỹ', opening_debts: 'Nợ đầu kỳ', books: 'Cài đặt sổ', book_members: 'Người dùng', kit_items: 'Thành phần bộ', goods_receipt_lines: 'Dòng nhận hàng', supplier_return_lines: 'Dòng trả NCC', sales_return_lines: 'Dòng khách trả' };
const OP = { INSERT: ['Thêm', 'good'], UPDATE: ['Sửa', 'warn'], DELETE: ['Xóa', 'bad'] };

function AuditLog() {
  const [table, setTable] = useState('');
  const q = useQ('audit', table ? [['table_name', 'eq', table]] : [], 'at desc', 300);
  const [sel, setSel] = useState(null);
  return (
    <div className="stack">
      <div className="row gap"><Select value={table} onChange={setTable} placeholder="Mọi loại dữ liệu" options={Object.entries(TABLE_LABEL).map(([value, label]) => ({ value, label }))} style={{ maxWidth: 240 }} />
        <span className="muted small">300 thay đổi gần nhất. Nhật ký không sửa, không xóa được.</span></div>
      <ErrorBox error={q.error} />
      <Table dense rows={q.data} onRow={setSel} columns={[
        { key: 't', label: 'Lúc', render: (a) => dmyhm(a.at) },
        { key: 'u', label: 'Người làm', render: (a) => a.user_name || <span className="muted">hệ thống</span> },
        { key: 'o', label: 'Thao tác', render: (a) => { const [l, t] = OP[a.op] || [a.op, 'neutral']; return <Pill tone={t}>{l}</Pill>; } },
        { key: 'b', label: 'Dữ liệu', render: (a) => TABLE_LABEL[a.table_name] || a.table_name },
        { key: 'c', label: 'Mã', render: (a) => a.doc_code || '' },
        { key: 'd', label: 'Thay đổi', render: (a) => <span className="small muted">{changedKeys(a).slice(0, 5).join(', ')}</span> },
      ]} />
      {sel && <Modal title={`${(OP[sel.op] || [sel.op])[0]} ${TABLE_LABEL[sel.table_name] || sel.table_name} ${sel.doc_code || ''}`} subtitle={`${dmyhm(sel.at)} · ${sel.user_name || 'hệ thống'}`} onClose={() => setSel(null)} size="lg">
        <div className="diff">{changedKeys(sel).map((k) => <div key={k}><b>{k}</b>: {sel.op !== 'INSERT' && <span className="old">{fmtVal(sel.old_data?.[k])}</span>}{sel.op === 'UPDATE' && ' → '}{sel.op !== 'DELETE' && <span className="new">{fmtVal(sel.new_data?.[k])}</span>}</div>)}</div>
      </Modal>}
    </div>
  );
}
const HIDE = new Set(['id', 'book_id', 'created_at', 'created_by', 'updated_at']);
function changedKeys(a) {
  const o = a.old_data || {}; const n = a.new_data || {};
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !HIDE.has(k));
  return a.op === 'UPDATE' ? keys.filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k])) : keys.filter((k) => (a.op === 'INSERT' ? n[k] : o[k]) !== null && (a.op === 'INSERT' ? n[k] : o[k]) !== '');
}
function fmtVal(v) { if (v === null || v === undefined) return '∅'; if (typeof v === 'object') return JSON.stringify(v); const s = String(v); return s.length > 120 ? s.slice(0, 120) + '…' : s; }

