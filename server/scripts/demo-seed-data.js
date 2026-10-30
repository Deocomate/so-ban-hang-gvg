// Dữ liệu mẫu cho bản chạy thử (KHÔNG dùng cho dữ liệu thật). Ngày tính lùi từ hôm nay.
// call(fn, p) gọi hàm nghiệp vụ; mọi số liệu đi qua đúng các quy tắc như khi dùng thật.
// Mẫu chứng từ: hộ kinh doanh phát hành hóa đơn / đơn đặt hàng / phiếu thu; công ty phát hành biên bản bàn giao
function demoDocs(withCompany, thLogo = '') {
  const hkd = { id: 'hkd', name: 'HỘ KINH DOANH GỐM SỨ MAI HIẾU', legal_name: 'Hộ kinh doanh gốm sứ Mai Hiếu', address: 'Số 18 Thôn 2 Giang Cao - Xã Bát Tràng - TP. Hà Nội',
    phone: '0966.55.8808', email: 'vtmai88@gmail.com', website: '', bank_line: '1106738888 - Vietcombank Hưng Yên', representative: 'Vũ Thanh Mai', rep_title: 'Người đại diện hộ kinh doanh', logo: '' };
  const cty = { id: 'cty', name: 'CÔNG TY TNHH SẢN XUẤT & THƯƠNG MẠI THANH HẢI', legal_name: 'Công ty TNHH Sản xuất và Thương mại Thanh Hải',
    address: 'Số 41 Xóm 6 Thôn Giang Cao – Xã Bát Tràng – Thành phố Hà Nội', phone: '0966.55.8808', email: 'gshaithanh@gmail.com', website: 'www.gomsuxaydung.com',
    bank_line: '', representative: 'Vũ Thanh Mai', rep_title: 'Giám đốc', logo: thLogo };
  return { profiles: withCompany ? [hkd, cty] : [hkd], types: withCompany ? { bien_ban: { profile: 'cty', sep: '.' } } : {} };
}

