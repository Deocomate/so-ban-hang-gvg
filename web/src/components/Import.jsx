import React, { useMemo, useState } from 'react';
import { useApp, useQ, useAction } from '../lib/store.jsx';
import { money, qty as fq, todayVN, dmy } from '../lib/format.js';
import { loadSheets, importFields, importRules, guessSheet, findHeader, guessColumns, buildRows, badCells, columnIssues, rowState, openingSheet, mergeOpening, validateProducts, validateParties, productTemplate, partyTemplate, saveFile } from '../lib/excel.js';
import { Btn, Icon, Pill, Field, DateInput, NumInput, Select, Check, Loading, Note, Table, Modal, Tabs } from './ui.jsx';

const TITLES = { products: 'Nhập hàng hóa từ Excel', kh: 'Nhập khách hàng từ Excel', ncc: 'Nhập nhà cung cấp từ Excel' };
const STEPS = ['Chọn file', 'Chọn cột', 'Kiểm tra & nhập'];
const STATE_PILL = { err: ['bad', 'Lỗi'], upd: ['info', 'Cập nhật'], same: ['neutral', 'Không đổi'], dup: ['warn', 'Nghi trùng'], new: ['good', 'Mới'] };

export function ImportDialog({ kind = 'products', onClose }) {
  const { settings, book } = useApp();
  const pn = settings.price_names || ['Giá 1', 'Giá 2', 'Giá 3'];
  const fields = useMemo(() => importFields(kind, pn), [kind, pn]);
  const rules = useMemo(() => importRules(kind, pn), [kind, pn]);
  const isProducts = kind === 'products';
  const existing = useQ(isProducts ? 'products' : kind === 'kh' ? 'customers' : 'suppliers', [], null, 10000);
  const { run, busy } = useAction();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [headerIdx, setHeaderIdx] = useState(0);
  const [columns, setColumns] = useState([]);
  const [useOpening, setUseOpening] = useState(true);
  const [skipDup, setSkipDup] = useState(true);
  const [err, setErr] = useState('');
  const [date, setDate] = useState(todayVN());
  const [filter, setFilter] = useState('all');
  const [result, setResult] = useState(null);

  const sheet = sheets?.find((s) => s.name === sheetName) || null;
  const opening = isProducts && sheets ? openingSheet(sheets) : null;

  const pickSheet = (list, name) => {
    const s = list.find((x) => x.name === name);
    const idx = findHeader(s.rows, rules).idx;
    setSheetName(name); setHeaderIdx(idx); setColumns(guessColumns(s, idx, rules));
  };
  const pickHeader = (idx) => { setHeaderIdx(idx); setColumns(guessColumns(sheet, idx, rules)); };

  const onFile = async (f) => {
    setErr(''); setSheets(null); setResult(null); setFile(f); setFilter('all');
    try {
      const list = await loadSheets(f);
      if (!list.length || list.every((s) => !s.rows.length)) throw new Error('File không có dữ liệu.');
      setSheets(list); pickSheet(list, guessSheet(list, rules)); setStep(1);
    } catch (e) { setErr(`Không đọc được file: ${e.message || e}. File có thể bị đặt mật khẩu hoặc không phải Excel/CSV.`); }
  };

  const setCol = (index, patch) => setColumns((cs) => cs.map((c) => (c.index === index ? { ...c, ...patch } : c)));
  // Mỗi trường chỉ nhận từ 1 cột: chọn cho cột này thì cột đang giữ trường đó bị gỡ ra
  const assign = (index, field) => setColumns((cs) => cs.map((c) => (c.index === index ? { ...c, field, on: !!field } : field && c.field === field ? { ...c, field: '', on: false } : c)));
  const setAll = (on) => setColumns((cs) => cs.map((c) => ({ ...c, on: on && !!c.field })));

  const issues = useMemo(() => (sheet ? columnIssues(kind, columns, fields, sheet, headerIdx, pn) : []), [sheet, columns, fields, headerIdx, kind, pn]);
  const blocked = issues.some((x) => x.tone === 'bad');
  const fieldLabel = (key) => fields.find((f) => f.key === key)?.label || key;
  const opts = [{ value: '', label: '— Không nhập —' }, ...fields.map((f) => ({ value: f.key, label: f.label }))];

  const rows = useMemo(() => {
    if (!sheet || !existing.data || blocked) return null;
    let raw = buildRows(sheet, headerIdx, columns);
    const hasQty = columns.some((c) => c.on && c.field === 'qty');
    if (opening && useOpening && !hasQty) raw = mergeOpening(raw, opening);
    return isProducts ? validateProducts(raw, existing.data, pn) : validateParties(raw, existing.data, pn, kind);
  }, [sheet, headerIdx, columns, existing.data, blocked, opening, useOpening, isProducts, pn, kind]);

  const toSend = useMemo(() => (rows || []).filter((x) => { const s = rowState(x); return s === 'new' || s === 'upd' || (s === 'dup' && !skipDup); }), [rows, skipDup]);
  const stats = useMemo(() => {
    if (!rows) return null;
    const count = (s) => rows.filter((x) => rowState(x) === s).length;
    const fresh = toSend.filter((x) => !x.existing);
    return {
      total: rows.length, errors: count('err'), warnings: rows.filter((x) => x.warnings.length).length, same: count('same'), dup: count('dup'),
      create: fresh.length, update: toSend.length - fresh.length,
      qty: fresh.reduce((s, x) => s + (x.qty || 0), 0),
      value: fresh.reduce((s, x) => s + Math.round((x.qty || 0) * (x.cost || 0)), 0),
      debt: fresh.reduce((s, x) => s + (x.opening_debt || 0), 0),
    };
  }, [rows, toSend]);

  const doImport = async () => {
    // Dòng cập nhật không gửi tồn và nợ đầu kỳ: hai số này chỉ ghi khi tạo mới
    const payload = toSend.map(({ errors, warnings, changes, dup, existing: isOld, __row, ...rest }) => (isOld ? { ...rest, qty: null, cost: null, opening_debt: null, due_date: null } : rest));
    const r = isProducts
      ? await run('import_products', { rows: payload, opening_date: date }, (x) => `Đã nhập: ${x.created} mã mới, cập nhật ${x.updated} mã`)
      : await run('import_parties', { type: kind, rows: payload, debt_date: date }, (x) => `Đã nhập: ${x.created} mới, cập nhật ${x.updated}`);
    // Chốt số liệu theo file: sau khi nhập, danh mục tải lại nên mọi dòng thành "Không đổi"
    if (r) setResult({ ...r, plan: stats });
  };

  const shown = (rows || []).filter((x) => filter === 'all' || (filter === 'warn' ? x.warnings.length > 0 : rowState(x) === filter));
  const stateCol = { key: 'st', label: '', render: (x) => { const [tone, text] = STATE_PILL[rowState(x)]; return <Pill tone={tone}>{text}</Pill>; } };
  const checkCol = { key: 'msg', label: 'Kiểm tra', render: (x) => <span className="small">{x.errors.map((m) => <div key={m} className="bad">{m}</div>)}{x.warnings.map((m) => <div key={m} className="warn">{m}</div>)}{x.changes.map((m) => <div key={m}>{m}</div>)}</span> };
  const cols = isProducts ? [
    { key: 'n', label: 'Dòng', render: (x) => x.__row }, stateCol,
    { key: 'sku', label: 'SKU', render: (x) => x.sku || <span className="muted">tự cấp</span> },
    { key: 'name', label: 'Tên hàng hóa', render: (x) => <><div>{x.name}</div><div className="cell-sub">{[x.category, x.pattern, x.size, x.color, x.unit, x.units_per_pack ? `${x.units_per_pack}/${x.pack_unit || 'hộp'}` : '', x.pack_weight ? `${x.pack_weight} kg/${x.pack_unit || 'hộp'}` : '', x.unit_weight ? `${x.unit_weight} kg/${String(x.unit || 'đv').toLowerCase()}` : ''].filter(Boolean).join(' · ')}</div></> },
    { key: 'cost', label: 'Giá vốn', align: 'right', render: (x) => money(x.cost) },
    { key: 'p1', label: pn[0], align: 'right', render: (x) => money(x.price1) },
    { key: 'p2', label: pn[1], align: 'right', render: (x) => money(x.price2) },
    { key: 'p3', label: pn[2], align: 'right', render: (x) => money(x.price3) },
    { key: 'qty', label: 'SL tồn', align: 'right', render: (x) => fq(x.qty) },
    checkCol,
  ] : [
    { key: 'n', label: 'Dòng', render: (x) => x.__row }, stateCol,
    { key: 'code', label: 'Mã', render: (x) => x.code || <span className="muted">tự cấp</span> },
    { key: 'name', label: 'Tên', render: (x) => <><div>{x.name}</div><div className="cell-sub">{[x.phone, x.address].filter(Boolean).join(' · ')}</div></> },
    ...(kind === 'kh' ? [{ key: 't', label: 'Mức giá', render: (x) => (x.price_tier ? pn[x.price_tier - 1] : '') }] : []),
    { key: 'cd', label: 'Ngày được nợ', align: 'right', render: (x) => x.credit_days ?? '' },
    { key: 'od', label: 'Nợ đầu kỳ', align: 'right', render: (x) => money(x.opening_debt) },
    { key: 'dd', label: 'Hạn trả', render: (x) => (x.due_date && x.due_date !== 'INVALID' ? dmy(x.due_date) : '') },
    checkCol,
  ];

  const colTable = [
    { key: 'on', label: '', width: 36, render: (c) => <Check checked={c.on} onChange={(v) => setCol(c.index, { on: v && !!c.field })} /> },
    { key: 'h', label: 'Cột trong file', render: (c) => <><span className={c.on ? '' : 'muted'}><span className="muted">{c.letter}.</span> {c.header || <i>không có tiêu đề</i>}</span>{c.hidden && <> <Pill tone="neutral">đang ẩn</Pill></>}</> },
    { key: 'f', label: 'Nhập vào', width: 230, render: (c) => <Select value={c.field} onChange={(v) => assign(c.index, v)} options={opts} aria-label={`Nhập cột ${c.header} vào`} /> },
    { key: 'n', label: 'Số ô có dữ liệu', align: 'right', render: (c) => `${c.filled}` },
    { key: 's', label: 'Ví dụ', render: (c) => <span className="small muted">{c.samples.join(' · ')}</span> },
    { key: 'k', label: 'Kiểm tra', render: (c) => {
      if (!c.on || !c.field) return <span className="muted small">Không nhập</span>;
      if (!c.filled) return <Pill tone="neutral">Trống</Pill>;
      const bad = badCells(sheet, headerIdx, c, fields.find((f) => f.key === c.field), pn);
      return bad.length ? <Pill tone="bad" title={bad.slice(0, 5).map((b) => `Dòng ${b.row}: ${b.value}`).join('\n')}>{bad.length} ô sai</Pill> : <Pill tone="good">Đúng</Pill>;
    } },
  ];

  const onCount = columns.filter((c) => c.on && c.field).length;
  const canNext = !!sheet && !blocked && !!existing.data;
  const canImport = !!stats && toSend.length > 0;
  const saveTemplate = () => saveFile(isProducts ? 'mau-nhap-hang-hoa.xlsx' : kind === 'kh' ? 'mau-nhap-khach-hang.xlsx' : 'mau-nhap-nha-cung-cap.xlsx', isProducts ? productTemplate(pn) : partyTemplate(kind, pn));

  return (
    <Modal title={TITLES[kind]} subtitle={`Sổ: ${book.name}`} onClose={onClose} size="xl"
      footer={result ? <Btn kind="primary" onClick={onClose}>Xong</Btn> : <>
        {step === 0 && <Btn icon="dl" onClick={saveTemplate}>Tải file mẫu</Btn>}
        {step > 0 && <Btn icon="back" onClick={() => setStep(step - 1)}>Quay lại</Btn>}
        <span className="grow" />
        <Btn onClick={onClose}>Thôi</Btn>
        {step === 0 && sheet && <Btn kind="primary" onClick={() => setStep(1)}>Tiếp tục</Btn>}
        {step === 1 && <Btn kind="primary" disabled={!canNext} onClick={() => { setFilter('all'); setStep(2); }}>Tiếp tục: kiểm tra {onCount} cột</Btn>}
        {step === 2 && <Btn kind="primary" busy={busy} disabled={!canImport} onClick={doImport}>
          {stats ? `Xác nhận nhập ${toSend.length} dòng` : 'Xác nhận nhập'}</Btn>}
      </>}>
      {!result && <div className="steps" aria-label="Các bước nhập">
        {STEPS.map((s, i) => <span key={s} className={`step${i < step ? ' done' : i === step ? ' cur' : ''}`} style={{ cursor: 'default' }}>{i < step && <Icon name="check" size={13} />}{s}</span>)}
      </div>}

      {!result && step === 0 && <>
        <Note>{isProducts
          ? <>Nhập hàng hóa từ file Excel có sẵn hoặc file mẫu. Sau khi chọn file, phần mềm tự nhận cột và cho chọn cột nào sẽ nhập. Số lượng + giá vốn được ghi thành <b>phiếu tồn đầu kỳ</b> — không phải giao dịch mua bán nên không làm tăng doanh thu hay công nợ. File gốc không bị thay đổi.</>
          : <>Nhập danh sách {kind === 'kh' ? 'khách hàng' : 'nhà cung cấp'} kèm nợ đầu kỳ. Sau khi chọn file, phần mềm tự nhận cột và cho chọn cột nào sẽ nhập. Mã đã có thì chỉ cập nhật thông tin, không cộng thêm nợ.</>}</Note>
        <div className="row gap">
          <label className="btn btn-soft"><Icon name="up" /> Chọn file Excel (.xlsx, .xls, .csv)<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} /></label>
          {file && <span className="muted">{file.name}</span>}
        </div>
        {err && <Note tone="bad">{err}</Note>}
      </>}

      {!result && step === 1 && sheet && <>
        <div className="row gap" style={{ alignItems: 'flex-end' }}>
          <Field label="File"><span className="muted">{file?.name}</span></Field>
          <Field label="Sheet"><Select value={sheetName} onChange={(v) => pickSheet(sheets, v)} options={sheets.map((s) => ({ value: s.name, label: s.name }))} /></Field>
          <Field label="Dòng tiêu đề"><NumInput money={false} stepper min={1} max={sheet.rows.length} value={headerIdx + 1 + (sheet.rowBase || 0)} onChange={(v) => v >= 1 && pickHeader(Math.max(0, v - 1 - (sheet.rowBase || 0)))} style={{ maxWidth: 140 }} aria-label="Dòng tiêu đề" /></Field>
        </div>
        {existing.loading && <Loading text="Đang tải danh mục hiện có để kiểm tra trùng…" />}
        {existing.error && <Note tone="bad">Không tải được danh mục hiện có: {existing.error}</Note>}
        {issues.map((x) => <Note key={x.text} tone={x.tone}>{x.text}</Note>)}
        {opening && !columns.some((c) => c.on && c.field === 'qty') && <Check checked={useOpening} onChange={setUseOpening}>Lấy số lượng và giá vốn từ sheet “{opening.name}” (ghép theo SKU)</Check>}
        <div className="row gap-s">
          <span className="muted small grow">Đang chọn {onCount}/{columns.length} cột. Cột không chọn sẽ không được đụng tới, dữ liệu trong sổ giữ nguyên.</span>
          <Btn small onClick={() => setAll(true)}>Chọn tất cả</Btn>
          <Btn small onClick={() => setAll(false)}>Bỏ chọn tất cả</Btn>
        </div>
        <Table dense rows={columns} rowKey="index" columns={colTable} empty="Sheet này không có cột dữ liệu nào" />
      </>}

      {!result && step === 2 && stats && <>
        <div className="kpis">
          <div className="kpi"><span className="kpi-label">Dòng đọc được</span><span className="kpi-value">{stats.total}</span><span className="kpi-sub">sheet “{sheetName}”, {onCount} cột</span></div>
          <div className="kpi"><span className="kpi-label">Tạo mới / cập nhật</span><span className="kpi-value">{stats.create} / {stats.update}</span>{stats.same > 0 && <span className="kpi-sub">{stats.same} dòng không có gì đổi</span>}</div>
          <div className={`kpi ${stats.errors ? 'alertk' : ''}`}><span className="kpi-label">Dòng lỗi (sẽ bỏ qua)</span><span className="kpi-value">{stats.errors}</span><span className="kpi-sub">{stats.warnings} dòng cần lưu ý</span></div>
          {isProducts
            ? <div className="kpi key"><span className="kpi-label">Tồn đầu kỳ sẽ ghi</span><span className="kpi-value">{money(stats.value)}</span><span className="kpi-sub">{fq(stats.qty)} đơn vị hàng</span></div>
            : <div className="kpi key"><span className="kpi-label">Nợ đầu kỳ sẽ ghi</span><span className="kpi-value">{money(stats.debt)}</span></div>}
        </div>
        {(isProducts ? stats.qty > 0 : stats.debt !== 0) && <div className="row gap"><Field label={isProducts ? 'Ngày ghi tồn đầu kỳ' : 'Ngày ghi nợ đầu kỳ'}><DateInput value={date} onChange={setDate} max={todayVN()} /></Field></div>}
        {stats.errors > 0 && <Note tone="warn">{stats.errors} dòng có lỗi sẽ bị bỏ qua, các dòng còn lại vẫn được nhập. Muốn nhập đủ, hãy sửa file rồi chọn lại.</Note>}
        {stats.dup > 0 && <Check checked={skipDup} onChange={setSkipDup}>Bỏ qua {stats.dup} dòng không có mã nhưng giống hệt dữ liệu đã có trong sổ (tránh nhập trùng)</Check>}
        <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'Tất cả', count: stats.total }, { value: 'err', label: 'Lỗi', count: stats.errors },
          { value: 'warn', label: 'Cần lưu ý', count: stats.warnings }, { value: 'new', label: 'Mới', count: rows.filter((x) => rowState(x) === 'new').length }, { value: 'upd', label: 'Cập nhật', count: rows.filter((x) => rowState(x) === 'upd').length },
          ...(stats.same ? [{ value: 'same', label: 'Không đổi', count: stats.same }] : []), ...(stats.dup ? [{ value: 'dup', label: 'Nghi trùng', count: stats.dup }] : [])]} />
        <Table dense rows={shown} rowKey="__row" columns={cols} />
      </>}

      {result && (
        <div className="stack">
          <Note tone="good">Đã nhập xong{result.adjustment_code ? ` — phiếu tồn đầu kỳ ${result.adjustment_code}` : ''}.</Note>
          <div className="section"><div className="section-head"><h3>Đối chiếu trước / sau khi nhập</h3></div>
            <Table dense rowKey="k" rows={isProducts ? [
              { k: 'Số mã tạo mới', a: result.plan.create, b: result.created },
              { k: 'Số mã cập nhật', a: result.plan.update, b: result.updated },
              { k: 'Tổng số lượng tồn đầu kỳ', a: result.plan.qty, b: result.opening_qty },
              { k: 'Tổng giá trị tồn đầu kỳ', a: result.plan.value, b: result.opening_value },
            ] : [
              { k: 'Số dòng tạo mới', a: result.plan.create, b: result.created }, { k: 'Số dòng cập nhật', a: result.plan.update, b: result.updated },
              { k: 'Tổng nợ đầu kỳ', a: result.plan.debt, b: result.debt_total },
            ]} columns={[
              { key: 'k', label: 'Chỉ tiêu' }, { key: 'a', label: 'Theo file', align: 'right', render: (x) => money(x.a) }, { key: 'b', label: 'Đã ghi vào sổ', align: 'right', render: (x) => money(x.b) },
              { key: 'c', label: '', render: (x) => (Math.round(x.a) === Math.round(x.b) ? <Pill tone="good">Khớp</Pill> : <Pill tone="bad">Lệch</Pill>) },
            ]} />
          </div>
          {result.plan.errors > 0 && <Note tone="warn">{result.plan.errors} dòng lỗi trong file chưa được nhập.</Note>}
          {(result.warnings || []).length > 0 && <Note tone="warn">{result.warnings.map((w) => <div key={w}>{w}</div>)}</Note>}
        </div>
      )}
    </Modal>
  );
}
