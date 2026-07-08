import sql from 'mssql';
import { loadWorkspaceEnv } from '@/lib/dle-enterprise-db';
import { activePayrollPeriod } from '@/lib/payroll-periods';

loadWorkspaceEnv();

export type SagePayrollEmployee = {
  employeeId: number;
  employeeCode: string;
  directoryEmployeeCode: string;
  employeeCodeDisplay: string | null;
  entityCode: string;
  displayName: string;
  title: string | null;
  firstNames: string | null;
  middleName: string | null;
  knownAsName: string | null;
  lastName: string | null;
  gender: string | null;
  birthDate: Date | string | null;
  maritalStatus: string | null;
  idNumber: string | null;
  passportNo: string | null;
  emailAddress: string | null;
  homeTelNo: string | null;
  cellNo: string | null;
  workTelNo: string | null;
  physicalAddress: string | null;
  physicalCityTown: string | null;
  physicalProvince: string | null;
  physicalCountryCode: string | null;
  physicalPostalCode: string | null;
  postalAddress: string | null;
  postalCityTown: string | null;
  postalPostalCode: string | null;
  jobTitle: string | null;
  jobTitleCode: string | null;
  jobGrade: string | null;
  jobGradeCode: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  siteCode: string | null;
  siteName: string | null;
  hierarchyLocationCode: string | null;
  hierarchyLocationName: string | null;
  hierarchyDepartmentCode: string | null;
  hierarchyDepartmentName: string | null;
  hierarchyEmployeeTypeCode: string | null;
  hierarchyEmployeeTypeName: string | null;
  managerEmployeeId: number | null;
  managerEmployeeCode: string | null;
  managerName: string | null;
  nationality: string | null;
  dateEngaged: Date | string | null;
  dateJoinedGroup: Date | string | null;
  probationPeriodEndDate: Date | string | null;
  contractStartDate: Date | string | null;
  contractExpiryDate: Date | string | null;
  companyCode: string;
  companyName: string;
  companyCurrency: string | null;
  paymentRunShort: string | null;
  paymentRunLong: string | null;
  paymentTypeCode: string | null;
  paymentType: string | null;
  remunerationDefinition: string | null;
  taxNo: string | null;
  pensionProvider: string | null;
  pensionPin: string | null;
  bankName: string | null;
  bankCode: string | null;
  branchName: string | null;
  branchCode: string | null;
  accountNo: string | null;
  accountName: string | null;
  accountTypeId: number | null;
  annualSalary: number | null;
  periodSalary: number | null;
  ratePerHour: number | null;
  ratePerDay: number | null;
  hoursPerDay: number | null;
  hoursPerPeriod: number | null;
  latestPaye: number | null;
  latestPensionEmployee: number | null;
  latestNhf: number | null;
  latestOtherDeductions: number | null;
  latestTotalDeductions: number | null;
  latestNetPay: number | null;
  latestPensionEmployer: number | null;
  latestNsitf: number | null;
  latestItf: number | null;
  latestTotalEmployerContributions: number | null;
  latestEarningLinesJson: string | null;
  latestDeductionLinesJson: string | null;
  latestContributionLinesJson: string | null;
  workMonday: boolean | null;
  workTuesday: boolean | null;
  workWednesday: boolean | null;
  workThursday: boolean | null;
  workFriday: boolean | null;
  workSaturday: boolean | null;
  workSunday: boolean | null;
  statusCode: string;
  statusName: string;
  terminationDate: string | null;
  sageEmployeeJson: string | null;
  sageEmployeeDetailJson: string | null;
  sageEmployeeContractJson: string | null;
  sageEntityJson: string | null;
  sageCompanyJson: string | null;
  sageEmployeeStatusJson: string | null;
};

export type SagePayrollBankDetail = {
  employeeId: number;
  bankName?: string | null;
  bankCode?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  accountNo?: string | null;
  accountName?: string | null;
};

export const normalizePayrollMatchKey = (value: string | number | null | undefined) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';
  const permanentStaffMatch = compact.match(/^P0*(\d+)$/);
  if (permanentStaffMatch) {
    const digits = permanentStaffMatch[1].replace(/^0+/, '');
    return digits || permanentStaffMatch[1];
  }
  const numericOnly = compact.replace(/^0+/, '');
  return numericOnly || compact;
};

const config = () => {
  loadWorkspaceEnv();
  return {
    server: process.env.SAGE_PAYROLL_DB_HOST || '192.168.5.8',
    port: Number(process.env.SAGE_PAYROLL_DB_PORT || 1433),
    database: process.env.SAGE_PAYROLL_DB_NAME || 'DLE_JUNE',
    user: process.env.SAGE_PAYROLL_DB_USER || 'sa',
    password: process.env.SAGE_PAYROLL_DB_PASSWORD || '',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      ...(process.env.SAGE_PAYROLL_DB_INSTANCE ? { instanceName: process.env.SAGE_PAYROLL_DB_INSTANCE } : {}),
    },
    connectionTimeout: Number(process.env.SAGE_PAYROLL_DB_CONNECT_TIMEOUT || 15000),
    requestTimeout: Number(process.env.SAGE_PAYROLL_DB_REQUEST_TIMEOUT || 30000),
  };
};

const payrollPeriod = () => {
  const value = String(process.env.HRIS_ACTIVE_PAYROLL_PERIOD || activePayrollPeriod()).trim();
  return /^\d{4}-\d{2}$/.test(value) ? value : activePayrollPeriod();
};

const payrollPeriodSql = () => {
  const [year, month] = payrollPeriod().split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start, end };
};

/** Sage statuses treated as payroll-active (A=Active, R=Re-Instate New). */
const payrollEligibleSageStatusSql = (alias = 'es') => `ISNULL(${alias}.Code, 'A') IN ('A', 'R')`;

const bracket = (value: string) => `[${value.replace(/]/g, ']]')}]`;
const pickColumn = (columns: string[], patterns: RegExp[]) => columns.find((column) => patterns.some((pattern) => pattern.test(column)));

const employeeBankCandidateQuery = `
SELECT
  s.name AS schemaName,
  t.name AS tableName,
  c.name AS columnName
FROM sys.columns c
JOIN sys.tables t ON t.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE EXISTS (
  SELECT 1 FROM sys.columns ec
  WHERE ec.object_id = t.object_id AND ec.name = 'EmployeeID'
)
AND (
  c.name LIKE '%Account%'
  OR c.name LIKE '%Bank%'
  OR c.name LIKE '%Branch%'
  OR c.name LIKE '%Sort%'
)
ORDER BY
  CASE
    WHEN s.name = 'Employee' AND t.name LIKE '%Bank%' THEN 0
    WHEN s.name = 'Payroll' AND t.name LIKE '%Bank%' THEN 1
    WHEN s.name = 'Employee' THEN 2
    ELSE 3
  END,
  s.name,
  t.name,
  c.column_id;
`;