export async function seedDemo({ call, ensureUser, setUser, today, onProgress = () => {}, logo = '' }) {
  const D = (n) => { const t = new Date(today + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
  const owner = await ensureUser('chu.cuahang@demo.vn', 'Chủ cửa hàng (demo)');
  const staff = await ensureUser('lan.nhanvien@demo.vn', 'Nhân viên Lan (demo)');
  setUser(owner);
  const books = await call('bootstrap', {});
  const TH = books.find((b) => b.short_name === 'TH').id;
  const VG = books.find((b) => b.short_name === 'VG').id;
  await call('update_book_settings', { book_id: TH, name: 'Gốm sứ Thanh Hải (mẫu)', settings: {} });
  await call('update_book_settings', { book_id: VG, name: 'Gốm Vũ Gia (mẫu)', settings: {} });
  for (const b of [TH, VG]) {
    await call('upsert_member', { book_id: b, email: 'lan.nhanvien@demo.vn', role: 'staff', display_name: 'Nhân viên Lan',
      perms: { ban_hang: true, thu_chi: true, nhap_hang: true, kho: false, danh_muc: false, chi_phi: false, xem_gia_von: false, xem_bao_cao: false } });
  }

  async function setupBook(b, cfg) {
    const funds = await call('q', { view: 'funds', book_id: b });
    const F = {};
    for (const f of funds) {
      const key = f.name === 'Tiền mặt' ? 'TM' : 'NH';
      await call('save_fund', { book_id: b, id: f.id, name: f.name, opening_balance: cfg.funds[key] });
      F[key] = f.id;
    }
    const KL = (await call('q', { view: 'customers', book_id: b, filters: [['code', 'eq', 'KL']] }))[0].id;
    const C = { KL };
    for (const [k, c] of Object.entries(cfg.customers)) C[k] = (await call('save_party', { book_id: b, type: 'kh', ...c })).id;
    const S = {};
    for (const [k, s] of Object.entries(cfg.suppliers)) S[k] = (await call('save_party', { book_id: b, type: 'ncc', ...s })).id;
    await call('import_products', { book_id: b, request_id: rid(), opening_date: D(40), rows: cfg.products, note: 'Tồn đầu kỳ (dữ liệu mẫu)' });
    const prods = await call('q', { view: 'products', book_id: b });
    const P = Object.fromEntries(prods.map((p) => [p.sku, p.id]));
    for (const k of cfg.kits) {
      const r = await call('save_product', { book_id: b, ...k, is_kit: true, components: k.components.map(([sku, q]) => ({ product_id: P[sku], qty: q })) });
      P[k.sku] = r.id;
    }
    for (const d of cfg.debts) await call('save_opening_debt', { book_id: b, ...d, party_id: d.party_type === 'kh' ? C[d.party] : S[d.party], debt_date: D(40) });
    return { F, C, S, P };
  }

  const order = (b, p) => call('save_sales_order', { book_id: b, request_id: rid(), ...p });
  const po = (b, p) => call('save_purchase_order', { book_id: b, request_id: rid(), ...p });
  const pay = (b, p) => call('create_payment', { book_id: b, request_id: rid(), ...p });
  const lines = async (b, oid) => call('q', { view: 'sales_order_lines', book_id: b, filters: [['order_id', 'eq', oid]], order: 'line_no' });
  const polines = async (b, pid) => call('q', { view: 'purchase_order_lines', book_id: b, filters: [['po_id', 'eq', pid]], order: 'line_no' });

  // ===================== GỐM SỨ THANH HẢI =====================
  onProgress('Đang tạo dữ liệu mẫu: Gốm sứ Thanh Hải…');
  const th = await setupBook(TH, {
    funds: { TM: 25000000, NH: 180000000 },
    customers: {
      MP: { name: 'Đại lý Minh Phát', phone: '0912 000 001', address: 'TP Bắc Ninh', kind: 'Đại lý', price_tier: 2, credit_days: 30, credit_limit: 200000000 },
      CHUA: { name: 'Chùa Phúc Lâm (công trình)', phone: '0912 000 002', address: 'Phủ Lý, Hà Nam', kind: 'Công trình', price_tier: 3, credit_days: 15 },
      HB: { name: 'Công ty XD Hòa Bình', phone: '0243 555 1234', address: 'Long Biên, Hà Nội', kind: 'Công trình', price_tier: 3, credit_days: 30, credit_limit: 300000000 },
      DUNG: { name: 'Chú Dũng', phone: '0976389811', address: 'Cầu Trà Lý - Tiền Hải - Thái Bình', kind: 'Khách lẻ', price_tier: 1, credit_days: 15 },
      LPH: { name: 'Hộ kinh doanh Lý Phương Hoa', phone: '0855069898', address: 'Khu Đảo nổi Sông Hồng - Thôn Thái Phú Đoài - Xã Vũ Tiên - Tỉnh Hưng Yên', kind: 'Đại lý', price_tier: 2, credit_days: 30 },
      NAM: { name: 'Anh Nam – Gia Lâm', phone: '0903 111 222', address: 'Gia Lâm, Hà Nội', kind: 'Khách lẻ', price_tier: 1, credit_days: 0 },
    },
    suppliers: {
      HT: { name: 'Xưởng gốm Hưng Thịnh', phone: '0988 000 001', address: 'Bát Tràng', contact: 'Anh Thịnh', credit_days: 30 },
      QV: { name: 'Lò men Quang Vinh', phone: '0988 000 002', address: 'Bát Tràng', contact: 'Chị Vinh', credit_days: 10 },
      XT: { name: 'Xe tải Minh Đức (vận chuyển)', phone: '0977 333 444', credit_days: 15 },
    },
    products: [
      { sku: 'NAD-L-DO', name: 'Ngói âm dương cỡ L', category: 'Ngói', pattern: 'Âm dương', size: 'L', color: 'Đỏ gốm', unit: 'Viên', cost: 10000, price1: 18000, price2: 16000, price3: 15000, qty: 4200, low_stock: 1000, units_per_pack: 40 },
      { sku: 'NAD-M-DO', name: 'Ngói âm dương cỡ M', category: 'Ngói', pattern: 'Âm dương', size: 'M', color: 'Đỏ gốm', unit: 'Viên', cost: 8000, price1: 14500, price2: 13000, price3: 12000, qty: 3000, low_stock: 800, units_per_pack: 50 },
      { sku: 'NAD-L-XD', name: 'Ngói âm dương L men xanh đồng', category: 'Ngói', pattern: 'Âm dương', size: 'L', color: 'Xanh đồng', unit: 'Viên', cost: 15000, price1: 25000, price2: 22000, price3: 21000, qty: 900, low_stock: 1000 },
      { sku: 'NMH-DO', name: 'Ngói mũi hài cổ', category: 'Ngói', pattern: 'Mũi hài', size: '20x13', color: 'Đỏ gốm', unit: 'Viên', cost: 6000, price1: 11000, price2: 9800, price3: 9200, qty: 6500, low_stock: 1500 },
      { sku: 'GTG-HB-XD', name: 'Gạch thông gió hoa bưởi', category: 'Gạch thông gió', pattern: 'Hoa bưởi', size: '30x30', color: 'Xanh đồng', unit: 'Viên', cost: 28000, price1: 45000, price2: 40000, price3: 38000, qty: 420, low_stock: 100 },
      { sku: 'GTG-CT-NDL', name: 'Gạch thông gió chữ thọ', category: 'Gạch thông gió', pattern: 'Chữ thọ', size: '30x30', color: 'Nâu da lươn', unit: 'Viên', cost: 26000, price1: 42000, price2: 37000, price3: 35000, qty: 260, low_stock: 100 },
      { sku: 'GTG-TD-TR', name: 'Gạch thông gió tứ diệp', category: 'Gạch thông gió', pattern: 'Tứ diệp', size: '25x25', color: 'Trắng', unit: 'Viên', cost: 22000, price1: 36000, price2: 32000, price3: 30000, qty: 80, low_stock: 100 },
      { sku: 'LC-CT60-NDL', name: 'Lan can con tiện cao 60', category: 'Lan can - con tiện', pattern: 'Con tiện', size: 'Cao 60', color: 'Nâu da lươn', unit: 'Cái', cost: 70000, price1: 120000, price2: 115000, price3: 110000, qty: 0, low_stock: 0 },
      { sku: 'DV-LG-60', name: 'Đèn vườn lục giác', category: 'Đèn vườn', pattern: 'Lục giác', size: 'Cao 60', color: 'Men rạn', unit: 'Cái', cost: 650000, price1: 1150000, price2: 1000000, price3: 950000, qty: 6, low_stock: 2 },
      { sku: 'NGHE-40-VHG', name: 'Nghê phong thủy 40cm', category: 'Linh vật - phong thủy', pattern: 'Nghê', size: '40cm', color: 'Vàng hoàng gia', unit: 'Đôi', cost: 2000000, price1: 3500000, price2: 3000000, price3: 2800000, qty: 4, low_stock: 2 },
      { sku: 'NA80-DC', name: 'Ngói âm 80 đỏ cờ', category: 'Ngói', pattern: 'Ngói âm', size: '80', color: 'Đỏ cờ', unit: 'Viên', cost: 6000, price1: 10000, price2: 9500, price3: 9000, qty: 3000, low_stock: 500, units_per_pack: 140, pack_unit: 'thùng', pack_weight: 28, unit_weight: 0.2 },
      { sku: 'ND80-DC', name: 'Ngói dương 80 đỏ cờ', category: 'Ngói', pattern: 'Ngói dương', size: '80', color: 'Đỏ cờ', unit: 'Viên', cost: 6000, price1: 10000, price2: 9500, price3: 9000, qty: 3000, low_stock: 500, units_per_pack: 170, pack_unit: 'thùng', pack_weight: 34, unit_weight: 0.2 },
      { sku: 'DA80-DC-HP', name: 'Diềm âm 80 đỏ cờ hổ phù', category: 'Phụ kiện mái', pattern: 'Diềm âm hổ phù', size: '80', color: 'Đỏ cờ', unit: 'Viên', cost: 12000, price1: 20000, price2: 19000, price3: 18000, qty: 1200, low_stock: 200, units_per_pack: 100, pack_unit: 'thùng', pack_weight: 30, unit_weight: 0.3 },
      { sku: 'DD80-DC', name: 'Diềm dương 80 đỏ cờ', category: 'Phụ kiện mái', pattern: 'Diềm dương', size: '80', color: 'Đỏ cờ', unit: 'Viên', cost: 12000, price1: 20000, price2: 19000, price3: 18000, qty: 1200, low_stock: 200, units_per_pack: 144, pack_unit: 'thùng', pack_weight: 29, unit_weight: 0.2 },
      { sku: 'DA-L-GAK', name: 'Diềm âm size L hổ phù ghi ánh kim', category: 'Phụ kiện mái', pattern: 'Diềm âm hổ phù', size: 'L', color: 'Ghi ánh kim', unit: 'Viên', cost: 15000, price1: 26000, price2: 24000, price3: 23000, qty: 800, low_stock: 100, units_per_pack: 16 },
      { sku: 'DD-L-GAK', name: 'Diềm dương size L ghi ánh kim', category: 'Phụ kiện mái', pattern: 'Diềm dương', size: 'L', color: 'Ghi ánh kim', unit: 'Viên', cost: 15000, price1: 26000, price2: 24000, price3: 23000, qty: 800, low_stock: 100, units_per_pack: 48 },
      { sku: 'NA-L-GAK', name: 'Ngói âm size L ghi ánh kim', category: 'Ngói', pattern: 'Ngói âm', size: 'L', color: 'Ghi ánh kim', unit: 'Viên', cost: 9000, price1: 15000, price2: 13500, price3: 13000, qty: 8000, low_stock: 1000, units_per_pack: 40 },
      { sku: 'ND-L-GAK', name: 'Ngói dương size L ghi ánh kim', category: 'Ngói', pattern: 'Ngói dương', size: 'L', color: 'Ghi ánh kim', unit: 'Viên', cost: 9000, price1: 15000, price2: 13500, price3: 13000, qty: 5000, low_stock: 1000, units_per_pack: 45 },
      { sku: 'PK-DIEM27', name: 'Diềm mái hoa sen D27', category: 'Phụ kiện mái', pattern: 'Diềm 27', size: '27cm', color: 'Đỏ gốm', unit: 'Viên', cost: 12000, price1: 22000, price2: 19000, price3: 18000, qty: 600, low_stock: 200 },
    ],
    kits: [{ sku: 'BO-MAU-NG', name: 'Bộ mẫu ngói + gạch (trưng bày)', category: 'Khác', unit: 'Bộ', price1: 260000, price2: 240000, price3: 230000,
      components: [['NAD-L-DO', 10], ['GTG-HB-XD', 2]] }],
    debts: [
      { party_type: 'kh', party: 'MP', amount: 18000000, due_date: D(5), note: 'Nợ cũ trước khi dùng phần mềm' },
      { party_type: 'ncc', party: 'HT', amount: 25000000, due_date: D(-10), note: 'Nợ cũ trước khi dùng phần mềm' },
    ],
  });
  {
    const { F, C, S, P } = th;
    await order(TH, { customer_id: C.KL, order_date: D(38), channel: 'Bán tại cửa hàng', lines: [{ product_id: P['NAD-L-DO'], qty: 200 }], deliver_now: true, deposit: { amount: 3600000, fund_id: F.TM, method: 'Tiền mặt' } });
    const mp1 = await order(TH, { customer_id: C.MP, order_date: D(26), channel: 'Bán tại cửa hàng', staff: 'Anh Hải', discount: 0, shipping_fee: 500000,
      lines: [{ product_id: P['NAD-L-DO'], qty: 1500, discount_pct: 3 }, { product_id: P['NMH-DO'], qty: 300 }], deliver_now: true });
    await pay(TH, { kind: 'thu_khach', date: D(20), fund_id: F.NH, party_id: C.MP, amount: 30000000, method: 'Chuyển khoản', note: 'Đại lý chuyển khoản', auto_allocate: true });

    const chua = await order(TH, { customer_id: C.CHUA, kind: 'dat_hang', order_date: D(30), due_date: D(-5), status: 'xac_nhan', channel: 'Bán tại cửa hàng', staff: 'Chị Lan',
      note: 'Lan can sân chùa, giao 2 đợt', lines: [{ product_id: P['LC-CT60-NDL'], qty: 300 }], deposit: { amount: 12000000, fund_id: F.NH, method: 'Chuyển khoản' } });
    const chuaLine = (await lines(TH, chua.id))[0];
    const poQV = await po(TH, { kind: 'dat_sx', supplier_id: S.QV, order_date: D(30), expected_date: D(3), sales_order_id: chua.id, status: 'xac_nhan',
      lines: [{ product_id: P['LC-CT60-NDL'], qty: 300, unit_cost: 70000, sales_order_line_id: chuaLine.id }], deposit: { amount: 5000000, fund_id: F.NH } });
    await call('set_prod_step', { id: poQV.id, step: 'Đang trong lò' });
    const qvl = (await polines(TH, poQV.id))[0];
    await call('receive', { po_id: poQV.id, request_id: rid(), date: D(12), lines: [{ po_line_id: qvl.id, qty: 150 }], note: 'Đợt 1' });
    await call('deliver', { order_id: chua.id, request_id: rid(), date: D(11), lines: [{ order_line_id: chuaLine.id, qty: 150 }], note: 'Giao đợt 1' });
    await call('set_prod_step', { id: poQV.id, step: 'Đã sản xuất, chưa giao hàng' });

    await po(TH, { kind: 'mua_san', supplier_id: S.HT, order_date: D(28), receive_now: true, lines: [{ product_id: P['NAD-L-DO'], qty: 2000, unit_cost: 11500 }], deposit: { amount: 10000000, fund_id: F.NH } });

    const hb = await order(TH, { customer_id: C.HB, order_date: D(25), status: 'xac_nhan', due_date: D(15), staff: 'Anh Hải',
      lines: [{ product_id: P['GTG-HB-XD'], qty: 120 }, { product_id: P['GTG-CT-NDL'], qty: 40 }, { product_id: P['DV-LG-60'], qty: 4 }] });
    const hbl = await lines(TH, hb.id);
    await call('deliver', { order_id: hb.id, request_id: rid(), date: D(22), lines: [{ order_line_id: hbl[0].id, qty: 80 }] });
    await call('deliver', { order_id: hb.id, request_id: rid(), date: D(15), lines: hbl.map((l) => ({ order_line_id: l.id, qty: l.remaining_qty - (l.sku === 'GTG-HB-XD' ? 80 : 0) })) });
    await pay(TH, { kind: 'thu_khach', date: D(15), fund_id: F.NH, party_id: C.HB, amount: 5000000, method: 'Chuyển khoản', allocations: [{ doc_type: 'don_ban', doc_id: hb.id, amount: 5000000 }] });

    const hb3 = await order(TH, { customer_id: C.HB, order_date: D(19), channel: 'Bán tại cửa hàng', staff: 'Anh Hải', shipping_fee: 1500000, note: 'Lợp mái nhà điều hành',
      lines: [{ product_id: P['NAD-L-DO'], qty: 2500 }, { product_id: P['PK-DIEM27'], qty: 150 }], deliver_now: true });
    await pay(TH, { kind: 'thu_khach', date: D(17), fund_id: F.NH, party_id: C.HB, amount: 30000000, method: 'Chuyển khoản', allocations: [{ doc_type: 'don_ban', doc_id: hb3.id, amount: 30000000 }] });
    await order(TH, { customer_id: C.KL, order_date: D(18), lines: [{ product_id: P['BO-MAU-NG'], qty: 2 }], deliver_now: true, deposit: { amount: 520000, fund_id: F.TM } });
    await order(TH, { customer_id: C.NAM, order_date: D(14), lines: [{ product_id: P['NGHE-40-VHG'], qty: 1 }], deliver_now: true, deposit: { amount: 2000000, fund_id: F.TM }, note: 'Hẹn trả nốt 1,5 triệu' });

    // Đơn khớp mẫu hóa đơn / đơn đặt hàng: Chú Dũng, ship 1.800.000, đặt cọc 12.000.000
    const dung = await order(TH, { customer_id: C.DUNG, kind: 'dat_hang', order_date: D(7), status: 'xac_nhan', due_date: D(0), channel: 'Bán tại cửa hàng', staff: 'Chị Mai', shipping_fee: 1800000,
      lines: [{ product_id: P['NA80-DC'], qty: 600, unit_price: 10000, note: 'Chọn viên đều màu, không cong vênh' }, { product_id: P['ND80-DC'], qty: 600, unit_price: 10000 }, { product_id: P['DA80-DC-HP'], qty: 300, unit_price: 20000 }, { product_id: P['DD80-DC'], qty: 300, unit_price: 20000 }],
      deposit: { amount: 12000000, fund_id: F.NH, method: 'Chuyển khoản' } });
    const dungL = await lines(TH, dung.id);
    await call('deliver', { order_id: dung.id, request_id: rid(), date: D(0), lines: dungL.map((l) => ({ order_line_id: l.id, qty: l.remaining_qty })), note: 'Xe tải giao tận nơi' });
    await call('save_doc_info', { book_id: TH, ref_type: 'order', ref_id: dung.id, data: { recv_phone: '0982197099', box_total: '13' } });
    // Đơn khớp mẫu biên bản bàn giao: Hộ kinh doanh Lý Phương Hoa
    const lph = await order(TH, { customer_id: C.LPH, order_date: D(1), channel: 'Bán tại cửa hàng', staff: 'Chị Mai', shipping_fee: 3500000,
      lines: [{ product_id: P['DA-L-GAK'], qty: 330 }, { product_id: P['DD-L-GAK'], qty: 330 }, { product_id: P['NA-L-GAK'], qty: 5400 }, { product_id: P['ND-L-GAK'], qty: 3375 }], deliver_now: true, date: D(1) });
    const lphDel = (await call('q', { view: 'deliveries', book_id: TH, filters: [['order_id', 'eq', lph.id]] }))[0];
    await call('save_doc_info', { book_id: TH, ref_type: 'delivery', ref_id: lphDel.id, data: { driver_name: 'Nguyễn An Giang', driver_phone: '0977937690', handover_rep: 'Vũ Thanh Mai',
      recv_phone: '0855069898', recv_name: 'Hoàng', recv_address: 'Khu Đảo nổi Sông Hồng - Thôn Thái Phú Đoài - Xã Vũ Tiên - Tỉnh Hưng Yên' } });

    const dl = await call('q', { view: 'delivery_lines', book_id: TH, filters: [['order_id', 'eq', mp1.id]], order: 'sku' });
    await call('sales_return', { order_id: mp1.id, request_id: rid(), date: D(10), reason: 'Đại lý trả lại hàng thừa', lines: [{ delivery_line_id: dl.find((x) => x.sku === 'NAD-L-DO').id, qty: 50 }] });
    await call('adjust_stock', { book_id: TH, request_id: rid(), date: D(8), reason: 'vo', note: 'Đổ chồng ngói khi xếp kho', lines: [{ product_id: P['NMH-DO'], qty_delta: -30 }] });

    await call('save_expense', { book_id: TH, request_id: rid(), date: D(6), category: 'Thuê nhà / cửa hàng', description: 'Thuê showroom tháng này', amount: 12000000, pay_now: { fund_id: F.NH, method: 'Chuyển khoản' } });
    await call('save_expense', { book_id: TH, request_id: rid(), date: D(6), category: 'Lương', description: 'Lương nhân viên bán hàng', amount: 15000000, pay_now: { fund_id: F.TM } });
    await call('save_expense', { book_id: TH, request_id: rid(), date: D(6), category: 'Phí vận chuyển (ship, COD)', description: 'Chở hàng đi Bắc Ninh, Hà Nam', amount: 1200000, supplier_id: S.XT });
    await call('save_expense', { book_id: TH, request_id: rid(), date: D(5), category: 'Quảng cáo Facebook', description: 'Chạy quảng cáo Facebook', amount: 2000000, pay_now: { fund_id: F.NH } });

    await call('save_expense', { book_id: TH, request_id: rid(), date: D(5), category: 'Tiền điện', description: 'Điện showroom + kho', amount: 1850000, pay_now: { fund_id: F.NH } });
    await call('save_expense', { book_id: TH, request_id: rid(), date: D(5), category: 'Tiền nước', description: 'Nước tháng này', amount: 240000, pay_now: { fund_id: F.TM } });
    await call('save_expense', { book_id: TH, request_id: rid(), date: D(5), category: 'Internet, điện thoại', description: 'Cáp quang + sim', amount: 330000, pay_now: { fund_id: F.NH } });
    await call('save_expense', { book_id: TH, request_id: rid(), date: D(4), category: 'Kệ, tủ, bàn trưng bày', description: 'Kệ sắt trưng bày ngói mẫu (dùng 2 năm)', amount: 9600000, alloc_months: 24, pay_now: { fund_id: F.NH } });

    await order(TH, { customer_id: C.MP, order_date: D(5), lines: [{ product_id: P['NAD-M-DO'], qty: 800 }], note: 'Đại lý hỏi giá, chưa chốt' });
    const hb2 = await order(TH, { customer_id: C.HB, kind: 'dat_hang', order_date: D(4), due_date: D(-8), status: 'xac_nhan', lines: [{ product_id: P['GTG-TD-TR'], qty: 200 }],
      deposit: { amount: 2000000, fund_id: F.NH }, note: 'Gạch tứ diệp cho mặt tiền' });
    const hb2l = (await lines(TH, hb2.id))[0];
    const poHT = await po(TH, { kind: 'dat_sx', supplier_id: S.HT, order_date: D(4), expected_date: D(-6), sales_order_id: hb2.id, status: 'xac_nhan',
      lines: [{ product_id: P['GTG-TD-TR'], qty: 200, unit_cost: 22000, sales_order_line_id: hb2l.id }] });
    await call('set_prod_step', { id: poHT.id, step: 'Đang sản xuất' });

    const cx = await order(TH, { customer_id: C.KL, order_date: D(3), status: 'xac_nhan', lines: [{ product_id: P['DV-LG-60'], qty: 1 }], deposit: { amount: 500000, fund_id: F.TM } });
    await call('cancel_sales_order', { id: cx.id, reason: 'Khách đổi ý, đã hoàn cọc' });
    await pay(TH, { kind: 'hoan_khach', date: D(3), fund_id: F.TM, party_id: C.KL, amount: 500000, allocations: [{ doc_type: 'don_ban', doc_id: cx.id, amount: 500000 }], note: 'Hoàn cọc đơn hủy' });

    await po(TH, { kind: 'mua_san', supplier_id: S.QV, order_date: D(2), expected_date: D(1), status: 'xac_nhan', lines: [{ product_id: P['NAD-L-XD'], qty: 1000, unit_cost: 15500 }] });
    await order(TH, { customer_id: C.KL, order_date: D(1), lines: [{ product_id: P['GTG-CT-NDL'], qty: 20 }], deliver_now: true, deposit: { amount: 840000, fund_id: F.TM } });
    await order(TH, { customer_id: C.CHUA, order_date: D(0), due_date: D(-2), status: 'xac_nhan', lines: [{ product_id: P['PK-DIEM27'], qty: 400 }], note: 'Diềm mái cho nhà tổ' });
  }

  // ===================== GỐM VŨ GIA =====================
  onProgress('Đang tạo dữ liệu mẫu: Gốm Vũ Gia…');
  const vg = await setupBook(VG, {
    funds: { TM: 8000000, NH: 60000000 },
    customers: {
      HOA: { name: 'Chị Hoa (TikTok)', phone: '0934 222 111', address: 'Q.7, TP HCM', kind: 'Khách online', price_tier: 1 },
      TUAN: { name: 'Anh Tuấn (Facebook)', phone: '0916 444 555', address: 'Hải Phòng', kind: 'Khách online', price_tier: 1 },
      TRANG: { name: 'CTV Thu Trang', phone: '0987 666 777', address: 'Nam Định', kind: 'Cộng tác viên', price_tier: 3, credit_days: 7 },
      PA: { name: 'Cửa hàng đồ thờ Phúc An', phone: '0225 888 999', address: 'Thái Bình', kind: 'Đại lý', price_tier: 2, credit_days: 15, credit_limit: 50000000 },
    },
    suppliers: {
      HA: { name: 'Xưởng vẽ vàng Hải Anh', phone: '0966 101 202', address: 'Bát Tràng', credit_days: 15 },
      ML: { name: 'Lò Bát Tràng Minh Long', phone: '0966 303 404', address: 'Bát Tràng', credit_days: 10 },
    },
    products: [
      { sku: 'BHL-LAM-30', name: 'Bình hút lộc men lam 30cm', category: 'Bình hút lộc', pattern: 'Hũ tròn vẽ rồng', size: '30cm', color: 'Men lam', unit: 'Cái', cost: 320000, price1: 650000, price2: 590000, price3: 550000, qty: 14, low_stock: 4 },
      { sku: 'BHL-VANG-25', name: 'Bình hút lộc vẽ vàng 25cm', category: 'Bình hút lộc', pattern: 'Phú quý', size: '25cm', color: 'Vẽ vàng 24k', unit: 'Cái', cost: 450000, price1: 890000, price2: 800000, price3: 750000, qty: 9, low_stock: 3 },
      { sku: 'BHL-RAN-35', name: 'Bình hút lộc men rạn 35cm', category: 'Bình hút lộc', pattern: 'Hũ tròn', size: '35cm', color: 'Men rạn cổ', unit: 'Cái', cost: 520000, price1: 990000, price2: 900000, price3: 850000, qty: 3, low_stock: 3 },
      { sku: 'BH-LAM-16', name: 'Bát hương men lam 16cm', category: 'Đồ thờ', pattern: 'Vẽ rồng', size: '16cm', color: 'Men lam', unit: 'Cái', cost: 260000, price1: 520000, price2: 470000, price3: 440000, qty: 10, low_stock: 3 },
      { sku: 'LH-LAM-30', name: 'Lọ hoa men lam 30cm', category: 'Đồ thờ', pattern: 'Vẽ sen', size: '30cm', color: 'Men lam', unit: 'Cái', cost: 180000, price1: 360000, price2: 320000, price3: 300000, qty: 16, low_stock: 4 },
      { sku: 'MB-LAM-25', name: 'Mâm bồng men lam 25cm', category: 'Đồ thờ', pattern: 'Hoa văn cổ', size: '25cm', color: 'Men lam', unit: 'Cái', cost: 150000, price1: 300000, price2: 270000, price3: 250000, qty: 8, low_stock: 2 },
      { sku: 'DN-LAM', name: 'Đài nước men lam', category: 'Đồ thờ', pattern: 'Đài sen', size: '12cm', color: 'Men lam', unit: 'Cái', cost: 45000, price1: 95000, price2: 85000, price3: 80000, qty: 30, low_stock: 10 },
      { sku: 'AC-SEN-6', name: 'Bộ ấm chén hoa sen 6 chén', category: 'Ấm chén', pattern: 'Hoa sen', size: '6 chén', color: 'Men trắng', unit: 'Bộ', cost: 210000, price1: 420000, price2: 380000, price3: 350000, qty: 12, low_stock: 3 },
    ],
    kits: [{ sku: 'BO-DT-LAM-5', name: 'Bộ đồ thờ men lam 5 món', category: 'Đồ thờ', unit: 'Bộ', price1: 1690000, price2: 1550000, price3: 1450000,
      components: [['BH-LAM-16', 1], ['LH-LAM-30', 2], ['MB-LAM-25', 1], ['DN-LAM', 1]] }],
    debts: [{ party_type: 'kh', party: 'PA', amount: 6500000, due_date: D(20), note: 'Nợ cũ' }],
  });
  {
    const { F, C, S, P } = vg;
    const t1 = await order(VG, { customer_id: C.HOA, channel: 'TikTok', order_date: D(25), lines: [{ product_id: P['BHL-LAM-30'], qty: 1 }], deliver_now: true, note: 'Đơn TikTok Shop' });
    await order(VG, { customer_id: C.TUAN, channel: 'Facebook', order_date: D(25), lines: [{ product_id: P['BO-DT-LAM-5'], qty: 1 }], deliver_now: true, shipping_fee: 50000,
      deposit: { amount: 1740000, fund_id: F.NH, method: 'Chuyển khoản' } });
    await pay(VG, { kind: 'thu_khach', date: D(20), fund_id: F.NH, party_id: C.HOA, amount: 650000, fee: 52000, method: 'TikTok Shop', note: 'TikTok đối soát (phí sàn 8%)',
      allocations: [{ doc_type: 'don_ban', doc_id: t1.id, amount: 650000 }] });
    const pa = await order(VG, { customer_id: C.PA, channel: 'Facebook', order_date: D(18), lines: [{ product_id: P['BHL-VANG-25'], qty: 4 }, { product_id: P['BH-LAM-16'], qty: 6 }], deliver_now: true });
    await pay(VG, { kind: 'thu_khach', date: D(16), fund_id: F.NH, party_id: C.PA, amount: 8000000, method: 'Chuyển khoản', auto_allocate: true, note: 'Trả nợ cũ + 1 phần đơn mới' });

    const sp = await order(VG, { customer_id: C.TRANG, kind: 'dat_hang', channel: 'Facebook', order_date: D(15), due_date: D(-7), status: 'xac_nhan',
      lines: [{ product_id: P['BHL-RAN-35'], qty: 10 }], deposit: { amount: 3000000, fund_id: F.NH }, note: 'Khách đặt 10 bình men rạn, in tên công ty' });
    const spl = (await lines(VG, sp.id))[0];
    const poML = await po(VG, { kind: 'dat_sx', supplier_id: S.ML, order_date: D(15), expected_date: D(-4), sales_order_id: sp.id, status: 'xac_nhan',
      lines: [{ product_id: P['BHL-RAN-35'], qty: 10, unit_cost: 520000, sales_order_line_id: spl.id }], deposit: { amount: 2000000, fund_id: F.NH } });
    await call('set_prod_step', { id: poML.id, step: 'Đang trong lò' });
    await po(VG, { kind: 'mua_san', supplier_id: S.HA, order_date: D(12), receive_now: true, lines: [{ product_id: P['BHL-VANG-25'], qty: 10, unit_cost: 470000 }] });

    const t2 = await order(VG, { customer_id: C.HOA, channel: 'TikTok', order_date: D(8), lines: [{ product_id: P['LH-LAM-30'], qty: 2 }], deliver_now: true });
    const t3 = await order(VG, { customer_id: C.HOA, channel: 'TikTok', order_date: D(8), lines: [{ product_id: P['BHL-VANG-25'], qty: 1 }], deliver_now: true });
    await pay(VG, { kind: 'thu_khach', date: D(6), fund_id: F.NH, party_id: C.HOA, amount: 1610000, fee: 128800, method: 'TikTok Shop', note: 'TikTok đối soát 2 đơn',
      allocations: [{ doc_type: 'don_ban', doc_id: t2.id, amount: 720000 }, { doc_type: 'don_ban', doc_id: t3.id, amount: 890000 }] });
    const dlt2 = (await call('q', { view: 'delivery_lines', book_id: VG, filters: [['order_id', 'eq', t2.id]] }))[0];
    await call('sales_return', { order_id: t2.id, request_id: rid(), date: D(5), reason: 'Vỡ khi vận chuyển', lines: [{ delivery_line_id: dlt2.id, qty: 1, restock: false }],
      refund: { amount: 360000, fund_id: F.NH, method: 'Chuyển khoản' } });

    await call('save_expense', { book_id: VG, request_id: rid(), date: D(4), category: 'Quảng cáo TikTok', description: 'Quảng cáo TikTok', amount: 3000000, pay_now: { fund_id: F.NH } });
    await call('save_expense', { book_id: VG, request_id: rid(), date: D(4), category: 'Bao bì, đóng gói', description: 'Thùng carton, xốp chống sốc', amount: 800000, pay_now: { fund_id: F.TM } });
    await call('save_expense', { book_id: VG, request_id: rid(), date: D(3), category: 'Phí vận chuyển (ship, COD)', description: 'Phí giao hàng COD', amount: 1100000, pay_now: { fund_id: F.TM } });

    await call('save_expense', { book_id: VG, request_id: rid(), date: D(4), category: 'Thiết bị (máy in, camera, đèn, điện thoại livestream)', description: 'Điện thoại + đèn livestream (dùng 12 tháng)', amount: 14400000, alloc_months: 12, pay_now: { fund_id: F.NH } });
    await call('save_expense', { book_id: VG, request_id: rid(), date: D(3), category: 'KOC / KOL, affiliate', description: 'Hoa hồng affiliate TikTok', amount: 650000, pay_now: { fund_id: F.NH } });
    await call('save_expense', { book_id: VG, request_id: rid(), date: D(3), category: 'Chụp ảnh, quay video, đạo cụ', description: 'Phông nền, đạo cụ quay bình hút lộc', amount: 420000, pay_now: { fund_id: F.TM } });
    await order(VG, { customer_id: C.TUAN, channel: 'Facebook', order_date: D(2), status: 'xac_nhan', due_date: D(-3), lines: [{ product_id: P['AC-SEN-6'], qty: 2 }], deposit: { amount: 200000, fund_id: F.NH } });

    // ---- Vận chuyển Shopee Express + tiền về tài khoản + thông báo ----
    onProgress('Đang tạo dữ liệu mẫu: vận chuyển, tiền về, thông báo…');
    for (const b of [TH, VG]) await call('update_book_settings', { book_id: b, settings: { docs: demoDocs(b === TH, logo) } });
    for (const b of [TH, VG]) await call('save_bank_account', { book_id: b, bank: { bin: '970436', bank_name: 'Vietcombank', account_no: '1106738888', account_name: 'HKD GOM SU MAI HIEU' } });
    const shipOrder = async (cust, sku, qty, days, tn, status, carrier = 'SPX') => {
      const o = await order(VG, { customer_id: C[cust], channel: cust === 'HOA' ? 'TikTok' : 'Facebook', order_date: D(days), lines: [{ product_id: P[sku], qty }], deliver_now: true, date: D(days) });
      const ov = (await call('q', { view: 'sales_orders', book_id: VG, filters: [['id', 'eq', o.id]] }))[0];
      const dl = (await call('q', { view: 'deliveries', book_id: VG, filters: [['order_id', 'eq', o.id]] }))[0];
      const s = await call('create_shipment', { book_id: VG, request_id: rid(), order_id: o.id, delivery_id: dl?.id, carrier, tracking_no: tn, cod_amount: ov.receivable, ship_fee: carrier === 'BEST' ? 28000 : 32000 });
      for (const [st, de] of status) await call('demo_simulate', { book_id: VG, what: 'ship', shipment_id: s.id, status: st, detail: de });
      return { o, ov, s };
    };
    const s1 = await shipOrder('PA', 'BH-LAM-16', 1, 6, 'SPXVN061234567801', [['da_lay_hang', 'Shipper đã lấy hàng'], ['dang_trung_chuyen', 'Rời kho Gia Lâm'], ['dang_giao', 'Đang giao'], ['giao_thanh_cong', 'Người nhận: chị Phương Anh']]);
    const s2 = await shipOrder('TUAN', 'AC-SEN-6', 1, 5, 'SPXVN061234567802', [['da_lay_hang', 'Shipper đã lấy hàng'], ['dang_giao', 'Đang giao'], ['giao_thanh_cong', 'Đã giao, khách thanh toán COD']]);
    await shipOrder('HOA', 'LH-LAM-30', 1, 3, 'SPXVN061234567803', [['da_lay_hang', 'Shipper đã lấy hàng'], ['dang_trung_chuyen', 'Đến kho SOC Củ Chi'], ['dang_giao', 'Shipper đang giao']]);
    await shipOrder('TRANG', 'BH-LAM-16', 1, 3, 'SPXVN061234567804', [['da_lay_hang', 'Shipper đã lấy hàng'], ['dang_giao', 'Đang giao'], ['giao_that_bai', 'Khách hẹn giao lại thứ 7']]);
    await shipOrder('PA', 'AC-SEN-6', 1, 2, 'SPXVN061234567805', [['da_lay_hang', 'Shipper đã lấy hàng'], ['giao_that_bai', 'Không liên lạc được người nhận'], ['dang_hoan', 'Chuyển hoàn về shop']]);
    await shipOrder('TUAN', 'BH-LAM-16', 1, 1, 'SPXVN061234567806', []);
    // BEST Express
    const b1 = await shipOrder('TRANG', 'AC-SEN-6', 1, 4, '840123456781', [['da_lay_hang', 'Đã lấy hàng tại shop'], ['dang_trung_chuyen', 'Đến TTKT Hà Nội'], ['dang_giao', 'Đang giao hàng'], ['giao_thanh_cong', '666 - Giao hàng thành công']], 'BEST');
    await shipOrder('PA', 'BHL-VANG-25', 1, 2, '840123456782', [['da_lay_hang', 'Đã lấy hàng tại shop'], ['dang_trung_chuyen', 'Rời TTKT Hà Nội']], 'BEST');
    // SPX đối soát COD vận đơn 1 (trừ cước 32.000đ)
    await call('settle_cod', { book_id: VG, request_id: rid(), shipment_ids: [s1.s.id], received: s1.ov.receivable - 32000, fund_id: F.NH, date: D(1) });
    // Tiền về TK: khách chuyển đúng mã đơn (tự gạch nợ), tiền COD gộp từ SPX và 1 khoản không rõ (chờ xử lý)
    const dep = (await call('q', { view: 'sales_orders', book_id: VG, filters: [['customer_id', 'eq', C.TUAN], ['status', 'eq', 'xac_nhan'], ['delivery_count', 'eq', 0]] }))[0];
    if (dep) await call('demo_simulate', { book_id: VG, what: 'bank', amount: dep.remaining_to_pay, content: `NGUYEN ANH TUAN chuyen tien VG${dep.code}`, counter_name: 'NGUYEN ANH TUAN' });
    await call('demo_simulate', { book_id: VG, what: 'bank', amount: s2.ov.receivable - 30000, content: 'SPX EXPRESS DOI SOAT COD', counter_name: 'CONG TY TNHH SHOPEE EXPRESS' });
    await call('demo_simulate', { book_id: VG, what: 'bank', amount: 450000, content: 'chuyen khoan', counter_name: 'TRAN THI BICH' });
    await call('demo_simulate', { book_id: VG, what: 'bank', amount: b1.ov.receivable - 28000, content: 'BEST EXPRESS VIET NAM TT COD', counter_name: 'CONG TY TNHH BEST EXPRESS VIET NAM' });
    await call('demo_run_scheduled', { book_id: VG, kind: 'debt_reminder' });
    await call('demo_run_scheduled', { book_id: VG, kind: 'daily_report' });
  }
  {
    const thOpen = (await call('q', { view: 'sales_orders', book_id: TH, filters: [['status', 'eq', 'xac_nhan']] })).find((o) => o.receivable > 0);
    if (thOpen) await call('demo_simulate', { book_id: TH, what: 'bank', amount: Math.min(thOpen.receivable, 5000000), content: `CONG TY HOA BINH TT TH${thOpen.code}`, counter_name: 'CONG TY XD HOA BINH' });
    await call('demo_run_scheduled', { book_id: TH, kind: 'debt_reminder' });
    await call('demo_run_scheduled', { book_id: TH, kind: 'daily_report' });
  }
  return { owner, staff, TH, VG };
}
