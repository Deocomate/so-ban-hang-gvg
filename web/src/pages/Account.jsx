// Tài khoản: đăng nhập, quên mật khẩu, trang mở từ link trong email (nhận lời mời / đặt lại mật khẩu / xác thực email),
// bắt đổi mật khẩu, và "Tài khoản của tôi" trong Cài đặt.
import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { Btn, Field, Input, Note, Section, KV, Pill, Loading, Check } from '../components/ui.jsx';

export const PW_HINT = 'Ít nhất 8 ký tự, có cả chữ và số';
const pwProblem = (pw, pw2) => (pw.length < 8 ? PW_HINT : !/\p{L}/u.test(pw) || !/\d/.test(pw) ? PW_HINT : pw2 !== undefined && pw !== pw2 ? 'Hai lần nhập mật khẩu không khớp' : '');

// Danh mục quyền (nhóm → [mã, tên]) lấy từ máy chủ
export function usePermGroups() {
  const { backend } = useApp();
  const [groups, setGroups] = useState([]);
  useEffect(() => { backend.config().then((c) => setGroups(c.perm_groups || [])); }, [backend]);
  return groups;
}

function AuthCard({ title, children, onSubmit }) {
  return (
    <div className="center-screen login-screen">
      <form className="login card" onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
        <div className="brand"><div className="seal">G</div><div><div className="brand-name">Sổ bán hàng gốm</div><div className="brand-sub">Thanh Hải · Vũ Gia · Anamtile</div></div></div>
        <h1 className="login-title">{title}</h1>
        {children}
      </form>
    </div>
  );
}
const Submit = ({ busy, children, disabled }) => <button className="btn btn-primary btn-block" type="submit" disabled={busy || disabled}>{busy ? <span className="spin" /> : null}{children}</button>;
const linkTo = (fn) => (e) => { e.preventDefault(); fn(); };

