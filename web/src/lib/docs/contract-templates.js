// Mẫu hợp đồng soạn trên phần mềm, dựng theo 3 mẫu giấy của cửa hàng:
// Hợp đồng kinh tế (đối tác là công ty), Hợp đồng kinh tế cá nhân (đối tác là cá nhân / hộ / chùa…), Hợp đồng nguyên tắc mua bán hàng hóa.
// Chọn loại → các trường cần điền hiện ra (đã điền sẵn từ đơn, khách và đơn vị đứng tên) → dựng HTML in được, xem trước và xuất PDF như mọi chứng từ khác.
// Trường nhiều dòng viết đơn giản: dòng bắt đầu "- " là gạch đầu dòng, "+ " là ý con, "# " là tiêu đề in đậm.
import { fmtNum, phoneFmt, moneyWords, goodsLines, custExtra, isCompany } from './model.js';
import { esc } from './tokens.js';
import { sanitizeHtml } from './templates.js';

export const CONTRACT_KINDS = {
  kinh_te: { label: 'Hợp đồng kinh tế', short: 'HĐKT', sub: 'Đối tác là công ty / doanh nghiệp', suffix: 'HĐKT' },
  ca_nhan: { label: 'Hợp đồng cá nhân', short: 'HĐ cá nhân', sub: 'Đối tác là cá nhân, hộ gia đình, chùa…', suffix: 'HĐKT' },
  nguyen_tac: { label: 'Hợp đồng nguyên tắc', short: 'HĐNT', sub: 'Bạn hàng mua nhiều lô, ký khung một lần', suffix: 'HĐNT' },
};
// Loại gợi ý cho khách: lần trước đã chọn, không thì theo loại khách
export function suggestKind(cust) { const x = custExtra(cust); return CONTRACT_KINDS[x.contract_kind] ? x.contract_kind : isCompany(cust) ? 'kinh_te' : 'ca_nhan'; }

const ALL = ['kinh_te', 'ca_nhan', 'nguyen_tac'];
const SALE = ['kinh_te', 'ca_nhan'];
const F = (key, label, kinds, o = {}) => ({ key, label, kinds, ...o });
// Nhóm trường theo thứ tự điền
export const FIELD_GROUPS = [
  { id: 'chung', label: 'Thông tin chung', fields: [
    F('so_hd', 'Số hợp đồng', ALL), F('ngay_ky', 'Ngày ký', ALL, { type: 'date' }), F('noi_ky', 'Nơi lập (dòng ngày tháng)', ALL),
    F('dia_diem_ky', 'Địa điểm ký', ALL, { hint: 'Câu "Hôm nay, ngày … tại …" — trống thì bỏ câu này', wide: true }),
  ] },
  { id: 'ben_a', label: 'Bên mua (đối tác)', fields: [
    F('a_ten', 'Tên bên mua', ALL, { wide: true }), F('a_dai_dien', 'Người đại diện', ALL, { hint: 'Ghi cả "Ông / Bà"' }), F('a_chuc_vu', 'Chức vụ', ALL),
    F('a_dia_chi', 'Địa chỉ', ALL, { wide: true }), F('a_dien_thoai', 'Điện thoại', ALL), F('a_mst', 'Mã số thuế', ['kinh_te', 'nguyen_tac']),
    F('a_cccd', 'Số CCCD', ['ca_nhan']), F('a_cccd_cap', 'Nơi cấp, ngày cấp CCCD', ['ca_nhan'], { wide: true }), F('a_theo_doi', 'Người theo dõi hợp đồng', ['ca_nhan']),
    F('a_tai_khoan', 'Số tài khoản', ['nguyen_tac']), F('a_chu_tk', 'Chủ tài khoản', ['nguyen_tac']), F('a_ngan_hang', 'Ngân hàng', ['nguyen_tac'], { wide: true }),
  ] },
  { id: 'ben_b', label: 'Bên bán (bên mình)', fields: [
    F('b_ten', 'Tên bên bán', ALL, { wide: true }), F('b_dai_dien', 'Người đại diện', ALL), F('b_chuc_vu', 'Chức vụ', ALL), F('b_dia_chi', 'Địa chỉ', ALL, { wide: true }),
    F('b_mst', 'Mã số thuế', ALL), F('b_dien_thoai', 'Điện thoại', ALL), F('b_tai_khoan', 'Số tài khoản', ALL), F('b_chu_tk', 'Chủ tài khoản', ALL), F('b_ngan_hang', 'Ngân hàng', ALL, { wide: true }),
  ] },
  { id: 'hang', label: 'Hàng hóa & giá', fields: [
    F('chu_de', 'Hai bên thỏa thuận mua bán', SALE, { wide: true, hint: 'vd. ngói âm dương màu ghi ánh kim' }),
    F('ghi_chu_gia', 'Ghi chú dưới bảng giá', SALE, { type: 'area', rows: 4 }),
  ] },
  { id: 'dieu_khoan', label: 'Điều khoản', fields: [
    F('chat_luong', 'Điều 2. Chất lượng hàng hóa', SALE, { type: 'area', rows: 5 }), F('giao_hang', 'Điều 3. Thời gian – phương thức giao hàng', SALE, { type: 'area', rows: 4 }),
    F('doi_tra', 'Điều 4. Điều kiện đổi trả', SALE, { type: 'area', rows: 6 }), F('thanh_toan', 'Điều 5. Hình thức thanh toán', SALE, { type: 'area', rows: 7 }),
    F('trach_nhiem', 'Điều 6. Trách nhiệm hai bên', SALE, { type: 'area', rows: 6 }), F('cam_ket', 'Điều 7. Cam kết chung', SALE, { type: 'area', rows: 4 }),
    F('hieu_luc', 'Điều 8. Hiệu lực hợp đồng', SALE, { type: 'area', rows: 3 }),
    F('thoi_han', 'Thời hạn hợp đồng', ['nguyen_tac'], { hint: 'vd. 12 tháng' }), F('so_ban', 'Số bản lập', ['nguyen_tac']),
    F('dieu_khoan', 'Các điều khoản (1 – 9)', ['nguyen_tac'], { type: 'area', rows: 18 }),
  ] },
];
export const fieldsFor = (kind) => FIELD_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => f.kinds.includes(kind)) })).filter((g) => g.fields.length);

