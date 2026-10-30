// Chạy lần lượt mọi bộ kiểm thử (mỗi bộ một tiến trình, CSDL riêng trong bộ nhớ)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = ['business', 'ship-bank', 'expenses', 'documents', 'seed', 'import', 'excel', 'http'].map((f) => path.join(here, `${f}.test.js`));
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}
console.log(bad ? `\n${bad} bộ kiểm thử có lỗi` : '\nTất cả bộ kiểm thử đều đạt');
process.exit(bad ? 1 : 0);
