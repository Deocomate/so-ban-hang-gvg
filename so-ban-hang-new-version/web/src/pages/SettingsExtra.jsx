import React, { useEffect, useState } from 'react';
import { useApp, useQ, useRpcData } from '../lib/store.jsx';
import { money, dmyhm } from '../lib/format.js';
import { CARRIERS } from '../lib/carriers.js';
import { BANKS, vietqrPayload, qrSvg, orderTransferContent } from '../lib/vietqr.js';
import { pushSupport, currentSub, enablePush, disablePush, isIOS } from '../lib/push.js';
import { NOTIFY_KINDS } from '../components/Notify.jsx';
import { Btn, Field, Input, Select, Check, Note, Section, KV, Icon, Table, Pill, ErrorBox } from '../components/ui.jsx';

export function QrBox({ amount, content, size = 200, caption = true }) {
  const { settings } = useApp();
  const bank = settings.bank;
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!bank) return;
    qrSvg(vietqrPayload({ bin: bank.bin, account_no: bank.account_no, amount, content }), size).then(setSvg).catch(() => setSvg(''));
  }, [bank?.bin, bank?.account_no, amount, content, size]);
  if (!bank) return null;
  return (
    <div className="qrbox">
      <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} aria-label="Mã QR chuyển khoản" role="img" />
      {caption && <div className="qr-cap">
        <b>{bank.bank_name || 'Ngân hàng'}</b> · {bank.account_no}<br />{bank.account_name}
        {amount > 0 && <><br />Số tiền: <b>{money(amount)} đ</b></>}{content && <><br />Nội dung: <b>{content}</b></>}
      </div>}
    </div>
  );
}

