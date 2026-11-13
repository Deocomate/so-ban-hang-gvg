// Ô khuyến mại trên màn bán hàng: chọn chương trình đang chạy, nhập coupon / voucher, đổi điểm.
// Số tiền giảm do máy chủ tính (preview_promos); khi lưu đơn máy chủ tính lại và ghi nhận lượt dùng.
import React, { useEffect, useRef, useState } from 'react';
import { useApp, useRpcData } from '../lib/store.jsx';
import { money } from '../lib/format.js';
import { Btn, Icon, Input, NumInput, Modal, Check, Note } from '../components/ui.jsx';

export const sameAs = (q, p) => q.kind === p.kind && (p.kind === 'promo' ? q.ref_id === p.id : p.kind === 'points' ? true : String(q.code).toUpperCase() === String(p.code).toUpperCase());
export const loyaltyOn = (s) => !!(s.promo_on || s.voucher_on || s.coupon_on || (s.points_on && s.points?.redeem !== false));

// Tính lại số tiền giảm mỗi khi đơn đổi (gộp các lần gõ liên tiếp)
export function usePromoQuote({ promos, lines, customerId, date, orderId }) {
  const { rpc } = useApp();
  const [q, setQ] = useState({ items: [], total: 0, points: 0, error: '' });
  const key = JSON.stringify([promos, lines, customerId, date]);
  const t = useRef(null);
  useEffect(() => {
    clearTimeout(t.current);
    if (!customerId) return undefined;
    t.current = setTimeout(() => {
      rpc('preview_promos', { promos, lines, customer_id: customerId, date, order_id: orderId || null })
        .then((r) => setQ({ items: r.items, total: r.total, points: r.points, error: '' }))
        .catch((e) => setQ((s) => ({ ...s, items: [], total: 0, error: e.message })));
    }, 250);
    return () => clearTimeout(t.current);
  }, [key]);
  return q;
}

export function PromoDialog({ promos, setPromos, quote, date, customer, onClose }) {
  const { settings } = useApp();
  const act = useRpcData('active_promotions', { date }, !!settings.promo_on);
  const [code, setCode] = useState(''); const [vcode, setVcode] = useState('');
  const pts = promos.find((x) => x.kind === 'points')?.points ?? null;
  const has = (x) => promos.some((p) => p.kind === 'promo' && p.id === x.id);
  const toggle = (x, on) => setPromos(on ? [...promos, { kind: 'promo', id: x.id }] : promos.filter((p) => !(p.kind === 'promo' && p.id === x.id)));
  const add = (kind, c) => { const v = c.trim().toUpperCase(); if (v && !promos.some((p) => p.kind === kind && p.code === v)) setPromos([...promos, { kind, code: v }]); };
  const canPoints = settings.points_on && settings.points?.redeem !== false && customer && customer.code !== 'KL';
  return (
    <Modal title="Khuyến mại, mã giảm giá" size="md" onClose={onClose} footer={<Btn kind="primary" onClick={onClose}>Xong</Btn>}>
      {settings.promo_on && <div className="stack-s">
        <div className="field-label">Chương trình đang chạy</div>
        {(act.data || []).length === 0 ? <div className="muted small">Không có chương trình nào áp dụng hôm nay.</div>
          : act.data.map((x) => <Check key={x.id} checked={has(x)} onChange={(v) => toggle(x, v)}><b>{x.name}</b> <span className="muted small">— {x.discount_pct ? `${x.discount_pct}%` : `${money(x.discount_amount)} đ`}{x.min_amount ? `, đơn từ ${money(x.min_amount)} đ` : ''}</span></Check>)}
      </div>}
      {settings.coupon_on && <div className="row gap-s"><div className="grow"><Input value={code} onChange={setCode} placeholder="Mã coupon" aria-label="Mã coupon" onKeyDown={(e) => { if (e.key === 'Enter') { add('coupon', code); setCode(''); } }} /></div><Btn onClick={() => { add('coupon', code); setCode(''); }}>Áp dụng</Btn></div>}
      {settings.voucher_on && <div className="row gap-s"><div className="grow"><Input value={vcode} onChange={setVcode} placeholder="Mã voucher" aria-label="Mã voucher" onKeyDown={(e) => { if (e.key === 'Enter') { add('voucher', vcode); setVcode(''); } }} /></div><Btn onClick={() => { add('voucher', vcode); setVcode(''); }}>Áp dụng</Btn></div>}
      {canPoints && <div className="row gap-s">
        <span className="small grow">Khách có <b>{money(quote.points)}</b> điểm · 1 điểm = {money(settings.points?.redeem_value || 0)} đ</span>
        <div style={{ width: 140 }}><NumInput money={false} min={0} value={pts} placeholder="Đổi điểm" aria-label="Số điểm đổi"
          onChange={(v) => setPromos([...promos.filter((p) => p.kind !== 'points'), ...(v ? [{ kind: 'points', points: v }] : [])])} /></div>
      </div>}
      {quote.error && <Note tone="warn">{quote.error}</Note>}
      {promos.length > 0 && <div className="stack-s">{promos.map((p, i) => {
        const x = quote.items.find((q) => sameAs(q, p));
        const label = x?.label || (p.kind === 'points' ? `Đổi ${p.points} điểm` : p.kind === 'promo' ? 'Chương trình khuyến mại' : `Mã ${p.code}`);
        return (
          <div key={i} className="row gap-s"><Icon name="gift" size={16} /><span className="grow">{label}</span>{x ? <b>−{money(x.amount)}</b> : <span className="muted small">chưa áp dụng</span>}
            <button type="button" className="icon-btn" aria-label={`Bỏ ${label}`} onClick={() => setPromos(promos.filter((_, j) => j !== i))}><Icon name="x" size={15} /></button></div>
        );
      })}</div>}
    </Modal>
  );
}
