// Kiểm thử công cụ nạp chứng từ KiotViet phát sinh (scripts/kiotviet-add-docs.js): tiền gắn vào chứng từ đúng như KiotViet
// — chạy: node test/kiotviet-add-docs.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db/index.js';
import { makeApi, suite, finish, rid } from './harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-add-docs-'));
const dbFile = path.join(dir, 'gomsu.db');
openDb(dbFile);
const api = makeApi();
const { G, C } = suite();

const owner = await api.user('chu@gomsu.vn');
api.as(owner);
const books = await api.call('bootstrap');
const TH = books.find((b) => b.short_name === 'TH').id;
await api.sql(`update books set is_demo = 0 where id = ?`, [TH]);
await api.call('import_products', { book_id: TH, request_id: rid(), opening_date: '2026-10-01', rows: [{ sku: 'BINH', name: 'Bình gốm', unit: 'Cái', cost: 500000, price1: 1000000, qty: 100 }] });
await api.call('save_party', { book_id: TH, type: 'kh', code: 'KH000900', name: 'Khách thử' });

// Tệp phát sinh: đơn đặt DH có cọc 5 triệu (TTDH), hóa đơn HD lập từ đơn: KiotViet chuyển 5 triệu cọc (cặp TTTU) và thu thêm 3 triệu (TTHD);
// phiếu thu 1 triệu khách trả nợ chung, KiotViet không ghi vào chứng từ nào.
const line = [{ ProductCode: 'BINH', Quantity: 10, Price: 1000000, Discount: 0 }];
const K = {
  orders: [{ Code: 'DH000900', Status: 3, CustomerCode: 'KH000900', PurchaseDate: '2026-11-01T09:00:00+07:00', CreatedDate: '2026-11-01T09:00:00+07:00',
    Total: 10000000, Discount: 0, Details: line, Payments: [{ Code: 'TTDH000900', Amount: 5000000 }, { Code: 'TTTUHD000900', Amount: -5000000 }, { Code: 'TTTUHD000900', Amount: 5000000 }] }],
  invoices: [{ Code: 'HD000900', Status: 1, OrderCode: 'DH000900', CustomerCode: 'KH000900', PurchaseDate: '2026-11-03T10:00:00+07:00', CreatedDate: '2026-11-03T10:00:00+07:00',
    Total: 10000000, TotalPayment: 8000000, Discount: 0, Details: line, Payments: [{ Code: 'TTHD000900', Amount: 3000000 }, { Code: 'TTTUHD000900', Amount: 5000000 }] }],
  cashflow: [
    { Code: 'TTDH000900', PartnerType: 'C', PartnerCode: 'KH000900', Amount: 5000000, Status: 0, Method: 'Cash', TransDate: '2026-11-01T09:05:00+07:00', CreatedDate: '2026-11-01T09:05:00+07:00' },
    { Code: 'TTHD000900', PartnerType: 'C', PartnerCode: 'KH000900', Amount: 3000000, Status: 0, Method: 'Cash', TransDate: '2026-11-03T10:01:00+07:00', CreatedDate: '2026-11-03T10:01:00+07:00' },
    { Code: 'TT000900', PartnerType: 'C', PartnerCode: 'KH000900', Amount: 1000000, Status: 0, Method: 'Cash', TransDate: '2026-11-05T08:00:00+07:00', CreatedDate: '2026-11-05T08:00:00+07:00' },
  ],
  expectedDebts: { KH000900: 1000000 },
};
const kFile = path.join(dir, 'phat-sinh.json'); const mFile = path.join(dir, 'ghep-ma.json');
fs.writeFileSync(kFile, JSON.stringify(K)); fs.writeFileSync(mFile, JSON.stringify({ mapping: {} }));
const out = execFileSync(process.execPath, [path.join(here, '../scripts/kiotviet-add-docs.js'), 'TH', kFile, mFile],
  { env: { ...process.env, DB_PATH: dbFile, TZ: 'Asia/Ho_Chi_Minh' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

G('1. Tiền cọc và phiếu thu của hóa đơn lập từ đơn đặt gắn như KiotViet');
C('Công cụ ghi xong', /Đã ghi vào CSDL/.test(out), true);
const inv = await api.one('order_invoices', TH, [['code', 'eq', 'HD000900']]);
C('Hóa đơn HD000900: tổng 10 triệu, trừ cọc 5 triệu', [inv.total, inv.deposit_used], [10000000, 5000000]);
C('Hóa đơn đã thu 8 triệu, còn nợ 2 triệu như KiotViet', [inv.paid, inv.debt], [8000000, 2000000]);
const pay = async (code) => api.one('payments', TH, [['code', 'eq', code]]);
C('Phiếu TTHD000900 gắn vào chính hóa đơn HD000900', (await pay('TTHD000900')).allocations.map((a) => a.doc_code), ['HD000900']);
C('Phiếu cọc TTDH000900 gắn vào đơn đặt', (await pay('TTDH000900')).allocations.map((a) => a.doc_code), ['DH000900']);

G('2. Phiếu trả nợ chung không tự trừ vào đơn nào');
C('TT000900 để riêng (1 triệu chưa gắn)', (await pay('TT000900')).unallocated, 1000000);
const cu = await api.one('customers', TH, [['code', 'eq', 'KH000900']]);
C('Công nợ khách khớp KiotViet: 1 triệu', cu.balance, 1000000);

try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows còn giữ tệp CSDL đang mở: để thư mục tạm lại */ }
finish('Nạp chứng từ KiotViet phát sinh: gắn tiền như KiotViet');
