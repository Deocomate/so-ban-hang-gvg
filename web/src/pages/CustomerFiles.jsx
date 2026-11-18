// Kho tài liệu riêng của từng khách hàng, dùng như một thư mục Google Drive thu nhỏ:
// thư mục lồng nhau, kéo thả tệp / thư mục từ máy vào để tải lên, kéo mục vào thư mục khác để di chuyển,
// gắn link tài liệu ngoài và một link Google Drive riêng của khách.
import React, { useMemo, useRef, useState } from 'react';
import { useApp, useRpcData, useAction } from '../lib/store.jsx';
import { dmy } from '../lib/format.js';
import { saveFile } from '../lib/excel.js';
import { Btn, Icon, Field, Input, Loading, ErrorBox, Modal, ConfirmBtn, Note } from '../components/ui.jsx';

const DRAG_TYPE = 'application/x-gomsu-files';
const MAX_MB = 15;

const sizeText = (n) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
const isImage = (it) => /^image\//.test(it.mime || '');
const iconOf = (it) => (it.kind === 'folder' ? 'folder' : it.kind === 'link' ? 'link' : isImage(it) ? 'image' : 'file');
const readB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error(`Không đọc được tệp ${file.name}`)); r.readAsDataURL(file); });
const host = (url) => { try { return new URL(url).host.replace(/^www\./, ''); } catch (e) { return url; } };

// Đọc những gì được kéo thả từ máy: tệp lẻ và cả thư mục (giữ cấu trúc thư mục con)
async function droppedEntries(dt) {
  const items = [...(dt.items || [])].filter((i) => i.kind === 'file');
  const entries = items.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
  if (!entries.length || entries.some((e) => !e)) return [...(dt.files || [])].map((f) => ({ file: f }));
  const fileOf = (e) => new Promise((res, rej) => e.file(res, rej));
  const readAll = (dir) => new Promise((res, rej) => {
    const r = dir.createReader(); const out = [];
    const next = () => r.readEntries((batch) => { if (!batch.length) res(out); else { out.push(...batch); next(); } }, rej);
    next();
  });
  const walk = async (e) => (e.isDirectory ? { dir: e.name, children: await Promise.all((await readAll(e)).map(walk)) } : { file: await fileOf(e) });
  return Promise.all(entries.map(walk));
}