const activeEmployeeQuery = () => {
  const { start, end } = payrollPeriodSql();
  return `
DECLARE @PayrollPeriodStart date = '${start}';
DECLARE @PayrollPeriodEnd date = '${end}';

WITH latestContract AS (
  SELECT
    ec.EmployeeID,
    ec.ContractStartDate,
    ec.ContractExpiryDate,
    ROW_NUMBER() OVER (
      PARTITION BY ec.EmployeeID
      ORDER BY
        CASE WHEN ec.Active = 1 THEN 0 ELSE 1 END,
        ISNULL(ec.ContractStartDate, ec.TransactionDate) DESC,
        ec.EmployeeContractID DESC
    ) AS rn
  FROM Employee.EmployeeContract ec
),
activeEmployeeCodes AS (
  SELECT DISTINCT UPPER(REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', '')) AS normalizedEmployeeCode
  FROM Employee.Employee e
  JOIN Entity.GenEntity ge
    ON ge.GenEntityID = e.GenEntityID
  JOIN Company.Company c
    ON c.CompanyID = e.CompanyID
  LEFT JOIN Employee.EmployeeStatus es
    ON es.EmployeeStatusID = e.EmployeeStatusID
  WHERE
    e.TerminationDate IS NULL
    AND ${payrollEligibleSageStatusSql('es')}
    AND ge.Status = 'A'
    AND c.Status = 'A'
),
activeEmployees AS (
  SELECT e.EmployeeID, e.EmployeeCode
  FROM Employee.Employee e
  JOIN Entity.GenEntity ge
    ON ge.GenEntityID = e.GenEntityID
  JOIN Company.Company c
    ON c.CompanyID = e.CompanyID
  LEFT JOIN Employee.EmployeeStatus es
    ON es.EmployeeStatusID = e.EmployeeStatusID
  WHERE
    e.TerminationDate IS NULL
    AND ${payrollEligibleSageStatusSql('es')}
    AND ge.Status = 'A'
    AND c.Status = 'A'
),
activeContractEmployees AS (
  SELECT e.EmployeeID, e.EmployeeCode
  FROM Employee.Employee e
  JOIN Entity.GenEntity ge
    ON ge.GenEntityID = e.GenEntityID
  JOIN Company.Company c
    ON c.CompanyID = e.CompanyID
  LEFT JOIN Employee.EmployeeStatus es
    ON es.EmployeeStatusID = e.EmployeeStatusID
  WHERE
    UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%'
    AND e.TerminationDate IS NULL
    AND ${payrollEligibleSageStatusSql('es')}
    AND ge.Status = 'A'
    AND c.Status = 'A'
),
activeStipendEmployees AS (
  SELECT e.EmployeeID, e.EmployeeCode
  FROM Employee.Employee e
  JOIN Entity.GenEntity ge
    ON ge.GenEntityID = e.GenEntityID
  JOIN Company.Company c
    ON c.CompanyID = e.CompanyID
  LEFT JOIN Employee.EmployeeStatus es
    ON es.EmployeeStatusID = e.EmployeeStatusID
  WHERE
    (
      UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'IT%'
      OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'I%'
      OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'N%'
      OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'NYSC%'
    )
    AND e.TerminationDate IS NULL
    AND ${payrollEligibleSageStatusSql('es')}
    AND ge.Status = 'A'
    AND c.Status = 'A'
),
stipendGrossPeriods AS (
  SELECT
    se.EmployeeID,
    epp.EmployeePayPeriodID,
    SUM(ISNULL(pel.Total, 0)) AS grossPay,
    ROW_NUMBER() OVER (PARTITION BY se.EmployeeID ORDER BY epp.EmployeePayPeriodID DESC) AS rn
  FROM activeStipendEmployees se
  JOIN Employee.EmployeePayPeriod epp
    ON epp.EmployeeID = se.EmployeeID
  JOIN Payroll.Payslip p
    ON p.EmployeePayPeriodID = epp.EmployeePayPeriodID
  JOIN Payroll.PayslipEarnLine pel
    ON pel.PayslipID = p.PayslipID
  WHERE ISNULL(pel.Total, 0) <> 0
    AND epp.LastCalcDate >= @PayrollPeriodStart
    AND epp.LastCalcDate < @PayrollPeriodEnd
  GROUP BY se.EmployeeID, epp.EmployeePayPeriodID
),
stipendGross AS (
  SELECT EmployeeID, grossPay
  FROM stipendGrossPeriods
  WHERE rn = 1
),
latestPayslipPeriods AS (
  SELECT
    ae.EmployeeID,
    epp.EmployeePayPeriodID,
    p.PayslipID,
    ROW_NUMBER() OVER (PARTITION BY ae.EmployeeID ORDER BY epp.EmployeePayPeriodID DESC, p.PayslipID DESC) AS rn
  FROM activeEmployees ae
  JOIN Employee.EmployeePayPeriod epp
    ON epp.EmployeeID = ae.EmployeeID
  JOIN Payroll.Payslip p
    ON p.EmployeePayPeriodID = epp.EmployeePayPeriodID
  WHERE epp.LastCalcDate >= @PayrollPeriodStart
    AND epp.LastCalcDate < @PayrollPeriodEnd
),
latestPayslipDeductions AS (
  SELECT
    lp.EmployeeID,
    SUM(CASE WHEN dd.DefCode = 'PAYE' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS paye,
    SUM(CASE WHEN (UPPER(dd.DefCode) IN ('PENSION', 'PENSION_EE', 'PENSION_EE2', 'PENSION_BONGA', 'PENARR', 'VOLPENS') OR UPPER(dd.ShortDescription) LIKE '%PENSION%') AND UPPER(dd.DefCode) <> 'SUSPENSION' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS pensionEmployee,
    SUM(CASE WHEN dd.DefCode = 'NHF' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS nhf,
    SUM(CASE WHEN dd.DefCode NOT IN ('PAYE', 'PENSION_EE', 'NHF') AND NOT ((UPPER(dd.DefCode) IN ('PENSION', 'PENSION_EE2', 'PENSION_BONGA', 'PENARR', 'VOLPENS') OR UPPER(dd.ShortDescription) LIKE '%PENSION%') AND UPPER(dd.DefCode) <> 'SUSPENSION') THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS otherDeductions,
    SUM(ISNULL(pdl.Total, 0)) AS totalDeductions
  FROM latestPayslipPeriods lp
  JOIN Payroll.PayslipDeductionLine pdl
    ON pdl.PayslipID = lp.PayslipID
  JOIN Payroll.DeductionDef dd
    ON dd.DeductionDefID = pdl.DefID
  WHERE lp.rn = 1
  GROUP BY lp.EmployeeID
),
latestPayslipContributions AS (
  SELECT
    lp.EmployeeID,
    SUM(CASE WHEN ccd.DefCode = 'PENSION_ER' THEN ISNULL(pccl.Total, 0) ELSE 0 END) AS pensionEmployer,
    SUM(CASE WHEN ccd.DefCode = 'NSITF' THEN ISNULL(pccl.Total, 0) ELSE 0 END) AS nsitf,
    SUM(CASE WHEN ccd.DefCode = 'ITF_LEVY' THEN ISNULL(pccl.Total, 0) ELSE 0 END) AS itf,
    SUM(ISNULL(pccl.Total, 0)) AS totalEmployerContributions
  FROM latestPayslipPeriods lp
  JOIN Payroll.PayslipCompanyContributionLine pccl
    ON pccl.PayslipID = lp.PayslipID
  JOIN Payroll.CompanyContributionDef ccd
    ON ccd.CompanyContributionDefID = pccl.DefID
  WHERE lp.rn = 1
  GROUP BY lp.EmployeeID
),
latestPayslipNetPay AS (
  SELECT
    lp.EmployeeID,
    SUM(ISNULL(pnp.PaymentAmount, 0)) AS netPay
  FROM latestPayslipPeriods lp
  JOIN Payroll.PayslipNetPay pnp
    ON pnp.PayslipID = lp.PayslipID
  WHERE lp.rn = 1
  GROUP BY lp.EmployeeID
),
contractWeekdayRates AS (
  SELECT
    ce.EmployeeID,
    epp.EmployeePayPeriodID,
    edef.DefCode,
    MAX(CASE WHEN peu.EmployeeRate > 0 THEN peu.EmployeeRate ELSE NULL END) AS EmployeeRate
  FROM activeContractEmployees ce
  JOIN Employee.EmployeePayPeriod epp
    ON epp.EmployeeID = ce.EmployeeID
  JOIN Payroll.Payslip p
    ON p.EmployeePayPeriodID = epp.EmployeePayPeriodID
  JOIN Payroll.PayslipEarnLine pel
    ON pel.PayslipID = p.PayslipID
  JOIN Payroll.EarningDef edef
    ON edef.EarningDefID = pel.DefID
  JOIN Payroll.PayslipEarnUnit peu
    ON peu.PayslipEarnLineID = pel.PayslipEarnLineID
  WHERE
    edef.DefCode IN ('JCWEEKDAY', 'JCWEEKDAY_NT')
    AND ISNULL(peu.EmployeeRate, 0) > 0
  GROUP BY ce.EmployeeID, epp.EmployeePayPeriodID, edef.DefCode
),
contractRatePeriods AS (
  SELECT
    EmployeeID,
    EmployeePayPeriodID,
    ROW_NUMBER() OVER (PARTITION BY EmployeeID ORDER BY EmployeePayPeriodID DESC) AS rn
  FROM (
    SELECT DISTINCT EmployeeID, EmployeePayPeriodID
    FROM contractWeekdayRates
  ) periods
),
contractDailyRates AS (
  SELECT
    wr.EmployeeID,
    SUM(wr.EmployeeRate) AS ratePerDay
  FROM contractWeekdayRates wr
  JOIN contractRatePeriods rp
    ON rp.EmployeeID = wr.EmployeeID
    AND rp.EmployeePayPeriodID = wr.EmployeePayPeriodID
    AND rp.rn = 1
  GROUP BY wr.EmployeeID
)
SELECT
  e.EmployeeID AS employeeId,
  e.EmployeeCode AS employeeCode,
  CASE
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%' OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'L%'
      THEN REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', '')
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'P%'
      THEN REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', '')
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'IT%' OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'I%' OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'N%' OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'NYSC%'
      THEN REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', '')
    ELSE CONCAT('P', REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', ''))
  END AS directoryEmployeeCode,
  ed.EmployeeCodeDisplay AS employeeCodeDisplay,
  ge.EntityCode AS entityCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.DisplayName)), ''), ge.DisplayName) AS displayName,
  ed.Title AS title,
  ed.FirstNames AS firstNames,
  ed.SecondName AS middleName,
  ed.KnownAsName AS knownAsName,
  ed.LastName AS lastName,
  ed.Gender AS gender,
  ed.BirthDate AS birthDate,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.MaritalStatusDisplay)), ''), NULLIF(LTRIM(RTRIM(ed.MaritalStatusShortDescription)), '')) AS maritalStatus,
  ed.IDNumber AS idNumber,
  ed.PassportNo AS passportNo,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.email)), ''), NULLIF(LTRIM(RTRIM(ed.EmailAddress)), '')) AS emailAddress,
  ed.HomeTelNo AS homeTelNo,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.phone_number)), ''), NULLIF(LTRIM(RTRIM(ed.CellNo)), ''), NULLIF(LTRIM(RTRIM(ed.WorkTelNo)), '')) AS cellNo,
  ed.WorkTelNo AS workTelNo,
  CONCAT_WS(', ',
    NULLIF(LTRIM(RTRIM(ed.PhysicalUnitPostalNumber)), ''),
    NULLIF(LTRIM(RTRIM(ed.PhysicalComplex)), ''),
    NULLIF(LTRIM(RTRIM(ed.PhysicalStreetNumber)), ''),
    NULLIF(LTRIM(RTRIM(ed.PhysicalStreetFarmName)), ''),
    NULLIF(LTRIM(RTRIM(ed.PhysicalSuburbDistrict)), ''),
    NULLIF(LTRIM(RTRIM(ed.PhysicalCityTown)), ''),
    NULLIF(LTRIM(RTRIM(ed.PhysicalProvince)), ''),
    NULLIF(LTRIM(RTRIM(ed.PhysicalCountryCode)), '')
  ) AS physicalAddress,
  ed.PhysicalCityTown AS physicalCityTown,
  ed.PhysicalProvince AS physicalProvince,
  ed.PhysicalCountryCode AS physicalCountryCode,
  ed.PhysicalPostalCode AS physicalPostalCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.PostalConcat)), ''), CONCAT_WS(', ',
    NULLIF(LTRIM(RTRIM(ed.PostalUnitPostalNumber)), ''),
    NULLIF(LTRIM(RTRIM(ed.PostalComplex)), ''),
    NULLIF(LTRIM(RTRIM(ed.PostalStreetNumber)), ''),
    NULLIF(LTRIM(RTRIM(ed.PostalStreetFarmName)), ''),
    NULLIF(LTRIM(RTRIM(ed.PostalSuburbDistrict)), ''),
    NULLIF(LTRIM(RTRIM(ed.PostalCityTown)), ''),
    NULLIF(LTRIM(RTRIM(ed.PostalProvince)), '')
  )) AS postalAddress,
  ed.PostalCityTown AS postalCityTown,
  ed.PostalPostalCode AS postalPostalCode,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.job_title)), ''), NULLIF(LTRIM(RTRIM(ed.JobTitle)), '')) AS jobTitle,
  ed.JobTitleCode AS jobTitleCode,
  ed.JobGrade AS jobGrade,
  ed.JobGradeCode AS jobGradeCode,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.department_code)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyCodeB)), '')) AS departmentCode,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.department_name)), ''), NULLIF(LTRIM(RTRIM(ed.HANameB)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyNameB)), '')) AS departmentName,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.site_code)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyCode)), '')) AS siteCode,
  COALESCE(NULLIF(LTRIM(RTRIM(sd.site_name)), ''), NULLIF(LTRIM(RTRIM(ed.HAName)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyName)), '')) AS siteName,
  ed.HierarchyCode AS hierarchyLocationCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.HAName)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyName)), '')) AS hierarchyLocationName,
  ed.HierarchyCodeB AS hierarchyDepartmentCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.HANameB)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyNameB)), '')) AS hierarchyDepartmentName,
  ed.HierarchyCodeC AS hierarchyEmployeeTypeCode,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.HANameC)), ''), NULLIF(LTRIM(RTRIM(ed.HierarchyNameC)), '')) AS hierarchyEmployeeTypeName,
  COALESCE(e.ReportToEmployeeID, reverseManager.ReportToEmployeeID) AS managerEmployeeId,
  COALESCE(mgr.EmployeeCode, reverseMgr.EmployeeCode) AS managerEmployeeCode,
  COALESCE(
    NULLIF(LTRIM(RTRIM(ed.ReportsToEmployeeDisplay)), ''),
    mgrge.DisplayName,
    reverseMgrGe.DisplayName
  ) AS managerName,
  ed.Nationality AS nationality,
  ed.DateEngaged AS dateEngaged,
  ed.DateJoinedGroup AS dateJoinedGroup,
  ed.ProbationPeriodEndDate AS probationPeriodEndDate,
  lc.ContractStartDate AS contractStartDate,
  lc.ContractExpiryDate AS contractExpiryDate,
  c.CompanyCode AS companyCode,
  cge.DisplayName AS companyName,
  c.CompanyCCY AS companyCurrency,
  ed.PaymentRunDefShort AS paymentRunShort,
  ed.PaymentRunDefLong AS paymentRunLong,
  ed.PaymentTypeCode AS paymentTypeCode,
  ed.PaymentType AS paymentType,
  ed.RemunerationDefinitionHeaderDisplay AS remunerationDefinition,
  COALESCE(NULLIF(LTRIM(RTRIM(ed.TaxNo)), ''), NULLIF(LTRIM(RTRIM(ge.TaxNo)), '')) AS taxNo,
  CASE
    WHEN ISNULL(lpd.pensionEmployee, 0) <> 0 OR ISNULL(lpc.pensionEmployer, 0) <> 0 THEN 'Pension Fund'
    ELSE NULL
  END AS pensionProvider,
  NULL AS pensionPin,
  ed.BankName AS bankName,
  ed.BankCode AS bankCode,
  ed.BranchName AS branchName,
  ed.BranchCode AS branchCode,
  ed.AccountNo AS accountNo,
  ed.AccountName AS accountName,
  ed.AccountTypeID AS accountTypeId,
  COALESCE(NULLIF(ed.AnnualSalary, 0), CASE WHEN sg.grossPay > 0 THEN sg.grossPay * 12 ELSE NULL END) AS annualSalary,
  COALESCE(NULLIF(ed.PeriodSalary, 0), CASE WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%' THEN cdr.ratePerDay ELSE NULL END, sg.grossPay) AS periodSalary,
  COALESCE(NULLIF(ed.RatePerHour, 0), CASE WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%' AND cdr.ratePerDay > 0 THEN cdr.ratePerDay / 8.0 ELSE NULL END) AS ratePerHour,
  COALESCE(NULLIF(ed.RatePerDay, 0), CASE WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%' THEN cdr.ratePerDay ELSE NULL END) AS ratePerDay,
  ed.HoursPerDay AS hoursPerDay,
  ed.HoursPerPeriod AS hoursPerPeriod,
  lpd.paye AS latestPaye,
  lpd.pensionEmployee AS latestPensionEmployee,
  lpd.nhf AS latestNhf,
  lpd.otherDeductions AS latestOtherDeductions,
  lpd.totalDeductions AS latestTotalDeductions,
  lpnp.netPay AS latestNetPay,
  lpc.pensionEmployer AS latestPensionEmployer,
  lpc.nsitf AS latestNsitf,
  lpc.itf AS latestItf,
  lpc.totalEmployerContributions AS latestTotalEmployerContributions,
  NULL AS latestEarningLinesJson,
  NULL AS latestDeductionLinesJson,
  NULL AS latestContributionLinesJson,
  ed.WorkMonday AS workMonday,
  ed.WorkTuesday AS workTuesday,
  ed.WorkWednesday AS workWednesday,
  ed.WorkThursday AS workThursday,
  ed.WorkFriday AS workFriday,
  ed.WorkSaturday AS workSaturday,
  ed.WorkSunday AS workSunday,
  es.Code AS statusCode,
  es.ShortDescription AS statusName,
  e.TerminationDate AS terminationDate,
  (SELECT e.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS sageEmployeeJson,
  (SELECT ed.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS sageEmployeeDetailJson,
  (SELECT lc.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS sageEmployeeContractJson,
  (SELECT ge.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS sageEntityJson,
  (SELECT c.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS sageCompanyJson,
  (SELECT es.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES) AS sageEmployeeStatusJson
FROM Employee.Employee e
JOIN Entity.GenEntity ge
  ON ge.GenEntityID = e.GenEntityID
JOIN Company.Company c
  ON c.CompanyID = e.CompanyID
JOIN Entity.GenEntity cge
  ON cge.GenEntityID = c.GenEntityID
LEFT JOIN Employee.EmployeeStatus es
  ON es.EmployeeStatusID = e.EmployeeStatusID
LEFT JOIN Employee.EmployeeDetail ed
  ON ed.EmployeeID = e.EmployeeID
LEFT JOIN dbo.vw_ServiceDesk_Employees sd
  ON sd.external_employee_id = CAST(e.EmployeeID AS varchar(50))
LEFT JOIN Employee.Employee mgr
  ON mgr.EmployeeID = e.ReportToEmployeeID
LEFT JOIN Entity.GenEntity mgrge
  ON mgrge.GenEntityID = mgr.GenEntityID
LEFT JOIN Employee.EmployeesReportsToMeView reverseManager
  ON reverseManager.EmployeeID = e.EmployeeID
LEFT JOIN Employee.Employee reverseMgr
  ON reverseMgr.EmployeeID = reverseManager.ReportToEmployeeID
LEFT JOIN Entity.GenEntity reverseMgrGe
  ON reverseMgrGe.GenEntityID = reverseMgr.GenEntityID
LEFT JOIN latestContract lc
  ON lc.EmployeeID = e.EmployeeID
  AND lc.rn = 1
LEFT JOIN contractDailyRates cdr
  ON cdr.EmployeeID = e.EmployeeID
LEFT JOIN stipendGross sg
  ON sg.EmployeeID = e.EmployeeID
LEFT JOIN latestPayslipDeductions lpd
  ON lpd.EmployeeID = e.EmployeeID
LEFT JOIN latestPayslipContributions lpc
  ON lpc.EmployeeID = e.EmployeeID
LEFT JOIN latestPayslipNetPay lpnp
  ON lpnp.EmployeeID = e.EmployeeID
WHERE
  ge.Status = 'A'
  AND c.Status = 'A'
  AND (
    (e.TerminationDate IS NULL AND ${payrollEligibleSageStatusSql('es')})
    OR UPPER(REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', '')) IN (SELECT normalizedEmployeeCode FROM activeEmployeeCodes)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM Employee.Employee e2
    JOIN Entity.GenEntity ge2
      ON ge2.GenEntityID = e2.GenEntityID
    JOIN Company.Company c2
      ON c2.CompanyID = e2.CompanyID
    LEFT JOIN Employee.EmployeeStatus es2
      ON es2.EmployeeStatusID = e2.EmployeeStatusID
    WHERE
      e.EmployeeCode LIKE '%[_]%'
      AND e2.EmployeeCode NOT LIKE '%[_]%'
      AND UPPER(REPLACE(LTRIM(RTRIM(e2.EmployeeCode)), '_', '')) = UPPER(REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', ''))
      AND e2.TerminationDate IS NULL
      AND ${payrollEligibleSageStatusSql('es2')}
      AND ge2.Status = 'A'
      AND c2.Status = 'A'
  )
ORDER BY e.EmployeeCode;
`;
};

