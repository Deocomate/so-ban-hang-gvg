// SQLite có sẵn trong Node (node:sqlite) — không cần biên dịch thư viện ngoài, chạy được cả trên máy chủ Linux đời cũ.
// Lớp này giữ đúng các lời gọi mà mã nguồn đang dùng: prepare, exec, pragma, transaction, function, backup, close.
import { DatabaseSync, backup as backupDb } from 'node:sqlite';

// node:sqlite trả cột BLOB dạng Uint8Array; đổi sang Buffer như mã nguồn vẫn dùng (toString('base64'), Buffer.isBuffer)
const toBuffer = (row) => {
  if (row) for (const k in row) if (row[k] instanceof Uint8Array && !Buffer.isBuffer(row[k])) row[k] = Buffer.from(row[k].buffer, row[k].byteOffset, row[k].byteLength);
  return row;
};

class Statement {
  #st;
  constructor(st, database) { this.#st = st; this.database = database; }
  // true khi câu lệnh trả về dòng (select, returning, pragma)
  get reader() { return this.#st.columns().length > 0; }
  get(...a) { return toBuffer(this.#st.get(...a)); }
  all(...a) { return this.#st.all(...a).map(toBuffer); }
  run(...a) { return this.#st.run(...a); }
}

export default class Database {
  #db;
  #depth = 0;

  constructor(file = ':memory:', { readonly = false } = {}) {
    this.#db = new DatabaseSync(file, { readOnly: readonly });
  }

  prepare(sql) { return new Statement(this.#db.prepare(sql), this); }
  exec(sql) { this.#db.exec(sql); return this; }
  close() { this.#db.close(); }
  function(name, options, fn) {
    if (typeof options === 'function') this.#db.function(name, options);
    else this.#db.function(name, options, fn);
    return this;
  }

  // pragma('x = y') hoặc pragma('x', { simple: true }) → giá trị cột đầu của dòng đầu
  pragma(text, { simple = false } = {}) {
    const rows = this.#db.prepare(`pragma ${text}`).all();
    return simple ? (rows[0] ? Object.values(rows[0])[0] : undefined) : rows;
  }

  // transaction(fn) trả về hàm chạy fn trong giao dịch; lồng nhau thì dùng savepoint, lỗi thì hoàn tác
  transaction(fn) {
    return (...args) => {
      const sp = `sp_${this.#depth}`;
      this.#db.exec(this.#depth === 0 ? 'begin' : `savepoint ${sp}`);
      this.#depth++;
      try {
        const out = fn(...args);
        this.#depth--;
        this.#db.exec(this.#depth === 0 ? 'commit' : `release ${sp}`);
        return out;
      } catch (e) {
        this.#depth--;
        if (this.#depth === 0) { if (this.#db.isTransaction) this.#db.exec('rollback'); }
        else this.#db.exec(`rollback to ${sp}; release ${sp}`);
        throw e;
      }
    };
  }

  backup(file) { return backupDb(this.#db, file); }
}
