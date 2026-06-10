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
  const row = rs.recordsets[0]?.[0];
  if (!row) return null;
  return {
    draftId: row.draft_id,
    status: row.draft_status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    draft: JSON.parse(row.draft_payload_json),
    audit: (rs.recordsets[1] || []).map((x: any) => ({
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
  return [
    ...(rs.recordsets[0] || []).map((x: any) => ({ employeeId: x.employeeId, reason: x.reason })),
    ...(rs.recordsets[1] || []).map((x: any) => ({ draftId: x.draftId, reason: x.reason })),
  ];
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
