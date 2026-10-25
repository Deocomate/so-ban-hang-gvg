import { DocTemplateSettings } from './Documents.jsx';
import React, { useEffect, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, dmy, dmyhm, todayVN, pct } from '../lib/format.js';
import { exportXlsx, saveFile } from '../lib/excel.js';
import { BankSettings, NotifySettings, CarrierSettings } from './SettingsExtra.jsx';
import { cats as expCats } from '../lib/expenseCats.js';
import { Btn, Icon, Pill, Field, Input, Select, DateInput, NumInput, Check, Tabs, Loading, ErrorBox, Note, Table, Modal, ConfirmBtn, Section, KV } from '../components/ui.jsx';

export const PERMS = [
  ['ban_hang', 'Bán hàng (tạo đơn, giao hàng, trả hàng)'], ['thu_chi', 'Thu chi tiền'], ['nhap_hang', 'Nhập hàng / đặt xưởng'], ['kho', 'Điều chỉnh kho (vỡ, kiểm kê)'],
  ['danh_muc', 'Sửa sản phẩm, khách hàng, NCC'], ['chi_phi', 'Ghi chi phí'], ['xem_gia_von', 'Xem giá vốn và lợi nhuận'], ['xem_bao_cao', 'Xem tổng quan và báo cáo'],
];

export function SettingsPage() {
  const { can, book } = useApp();
  const owner = can('owner');
  const [tab, setTab] = useState(owner ? 'book' : 'notify');
  useEffect(() => { const h = (e) => setTab(e.detail); window.addEventListener('settings-tab', h); return () => window.removeEventListener('settings-tab', h); }, []);
  return (
    <>
      <div className="page-head"><div className="grow"><h1 className="page-title">Cài đặt</h1><div className="page-sub">Sổ đang mở: <b>{book?.name}</b>. Mỗi thương hiệu là một sổ riêng: hàng hóa, khách, quỹ tiền và báo cáo không lẫn vào nhau.</div></div></div>
      <Tabs value={tab} onChange={setTab} tabs={owner ? [
        { value: 'book', label: 'Thông tin sổ' }, { value: 'lists', label: 'Danh sách chọn' }, { value: 'funds', label: 'Quỹ tiền' }, { value: 'users', label: 'Người dùng & quyền' },
        { value: 'bank', label: 'Tài khoản nhận tiền' }, { value: 'docs', label: 'Mẫu chứng từ' }, { value: 'carriers', label: 'Đơn vị vận chuyển' }, { value: 'notify', label: 'Thông báo điện thoại' },
        { value: 'data', label: 'Nhập / sao lưu dữ liệu' }, { value: 'audit', label: 'Nhật ký thay đổi' }, { value: 'me', label: 'Tài khoản' },
      ] : [{ value: 'notify', label: 'Thông báo điện thoại' }, { value: 'me', label: 'Tài khoản' }]} />
      {tab === 'bank' && <BankSettings />}
      {tab === 'docs' && <DocTemplateSettings />}
      {tab === 'notify' && <NotifySettings />}
      {tab === 'carriers' && <CarrierSettings />}
      {tab === 'book' && <BookSettings />}
      {tab === 'lists' && <ListSettings />}
      {tab === 'funds' && <Funds />}
      {tab === 'users' && <Members />}
      {tab === 'data' && <DataTools />}
      {tab === 'audit' && <AuditLog />}
      {tab === 'me' && <Me />}
    </>
  );
}

