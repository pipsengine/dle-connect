import sql from 'mssql';

type DraftRecordLike = {
  draftId: string;
  status: 'draft' | 'submitted' | 'approved' | 'created' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  draft: any;
  audit?: { at?: string; action: string; performedBy: string; reason?: string; oldValue?: string; newValue?: string }[];
};

type DuplicateMatch = { employeeId?: string; draftId?: string; reason: string };

export type DleEmployeeDirectoryRow = {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeDbId: number;
  fullName: string;
  preferredName?: string;
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  maritalStatus: string;
  email: string;
  officialEmail: string;
  personalEmail: string;
  phone: string;
  primaryPhone: string;
  alternatePhone: string;
  officeExtension: string;
  residentialAddress: string;
  permanentAddress: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  jobTitle: string;
  designation: string;
  jobGrade: string;
  department: string;
  division: string;
  businessUnit: string;
  costCenter: string;
  managerName?: string;
  functionalManager?: string;
  departmentHead?: string;
  hrBusinessPartner?: string;
  location: string;
  workLocation: string;
  officeLocation: string;
  projectSite?: string;
  shift?: 'Day' | 'Night' | 'Rotational';
  staffCategory: string;
  employeeCategory: string;
  employmentType: string;
  status: string;
  nationality: string;
  expatriate: boolean;
  fieldWorker: boolean;
  remoteWorker: boolean;
  dateJoined: string;
  probationStartDate: string;
  probationEndDate: string;
  confirmationDueDate: string;
  contractStartDate: string;
  yearsOfService: number;
  contractEndDate?: string;
  emergencyContactsComplete: boolean;
  emergencyContactCount: number;
  documentCount: number;
  hasManagerAssigned: boolean;
  payrollSource: string;
  payrollGroup: string;
  salaryGrade: string;
  benefitGroup: string;
  payCurrency: string;
  paymentRun: string;
  paymentType: string;
  periodSalary: number | null;
  annualSalary: number | null;
  setupAssignedToPayroll: boolean;
  sourceSystem: string;
  sourceEmployeeId: string;
  sourceDraftId: string;
  createdAt: string;
  modifiedAt: string;
  aiRiskScore: number;
  trainingCompliance: 'Compliant' | 'Overdue' | 'At Risk';
};