// ---------- Nội dung mặc định (theo mẫu giấy) ----------
const T = {
  chat_luong_cty: '- Đảm bảo chất lượng đúng chủng loại như mẫu đã thống nhất giữa hai bên ký hợp đồng.\n- Do đặc tính thủ công nên sản phẩm sẽ có kích thước chênh lệch +/-1.5cm. Bề mặt sẽ có 1 số vết chấm lỗ.',
  chat_luong_cn: '- Đảm bảo chất lượng đúng chủng loại như mẫu đã thống nhất giữa hai bên ký hợp đồng.\n- Do đặc tính thủ công nên sản phẩm sẽ có những tính chất đặc biệt như sau:\n+ Kích thước chênh lệch 10-12%.\n+ Màu sắc ảnh hưởng nhiều bởi nhiệt độ lò đun thủ công nên cũng sẽ có sự chênh lệch màu sắc 8-10%.\n+ Sản phẩm sẽ có độ cong vênh nhất định do ảnh hưởng bởi nhiệt độ cao trong lò (Nhiệt độ lên tới hơn 1300 độ C).\n+ Bề mặt ngói sẽ có những khuyết tật thủ công: Chấm lỗ.',
  doi_tra: '- Hàng đổi trả phải còn nguyên đai nguyên kiện, không bị sứt mẻ và dính bẩn, không nhận lại các viên lẻ không đủ hộp.\n- Số lượng hàng trả lại không vượt quá 10% tổng số lượng hàng đã mua.\n- Hàng được đổi trả trong vòng 30 ngày kể từ ngày mua hàng. Quá 30 ngày, hàng đổi trả được nhận lại trừ 10% giá trị đơn hàng.\n- Quá 45 ngày, hàng đổi trả được nhận lại trừ 20% giá trị đơn hàng. Quá 60 ngày, Công ty không nhận lại hàng đổi trả.\n- Chi phí vận chuyển đến kho do khách hàng chịu.',
  trach_nhiem: '# 1. Trách nhiệm bên bán:\n- Đáp ứng đủ kịp thời cho bên mua theo ngày như đã ký.\n- Đảm bảo đúng tiến độ giao hàng.\n# 2. Trách nhiệm bên mua:\n- Có trách nhiệm kiểm tra số lượng, quy cách, chất lượng hàng hóa do bên B giao.\n- Thanh toán đầy đủ đúng hạn như quy định.',
  cam_ket: '- Hai bên cam kết thực hiện các điều khoản ghi trong hợp đồng.\n- Nếu một bên gặp khó khăn hoặc thay đổi các điều khoản của hợp đồng thì phải thông báo cho bên kia biết để cùng tìm cách giải quyết trên tinh thần bình đẳng, hợp tác, tôn trọng lẫn nhau.\n- Mọi tranh chấp hai bên không tự giải quyết được sẽ được tòa án kinh tế TP Hà Nội phán quyết theo đúng pháp lệnh HĐKT.',
  hieu_luc: '- Hợp đồng này có giá trị kể từ ngày ký cho đến khi thanh lý hợp đồng.\n- Hợp đồng được lập thành 02 bản, bên A giữ 01 bản, bên B giữ 01 bản và có giá trị pháp lý như nhau.',
  nguyen_tac: `# 1. Các điều khoản chung:
- Hai Bên cùng có quan hệ mua bán với nhau theo quan hệ Bạn hàng trên cơ sở hai Bên cùng có lợi.
- Trong khuôn khổ Hợp đồng này, hai Bên sẽ ký tiếp các Hợp đồng mua bán hoặc Đơn đặt hàng (Bằng văn bản, điện thoại và thư điện tử) đối với từng lô hàng cụ thể.
- Chi tiết hàng hóa, số lượng, giá cả, giao hàng, phương thức thanh toán và các điều khoản khác (nếu có) sẽ được chỉ rõ trong các Hợp đồng mua bán, Đơn đặt hàng tương ứng.
- Thứ tự ưu tiên thực hiện là các bản sửa đổi bổ sung của Đơn đặt hàng – Hợp đồng mua bán – Hợp đồng nguyên tắc.
- Điều khoản nào trong Hợp đồng mua bán/ Đơn đặt hàng mâu thuẫn với các điều khoản trong Hợp đồng này thì sẽ thực hiện theo các điều khoản được quy định trong Hợp đồng này.
# 2. Hàng hóa
- Hàng hóa do bên Bán cung cấp đảm bảo đúng chủng loại, chất lượng và các thông số kỹ thuật của Nhà sản xuất.
- Chi tiết về hàng hóa sẽ được các Bên chỉ rõ trong các Hợp đồng mua bán/ Đơn đặt hàng trong khuôn khổ của Hợp đồng này.
# 3. Giao nhận hàng hóa
- Số lượng hàng hóa, địa điểm giao nhận, chi phí vận chuyển được quy định cụ thể trong các Hợp đồng mua bán hoặc Đơn đặt hàng.
- Hàng hóa có thể giao một lần hay nhiều lần tùy theo hai Bên thỏa thuận. Bằng chứng giao hàng gồm có:
+ Hóa đơn bán hàng hợp lệ
+ Biên bản giao nhận hoặc Phiếu xuất kho: ghi rõ số lượng hàng, số hóa đơn bán hàng, số kg/số kiện.
# 4. Giá cả và phương thức thanh toán
- Giá cả được hai bên thống nhất theo Bảng báo giá điều chỉnh được gửi gần nhất.
- Phương thức thanh toán và thời hạn thanh toán được quy định cụ thể trong từng Hợp đồng mua bán/ Đơn đặt hàng.
- Đơn giá, tổng trị giá hàng hóa, thuế VAT, sẽ được ghi cụ thể trong Hợp đồng mua bán/ Đơn đặt hàng được ký kết bởi hai Bên.
- Thanh toán bằng tiền VND bằng hình thức tiền mặt hoặc chuyển khoản.
# 5. Trách nhiệm của các Bên
# 5.1 Bên bán:
- Định kỳ cung cấp cho Bên mua các thông tin về sản phẩm như: Danh mục và Catalogue sản phẩm hiện có, giá cả sản phẩm, dịch vụ đối với khách hàng…vv.
- Đảm bảo cung cấp hàng hóa đúng chủng loại, chất lượng và tiêu chuẩn kỹ thuật của Nhà sản xuất.
- Đào tạo, giới thiệu sản phẩm mới (nếu có).
- Tư vấn cho Bên mua về sản phẩm và dịch vụ của Nhà sản xuất.
- Thực hiện đúng các cam kết được ghi trong Hợp đồng nguyên tắc.
# 5.2 Bên mua:
- Thực hiện nghiêm chỉnh các quy định của Pháp luật Việt nam về quản lý và lưu thông hàng hóa. Bên bán không chịu trách nhiệm về các vi phạm pháp luật này của bên mua.
- Đảm bảo thanh toán đúng thời hạn đã thỏa thuận trong Hợp đồng nguyên tắc này cũng như trong Thỏa thuận tín dụng.
- Thực hiện đúng các cam kết được ghi trong Hợp đồng.
# 6. Cung cấp và trao đổi thông tin giữa hai Bên
# 6.1 Để lập hồ sơ Bạn hàng, hai bên cung cấp cho nhau các thông tin sau:
- Địa chỉ giao dịch chính thức
- Tên doanh nghiệp
- Vốn
- Tên tài khoản, Số tài khoản, Tên ngân hàng
- Giấy phép đăng ký kinh doanh
- Quyết định thành lập doanh nghiệp
- Người được cử là Đại diện giao dịch trực tiếp của hai Bên (họ tên, chức vụ, chữ ký) và Bên mua cung cấp thêm cho Bên bán các giấy tờ công chứng sau:
+ Quyết định ủy quyền ký thay Giám đốc và hoặc Kế toán trưởng (nếu có);
+ Quyết định bổ nhiệm Kế toán trưởng và giám đốc.
# 6.2 Hai bên thống nhất trao đổi thông tin thông qua các Đại diện liên lạc.
- Trong trường hợp nhân viên được ủy quyền giao dịch được ghi trên không được quyền tiếp tục đại diện trong việc giao dịch với Bên kia, hai bên cần có thông báo kịp thời, chính thức bằng văn bản/email/fax, gửi người đại diện liên lạc bên kia ngay lập tức và phải được đại diện liên lạc Bên kia xác nhận đã nhận được thông báo đó.
- Nếu không, Bên gây thiệt hại phải chịu hoàn toàn trách nhiệm bồi hoàn chi phí thiệt hại cho Bên kia do việc chậm thông báo trên gây ra.
# 6.3 Thay đổi thông tin giao dịch
- Trong trường hợp có sự thay đổi về những thông tin liên quan đến quá trình giao dịch giữa hai Bên như: thay đổi trụ sở làm việc, thay đổi mã số thuế, thay đổi tài khoản… hai Bên phải có trách nhiệm thông báo bằng văn bản cho nhau trước khi phát sinh việc mua bán mới.
# 7. Dừng giao hàng hoặc hủy bỏ Hợp đồng trước thời hạn
- Bên bán có quyền dừng giao hàng khi Bên mua chưa hoàn thành nghĩa vụ thanh toán các khoản nợ quá hạn giữa hai Bên.
- Trong trường hợp này, Bên mua có trách nhiệm thanh toán ngay theo quy định và chỉ khi Bên bán xác nhận việc thanh toán trên thì Hợp đồng mới được tiếp tục thực hiện.
- Nếu Bên nào muốn chấm dứt Hợp đồng trước thời hạn thì phải thông báo trước cho Bên kia và hai Bên phải có xác nhận bằng văn bản, đồng thời hai bên tiến hành quyết toán hàng hóa và công nợ.
- Biên bản thanh lý Hợp đồng của các Bên mới là văn bản chính thức cho phép Hợp đồng này được chấm dứt.
- Nếu Bên nào đơn phương hủy bỏ Hợp đồng nguyên tắc làm thiệt hại đến quyền lợi kinh tế của Bên kia thì bên đó phải hoàn toàn chịu trách nhiệm bồi thường thiệt hại cho bên kia.
# 8. Cam kết chung
- Không Bên nào được sử dụng một tên gọi nào đó mà có thể bao hàm rằng trụ sở chính của Bên kia là trụ sở của mình.
- Bên Mua là Bạn hàng của Bên Bán và không Bên nào được thay mặt hay mang danh nghĩa của Bên kia giao dịch với khách hàng.
- Trong trường hợp xảy ra tranh chấp, hai Bên cố gắng cùng nhau bàn bạc các biện pháp giải quyết trên tinh thần hòa giải, có thiện chí và hợp tác. Nếu vẫn không thống nhất cách giải quyết thì hai Bên sẽ đưa vụ việc ra Tòa án Kinh tế, toàn bộ chi phí xét xử do Bên thua chịu.
- Hai Bên cam kết thực hiện đúng những điều ghi trên Hợp đồng này.
- Nếu một trong hai Bên cố ý vi phạm các điều khoản của Hợp đồng này sẽ phải chịu trách nhiệm tài sản về các hành vi vi phạm đó.
- Quyết định của Tòa án sẽ mang tính chung thẩm và có giá trị ràng buộc các Bên thi hành.
- Trong thời gian Tòa án thụ lý và chưa đưa ra phán quyết, các Bên vẫn phải tiếp tục thi hành nghĩa vụ và trách nhiệm của mình theo quy định của Hợp đồng này.
# 9. Hiệu lực của Hợp đồng
- Hợp đồng này chỉ chính thức hết hiệu lực khi hai Bên đã quyết toán xong toàn bộ hàng hóa và công nợ.
- Hợp đồng nguyên tắc này có giá trị {thoi_han} kể từ ngày ký kết. Hết thời hạn trên, nếu hai Bên không có ý kiến gì thì Hợp đồng được tự động kéo dài {thoi_han} tiếp theo và tối đa không quá 2 năm.
- Văn bản được lập thành {so_ban} bản, mỗi bên giữ một nửa số bản có giá trị pháp lý như nhau.
- Các Hợp đồng bán hàng, Đơn đặt hàng cũng như các sửa đổi, bổ sung được coi như các phụ lục và là một phần không thể tách rời của Hợp đồng này.`,
};

