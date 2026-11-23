import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';

// Sau khi cập nhật bản mới, tab đang mở còn trỏ tới tệp cũ đã bị thay: tải lại một lần để lấy bản mới
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  try { if (sessionStorage.getItem('gomsu.reloaded') === '1') return; sessionStorage.setItem('gomsu.reloaded', '1'); } catch (err) { /* bỏ qua */ }
  location.reload();
});

createRoot(document.getElementById('root')).render(<App />);
setTimeout(() => { try { sessionStorage.removeItem('gomsu.reloaded'); } catch (err) { /* bỏ qua */ } }, 10000);
