import { createContext, useContext } from 'react';

// Thứ tự thời gian dùng chung cho cả module Báo cáo (chọn ở cột bên trái).
// Ngoài trang Báo cáo không có provider → giữ thứ tự cũ (cũ đến mới) để các trang khác không đổi.
export const ReportOrderCtx = createContext(false);
export const useNewestFirst = () => useContext(ReportOrderCtx);

// Sắp xếp một danh sách theo các khóa thời gian (ví dụ ngày rồi mã chứng từ), mới nhất trước khi newest = true.
export function byTime(rows, keys, newest) {
  const ks = Array.isArray(keys) ? keys : [keys];
  const cmp = (a, z) => { for (const k of ks) { const x = a[k] ?? '', y = z[k] ?? ''; if (x < y) return -1; if (x > y) return 1; } return 0; };
  return [...(rows || [])].sort((a, z) => (newest ? -cmp(a, z) : cmp(a, z)));
}

// Đảo cột tháng / ngày (vốn xếp tăng dần) khi chọn mới nhất trước
export const timeCols = (list, newest) => (newest ? [...list].reverse() : list);
