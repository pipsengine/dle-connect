/**
 * Employee payment list for a telephone allowance cycle, attached to the
 * expense payment created when HR approves.
 */
import { monthLabel, roundMoney, type TelephoneCycle } from '@/lib/telephone-allowance-cycle';

const pdfText = (value: unknown) =>
  String(value ?? '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (value: unknown, max: number) => {
  const text = pdfText(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}.`;
};

const money = (value: number) => {
  const [whole, frac] = roundMoney(value).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
};

const payableEmployees = (cycle: TelephoneCycle) =>
  (cycle.employees || []).filter((line) => line.changeBadge !== 'REMOVED' && line.bimonthlyTotal > 0);

const drawLine = (x: number, y: number, text: string) =>
  `1 0 0 1 ${x} ${y} Tm (${pdfText(text)}) Tj`;

export const buildTelephoneAllowanceSchedulePdf = (cycle: TelephoneCycle, approvedBy?: string | null) => {
  const lines = payableEmployees(cycle);
  const month1 = monthLabel(cycle.year, cycle.month1);
  const month2 = monthLabel(cycle.year, cycle.month2);
  const rowsPerPage = 32;
  const pageCount = Math.max(1, Math.ceil(lines.length / rowsPerPage));
  const streams: string[] = [];

  for (let page = 0; page < pageCount; page += 1) {
    const slice = lines.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    const ops: string[] = ['BT', '/F1 11 Tf'];
    let y = 560;
    ops.push(drawLine(28, y, `Telephone Allowance Payment Schedule  ${cycle.cycleCode}`));
    y -= 16;
    ops.push('/F1 9 Tf');
    ops.push(drawLine(28, y, `${cycle.pairLabel} ${cycle.year}   ${month1} and ${month2}`));
    y -= 13;
    ops.push(drawLine(28, y, `Approved by HR: ${clip(approvedBy || 'HR Manager', 40)}    Beneficiaries: ${lines.length}    Total: NGN ${money(cycle.bimonthlyTotal)}`));
    y -= 12;
    ops.push(drawLine(28, y, `Page ${page + 1} of ${pageCount}`));
    y -= 18;
    ops.push('/F1 8 Tf');
    ops.push(drawLine(28, y, 'Code'));
    ops.push(drawLine(78, y, 'Employee'));
    ops.push(drawLine(250, y, 'Department'));
    ops.push(drawLine(390, y, month1.slice(0, 8)));
    ops.push(drawLine(460, y, month2.slice(0, 8)));
    ops.push(drawLine(530, y, 'Total'));
    ops.push(drawLine(600, y, 'Bank / Account'));
    y -= 6;
    ops.push(drawLine(28, y, '----------------------------------------------------------------'));
    y -= 14;

    for (const line of slice) {
      const account = String(line.accountNo || '').replace(/\s+/g, '');
      const bank = [line.bankName, account].filter(Boolean).join(' ');
      ops.push(drawLine(28, y, clip(line.employeeCode, 10)));
      ops.push(drawLine(78, y, clip(line.employeeName, 28)));
      ops.push(drawLine(250, y, clip(line.department, 22)));
      ops.push(drawLine(390, y, money(line.month1Amount)));
      ops.push(drawLine(460, y, money(line.month2Amount)));
      ops.push(drawLine(530, y, money(line.bimonthlyTotal)));
      ops.push(drawLine(600, y, clip(bank, 28)));
      y -= 14;
    }

    if (page === pageCount - 1) {
      y -= 6;
      ops.push(drawLine(28, y, `Schedule total NGN ${money(lines.reduce((sum, line) => sum + line.bimonthlyTotal, 0))} for ${lines.length} employees.`));
    }
    ops.push('ET');
    streams.push(ops.join('\n'));
  }

  return assemblePdf(streams);
};

const assemblePdf = (pageStreams: string[]) => {
  const pageObj = (index: number) => 4 + index * 2;
  const contentObj = (index: number) => 5 + index * 2;
  let out = '%PDF-1.4\n';
  const xref = [0];
  const addObj = (body: string) => {
    xref.push(Buffer.byteLength(out, 'latin1'));
    out += body;
  };

  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  addObj(`2 0 obj\n<< /Type /Pages /Kids [${pageStreams.map((_, index) => `${pageObj(index)} 0 R`).join(' ')}] /Count ${pageStreams.length} >>\nendobj\n`);
  addObj('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  pageStreams.forEach((stream, index) => {
    const length = Buffer.byteLength(stream, 'latin1');
    addObj(`${pageObj(index)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj(index)} 0 R >>\nendobj\n`);
    addObj(`${contentObj(index)} 0 obj\n<< /Length ${length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  });

  const startXref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${xref.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < xref.length; i += 1) {
    out += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
};
