// Địa chỉ trang sửa mẫu in (mở ở tab riêng) và tín hiệu báo các tab khác khi mẫu vừa lưu.
// Tách riêng để màn hình chính không phải tải cả trình soạn (TipTap) — trang sửa mẫu được nạp khi cần.
import { DOC_TYPES } from './model.js';

// ?mau-in=<loại>&tpl=<mã mẫu | new>&book=<sổ>
export function readEditorLink() {
  try { const u = new URLSearchParams(location.search); const type = u.get('mau-in'); return type && DOC_TYPES[type] ? { type, tpl: u.get('tpl') || '', book: u.get('book') || '' } : null; } catch (e) { return null; }
}
export function editorUrl({ book, type, tpl }) {
  const u = new URLSearchParams({ 'mau-in': type }); if (tpl) u.set('tpl', tpl); if (book) u.set('book', book);
  return `${location.pathname}?${u.toString()}`;
}
export function openTemplateEditor(params) { window.open(editorUrl(params), '_blank'); }

export const TPL_CHANNEL = 'gomsu-print-templates';
export function announceTemplates(bookId) { try { const c = new BroadcastChannel(TPL_CHANNEL); c.postMessage({ book: bookId, at: Date.now() }); c.close(); } catch (e) { /* trình duyệt cũ */ } }
// Nghe tín hiệu: tab khác vừa lưu mẫu in → nạp lại cài đặt sổ
export function onTemplatesChanged(fn) {
  let c = null; try { c = new BroadcastChannel(TPL_CHANNEL); c.onmessage = (e) => fn(e.data); } catch (e) { /* bỏ qua */ }
  return () => { try { c?.close(); } catch (e) { /* bỏ qua */ } };
}
