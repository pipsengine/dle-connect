import type { LeaveReportTable } from '@/lib/leave-reports-engine';

export type SpreadsheetTableExport = {
  id?: string;
  title: string;
  description?: string;
  generatedAt?: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  exceptionRowIndexes?: number[];
  summary?: Array<{ label: string; value: string | number }>;
};

const xmlEscape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const isNumeric = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value);
  const raw = String(value ?? '').trim();
  if (!raw || /[%₦,]/.test(raw)) return false;
  return /^-?\d+(\.\d+)?$/.test(raw);
};

/**
 * Build a SpreadsheetML (.xls) workbook Excel can open with:
 * - styled header row
 * - AutoFilter table range
 * - freeze panes
 * - optional exception/critical row highlighting
 */
export const buildSpreadsheetTableExcelXml = (report: SpreadsheetTableExport) => {
  const generatedAt = report.generatedAt || new Date().toISOString();
  const exceptionSet = new Set(report.exceptionRowIndexes || []);
  const colCount = Math.max(1, report.headers.length);
  const dataRowCount = Math.max(report.rows.length, 1);
  const headerRow = 4;
  const lastTableRow = headerRow + dataRowCount;
  const tableRef = `R${headerRow}C1:R${lastTableRow}C${colCount}`;
  const expandedRows = lastTableRow + (report.summary?.length || 0) + 3;

  const headerCells = report.headers
    .map((header) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(header)}</Data></Cell>`)
    .join('');

  const bodyRows = (report.rows.length
    ? report.rows
    : [report.headers.map(() => 'No records')]
  ).map((row, index) => {
    const styleId = report.rows.length && exceptionSet.has(index) ? 'ExceptionRow' : 'DataRow';
    const cells = report.headers.map((_, colIndex) => {
      const value = row[colIndex] ?? '';
      if (report.rows.length && isNumeric(value)) {
        return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${xmlEscape(value)}</Data></Cell>`;
      }
      return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('\n');

  const summaryRows = (report.summary || []).map((item) => (
    `<Row>
      <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">${xmlEscape(item.label)}</Data></Cell>
      <Cell ss:StyleID="SummaryValue"><Data ss:Type="${isNumeric(item.value) ? 'Number' : 'String'}">${xmlEscape(item.value)}</Data></Cell>
    </Row>`
  )).join('\n');

  const columnDefs = report.headers.map(() => '<Column ss:AutoFitWidth="1" ss:Width="120"/>').join('\n');
  const sheetName = xmlEscape((report.title || 'Export').replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31) || 'Export');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>${xmlEscape(report.title)}</Title>
  <Subject>DLE Connect Leave Management</Subject>
  <Author>DLE Connect HRIS</Author>
  <Created>${xmlEscape(generatedAt)}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#94A3B8"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataRow">
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="ExceptionRow">
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#7F1D1D"/>
   <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="Meta">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#64748B"/>
  </Style>
  <Style ss:ID="SummaryLabel">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SummaryValue">
   <Font ss:FontName="Calibri" ss:Size="11"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${sheetName}">
  <Names>
   <NamedRange ss:Name="_FilterDatabase" ss:RefersTo="='${sheetName}'!${tableRef}" ss:Hidden="1"/>
  </Names>
  <Table ss:ExpandedColumnCount="${colCount}" ss:ExpandedRowCount="${expandedRows}" x:FullColumns="1" x:FullRows="1">
   ${columnDefs}
   <Row ss:Height="22">
    <Cell ss:StyleID="Title" ss:MergeAcross="${Math.max(colCount - 1, 0)}"><Data ss:Type="String">${xmlEscape(report.title)}</Data></Cell>
   </Row>
   <Row>
    <Cell ss:StyleID="Meta" ss:MergeAcross="${Math.max(colCount - 1, 0)}"><Data ss:Type="String">${xmlEscape(report.description || '')} · Generated ${xmlEscape(generatedAt)}</Data></Cell>
   </Row>
   <Row></Row>
   <Row ss:Height="20">${headerCells}</Row>
   ${bodyRows}
   <Row></Row>
   ${summaryRows}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Landscape"/>
    <Header x:Margin="0.3"/>
    <Footer x:Margin="0.3"/>
    <PageMargins x:Bottom="0.4" x:Left="0.4" x:Right="0.4" x:Top="0.4"/>
   </PageSetup>
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>${headerRow}</SplitHorizontal>
   <TopRowBottomPane>${headerRow}</TopRowBottomPane>
   <ActivePane>2</ActivePane>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>
  <AutoFilter x:Range="${tableRef}" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>`;
};

export const buildLeaveReportExcelXml = (report: LeaveReportTable) => buildSpreadsheetTableExcelXml(report);

export const leaveReportExcelFilename = (
  report: Pick<LeaveReportTable, 'id' | 'title' | 'generatedAt'> | (SpreadsheetTableExport & { id?: string }),
) => {
  const slug = String(('id' in report && report.id) || report.title || 'export')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'export';
  const stamp = String(report.generatedAt || new Date().toISOString()).slice(0, 10);
  return `leave-${slug}-${stamp}.xls`;
};

export const leaveReportExcelResponseHeaders = (filename: string) => ({
  'content-type': 'application/vnd.ms-excel; charset=utf-8',
  'content-disposition': `attachment; filename="${filename}"`,
  'cache-control': 'no-store',
});
