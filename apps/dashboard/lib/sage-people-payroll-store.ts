import sql from 'mssql';

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

const config = () => ({
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
});

const activeEmployeeQuery = `
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
)
SELECT
  e.EmployeeID AS employeeId,
  e.EmployeeCode AS employeeCode,
  CASE
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'C%' OR UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'L%'
      THEN LTRIM(RTRIM(e.EmployeeCode))
    WHEN UPPER(LTRIM(RTRIM(e.EmployeeCode))) LIKE 'P%'
      THEN LTRIM(RTRIM(e.EmployeeCode))
    ELSE CONCAT('P', LTRIM(RTRIM(e.EmployeeCode)))
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
  ed.AnnualSalary AS annualSalary,
  ed.PeriodSalary AS periodSalary,
  ed.RatePerHour AS ratePerHour,
  ed.RatePerDay AS ratePerDay,
  ed.HoursPerDay AS hoursPerDay,
  ed.HoursPerPeriod AS hoursPerPeriod,
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
WHERE
  ge.Status = 'A'
  AND c.Status = 'A'
  AND (
    (e.TerminationDate IS NULL AND ISNULL(es.Code, 'A') = 'A')
    OR UPPER(REPLACE(LTRIM(RTRIM(e.EmployeeCode)), '_', '')) IN (SELECT normalizedEmployeeCode FROM activeEmployeeCodes)
  )
ORDER BY e.EmployeeCode;
`;

export async function readActiveSagePayrollEmployees() {
  const pool = new sql.ConnectionPool(config());
  await pool.connect();
  try {
    const result = await pool.request().query(activeEmployeeQuery);
    return result.recordset as SagePayrollEmployee[];
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