// Đơn vị đứng tên hợp đồng: theo hợp đồng, không thì đơn vị đầu tiên
export const contractProfile = (ds, k) => ds.profiles.find((p) => p.id === k?.profile_id) || ds.profiles[0];
const upper = (s) => String(s || '').toUpperCase();
const N = (v) => fmtNum(v, '.');

// Giá trị mặc định khi mới chọn loại: data = loadDocData({kind:'contract'})
export function contractDefaults(kind, data, ds) {
  const k = data.k; const o = data.o; const c = data.cust || {}; const x = custExtra(c); const prof = contractProfile(ds, k);
  const [acct, ...bank] = String(prof.bank_line || '').split(' - ');
  const vatIn = Number(o.vat_rate) > 0;
  const adv = Number(k?.advance_amount) || 0;
  // Đơn chưa có hợp đồng: ngày ký hôm nay, số theo ngày ký như cách máy chủ tự cấp (1009/2026/HĐKT)
  const sign = k?.sign_date || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const code = k?.code || `${sign.slice(8, 10)}${sign.slice(5, 7)}/${sign.slice(0, 4)}/HĐKT`;
  const base = {
    so_hd: kind === 'nguyen_tac' ? code.replace(/HĐKT$/, 'HĐNT') : code, ngay_ky: sign, noi_ky: 'Hà Nội', dia_diem_ky: '',
    a_ten: upper(x.tax_name || o.customer_name), a_dai_dien: k?.rep_name || c.contact || '', a_chuc_vu: k?.rep_title || '', a_dia_chi: x.tax_address || c.address || o.customer_address || '',
    a_dien_thoai: phoneFmt(o.customer_phone || c.phone), a_mst: k?.tax_code || x.tax_code || '', a_cccd: '', a_cccd_cap: '', a_theo_doi: '', a_tai_khoan: '', a_chu_tk: '', a_ngan_hang: '',
    b_ten: upper(prof.legal_name || prof.name), b_dai_dien: prof.representative || '', b_chuc_vu: prof.rep_title || '', b_dia_chi: prof.address || '', b_mst: prof.tax_code || '',
    b_dien_thoai: prof.phone || '', b_tai_khoan: bank.length ? acct.trim() : String(prof.bank_line || ''), b_chu_tk: prof.legal_name || '', b_ngan_hang: bank.join(' - ').trim(),
  };
  if (kind === 'nguyen_tac') return { ...base, thoi_han: '12 tháng', so_ban: '04', dieu_khoan: T.nguyen_tac };
  const names = goodsLines('don_dat_hang', data).map((l) => l.name).filter(Boolean);
  return {
    ...base,
    chu_de: names.length ? names.slice(0, 3).join(', ').toLowerCase() + (names.length > 3 ? '…' : '') : '',
    ghi_chu_gia: `- Đơn giá trên đã bao gồm chi phí bốc hàng lên, chưa bao gồm chi phí vận chuyển, chưa bao gồm chi phí dỡ hàng xuống.\n- Đơn giá trên ${vatIn ? 'đã' : 'chưa'} bao gồm ${vatIn ? fmtNum(o.vat_rate) : 8}% VAT.`,
    chat_luong: kind === 'ca_nhan' ? T.chat_luong_cn : T.chat_luong_cty,
    giao_hang: `- Địa điểm giao hàng: ${data.orderInfo?.recv_address || o.customer_address || '................................'}\n- Thời gian giao hàng: ................................`,
    doi_tra: T.doi_tra,
    thanh_toan: `${adv > 0 ? `- Đặt cọc: ${N(adv)} đồng (Bằng chữ: ${moneyWords(adv)}) ngay sau khi ký hợp đồng.` : '- Đặt cọc: ................ đồng ngay sau khi ký hợp đồng.'}\n- Số còn lại thanh toán ngay sau khi nhận đủ hàng tại công trình.\n- Thanh toán: Chuyển khoản.\n- Hồ sơ thanh toán bao gồm:\n+ Biên bản giao nhận hàng hóa có chữ ký của hai bên.${kind === 'ca_nhan' ? '\n+ Giấy đề nghị thanh toán.' : ''}${vatIn ? '\n+ Hóa đơn VAT.' : ''}`,
    trach_nhiem: T.trach_nhiem, cam_ket: T.cam_ket, hieu_luc: T.hieu_luc,
  };
}

