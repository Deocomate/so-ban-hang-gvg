// Báo khi máy chủ đã có bản mới: tab đang mở vẫn chạy mã cũ cho tới khi tải lại trang, nên so tệp mã chính đang chạy
// với tệp mã trong index.html mới nhất (kiểm tra mỗi 5 phút và mỗi khi quay lại tab), khác thì hiện thanh "Tải lại".
import React, { useEffect, useState } from 'react';

const MAIN = /assets\/index-[\w-]+\.js/;
const running = () => [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src').match(MAIN)?.[0]).find(Boolean);

export function NewVersionBar() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const cur = running();
    if (!cur) return undefined; // chạy dev (vite) không có tệp mã đóng gói
    let busy = false;
    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const html = await (await fetch('./', { cache: 'no-store' })).text();
        const latest = html.match(MAIN)?.[0];
        if (latest && latest !== cur) setFresh(true);
      } catch { /* mất mạng: lần sau kiểm tra lại */ } finally { busy = false; }
    };
    const t = setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);
  if (!fresh) return null;
  return (
    <div className="new-version" role="status">
      <span>Đã có bản cập nhật mới. Tải lại trang để dùng bản mới.</span>
      <button type="button" onClick={() => location.reload()}>Tải lại</button>
    </div>
  );
}