export type SagePayrollEmployeeImportRow = {
  employeeId: number;
  employeeCode: string;
  directoryEmployeeCode: string;
  employeeCodeDisplay: string | null;
  entityCode: string;
  displayName: string | null;
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

let poolPromise: Promise<sql.ConnectionPool> | null = null;
let disabledAfterFailure = false;

const bool = (v: string | undefined, fallback: boolean) => {
  if (v == null || v === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(v.toLowerCase());
};

const config = (): sql.config | null => {
  if (!bool(process.env.DLE_ENTERPRISE_DB_ENABLED, true)) return null;
  const server = process.env.DLE_ENTERPRISE_DB_HOST;
  const database = process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise';
  const user = process.env.DLE_ENTERPRISE_DB_USER;
  const password = process.env.DLE_ENTERPRISE_DB_PASSWORD;
  if (!server || !user || !password) return null;

  return {
    server,
    port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
    database,
    user,
    password,
    options: {
      encrypt: bool(process.env.DLE_ENTERPRISE_DB_ENCRYPT, true),
      trustServerCertificate: bool(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE, true),
      enableArithAbort: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 15000,
    connectionTimeout: 5000,
  };
};

const pool = async () => {
  if (disabledAfterFailure) return null;
  const cfg = config();
  if (!cfg) return null;
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(cfg).connect().catch((error) => {
      poolPromise = null;
      disabledAfterFailure = true;
      console.warn('[DLE Enterprise DB] SQL persistence disabled after connection failure:', error instanceof Error ? error.message : error);
      throw error;
    });
  }
  try {
    return await poolPromise;
  } catch {
    return null;
  }
};

export const getDleEnterpriseDbPool = pool;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const nullable = (v: unknown) => {
  const s = str(v);
  return s ? s : null;
};
const dateOrNull = (v: unknown) => {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const boolVal = (v: unknown) => (typeof v === 'boolean' ? v : !!v);
const numOrNull = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isoDate = (v: unknown) => {
  if (!v) return '';
  const date = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const isoDateTime = (v: unknown) => {
  if (!v) return '';
  const date = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const sourceDate = (v: unknown) => {
  const d = isoDate(v);
  return d || null;
};

const isLocalNationality = (value: unknown) => {
  const normalized = str(value).toLowerCase().replace(/[^a-z]/g, '');
  return ['nigeria', 'nigerian', 'ng'].includes(normalized);
};

const sageEmployeeCode = (employee: SagePayrollEmployeeImportRow) => {
  const raw = str(employee.directoryEmployeeCode || employee.employeeCode).toUpperCase();
  const base = /^[PCL]/.test(raw) ? raw : `P${raw}`;
  const currency = str(employee.companyCurrency).toUpperCase();
  const companyCode = str(employee.companyCode).toUpperCase();
  if (currency && currency !== 'NGN') return `${base}-${currency}`;
  if (companyCode && !['DLE', 'DORMANLONG'].includes(companyCode) && !base.includes(companyCode)) return `${base}-${companyCode}`;
  return base;
};

const sageEmployeeType = (employeeCode: string) => {
  if (employeeCode.startsWith('L')) return 'Lumpsum';
  if (employeeCode.startsWith('C')) return 'Daily Rate';
  return 'Permanent';
};

const sageStatus = (statusName: unknown, statusCode: unknown) => {
  const code = str(statusCode).toUpperCase();
  const name = str(statusName);
  if (code === 'A' || name.toLowerCase() === 'active') return 'Active';
  return name || 'Active';
};

const sageFullName = (employee: SagePayrollEmployeeImportRow, employeeCode: string) => {
  const firstNames = str(employee.firstNames);
  const middleName = str(employee.middleName);
  const parts = [
    str(employee.title),
    firstNames,
    middleName && !firstNames.toLowerCase().includes(middleName.toLowerCase()) ? middleName : '',
    str(employee.lastName),
  ].filter(Boolean).join(' ');
  if (parts) return parts;
  const display = str(employee.displayName);
  if (display) return display;
  return parts || employeeCode;
};

const parseSourceJson = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const sourceFieldValuesJson = (employee: SagePayrollEmployeeImportRow) => {
  const sources: [string, unknown][] = [
    ['Employee.Employee', employee.sageEmployeeJson],
    ['Employee.EmployeeDetail', employee.sageEmployeeDetailJson],
    ['Employee.EmployeeContract', employee.sageEmployeeContractJson],
    ['Entity.GenEntity', employee.sageEntityJson],
    ['Company.Company', employee.sageCompanyJson],
    ['Employee.EmployeeStatus', employee.sageEmployeeStatusJson],
  ];

  const fields: { sourceTable: string; columnName: string; value: string | null }[] = [];
  for (const [sourceTable, json] of sources) {
    const row = parseSourceJson(json);
    if (!row) continue;
    for (const [columnName, value] of Object.entries(row)) {
      fields.push({
        sourceTable,
        columnName,
        value: value == null ? null : value instanceof Date ? value.toISOString() : String(value),
      });
    }
  }

  return JSON.stringify(fields);
};

const yearsSince = (v: unknown) => {
  if (!v) return 0;
  const date = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(date.getTime())) return 0;
  const today = new Date();
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (start > current) return 0;
  let years = current.getUTCFullYear() - start.getUTCFullYear();
  const anniversaryThisYear = new Date(Date.UTC(current.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  if (current < anniversaryThisYear) years -= 1;
  return Math.max(0, years);
};

const snapshot = (rec: Pick<DraftRecordLike, 'draft'>) => {
  const p = rec.draft?.personal || {};
  const c = rec.draft?.contact || {};
  const e = rec.draft?.employment || {};
  const j = rec.draft?.job || {};
  return {
    employeeCode: nullable(e.employeeId),
    fullName: `${str(p.firstName)} ${str(p.lastName)}`.trim() || null,
    officialEmail: nullable(c.officialEmail),
    personalEmail: nullable(c.personalEmail),
    primaryPhone: nullable(c.primaryPhone),
    dateOfBirth: dateOrNull(p.dateOfBirth),
    department: nullable(j.department),
    jobTitle: nullable(j.jobTitle),
  };
};

const saveAudit = async (tx: sql.Transaction, rec: DraftRecordLike) => {
  for (const item of rec.audit || []) {
    await new sql.Request(tx)
      .input('draft_id', sql.NVarChar(40), rec.draftId)
      .input('audit_action', sql.NVarChar(150), item.action)
      .input('performed_by', sql.NVarChar(128), item.performedBy)
      .input('reason', sql.NVarChar(1000), item.reason || null)
      .input('old_value', sql.NVarChar(sql.MAX), item.oldValue || null)
      .input('new_value', sql.NVarChar(sql.MAX), item.newValue || null)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM [hris].[EmployeeDraftAuditLog]
          WHERE draft_id = @draft_id AND audit_action = @audit_action AND performed_by = @performed_by
            AND ISNULL(old_value, '') = ISNULL(@old_value, '') AND ISNULL(new_value, '') = ISNULL(@new_value, '')
        )
        INSERT [hris].[EmployeeDraftAuditLog](draft_id, audit_action, performed_by, reason, old_value, new_value)
        VALUES (@draft_id, @audit_action, @performed_by, @reason, @old_value, @new_value);
      `);
  }
};

export const getEmployeeDraftFromDb = async (draftId: string): Promise<DraftRecordLike | null> => {
  const p = await pool();
  if (!p) return null;
  const rs = await p
    .request()
    .input('draft_id', sql.NVarChar(40), draftId)
    .query(`
      SELECT draft_id, draft_status, draft_payload_json, created_at, COALESCE(modified_at, created_at) AS updated_at
      FROM [hris].[EmployeeDrafts]
      WHERE draft_id = @draft_id;
      SELECT audit_action, performed_by, reason, old_value, new_value, audit_at
      FROM [hris].[EmployeeDraftAuditLog]
      WHERE draft_id = @draft_id
      ORDER BY audit_at DESC, audit_id DESC;
    `);
  const recordsets = rs.recordsets as sql.IRecordSet<any>[];
  const row = recordsets[0]?.[0];
  if (!row) return null;
  return {
    draftId: row.draft_id,
    status: row.draft_status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    draft: JSON.parse(row.draft_payload_json),
    audit: (recordsets[1] || []).map((x: any) => ({
      id: `${row.draft_id}-${new Date(x.audit_at).getTime()}`,
      at: new Date(x.audit_at).toISOString(),
      action: x.audit_action,
      performedBy: x.performed_by,
      reason: x.reason || undefined,
      oldValue: x.old_value || undefined,
      newValue: x.new_value || undefined,
    })),
  };
};

export const saveEmployeeDraftToDb = async (rec: DraftRecordLike) => {
  const p = await pool();
  if (!p) return false;
  const s = snapshot(rec);
  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('draft_id', sql.NVarChar(40), rec.draftId)
      .input('draft_status', sql.VarChar(30), rec.status)
      .input('draft_payload_json', sql.NVarChar(sql.MAX), JSON.stringify(rec.draft))
      .input('employee_code', sql.NVarChar(50), s.employeeCode)
      .input('full_name', sql.NVarChar(250), s.fullName)
      .input('official_email', sql.NVarChar(320), s.officialEmail)
      .input('personal_email', sql.NVarChar(320), s.personalEmail)
      .input('primary_phone', sql.NVarChar(50), s.primaryPhone)
      .input('date_of_birth', sql.Date, s.dateOfBirth)
      .input('department', sql.NVarChar(150), s.department)
      .input('job_title', sql.NVarChar(150), s.jobTitle)
      .query(`
        MERGE [hris].[EmployeeDrafts] AS target
        USING (SELECT @draft_id AS draft_id) AS source
        ON target.draft_id = source.draft_id
        WHEN MATCHED THEN UPDATE SET
          draft_status = @draft_status,
          draft_payload_json = @draft_payload_json,
          employee_code = @employee_code,
          full_name = @full_name,
          official_email = @official_email,
          personal_email = @personal_email,
          primary_phone = @primary_phone,
          date_of_birth = @date_of_birth,
          department = @department,
          job_title = @job_title,
          submitted_at = CASE WHEN @draft_status = 'submitted' AND submitted_at IS NULL THEN SYSUTCDATETIME() ELSE submitted_at END,
          modified_at = SYSUTCDATETIME(),
          modified_by = SUSER_SNAME()
        WHEN NOT MATCHED THEN INSERT (
          draft_id, draft_status, draft_payload_json, employee_code, full_name, official_email, personal_email,
          primary_phone, date_of_birth, department, job_title
        ) VALUES (
          @draft_id, @draft_status, @draft_payload_json, @employee_code, @full_name, @official_email, @personal_email,
          @primary_phone, @date_of_birth, @department, @job_title
        );
      `);
    await saveAudit(tx, rec);
    await tx.commit();
    return true;
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
};

export const deleteEmployeeDraftFromDb = async (draftId: string) => {
  const p = await pool();
  if (!p) return false;
  await p.request().input('draft_id', sql.NVarChar(40), draftId).query(`
    UPDATE [hris].[EmployeeDrafts]
    SET draft_status = 'cancelled', modified_at = SYSUTCDATETIME(), modified_by = SUSER_SNAME()
    WHERE draft_id = @draft_id AND draft_status <> 'created';
  `);
  return true;
};

export const findEmployeeDuplicatesInDb = async (payload: any): Promise<DuplicateMatch[]> => {
  const p = await pool();
  if (!p) return [];
  const fullName = str(payload.fullName).toLowerCase();
  const officialEmail = str(payload.officialEmail).toLowerCase();
  const personalEmail = str(payload.personalEmail).toLowerCase();
  const primaryPhone = str(payload.primaryPhone).replace(/\s+/g, '');
  const dob = dateOrNull(payload.dateOfBirth);
  const rs = await p
    .request()
    .input('full_name', sql.NVarChar(250), fullName || null)
    .input('official_email', sql.NVarChar(320), officialEmail || null)
    .input('personal_email', sql.NVarChar(320), personalEmail || null)
    .input('primary_phone', sql.NVarChar(50), primaryPhone || null)
    .input('date_of_birth', sql.Date, dob)
    .query(`
      SELECT TOP (12) e.employee_code AS employeeId,
        CASE
          WHEN @official_email IS NOT NULL AND LOWER(c.official_email) = @official_email THEN 'Same official email'
          WHEN @personal_email IS NOT NULL AND LOWER(c.personal_email) = @personal_email THEN 'Same personal email'
          WHEN @primary_phone IS NOT NULL AND REPLACE(c.primary_phone, ' ', '') = @primary_phone THEN 'Same phone number'
          ELSE 'Same name and date of birth'
        END AS reason
      FROM [hris].[Employees] e
      LEFT JOIN [hris].[EmployeeContactInfo] c ON c.employee_id = e.employee_id
      LEFT JOIN [hris].[EmployeePersonalInfo] pinfo ON pinfo.employee_id = e.employee_id
      WHERE e.is_deleted = 0 AND (
        (@official_email IS NOT NULL AND LOWER(c.official_email) = @official_email)
        OR (@personal_email IS NOT NULL AND LOWER(c.personal_email) = @personal_email)
        OR (@primary_phone IS NOT NULL AND REPLACE(c.primary_phone, ' ', '') = @primary_phone)
        OR (@full_name IS NOT NULL AND LOWER(e.full_name) = @full_name AND @date_of_birth IS NOT NULL AND pinfo.date_of_birth = @date_of_birth)
      );

      SELECT TOP (12) draft_id AS draftId,
        CASE
          WHEN @official_email IS NOT NULL AND LOWER(official_email) = @official_email THEN 'Draft with same official email'
          WHEN @personal_email IS NOT NULL AND LOWER(personal_email) = @personal_email THEN 'Draft with same personal email'
          WHEN @primary_phone IS NOT NULL AND REPLACE(primary_phone, ' ', '') = @primary_phone THEN 'Draft with same phone number'
          ELSE 'Draft with same name and date of birth'
        END AS reason
      FROM [hris].[EmployeeDrafts]
      WHERE draft_status IN ('draft', 'submitted', 'approved') AND (
        (@official_email IS NOT NULL AND LOWER(official_email) = @official_email)
        OR (@personal_email IS NOT NULL AND LOWER(personal_email) = @personal_email)
        OR (@primary_phone IS NOT NULL AND REPLACE(primary_phone, ' ', '') = @primary_phone)
        OR (@full_name IS NOT NULL AND LOWER(full_name) = @full_name AND @date_of_birth IS NOT NULL AND date_of_birth = @date_of_birth)
      );
    `);
  const recordsets = rs.recordsets as sql.IRecordSet<any>[];
  return [
    ...(recordsets[0] || []).map((x: any) => ({ employeeId: x.employeeId, reason: x.reason })),
    ...(recordsets[1] || []).map((x: any) => ({ draftId: x.draftId, reason: x.reason })),
  ];
};

export const readEmployeeDirectoryFromDb = async (): Promise<DleEmployeeDirectoryRow[] | null> => {
  const p = await pool();
  if (!p) return null;
  const rs = await p.request().query(`
    SELECT
      v.employee_id,
      v.employee_code,
      v.full_name,
      v.preferred_name,
      v.employment_status,
      v.employment_type,
      v.source_system,
      v.source_employee_id,
      v.source_draft_id,
      pinfo.title,
      pinfo.first_name,
      pinfo.middle_name,
      pinfo.last_name,
      pinfo.gender,
      pinfo.date_of_birth,
      pinfo.marital_status,
      pinfo.nationality,
      v.official_email,
      v.personal_email,
      v.primary_phone,
      v.city,
      v.state,
      v.country,
      v.date_joined,
      v.work_mode,
      v.work_location,
      v.job_title,
      v.designation,
      v.job_grade,
      v.department,
      v.division,
      v.business_unit,
      v.cost_center,
      v.project_site,
      v.reporting_manager,
      v.created_at,
      v.modified_at,
      j.office_location,
      j.functional_manager,
      j.department_head,
      j.hr_business_partner,
      contact.alternate_phone,
      contact.office_extension,
      contact.residential_address,
      contact.permanent_address,
      contact.postal_code,
      emp.staff_category,
      emp.employee_category,
      emp.probation_start_date,
      emp.probation_end_date,
      emp.confirmation_due_date,
      emp.contract_start_date,
      emp.shift_pattern,
      emp.contract_end_date,
      emp.expatriate_status,
      payroll.payroll_group,
      payroll.salary_grade,
      payroll.benefit_group,
      payroll.pay_currency,
      payroll.payment_run,
      payroll.payment_type,
      payroll.period_salary,
      payroll.annual_salary,
      payroll.setup_assigned_to_payroll,
      ec.emergency_contact_count,
      doc.document_count
    FROM [hris].[EmployeeMasterView] v
    LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeePersonalInfo] pinfo ON pinfo.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeeContactInfo] contact ON contact.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = v.employee_id
    LEFT JOIN [hris].[EmployeePayrollSetup] payroll ON payroll.employee_id = v.employee_id
    OUTER APPLY (
      SELECT COUNT_BIG(*) AS emergency_contact_count
      FROM [hris].[EmployeeEmergencyContacts] c
      WHERE c.employee_id = v.employee_id
    ) ec
    OUTER APPLY (
      SELECT COUNT_BIG(*) AS document_count
      FROM [hris].[EmployeeDocuments] d
      WHERE d.employee_id = v.employee_id
    ) doc
    ORDER BY v.employee_code;
  `);

  return (rs.recordset || []).map((row: any) => {
    const employeeCode = str(row.employee_code);
    const employmentType = str(row.employment_type) || 'Not assigned';
    const status = str(row.employment_status) || 'Inactive';
    const workMode = str(row.work_mode);
    const workLocation = str(row.work_location);
    const officeLocation = str(row.office_location);
    const projectSite = str(row.project_site);
    const nationality = str(row.nationality) || 'Not recorded';
    const emergencyContactCount = Number(row.emergency_contact_count || 0);
    const documentCount = Number(row.document_count || 0);
    const contractEndDate = isoDate(row.contract_end_date);
    const missingProfileBits = [row.official_email, row.primary_phone, row.date_joined, row.reporting_manager].filter((x) => !str(x)).length;
    const aiRiskScore = Math.min(95, missingProfileBits * 18 + (emergencyContactCount === 0 ? 18 : 0) + (documentCount === 0 ? 12 : 0));

    return {
      id: employeeCode,
      employeeId: employeeCode,
      employeeCode,
      employeeDbId: Number(row.employee_id),
      fullName: str(row.full_name) || employeeCode,
      preferredName: str(row.preferred_name) || undefined,
      title: str(row.title),
      firstName: str(row.first_name),
      middleName: str(row.middle_name),
      lastName: str(row.last_name),
      gender: str(row.gender),
      dateOfBirth: isoDate(row.date_of_birth),
      maritalStatus: str(row.marital_status),
      email: str(row.official_email),
      officialEmail: str(row.official_email),
      personalEmail: str(row.personal_email),
      phone: str(row.primary_phone),
      primaryPhone: str(row.primary_phone),
      alternatePhone: str(row.alternate_phone),
      officeExtension: str(row.office_extension),
      residentialAddress: str(row.residential_address),
      permanentAddress: str(row.permanent_address),
      city: str(row.city),
      state: str(row.state),
      country: str(row.country),
      postalCode: str(row.postal_code),
      jobTitle: str(row.job_title) || 'Unassigned Job Title',
      designation: str(row.designation),
      jobGrade: str(row.job_grade),
      department: str(row.department) || 'Unassigned Department',
      division: str(row.division) || 'Unassigned Division',
      businessUnit: str(row.business_unit) || 'Unassigned Business Unit',
      costCenter: str(row.cost_center),
      managerName: str(row.reporting_manager) || undefined,
      functionalManager: str(row.functional_manager) || undefined,
      departmentHead: str(row.department_head) || undefined,
      hrBusinessPartner: str(row.hr_business_partner) || undefined,
      location: officeLocation || workLocation || 'Unassigned Location',
      workLocation,
      officeLocation,
      projectSite: projectSite || undefined,
      shift: (['Day', 'Night', 'Rotational'].includes(str(row.shift_pattern)) ? str(row.shift_pattern) : undefined) as DleEmployeeDirectoryRow['shift'],
      staffCategory: str(row.staff_category),
      employeeCategory: str(row.employee_category),
      employmentType,
      status,
      nationality,
      expatriate: str(row.expatriate_status).toLowerCase() === 'expatriate' && !isLocalNationality(nationality),
      fieldWorker: Boolean(projectSite) || ['Daily Rate', 'Lumpsum'].includes(employmentType),
      remoteWorker: workMode.toLowerCase() === 'remote',
      dateJoined: isoDate(row.date_joined),
      probationStartDate: isoDate(row.probation_start_date),
      probationEndDate: isoDate(row.probation_end_date),
      confirmationDueDate: isoDate(row.confirmation_due_date),
      contractStartDate: isoDate(row.contract_start_date),
      yearsOfService: yearsSince(row.date_joined),
      contractEndDate: contractEndDate || undefined,
      emergencyContactsComplete: emergencyContactCount > 0,
      emergencyContactCount,
      documentCount,
      hasManagerAssigned: Boolean(str(row.reporting_manager)),
      payrollSource: str(row.payroll_group) || 'DLE_Enterprise',
      payrollGroup: str(row.payroll_group),
      salaryGrade: str(row.salary_grade),
      benefitGroup: str(row.benefit_group),
      payCurrency: str(row.pay_currency),
      paymentRun: str(row.payment_run),
      paymentType: str(row.payment_type),
      periodSalary: numOrNull(row.period_salary),
      annualSalary: numOrNull(row.annual_salary),
      setupAssignedToPayroll: Boolean(row.setup_assigned_to_payroll),
      sourceSystem: str(row.source_system) || 'DLE_Enterprise',
      sourceEmployeeId: str(row.source_employee_id),
      sourceDraftId: str(row.source_draft_id),
      createdAt: isoDateTime(row.created_at),
      modifiedAt: isoDateTime(row.modified_at),
      aiRiskScore,
      trainingCompliance: aiRiskScore >= 70 ? 'Overdue' : aiRiskScore >= 40 ? 'At Risk' : 'Compliant',
    };
  });
};

export const importSagePayrollEmployeesToDb = async (employees: SagePayrollEmployeeImportRow[]) => {
  const p = await pool();
  if (!p) return null;

  let inserted = 0;
  let updated = 0;
  const failures: { employeeId: string; employeeCode: string; error: string }[] = [];

  for (const employee of employees) {
    const employeeCode = sageEmployeeCode(employee);
    const employeeType = sageEmployeeType(employeeCode);
    const fullName = sageFullName(employee, employeeCode);
    const firstName = str(employee.firstNames) || fullName;
    const lastName = str(employee.lastName) || fullName;
    const sourceEmployeeId = String(employee.employeeId);
    const nationality = str(employee.nationality);
    const isExpatriate = Boolean(nationality && !isLocalNationality(nationality));
    const rawPayloadJson = JSON.stringify({ ...employee, directoryEmployeeCode: employeeCode });
    const sourceFieldsJson = sourceFieldValuesJson(employee);
    const tx = new sql.Transaction(p);

    try {
      await tx.begin();
      const request = new sql.Request(tx)
        .input('employee_code', sql.NVarChar(50), employeeCode)
        .input('full_name', sql.NVarChar(250), fullName)
        .input('employment_status', sql.VarChar(40), sageStatus(employee.statusName, employee.statusCode))
        .input('employment_type', sql.VarChar(40), employeeType)
        .input('source_employee_id', sql.NVarChar(80), sourceEmployeeId)
        .input('preferred_name', sql.NVarChar(150), str(employee.knownAsName) || null)
        .input('title', sql.NVarChar(30), str(employee.title) || null)
        .input('first_name', sql.NVarChar(100), firstName.slice(0, 100))
        .input('middle_name', sql.NVarChar(100), str(employee.middleName) || null)
        .input('last_name', sql.NVarChar(100), lastName.slice(0, 100))
        .input('gender', sql.NVarChar(40), str(employee.gender) || null)
        .input('date_of_birth', sql.Date, sourceDate(employee.birthDate))
        .input('marital_status', sql.NVarChar(50), str(employee.maritalStatus) || null)
        .input('nationality', sql.NVarChar(100), nationality || null)
        .input('official_email', sql.NVarChar(320), str(employee.emailAddress) || null)
        .input('primary_phone', sql.NVarChar(50), str(employee.cellNo) || null)
        .input('alternate_phone', sql.NVarChar(50), str(employee.homeTelNo || employee.workTelNo) || null)
        .input('office_extension', sql.NVarChar(30), str(employee.workTelNo) || null)
        .input('residential_address', sql.NVarChar(1000), str(employee.physicalAddress) || null)
        .input('permanent_address', sql.NVarChar(1000), str(employee.postalAddress || employee.physicalAddress) || null)
        .input('city', sql.NVarChar(120), str(employee.physicalCityTown || employee.postalCityTown) || null)
        .input('state', sql.NVarChar(120), str(employee.physicalProvince) || null)
        .input('country', sql.NVarChar(120), str(employee.physicalCountryCode) || null)
        .input('postal_code', sql.NVarChar(30), str(employee.physicalPostalCode || employee.postalPostalCode) || null)
        .input('employee_type_name', sql.NVarChar(100), str(employee.hierarchyEmployeeTypeName) || employeeType)
        .input('date_joined', sql.Date, sourceDate(employee.dateEngaged || employee.dateJoinedGroup))
        .input('probation_end_date', sql.Date, sourceDate(employee.probationPeriodEndDate))
        .input('contract_start_date', sql.Date, sourceDate(employee.contractStartDate))
        .input('contract_end_date', sql.Date, sourceDate(employee.contractExpiryDate))
        .input('work_location', sql.NVarChar(150), str(employee.siteName || employee.hierarchyLocationName) || null)
        .input('expatriate_status', sql.NVarChar(80), isExpatriate ? 'Expatriate' : 'Local')
        .input('job_title', sql.NVarChar(150), str(employee.jobTitle) || null)
        .input('job_grade', sql.NVarChar(80), str(employee.jobGradeCode || employee.jobGrade) || null)
        .input('designation', sql.NVarChar(150), str(employee.jobTitleCode) || null)
        .input('department', sql.NVarChar(150), str(employee.departmentName || employee.hierarchyDepartmentName) || null)
        .input('department_code', sql.NVarChar(80), str(employee.departmentCode || employee.hierarchyDepartmentCode) || null)
        .input('company_code', sql.NVarChar(80), str(employee.companyCode) || null)
        .input('company_name', sql.NVarChar(150), str(employee.companyName) || null)
        .input('company_currency', sql.NVarChar(10), str(employee.companyCurrency) || null)
        .input('payment_type', sql.NVarChar(100), str(employee.paymentType) || null)
        .input('payment_run', sql.NVarChar(150), str(employee.paymentRunLong || employee.paymentRunShort) || null)
        .input('remuneration_definition', sql.NVarChar(250), str(employee.remunerationDefinition) || null)
        .input('tax_no', sql.NVarChar(80), str(employee.taxNo) || null)
        .input('bank_name', sql.NVarChar(150), str(employee.bankName) || null)
        .input('account_number', sql.NVarChar(50), str(employee.accountNo) || null)
        .input('account_name', sql.NVarChar(250), str(employee.accountName) || null)
        .input('annual_salary', sql.Decimal(19, 4), numOrNull(employee.annualSalary))
        .input('period_salary', sql.Decimal(19, 4), numOrNull(employee.periodSalary))
        .input('rate_per_hour', sql.Decimal(19, 4), numOrNull(employee.ratePerHour))
        .input('rate_per_day', sql.Decimal(19, 4), numOrNull(employee.ratePerDay))
        .input('hours_per_day', sql.Decimal(9, 4), numOrNull(employee.hoursPerDay))
        .input('hours_per_period', sql.Decimal(9, 4), numOrNull(employee.hoursPerPeriod))
        .input('site_code', sql.NVarChar(150), str(employee.siteCode || employee.hierarchyLocationCode) || null)
        .input('site_name', sql.NVarChar(150), str(employee.siteName || employee.hierarchyLocationName) || null)
        .input('manager_name', sql.NVarChar(250), str(employee.managerName) || null)
        .input('source_employee_code', sql.NVarChar(80), str(employee.employeeCode) || null)
        .input('source_entity_code', sql.NVarChar(80), str(employee.entityCode) || null)
        .input('source_status_code', sql.NVarChar(80), str(employee.statusCode) || null)
        .input('source_status_name', sql.NVarChar(150), str(employee.statusName) || null)
        .input('raw_payload_json', sql.NVarChar(sql.MAX), rawPayloadJson)
        .input('source_fields_json', sql.NVarChar(sql.MAX), sourceFieldsJson);

      const result = await request.query(`
        DECLARE @employee_id bigint;
        DECLARE @was_insert bit = 0;

        SELECT @employee_id = employee_id
        FROM [hris].[Employees] WITH (UPDLOCK, HOLDLOCK)
        WHERE source_system = N'Sage 300 People Payroll'
          AND source_employee_id = @source_employee_id;

        IF @employee_id IS NULL
        BEGIN
          INSERT [hris].[Employees](employee_code, full_name, employment_status, employment_type, source_system, source_employee_id)
          VALUES (@employee_code, @full_name, @employment_status, @employment_type, N'Sage 300 People Payroll', @source_employee_id);
          SET @employee_id = CONVERT(bigint, SCOPE_IDENTITY());
          SET @was_insert = 1;
        END
        ELSE
        BEGIN
          UPDATE [hris].[Employees]
          SET full_name = @full_name,
              employment_status = @employment_status,
              employment_type = @employment_type,
              source_system = N'Sage 300 People Payroll',
              source_employee_id = @source_employee_id,
              is_deleted = 0,
              deleted_at = NULL,
              deleted_by = NULL,
              modified_at = SYSUTCDATETIME(),
              modified_by = SUSER_SNAME()
          WHERE employee_id = @employee_id;
        END;

        MERGE [hris].[EmployeePersonalInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          title = @title,
          first_name = @first_name,
          middle_name = @middle_name,
          last_name = @last_name,
          preferred_name = @preferred_name,
          gender = @gender,
          date_of_birth = @date_of_birth,
          marital_status = @marital_status,
          nationality = @nationality,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, title, first_name, middle_name, last_name, preferred_name, gender, date_of_birth, marital_status, nationality
        )
        VALUES (
          @employee_id, @title, @first_name, @middle_name, @last_name, @preferred_name, @gender, @date_of_birth, @marital_status, @nationality
        );

        MERGE [hris].[EmployeeContactInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          official_email = CASE WHEN @official_email IS NOT NULL AND EXISTS (SELECT 1 FROM [hris].[EmployeeContactInfo] c WHERE c.official_email = @official_email AND c.employee_id <> @employee_id) THEN target.official_email ELSE @official_email END,
          primary_phone = @primary_phone,
          alternate_phone = @alternate_phone,
          office_extension = @office_extension,
          residential_address = @residential_address,
          permanent_address = @permanent_address,
          city = @city,
          state = @state,
          country = @country,
          postal_code = @postal_code,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, official_email, primary_phone, alternate_phone, office_extension, residential_address, permanent_address, city, state, country, postal_code
        )
        VALUES (
          @employee_id,
          CASE WHEN @official_email IS NOT NULL AND EXISTS (SELECT 1 FROM [hris].[EmployeeContactInfo] c WHERE c.official_email = @official_email) THEN NULL ELSE @official_email END,
          @primary_phone,
          @alternate_phone,
          @office_extension,
          @residential_address,
          @permanent_address,
          @city,
          @state,
          @country,
          @postal_code
        );

        MERGE [hris].[EmployeeEmploymentInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          staff_category = @employee_type_name,
          employee_category = @employee_type_name,
          date_joined = @date_joined,
          probation_end_date = @probation_end_date,
          contract_start_date = @contract_start_date,
          contract_end_date = @contract_end_date,
          work_location = @work_location,
          expatriate_status = @expatriate_status,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, staff_category, employee_category, date_joined, probation_end_date, contract_start_date, contract_end_date, work_location, expatriate_status
        ) VALUES (
          @employee_id, @employee_type_name, @employee_type_name, @date_joined, @probation_end_date, @contract_start_date, @contract_end_date, @work_location, @expatriate_status
        );

        MERGE [hris].[EmployeeJobInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          job_title = @job_title,
          designation = @designation,
          job_grade = @job_grade,
          department = @department,
          division = @department_code,
          business_unit = @company_code,
          cost_center = @department_code,
          project_site = @site_code,
          office_location = @site_name,
          reporting_manager = @manager_name,
          role_profile = @employee_type_name,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, job_title, designation, job_grade, department, division, business_unit, cost_center, project_site, office_location, reporting_manager, role_profile
        ) VALUES (
          @employee_id, @job_title, @designation, @job_grade, @department, @department_code, @company_code, @department_code, @site_code, @site_name, @manager_name, @employee_type_name
        );

        MERGE [hris].[EmployeePayrollSetup] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          payroll_group = @company_code,
          salary_grade = @job_grade,
          basic_salary = @period_salary,
          pay_frequency = @payment_run,
          bank_name = @bank_name,
          account_number = @account_number,
          account_name = @account_name,
          tax_identification_number = @tax_no,
          pay_currency = @company_currency,
          payment_type = @payment_type,
          payment_run = @payment_run,
          remuneration_structure = @remuneration_definition,
          annual_salary = @annual_salary,
          period_salary = @period_salary,
          rate_per_hour = @rate_per_hour,
          rate_per_day = @rate_per_day,
          hours_per_day = @hours_per_day,
          hours_per_period = @hours_per_period,
          setup_assigned_to_payroll = 1,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, payroll_group, salary_grade, basic_salary, pay_frequency, bank_name, account_number, account_name,
          tax_identification_number, pay_currency, payment_type, payment_run, remuneration_structure, annual_salary,
          period_salary, rate_per_hour, rate_per_day, hours_per_day, hours_per_period, setup_assigned_to_payroll
        )
        VALUES (
          @employee_id, @company_code, @job_grade, @period_salary, @payment_run, @bank_name, @account_number, @account_name,
          @tax_no, @company_currency, @payment_type, @payment_run, @remuneration_definition, @annual_salary,
          @period_salary, @rate_per_hour, @rate_per_day, @hours_per_day, @hours_per_period, 1
        );

        MERGE [hris].[EmployeeSourceRecords] AS target
        USING (SELECT N'Sage 300 People Payroll' AS source_system, @source_employee_id AS source_employee_id) AS source
        ON target.source_system = source.source_system
        AND target.source_employee_id = source.source_employee_id
        WHEN MATCHED THEN UPDATE SET
          employee_id = @employee_id,
          source_employee_code = @source_employee_code,
          source_entity_code = @source_entity_code,
          source_company_code = @company_code,
          source_company_currency = @company_currency,
          source_pay_run = @payment_run,
          source_remuneration_definition = @remuneration_definition,
          source_status_code = @source_status_code,
          source_status_name = @source_status_name,
          raw_payload_json = @raw_payload_json,
          imported_at = SYSUTCDATETIME(),
          imported_by = SUSER_SNAME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, source_system, source_employee_id, source_employee_code, source_entity_code, source_company_code,
          source_company_currency, source_pay_run, source_remuneration_definition, source_status_code, source_status_name, raw_payload_json
        ) VALUES (
          @employee_id, N'Sage 300 People Payroll', @source_employee_id, @source_employee_code, @source_entity_code, @company_code,
          @company_currency, @payment_run, @remuneration_definition, @source_status_code, @source_status_name, @raw_payload_json
        );

        DECLARE @employee_source_record_id bigint;
        SELECT @employee_source_record_id = employee_source_record_id
        FROM [hris].[EmployeeSourceRecords]
        WHERE source_system = N'Sage 300 People Payroll'
          AND source_employee_id = @source_employee_id;

        MERGE [hris].[EmployeeSourceFieldValues] AS target
        USING (
          SELECT
            @employee_source_record_id AS employee_source_record_id,
            N'Sage 300 People Payroll' AS source_system,
            @source_employee_id AS source_employee_id,
            JSON_VALUE([value], '$.sourceTable') AS source_table,
            JSON_VALUE([value], '$.columnName') AS source_column_name,
            JSON_VALUE([value], '$.value') AS source_value
          FROM OPENJSON(@source_fields_json)
          WHERE JSON_VALUE([value], '$.sourceTable') IS NOT NULL
            AND JSON_VALUE([value], '$.columnName') IS NOT NULL
        ) AS source
        ON target.employee_source_record_id = source.employee_source_record_id
        AND target.source_table = source.source_table
        AND target.source_column_name = source.source_column_name
        WHEN MATCHED THEN UPDATE SET
          source_value = source.source_value,
          imported_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_source_record_id, source_system, source_employee_id, source_table, source_column_name, source_value
        ) VALUES (
          source.employee_source_record_id, source.source_system, source.source_employee_id, source.source_table, source.source_column_name, source.source_value
        );

        INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by, reason)
        VALUES (@employee_id, N'Sage payroll employee import', SUSER_SNAME(), N'Imported/upserted from Sage 300 People Payroll');

        SELECT @employee_id AS employee_id, @was_insert AS was_insert;
      `);

      await tx.commit();
      if (result.recordset[0]?.was_insert) inserted++;
      else updated++;
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      failures.push({
        employeeId: String(employee.employeeId || ''),
        employeeCode,
        error: error instanceof Error ? error.message : 'Unknown import error',
      });
    }
  }

  return {
    sourceCount: employees.length,
    inserted,
    updated,
    failed: failures.length,
    failures: failures.slice(0, 50),
  };
};

const employeeTypeCode = (employeeType: string) => {
  switch (employeeType.trim().toLowerCase()) {
    case 'permanent':
      return 'P';
    case 'lumpsum':
      return 'L';
    case 'daily rate':
      return 'C';
    default:
      return null;
  }
};

export const previewNextEmployeeCodeFromDb = async (employeeType: string) => {
  const code = employeeTypeCode(employeeType);
  if (!code) return null;
  const p = await pool();
  if (!p) return null;
  const rs = await p
    .request()
    .input('type_code', sql.Char(1), code)
    .query(`
      SELECT
        ISNULL((
          SELECT MAX(TRY_CONVERT(int, SUBSTRING(employee_code, 2, 20)))
          FROM [hris].[Employees]
          WHERE is_deleted = 0
            AND employee_code LIKE @type_code + '[0-9][0-9][0-9][0-9]%'
            AND TRY_CONVERT(int, SUBSTRING(employee_code, 2, 20)) IS NOT NULL
        ), 0) AS latest_employee,
        ISNULL((
          SELECT last_sequence
          FROM [hris].[EmployeeCodeCounters]
          WHERE employee_type_code = @type_code
        ), 0) AS latest_counter;
    `);
  const row = rs.recordset[0];
  const next = Math.max(Number(row?.latest_employee || 0), Number(row?.latest_counter || 0)) + 1;
  return `${code}${String(next).padStart(4, '0')}`;
};

export const nextEmployeeCodeFromDb = async (employeeType: string) => {
  const p = await pool();
  if (!p) return null;
  const request = p.request();
  request.input('EmployeeTypeName', sql.NVarChar(40), employeeType);
  request.output('EmployeeCode', sql.NVarChar(50));
  const rs = await request.execute('[hris].[usp_AllocateEmployeeCode]');
  return String(rs.output.EmployeeCode || '');
};

export const createEmployeeFromDraftInDb = async (draftId: string, employeeCode: string, draft: any, role: string, startOnboarding: boolean) => {
  const p = await pool();
  if (!p) return false;
  const personal = draft.personal || {};
  const contact = draft.contact || {};
  const employment = draft.employment || {};
  const job = draft.job || {};
  const payroll = draft.payroll || {};
  const fullName = `${str(personal.firstName)} ${str(personal.lastName)}`.trim() || employeeCode;

  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    const employeeRs = await new sql.Request(tx)
      .input('employee_code', sql.NVarChar(50), employeeCode)
      .input('full_name', sql.NVarChar(250), fullName)
      .input('preferred_name', sql.NVarChar(150), nullable(personal.preferredName))
      .input('employment_status', sql.VarChar(40), nullable(employment.employmentStatus) || 'Active')
      .input('employment_type', sql.VarChar(40), nullable(employment.employmentType) || 'Permanent')
      .input('source_draft_id', sql.NVarChar(40), draftId)
      .query(`
        INSERT [hris].[Employees](employee_code, full_name, preferred_name, employment_status, employment_type, source_draft_id)
        OUTPUT INSERTED.employee_id
        VALUES (@employee_code, @full_name, @preferred_name, @employment_status, @employment_type, @source_draft_id);
      `);
    const employeeId = employeeRs.recordset[0].employee_id as number;

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('title', sql.NVarChar(30), nullable(personal.title))
      .input('first_name', sql.NVarChar(100), nullable(personal.firstName) || fullName)
      .input('middle_name', sql.NVarChar(100), nullable(personal.middleName))
      .input('last_name', sql.NVarChar(100), nullable(personal.lastName) || fullName)
      .input('preferred_name', sql.NVarChar(150), nullable(personal.preferredName))
      .input('gender', sql.NVarChar(40), nullable(personal.gender))
      .input('date_of_birth', sql.Date, dateOrNull(personal.dateOfBirth))
      .input('marital_status', sql.NVarChar(50), nullable(personal.maritalStatus))
      .input('nationality', sql.NVarChar(100), nullable(personal.nationality))
      .input('state_of_origin', sql.NVarChar(100), nullable(personal.stateOfOrigin))
      .input('local_government_area', sql.NVarChar(120), nullable(personal.localGovernmentArea))
      .input('religion', sql.NVarChar(80), nullable(personal.religion))
      .input('languages_spoken', sql.NVarChar(500), nullable(personal.languagesSpoken))
      .input('photo_file_name', sql.NVarChar(260), nullable(personal.photoFileName))
      .input('photo_mime_type', sql.NVarChar(120), nullable(personal.photoMimeType))
      .input('photo_size_bytes', sql.BigInt, numOrNull(personal.photoSizeBytes))
      .query(`
        INSERT [hris].[EmployeePersonalInfo](
          employee_id, title, first_name, middle_name, last_name, preferred_name, gender, date_of_birth, marital_status,
          nationality, state_of_origin, local_government_area, religion, languages_spoken, photo_file_name, photo_mime_type, photo_size_bytes
        ) VALUES (
          @employee_id, @title, @first_name, @middle_name, @last_name, @preferred_name, @gender, @date_of_birth, @marital_status,
          @nationality, @state_of_origin, @local_government_area, @religion, @languages_spoken, @photo_file_name, @photo_mime_type, @photo_size_bytes
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('official_email', sql.NVarChar(320), nullable(contact.officialEmail))
      .input('personal_email', sql.NVarChar(320), nullable(contact.personalEmail))
      .input('primary_phone', sql.NVarChar(50), nullable(contact.primaryPhone))
      .input('alternate_phone', sql.NVarChar(50), nullable(contact.alternatePhone))
      .input('office_extension', sql.NVarChar(30), nullable(contact.officeExtension))
      .input('residential_address', sql.NVarChar(1000), nullable(contact.residentialAddress))
      .input('permanent_address', sql.NVarChar(1000), nullable(contact.permanentAddress))
      .input('nearest_bus_stop', sql.NVarChar(250), nullable(contact.nearestBusStop))
      .input('city', sql.NVarChar(120), nullable(contact.city))
      .input('state', sql.NVarChar(120), nullable(contact.state))
      .input('country', sql.NVarChar(120), nullable(contact.country))
      .input('postal_code', sql.NVarChar(30), nullable(contact.postalCode))
      .query(`
        INSERT [hris].[EmployeeContactInfo](
          employee_id, official_email, personal_email, primary_phone, alternate_phone, office_extension, residential_address,
          permanent_address, nearest_bus_stop, city, state, country, postal_code
        ) VALUES (
          @employee_id, @official_email, @personal_email, @primary_phone, @alternate_phone, @office_extension, @residential_address,
          @permanent_address, @nearest_bus_stop, @city, @state, @country, @postal_code
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('staff_category', sql.NVarChar(100), nullable(employment.staffCategory))
      .input('employee_category', sql.NVarChar(100), nullable(employment.employeeCategory))
      .input('date_joined', sql.Date, dateOrNull(employment.dateJoined))
      .input('probation_start_date', sql.Date, dateOrNull(employment.probationStartDate))
      .input('probation_end_date', sql.Date, dateOrNull(employment.probationEndDate))
      .input('confirmation_due_date', sql.Date, dateOrNull(employment.confirmationDueDate))
      .input('contract_start_date', sql.Date, dateOrNull(employment.contractStartDate))
      .input('contract_end_date', sql.Date, dateOrNull(employment.contractEndDate))
      .input('work_mode', sql.NVarChar(50), nullable(employment.workMode))
      .input('work_location', sql.NVarChar(150), nullable(employment.workLocation))
      .input('shift_pattern', sql.NVarChar(80), nullable(employment.shiftPattern))
      .input('union_status', sql.NVarChar(80), nullable(employment.unionStatus))
      .input('expatriate_status', sql.NVarChar(80), nullable(employment.expatriateStatus))
      .input('onboarding_scheduled', sql.Bit, boolVal(employment.onboardingScheduled))
      .query(`
        INSERT [hris].[EmployeeEmploymentInfo](
          employee_id, staff_category, employee_category, date_joined, probation_start_date, probation_end_date,
          confirmation_due_date, contract_start_date, contract_end_date, work_mode, work_location, shift_pattern,
          union_status, expatriate_status, onboarding_scheduled
        ) VALUES (
          @employee_id, @staff_category, @employee_category, @date_joined, @probation_start_date, @probation_end_date,
          @confirmation_due_date, @contract_start_date, @contract_end_date, @work_mode, @work_location, @shift_pattern,
          @union_status, @expatriate_status, @onboarding_scheduled
        );
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('job_title', sql.NVarChar(150), nullable(job.jobTitle))
      .input('designation', sql.NVarChar(150), nullable(job.designation))
      .input('job_grade', sql.NVarChar(80), nullable(job.jobGrade))
      .input('department', sql.NVarChar(150), nullable(job.department))
      .input('division', sql.NVarChar(150), nullable(job.division))
      .input('business_unit', sql.NVarChar(150), nullable(job.businessUnit))
      .input('cost_center', sql.NVarChar(80), nullable(job.costCenter))
      .input('project_site', sql.NVarChar(150), nullable(job.projectSite))
      .input('office_location', sql.NVarChar(150), nullable(job.officeLocation))
      .input('reporting_manager', sql.NVarChar(250), nullable(job.reportingManager))
      .input('functional_manager', sql.NVarChar(250), nullable(job.functionalManager))
      .input('department_head', sql.NVarChar(250), nullable(job.departmentHead))
      .input('hr_business_partner', sql.NVarChar(250), nullable(job.hrBusinessPartner))
      .input('role_profile', sql.NVarChar(150), nullable(job.roleProfile))
      .input('job_description', sql.NVarChar(sql.MAX), nullable(job.jobDescription))
      .input('key_responsibilities', sql.NVarChar(sql.MAX), nullable(job.keyResponsibilities))
      .input('is_people_manager', sql.Bit, boolVal(job.isPeopleManager))
      .input('is_budget_owner', sql.Bit, boolVal(job.isBudgetOwner))
      .query(`
        INSERT [hris].[EmployeeJobInfo](
          employee_id, job_title, designation, job_grade, department, division, business_unit, cost_center, project_site,
          office_location, reporting_manager, functional_manager, department_head, hr_business_partner, role_profile,
          job_description, key_responsibilities, is_people_manager, is_budget_owner
        ) VALUES (
          @employee_id, @job_title, @designation, @job_grade, @department, @division, @business_unit, @cost_center, @project_site,
          @office_location, @reporting_manager, @functional_manager, @department_head, @hr_business_partner, @role_profile,
          @job_description, @key_responsibilities, @is_people_manager, @is_budget_owner
        );
      `);

    for (const ec of draft.emergencyContacts || []) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('external_contact_id', sql.NVarChar(80), nullable(ec.id))
        .input('full_name', sql.NVarChar(250), nullable(ec.fullName) || 'Emergency Contact')
        .input('relationship', sql.NVarChar(100), nullable(ec.relationship) || 'Other')
        .input('phone_number', sql.NVarChar(50), nullable(ec.phoneNumber) || 'N/A')
        .input('alternate_phone', sql.NVarChar(50), nullable(ec.alternatePhone))
        .input('email', sql.NVarChar(320), nullable(ec.email))
        .input('address', sql.NVarChar(1000), nullable(ec.address))
        .input('is_primary', sql.Bit, boolVal(ec.isPrimary))
        .input('is_next_of_kin', sql.Bit, boolVal(ec.isNextOfKin))
        .input('is_beneficiary', sql.Bit, boolVal(ec.isBeneficiary))
        .query(`
          INSERT [hris].[EmployeeEmergencyContacts](
            employee_id, external_contact_id, full_name, relationship, phone_number, alternate_phone, email, address,
            is_primary, is_next_of_kin, is_beneficiary
          ) VALUES (
            @employee_id, @external_contact_id, @full_name, @relationship, @phone_number, @alternate_phone, @email, @address,
            @is_primary, @is_next_of_kin, @is_beneficiary
          );
        `);
    }

    for (const doc of draft.documents || []) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('draft_id', sql.NVarChar(40), draftId)
        .input('external_document_id', sql.NVarChar(80), nullable(doc.id))
        .input('document_category', sql.NVarChar(120), nullable(doc.category) || 'Document')
        .input('file_name', sql.NVarChar(260), nullable(doc.fileName) || 'file')
        .input('mime_type', sql.NVarChar(120), nullable(doc.mimeType) || 'application/octet-stream')
        .input('size_bytes', sql.BigInt, numOrNull(doc.sizeBytes) || 0)
        .input('expires_at', sql.Date, dateOrNull(doc.expiresAt))
        .input('document_status', sql.VarChar(30), nullable(doc.status) || 'Uploaded')
        .query(`
          INSERT [hris].[EmployeeDocuments](
            employee_id, draft_id, external_document_id, document_category, file_name, mime_type, size_bytes, expires_at, document_status
          ) VALUES (
            @employee_id, @draft_id, @external_document_id, @document_category, @file_name, @mime_type, @size_bytes, @expires_at, @document_status
          );
        `);
    }

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('payroll_group', sql.NVarChar(100), nullable(payroll.payrollGroup))
      .input('salary_grade', sql.NVarChar(80), nullable(payroll.salaryGrade))
      .input('basic_salary', sql.Decimal(19, 4), numOrNull(payroll.basicSalary))
      .input('pay_frequency', sql.NVarChar(50), nullable(payroll.payFrequency))
      .input('bank_name', sql.NVarChar(150), nullable(payroll.bankName))
      .input('account_number', sql.NVarChar(50), nullable(payroll.accountNumber))
      .input('account_name', sql.NVarChar(250), nullable(payroll.accountName))
      .input('pension_provider', sql.NVarChar(150), nullable(payroll.pensionProvider))
      .input('pension_pin', sql.NVarChar(80), nullable(payroll.pensionPin))
      .input('tax_identification_number', sql.NVarChar(80), nullable(payroll.taxIdentificationNumber))
      .input('benefit_group', sql.NVarChar(120), nullable(payroll.benefitGroup))
      .input('setup_assigned_to_payroll', sql.Bit, boolVal(payroll.setupAssignedToPayroll))
      .query(`
        INSERT [hris].[EmployeePayrollSetup](
          employee_id, payroll_group, salary_grade, basic_salary, pay_frequency, bank_name, account_number, account_name,
          pension_provider, pension_pin, tax_identification_number, benefit_group, setup_assigned_to_payroll
        ) VALUES (
          @employee_id, @payroll_group, @salary_grade, @basic_salary, @pay_frequency, @bank_name, @account_number, @account_name,
          @pension_provider, @pension_pin, @tax_identification_number, @benefit_group, @setup_assigned_to_payroll
        );
      `);

    for (const item of draft.onboardingChecklist || []) {
      await new sql.Request(tx)
        .input('employee_id', sql.BigInt, employeeId)
        .input('draft_id', sql.NVarChar(40), draftId)
        .input('external_checklist_id', sql.NVarChar(80), nullable(item.id))
        .input('title', sql.NVarChar(250), nullable(item.title) || 'Onboarding task')
        .input('checklist_status', sql.VarChar(30), nullable(item.status) || 'Pending')
        .input('responsible_officer', sql.NVarChar(150), nullable(item.responsibleOfficer))
        .input('due_date', sql.Date, dateOrNull(item.dueDate))
        .input('notes', sql.NVarChar(1000), nullable(item.notes))
        .query(`
          INSERT [hris].[EmployeeOnboardingChecklist](
            employee_id, draft_id, external_checklist_id, title, checklist_status, responsible_officer, due_date, notes
          ) VALUES (
            @employee_id, @draft_id, @external_checklist_id, @title, @checklist_status, @responsible_officer, @due_date, @notes
          );
        `);
    }

    await new sql.Request(tx)
      .input('draft_id', sql.NVarChar(40), draftId)
      .input('employee_code', sql.NVarChar(50), employeeCode)
      .query(`
        UPDATE [hris].[EmployeeDrafts]
        SET draft_status = 'created',
            created_employee_code = @employee_code,
            modified_at = SYSUTCDATETIME(),
            modified_by = SUSER_SNAME()
        WHERE draft_id = @draft_id;
      `);

    await new sql.Request(tx)
      .input('employee_id', sql.BigInt, employeeId)
      .input('audit_action', sql.NVarChar(150), startOnboarding ? 'Employee created and onboarding started' : 'Employee created')
      .input('performed_by', sql.NVarChar(128), role)
      .query(`
        INSERT [hris].[EmployeeAuditLog](employee_id, audit_action, performed_by)
        VALUES (@employee_id, @audit_action, @performed_by);
      `);

    await tx.commit();
    return true;
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  }
};