// ---------- Dựng HTML ----------
const S = 'font-size:12pt';
const P = (inner, st = '') => `<p style="${S}; line-height:1.5${st ? '; ' + st : ''}">${inner}</p>`;
const B = (s) => `<strong>${s}</strong>`;
const I = (s) => `<em>${s}</em>`;
const center = 'text-align:center';
// Văn bản nhiều dòng: "# " tiêu đề đậm, "- " gạch đầu dòng, "+ " ý con
function block(txt, vals = {}) {
  const fill = (s) => s.replace(/\{([a-z_]+)\}/g, (m, k) => (vals[k] !== undefined ? vals[k] : m));
  return String(txt || '').split('\n').map((ln) => {
    const t = fill(ln.trimEnd());
    if (!t.trim()) return '';
    if (t.startsWith('# ')) return P(B(I(esc(t.slice(2)))), 'margin-top:3pt');
    if (t.startsWith('+ ')) return P(`+&nbsp; ${esc(t.slice(2))}`, 'margin-left:22pt; text-align:justify');
    if (t.startsWith('- ')) return P(`-&nbsp; ${esc(t.slice(2))}`, 'margin-left:8pt; text-align:justify');
    return P(esc(t), 'text-align:justify');
  }).join('');
}
const article = (title, body) => P(B(`<u>${esc(title)}</u>`), 'margin-top:8pt; margin-bottom:2pt') + body;
// Dòng "Nhãn : giá trị" trong phần thông tin hai bên (dòng trống thì bỏ)
const line = (label, value, extra = '') => (String(value || '').trim() ? P(`${B(label)}: ${esc(value)}${extra}`) : '');
function party(title, f, p, kind) {
  const rep = String(f[`${p}_dai_dien`] || '').trim();
  const role = String(f[`${p}_chuc_vu`] || '').trim();
  let h = P(`${B(`${esc(title)}: ${esc(f[`${p}_ten`] || '')}`)}`, 'margin-top:4pt');
  if (rep || role) h += P(`${B('Đại diện')}: ${B(esc(rep))}${role ? `&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${B('Chức vụ')}: ${esc(role)}` : ''}`);
  h += line('Địa chỉ', f[`${p}_dia_chi`]) + line('Điện thoại', f[`${p}_dien_thoai`]);
  if (p === 'a' && kind === 'ca_nhan') h += line('CCCD', f.a_cccd, f.a_cccd_cap ? ` ${esc(f.a_cccd_cap)}` : '') + line('Người theo dõi hợp đồng', f.a_theo_doi);
  else h += line('Mã số thuế', f[`${p}_mst`]);
  h += line('Tài khoản', f[`${p}_tai_khoan`]) + line('Chủ tài khoản', f[`${p}_chu_tk`]) + line('Ngân hàng', f[`${p}_ngan_hang`]);
  return h;
}
function dateParts(iso) { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return y ? { d, m, y } : null; }

