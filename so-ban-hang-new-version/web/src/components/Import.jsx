import React, { useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, todayVN, dmy } from '../lib/format.js';
import { readWorkbook, extractProducts, extractParties, validateProducts, validateParties, productTemplate, partyTemplate, saveFile } from '../lib/excel.js';
import { Btn, Icon, Pill, Field, DateInput, Loading, Note, Table, Modal, Tabs } from './ui.jsx';

const TITLES = { products: 'Nhập hàng hóa từ Excel', kh: 'Nhập khách hàng từ Excel', ncc: 'Nhập nhà cung cấp từ Excel' };

export function ImportDialog({ kind = 'products', onClose }) {
  const { settings, book } = useApp();
  const pn = settings.price_names || ['Giá 1', 'Giá 2', 'Giá 3'];
  const existing = useQ(kind === 'products' ? 'products' : kind === 'kh' ? 'customers' : 'suppliers', [], null, 10000);
  const { run, busy } = useAction();
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [err, setErr] = useState('');
  const [date, setDate] = useState(todayVN());
  const [filter, setFilter] = useState('all');
  const [result, setResult] = useState(null);

  const onFile = async (f) => {
    setErr(''); setParsed(null); setResult(null); setFile(f);
    try {
      const wb = await readWorkbook(f);
      const ex = kind === 'products' ? extractProducts(wb, pn) : extractParties(wb, kind);
      if (!ex.sheet) throw new Error('Không tìm thấy cột “Tên” trong file. Hãy dùng file mẫu hoặc đặt tiêu đề cột đúng như file mẫu.');
      const rows = kind === 'products' ? validateProducts(ex.rows, existing.data || []) : validateParties(ex.rows, existing.data || [], pn);
      setParsed({ sheet: ex.sheet, columns: ex.columns, rows });
    } catch (e) { setErr(e.message || String(e)); }
  };

  const stats = useMemo(() => {
    if (!parsed) return null;
    const r = parsed.rows;
    const ok = r.filter((x) => !x.errors.length);
    return {
      total: r.length, errors: r.filter((x) => x.errors.length).length, warnings: r.filter((x) => x.warnings.length).length,
      create: ok.filter((x) => !x.existing).length, update: ok.filter((x) => x.existing).length,
      qty: ok.filter((x) => !x.existing).reduce((s, x) => s + (x.qty || 0), 0),
      value: ok.filter((x) => !x.existing).reduce((s, x) => s + Math.round((x.qty || 0) * (x.cost || 0)), 0),
      debt: ok.filter((x) => !x.existing).reduce((s, x) => s + (x.opening_debt || 0), 0),
    };
  }, [parsed]);

  const doImport = async () => {
    const rows = parsed.rows.filter((x) => !x.errors.length).map(({ errors, warnings, existing: _e, __row, ...rest }) => rest);
    const r = kind === 'products'
      ? await run('import_products', { rows, opening_date: date }, (x) => `Đã nhập: ${x.created} mã mới, cập nhật ${x.updated} mã`)
      : await run('import_parties', { type: kind, rows, debt_date: date }, (x) => `Đã nhập: ${x.created} mới, cập nhật ${x.updated}`);
    if (r) setResult(r);
  };

  const shown = (parsed?.rows || []).filter((x) => filter === 'all' || (filter === 'err' && x.errors.length) || (filter === 'warn' && x.warnings.length) || (filter === 'new' && !x.existing && !x.errors.length) || (filter === 'upd' && x.existing && !x.errors.length));
  const cols = kind === 'products' ? [
    { key: 'n', label: 'Dòng', render: (x) => x.__row },
    { key: 'st', label: '', render: (x) => (x.errors.length ? <Pill tone="bad">Lỗi</Pill> : x.existing ? <Pill tone="info">Cập nhật</Pill> : <Pill tone="good">Mới</Pill>) },
    { key: 'sku', label: 'SKU', render: (x) => x.sku || <span className="muted">tự cấp</span> },
    { key: 'name', label: 'Tên hàng hóa', render: (x) => <><div>{x.name}</div><div className="cell-sub">{[x.category, x.pattern, x.size, x.color, x.unit, x.units_per_pack ? `${x.units_per_pack}/${x.pack_unit || 'hộp'}` : '', x.pack_weight ? `${x.pack_weight} kg/${x.pack_unit || 'hộp'}` : '', x.unit_weight ? `${x.unit_weight} kg/${String(x.unit || 'đv').toLowerCase()}` : ''].filter(Boolean).join(' · ')}</div></> },
    { key: 'cost', label: 'Giá vốn', align: 'right', render: (x) => money(x.cost) },
    { key: 'p1', label: pn[0], align: 'right', render: (x) => money(x.price1) },
    { key: 'p2', label: pn[1], align: 'right', render: (x) => money(x.price2) },
    { key: 'p3', label: pn[2], align: 'right', render: (x) => money(x.price3) },
    { key: 'qty', label: 'SL tồn', align: 'right', render: (x) => fq(x.qty) },
    { key: 'msg', label: 'Kiểm tra', render: (x) => <span className="small">{x.errors.map((m) => <div key={m} className="bad">{m}</div>)}{x.warnings.map((m) => <div key={m} className="warn">{m}</div>)}</span> },
  ] : [
    { key: 'n', label: 'Dòng', render: (x) => x.__row },
    { key: 'st', label: '', render: (x) => (x.errors.length ? <Pill tone="bad">Lỗi</Pill> : x.existing ? <Pill tone="info">Cập nhật</Pill> : <Pill tone="good">Mới</Pill>) },
    { key: 'code', label: 'Mã', render: (x) => x.code || <span className="muted">tự cấp</span> },
    { key: 'name', label: 'Tên', render: (x) => <><div>{x.name}</div><div className="cell-sub">{[x.phone, x.address].filter(Boolean).join(' · ')}</div></> },
    ...(kind === 'kh' ? [{ key: 't', label: 'Mức giá', render: (x) => (x.price_tier ? pn[x.price_tier - 1] : pn[0]) }] : []),
    { key: 'cd', label: 'Ngày được nợ', align: 'right', render: (x) => x.credit_days ?? 0 },
    { key: 'od', label: 'Nợ đầu kỳ', align: 'right', render: (x) => money(x.opening_debt) },
    { key: 'dd', label: 'Hạn trả', render: (x) => (x.due_date && x.due_date !== 'INVALID' ? dmy(x.due_date) : '') },
    { key: 'msg', label: 'Kiểm tra', render: (x) => <span className="small">{x.errors.map((m) => <div key={m} className="bad">{m}</div>)}{x.warnings.map((m) => <div key={m} className="warn">{m}</div>)}</span> },
  ];

  return (
    <Modal title={TITLES[kind]} subtitle={`Sổ: ${book.name}`} onClose={onClose} size="xl"
      footer={result ? <Btn kind="primary" onClick={onClose}>Xong</Btn> : <>
        <Btn icon="dl" onClick={() => saveFile(kind === 'products' ? 'mau-nhap-hang-hoa.xlsx' : kind === 'kh' ? 'mau-nhap-khach-hang.xlsx' : 'mau-nhap-nha-cung-cap.xlsx', kind === 'products' ? productTemplate(pn) : partyTemplate(kind, pn))}>Tải file mẫu</Btn>
        <span className="grow" />
        <Btn onClick={onClose}>Thôi</Btn>
        <Btn kind="primary" busy={busy} disabled={!parsed || !stats || stats.create + stats.update === 0} onClick={doImport}>
          {stats ? `Xác nhận nhập ${stats.create + stats.update} dòng${stats.errors ? ` (bỏ qua ${stats.errors} dòng lỗi)` : ''}` : 'Xác nhận nhập'}</Btn>
      </>}>
      {!result && <>
        <Note>{kind === 'products'
          ? <>Nhập 1 lần toàn bộ hàng hóa: tên, chủng loại, mẫu, kích thước, màu, ĐVT, giá vốn, 3 mức giá bán ({pn.join(' / ')}) và số lượng tồn. Số lượng + giá vốn được ghi thành <b>phiếu tồn đầu kỳ</b> — không phải giao dịch mua bán nên không làm tăng doanh thu hay công nợ. SKU đã có thì chỉ cập nhật thông tin & giá, không đổi tồn. File gốc của anh không bị thay đổi.</>
          : <>Nhập danh sách {kind === 'kh' ? 'khách hàng' : 'nhà cung cấp'} kèm nợ đầu kỳ. Mã đã có thì chỉ cập nhật thông tin, không cộng thêm nợ.</>}</Note>
        <div className="row gap">
          <label className="btn btn-soft"><Icon name="up" /> Chọn file Excel (.xlsx, .xls, .csv)<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
          {file && <span className="muted">{file.name}</span>}
          <Field label={kind === 'products' ? 'Ngày ghi tồn đầu kỳ' : 'Ngày ghi nợ đầu kỳ'}><DateInput value={date} onChange={setDate} max={todayVN()} /></Field>
        </div>
        {existing.loading && <Loading text="Đang tải danh mục hiện có để kiểm tra trùng…" />}
        {err && <Note tone="bad">{err}</Note>}
        {parsed && stats && <>
          <div className="kpis">
            <div className="kpi"><span className="kpi-label">Dòng đọc được</span><span className="kpi-value">{stats.total}</span><span className="kpi-sub">sheet “{parsed.sheet}”</span></div>
            <div className="kpi"><span className="kpi-label">Tạo mới / cập nhật</span><span className="kpi-value">{stats.create} / {stats.update}</span></div>
            <div className={`kpi ${stats.errors ? 'alertk' : ''}`}><span className="kpi-label">Dòng lỗi (sẽ bỏ qua)</span><span className="kpi-value">{stats.errors}</span><span className="kpi-sub">{stats.warnings} dòng cần lưu ý</span></div>
            {kind === 'products'
              ? <div className="kpi key"><span className="kpi-label">Tồn đầu kỳ sẽ ghi</span><span className="kpi-value">{money(stats.value)}</span><span className="kpi-sub">{fq(stats.qty)} đơn vị hàng</span></div>
              : <div className="kpi key"><span className="kpi-label">Nợ đầu kỳ sẽ ghi</span><span className="kpi-value">{money(stats.debt)}</span></div>}
          </div>
          <div className="muted small">Cột nhận ra: {parsed.columns.join(', ')}</div>
          <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'Tất cả', count: stats.total }, { value: 'err', label: 'Lỗi', count: stats.errors },
            { value: 'warn', label: 'Cần lưu ý', count: stats.warnings }, { value: 'new', label: 'Mới', count: stats.create }, { value: 'upd', label: 'Cập nhật', count: stats.update }]} />
          <Table dense rows={shown} rowKey="__row" columns={cols} />
        </>}
      </>}
      {result && (
        <div className="stack">
          <Note tone="good">Đã nhập xong{result.adjustment_code ? ` — phiếu tồn đầu kỳ ${result.adjustment_code}` : ''}.</Note>
          <div className="section"><div className="section-head"><h3>Đối chiếu trước / sau khi nhập</h3></div>
            <Table dense rowKey="k" rows={kind === 'products' ? [
              { k: 'Số mã tạo mới', a: stats.create, b: result.created },
              { k: 'Số mã cập nhật', a: stats.update, b: result.updated },
              { k: 'Tổng số lượng tồn đầu kỳ', a: stats.qty, b: result.opening_qty },
              { k: 'Tổng giá trị tồn đầu kỳ', a: stats.value, b: result.opening_value },
            ] : [
              { k: 'Số dòng tạo mới', a: stats.create, b: result.created }, { k: 'Số dòng cập nhật', a: stats.update, b: result.updated },
              { k: 'Tổng nợ đầu kỳ', a: stats.debt, b: result.debt_total },
            ]} columns={[
              { key: 'k', label: 'Chỉ tiêu' }, { key: 'a', label: 'Theo file', align: 'right', render: (x) => money(x.a) }, { key: 'b', label: 'Đã ghi vào sổ', align: 'right', render: (x) => money(x.b) },
              { key: 'c', label: '', render: (x) => (Math.round(x.a) === Math.round(x.b) ? <Pill tone="good">Khớp</Pill> : <Pill tone="bad">Lệch</Pill>) },
            ]} />
          </div>
          {(result.warnings || []).length > 0 && <Note tone="warn">{result.warnings.map((w) => <div key={w}>{w}</div>)}</Note>}
        </div>
      )}
    </Modal>
  );
}