export async function readActiveSagePayrollEmployees() {
  const pool = new sql.ConnectionPool(config());
  await pool.connect();
  try {
    const result = await pool.request().query(activeEmployeeQuery());
    return result.recordset as SagePayrollEmployee[];
  } finally {
    await pool.close();
  }
}

type SagePayslipLine = {
  employeeId: number;
  code: string;
  name: string;
  amount: number;
  taxableAmount?: number | null;
  ytdTotal?: number | null;
};

export type SagePayrollPeriodTotal = {
  employeeId: number;
  employeeCode: string;
  directoryEmployeeCode: string;
  employeeName: string;
  employeePayPeriodId: number;
  lastCalcDate: Date | string | null;
  payslipId: number;
  grossPay: number | null;
  taxablePay: number | null;
  paye: number | null;
  pensionEmployee: number | null;
  nhf: number | null;
  otherDeductions: number | null;
  totalDeductions: number | null;
  netPay: number | null;
  pensionEmployer: number | null;
  employerContributions: number | null;
};

const latestPayslipLinesQuery = () => {
  const { start, end } = payrollPeriodSql();
  return `
DECLARE @PayrollPeriodStart date = '${start}';
DECLARE @PayrollPeriodEnd date = '${end}';

IF OBJECT_ID('tempdb..#LatestPayslipPeriods') IS NOT NULL DROP TABLE #LatestPayslipPeriods;

WITH activeEmployees AS (
  SELECT e.EmployeeID
  FROM Employee.Employee e
  JOIN Entity.GenEntity ge
    ON ge.GenEntityID = e.GenEntityID
  JOIN Company.Company c
    ON c.CompanyID = e.CompanyID
  LEFT JOIN Employee.EmployeeStatus es
    ON es.EmployeeStatusID = e.EmployeeStatusID
  WHERE
    e.TerminationDate IS NULL
    AND ${payrollEligibleSageStatusSql('es')}
    AND ge.Status = 'A'
    AND c.Status = 'A'
),
latestPayslipPeriods AS (
  SELECT
    ae.EmployeeID,
    epp.EmployeePayPeriodID,
    p.PayslipID,
    ROW_NUMBER() OVER (PARTITION BY ae.EmployeeID ORDER BY epp.EmployeePayPeriodID DESC, p.PayslipID DESC) AS rn
  FROM activeEmployees ae
  JOIN Employee.EmployeePayPeriod epp
    ON epp.EmployeeID = ae.EmployeeID
  JOIN Payroll.Payslip p
    ON p.EmployeePayPeriodID = epp.EmployeePayPeriodID
  WHERE epp.LastCalcDate >= @PayrollPeriodStart
    AND epp.LastCalcDate < @PayrollPeriodEnd
)
SELECT EmployeeID, EmployeePayPeriodID, PayslipID
INTO #LatestPayslipPeriods
FROM latestPayslipPeriods
WHERE rn = 1;

SELECT
  lp.EmployeeID AS employeeId,
  edef.DefCode AS code,
  COALESCE(NULLIF(LTRIM(RTRIM(edef.ShortDescription)), ''), NULLIF(LTRIM(RTRIM(edef.LongDescription)), ''), edef.DefCode) AS name,
  pel.Total AS amount,
  pel.TaxableAmount AS taxableAmount,
  pel.YTDTotal AS ytdTotal
FROM #LatestPayslipPeriods lp
JOIN Payroll.PayslipEarnLine pel
  ON pel.PayslipID = lp.PayslipID
JOIN Payroll.EarningDef edef
  ON edef.EarningDefID = pel.DefID
WHERE ISNULL(pel.Total, 0) <> 0
ORDER BY lp.EmployeeID, edef.DefCode;

SELECT
  lp.EmployeeID AS employeeId,
  dd.DefCode AS code,
  COALESCE(NULLIF(LTRIM(RTRIM(dd.ShortDescription)), ''), NULLIF(LTRIM(RTRIM(dd.LongDescription)), ''), dd.DefCode) AS name,
  pdl.Total AS amount,
  pdl.YTDTotal AS ytdTotal
FROM #LatestPayslipPeriods lp
JOIN Payroll.PayslipDeductionLine pdl
  ON pdl.PayslipID = lp.PayslipID
JOIN Payroll.DeductionDef dd
  ON dd.DeductionDefID = pdl.DefID
WHERE ISNULL(pdl.Total, 0) <> 0
ORDER BY lp.EmployeeID, dd.DefCode;

SELECT
  lp.EmployeeID AS employeeId,
  ccd.DefCode AS code,
  COALESCE(NULLIF(LTRIM(RTRIM(ccd.ShortDescription)), ''), NULLIF(LTRIM(RTRIM(ccd.LongDescription)), ''), ccd.DefCode) AS name,
  pccl.Total AS amount,
  pccl.YTDTotal AS ytdTotal
FROM #LatestPayslipPeriods lp
JOIN Payroll.PayslipCompanyContributionLine pccl
  ON pccl.PayslipID = lp.PayslipID
JOIN Payroll.CompanyContributionDef ccd
  ON ccd.CompanyContributionDefID = pccl.DefID
WHERE ISNULL(pccl.Total, 0) <> 0
ORDER BY lp.EmployeeID, ccd.DefCode;

DROP TABLE #LatestPayslipPeriods;
`;
};