function useSaveSettings() {
  const { rpc, loadBooks, toast, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const save = async (settings, name) => {
    setBusy(true);
    try { await rpc('update_book_settings', { settings, name }); await loadBooks(); refresh(); toast('Đã lưu cài đặt'); return true; }
    catch (e) { toast(e.message, 'err'); return false; } finally { setBusy(false); }
  };
  return { save, busy };
}

function BookSettings() {
  const { book, settings } = useApp();
  const { save, busy } = useSaveSettings();
  const [f, setF] = useState(null);
  useEffect(() => { setF({ name: book.name, vat: (settings.vat_rate || 0) * 100, pit: (settings.pit_rate || 0) * 100, price_names: [...(settings.price_names || ['', '', ''])],
    allow_oversell: !!settings.allow_oversell, lock_date: settings.lock_date || '', due_warn_days: settings.due_warn_days ?? 3, fee_category: settings.fee_category || 'Phí sàn TMĐT', shop_phone: settings.shop_phone || '', shop_address: settings.shop_address || '', slip_note: settings.slip_note || '' }); }, [book.id]);
  if (!f) return <Loading />;
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="stack-l" style={{ maxWidth: 820 }}>
      <Section title="Sổ và thuế">
        <div className="grid">
          <Field label="Tên sổ (thương hiệu)" wide><Input value={f.name} onChange={(v) => set('name', v)} /></Field>
          <Field label="Thuế GTGT (% trên doanh thu)" hint="Hộ kinh doanh bán hàng hóa: 1%"><NumInput money={false} value={f.vat} onChange={(v) => set('vat', v)} /></Field>
          <Field label="Thuế TNCN (% trên lợi nhuận)" hint="Hộ doanh thu trên 3 tỷ: 17%"><NumInput money={false} value={f.pit} onChange={(v) => set('pit', v)} /></Field>
        </div>
        <Note>Thuế ở đây chỉ để ước tính lãi lỗ hằng tháng, không thay tờ khai. Quy định thuế hộ kinh doanh có thể thay đổi — nên đối chiếu với cán bộ thuế hoặc kế toán.</Note>
      </Section>
      <Section title="In trên phiếu">
        <div className="grid">
          <Field label="Điện thoại cửa hàng"><Input value={f.shop_phone} onChange={(v) => set('shop_phone', v)} /></Field>
          <Field label="Địa chỉ cửa hàng" wide><Input value={f.shop_address} onChange={(v) => set('shop_address', v)} /></Field>
          <Field label="Lời nhắn cuối phiếu" wide><Input value={f.slip_note} onChange={(v) => set('slip_note', v)} placeholder="vd. Số TK: … · Cảm ơn quý khách" /></Field>
        </div>
      </Section>
      <Section title="3 mức giá bán">
        <div className="grid">{[0, 1, 2].map((i) => <Field key={i} label={`Mức giá ${i + 1}`}><Input value={f.price_names[i]} onChange={(v) => set('price_names', f.price_names.map((x, j) => (j === i ? v : x)))} /></Field>)}</div>
        <div className="muted small">Mỗi khách hàng gắn với 1 mức giá; khi tạo đơn, giá tự điền theo mức của khách (vẫn sửa được từng dòng).</div>
      </Section>
      <Section title="Quy tắc">
        <Check checked={f.allow_oversell} onChange={(v) => set('allow_oversell', v)}>Cho phép giao vượt số tồn kho (mặc định: chặn)</Check>
        <div className="grid">
          <Field label="Khóa sổ đến hết ngày" hint="Không ai sửa / thêm chứng từ có ngày ≤ ngày này (dùng sau khi chốt sổ tháng)"><DateInput value={f.lock_date} onChange={(v) => set('lock_date', v)} max={todayVN()} /></Field>
          <Field label="Nhắc trước hạn (ngày)"><NumInput money={false} value={f.due_warn_days} onChange={(v) => set('due_warn_days', v)} /></Field>
          <Field label="Nhóm chi phí cho phí sàn"><Input value={f.fee_category} onChange={(v) => set('fee_category', v)} /></Field>
        </div>
      </Section>
      <div><Btn kind="primary" busy={busy} onClick={() => save({ vat_rate: Number(f.vat || 0) / 100, pit_rate: Number(f.pit || 0) / 100, price_names: f.price_names.map((x) => x.trim()),
        allow_oversell: f.allow_oversell, lock_date: f.lock_date || null, due_warn_days: Number(f.due_warn_days || 0), fee_category: f.fee_category, shop_phone: f.shop_phone, shop_address: f.shop_address, slip_note: f.slip_note }, f.name)}>Lưu cài đặt</Btn></div>
    </div>
  );
}

