import sql from 'mssql';
import { getDleEnterpriseDbPool } from '@/lib/dle-enterprise-db';
import { withNormalizedBankCodes, ZENITH_BANK_SORT_CODE } from '@/lib/payroll-bank-constants';
import {
  readPayslipEmployeeIdentities,
  writePayslipEmployeeIdentities,
  type PayslipEmployeeIdentity,
} from '@/lib/payroll-payslip-identity-store';

const compact = (value: unknown) => String(value || '').trim();

export const correctZenithBankSortCodesInIdentities = async () => {
  const identities = await readPayslipEmployeeIdentities();
  let updated = 0;
  const next = identities.map((identity) => {
    const normalized = withNormalizedBankCodes({
      bankName: identity.bankName,
      bankCode: identity.bankCode,
      branchCode: identity.branchCode,
    });
    if (compact(normalized.branchCode) === compact(identity.branchCode) && compact(normalized.bankCode) === compact(identity.bankCode)) {
      return identity;
    }
    updated += 1;
    return {
      ...identity,
      bankCode: normalized.bankCode || identity.bankCode,
      branchCode: normalized.branchCode,
    } satisfies PayslipEmployeeIdentity;
  });
  if (updated > 0) await writePayslipEmployeeIdentities(next);
  return { scanned: identities.length, updated };
};

export const correctZenithBankSortCodesInDatabase = async () => {
  const pool = await getDleEnterpriseDbPool();
  if (!pool) return { updated: 0, databaseAvailable: false };

  const result = await pool.request()
    .input('sort_code', sql.NVarChar(20), ZENITH_BANK_SORT_CODE)
    .query(`
      UPDATE [hris].[EmployeePayrollSetup]
      SET
        branch_code = @sort_code,
        bank_code = CASE WHEN NULLIF(LTRIM(RTRIM(bank_code)), N'') IS NULL THEN @sort_code ELSE bank_code END,
        modified_at = SYSUTCDATETIME()
      WHERE LOWER(LTRIM(RTRIM(bank_name))) LIKE N'%zenith%'
        AND (
          NULLIF(LTRIM(RTRIM(branch_code)), N'') IS NULL
          OR LTRIM(RTRIM(branch_code)) <> @sort_code
          OR LTRIM(RTRIM(branch_code)) = N'1'
        );
      SELECT @@ROWCOUNT AS updated_count;
    `);

  return {
    updated: Number(result.recordset[0]?.updated_count || 0),
    databaseAvailable: true,
  };
};

export const correctZenithBankSortCodes = async () => {
  const [identities, database] = await Promise.all([
    correctZenithBankSortCodesInIdentities(),
    correctZenithBankSortCodesInDatabase(),
  ]);
  return {
    identities,
    database,
    sortCode: ZENITH_BANK_SORT_CODE,
  };
};