const periodTotalsQuery = (period: string) => {
  const [year, month] = String(period || payrollPeriod()).split('-').map(Number);
  const safeYear = Number.isFinite(year) && year > 1900 ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  const start = `${safeYear}-${String(safeMonth).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(safeYear, safeMonth, 1)).toISOString().slice(0, 10);
  return `
DECLARE @PayrollPeriodStart date = '${start}';
DECLARE @PayrollPeriodEnd date = '${end}';

WITH latestPayslipPeriods AS (
  SELECT
    e.EmployeeID,
    e.EmployeeCode,
    ge.DisplayName,
    CASE
      WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%' OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'L%'
        THEN REPLACE(UPPER(LTRIM(RTRIM(e.EmployeeCode))), '_', '')
      WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'P%'
        THEN REPLACE(UPPER(LTRIM(RTRIM(e.EmployeeCode))), '_', '')
      ELSE CONCAT('P', REPLACE(UPPER(LTRIM(RTRIM(e.EmployeeCode))), '_', ''))
    END AS directoryEmployeeCode,
    epp.EmployeePayPeriodID,
    epp.LastCalcDate,
    p.PayslipID,
    ROW_NUMBER() OVER (PARTITION BY e.EmployeeID ORDER BY epp.EmployeePayPeriodID DESC, p.PayslipID DESC) AS rn
  FROM Employee.Employee e
  JOIN Entity.GenEntity ge
    ON ge.GenEntityID = e.GenEntityID
  JOIN Employee.EmployeePayPeriod epp
    ON epp.EmployeeID = e.EmployeeID
  JOIN Payroll.Payslip p
    ON p.EmployeePayPeriodID = epp.EmployeePayPeriodID
  WHERE epp.LastCalcDate >= @PayrollPeriodStart
    AND epp.LastCalcDate < @PayrollPeriodEnd
),
latest AS (
  SELECT *
  FROM latestPayslipPeriods
  WHERE rn = 1
),
earnings AS (
  SELECT
    lp.EmployeeID,
    SUM(ISNULL(pel.Total, 0)) AS grossPay,
    SUM(ISNULL(pel.TaxableAmount, pel.Total)) AS taxablePay
  FROM latest lp
  JOIN Payroll.PayslipEarnLine pel
    ON pel.PayslipID = lp.PayslipID
  GROUP BY lp.EmployeeID
),
deductions AS (
  SELECT
    lp.EmployeeID,
    SUM(CASE WHEN dd.DefCode = 'PAYE' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS paye,
    SUM(CASE WHEN (UPPER(dd.DefCode) IN ('PENSION', 'PENSION_EE', 'PENSION_EE2', 'PENSION_BONGA', 'PENARR', 'VOLPENS') OR UPPER(dd.ShortDescription) LIKE '%PENSION%') AND UPPER(dd.DefCode) <> 'SUSPENSION' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS pensionEmployee,
    SUM(CASE WHEN dd.DefCode = 'NHF' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS nhf,
    SUM(CASE WHEN dd.DefCode NOT IN ('PAYE', 'PENSION_EE', 'NHF') AND NOT ((UPPER(dd.DefCode) IN ('PENSION', 'PENSION_EE2', 'PENSION_BONGA', 'PENARR', 'VOLPENS') OR UPPER(dd.ShortDescription) LIKE '%PENSION%') AND UPPER(dd.DefCode) <> 'SUSPENSION') THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS otherDeductions,
    SUM(ISNULL(pdl.Total, 0)) AS totalDeductions
  FROM latest lp
  JOIN Payroll.PayslipDeductionLine pdl
    ON pdl.PayslipID = lp.PayslipID
  JOIN Payroll.DeductionDef dd
    ON dd.DeductionDefID = pdl.DefID
  GROUP BY lp.EmployeeID
),
netPay AS (
  SELECT
    lp.EmployeeID,
    SUM(ISNULL(pnp.PaymentAmount, 0)) AS netPay
  FROM latest lp
  JOIN Payroll.PayslipNetPay pnp
    ON pnp.PayslipID = lp.PayslipID
  GROUP BY lp.EmployeeID
),
contributions AS (
  SELECT
    lp.EmployeeID,
    SUM(CASE WHEN ccd.DefCode = 'PENSION_ER' THEN ISNULL(pccl.Total, 0) ELSE 0 END) AS pensionEmployer,
    SUM(ISNULL(pccl.Total, 0)) AS employerContributions
  FROM latest lp
  JOIN Payroll.PayslipCompanyContributionLine pccl
    ON pccl.PayslipID = lp.PayslipID
  JOIN Payroll.CompanyContributionDef ccd
    ON ccd.CompanyContributionDefID = pccl.DefID
  GROUP BY lp.EmployeeID
)
SELECT
  lp.EmployeeID AS employeeId,
  lp.EmployeeCode AS employeeCode,
  lp.directoryEmployeeCode,
  lp.DisplayName AS employeeName,
  lp.EmployeePayPeriodID AS employeePayPeriodId,
  lp.LastCalcDate AS lastCalcDate,
  lp.PayslipID AS payslipId,
  e.grossPay,
  e.taxablePay,
  d.paye,
  d.pensionEmployee,
  d.nhf,
  d.otherDeductions,
  d.totalDeductions,
  n.netPay,
  c.pensionEmployer,
  c.employerContributions
FROM latest lp
LEFT JOIN earnings e
  ON e.EmployeeID = lp.EmployeeID
LEFT JOIN deductions d
  ON d.EmployeeID = lp.EmployeeID
LEFT JOIN netPay n
  ON n.EmployeeID = lp.EmployeeID
LEFT JOIN contributions c
  ON c.EmployeeID = lp.EmployeeID
ORDER BY lp.directoryEmployeeCode;
`;
};

const groupLinesByEmployee = (lines: SagePayslipLine[]) => lines.reduce((map, line) => {
  const current = map.get(line.employeeId) || [];
  current.push({
    code: line.code,
    name: line.name,
    amount: line.amount,
    taxableAmount: line.taxableAmount ?? null,
    ytdTotal: line.ytdTotal ?? null,
  });
  map.set(line.employeeId, current);
  return map;
}, new Map<number, Array<Omit<SagePayslipLine, 'employeeId'>>>());

export async function readActiveSagePayrollEmployeesWithLatestPayslipLines() {
  const employees = await readActiveSagePayrollEmployees();
  const pool = new sql.ConnectionPool(config());
  await pool.connect();
  try {
    const result = await pool.request().query(latestPayslipLinesQuery());
    const recordsets = (Array.isArray(result.recordsets) ? result.recordsets : []) as unknown[];
    const earningsByEmployee = groupLinesByEmployee((recordsets[0] || []) as SagePayslipLine[]);
    const deductionsByEmployee = groupLinesByEmployee((recordsets[1] || []) as SagePayslipLine[]);
    const contributionsByEmployee = groupLinesByEmployee((recordsets[2] || []) as SagePayslipLine[]);
    return employees.map((employee) => ({
      ...employee,
      latestEarningLinesJson: JSON.stringify(earningsByEmployee.get(employee.employeeId) || []),
      latestDeductionLinesJson: JSON.stringify(deductionsByEmployee.get(employee.employeeId) || []),
      latestContributionLinesJson: JSON.stringify(contributionsByEmployee.get(employee.employeeId) || []),
    }));
  } finally {
    await pool.close();
  }
}

export async function readSagePayrollPeriodTotals(period = payrollPeriod()) {
  const pool = new sql.ConnectionPool(config());
  await pool.connect();
  try {
    const result = await pool.request().query(periodTotalsQuery(period));
    return result.recordset as SagePayrollPeriodTotal[];
  } finally {
    await pool.close();
  }
}

export type SageEmployeePayslipLine = {
  code: string;
  name: string;
  amount: number;
  taxableAmount?: number | null;
  ytdTotal?: number | null;
};

export type SageEmployeePayslipSnapshot = {
  period: string;
  employeeId: number;
  payslipId: number;
  lastCalcDate: string | null;
  earningLines: SageEmployeePayslipLine[];
  deductionLines: SageEmployeePayslipLine[];
  contributionLines: SageEmployeePayslipLine[];
  grossPay: number;
  taxablePay: number;
  totalDeductions: number;
  netPay: number;
  paye: number;
  pensionEmployee: number;
  nhf: number;
  pensionEmployer: number;
  employerContributions: number;
  ytdGrossEarnings: number;
  ytdTaxPaid: number;
  ytdPensionContribution: number;
  ytdDeductions: number;
  ytdNetEarnings: number;
};

const sanitizePayrollPeriod = (period: string) => (/^\d{4}-\d{2}$/.test(String(period || '').trim()) ? String(period).trim() : '');
const sanitizeSageCodeKey = (value: string) => {
  const key = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{1,40}$/.test(key) ? key : '';
};

export const expandSagePayslipMatchKeys = (matchKeys: Array<string | number | null | undefined>) => {
  const keys = new Set<string>();
  for (const value of matchKeys) {
    const raw = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) continue;
    keys.add(raw);
    if (/^P\d+$/.test(raw)) {
      const digits = raw.slice(1);
      keys.add(digits.padStart(4, '0'));
      keys.add(`P${digits.padStart(4, '0')}`);
    } else if (/^\d+$/.test(raw)) {
      keys.add(raw.padStart(4, '0'));
      keys.add(`P${raw.padStart(4, '0')}`);
    }
  }
  const all = [...keys];
  return all.filter((key) => {
    if (!/^\d{1,4}$/.test(key)) return true;
    const padded = key.padStart(4, '0');
    if (all.includes(padded) || all.includes(`P${padded}`)) return false;
    return true;
  });
};

/** Sage EmployeeID keys — only explicit source IDs, never stripped P-code digits (P0146 must not become 146). */
export const sagePayrollSourceEmployeeIdKeys = (matchKeys: Array<string | number | null | undefined>) => {
  const ids = new Set<string>();
  for (const value of matchKeys) {
    const raw = String(value ?? '').trim();
    if (!/^\d{2,9}$/.test(raw)) continue;
    const digits = raw.replace(/^0+/, '') || raw;
    if (/^\d{2,9}$/.test(digits)) ids.add(digits);
    if (raw !== digits) ids.add(raw);
  }
  return [...ids];
};

export const partitionSagePayslipLookupKeys = (matchKeys: Array<string | number | null | undefined>) => ({
  codeKeys: expandSagePayslipMatchKeys(matchKeys),
  sageEmployeeIds: sagePayrollSourceEmployeeIdKeys(matchKeys),
});

const periodRangeSql = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return `SELECT '${period}' AS period_code, CAST('${start}' AS date) AS period_start, CAST('${end}' AS date) AS period_end`;
};

const employeePeriodPayslipsQuery = (periods: string[], codeKeys: string[], sageEmployeeIds: string[]) => {
  const periodRanges = periods.map(periodRangeSql).join(' UNION ALL ');
  const codes = codeKeys.map((key) => `('${key.replace(/'/g, "''")}')`).join(', ');
  const sageIds = sageEmployeeIds.map((key) => `('${key.replace(/'/g, "''")}')`).join(', ');
  const sageIdMatchSql = sageEmployeeIds.length
    ? `OR CAST(e.EmployeeID AS nvarchar(40)) IN (SELECT sage_id FROM #SageEmployeeIds)`
    : '';
  return `
IF OBJECT_ID('tempdb..#PeriodRanges') IS NOT NULL DROP TABLE #PeriodRanges;
SELECT period_code, period_start, period_end
INTO #PeriodRanges
FROM (${periodRanges}) period_ranges;

IF OBJECT_ID('tempdb..#CodeKeys') IS NOT NULL DROP TABLE #CodeKeys;
CREATE TABLE #CodeKeys (match_key nvarchar(40) NOT NULL PRIMARY KEY);
INSERT INTO #CodeKeys(match_key) VALUES ${codes};

${sageEmployeeIds.length ? `IF OBJECT_ID('tempdb..#SageEmployeeIds') IS NOT NULL DROP TABLE #SageEmployeeIds;
CREATE TABLE #SageEmployeeIds (sage_id nvarchar(40) NOT NULL PRIMARY KEY);
INSERT INTO #SageEmployeeIds(sage_id) VALUES ${sageIds};` : ''}

IF OBJECT_ID('tempdb..#MatchedEmployees') IS NOT NULL DROP TABLE #MatchedEmployees;
SELECT
  e.EmployeeID,
  e.EmployeeCode,
  CASE
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%' OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'L%'
      THEN REPLACE(UPPER(LTRIM(RTRIM(e.EmployeeCode))), '_', '')
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'P%'
      THEN REPLACE(UPPER(LTRIM(RTRIM(e.EmployeeCode))), '_', '')
    ELSE CONCAT('P', REPLACE(UPPER(LTRIM(RTRIM(e.EmployeeCode))), '_', ''))
  END AS directoryEmployeeCode
INTO #MatchedEmployees
FROM Employee.Employee e
WHERE REPLACE(UPPER(LTRIM(RTRIM(e.EmployeeCode))), '_', '') IN (SELECT match_key FROM #CodeKeys)
   OR CONCAT('P', REPLACE(UPPER(LTRIM(RTRIM(e.EmployeeCode))), '_', '')) IN (SELECT match_key FROM #CodeKeys)
   ${sageIdMatchSql};

IF OBJECT_ID('tempdb..#PeriodPayslips') IS NOT NULL DROP TABLE #PeriodPayslips;
SELECT
  pr.period_code,
  me.EmployeeID,
  epp.EmployeePayPeriodID,
  p.PayslipID,
  epp.LastCalcDate,
  ROW_NUMBER() OVER (
    PARTITION BY pr.period_code, me.EmployeeID
    ORDER BY epp.EmployeePayPeriodID DESC, p.PayslipID DESC
  ) AS rn
INTO #PeriodPayslips
FROM #PeriodRanges pr
CROSS JOIN #MatchedEmployees me
JOIN Employee.EmployeePayPeriod epp
  ON epp.EmployeeID = me.EmployeeID
JOIN Payroll.Payslip p
  ON p.EmployeePayPeriodID = epp.EmployeePayPeriodID
WHERE epp.LastCalcDate >= pr.period_start
  AND epp.LastCalcDate < pr.period_end;

DELETE FROM #PeriodPayslips WHERE rn > 1;

SELECT
  pp.period_code AS period,
  pp.EmployeeID AS employeeId,
  pp.PayslipID AS payslipId,
  pp.LastCalcDate AS lastCalcDate
FROM #PeriodPayslips pp;

SELECT
  pp.period_code AS period,
  pp.EmployeeID AS employeeId,
  edef.DefCode AS code,
  COALESCE(NULLIF(LTRIM(RTRIM(edef.ShortDescription)), ''), NULLIF(LTRIM(RTRIM(edef.LongDescription)), ''), edef.DefCode) AS name,
  pel.Total AS amount,
  pel.TaxableAmount AS taxableAmount,
  pel.YTDTotal AS ytdTotal
FROM #PeriodPayslips pp
JOIN Payroll.PayslipEarnLine pel
  ON pel.PayslipID = pp.PayslipID
JOIN Payroll.EarningDef edef
  ON edef.EarningDefID = pel.DefID
WHERE ISNULL(pel.Total, 0) <> 0
ORDER BY pp.period_code, pp.EmployeeID, edef.DefCode;

SELECT
  pp.period_code AS period,
  pp.EmployeeID AS employeeId,
  dd.DefCode AS code,
  COALESCE(NULLIF(LTRIM(RTRIM(dd.ShortDescription)), ''), NULLIF(LTRIM(RTRIM(dd.LongDescription)), ''), dd.DefCode) AS name,
  pdl.Total AS amount,
  pdl.YTDTotal AS ytdTotal
FROM #PeriodPayslips pp
JOIN Payroll.PayslipDeductionLine pdl
  ON pdl.PayslipID = pp.PayslipID
JOIN Payroll.DeductionDef dd
  ON dd.DeductionDefID = pdl.DefID
WHERE ISNULL(pdl.Total, 0) <> 0
ORDER BY pp.period_code, pp.EmployeeID, dd.DefCode;

SELECT
  pp.period_code AS period,
  pp.EmployeeID AS employeeId,
  ccd.DefCode AS code,
  COALESCE(NULLIF(LTRIM(RTRIM(ccd.ShortDescription)), ''), NULLIF(LTRIM(RTRIM(ccd.LongDescription)), ''), ccd.DefCode) AS name,
  pccl.Total AS amount,
  pccl.YTDTotal AS ytdTotal
FROM #PeriodPayslips pp
JOIN Payroll.PayslipCompanyContributionLine pccl
  ON pccl.PayslipID = pp.PayslipID
JOIN Payroll.CompanyContributionDef ccd
  ON ccd.CompanyContributionDefID = pccl.DefID
WHERE ISNULL(pccl.Total, 0) <> 0
ORDER BY pp.period_code, pp.EmployeeID, ccd.DefCode;

SELECT
  pp.period_code AS period,
  pp.EmployeeID AS employeeId,
  SUM(ISNULL(pnp.PaymentAmount, 0)) AS netPay
FROM #PeriodPayslips pp
JOIN Payroll.PayslipNetPay pnp
  ON pnp.PayslipID = pp.PayslipID
GROUP BY pp.period_code, pp.EmployeeID;

DROP TABLE #PeriodPayslips;
DROP TABLE #MatchedEmployees;
${sageEmployeeIds.length ? 'DROP TABLE #SageEmployeeIds;' : ''}
DROP TABLE #CodeKeys;
DROP TABLE #PeriodRanges;
`;
};

const roundSageMoney = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;

const isPensionDeductionCode = (code: string) => {
  const upper = String(code || '').toUpperCase();
  return (upper.includes('PENSION') || upper === 'PENARR' || upper === 'VOLPENS') && upper !== 'SUSPENSION';
};

const sagePeriodEmployeeKey = (period: string, employeeId: number) => `${period}|${Number(employeeId)}`;

const buildSageEmployeePayslipSnapshots = (
  headers: Array<{ period: string; employeeId: number; payslipId: number; lastCalcDate: string | Date | null }>,
  earnings: Array<{ period: string; employeeId: number; code: string; name: string; amount: number; taxableAmount?: number | null; ytdTotal?: number | null }>,
  deductions: Array<{ period: string; employeeId: number; code: string; name: string; amount: number; ytdTotal?: number | null }>,
  contributions: Array<{ period: string; employeeId: number; code: string; name: string; amount: number; ytdTotal?: number | null }>,
  netPayRows: Array<{ period: string; employeeId: number; netPay: number }>,
) => {
  const earningsByPeriodEmployee = earnings.reduce((map, line) => {
    const key = sagePeriodEmployeeKey(line.period, line.employeeId);
    const current = map.get(key) || [];
    current.push({
      code: String(line.code || '').trim(),
      name: String(line.name || line.code || '').trim(),
      amount: roundSageMoney(line.amount),
      taxableAmount: line.taxableAmount === null || line.taxableAmount === undefined ? null : roundSageMoney(line.taxableAmount),
      ytdTotal: line.ytdTotal === null || line.ytdTotal === undefined ? null : roundSageMoney(line.ytdTotal),
    });
    map.set(key, current);
    return map;
  }, new Map<string, SageEmployeePayslipLine[]>());

  const deductionsByPeriodEmployee = deductions.reduce((map, line) => {
    const key = sagePeriodEmployeeKey(line.period, line.employeeId);
    const current = map.get(key) || [];
    current.push({
      code: String(line.code || '').trim(),
      name: String(line.name || line.code || '').trim(),
      amount: roundSageMoney(line.amount),
      ytdTotal: line.ytdTotal === null || line.ytdTotal === undefined ? null : roundSageMoney(line.ytdTotal),
    });
    map.set(key, current);
    return map;
  }, new Map<string, SageEmployeePayslipLine[]>());

  const contributionsByPeriodEmployee = contributions.reduce((map, line) => {
    const key = sagePeriodEmployeeKey(line.period, line.employeeId);
    const current = map.get(key) || [];
    current.push({
      code: String(line.code || '').trim(),
      name: String(line.name || line.code || '').trim(),
      amount: roundSageMoney(line.amount),
      ytdTotal: line.ytdTotal === null || line.ytdTotal === undefined ? null : roundSageMoney(line.ytdTotal),
    });
    map.set(key, current);
    return map;
  }, new Map<string, SageEmployeePayslipLine[]>());

  const netPayByPeriodEmployee = new Map(
    netPayRows.map((row) => [sagePeriodEmployeeKey(row.period, row.employeeId), roundSageMoney(row.netPay)]),
  );

  return headers.map((header) => {
    const periodEmployeeKey = sagePeriodEmployeeKey(header.period, header.employeeId);
    const earningLines = earningsByPeriodEmployee.get(periodEmployeeKey) || [];
    const deductionLines = deductionsByPeriodEmployee.get(periodEmployeeKey) || [];
    const contributionLines = contributionsByPeriodEmployee.get(periodEmployeeKey) || [];
    const grossPay = roundSageMoney(earningLines.reduce((sum, line) => sum + line.amount, 0));
    const taxablePay = roundSageMoney(earningLines.reduce((sum, line) => {
      const amount = line.amount;
      const taxableAmount = line.taxableAmount === null || line.taxableAmount === undefined ? amount : line.taxableAmount;
      return sum + taxableAmount;
    }, 0));
    const totalDeductions = roundSageMoney(deductionLines.reduce((sum, line) => sum + line.amount, 0));
    const paye = roundSageMoney(deductionLines.filter((line) => String(line.code || '').toUpperCase() === 'PAYE').reduce((sum, line) => sum + line.amount, 0));
    const pensionEmployee = roundSageMoney(deductionLines.filter((line) => isPensionDeductionCode(line.code)).reduce((sum, line) => sum + line.amount, 0));
    const nhf = roundSageMoney(deductionLines.filter((line) => String(line.code || '').toUpperCase() === 'NHF').reduce((sum, line) => sum + line.amount, 0));
    const pensionEmployer = roundSageMoney(contributionLines.filter((line) => String(line.code || '').toUpperCase() === 'PENSION_ER').reduce((sum, line) => sum + line.amount, 0));
    const employerContributions = roundSageMoney(contributionLines.reduce((sum, line) => sum + line.amount, 0));
    const netPay = netPayByPeriodEmployee.get(periodEmployeeKey) ?? roundSageMoney(Math.max(0, grossPay - totalDeductions));
    const ytdGrossEarnings = roundSageMoney(earningLines.reduce((sum, line) => sum + Number(line.ytdTotal || 0), 0));
    const ytdTaxPaid = roundSageMoney(deductionLines.filter((line) => String(line.code || '').toUpperCase() === 'PAYE').reduce((sum, line) => sum + Number(line.ytdTotal || 0), 0));
    const ytdPensionContribution = roundSageMoney(deductionLines.filter((line) => isPensionDeductionCode(line.code)).reduce((sum, line) => sum + Number(line.ytdTotal || 0), 0));
    const ytdDeductions = roundSageMoney(deductionLines.reduce((sum, line) => sum + Number(line.ytdTotal || 0), 0));
    const ytdNetEarnings = roundSageMoney(ytdGrossEarnings - ytdDeductions);

    return {
      period: header.period,
      employeeId: Number(header.employeeId),
      payslipId: Number(header.payslipId),
      lastCalcDate: header.lastCalcDate ? String(header.lastCalcDate).slice(0, 10) : null,
      earningLines,
      deductionLines,
      contributionLines,
      grossPay,
      taxablePay,
      totalDeductions,
      netPay,
      paye,
      pensionEmployee,
      nhf,
      pensionEmployer,
      employerContributions,
      ytdGrossEarnings,
      ytdTaxPaid,
      ytdPensionContribution,
      ytdDeductions,
      ytdNetEarnings,
    } satisfies SageEmployeePayslipSnapshot;
  });
};

export async function readSageEmployeePayslipSnapshotsForPeriods(
  matchKeys: Array<string | number | null | undefined>,
  periods: string[],
): Promise<SageEmployeePayslipSnapshot[]> {
  const safePeriods = Array.from(new Set(periods.map(sanitizePayrollPeriod).filter(Boolean)));
  const { codeKeys, sageEmployeeIds } = partitionSagePayslipLookupKeys(matchKeys);
  const safeCodeKeys = Array.from(new Set(codeKeys.map(sanitizeSageCodeKey).filter(Boolean)));
  const safeSageIds = Array.from(new Set(sageEmployeeIds.map((key) => key.replace(/[^0-9]/g, '')).filter(Boolean)));
  if (!safePeriods.length || (!safeCodeKeys.length && !safeSageIds.length)) return [];

  const pool = new sql.ConnectionPool(config());
  await pool.connect();
  try {
    const result = await pool.request().query(employeePeriodPayslipsQuery(safePeriods, safeCodeKeys, safeSageIds));
    const recordsets = (Array.isArray(result.recordsets) ? result.recordsets : []) as unknown[];
    return buildSageEmployeePayslipSnapshots(
      (recordsets[0] || []) as Array<{ period: string; employeeId: number; payslipId: number; lastCalcDate: string | Date | null }>,
      (recordsets[1] || []) as Array<{ period: string; employeeId: number; code: string; name: string; amount: number; taxableAmount?: number | null; ytdTotal?: number | null }>,
      (recordsets[2] || []) as Array<{ period: string; employeeId: number; code: string; name: string; amount: number; ytdTotal?: number | null }>,
      (recordsets[3] || []) as Array<{ period: string; employeeId: number; code: string; name: string; amount: number; ytdTotal?: number | null }>,
      (recordsets[4] || []) as Array<{ period: string; employeeId: number; netPay: number }>,
    );
  } finally {
    await pool.close();
  }
}

export async function readSagePayrollEmployeeBankDetails() {
  const pool = new sql.ConnectionPool(config());
  await pool.connect();
  try {
    const metadata = await pool.request().query(employeeBankCandidateQuery);
    const byTable = new Map<string, { schemaName: string; tableName: string; columns: string[] }>();
    for (const row of metadata.recordset as Array<{ schemaName: string; tableName: string; columnName: string }>) {
      const key = `${row.schemaName}.${row.tableName}`;
      const current = byTable.get(key) || { schemaName: row.schemaName, tableName: row.tableName, columns: [] };
      current.columns.push(row.columnName);
      byTable.set(key, current);
    }

    for (const table of byTable.values()) {
      const accountNoColumn = pickColumn(table.columns, [/^AccountNo$/i, /^AccountNumber$/i, /BankAccount(No|Number)$/i, /Account.*No/i, /Account.*Number/i]);
      if (!accountNoColumn) continue;
      const accountNameColumn = pickColumn(table.columns, [/^AccountName$/i, /BankAccountName/i, /Account.*Name/i]);
      const bankNameColumn = pickColumn(table.columns, [/^BankName$/i, /Bank.*Name/i]);
      const bankCodeColumn = pickColumn(table.columns, [/^BankCode$/i, /Bank.*Code/i]);
      const branchNameColumn = pickColumn(table.columns, [/^BranchName$/i, /Branch.*Name/i]);
      const branchCodeColumn = pickColumn(table.columns, [/^BranchCode$/i, /^SortCode$/i, /Branch.*Code/i, /Sort.*Code/i]);
      const modifiedColumn = pickColumn(table.columns, [/Modified/i, /Updated/i, /Change/i, /Created/i, /Date/i]);
      const selectValue = (column: string | undefined, alias: string) => column ? `CAST(${bracket(column)} AS nvarchar(250)) AS ${bracket(alias)}` : `CAST(NULL AS nvarchar(250)) AS ${bracket(alias)}`;
      const order = modifiedColumn ? `ORDER BY ${bracket(modifiedColumn)} DESC` : 'ORDER BY EmployeeID';
      const query = `
        SELECT EmployeeID AS employeeId, bankName, bankCode, branchName, branchCode, accountNo, accountName
        FROM (
          SELECT
            EmployeeID,
            ${selectValue(bankNameColumn, 'bankName')},
            ${selectValue(bankCodeColumn, 'bankCode')},
            ${selectValue(branchNameColumn, 'branchName')},
            ${selectValue(branchCodeColumn, 'branchCode')},
            ${selectValue(accountNoColumn, 'accountNo')},
            ${selectValue(accountNameColumn, 'accountName')},
            ROW_NUMBER() OVER (PARTITION BY EmployeeID ${order}) AS rn
          FROM ${bracket(table.schemaName)}.${bracket(table.tableName)}
          WHERE NULLIF(LTRIM(RTRIM(CAST(${bracket(accountNoColumn)} AS nvarchar(250)))), '') IS NOT NULL
        ) x
        WHERE rn = 1;
      `;
      try {
        const result = await pool.request().query(query);
        const rows = (result.recordset || []) as SagePayrollBankDetail[];
        if (rows.length) return rows;
      } catch {
        // Some Sage columns are non-castable or inaccessible; try the next candidate table.
      }
    }
    return [] as SagePayrollBankDetail[];
  } finally {
    await pool.close();
  }
}

export async function readActiveSagePayrollEmployeeKeys() {
  const employees = await readActiveSagePayrollEmployees();
  const keys = new Set<string>();

  for (const employee of employees) {
    [
      employee.employeeId,
      employee.employeeCode,
      employee.entityCode,
      employee.displayName,
    ].forEach((value) => {
      const key = normalizePayrollMatchKey(value);
      if (key) keys.add(key);
    });
  }

  return { employees, keys };
}
