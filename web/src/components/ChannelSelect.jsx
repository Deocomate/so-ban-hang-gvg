// Ô chọn kênh bán dùng chung: liệt kê kênh trong Cài đặt (+ kênh đang gắn trên chứng từ dù đã bị bỏ khỏi danh sách);
// chủ sổ có thêm mục "+ Thêm kênh bán…" để tạo kênh mới ngay tại chỗ, không phải vào Cài đặt.
import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store.jsx';
import { useSaveSettings } from '../pages/SettingsShell.jsx';
import { Select, Modal, Btn, Input } from './ui.jsx';

const ADD = '__add_channel__';

export function channelOptions(settings, extra = []) {
  return [...new Set([...(settings.channels || []), ...extra].map((x) => (x || '').trim()).filter(Boolean))];
}

export function ChannelSelect({ value, onChange, placeholder = 'Kênh bán', extra = [], allowAdd = true, ...rest }) {
  const { settings, can } = useApp();
  const { save, busy } = useSaveSettings();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const canAdd = allowAdd && can('owner');
  const options = useMemo(() => {
    const list = channelOptions(settings, [value, ...extra]).map((x) => ({ value: x, label: x }));
    return canAdd ? [...list, { value: ADD, label: '+ Thêm kênh bán mới…' }] : list;
  }, [settings.channels, value, extra.join('|'), canAdd]);
  const submit = async () => {
    const t = name.trim();
    if (!t) return;
    const cur = settings.channels || [];
    const exist = cur.find((x) => x.toLowerCase() === t.toLowerCase());
    if (!exist && !(await save({ channels: [...cur, t] }))) return;
    onChange(exist || t); setAdding(false); setName('');
  };
  return (
    <>
      <Select value={value || ''} onChange={(v) => (v === ADD ? setAdding(true) : onChange(v))} options={options} placeholder={placeholder} {...rest} />
      {adding && (
        <Modal title="Thêm kênh bán" onClose={() => setAdding(false)} size="sm"
          footer={<><Btn onClick={() => setAdding(false)}>Hủy</Btn><Btn kind="primary" busy={busy} onClick={submit}>Thêm và chọn</Btn></>}>
          <Input value={name} onChange={setName} placeholder="vd. Shopee, Zalo, Giới thiệu…" aria-label="Tên kênh bán" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
          <div className="muted small">Kênh mới được lưu vào Cài đặt → Kênh bán, dùng được cho mọi đơn của sổ này.</div>
        </Modal>
      )}
    </>
  );
}
