// Kiểm thử ô tìm kiếm: kết quả xếp theo độ khớp (mã trùng, tên bắt đầu bằng… lên đầu) và xếp trước khi cắt bớt
import { suite, finish } from './harness.js';
import { searchRank } from '../../web/src/lib/format.js';

const { G, C } = suite();
const P = [
  { sku: 'NA27-DC', name: 'Ngói âm 27 đỏ cờ - L180 x W190 - 0.94' },
  { sku: '1AD27-DC01', name: 'Ngói âm dương 27 đỏ cờ' },
  { sku: 'SP000032', name: 'Lọ hoa hướng dương' },
  { sku: 'X1', name: 'Ngói âm 27' },
  { sku: 'BO27', name: 'Bò nóc ngói 27' },
  { sku: 'LO', name: 'Lọ hoa', barcode: '8930001' },
];
const keys = (p) => ({ codes: [p.sku, p.barcode], name: p.name });
const names = (q, limit) => searchRank(P, q, keys, limit).map((p) => p.name);

G('Xếp theo độ khớp');
C('Tên trùng / ngắn nhất lên đầu, không phân biệt dấu', names('ngoi am 27')[0], 'Ngói âm 27');
C('Tên bắt đầu bằng chữ gõ đứng trước tên chỉ chứa', names('lo hoa'), ['Lọ hoa', 'Lọ hoa hướng dương']);
C('Mã trùng hẳn lên đầu', names('sp000032')[0], 'Lọ hoa hướng dương');
C('Mã bắt đầu bằng chữ gõ', names('1ad27')[0], 'Ngói âm dương 27 đỏ cờ');
C('Tìm theo mã vạch', names('8930001'), ['Lọ hoa']);
C('Từ ở giữa tên vẫn tìm được', names('duong').length, 2);
C('Không khớp thì trả về rỗng', names('xanh ngọc'), []);
C('Ô trống giữ nguyên thứ tự gốc', searchRank(P, '', keys).map((p) => p.sku), P.map((p) => p.sku));

G('Xếp trước rồi mới cắt bớt (món khớp sát nhất không bị cắt mất)');
const many = [...Array.from({ length: 100 }, (_, i) => ({ sku: `A${i}`, name: `Ngói âm 27 mẫu số ${i}` })), { sku: 'Z9', name: 'Ngói âm 27' }];
C('Món ở cuối danh mục vẫn lên đầu dù chỉ lấy 60 dòng', searchRank(many, 'ngoi am 27', keys, 60)[0].sku, 'Z9');

finish('Tìm kiếm xếp theo độ khớp');