// Bảng Điều 1: khối lượng, đơn giá theo hàng trong đơn; VAT, vận chuyển lấy từ đơn
function goodsTable(data) {
  const o = data.o; const g = goodsLines('don_dat_hang', data);
  const goods = g.reduce((s, l) => s + l.total, 0);
  const vat = Number(o.vat_total || 0); const total = Number(o.order_total || 0);
  const ship = Math.max(0, total - Number(o.goods_total || 0) - vat);
  const disc = Math.max(0, goods - Number(o.goods_total || 0));
  const td = (h, st = '') => `<td style="vertical-align:middle${st ? '; ' + st : ''}"><p style="font-size:11pt${st.includes('right') ? '; text-align:right' : st.includes('center') ? '; text-align:center' : ''}">${h}</p></td>`;
  const head = ['STT', 'Tên sản phẩm', 'Số lượng', 'ĐVT', 'Đơn giá', 'Thành tiền'].map((x) => td(B(x), 'text-align:center')).join('');
  const rows = g.map((l, i) => `<tr>${td(String(i + 1), 'text-align:center')}${td(esc(l.name))}${td(N(l.qty), 'text-align:center')}${td(esc(l.unit || ''), 'text-align:center')}${td(N(l.price), 'text-align:right')}${td(N(l.total), 'text-align:right')}</tr>`).join('');
  const sum = (label, v) => `<tr>${td('')}${td('')}<td colspan="3" style="vertical-align:middle"><p style="font-size:11pt; text-align:center">${B(label)}</p></td>${td(B(N(v)), 'text-align:right')}</tr>`;
  const words = `<tr><td colspan="6"><p style="font-size:11pt">${B(I(`Bằng chữ: ${esc(moneyWords(total, true))}./.`))}</p></td></tr>`;
  return `<table data-border="1" style="font-size:11pt; margin-top:4pt"><colgroup><col style="width:40px"><col><col style="width:80px"><col style="width:52px"><col style="width:80px"><col style="width:104px"></colgroup><tbody>
<tr>${head}</tr>${rows}${sum('Tổng tiền', goods)}${disc > 0 ? sum('Chiết khấu', -disc) : ''}${Number(o.vat_rate) > 0 ? sum(`VAT ${fmtNum(o.vat_rate)}%`, vat) : ''}${ship > 0 ? sum('Vận chuyển', ship) : ''}${sum('Tổng thanh toán', total)}${words}</tbody></table>`;
}
function signs(leftTitle, rightTitle, leftNote, rightNote, leftName, rightName) {
  const cell = (t, n, name) => `<td><p style="${S}; ${center}">${B(t)}</p>${n ? `<p style="font-size:11pt; ${center}">${I(n)}</p>` : ''}<p style="${S}">&nbsp;</p><p style="${S}">&nbsp;</p><p style="${S}">&nbsp;</p><p style="${S}">&nbsp;</p><p style="${S}; ${center}">${B(esc(name || ''))}</p></td>`;
  return `<table data-border="0" style="margin-top:12pt"><colgroup><col><col></colgroup><tbody><tr>${cell(leftTitle, leftNote, leftName)}${cell(rightTitle, rightNote, rightName)}</tr></tbody></table>`;
}
const bareName = (s) => upper(String(s || '').replace(/^(ông|bà|anh|chị)\s+/i, ''));

