import { crc32, deflateRawSync } from 'node:zlib';
import { LABOUR_REPORT_VERSION, type LabourReport, type ProjectLabourRow, type ValuedLabourLine } from '@/lib/project-labour-cost';

export type LabourExportMeta = {
  title: string;
  period: string;
  from: string;
  to: string;
  filters: string;
  generatedAt: string;
  generatedBy: string;
};

const xml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const naira = (kobo: number | null | undefined) => (kobo == null ? null : Math.round(kobo) / 100);
const hours = (value: number | null | undefined) => (value == null ? null : value);

const columnName = (index: number) => {
  let current = index + 1;
  let name = '';
  while (current > 0) {
    const rem = (current - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
};

const sheetXml = (rows: Array<Array<string | number | null>>) => {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, column) => {
      const ref = `${columnName(column)}${rowIndex + 1}`;
      if (value == null || value === '') return `<c r="${ref}"/>`;
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
};

const zipFiles = (files: Array<{ name: string; data: Buffer }>) => {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const compressed = deflateRawSync(file.data);
    const checksum = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    parts.push(local, name, compressed);
    central.push(centralHeader, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
};

const projectRow = (project: ProjectLabourRow): Array<string | number | null> => [
  project.projectCode,
  project.projectName,
  project.projectManager,
  project.employees,
  project.weekdayRegular,
  project.weekdayOvt,
  project.saturdayHours,
  project.saturdayOvt,
  project.sundayHours,
  project.sundayOvt,
  project.phHours,
  project.phOvt,
  project.nightHours,
  project.uniqueHours,
  project.plannedHours,
  project.utilization,
  naira(project.regularCostKobo),
  naira(project.ovtCostKobo),
  naira(project.nightLabourKobo),
  naira(project.nightAllowanceKobo),
  naira(project.otherAllowanceKobo),
  naira(project.approvedCostKobo),
  naira(project.provisionalCostKobo),
  naira(project.labourBudgetKobo),
  naira(project.varianceKobo),
  project.status,
];

const lineRow = (line: ValuedLabourLine): Array<string | number | null> => [
  line.employeeCode,
  line.employeeName,
  line.employeeType,
  line.department,
  line.supervisor,
  line.projectCode,
  line.workDate,
  line.weekdayRegular,
  line.weekdayOvt,
  line.saturdayHours,
  line.sundayHours,
  line.phHours,
  line.nightHours,
  line.nightSessionShare > 0 ? 1 : 0,
  line.uniqueHours,
  line.method,
  line.rateVersion,
  line.appliedRateKobo == null ? null : line.appliedRateKobo / 100,
  naira(line.regularCostKobo),
  naira(line.ovtCostKobo),
  naira(line.nightAllowanceKobo),
  naira(line.otherAllowanceKobo),
  naira(line.adjustmentKobo),
  naira(line.totalCostKobo),
  line.approval,
  line.provisional ? 'Provisional' : 'Approved actual',
  line.locked ? 'Locked' : '',
];

export const labourWorkbookRows = (report: LabourReport, meta: LabourExportMeta) => {
  const summary: Array<Array<string | number | null>> = [
    ['DLE Connect project man-hours and labour cost'],
    ['Report version', LABOUR_REPORT_VERSION],
    ['Period', meta.period],
    ['From', meta.from],
    ['To', meta.to],
    ['Filters', meta.filters],
    ['Generated at', meta.generatedAt],
    ['Generated by', meta.generatedBy],
    [],
    ['Total man-hours', report.overview.totalHours],
    ['Regular hours', report.overview.regularHours],
    ['Overtime hours', report.overview.overtimeHours],
    ['Night work hours', report.overview.nightHours],
    ['Employees utilized', report.overview.employees],
    ['Active projects', report.overview.projects],
    ['Approved labour cost', naira(report.overview.approvedCostKobo)],
    ['Provisional labour cost', naira(report.overview.provisionalCostKobo)],
    ['Labour budget', naira(report.overview.labourBudgetKobo)],
    ['Budget variance', naira(report.overview.budgetVarianceKobo)],
    ['Project utilization %', report.overview.projectUtilization],
    ['Workforce utilization %', report.overview.workforceUtilization],
  ];
  const projects: Array<Array<string | number | null>> = [[
    'Project', 'Name', 'Project Manager', 'Employees', 'Weekday REG', 'Weekday OVT', 'Saturday', 'Saturday OVT', 'Sunday', 'Sunday OVT', 'PH', 'PH OVT', 'Night Hours', 'Unique Hours', 'Planned Hours', 'Utilization %', 'REG Cost', 'OVT Cost', 'Night Labour', 'Night Allowance', 'Other Allowances', 'Approved Cost', 'Provisional Cost', 'Budget', 'Variance', 'Status',
  ], ...report.projects.map(projectRow)];
  const lines: Array<Array<string | number | null>> = [[
    'Employee Code', 'Employee Name', 'Type', 'Department', 'Supervisor', 'Project', 'Work Date', 'Weekday REG', 'Weekday OVT', 'Saturday', 'Sunday', 'PH', 'Night Hours', 'Night Sessions', 'Unique Hours', 'Method', 'Rate Version', 'Applied Rate', 'REG Cost', 'OVT Cost', 'Night Allowance', 'Other Allowances', 'Adjustment', 'Total Cost', 'Approval', 'Cost Basis', 'Lock',
  ], ...report.lines.map(lineRow)];
  const special = lines.filter((row, index) => index === 0 || Number(report.lines[index - 1]?.saturdayHours || 0) + Number(report.lines[index - 1]?.sundayHours || 0) + Number(report.lines[index - 1]?.phHours || 0) + Number(report.lines[index - 1]?.ovtCostKobo || 0) > 0);
  const budget: Array<Array<string | number | null>> = [[
    'Project', 'Labour Budget', 'Planned Hours', 'Actual Hours', 'Actual Cost', 'Remaining', 'Variance', 'Budget Utilization %', 'Forecast', 'Forecast Method', 'Status',
  ], ...report.projects.map((project) => [
    project.projectCode, naira(project.labourBudgetKobo), project.plannedHours, project.uniqueHours, naira(project.approvedCostKobo), naira(project.remainingBudgetKobo), naira(project.varianceKobo), project.budgetUtilization, naira(project.forecastKobo), project.forecastMethod, project.status,
  ])];
  const exceptions: Array<Array<string | number | null>> = [['Exception', 'Employee', 'Project', 'Work Date', 'Allocation'], ...report.exceptions.map((item) => [item.message, item.employeeCode, item.projectCode, item.workDate, item.allocationId])];
  const audit: Array<Array<string | number | null>> = [
    ['Field', 'Value'],
    ['Report version', LABOUR_REPORT_VERSION],
    ['Generated at', meta.generatedAt],
    ['Generated by', meta.generatedBy],
    ['Period', meta.period],
    ['Date from', meta.from],
    ['Date to', meta.to],
    ['Filters', meta.filters],
    ['Approved cost', naira(report.overview.approvedCostKobo)],
    ['Line count', report.lines.length],
    ['Source', 'Timesheet Management allocation lines. Source bookings were not changed.'],
  ];
  return { summary, projects, lines, special, budget, exceptions, audit };
};

export const buildLabourWorkbook = (report: LabourReport, meta: LabourExportMeta) => {
  const sheets = labourWorkbookRows(report, meta);
  const names = ['Executive Summary', 'Project Man-Hours', 'Project Labour Costs', 'Employee Cost Breakdown', 'OVT and Special Work', 'Budget vs Actual', 'Exceptions', 'Audit'];
  const tables = [sheets.summary, sheets.projects, sheets.projects, sheets.lines, sheets.special, sheets.budget, sheets.exceptions, sheets.audit];
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${names.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`) },
    ...tables.map((table, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: Buffer.from(sheetXml(table)) })),
  ];
  return zipFiles(files);
};

const pdfEscape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, ' ');

export const buildLabourPdf = (report: LabourReport, meta: LabourExportMeta) => {
  const lines = [
    'DLE Connect  |  Project Man-Hours and Labour Cost',
    `${meta.period}   ${meta.from} to ${meta.to}`,
    `Generated ${meta.generatedAt} by ${meta.generatedBy}`,
    `Version ${LABOUR_REPORT_VERSION}`,
    `Filters: ${meta.filters}`,
    '',
    `Total man-hours: ${report.overview.totalHours}`,
    `Regular hours: ${report.overview.regularHours}    Overtime: ${report.overview.overtimeHours}    Night: ${report.overview.nightHours}`,
    `Employees: ${report.overview.employees}    Projects: ${report.overview.projects}`,
    `Approved labour cost (NGN): ${naira(report.overview.approvedCostKobo) ?? 'Not Available'}`,
    `Provisional cost (NGN): ${naira(report.overview.provisionalCostKobo) ?? 'Not Available'}`,
    `Labour budget (NGN): ${naira(report.overview.labourBudgetKobo) ?? 'Budget Not Configured'}`,
    `Variance (NGN): ${naira(report.overview.budgetVarianceKobo) ?? 'Not Available'}`,
    `Project utilization: ${report.overview.projectUtilization ?? 'Not Available'}%`,
    `Workforce utilization: ${report.overview.workforceUtilization ?? 'Not Available'}%`,
    '',
    'Project summaries',
    ...report.projects.slice(0, 40).map((project) => `${project.projectCode}  ${project.uniqueHours} h  NGN ${naira(project.approvedCostKobo) ?? 'n/a'}  ${project.status}`),
    '',
    'Assumptions',
    ...report.overview.assumptions,
    '',
    'Provisional amounts are not approved actual cost.',
  ];
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 42) pages.push(lines.slice(index, index + 42));
  const objects: string[] = [];
  const pageIds: number[] = [];
  let next = 3;
  const fontId = 3;
  next = 4;
  for (const page of pages) {
    const contentId = next + 1;
    pageIds.push(next);
    const commands = page.map((line, lineIndex) => `BT /F1 10 Tf 40 ${800 - lineIndex * 16} Td (${pdfEscape(line)}) Tj ET`).join('\n');
    objects[next] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`;
    next += 2;
  }
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objects[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < next; id += 1) {
    offsets[id] = Buffer.byteLength(pdf);
    pdf += `${id} 0 obj\n${objects[id] || '<< >>'}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let id = 1; id < next; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
};

void hours;
