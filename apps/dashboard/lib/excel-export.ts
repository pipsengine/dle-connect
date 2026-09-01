export type ExcelCell = string | number | boolean | null | undefined | Date;

export type ExcelWorksheetInput = {
  title: string;
  sheetName?: string;
  columns: string[];
  rows: ExcelCell[][];
  generatedAt?: string;
  subtitle?: string;
  exactReferenceDayrateMode?: boolean;
  /** Optional row-1 title used with exactReferenceDayrateMode (e.g. Employee Bank Details). */
  banner?: string;
};

export type ExcelWorkbookInput = {
  worksheets: ExcelWorksheetInput[];
  generatedAt?: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const safeSheetName = (value: string | undefined) =>
  escapeHtml((value || 'Export').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));

const cellText = (value: ExcelCell) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value ?? '';
};

export const buildExcelHtml = ({ title, sheetName, columns, rows, generatedAt, subtitle, exactReferenceDayrateMode, banner }: ExcelWorksheetInput) => {
  const columnCount = Math.max(columns.length, 1);
  const generated = generatedAt || new Date().toISOString();
  const metadataRows = exactReferenceDayrateMode
    ? (banner ? `<tr><td colspan="${columnCount}" class="report-title">${escapeHtml(banner)}</td></tr>` : '')
    : [
        `<tr><td colspan="${columnCount}" class="report-title">${escapeHtml(title)}</td></tr>`,
        subtitle ? `<tr><td colspan="${columnCount}" class="report-subtitle">${escapeHtml(subtitle)}</td></tr>` : '',
        `<tr><td colspan="${columnCount}" class="report-meta">Generated: ${escapeHtml(new Date(generated).toLocaleString('en-GB'))}</td></tr>`,
        `<tr><td colspan="${columnCount}" class="blank"></td></tr>`,
      ].join('');

  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
  const body = rows
    .map((row, index) => {
      const cells = columns.map((_, cellIndex) => {
        const raw = row[cellIndex];
        const numeric = typeof raw === 'number' && Number.isFinite(raw);
        const value = cellText(raw);
        const hasValue = numeric || value !== '';
        const cls = numeric ? 'number' : (hasValue ? 'text' : 'blank');
        return `<td class="${cls}">${escapeHtml(String(value))}</td>`;
      });
      return `<tr class="${index % 2 ? 'alt' : ''}">${cells.join('')}</tr>`;
    })
    .join('');


  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${safeSheetName(sheetName || title)}</x:Name><x:WorksheetOptions><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>5</x:SplitHorizontal><x:TopRowBottomPane>5</x:TopRowBottomPane></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #0f4c81; color: #ffffff; font-weight: 700; border: 1px solid #0b3a63; padding: 8px; text-align: left; white-space: nowrap; }
    td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; }
    td.text { mso-number-format:"\\@"; }
    td.number { text-align: right; mso-number-format:"#,##0.00"; }
    td.blank { }
    tr.alt td { background: #f8fafc; }
    .report-title { background: #082f49; color: #ffffff; font-size: 18px; font-weight: 800; padding: 12px; border: 1px solid #082f49; }
    .report-subtitle { background: #e0f2fe; color: #075985; font-weight: 700; padding: 8px 12px; border: 1px solid #bae6fd; }
    .report-meta { background: #f1f5f9; color: #475569; font-weight: 700; padding: 8px 12px; border: 1px solid #cbd5e1; }
    .blank { height: 10px; border: 0; }
  </style>
</head>
<body>
  <table>
    ${metadataRows}
    <tr>${header}</tr>
    ${body}
  </table>
</body>
</html>`;
};

export const excelMimeType = 'application/vnd.ms-excel;charset=utf-8';

const escapeXml = (value: unknown) =>
  String(value ?? '')
    // XML 1.0 disallows most C0 controls; leaving them in makes Excel report the file as corrupt.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const spreadsheetCell = (value: ExcelCell, style: 'Odd' | 'Even') => {
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const normalized = numeric ? String(value) : String(cellText(value));
  const emptyString = !numeric && normalized === '';
  const dataType = numeric ? 'Number' : (emptyString ? '' : 'String');
  const styleId = numeric ? `${style}Number` : style;
  const dataAttr = dataType ? ` ss:Type="${dataType}"` : '';
  return `<Cell ss:StyleID="${styleId}">${emptyString ? '' : `<Data${dataAttr}>${escapeXml(normalized)}</Data>`}</Cell>`;
};

/**
 * SpreadsheetML workbook with one filterable, frozen, formatted table per sheet.
 * This is used for multi-pack exports without adding a client-side Excel dependency.
 */
export const buildExcelWorkbookXml = ({ worksheets, generatedAt }: ExcelWorkbookInput) => {
  const created = generatedAt || new Date().toISOString();
  const usedNames = new Set<string>();
  const sheets = worksheets.map((worksheet, sheetIndex) => {
    const baseName = (worksheet.sheetName || worksheet.title || `Sheet ${sheetIndex + 1}`)
      .replace(/[\\/?*[\]:]/g, ' ')
      .slice(0, 31) || `Sheet ${sheetIndex + 1}`;
    let sheetName = baseName;
    let suffix = 2;
    while (usedNames.has(sheetName)) {
      const ending = ` ${suffix++}`;
      sheetName = `${baseName.slice(0, 31 - ending.length)}${ending}`;
    }
    usedNames.add(sheetName);

    const columns = worksheet.columns.length ? worksheet.columns : ['Result'];
    const rows = worksheet.rows.length ? worksheet.rows : [columns.map((_, index) => index === 0 ? 'No records' : '')];
    const columnCount = columns.length;
    const hasBanner = Boolean(worksheet.exactReferenceDayrateMode && worksheet.banner);
    const headerRow = worksheet.exactReferenceDayrateMode ? (hasBanner ? 2 : 1) : 4;
    const lastRow = headerRow + rows.length;
    const filterRange = `R${headerRow}C1:R${lastRow}C${columnCount}`;
    const columnDefs = columns.map((column) => {
      const width = Math.min(260, Math.max(85, column.length * 8 + 24));
      return `<Column ss:AutoFitWidth="1" ss:Width="${width}"/>`;
    }).join('');
    const headerCells = columns
      .map((column) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(column)}</Data></Cell>`)
      .join('');
    const dataRows = rows.map((row, index) => {
      const style = index % 2 ? 'Even' as const : 'Odd' as const;
      return `<Row>${columns.map((_, columnIndex) => spreadsheetCell(row[columnIndex], style)).join('')}</Row>`;
    }).join('');
    const selected = sheetIndex === 0 ? '<Selected/>' : '';

    const prefixRows = worksheet.exactReferenceDayrateMode
      ? (hasBanner
        ? `<Row ss:Height="24"><Cell ss:StyleID="Title" ss:MergeAcross="${Math.max(0, columnCount - 1)}"><Data ss:Type="String">${escapeXml(worksheet.banner)}</Data></Cell></Row>`
        : '')
      : [
          `<Row ss:Height="24"><Cell ss:StyleID="Title" ss:MergeAcross="${Math.max(0, columnCount - 1)}"><Data ss:Type="String">${escapeXml(worksheet.title)}</Data></Cell></Row>`,
          `<Row><Cell ss:StyleID="Meta" ss:MergeAcross="${Math.max(0, columnCount - 1)}"><Data ss:Type="String">${escapeXml(worksheet.subtitle || '')} · Generated ${escapeXml(worksheet.generatedAt || created)}</Data></Cell></Row>`,
          `<Row></Row>`,
        ].join('');
    const headerRowXml = worksheet.exactReferenceDayrateMode
      ? `<Row ss:Height="22">${headerCells}</Row>`
      : `<Row ss:Height="22">${headerCells}</Row>`;

    return `<Worksheet ss:Name="${escapeXml(sheetName)}">
 <Names><NamedRange ss:Name="_FilterDatabase" ss:RefersTo="='${escapeXml(sheetName.replace(/'/g, "''"))}'!${filterRange}" ss:Hidden="1"/></Names>
 <Table ss:ExpandedColumnCount="${columnCount}" ss:ExpandedRowCount="${lastRow}" x:FullColumns="1" x:FullRows="1">
  ${columnDefs}
  ${prefixRows}
  ${headerRowXml}
  ${dataRows}
 </Table>
 <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
  ${selected}<FreezePanes/><FrozenNoSplit/><SplitHorizontal>${headerRow}</SplitHorizontal><TopRowBottomPane>${headerRow}</TopRowBottomPane><ActivePane>2</ActivePane>
  <ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios>
 </WorksheetOptions>
 <AutoFilter x:Range="${filterRange}" xmlns="urn:schemas-microsoft-com:office:excel"/>
</Worksheet>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>DLE Connect HRIS</Author><Created>${escapeXml(created)}</Created></DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="Title"><Font ss:FontName="Calibri" ss:Size="15" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#082F49" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Meta"><Font ss:FontName="Calibri" ss:Size="10" ss:Color="#075985"/><Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Header"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F4C81" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0B3A63"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0B3A63"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0B3A63"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0B3A63"/></Borders></Style>
  <Style ss:ID="Odd"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="Even" ss:Parent="Odd"><Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/></Style>
  <Style ss:ID="OddNumber" ss:Parent="Odd"><NumberFormat ss:Format="#,##0.00"/><Alignment ss:Horizontal="Right"/></Style>
  <Style ss:ID="EvenNumber" ss:Parent="Even"><NumberFormat ss:Format="#,##0.00"/><Alignment ss:Horizontal="Right"/></Style>
 </Styles>
 ${sheets}
</Workbook>`;
};

export const downloadExcelFile = (input: ExcelWorksheetInput & { fileName: string }) => {
  const blob = new Blob([buildExcelHtml(input)], { type: excelMimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = input.fileName.endsWith('.xls') ? input.fileName : `${input.fileName}.xls`;
  link.click();
  URL.revokeObjectURL(url);
};

/** Client download for SpreadsheetML workbook (table, auto-filter, freeze panes, number formats). */
export const downloadExcelWorkbook = (input: ExcelWorkbookInput & { fileName: string }) => {
  const xml = buildExcelWorkbookXml(input);
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = input.fileName.endsWith('.xls') ? input.fileName : `${input.fileName}.xls`;
  link.click();
  URL.revokeObjectURL(url);
};