export function BankSettings() {
  const { settings, rpc, loadBooks, toast, book, refresh } = useApp();
  const funds = useQ('funds', [['active', 'eq', 'true']], 'sort', 50);
  const b0 = settings.bank || {};
  const [f, setF] = useState({ bin: b0.bin || '970436', account_no: b0.account_no || '', account_name: b0.account_name || '', fund_id: b0.fund_id || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { await rpc('save_bank_account', { bank: { ...f, bank_name: BANKS.find((x) => x.bin === f.bin)?.name } }); await loadBooks(); refresh(); toast('Đã lưu tài khoản nhận tiền'); }
    catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="stack-l" style={{ maxWidth: 860 }}>
      <Section title="Tài khoản nhận chuyển khoản">
        <div className="muted small">Dùng để in mã QR trên đơn và phiếu (khách quét là tự điền số tiền + nội dung), và để nhận giao dịch tự động từ SePay. Hai sổ có thể dùng chung 1 tài khoản — phần mềm phân biệt bằng mã sổ trong nội dung ({orderTransferContent(book, 'DH00012')}).</div>
        <div className="grid">
          <Field label="Ngân hàng"><Select value={f.bin} onChange={(v) => set('bin', v)} options={BANKS.map((x) => ({ value: x.bin, label: x.name }))} /></Field>
          <Field label="Số tài khoản"><Input value={f.account_no} onChange={(v) => set('account_no', v)} inputMode="numeric" /></Field>
          <Field label="Tên chủ tài khoản" wide hint="In hoa không dấu, đúng như ngân hàng hiển thị"><Input value={f.account_name} onChange={(v) => set('account_name', v.toUpperCase())} /></Field>
          <Field label="Ghi tiền về vào quỹ"><Select value={f.fund_id} onChange={(v) => set('fund_id', v)} placeholder="Tự chọn quỹ “Tài khoản ngân hàng”" options={(funds.data || []).map((x) => ({ value: x.id, label: x.name }))} /></Field>
        </div>
        <div><Btn kind="primary" busy={busy} onClick={save}>Lưu tài khoản</Btn></div>
      </Section>
      {settings.bank && <Section title="Xem thử mã QR">
        <div className="row gap" style={{ alignItems: 'flex-start' }}>
          <QrBox amount={1250000} content={orderTransferContent(book, 'DH00012')} />
          <div className="muted small" style={{ maxWidth: 360 }}>Ví dụ QR cho đơn DH00012 còn phải trả 1.250.000 đ. Mỗi đơn và phiếu in có QR riêng với đúng số tiền còn phải trả. Hãy quét thử bằng app ngân hàng (không cần chuyển) để kiểm tra tên tài khoản hiện đúng.</div>
        </div>
      </Section>}
      <Section title="Nhận tiền về tự động (SePay)">
        <div className="small">Đã kết nối thì mỗi khoản tiền vào tài khoản sẽ được: <b>tự ghi phiếu thu và gạch nợ đúng đơn</b> nếu nội dung có mã đơn; khoản không có mã đơn vào mục <b>Tiền về TK → Chờ xử lý</b>; kèm thông báo lên điện thoại.</div>
        <ol className="small steps-list">
          <li>Đăng ký SePay (sepay.vn), thêm tài khoản Vietcombank hộ kinh doanh (SePay hỗ trợ VCB doanh nghiệp/hộ kinh doanh từ 06/2026).</li>
          <li>SePay → Tích hợp WebHooks → thêm địa chỉ <code>https://&lt;mã-dự-án&gt;.supabase.co/functions/v1/sepay-webhook</code>, kiểu xác thực <b>API Key</b>.</li>
          <li>Dán API Key đó vào Supabase (biến <code>SEPAY_API_KEY</code>) — chi tiết trong HUONG-DAN.md mục 7.</li>
        </ol>
        {book.is_demo && <Note>Bản chạy thử: vào <b>Tiền về TK → Giả lập tiền về</b> để xem phần mềm tự gạch nợ.</Note>}
      </Section>
    </div>
  );
}

export function NotifySettings() {
  const { rpc, book, toast } = useApp();
  const [prefs, setPrefs] = useState(null); const [subs, setSubs] = useState(0);
  const [on, setOn] = useState(false); const [busy, setBusy] = useState(false);
  const sup = pushSupport();
  const load = async () => { const r = await rpc('my_notifications', { limit: 1 }); setPrefs(r.prefs || {}); setSubs(r.subs); setOn(!!(await currentSub())); };
  useEffect(() => { load().catch(() => {}); }, [book.id]);
  const msg = {
    demo: 'Bản chạy thử chạy trong khung xem trước nên không gửi được thông báo lên điện thoại. Thông báo vẫn hiện ở biểu tượng chuông. Bản thật (sau khi đưa lên Supabase) bật được ngay ở đây.',
    no_key: 'Chưa cấu hình khóa gửi thông báo (VITE_VAPID_PUBLIC_KEY). Xem HUONG-DAN.md mục 7.',
    ios_home: 'Trên iPhone/iPad: bấm nút Chia sẻ (ô vuông có mũi tên) → “Thêm vào MH chính”, rồi mở phần mềm từ biểu tượng mới trên màn hình chính và quay lại đây để bật. Cần iOS 16.4 trở lên.',
    browser: 'Trình duyệt này không hỗ trợ thông báo đẩy. Trên Android hãy dùng Chrome; trên iPhone dùng Safari và thêm vào màn hình chính.',
    denied: 'Bạn đã chặn thông báo cho trang này. Mở cài đặt trình duyệt → Quyền của trang → Thông báo → Cho phép, rồi tải lại trang.',
  };
  return (
    <div className="stack-l" style={{ maxWidth: 820 }}>
      <Section title="Thông báo trên điện thoại này">
        <div className="small">Thông báo hiện trên màn hình khóa như tin nhắn, kể cả khi không mở phần mềm. Mỗi điện thoại / máy tính bật riêng; có thể bật trên nhiều máy. Hiện bạn có <b>{subs}</b> thiết bị đang nhận.</div>
        {!sup.ok ? <Note tone={sup.reason === 'demo' ? 'info' : 'warn'}>{msg[sup.reason]}</Note> : (
          <div className="row gap">
            {on ? <><span className="good strong"><Icon name="check" /> Đang nhận thông báo trên máy này</span>
              <Btn busy={busy} onClick={async () => { setBusy(true); try { await disablePush(rpc); await load(); toast('Đã tắt trên máy này'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } }}>Tắt</Btn></>
              : <Btn kind="primary" icon="bell" busy={busy} onClick={async () => { setBusy(true); try { await enablePush(rpc); await load(); toast('Đã bật thông báo trên máy này'); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } }}>Bật thông báo trên máy này</Btn>}
          </div>
        )}
        {isIOS() && sup.ok && <div className="muted small">iPhone: nếu không thấy thông báo, vào Cài đặt → Thông báo → (tên phần mềm) → Cho phép.</div>}
      </Section>
      <Section title="Nhận những loại tin nào (sổ này)">
        <div className="muted small">Áp dụng cho cả chuông trong phần mềm và thông báo điện thoại. Nhân viên chỉ nhận loại tin phù hợp quyền (vd. không có quyền xem giá vốn thì không nhận báo cáo ngày).</div>
        {prefs && NOTIFY_KINDS.map(([k, label, hint]) => (
          <Check key={k} checked={prefs[k] !== false} onChange={async (v) => { const np = { ...prefs, [k]: v }; setPrefs(np);
            try { await rpc('save_notify_prefs', { prefs: { [k]: v } }); } catch (e) { toast(e.message, 'err'); } }}>
            <b>{label}</b> <span className="muted small">— {hint}</span></Check>))}
      </Section>
      <Note>Thông báo đẩy gửi tới <b>thiết bị đã đăng nhập và bấm bật</b>, không gửi theo số điện thoại. Muốn nhận trên điện thoại nào, hãy đăng nhập phần mềm trên chính máy đó rồi bấm “Bật thông báo”.</Note>
    </div>
  );
}

// ---------- Kết nối đơn vị vận chuyển ----------
const LOG_RESULT = { da_cap_nhat: ['Đã cập nhật', 'good'], khong_doi: ['Trùng / không đổi', 'neutral'], khong_co_van_don: ['Mã không có trong sổ', 'warn'],
  chua_doc_duoc: ['Chưa đọc được', 'bad'], loi: ['Lỗi', 'bad'] };

export function CarrierSettings() {
  const { book, toast } = useApp();
  const [cr, setCr] = useState('BEST');
  const log = useRpcData('carrier_webhook_log', { carrier: cr });
  const base = (import.meta.env.VITE_SUPABASE_URL || 'https://<MA-DU-AN>.supabase.co').replace(/\/$/, '');
  const hook = `${base}/functions/v1/tracking-webhook?carrier=${cr}&secret=<TRACKING_WEBHOOK_SECRET>`;
  const copy = async () => { try { await navigator.clipboard.writeText(hook); toast('Đã chép địa chỉ'); } catch (e) { toast('Chọn và chép địa chỉ bằng tay', 'err'); } };
  return (
    <div className="stack-l" style={{ maxWidth: 920 }}>
      <Section title="Các đơn vị vận chuyển">
        <div className="small">Mỗi vận đơn ghi rõ hãng. Trạng thái, COD và thông báo dùng chung một cách cho mọi hãng; đối soát COD làm riêng từng hãng vì mỗi hãng chuyển tiền riêng.</div>
        <div className="seg">{CARRIERS.filter((c) => c.code !== 'KHAC').map((c) => <button key={c.code} className={cr === c.code ? 'on' : ''} onClick={() => setCr(c.code)}>{c.name}</button>)}</div>
      </Section>
      {cr === 'BEST' ? (
        <Section title="Nhận trạng thái tự động từ BEST Express">
          <div className="small">BEST có gửi trạng thái vận đơn về phần mềm của shop (cách các phần mềm bán hàng như Getfly đang dùng): shop đưa cho BEST một <b>địa chỉ nhận</b>, BEST cài đặt phía họ, sau đó mỗi lần vận đơn đổi trạng thái BEST tự gửi sang. BEST không công bố tài liệu công khai, nên cần làm việc với nhân viên phụ trách tài khoản BEST của anh.</div>
          <ol className="small steps-list">
            <li>Đặt khóa bí mật <code>TRACKING_WEBHOOK_SECRET</code> trên Supabase (HUONG-DAN.md mục 7) — đã đặt cho SPX thì dùng chung.</li>
            <li>Gửi cho nhân viên BEST địa chỉ dưới đây (thay phần &lt;…&gt; bằng khóa thật), đề nghị bật <b>webhook cập nhật trạng thái vận đơn</b> cho tài khoản shop.</li>
            <li>Đồng thời xin BEST <b>danh sách mã trạng thái</b> (ví dụ 666 = Giao hàng thành công) để phần mềm đọc chính xác tất cả trạng thái.</li>
            <li>Khi BEST bật xong, gửi thử 1 đơn. Nhật ký bên dưới sẽ hiện từng lần BEST gửi sang — dòng “Chưa đọc được” nghĩa là cần bổ sung cách đọc (gửi tôi ảnh/chép dòng đó).</li>
          </ol>
          <div className="row gap"><code style={{ padding: '8px 10px', flex: '1 1 320px' }}>{hook}</code><Btn icon="copy" onClick={copy}>Chép</Btn></div>
          <div className="muted small">Trong lúc chờ BEST: cập nhật trạng thái bằng tay ở từng vận đơn, hoặc tải danh sách đơn từ trang quản lý BEST ra Excel rồi dùng <b>Vận chuyển → Cập nhật từ file Excel</b>.</div>
        </Section>
      ) : (
        <Section title="Nhận trạng thái tự động từ Shopee Express">
          <div className="small">SPX cho kết nối bằng Secret Key (trang quản trị SPX → Quản lý tài khoản → Hồ sơ shop) nhưng không công bố tài liệu. Khi có tài liệu từ SPX, chỉ cần chuyển dữ liệu về địa chỉ dưới đây. Trước mắt: cập nhật tay hoặc nhập file Excel của SPX.</div>
          <div className="row gap"><code style={{ padding: '8px 10px', flex: '1 1 320px' }}>{hook}</code><Btn icon="copy" onClick={copy}>Chép</Btn></div>
        </Section>
      )}
      <Section title={`Nhật ký ${cr} gửi về (50 lần gần nhất)`}>
        {book.is_demo && <Note>Bản chạy thử không có máy chủ nhận nên nhật ký trống. Bản thật: mỗi lần hãng gửi dữ liệu sẽ hiện ở đây.</Note>}
        <ErrorBox error={log.error} />
        <Table dense rows={log.data} empty="Chưa nhận được dữ liệu nào từ hãng" columns={[
          { key: 't', label: 'Lúc nhận', render: (x) => dmyhm(x.received_at) },
          { key: 'v', label: 'Vận đơn', render: (x) => <><b>{x.tracking_no || '—'}</b>{x.order_code && <div className="cell-sub">đơn {x.order_code}</div>}</> },
          { key: 'r', label: 'Hãng gửi', render: (x) => <span className="small">{x.raw_status || '—'}</span> },
          { key: 'm', label: 'Hiểu là', render: (x) => x.mapped_label || '—' },
          { key: 'k', label: 'Kết quả', render: (x) => { const [l, t] = LOG_RESULT[x.result] || [x.result, 'neutral']; return <><Pill tone={t}>{l}</Pill>{x.note && <div className="cell-sub">{x.note}</div>}</>; } },
        ]} />
      </Section>
    </div>
  );
}