export function Login() {
  const { backend, setSession } = useApp();
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [remember, setRemember] = useState(true);
  const [err, setErr] = useState(''); const [sent, setSent] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      if (mode === 'in') { await backend.signIn(email, pw, remember); setSession(await backend.getSession()); }
      else { await backend.forgot(email); setSent(email); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const switchTo = (m) => { setMode(m); setErr(''); setSent(''); };
  return (
    <AuthCard title={mode === 'in' ? 'Đăng nhập' : 'Quên mật khẩu'} onSubmit={submit}>
      {import.meta.env.VITE_SAMPLE_LOGIN && mode === 'in' && <Note>Dữ liệu mẫu: đăng nhập bằng <b>{import.meta.env.VITE_SAMPLE_LOGIN}</b>, mật khẩu xem ở Bảng điều khiển.</Note>}
      {mode === 'forgot' && !sent && <div className="muted small">Nhập email đăng nhập, hệ thống gửi link đặt mật khẩu mới (hạn 60 phút).</div>}
      {sent ? <Note tone="good">Nếu <b>{sent}</b> có tài khoản, link đặt lại mật khẩu đã được gửi tới hộp thư. Hãy kiểm tra cả mục Thư rác / Quảng cáo.</Note> : <>
        <Field label="Email"><Input id="email" type="email" required value={email} onChange={setEmail} autoComplete="email" /></Field>
        {mode === 'in' && <Field label="Mật khẩu"><Input id="pw" type="password" required value={pw} onChange={setPw} autoComplete="current-password" /></Field>}
        {mode === 'in' && <Check checked={remember} onChange={setRemember}>Ghi nhớ đăng nhập trên máy này (30 ngày)</Check>}
        {mode === 'in' && !remember && <div className="muted small">Máy dùng chung: đóng trình duyệt là đăng xuất, phiên tự hết sau 12 giờ.</div>}
        {err && <Note tone="bad">{err}</Note>}
        <Submit busy={busy}>{mode === 'in' ? 'Đăng nhập' : 'Gửi link đặt lại mật khẩu'}</Submit>
      </>}
      <div className="row gap small">
        {mode === 'in' ? <a href="#" onClick={linkTo(() => switchTo('forgot'))}>Quên mật khẩu?</a> : <a href="#" onClick={linkTo(() => switchTo('in'))}>Quay lại đăng nhập</a>}
      </div>
      <div className="muted small">Chưa có tài khoản? Nhờ Tổng quản trị gửi lời mời qua email.</div>
    </AuthCard>
  );
}

// Trang mở từ link trong email: /#tai-khoan/<nhan-loi-moi | dat-lai-mat-khau | xac-thuc-email>/<mã>
const LINK_PAGES = { 'nhan-loi-moi': 'invite', 'dat-lai-mat-khau': 'reset_password', 'xac-thuc-email': 'verify' };
const linkParts = () => location.hash.replace(/^#/, '').split('/');
export const isLinkPage = () => linkParts()[0] === 'tai-khoan';

export function LinkPage() {
  const { backend, setSession } = useApp();
  const [, kind, token = ''] = linkParts();
  const page = LINK_PAGES[kind];
  const [info, setInfo] = useState(null); const [err, setErr] = useState(''); const [done, setDone] = useState('');
  const [name, setName] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false);
  const home = () => { location.replace(location.pathname); };
  useEffect(() => {
    if (!page || !token) { setErr('Link không đúng — hãy mở lại link trong email.'); return; }
    backend.linkInfo(token).then(async (i) => {
      setInfo(i); setName(i.name || '');
      if (page === 'verify') { const r = await backend.verifyEmail(token); setDone(`Đã xác thực email ${r.email}.`); }
    }).catch((e) => setErr(e.message));
  }, []);
  const save = async () => {
    const p = pwProblem(pw, pw2); if (p) { setErr(p); return; }
    setBusy(true); setErr('');
    try {
      if (page === 'invite') await backend.acceptInvite(token, pw, name);
      else await backend.resetPassword(token, pw);
      setSession(await backend.getSession());
      home();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const title = page === 'invite' ? 'Kích hoạt tài khoản' : page === 'reset_password' ? 'Đặt mật khẩu mới' : 'Xác thực email';
  if (err && !info) return <AuthCard title={title}><Note tone="bad">{err}</Note><Btn onClick={home}>Về trang đăng nhập</Btn></AuthCard>;
  if (!info) return <AuthCard title={title}><Loading text="Đang kiểm tra link…" /></AuthCard>;
  if (page === 'verify') return <AuthCard title={title}>{done ? <Note tone="good">{done}</Note> : err ? <Note tone="bad">{err}</Note> : <Loading text="Đang xác thực…" />}<Btn kind="primary" onClick={home}>Vào phần mềm</Btn></AuthCard>;
  return (
    <AuthCard title={title} onSubmit={save}>
      <KV items={[['Email', info.email]]} />
      {page === 'invite' && <Field label="Tên hiển thị"><Input value={name} onChange={setName} placeholder="vd. Nguyễn Thị Lan" /></Field>}
      <Field label="Mật khẩu mới" hint={PW_HINT}><Input type="password" required value={pw} onChange={setPw} autoComplete="new-password" /></Field>
      <Field label="Nhập lại mật khẩu"><Input type="password" required value={pw2} onChange={setPw2} autoComplete="new-password" /></Field>
      {err && <Note tone="bad">{err}</Note>}
      <Submit busy={busy}>{page === 'invite' ? 'Kích hoạt và đăng nhập' : 'Đặt mật khẩu và đăng nhập'}</Submit>
    </AuthCard>
  );
}

// Đăng nhập bằng mật khẩu tạm (tài khoản quản trị đầu tiên, mật khẩu đặt lại trên máy chủ): phải đổi trước khi dùng
export function ForcePassword() {
  const { backend, setSession, session } = useApp();
  const [oldPw, setOldPw] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    const p = pwProblem(pw, pw2); if (p) { setErr(p); return; }
    setBusy(true); setErr('');
    try { await backend.changePassword(oldPw, pw); setSession(await backend.getSession()); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <AuthCard title="Đổi mật khẩu" onSubmit={save}>
      <Note tone="warn">Tài khoản <b>{session.user.email}</b> đang dùng mật khẩu tạm (do máy chủ đặt). Hãy đặt mật khẩu riêng của bạn — chỉ bạn biết — trước khi tiếp tục.</Note>
      <Field label="Mật khẩu hiện tại"><Input type="password" required value={oldPw} onChange={setOldPw} autoComplete="current-password" /></Field>
      <Field label="Mật khẩu mới" hint={PW_HINT}><Input type="password" required value={pw} onChange={setPw} autoComplete="new-password" /></Field>
      <Field label="Nhập lại mật khẩu mới"><Input type="password" required value={pw2} onChange={setPw2} autoComplete="new-password" /></Field>
      {err && <Note tone="bad">{err}</Note>}
      <Submit busy={busy}>Đổi mật khẩu</Submit>
      <a href="#" className="small" onClick={linkTo(() => backend.signOut())}>Đăng xuất</a>
    </AuthCard>
  );
}

// Cài đặt → Tài khoản
export function MyAccount() {
  const { session, book, backend, toast } = useApp();
  const u = session?.user || {};
  const groups = usePermGroups();
  const [name, setName] = useState(u.name || ''); const [phone, setPhone] = useState(u.phone || '');
  const [newEmail, setNewEmail] = useState(''); const [emailPw, setEmailPw] = useState('');
  const [oldPw, setOldPw] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState('');
  const act = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); return true; } catch (e) { toast(e.message, 'err'); return false; } finally { setBusy(''); }
  };
  const permList = groups.flatMap((g) => g.perms).filter(([k]) => book?.perms?.[k]).map(([, l]) => l);
  const pwErr = pw && pwProblem(pw, pw2);
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <Section title="Thông tin tài khoản">
        <KV items={[
          ['Email đăng nhập', <>{u.email} {u.email_verified ? <Pill tone="good">đã xác thực</Pill> : <Pill tone="warn">chưa xác thực</Pill>}</>],
          ['Quyền hệ thống', u.is_admin ? 'Tổng quản trị' : '—'],
          ['Quyền ở sổ đang mở', book?.role === 'owner' ? 'Quản lý sổ (toàn quyền trong sổ)' : (book?.role_name ? `Vai trò ${book.role_name}` : 'Nhân viên') + (permList.length ? ': ' + permList.join('; ') : '')],
        ]} />
        {!u.email_verified && <div><Btn small busy={busy === 'verify'} onClick={() => act('verify', () => backend.resendVerify(), `Đã gửi link xác thực tới ${u.email}`)}>Gửi link xác thực email</Btn></div>}
        <div className="grid">
          <Field label="Tên hiển thị"><Input value={name} onChange={setName} /></Field>
          <Field label="Số điện thoại"><Input value={phone} onChange={setPhone} inputMode="tel" /></Field>
        </div>
        <div><Btn busy={busy === 'profile'} onClick={() => act('profile', () => backend.updateProfile(name, phone), 'Đã lưu thông tin')}>Lưu thông tin</Btn></div>
      </Section>
      <Section title="Đổi email đăng nhập">
        <div className="muted small">Link xác nhận gửi tới email mới; email chỉ đổi khi bấm link đó. Email cũ nhận thư báo.</div>
        <div className="grid">
          <Field label="Email mới"><Input type="email" value={newEmail} onChange={setNewEmail} autoComplete="email" /></Field>
          <Field label="Mật khẩu hiện tại"><Input type="password" value={emailPw} onChange={setEmailPw} autoComplete="current-password" /></Field>
        </div>
        <div><Btn busy={busy === 'email'} disabled={!newEmail || !emailPw} onClick={async () => { if (await act('email', () => backend.requestEmailChange(newEmail, emailPw), `Đã gửi link xác nhận tới ${newEmail}`)) { setNewEmail(''); setEmailPw(''); } }}>Gửi link xác nhận</Btn></div>
      </Section>
      <Section title="Đổi mật khẩu">
        <div className="grid">
          <Field label="Mật khẩu hiện tại"><Input type="password" value={oldPw} onChange={setOldPw} autoComplete="current-password" /></Field>
          <Field label="Mật khẩu mới" hint={PW_HINT} error={pwErr || ''}><Input type="password" value={pw} onChange={setPw} autoComplete="new-password" /></Field>
          <Field label="Nhập lại mật khẩu mới"><Input type="password" value={pw2} onChange={setPw2} autoComplete="new-password" /></Field>
        </div>
        <div><Btn busy={busy === 'pw'} disabled={!oldPw || !pw || !!pwErr} onClick={async () => { if (await act('pw', () => backend.changePassword(oldPw, pw), 'Đã đổi mật khẩu. Các máy khác đang đăng nhập tài khoản này phải đăng nhập lại.')) { setOldPw(''); setPw(''); setPw2(''); } }}>Đổi mật khẩu</Btn></div>
      </Section>
      <Section title="Phiên đăng nhập">
        <div className="muted small">Quên đăng xuất ở máy khác, hoặc nghi bị lộ mật khẩu: đăng xuất khỏi mọi thiết bị (máy này vẫn giữ đăng nhập).</div>
        <div className="row gap">
          <Btn busy={busy === 'all'} onClick={() => act('all', () => backend.logoutAll(), 'Đã đăng xuất mọi thiết bị khác')}>Đăng xuất mọi thiết bị khác</Btn>
          <Btn icon="logout" onClick={() => backend.signOut()}>Đăng xuất</Btn>
        </div>
      </Section>
    </div>
  );
}
