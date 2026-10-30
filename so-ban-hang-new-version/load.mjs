import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
for (const f of ['00_demo_shim.sql','01_schema.sql','02_core.sql','03_views.sql','04_api.sql','05_reports.sql','06_ship_bank_notify.sql','07_ship_bank_extra.sql','08_carriers.sql','09_expenses.sql','10_documents.sql','11_weight.sql']) {
  try { await db.exec(fs.readFileSync('db/'+f,'utf8')); console.log('ok', f); }
  catch (e) { console.log('FAIL', f, e.message, e.position, e.where); process.exit(1); }
}
