/**
 * Run: npx tsx --tsconfig apps/dashboard/tsconfig.json apps/dashboard/lib/dayrate-schedule-template-export.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import {
  arrearsIncludingUnexplainedGross,
  buildDleDataRow,
  DLE_TOTAL_EARNINGS_FORMULA,
  insertDlePublicHolidaySheetColumns,
  insertDlePublicHolidayTableColumns,
  paymentScheduleHours,
  rebuildDleHeaderRow,
} from './dayrate-schedule-template-export.ts';

assert.equal(paymentScheduleHours(false, undefined, 0, 6), 6, 'booked weekday overtime fills a blank attendance row');
assert.equal(paymentScheduleHours(false, undefined, 4, 6), 6, 'the larger booked total is the complete overtime');
assert.equal(paymentScheduleHours(false, undefined, 10, 4), 10, 'attendance hours already on the sheet stay');
assert.equal(paymentScheduleHours(true, 0, 0, 48), 0, 'an HR schedule row keeps its own hours');
assert.equal(paymentScheduleHours(true, 3, 0, 48), 3);

const header = rebuildDleHeaderRow(
  '<row r="1" spans="1:28"><c r="L1" t="s"><v>825</v></c><c r="M1" t="s"><v>828</v></c><c r="Q1" t="s"><v>832</v></c><c r="R1" t="s"><v>834</v></c><c r="AB1" t="s"><v>3</v></c></row>',
);
assert.match(header, /r="M1"[^>]*>[\s\S]*Public Holiday/);
assert.match(header, /r="N1"[^>]*>[\s\S]*<v>828<\/v>/);
assert.match(header, /r="R1"[^>]*>[\s\S]*<v>832<\/v>/);
assert.match(header, /r="S1"[^>]*>[\s\S]*PH Amt/);
assert.match(header, /r="T1"[^>]*>[\s\S]*<v>834<\/v>/);
assert.match(header, /r="AD1"[^>]*>[\s\S]*<v>3<\/v>/);

const table = insertDlePublicHolidayTableColumns(`
<table><tableColumns count="28">
<tableColumn id="12" name="Total Sunday" totalsRowFunction="sum"/>
<tableColumn id="14" name="Night Worked" totalsRowFunction="sum"/>
<tableColumn id="18" name="Sun Ovt Amt" totalsRowFunction="sum"><calculatedColumnFormula>Table4[[#This Row],[Daily Rate]]/8*(2*Table4[[#This Row],[Total Sunday]])</calculatedColumnFormula></tableColumn>
<tableColumn id="20" name="Night Amt" totalsRowFunction="sum"><calculatedColumnFormula>2500*Table4[[#This Row],[Night Worked]]</calculatedColumnFormula></tableColumn>
<tableColumn id="25" name="Total Earnings"><calculatedColumnFormula>SUM(Table4[[#This Row],[Wkd Earning]:[Arrears]])</calculatedColumnFormula></tableColumn>
</tableColumns></table>`);
const names = [...table.matchAll(/name="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(names, ['Total Sunday', 'Public Holiday', 'Night Worked', 'Sun Ovt Amt', 'PH Amt', 'Night Amt', 'Total Earnings']);
assert.match(table, /tableColumns count="30"/);
assert.match(table, /2\*Table4\[\[#This Row\],\[Public Holiday\]\]/);
assert.match(table, /\[PH Amt\]/);
assert.equal(table.includes('[Wkd Earning]:[Arrears]'), false);
assert.ok(DLE_TOTAL_EARNINGS_FORMULA.includes('[PH Amt]'));

const widths = Array.from({ length: 28 }, (_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index + 1}" customWidth="1"/>`).join('');
const widened = insertDlePublicHolidaySheetColumns(`<cols>${widths}</cols>`);
assert.equal([...widened.matchAll(/<col\b/g)].length, 30);

const row = buildDleDataRow(5, {
  code: 'C0695',
  firstName: 'JULIUS',
  lastName: 'AWOYEMI',
  jobTitle: 'RIGGER',
  location: 'AGEGE',
  dailyRate: 10250,
  age: '',
  gender: '',
  weekDays: 20,
  weekdayOvtHrs: 48,
  satHrs: 43,
  sunHrs: 13,
  phHrs: 8,
  nightDays: 14,
  wkdEarning: 205000,
  wkdOvtAmt: 92250,
  satAmt: 82640.63,
  sunAmt: 33312.5,
  phAmt: 20500,
  nightAmt: 21000,
  meal: 10000,
  transport: 0,
  site: 0,
  tcmMeal: 0,
  tcmTransport: 0,
  arrears: 0,
  totalEarnings: 464703.13,
  wht: 23235.16,
  netPay: 441467.97,
  bankName: '',
  accountNo: '',
  sortCode: '',
  scheduleDriven: true,
});
const cellValue = (ref: string) => Number((row.match(new RegExp(`r="${ref}"[^>]*>[\\s\\S]*?<v>([^<]+)</v>`)) || [])[1]);
assert.equal(cellValue('M5'), 8, 'public holiday hours are on the DLE sheet');
assert.equal(cellValue('S5'), 20500, 'public holiday pay is on the DLE sheet');
const printed = ['O5', 'P5', 'Q5', 'R5', 'S5', 'T5', 'U5'].reduce((sum, ref) => sum + cellValue(ref), 0);
assert.equal(Math.round(printed * 100) / 100, 464703.13);
assert.equal(cellValue('AA5'), 464703.13);
assert.match(row, /<f>[^<]*\[PH Amt\][^<]*<\/f>/);
assert.equal(cellValue('AC5'), 464703.13);
assert.equal(cellValue('AD5'), 441467.97);

const oyewole = arrearsIncludingUnexplainedGross(false, 0, 42150, 46000);
assert.equal(oyewole.arrears, 3850, 'gross above the hour columns is shown in arrears');
assert.equal(oyewole.total, 46000);
const scheduled = arrearsIncludingUnexplainedGross(true, 0, 42150, 46000);
assert.equal(scheduled.arrears, 0, 'an HR schedule row does not pick up a second gross');
assert.equal(scheduled.total, 42150);

const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/hris/templates/dayrate-payment-schedule.xlsx');
if (existsSync(templatePath)) {
  const buf = readFileSync(templatePath);
  const u16 = (offset: number) => buf.readUInt16LE(offset);
  const u32 = (offset: number) => buf.readUInt32LE(offset);
  let eocd = -1;
  for (let i = Math.max(0, buf.length - 22 - 65535); i <= buf.length - 22; i += 1) {
    if (u32(i) === 0x06054b50) eocd = i;
  }
  let off = u32(eocd + 16);
  const count = u16(eocd + 10);
  let tableXml = '';
  for (let i = 0; i < count; i += 1) {
    if (u32(off) !== 0x02014b50) break;
    const method = u16(off + 10);
    const compressedSize = u32(off + 20);
    const size = u32(off + 24);
    const nameLen = u16(off + 28);
    const extraLen = u16(off + 30);
    const commentLen = u16(off + 32);
    const local = u32(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    const localNameLen = u16(local + 26);
    const localExtraLen = u16(local + 28);
    const start = local + 30 + localNameLen + localExtraLen;
    if (name === 'xl/tables/table2.xml') {
      const data = buf.subarray(start, start + compressedSize);
      tableXml = (method === 0 ? data.subarray(0, size) : inflateRawSync(data)).toString('utf8');
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  const live = insertDlePublicHolidayTableColumns(tableXml);
  const liveNames = [...live.matchAll(/<tableColumn\b[^>]*\bname="([^"]+)"/g)].map((match) => match[1]);
  const sunday = liveNames.indexOf('Total Sunday');
  const sunAmount = liveNames.indexOf('Sun Ovt Amt');
  assert.equal(liveNames[sunday + 1], 'Public Holiday');
  assert.equal(liveNames[sunAmount + 1], 'PH Amt');
  assert.ok(liveNames.indexOf('PH Amt') < liveNames.indexOf('Arrears'));
  assert.equal(liveNames.length, 30);
  const totalFormula = (live.match(/name="Total Earnings"[\s\S]*?<calculatedColumnFormula>([\s\S]*?)<\/calculatedColumnFormula>/) || [])[1] || '';
  assert.match(totalFormula, /\[PH Amt\]/);
  assert.equal(totalFormula.includes('[Wkd Earning]:[Arrears]'), false);
}

console.log('dayrate-schedule-template-export.test.ts ok');
