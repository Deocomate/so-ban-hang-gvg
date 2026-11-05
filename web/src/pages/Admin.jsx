// Tổng quản trị: người dùng & quyền theo từng sổ, vai trò mẫu, nhật ký bảo mật.
import React, { useMemo, useState } from 'react';
import { useApp, useRpcData } from '../lib/store.jsx';
import { dmyhm } from '../lib/format.js';
import { Btn, Pill, Field, Input, Select, Check, Loading, ErrorBox, Note, Table, Modal, ConfirmBtn, Section } from '../components/ui.jsx';

const STATUS = { invited: ['Đã mời, chưa kích hoạt', 'warn'], active: ['Đang dùng', 'good'], disabled: ['Đã khóa', 'bad'] };
const ACCESS = [{ value: 'none', label: 'Không truy cập' }, { value: 'staff', label: 'Nhân viên (theo quyền)' }, { value: 'owner', label: 'Quản lý sổ (toàn quyền)' }];

// Quyền sửa kéo theo quyền xem cùng nhóm: ban_hang → xem_ban_hang (giống máy chủ)
const viewOf = (k, keys) => (keys.includes('xem_' + k) ? 'xem_' + k : null);
function effective(rolePerms, overrides, keys) {
  const m = { ...(rolePerms || {}), ...(overrides || {}) };
  const out = {};
  for (const k of keys) if (m[k] === true) { out[k] = true; const v = viewOf(k, keys); if (v) out[v] = true; }
  return out;
}

function useOverview() {
  const r = useRpcData('admin_overview', {});
  const keys = useMemo(() => (r.data?.perm_groups || []).flatMap((g) => g.perms.map(([k]) => k)), [r.data]);
  return { ...r, keys };
}

