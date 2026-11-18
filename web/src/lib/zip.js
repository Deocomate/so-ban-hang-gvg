// Đóng gói tệp .zip ngay trên trình duyệt (không cần thư viện): nén deflate bằng CompressionStream khi trình duyệt hỗ trợ,
// nếu không thì lưu nguyên. Tên tệp UTF-8. files: [{ name: 'thu-muc/tep.json', data: string | Uint8Array }]
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

async function deflate(buf) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const out = await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return new Uint8Array(out);
  } catch (e) { return null; }
}

// Giờ DOS của tệp trong zip
function dosTime(d) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

export async function makeZip(files, when = new Date()) {
  const enc = new TextEncoder(); const { time, date } = dosTime(when);
  const parts = []; const central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const packed = raw.length > 256 ? await deflate(raw) : null;
    const useDeflate = packed && packed.length < raw.length;
    const body = useDeflate ? packed : raw; const crc = crc32(raw);
    const head = (sig, extra) => {
      const h = new DataView(new ArrayBuffer(extra ? 46 : 30));
      let i = 0; const u32 = (v) => { h.setUint32(i, v, true); i += 4; }; const u16 = (v) => { h.setUint16(i, v, true); i += 2; };
      u32(sig); if (extra) u16(20); u16(20); u16(0x0800); u16(useDeflate ? 8 : 0); u16(time); u16(date);
      u32(crc); u32(body.length); u32(raw.length); u16(name.length); u16(0);
      if (extra) { u16(0); u16(0); u16(0); u32(0); u32(offset); }
      return new Uint8Array(h.buffer);
    };
    const local = head(0x04034b50, false);
    central.push(head(0x02014b50, true), name);
    parts.push(local, name, body);
    offset += local.length + name.length + body.length;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
