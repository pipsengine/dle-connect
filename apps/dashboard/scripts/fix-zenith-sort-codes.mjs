import { correctZenithBankSortCodes } from '../lib/payroll-bank-corrections.ts';

const result = await correctZenithBankSortCodes();
console.log(JSON.stringify(result, null, 2));