export function contractHtml(kind, f, data) {
  const dp = dateParts(f.ngay_ky);
  const dateTxt = dp ? `${esc(f.noi_ky || 'Hà Nội')}, ngày ${dp.d} tháng ${dp.m} năm ${dp.y}` : `${esc(f.noi_ky || 'Hà Nội')}, ngày ...... tháng ...... năm ........`;
  let h = P(B('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'), center) + P(B('Độc lập – Tự do – Hạnh phúc'), center) + P('---------------', center)
    + P(I(B(dateTxt)), 'text-align:right; margin-top:4pt');
  const at = String(f.dia_diem_ky || '').trim();
  const today = dp ? `Hôm nay, ngày ${dp.d}/${dp.m}/${dp.y}` : 'Hôm nay, ngày ..... tháng ..... năm ......';
  if (kind === 'nguyen_tac') {
    h += P(`<span style="font-size:16pt">${B('HỢP ĐỒNG NGUYÊN TẮC MUA BÁN HÀNG HÓA')}</span>`, `${center}; margin-top:8pt`) + P(B(`Số: ${esc(f.so_hd || '....../HĐNT')}`), center)
      + P(I('– Căn cứ theo Luật Thương mại năm 2006;'), 'margin-top:6pt') + P(I('– Căn cứ nhu cầu, khả năng và sự thỏa thuận của hai Bên.'))
      + P(`${today}${at ? `, tại ${esc(at)}` : ''}, chúng tôi gồm:`, 'margin-top:4pt')
      + party('Bên bán', f, 'b', kind) + party('Bên mua', f, 'a', kind)
      + P(I(B('Hai Bên cùng đồng ý ký kết Hợp đồng nguyên tắc mua bán hàng hóa với các điều khoản sau:')), 'margin-top:6pt')
      + block(f.dieu_khoan, { thoi_han: esc(f.thoi_han || '12 tháng'), so_ban: esc(f.so_ban || '04') })
      + signs('BÊN BÁN', 'BÊN MUA', '(Đại diện bên bán ký và đóng dấu)', '(Đại diện bên mua ký và đóng dấu)', bareName(f.b_dai_dien), bareName(f.a_dai_dien));
    return h;
  }
  h += P(`<span style="font-size:16pt">${B('HỢP ĐỒNG KINH TẾ')}</span>`, `${center}; margin-top:8pt`) + P(B(`Số: ${esc(f.so_hd || '')}`), center)
    + P(I('- Căn cứ pháp lệnh HĐKT ngày 25/9/1989 của hội đồng nhà nước và các văn bản hướng dẫn thi hành của các cấp các ngành.'), 'margin-top:6pt; text-align:justify')
    + P(I('- Căn cứ nghị định số 17/HĐBT ngày 16/01/1990 của chính phủ quy định chi tiết thi hành pháp lệnh hợp đồng kinh tế.'), 'text-align:justify')
    + P(I('- Căn cứ nhu cầu của hai bên.'))
    + (at ? P(`${today} tại ${esc(at)},`) : '') + P('Chúng tôi gồm:')
    + party('BÊN A ( Bên mua )', f, 'a', kind) + party('BÊN B ( Bên bán )', f, 'b', kind)
    + P(I(B(`Hai bên thỏa thuận ký kết hợp đồng kinh tế mua bán: ${esc(f.chu_de || '')}`)), 'margin-top:6pt')
    + article('Điều 1: KHỐI LƯỢNG, ĐƠN GIÁ, QUY CÁCH HÀNG HÓA:', goodsTable(data) + (String(f.ghi_chu_gia || '').trim() ? P(B(I('Ghi chú :')), 'margin-top:4pt') + block(f.ghi_chu_gia).replace(/<p style="/g, '<p style="font-style:italic; ') : ''))
    + article('Điều 2. CHẤT LƯỢNG HÀNG HÓA:', block(f.chat_luong))
    + article('Điều 3. THỜI GIAN – PHƯƠNG THỨC GIAO HÀNG:', block(f.giao_hang))
    + article('Điều 4. ĐIỀU KIỆN ĐỔI TRẢ:', block(f.doi_tra))
    + article('Điều 5. HÌNH THỨC THANH TOÁN:', block(f.thanh_toan))
    + article('Điều 6. TRÁCH NHIỆM HAI BÊN:', block(f.trach_nhiem))
    + article('Điều 7. CAM KẾT CHUNG:', block(f.cam_ket))
    + article('Điều 8. HIỆU LỰC HỢP ĐỒNG:', block(f.hieu_luc))
    + signs('ĐẠI DIỆN BÊN A', 'ĐẠI DIỆN BÊN B', '', '', bareName(f.a_dai_dien), bareName(f.b_dai_dien));
  return h;
}

// Chứng từ in được (cùng dạng với buildPrintDoc): nội dung đã sửa tay nếu có, không thì dựng từ mẫu
export function buildContractDoc(kind, fields, data, ds, bodyHtml) {
  const f = { ...contractDefaults(kind, data, ds), ...(fields || {}) };
  const html = bodyHtml ? sanitizeHtml(bodyHtml) : contractHtml(kind, f, data);
  const code = f.so_hd || data.k?.code || '';
  return { html, font: 'Tinos', base: ds?.base ?? 0, paper: 'A4', orient: 'portrait', margin: { top: 15, right: 15, bottom: 15, left: 20 },
    filename: `hop-dong_${String(code).replace(/[/:*?"<>|\\]+/g, '-')}.pdf`, title: CONTRACT_KINDS[kind].label, code };
}