function TagEditor({ label, hint, values, onChange }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !values.includes(t)) onChange([...values, t]); setV(''); };
  const move = (i, d) => { const a = [...values]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <Section title={label}>
      {hint && <div className="muted small">{hint}</div>}
      <div className="taglist">
        {values.map((x, i) => <span className="tag" key={x}>{x}<button title="Lên" onClick={() => move(i, -1)}>‹</button><button title="Xuống" onClick={() => move(i, 1)}>›</button><button title="Bỏ" onClick={() => onChange(values.filter((y) => y !== x))}>×</button></span>)}
        <Input value={v} onChange={setV} placeholder="Thêm…" style={{ maxWidth: 200 }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Btn small icon="plus" onClick={add}>Thêm</Btn>
      </div>
    </Section>
  );
}

function ListSettings() {
  const { settings, book } = useApp();
  const { save, busy } = useSaveSettings();
  const keys = ['channels', 'categories', 'units', 'prod_steps'];
  const [f, setF] = useState(null);
  useEffect(() => { setF({ ...Object.fromEntries(keys.map((k) => [k, [...(settings[k] || [])]])), expense_cats: JSON.parse(JSON.stringify(expCats(settings))) }); }, [book.id]);
  if (!f) return <Loading />;
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <div className="stack-l" style={{ maxWidth: 860 }}>
      <TagEditor label="Kênh bán" values={f.channels} onChange={set('channels')} hint="Hiện ở ô “Kênh” khi tạo đơn; báo cáo doanh thu tách theo kênh." />
      <TagEditor label="Chủng loại hàng" values={f.categories} onChange={set('categories')} />
      <TagEditor label="Đơn vị tính" values={f.units} onChange={set('units')} />
      <Section title="Danh mục chi phí (nhóm → khoản mục)">
        <div className="muted small">Khi ghi chi phí, chọn nhóm rồi chọn khoản mục. Đổi tên khoản mục không làm đổi các khoản đã ghi trước đó.</div>
        {f.expense_cats.map((g, gi) => (
          <div className="cat-group" key={gi}>
            <div className="row gap"><Input value={g.group} onChange={(v) => setF((s) => ({ ...s, expense_cats: s.expense_cats.map((x, j) => (j === gi ? { ...x, group: v } : x)) }))} style={{ maxWidth: 260, fontWeight: 600 }} aria-label="Tên nhóm" />
              <span className="grow" />{f.expense_cats.length > 1 && <Btn small onClick={() => setF((s) => ({ ...s, expense_cats: s.expense_cats.filter((_, j) => j !== gi) }))}>Bỏ nhóm</Btn>}</div>
            <TagEditorInline values={g.items} onChange={(v) => setF((s) => ({ ...s, expense_cats: s.expense_cats.map((x, j) => (j === gi ? { ...x, items: v } : x)) }))} />
          </div>))}
        <div><Btn small icon="plus" onClick={() => setF((s) => ({ ...s, expense_cats: [...s.expense_cats, { group: 'Nhóm mới', items: [] }] }))}>Thêm nhóm</Btn></div>
      </Section>
      <TagEditor label="Các bước sản xuất (đơn đặt xưởng)" values={f.prod_steps} onChange={set('prod_steps')}
        hint="Theo thứ tự. Trạng thái “Đã nhận một phần / Đã nhận đủ” do phần mềm tự cập nhật khi nhận hàng, không cần thêm ở đây." />
      <div><Btn kind="primary" busy={busy} onClick={() => {
        const ec = f.expense_cats.map((g) => ({ group: g.group.trim(), items: g.items })).filter((g) => g.group);
        save({ ...f, expense_cats: ec, expense_groups: ec.map((g) => g.group) });
      }}>Lưu danh sách</Btn></div>
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

function Members() {
  const { session } = useApp();
  const q = useQ('members', [], 'created_at', 100);
  const [edit, setEdit] = useState(null);
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      <Note>Nhân viên cần tự đăng ký tài khoản bằng email trước, sau đó chủ cửa hàng thêm email đó vào đây và chọn quyền. Quyền đặt riêng cho từng sổ. Không có quyền “Xem giá vốn” thì không thấy giá vốn, lợi nhuận, giá trị tồn kho.</Note>
      <ErrorBox error={q.error} />
      <Table rowKey="user_id" rows={q.data} onRow={(m) => setEdit(m)} columns={[
        { key: 'n', label: 'Người dùng', render: (m) => <><b>{m.display_name || m.email}</b><div className="cell-sub">{m.email}</div></> },
        { key: 'r', label: 'Vai trò', render: (m) => <Pill tone={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role === 'owner' ? 'Chủ (toàn quyền)' : 'Nhân viên'}</Pill> },
        { key: 'p', label: 'Quyền', render: (m) => (m.role === 'owner' ? <span className="muted small">Tất cả</span> : <span className="small">{PERMS.filter(([k]) => m.perms?.[k]).map(([, l]) => l.split(' (')[0]).join(', ') || '—'}</span>) },
      ]} />
      <div><Btn icon="plus" onClick={() => setEdit({ role: 'staff', perms: null })}>Thêm người dùng</Btn></div>
      {edit && <MemberForm m={edit} self={edit.user_id && edit.user_id === session?.user?.id} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MemberForm({ m, self, onClose }) {
  const { settings, rpc, refresh, toast } = useApp();
  const { run, busy } = useAction();
  const [f, setF] = useState({ email: m.email || '', display_name: m.display_name || '', role: m.role || 'staff', perms: m.perms || settings.staff_default_perms || {} });
  return (
    <Modal title={m.user_id ? `Quyền của ${m.display_name || m.email}` : 'Thêm người dùng'} onClose={onClose} size="md"
      footer={<>{m.user_id && !self && <ConfirmBtn kind="danger" icon="x" onConfirm={async () => { try { await rpc('remove_member', { user_id: m.user_id }); refresh(); toast('Đã gỡ khỏi sổ'); onClose(); } catch (e) { toast(e.message, 'err'); } }}>Gỡ khỏi sổ</ConfirmBtn>}
        <span className="grow" /><Btn onClick={onClose}>Thôi</Btn>
        <Btn kind="primary" busy={busy} onClick={async () => { if (await run('upsert_member', f, 'Đã lưu quyền')) onClose(); }}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Email đăng nhập" wide><Input value={f.email} onChange={(v) => setF((s) => ({ ...s, email: v }))} disabled={!!m.user_id} type="email" /></Field>
        <Field label="Tên hiển thị"><Input value={f.display_name} onChange={(v) => setF((s) => ({ ...s, display_name: v }))} /></Field>
        <Field label="Vai trò"><Select value={f.role} onChange={(v) => setF((s) => ({ ...s, role: v }))} disabled={self} options={[{ value: 'staff', label: 'Nhân viên' }, { value: 'owner', label: 'Chủ (toàn quyền)' }]} /></Field>
      </div>
      {f.role === 'staff' && <div className="perm-grid">{PERMS.map(([k, l]) => <Check key={k} checked={!!f.perms[k]} onChange={(v) => setF((s) => ({ ...s, perms: { ...s.perms, [k]: v } }))}>{l}</Check>)}</div>}
      {m.user_id && m.role === 'staff' && !self && <ResetMemberPassword userId={m.user_id} />}
    </Modal>
  );
}

// Nhân viên quên mật khẩu: chủ sổ đặt mật khẩu mới rồi báo lại cho nhân viên
function ResetMemberPassword({ userId }) {
  const { rpc, toast } = useApp();
  const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await rpc('set_member_password', { user_id: userId, password: pw }); setPw(''); toast('Đã đặt mật khẩu mới — báo lại cho nhân viên'); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Section title="Nhân viên quên mật khẩu">
      <div className="row gap">
        <Input type="text" value={pw} onChange={setPw} placeholder="Mật khẩu mới (ít nhất 6 ký tự)" autoComplete="off" style={{ maxWidth: 280 }} />
        <Btn busy={busy} disabled={pw.length < 6} onClick={save}>Đặt mật khẩu mới</Btn>
      </div>
    </Section>
  );
}

function DataTools() {
  const { open, rpc, book, toast } = useApp();
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
      <Section title="Nhập dữ liệu từ Excel (làm một lần khi bắt đầu)">
        <div className="muted small">Mỗi lần nhập đều có bước xem trước, báo lỗi từng dòng và bảng đối chiếu trước/sau. Tệp gốc của bạn không bị sửa. Nhập lại cùng tệp sẽ không nhân đôi hàng (SKU đã có chỉ cập nhật thông tin, không cộng thêm tồn).</div>
        <div className="row gap">
          <Btn icon="up" onClick={() => open('import', { kind: 'products' })}>Hàng hóa + tồn đầu kỳ</Btn>
          <Btn icon="up" onClick={() => open('import', { kind: 'kh' })}>Khách hàng + nợ đầu kỳ</Btn>
          <Btn icon="up" onClick={() => open('import', { kind: 'ncc' })}>Nhà cung cấp + nợ đầu kỳ</Btn>
        </div>
      </Section>
      <Section title="Sao lưu">
        <div className="muted small">Tải toàn bộ dữ liệu của sổ “{book.name}” (mọi chứng từ, sổ kho, phiếu thu chi). Nên tải mỗi tháng và cất ở nơi khác ngoài máy tính (Google Drive, USB). Máy chủ còn tự sao lưu cơ sở dữ liệu mỗi đêm (giữ 14 bản gần nhất).</div>
        <div className="row gap">
          <Btn icon="dl" busy={busy === 'xlsx'} onClick={() => backup('xlsx')}>Tải bản sao lưu Excel</Btn>
          <Btn icon="dl" busy={busy === 'json'} onClick={() => backup('json')}>Tải bản sao lưu JSON (khôi phục được)</Btn>
        </div>
      </Section>
      {book.is_demo && <Note tone="warn">Đây là sổ DỮ LIỆU MẪU. Dữ liệu mẫu nằm ở cơ sở dữ liệu riêng, không lẫn với sổ thật. Sổ thật được tạo trống khi máy chủ chạy ở chế độ thường.</Note>}
    </div>
  );
}

const TABLE_LABEL = { sales_orders: 'Đơn bán', sales_order_lines: 'Dòng đơn bán', deliveries: 'Phiếu giao', delivery_lines: 'Dòng phiếu giao', sales_returns: 'Phiếu khách trả',
  purchase_orders: 'Đơn nhập', purchase_order_lines: 'Dòng đơn nhập', goods_receipts: 'Phiếu nhận hàng', supplier_returns: 'Phiếu trả NCC', products: 'Sản phẩm', customers: 'Khách hàng',
  suppliers: 'Nhà cung cấp', payments: 'Phiếu thu/chi', payment_allocations: 'Gắn phiếu', expenses: 'Chi phí', stock_adjustments: 'Điều chỉnh kho', stock_adjustment_lines: 'Dòng điều chỉnh',
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

function Me() {
  const { session, book, backend, toast } = useApp();
  const [oldPw, setOldPw] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  const changePw = async () => {
    setBusy(true);
    try { await backend.changePassword(oldPw, pw); setOldPw(''); setPw(''); toast('Đã đổi mật khẩu. Các máy khác đang đăng nhập tài khoản này sẽ phải đăng nhập lại.'); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <KV items={[['Email', session?.user?.email || '—'], ['Tên', book?.display_name || '—'], ['Vai trò trong sổ này', book?.role === 'owner' ? 'Chủ (toàn quyền)' : 'Nhân viên'],
        book?.role !== 'owner' && ['Quyền được cấp', PERMS.filter(([k]) => book?.perms?.[k]).map(([, l]) => l).join('; ') || '—']]} />
      <Section title="Đổi mật khẩu">
        <div className="grid">
          <Field label="Mật khẩu hiện tại"><Input type="password" value={oldPw} onChange={setOldPw} autoComplete="current-password" /></Field>
          <Field label="Mật khẩu mới"><Input type="password" value={pw} onChange={setPw} autoComplete="new-password" placeholder="Ít nhất 6 ký tự" /></Field>
        </div>
        <div><Btn busy={busy} disabled={!oldPw || pw.length < 6} onClick={changePw}>Đổi mật khẩu</Btn></div>
      </Section>
      <div><Btn icon="out" onClick={() => backend.signOut()}>Đăng xuất</Btn></div>
    </div>
  );
}
