// Chạy trên máy chủ qua scripts/prod-snapshot.sh: chụp CSDL (chỉ đọc) và in ra dạng gzip + base64
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import zlib from 'node:zlib';
const f = '/tmp/audit-snap.db';
try { fs.unlinkSync(f); } catch (e) { /* chưa có */ }
const db = new DatabaseSync('/var/lib/so-ban-hang-gom/gomsu.db', { readOnly: true });
db.exec(`vacuum into '${f}'`);
process.stdout.write(zlib.gzipSync(fs.readFileSync(f)).toString('base64'));
fs.unlinkSync(f);