export function CustomerFiles({ customerId, customerName }) {
  const { rpc, can, toast, refresh } = useApp();
  const canEdit = can('ban_hang');
  const res = useRpcData('customer_files', { customer_id: customerId });
  const { run, busy } = useAction();
  const items = res.data?.items || [];
  const byId = useMemo(() => Object.fromEntries(items.map((x) => [x.id, x])), [items]);
  const [cwd, setCwd] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [dialog, setDialog] = useState(null);         // { kind: 'folder' | 'link' | 'rename' | 'move' | 'drive', item? }
  const [uploading, setUploading] = useState(null);   // { done, total, name }
  const [dropOn, setDropOn] = useState(null);         // id thư mục đang được kéo vào ('root' = thư mục đang mở)
  const fileInput = useRef(null);

  // Thư mục đang mở bị xóa (hoặc chưa nạp xong) → quay về gốc
  const folder = cwd && byId[cwd]?.kind === 'folder' ? cwd : null;
  const path = []; for (let x = folder; x; x = byId[x]?.parent_id) path.unshift(byId[x]);
  const list = items.filter((x) => (x.parent_id || null) === folder);
  const count = (id) => items.filter((x) => x.parent_id === id).length;
  const go = (id) => { setCwd(id); setSel(new Set()); };
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selected = list.filter((x) => sel.has(x.id));

  // ---------- Tải lên ----------
  const uploadTree = async (nodes, parentId) => {
    const flat = []; const countFiles = (ns) => ns.forEach((n) => (n.file ? flat.push(n) : countFiles(n.children)));
    countFiles(nodes);
    const big = flat.filter((n) => n.file.size > MAX_MB * 1024 * 1024);
    if (big.length) toast(`Bỏ qua ${big.length} tệp lớn hơn ${MAX_MB} MB (${big.map((n) => n.file.name).join(', ')}) — hãy để trên Google Drive rồi gắn link`, 'err');
    const total = flat.length - big.length; let done = 0; let failed = 0;
    if (!total && !nodes.some((n) => n.dir)) return;
    setUploading({ done, total, name: '' });
    const put = async (ns, pid) => {
      for (const n of ns) {
        try {
          if (n.dir) { const r = await rpc('create_customer_folder', { customer_id: customerId, parent_id: pid, name: n.dir }); await put(n.children, r.id); continue; }
          if (n.file.size > MAX_MB * 1024 * 1024) continue;
          setUploading({ done, total, name: n.file.name });
          await rpc('upload_customer_file', { customer_id: customerId, parent_id: pid, name: n.file.name, mime: n.file.type, base64: await readB64(n.file) });
          done++;
        } catch (e) { failed++; toast(e.message, 'err'); }
      }
    };
    try { await put(nodes, parentId); } finally { setUploading(null); refresh(); }
    if (done) toast(`Đã tải lên ${done} tệp${failed ? `, ${failed} tệp lỗi` : ''}`);
  };

  // ---------- Kéo thả ----------
  const isInternal = (e) => [...(e.dataTransfer?.types || [])].includes(DRAG_TYPE);
  const isFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const dragIds = (it) => (sel.has(it.id) ? [...sel] : [it.id]);
  const onDragStart = (e, it) => { e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragIds(it))); e.dataTransfer.effectAllowed = 'move'; };
  // target: id thư mục đích; null = gốc; 'here' = thư mục đang mở
  const dropProps = (target, key) => (!canEdit ? {} : {
    onDragOver: (e) => {
      if (!isInternal(e) && !isFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = isInternal(e) ? 'move' : 'copy';
      if (dropOn !== key) setDropOn(key);
    },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropOn((k) => (k === key ? null : k)); },
    onDrop: async (e) => {
      if (!isInternal(e) && !isFiles(e)) return;
      e.preventDefault(); e.stopPropagation(); setDropOn(null);
      const dest = target === 'here' ? folder : target;
      if (isInternal(e)) {
        const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '[]').filter((id) => id !== dest && (byId[id]?.parent_id || null) !== dest);
        if (ids.length && await run('move_customer_items', { ids, parent_id: dest }, `Đã chuyển ${ids.length} mục vào ${dest ? byId[dest]?.name : 'thư mục gốc'}`)) setSel(new Set());
        return;
      }
      await uploadTree(await droppedEntries(e.dataTransfer), dest);
    },
  });

  // ---------- Mở / tải tệp ----------
  const openItem = async (it) => {
    if (it.kind === 'folder') return go(it.id);
    if (it.kind === 'link') { window.open(it.url, '_blank', 'noopener'); return undefined; }
    // Mở sẵn tab ngay lúc bấm (trình duyệt chặn tab mở sau khi chờ tải)
    const viewable = isImage(it) || /pdf|^text\//.test(it.mime || '');
    const w = viewable ? window.open('', '_blank') : null;
    try {
      const f = await rpc('get_customer_file', { id: it.id });
      const blob = new Blob([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], { type: f.mime || 'application/octet-stream' });
      if (w && !w.closed) { w.location.href = URL.createObjectURL(blob); return undefined; }
      await saveFile(f.name, blob);
    } catch (e) { if (w) w.close(); toast(e.message, 'err'); }
    return undefined;
  };
  const download = async (it) => {
    try {
      const f = await rpc('get_customer_file', { id: it.id });
      await saveFile(f.name, new Blob([Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))], { type: f.mime || 'application/octet-stream' }));
    } catch (e) { toast(e.message, 'err'); }
  };

  if (!res.data) return res.error ? <ErrorBox error={res.error} /> : <Loading />;
  const drive = res.data.drive_url;
  return (
    <div className="stack cf">
      <div className="cf-drive">
        <Icon name="drive" size={20} />
        {drive ? <>
          <div className="grow"><div className="strong">Google Drive của khách</div><a className="small cf-url" href={drive} target="_blank" rel="noopener noreferrer">{drive}</a></div>
          <Btn small kind="soft" icon="ext" onClick={() => window.open(drive, '_blank', 'noopener')}>Mở Drive</Btn>
          {canEdit && <Btn small icon="edit" onClick={() => setDialog({ kind: 'drive' })}>Đổi link</Btn>}
        </> : <>
          <div className="grow muted small">Chưa gắn thư mục Google Drive riêng cho khách này.</div>
          {canEdit && <Btn small icon="link" onClick={() => setDialog({ kind: 'drive' })}>Gắn link Google Drive</Btn>}
        </>}
      </div>

      <div className="cf-bar">
        <nav className="cf-crumbs" aria-label="Đường dẫn thư mục">
          <button type="button" className={`cf-crumb${dropOn === 'crumb-root' ? ' drop' : ''}`} onClick={() => go(null)} {...dropProps(null, 'crumb-root')}>
            <Icon name="folder" size={15} /> Tài liệu {customerName ? `· ${customerName}` : ''}</button>
          {path.map((p) => <React.Fragment key={p.id}><Icon name="chev" size={14} className="muted" />
            <button type="button" className={`cf-crumb${dropOn === 'crumb-' + p.id ? ' drop' : ''}`} onClick={() => go(p.id)} {...dropProps(p.id, 'crumb-' + p.id)}>{p.name}</button></React.Fragment>)}
        </nav>
        <span className="grow" />
        {canEdit && <>
          <Btn small icon="folder-plus" onClick={() => setDialog({ kind: 'folder' })}>Thư mục mới</Btn>
          <Btn small icon="link" onClick={() => setDialog({ kind: 'link' })}>Thêm link</Btn>
          <Btn small kind="primary" icon="up" busy={!!uploading} onClick={() => fileInput.current?.click()}>Tải tệp lên</Btn>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; uploadTree(fs.map((file) => ({ file })), folder); }} />
        </>}
      </div>

      {selected.length > 0 && canEdit && (
        <div className="cf-selbar">
          <b>Đã chọn {selected.length}</b>
          <Btn small icon="folder-move" onClick={() => setDialog({ kind: 'move' })}>Di chuyển tới…</Btn>
          <ConfirmBtn small icon="trash" busy={busy} confirmText={selected.some((x) => x.kind === 'folder') ? 'Xóa cả nội dung trong thư mục? Bấm lần nữa' : 'Bấm lần nữa để xóa'}
            onConfirm={async () => { if (await run('delete_customer_items', { ids: selected.map((x) => x.id) }, `Đã xóa ${selected.length} mục`)) setSel(new Set()); }}>Xóa</ConfirmBtn>
          <span className="grow" />
          <button type="button" className="link-btn small" onClick={() => setSel(new Set())}>Bỏ chọn</button>
        </div>
      )}
      {uploading && <Note>Đang tải lên {uploading.done + 1}/{Math.max(uploading.total, 1)}{uploading.name ? `: ${uploading.name}` : ''}…</Note>}

      <div className={`cf-zone${dropOn === 'here' ? ' drop' : ''}`} {...dropProps('here', 'here')}>
        {list.length === 0 ? (
          <div className="cf-empty">
            <Icon name="folder" size={34} />
            <div className="strong">{folder ? 'Thư mục trống' : 'Chưa có tài liệu nào'}</div>
            {canEdit && <div className="small muted">Kéo thả tệp hoặc cả thư mục từ máy vào đây để tải lên (mỗi tệp tối đa {MAX_MB} MB).<br />Hợp đồng, biên bản bàn giao, đối chiếu công nợ, bản vẽ… nên xếp vào từng thư mục.</div>}
          </div>
        ) : (
          <div className="table-wrap"><table className="tbl dense cf-tbl"><tbody>
            {list.map((it) => (
              <tr key={it.id} className={`clickable${sel.has(it.id) ? ' row-sel' : ''}${dropOn === it.id ? ' cf-drop-row' : ''}`} draggable={canEdit}
                onDragStart={(e) => onDragStart(e, it)} onDragEnd={() => setDropOn(null)} {...(it.kind === 'folder' ? dropProps(it.id, it.id) : {})}
                onClick={() => openItem(it)}>
                {canEdit && <td className="cf-chk" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Chọn ${it.name}`} checked={sel.has(it.id)} onChange={() => toggle(it.id)} /></td>}
                <td className="col-fill">
                  <div className="cf-name"><span className={`cf-ico cf-ico-${it.kind}`}><Icon name={iconOf(it)} size={18} /></span>
                    <div className="cf-name-txt"><div className="cell-main" title={it.name}>{it.name}</div>
                      <div className="cell-sub">{it.kind === 'folder' ? `${count(it.id)} mục` : it.kind === 'link' ? host(it.url) : sizeText(it.size)}</div></div>
                  </div>
                </td>
                <td className="cf-meta small muted">{dmy((it.updated_at || it.created_at)?.slice(0, 10))}{it.created_by_name ? <div>{it.created_by_name}</div> : null}</td>
                <td className="cf-act" onClick={(e) => e.stopPropagation()}>
                  {it.kind === 'file' && <button type="button" className="icon-btn" title="Tải về" aria-label={`Tải ${it.name}`} onClick={() => download(it)}><Icon name="dl" size={16} /></button>}
                  {it.kind === 'link' && <button type="button" className="icon-btn" title="Mở link" aria-label={`Mở ${it.name}`} onClick={() => window.open(it.url, '_blank', 'noopener')}><Icon name="ext" size={16} /></button>}
                  {canEdit && <button type="button" className="icon-btn" title="Đổi tên" aria-label={`Đổi tên ${it.name}`} onClick={() => setDialog({ kind: 'rename', item: it })}><Icon name="edit" size={16} /></button>}
                  {canEdit && <button type="button" className="icon-btn" title="Di chuyển" aria-label={`Di chuyển ${it.name}`} onClick={() => { setSel(new Set([it.id])); setDialog({ kind: 'move' }); }}><Icon name="folder-move" size={16} /></button>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        {canEdit && list.length > 0 && <div className="small muted cf-hint">Kéo thả tệp từ máy vào đây để tải lên · kéo một mục thả vào thư mục (hoặc vào đường dẫn phía trên) để di chuyển.</div>}
      </div>

      {dialog?.kind === 'folder' && <NameDialog title="Thư mục mới" label="Tên thư mục" placeholder="Ví dụ: Hợp đồng, Biên bản bàn giao" onClose={() => setDialog(null)}
        onSave={(name) => run('create_customer_folder', { customer_id: customerId, parent_id: folder, name }, 'Đã tạo thư mục ' + name)} />}
      {dialog?.kind === 'link' && <NameDialog title="Thêm link tài liệu" label="Tên hiển thị" withUrl placeholder="Ví dụ: Bản vẽ mái, Hồ sơ năng lực" onClose={() => setDialog(null)}
        onSave={(name, url) => run('add_customer_link', { customer_id: customerId, parent_id: folder, name, url }, 'Đã thêm link')} />}
      {dialog?.kind === 'rename' && <NameDialog title={dialog.item.kind === 'link' ? 'Sửa link' : 'Đổi tên'} label="Tên" initial={dialog.item.name} withUrl={dialog.item.kind === 'link'} initialUrl={dialog.item.url}
        onClose={() => setDialog(null)} onSave={(name, url) => run('update_customer_item', { id: dialog.item.id, name, ...(dialog.item.kind === 'link' ? { url } : {}) }, 'Đã lưu')} />}
      {dialog?.kind === 'drive' && <NameDialog title="Link Google Drive riêng của khách" label="Link thư mục Google Drive" urlOnly initialUrl={drive} allowEmpty
        hint="Mở thư mục của khách trên Google Drive, bấm Chia sẻ → Sao chép đường liên kết rồi dán vào đây. Để trống để bỏ link."
        onClose={() => setDialog(null)} onSave={(_, url) => run('set_customer_drive', { customer_id: customerId, url }, url ? 'Đã gắn link Google Drive' : 'Đã bỏ link Google Drive')} />}
      {dialog?.kind === 'move' && <MoveDialog items={items} moving={items.filter((x) => sel.has(x.id))} onClose={() => setDialog(null)}
        onMove={async (dest) => { const ok = await run('move_customer_items', { ids: [...sel], parent_id: dest }, 'Đã di chuyển'); if (ok) setSel(new Set()); return ok; }} />}
    </div>
  );
}

function NameDialog({ title, label, placeholder, initial = '', withUrl, urlOnly, initialUrl = '', allowEmpty, hint, onSave, onClose }) {
  const [name, setName] = useState(initial); const [url, setUrl] = useState(initialUrl || '');
  const [busy, setBusy] = useState(false);
  const needUrl = withUrl || urlOnly;
  const ok = (urlOnly || name.trim()) && (!needUrl || allowEmpty || url.trim());
  const submit = async () => { if (!ok) return; setBusy(true); const r = await onSave(name.trim(), url.trim()); setBusy(false); if (r) onClose(); };
  return (
    <Modal title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} disabled={!ok} onClick={submit}>Lưu</Btn></>}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {!urlOnly && <Field label={label}><Input value={name} onChange={setName} placeholder={placeholder} autoFocus maxLength={200} /></Field>}
        {needUrl && <Field label={urlOnly ? label : 'Đường link'} hint={hint}><Input value={url} onChange={setUrl} placeholder="https://drive.google.com/…" autoFocus={urlOnly} inputMode="url" /></Field>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// Chọn thư mục đích dạng cây; không cho chọn thư mục đang chuyển hoặc thư mục con của nó
function MoveDialog({ items, moving, onMove, onClose }) {
  const [dest, setDest] = useState(null); const [busy, setBusy] = useState(false);
  const blocked = useMemo(() => {
    const out = new Set(moving.filter((x) => x.kind === 'folder').map((x) => x.id)); let grew = true;
    while (grew) { grew = false; for (const x of items) if (x.kind === 'folder' && out.has(x.parent_id) && !out.has(x.id)) { out.add(x.id); grew = true; } }
    return out;
  }, [items, moving]);
  const folders = items.filter((x) => x.kind === 'folder');
  const tree = (pid, depth) => folders.filter((f) => (f.parent_id || null) === pid).flatMap((f) => [{ f, depth }, ...tree(f.id, depth + 1)]);
  const rows = tree(null, 1);
  const opt = (id, name, depth, disabled) => (
    <button type="button" key={id || 'root'} disabled={disabled} className={`cf-tree-item${dest === id ? ' on' : ''}`} style={{ paddingLeft: 10 + depth * 18 }} onClick={() => setDest(id)}>
      <Icon name="folder" size={16} /> {name}
    </button>
  );
  return (
    <Modal title={`Di chuyển ${moving.length} mục`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Thôi</Btn><Btn kind="primary" busy={busy} onClick={async () => { setBusy(true); const r = await onMove(dest); setBusy(false); if (r) onClose(); }}>Chuyển vào đây</Btn></>}>
      <div className="small muted">Chọn thư mục đích:</div>
      <div className="cf-tree">
        {opt(null, 'Tài liệu (thư mục gốc)', 0, false)}
        {rows.map(({ f, depth }) => opt(f.id, f.name, depth, blocked.has(f.id)))}
      </div>
    </Modal>
  );
}