// Ô tick quyền theo nhóm. checked: quyền hiệu lực; locked: quyền xem đã có do quyền sửa cùng nhóm
function PermGrid({ groups, checked, locked = {}, onToggle }) {
  return (
    <div className="stack">
      {groups.map((g) => (
        <div key={g.group}>
          <div className="small muted"><b>{g.group}</b></div>
          <div className="perm-grid">{g.perms.map(([k, l]) => <Check key={k} checked={!!checked[k]} onChange={(v) => !locked[k] && onToggle(k, v)}>{l}{locked[k] ? ' (kèm quyền sửa)' : ''}</Check>)}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- NGƯỜI DÙNG ----------
export function AdminUsers() {
  const ov = useOverview();
  const [edit, setEdit] = useState(null);
  if (ov.loading && !ov.data) return <Loading />;
  if (ov.error) return <ErrorBox error={ov.error} />;
  const { users, books, roles } = ov.data;
  const roleName = (id) => roles.find((r) => r.id === id)?.name;
  const summary = (u) => (u.is_admin ? 'Tổng quản trị (Quản lý cả 3 sổ)' : books.map((b) => {
    const m = u.books[b.id]; if (!m) return null;
    return `${b.short_name}: ${m.access === 'owner' ? 'Quản lý sổ' : roleName(m.role_id) || 'Nhân viên (tùy chỉnh)'}`;
  }).filter(Boolean).join(' · ') || 'Chưa được vào sổ nào');
  return (
    <div className="stack" style={{ maxWidth: 1000 }}>
      <Note>Chỉ <b>Tổng quản trị</b> thấy mục này. Mời nhân viên bằng email: hệ thống gửi thư mời, nhân viên bấm link để tự đặt mật khẩu (không ai khác biết mật khẩu đó). Quyền đặt riêng cho từng sổ; chọn <b>vai trò mẫu</b> rồi tick thêm / bỏ từng ô nếu cần.</Note>
      <Table rows={users} onRow={(u) => setEdit(u)} columns={[
        { key: 'n', label: 'Người dùng', render: (u) => <><b>{u.name || u.email}</b><div className="cell-sub">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div></> },
        { key: 's', label: 'Trạng thái', render: (u) => <><Pill tone={STATUS[u.status][1]}>{STATUS[u.status][0]}</Pill>{u.status === 'active' && !u.email_verified_at && <div className="cell-sub">email chưa xác thực</div>}</> },
        { key: 'p', label: 'Quyền', render: (u) => <span className="small">{summary(u)}</span> },
        { key: 'l', label: 'Đăng nhập gần nhất', render: (u) => <span className="small muted">{u.last_login_at ? dmyhm(u.last_login_at) : '—'}</span> },
      ]} />
      <div><Btn kind="primary" icon="plus" onClick={() => setEdit({ books: {} })}>Mời người dùng</Btn></div>
      {edit && <UserForm u={edit} ov={ov} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UserForm({ u, ov, onClose }) {
  const { rpc, refresh, toast, loadBooks, backend } = useApp();
  const { books, roles, perm_groups: groups, me } = ov.data; const keys = ov.keys;
  const isNew = !u.id; const self = u.id === me;
  const [f, setF] = useState(() => ({ email: u.email || '', name: u.name || '', phone: u.phone || '', is_admin: !!u.is_admin,
    books: Object.fromEntries(books.map((b) => [b.id, u.books[b.id] ? { ...u.books[b.id] } : { access: 'none', role_id: null, perms: {} }])) }));
  const [busy, setBusy] = useState('');
  const setBook = (id, patch) => setF((s) => ({ ...s, books: { ...s.books, [id]: { ...s.books[id], ...patch } } }));
  const rolePerms = (id) => roles.find((r) => r.id === id)?.perms || {};
  const call = async (key, fn, p, ok, close = true) => {
    setBusy(key);
    try { await rpc(fn, p); toast(ok); refresh(); if (self) { await backend.refreshMe(); await loadBooks(); } if (close) onClose(); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(''); }
  };
  const save = () => call('save', 'admin_save_user', { id: u.id || null, email: f.email, name: f.name, phone: f.phone, is_admin: f.is_admin,
    books: Object.fromEntries(Object.entries(f.books).map(([id, m]) => [id, { access: m.access, role_id: m.role_id || null, perms: m.perms || {}, display_name: m.display_name }])) },
    isNew ? `Đã gửi thư mời tới ${f.email}` : 'Đã lưu quyền');
  return (
    <Modal title={isNew ? 'Mời người dùng' : `${u.name || u.email}`} subtitle={isNew ? 'Thư mời có link đặt mật khẩu, hạn 7 ngày' : u.email} onClose={onClose} size="lg"
      footer={<>
        {!isNew && !self && <>
          {u.status === 'invited' && <Btn busy={busy === 'inv'} onClick={() => call('inv', 'admin_resend_invite', { user_id: u.id }, 'Đã gửi lại thư mời', false)}>Gửi lại lời mời</Btn>}
          {u.status === 'active' && <Btn busy={busy === 'rs'} onClick={() => call('rs', 'admin_send_reset', { user_id: u.id }, 'Đã gửi email đặt lại mật khẩu', false)}>Gửi email đặt lại mật khẩu</Btn>}
          {u.status === 'active' && <ConfirmBtn busy={busy === 'out'} onConfirm={() => call('out', 'admin_logout_user', { user_id: u.id }, 'Đã đăng xuất người này khỏi mọi thiết bị', false)}>Đăng xuất mọi thiết bị</ConfirmBtn>}
          <ConfirmBtn kind={u.status === 'disabled' ? 'ghost' : 'danger'} busy={busy === 'st'} onConfirm={() => call('st', 'admin_set_status', { user_id: u.id, disabled: u.status !== 'disabled' }, u.status === 'disabled' ? 'Đã mở khóa' : 'Đã khóa tài khoản')}>
            {u.status === 'disabled' ? 'Mở khóa' : 'Khóa tài khoản'}</ConfirmBtn>
        </>}
        <span className="grow" /><Btn onClick={onClose}>Thôi</Btn>
        <Btn kind="primary" busy={busy === 'save'} onClick={save}>{isNew ? 'Gửi lời mời' : 'Lưu'}</Btn></>}>
      <div className="grid">
        <Field label="Email" required><Input type="email" value={f.email} onChange={(v) => setF((s) => ({ ...s, email: v }))} disabled={!isNew} /></Field>
        <Field label="Tên"><Input value={f.name} onChange={(v) => setF((s) => ({ ...s, name: v }))} /></Field>
        <Field label="Số điện thoại"><Input value={f.phone} onChange={(v) => setF((s) => ({ ...s, phone: v }))} /></Field>
      </div>
      <Check checked={f.is_admin} onChange={(v) => !self && setF((s) => ({ ...s, is_admin: v }))}>
        <b>Tổng quản trị</b> — quản lý người dùng, vai trò, nhật ký bảo mật; toàn quyền ở cả 3 sổ{self ? ' (không tự bỏ được)' : ''}
      </Check>
      {!f.is_admin && books.map((b) => {
        const m = f.books[b.id]; const rp = rolePerms(m.role_id);
        const eff = effective(rp, m.perms, keys);
        const locked = Object.fromEntries(keys.filter((k) => viewOf(k, keys) && eff[k]).map((k) => [viewOf(k, keys), true]));
        const toggle = (k, v) => {
          const next = { ...(m.perms || {}) };
          if (!!rp[k] === v) delete next[k]; else next[k] = v;   // chỉ lưu phần khác với vai trò
          setBook(b.id, { perms: next });
        };
        return (
          <Section key={b.id} title={b.name}>
            <div className="grid">
              <Field label="Quyền vào sổ"><Select value={m.access} onChange={(v) => setBook(b.id, { access: v })} options={ACCESS} /></Field>
              {m.access === 'staff' && <Field label="Vai trò mẫu"><Select value={m.role_id || ''} onChange={(v) => setBook(b.id, { role_id: v || null, perms: {} })}
                options={[{ value: '', label: 'Không dùng — tick tay từng quyền' }, ...roles.map((r) => ({ value: r.id, label: r.name }))]} /></Field>}
            </div>
            {m.access === 'staff' && <PermGrid groups={groups} checked={eff} locked={locked} onToggle={toggle} />}
            {m.access === 'staff' && Object.keys(m.perms || {}).length > 0 && m.role_id && <div className="small muted">Đã chỉnh riêng {Object.keys(m.perms).length} ô so với vai trò. <a href="#" onClick={(e) => { e.preventDefault(); setBook(b.id, { perms: {} }); }}>Bỏ chỉnh riêng</a></div>}
          </Section>
        );
      })}
    </Modal>
  );
}

// ---------- VAI TRÒ MẪU ----------
export function AdminRoles() {
  const ov = useOverview();
  const [edit, setEdit] = useState(null);
  if (ov.loading && !ov.data) return <Loading />;
  if (ov.error) return <ErrorBox error={ov.error} />;
  const label = Object.fromEntries(ov.data.perm_groups.flatMap((g) => g.perms));
  return (
    <div className="stack" style={{ maxWidth: 1000 }}>
      <Note>Vai trò là bộ quyền đặt sẵn tên (Bán hàng, Thủ kho, Kế toán…). Sửa quyền của vai trò thì mọi người đang dùng vai trò đó đổi theo ngay.</Note>
      <Table rows={ov.data.roles} onRow={(r) => setEdit(r)} columns={[
        { key: 'n', label: 'Vai trò', render: (r) => <><b>{r.name}</b>{r.description && <div className="cell-sub">{r.description}</div>}</> },
        { key: 'p', label: 'Quyền', render: (r) => <span className="small">{Object.keys(r.perms).filter((k) => r.perms[k]).map((k) => label[k] || k).join('; ')}</span> },
        { key: 'u', label: 'Đang dùng', align: 'right', render: (r) => r.used },
      ]} />
      <div><Btn icon="plus" onClick={() => setEdit({ perms: {} })}>Thêm vai trò</Btn></div>
      {edit && <RoleForm r={edit} groups={ov.data.perm_groups} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RoleForm({ r, groups, onClose }) {
  const { rpc, refresh, toast, loadBooks } = useApp();
  const [f, setF] = useState({ name: r.name || '', description: r.description || '', perms: { ...r.perms } });
  const [busy, setBusy] = useState(false);
  const run = async (fn, p, ok) => {
    setBusy(true);
    try { await rpc(fn, p); toast(ok); refresh(); await loadBooks(); onClose(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal title={r.id ? `Vai trò ${r.name}` : 'Thêm vai trò'} onClose={onClose} size="lg"
      footer={<>{r.id && <ConfirmBtn kind="danger" onConfirm={() => run('admin_delete_role', { id: r.id }, 'Đã xóa vai trò')}>Xóa vai trò</ConfirmBtn>}
        <span className="grow" /><Btn onClick={onClose}>Thôi</Btn>
        <Btn kind="primary" busy={busy} onClick={() => run('admin_save_role', { id: r.id || null, name: f.name, description: f.description, perms: Object.keys(f.perms).filter((k) => f.perms[k]) }, 'Đã lưu vai trò')}>Lưu</Btn></>}>
      <div className="grid">
        <Field label="Tên vai trò" required><Input value={f.name} onChange={(v) => setF((s) => ({ ...s, name: v }))} placeholder="vd. Thu ngân" /></Field>
        <Field label="Mô tả"><Input value={f.description} onChange={(v) => setF((s) => ({ ...s, description: v }))} /></Field>
      </div>
      <PermGrid groups={groups} checked={f.perms} onToggle={(k, v) => setF((s) => ({ ...s, perms: { ...s.perms, [k]: v } }))} />
      <div className="small muted">Quyền sửa đã gồm quyền xem cùng nhóm (vd. “Tạo / sửa đơn bán” thì xem được đơn bán).</div>
    </Modal>
  );
}

// ---------- NHẬT KÝ BẢO MẬT ----------
const EVENTS = {
  login_ok: 'Đăng nhập', login_fail: 'Đăng nhập sai', logout_all: 'Đăng xuất mọi thiết bị', password_changed: 'Đổi mật khẩu', password_reset: 'Đặt lại mật khẩu qua email',
  reset_requested: 'Yêu cầu quên mật khẩu', reset_sent_by_admin: 'Quản trị gửi email đặt lại mật khẩu', cli_password_reset: 'Đặt lại mật khẩu bằng lệnh trên máy chủ',
  invite_sent: 'Gửi lời mời', invite_accepted: 'Nhận lời mời, kích hoạt', email_verified: 'Xác thực email', email_change_requested: 'Yêu cầu đổi email',
  email_changed: 'Đổi email', profile_updated: 'Sửa thông tin cá nhân', user_created: 'Tạo người dùng', user_updated: 'Đổi quyền / thông tin',
  user_disabled: 'Khóa tài khoản', user_enabled: 'Mở khóa tài khoản', role_saved: 'Lưu vai trò', role_deleted: 'Xóa vai trò',
  admin_bootstrap: 'Tạo Tổng quản trị đầu tiên', admin_env_password_flagged: 'Mật khẩu quản trị trùng .env — bắt đổi',
};
const WARN = new Set(['login_fail', 'cli_password_reset', 'user_disabled', 'admin_env_password_flagged']);

export function SecurityLog() {
  const [email, setEmail] = useState(''); const [q, setQ] = useState('');
  const log = useRpcData('admin_security_log', { limit: 500, email: q || null });
  return (
    <div className="stack" style={{ maxWidth: 1100 }}>
      <Note>Ghi lại mọi lần đăng nhập (kể cả sai), đổi / đặt lại mật khẩu, đổi email, cấp quyền, khóa tài khoản. Dòng <b>“Đặt lại mật khẩu bằng lệnh trên máy chủ”</b> nghĩa là người có quyền vào máy chủ đã can thiệp — chủ tài khoản cũng nhận email báo.</Note>
      <div className="row gap">
        <Input type="email" value={email} onChange={setEmail} placeholder="Lọc theo email…" style={{ maxWidth: 280 }} onKeyDown={(e) => { if (e.key === 'Enter') setQ(email.trim()); }} />
        <Btn onClick={() => setQ(email.trim())}>Lọc</Btn>{q && <Btn onClick={() => { setEmail(''); setQ(''); }}>Bỏ lọc</Btn>}
      </div>
      <ErrorBox error={log.error} />
      {log.loading && !log.data ? <Loading /> : <Table rows={log.data || []} dense columns={[
        { key: 'a', label: 'Lúc', render: (x) => <span className="small">{dmyhm(x.at)}</span> },
        { key: 'e', label: 'Sự kiện', render: (x) => <Pill tone={WARN.has(x.event) ? 'warn' : 'neutral'}>{EVENTS[x.event] || x.event}</Pill> },
        { key: 'u', label: 'Tài khoản', render: (x) => <span className="small">{x.user_email || x.detail?.email || x.detail?.name || '—'}</span> },
        { key: 'b', label: 'Người làm', render: (x) => <span className="small muted">{x.actor_email && x.actor_email !== x.user_email ? x.actor_email : ''}</span> },
        { key: 'i', label: 'IP', render: (x) => <span className="small muted">{x.ip || (x.event === 'cli_password_reset' ? 'máy chủ' : '')}</span> },
      ]} />}
    </div>
  );
}
