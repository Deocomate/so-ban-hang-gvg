import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { dmyhm } from '../lib/format.js';
import { Btn, Icon, Modal, Empty, Tabs } from './ui.jsx';

export const NOTIFY_KINDS = [
  ['don_hang', 'Đơn hàng mới', 'Khi một đơn được xác nhận'],
  ['van_chuyen', 'Vận chuyển', 'SPX, BEST: đã lấy hàng, đang giao, giao thành công / thất bại, hoàn hàng'],
  ['tien_ve', 'Tiền về tài khoản', 'Tự gạch nợ đơn, hoặc khoản chưa khớp cần xử lý'],
  ['bao_cao', 'Báo cáo cuối ngày', 'Doanh thu, tiền thu, lãi gộp, đơn chờ giao (21:00)'],
  ['cong_no', 'Nhắc công nợ', 'Khách quá hạn / sắp đến hạn, nợ nhà cung cấp, COD hãng vận chuyển giữ lâu (08:00)'],
];

// Lấy thông báo định kỳ; báo nhanh (toast) khi có tin mới lúc đang mở app
export function useNotifications() {
  const { rpc, bookId, version, toast } = useApp();
  const [data, setData] = useState(null);
  const lastTop = useRef(null);
  const load = useCallback(async () => {
    if (!bookId) return;
    try {
      const r = await rpc('my_notifications', { limit: 60 });
      const top = r.items[0]?.id || 0;
      if (lastTop.current !== null && top > lastTop.current) {
        const fresh = r.items.filter((x) => x.id > lastTop.current && x.unread);
        if (fresh.length) toast(fresh[0].title + (fresh.length > 1 ? ` (+${fresh.length - 1} tin)` : ''));
      }
      lastTop.current = top; setData(r);
    } catch (e) { /* bỏ qua lỗi tạm thời */ }
  }, [rpc, bookId]);
  useEffect(() => { lastTop.current = null; }, [bookId]);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { const t = setInterval(load, 45000); return () => clearInterval(t); }, [load]);
  return { data, reload: load };
}

export function openLink(link, { open, go }) {
  if (!link) return;
  const [type, id] = link.split(':');
  if (type === 'order') open('order', { id });
  else if (type === 'ship') open('ship', { id });
  else if (type === 'bank') go('tien-ve');
  else if (type === 'page') go(id);
}

export function Bell({ data, onOpen }) {
  const n = data?.unread || 0;
  return (
    <button className="icon-btn bell" onClick={onOpen} aria-label={`Thông báo${n ? `, ${n} chưa đọc` : ''}`} title="Thông báo">
      <Icon name="bell" size={20} />{n > 0 && <span className="bell-n">{n > 99 ? '99+' : n}</span>}
    </button>
  );
}

const LV = { good: 'good', warn: 'warn', bad: 'bad', info: 'info' };

export function NotifyPanel({ data, reload, onClose, go }) {
  const { rpc, open, book } = useApp();
  const [kind, setKind] = useState('all');
  useEffect(() => { if (data?.unread) rpc('mark_notifications_read', {}).then(() => setTimeout(reload, 400)).catch(() => {}); }, []);
  const items = (data?.items || []).filter((x) => kind === 'all' || x.kind === kind);
  return (
    <Modal title="Thông báo" subtitle={book.name} onClose={onClose} size="md"
      footer={<><Btn icon="gear" onClick={() => { onClose(); go('cai-dat'); setTimeout(() => window.dispatchEvent(new CustomEvent('settings-tab', { detail: 'notify' })), 50); }}>Cài đặt thông báo điện thoại</Btn>
        {book.is_demo && book.role === 'owner' && <>
          <Btn small onClick={async () => { await rpc('demo_run_scheduled', { kind: 'daily_report' }); reload(); }}>Thử báo cáo ngày</Btn>
          <Btn small onClick={async () => { await rpc('demo_run_scheduled', { kind: 'debt_reminder' }); reload(); }}>Thử nhắc nợ</Btn></>}</>}>
      <Tabs value={kind} onChange={setKind} tabs={[{ value: 'all', label: 'Tất cả' }, ...NOTIFY_KINDS.map(([v, l]) => ({ value: v, label: l.split(' ')[0] === 'Tiền' ? 'Tiền về' : l.replace(' mới', '').replace(' SPX', '').replace('cuối ngày', 'ngày') }))]} />
      {!data ? <div className="muted">Đang tải…</div> : items.length === 0 ? <Empty title="Chưa có thông báo">Tin về đơn hàng, vận chuyển, tiền về, báo cáo ngày và nhắc nợ sẽ hiện ở đây.</Empty> : (
        <div className="nlist">{items.map((x) => (
          <button key={x.id} className={`nitem lv-${LV[x.level] || 'info'}${x.unread ? ' unread' : ''}`} onClick={() => { onClose(); openLink(x.link, { open, go }); }}>
            <div className="row gap-s"><b className="grow">{x.title}</b><span className="muted small">{dmyhm(x.at)}</span></div>
            {x.body && <div className="small nbody">{x.body}</div>}
          </button>))}</div>
      )}
    </Modal>
  );
}
