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

export const normalizePayrollMatchKey = (value: string | number | null | undefined) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';
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
      instanceName: process.env.SAGE_PAYROLL_DB_INSTANCE || 'MSSQLSERVERPEOPL',
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
    AND ISNULL(es.Code, 'A') = 'A'
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
    AND ISNULL(es.Code, 'A') = 'A'
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
    AND ISNULL(es.Code, 'A') = 'A'
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
    AND ISNULL(es.Code, 'A') = 'A'
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
    SUM(CASE WHEN dd.DefCode = 'PENSION_EE' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS pensionEmployee,
    SUM(CASE WHEN dd.DefCode = 'NHF' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS nhf,
    SUM(CASE WHEN dd.DefCode NOT IN ('PAYE', 'PENSION_EE', 'NHF') THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS otherDeductions,
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
  ed.TaxNo AS taxNo,
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
    (e.TerminationDate IS NULL AND ISNULL(es.Code, 'A') = 'A')
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
      AND ISNULL(es2.Code, 'A') = 'A'
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
    AND ISNULL(es.Code, 'A') = 'A'
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
    SUM(CASE WHEN dd.DefCode = 'PENSION_EE' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS pensionEmployee,
    SUM(CASE WHEN dd.DefCode = 'NHF' THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS nhf,
    SUM(CASE WHEN dd.DefCode NOT IN ('PAYE', 'PENSION_EE', 'NHF') THEN ISNULL(pdl.Total, 0) ELSE 0 END) AS otherDeductions,
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
