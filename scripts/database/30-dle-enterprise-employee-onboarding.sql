/*
  DLE_Enterprise HRIS employee onboarding foundation.
  Creates durable entities used by the add-new-employee workflow.
  Safe to rerun.
*/

USE [DLE_Enterprise];
GO

IF SCHEMA_ID(N'hris') IS NULL
  EXEC(N'CREATE SCHEMA [hris]');
GO

IF OBJECT_ID(N'[hris].[EmployeeNumberSequence]', N'SO') IS NULL
  EXEC(N'CREATE SEQUENCE [hris].[EmployeeNumberSequence] AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 50');
GO

IF OBJECT_ID(N'[hris].[EmployeeCodeCounters]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeCodeCounters] (
    employee_type_code char(1) NOT NULL,
    employee_type_name nvarchar(40) NOT NULL,
    last_sequence int NOT NULL CONSTRAINT DF_EmployeeCodeCounters_last_sequence DEFAULT (0),
    modified_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeCodeCounters_modified_at DEFAULT SYSUTCDATETIME(),
    modified_by sysname NOT NULL CONSTRAINT DF_EmployeeCodeCounters_modified_by DEFAULT SUSER_SNAME(),
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeeCodeCounters PRIMARY KEY CLUSTERED (employee_type_code),
    CONSTRAINT UQ_EmployeeCodeCounters_type_name UNIQUE (employee_type_name),
    CONSTRAINT CK_EmployeeCodeCounters_type_code CHECK (employee_type_code IN ('P', 'L', 'C')),
    CONSTRAINT CK_EmployeeCodeCounters_last_sequence CHECK (last_sequence >= 0)
  );
END;
GO

MERGE [hris].[EmployeeCodeCounters] AS target
USING (VALUES
  ('P', N'Permanent'),
  ('L', N'Lumpsum'),
  ('C', N'Daily Rate')
) AS source(employee_type_code, employee_type_name)
ON target.employee_type_code = source.employee_type_code
WHEN MATCHED THEN UPDATE SET employee_type_name = source.employee_type_name
WHEN NOT MATCHED THEN INSERT (employee_type_code, employee_type_name) VALUES (source.employee_type_code, source.employee_type_name);
GO

IF OBJECT_ID(N'[hris].[EmployeeDrafts]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeDrafts] (
    draft_id nvarchar(40) NOT NULL,
    draft_status varchar(30) NOT NULL CONSTRAINT DF_EmployeeDrafts_status DEFAULT ('draft'),
    draft_payload_json nvarchar(max) NOT NULL,
    employee_code nvarchar(50) NULL,
    full_name nvarchar(250) NULL,
    official_email nvarchar(320) NULL,
    personal_email nvarchar(320) NULL,
    primary_phone nvarchar(50) NULL,
    date_of_birth date NULL,
    department nvarchar(150) NULL,
    job_title nvarchar(150) NULL,
    created_employee_code nvarchar(50) NULL,
    submitted_at datetime2(0) NULL,
    approved_at datetime2(0) NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeDrafts_created_at DEFAULT SYSUTCDATETIME(),
    created_by sysname NOT NULL CONSTRAINT DF_EmployeeDrafts_created_by DEFAULT SUSER_SNAME(),
    modified_at datetime2(0) NULL,
    modified_by sysname NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeeDrafts PRIMARY KEY CLUSTERED (draft_id),
    CONSTRAINT CK_EmployeeDrafts_status CHECK (draft_status IN ('draft', 'submitted', 'approved', 'created', 'cancelled')),
    CONSTRAINT CK_EmployeeDrafts_payload_json CHECK (ISJSON(draft_payload_json) = 1)
  );
END;
GO

IF OBJECT_ID(N'[hris].[Employees]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[Employees] (
    employee_id bigint IDENTITY(1,1) NOT NULL,
    employee_code nvarchar(50) NOT NULL,
    full_name nvarchar(250) NOT NULL,
    preferred_name nvarchar(150) NULL,
    employment_status varchar(40) NOT NULL CONSTRAINT DF_Employees_employment_status DEFAULT ('Active'),
    employment_type varchar(40) NOT NULL CONSTRAINT DF_Employees_employment_type DEFAULT ('Permanent'),
    source_system nvarchar(80) NOT NULL CONSTRAINT DF_Employees_source_system DEFAULT ('DLE_Enterprise'),
    source_employee_id nvarchar(80) NULL,
    source_draft_id nvarchar(40) NULL,
    is_deleted bit NOT NULL CONSTRAINT DF_Employees_is_deleted DEFAULT (0),
    deleted_at datetime2(0) NULL,
    deleted_by sysname NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_Employees_created_at DEFAULT SYSUTCDATETIME(),
    created_by sysname NOT NULL CONSTRAINT DF_Employees_created_by DEFAULT SUSER_SNAME(),
    modified_at datetime2(0) NULL,
    modified_by sysname NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_Employees PRIMARY KEY CLUSTERED (employee_id),
    CONSTRAINT UQ_Employees_employee_code UNIQUE (employee_code),
    CONSTRAINT FK_Employees_SourceDraft FOREIGN KEY (source_draft_id) REFERENCES [hris].[EmployeeDrafts](draft_id),
    CONSTRAINT CK_Employees_status CHECK (employment_status IN ('Active', 'On Leave', 'Probation', 'Confirmed', 'Suspended', 'Resigned', 'Terminated', 'Retired', 'Contract', 'Seconded', 'Field Assignment', 'Inactive')),
    CONSTRAINT CK_Employees_type CHECK (employment_type IN ('Permanent', 'Lumpsum', 'Daily Rate', 'Contract', 'Temporary', 'Intern', 'Consultant', 'Expatriate', 'Industrial Trainee', 'NYSC', 'Outsourced Staff')),
    CONSTRAINT CK_Employees_soft_delete CHECK ((is_deleted = 0 AND deleted_at IS NULL AND deleted_by IS NULL) OR (is_deleted = 1 AND deleted_at IS NOT NULL))
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeePersonalInfo]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeePersonalInfo] (
    employee_id bigint NOT NULL,
    title nvarchar(30) NULL,
    first_name nvarchar(100) NOT NULL,
    middle_name nvarchar(100) NULL,
    last_name nvarchar(100) NOT NULL,
    preferred_name nvarchar(150) NULL,
    gender nvarchar(40) NULL,
    date_of_birth date NULL,
    marital_status nvarchar(50) NULL,
    nationality nvarchar(100) NULL,
    state_of_origin nvarchar(100) NULL,
    local_government_area nvarchar(120) NULL,
    religion nvarchar(80) NULL,
    languages_spoken nvarchar(500) NULL,
    photo_file_name nvarchar(260) NULL,
    photo_mime_type nvarchar(120) NULL,
    photo_size_bytes bigint NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeePersonalInfo_created_at DEFAULT SYSUTCDATETIME(),
    modified_at datetime2(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeePersonalInfo PRIMARY KEY CLUSTERED (employee_id),
    CONSTRAINT FK_EmployeePersonalInfo_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id),
    CONSTRAINT CK_EmployeePersonalInfo_photo_size CHECK (photo_size_bytes IS NULL OR photo_size_bytes >= 0)
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeeContactInfo]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeContactInfo] (
    employee_id bigint NOT NULL,
    official_email nvarchar(320) NULL,
    personal_email nvarchar(320) NULL,
    primary_phone nvarchar(50) NULL,
    alternate_phone nvarchar(50) NULL,
    office_extension nvarchar(30) NULL,
    residential_address nvarchar(1000) NULL,
    permanent_address nvarchar(1000) NULL,
    nearest_bus_stop nvarchar(250) NULL,
    city nvarchar(120) NULL,
    state nvarchar(120) NULL,
    country nvarchar(120) NULL,
    postal_code nvarchar(30) NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeContactInfo_created_at DEFAULT SYSUTCDATETIME(),
    modified_at datetime2(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeeContactInfo PRIMARY KEY CLUSTERED (employee_id),
    CONSTRAINT FK_EmployeeContactInfo_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id)
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeeEmploymentInfo]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeEmploymentInfo] (
    employee_id bigint NOT NULL,
    staff_category nvarchar(100) NULL,
    employee_category nvarchar(100) NULL,
    date_joined date NULL,
    probation_start_date date NULL,
    probation_end_date date NULL,
    confirmation_due_date date NULL,
    contract_start_date date NULL,
    contract_end_date date NULL,
    work_mode nvarchar(50) NULL,
    work_location nvarchar(150) NULL,
    shift_pattern nvarchar(80) NULL,
    union_status nvarchar(80) NULL,
    expatriate_status nvarchar(80) NULL,
    onboarding_scheduled bit NOT NULL CONSTRAINT DF_EmployeeEmploymentInfo_onboarding_scheduled DEFAULT (0),
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeEmploymentInfo_created_at DEFAULT SYSUTCDATETIME(),
    modified_at datetime2(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeeEmploymentInfo PRIMARY KEY CLUSTERED (employee_id),
    CONSTRAINT FK_EmployeeEmploymentInfo_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id),
    CONSTRAINT CK_EmployeeEmploymentInfo_probation_dates CHECK (probation_start_date IS NULL OR probation_end_date IS NULL OR probation_end_date >= probation_start_date),
    CONSTRAINT CK_EmployeeEmploymentInfo_contract_dates CHECK (contract_start_date IS NULL OR contract_end_date IS NULL OR contract_end_date >= contract_start_date)
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeeJobInfo]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeJobInfo] (
    employee_id bigint NOT NULL,
    job_title nvarchar(150) NULL,
    designation nvarchar(150) NULL,
    job_grade nvarchar(80) NULL,
    department nvarchar(150) NULL,
    division nvarchar(150) NULL,
    business_unit nvarchar(150) NULL,
    cost_center nvarchar(80) NULL,
    project_site nvarchar(150) NULL,
    office_location nvarchar(150) NULL,
    reporting_manager nvarchar(250) NULL,
    functional_manager nvarchar(250) NULL,
    department_head nvarchar(250) NULL,
    hr_business_partner nvarchar(250) NULL,
    role_profile nvarchar(150) NULL,
    job_description nvarchar(max) NULL,
    key_responsibilities nvarchar(max) NULL,
    is_people_manager bit NOT NULL CONSTRAINT DF_EmployeeJobInfo_is_people_manager DEFAULT (0),
    is_budget_owner bit NOT NULL CONSTRAINT DF_EmployeeJobInfo_is_budget_owner DEFAULT (0),
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeJobInfo_created_at DEFAULT SYSUTCDATETIME(),
    modified_at datetime2(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeeJobInfo PRIMARY KEY CLUSTERED (employee_id),
    CONSTRAINT FK_EmployeeJobInfo_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id)
  );
END;
GO

IF EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'[hris].[Employees]')
    AND name = N'CK_Employees_type'
    AND definition NOT LIKE N'%Lumpsum%'
)
BEGIN
  ALTER TABLE [hris].[Employees] DROP CONSTRAINT CK_Employees_type;
  ALTER TABLE [hris].[Employees] WITH CHECK ADD CONSTRAINT CK_Employees_type CHECK (employment_type IN ('Permanent', 'Lumpsum', 'Daily Rate', 'Contract', 'Temporary', 'Intern', 'Consultant', 'Expatriate', 'Industrial Trainee', 'NYSC', 'Outsourced Staff'));
END;
GO

IF OBJECT_ID(N'[hris].[EmployeeEmergencyContacts]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeEmergencyContacts] (
    emergency_contact_id bigint IDENTITY(1,1) NOT NULL,
    employee_id bigint NOT NULL,
    external_contact_id nvarchar(80) NULL,
    full_name nvarchar(250) NOT NULL,
    relationship nvarchar(100) NOT NULL,
    phone_number nvarchar(50) NOT NULL,
    alternate_phone nvarchar(50) NULL,
    email nvarchar(320) NULL,
    address nvarchar(1000) NULL,
    is_primary bit NOT NULL CONSTRAINT DF_EmployeeEmergencyContacts_is_primary DEFAULT (0),
    is_next_of_kin bit NOT NULL CONSTRAINT DF_EmployeeEmergencyContacts_is_next_of_kin DEFAULT (0),
    is_beneficiary bit NOT NULL CONSTRAINT DF_EmployeeEmergencyContacts_is_beneficiary DEFAULT (0),
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeEmergencyContacts_created_at DEFAULT SYSUTCDATETIME(),
    modified_at datetime2(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeeEmergencyContacts PRIMARY KEY CLUSTERED (emergency_contact_id),
    CONSTRAINT FK_EmployeeEmergencyContacts_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id)
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeeDocuments]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeDocuments] (
    document_id bigint IDENTITY(1,1) NOT NULL,
    employee_id bigint NULL,
    draft_id nvarchar(40) NULL,
    external_document_id nvarchar(80) NULL,
    document_category nvarchar(120) NOT NULL,
    file_name nvarchar(260) NOT NULL,
    mime_type nvarchar(120) NOT NULL,
    size_bytes bigint NOT NULL CONSTRAINT DF_EmployeeDocuments_size_bytes DEFAULT (0),
    storage_provider nvarchar(80) NULL,
    storage_uri nvarchar(1000) NULL,
    expires_at date NULL,
    document_status varchar(30) NOT NULL CONSTRAINT DF_EmployeeDocuments_status DEFAULT ('Uploaded'),
    verified_at datetime2(0) NULL,
    verified_by sysname NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeDocuments_created_at DEFAULT SYSUTCDATETIME(),
    created_by sysname NOT NULL CONSTRAINT DF_EmployeeDocuments_created_by DEFAULT SUSER_SNAME(),
    modified_at datetime2(0) NULL,
    modified_by sysname NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeeDocuments PRIMARY KEY CLUSTERED (document_id),
    CONSTRAINT FK_EmployeeDocuments_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id),
    CONSTRAINT FK_EmployeeDocuments_Drafts FOREIGN KEY (draft_id) REFERENCES [hris].[EmployeeDrafts](draft_id),
    CONSTRAINT CK_EmployeeDocuments_owner CHECK (employee_id IS NOT NULL OR draft_id IS NOT NULL),
    CONSTRAINT CK_EmployeeDocuments_status CHECK (document_status IN ('Pending', 'Uploaded', 'Rejected', 'Verified', 'Expired')),
    CONSTRAINT CK_EmployeeDocuments_size CHECK (size_bytes >= 0)
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeePayrollSetup]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeePayrollSetup] (
    employee_id bigint NOT NULL,
    payroll_group nvarchar(100) NULL,
    salary_grade nvarchar(80) NULL,
    basic_salary decimal(19,4) NULL,
    pay_frequency nvarchar(50) NULL,
    bank_name nvarchar(150) NULL,
    account_number nvarchar(50) NULL,
    account_name nvarchar(250) NULL,
    pension_provider nvarchar(150) NULL,
    pension_pin nvarchar(80) NULL,
    tax_identification_number nvarchar(80) NULL,
    benefit_group nvarchar(120) NULL,
    setup_assigned_to_payroll bit NOT NULL CONSTRAINT DF_EmployeePayrollSetup_assigned DEFAULT (0),
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeePayrollSetup_created_at DEFAULT SYSUTCDATETIME(),
    modified_at datetime2(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeePayrollSetup PRIMARY KEY CLUSTERED (employee_id),
    CONSTRAINT FK_EmployeePayrollSetup_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id),
    CONSTRAINT CK_EmployeePayrollSetup_salary CHECK (basic_salary IS NULL OR basic_salary >= 0)
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeeOnboardingChecklist]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeOnboardingChecklist] (
    onboarding_checklist_id bigint IDENTITY(1,1) NOT NULL,
    employee_id bigint NULL,
    draft_id nvarchar(40) NULL,
    external_checklist_id nvarchar(80) NULL,
    title nvarchar(250) NOT NULL,
    checklist_status varchar(30) NOT NULL CONSTRAINT DF_EmployeeOnboardingChecklist_status DEFAULT ('Pending'),
    responsible_officer nvarchar(150) NULL,
    due_date date NULL,
    notes nvarchar(1000) NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeOnboardingChecklist_created_at DEFAULT SYSUTCDATETIME(),
    modified_at datetime2(0) NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_EmployeeOnboardingChecklist PRIMARY KEY CLUSTERED (onboarding_checklist_id),
    CONSTRAINT FK_EmployeeOnboardingChecklist_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id),
    CONSTRAINT FK_EmployeeOnboardingChecklist_Drafts FOREIGN KEY (draft_id) REFERENCES [hris].[EmployeeDrafts](draft_id),
    CONSTRAINT CK_EmployeeOnboardingChecklist_owner CHECK (employee_id IS NOT NULL OR draft_id IS NOT NULL),
    CONSTRAINT CK_EmployeeOnboardingChecklist_status CHECK (checklist_status IN ('Pending', 'In Progress', 'Done', 'Blocked'))
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeeDraftAuditLog]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeDraftAuditLog] (
    audit_id bigint IDENTITY(1,1) NOT NULL,
    draft_id nvarchar(40) NOT NULL,
    audit_action nvarchar(150) NOT NULL,
    performed_by sysname NOT NULL,
    reason nvarchar(1000) NULL,
    old_value nvarchar(max) NULL,
    new_value nvarchar(max) NULL,
    audit_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeDraftAuditLog_audit_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_EmployeeDraftAuditLog PRIMARY KEY CLUSTERED (audit_id),
    CONSTRAINT FK_EmployeeDraftAuditLog_Drafts FOREIGN KEY (draft_id) REFERENCES [hris].[EmployeeDrafts](draft_id)
  );
END;
GO

IF OBJECT_ID(N'[hris].[EmployeeAuditLog]', N'U') IS NULL
BEGIN
  CREATE TABLE [hris].[EmployeeAuditLog] (
    audit_id bigint IDENTITY(1,1) NOT NULL,
    employee_id bigint NOT NULL,
    audit_action nvarchar(150) NOT NULL,
    performed_by sysname NOT NULL,
    reason nvarchar(1000) NULL,
    old_value nvarchar(max) NULL,
    new_value nvarchar(max) NULL,
    audit_at datetime2(0) NOT NULL CONSTRAINT DF_EmployeeAuditLog_audit_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_EmployeeAuditLog PRIMARY KEY CLUSTERED (audit_id),
    CONSTRAINT FK_EmployeeAuditLog_Employees FOREIGN KEY (employee_id) REFERENCES [hris].[Employees](employee_id)
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[hris].[EmployeeDrafts]') AND name = N'IX_EmployeeDrafts_status_modified')
  CREATE INDEX IX_EmployeeDrafts_status_modified ON [hris].[EmployeeDrafts](draft_status, modified_at) INCLUDE (full_name, official_email, primary_phone);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[hris].[EmployeeDrafts]') AND name = N'IX_EmployeeDrafts_duplicate_lookup')
  CREATE INDEX IX_EmployeeDrafts_duplicate_lookup ON [hris].[EmployeeDrafts](official_email, primary_phone, full_name, date_of_birth) WHERE draft_status IN ('draft', 'submitted', 'approved');
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[hris].[Employees]') AND name = N'IX_Employees_active_status')
  CREATE INDEX IX_Employees_active_status ON [hris].[Employees](employment_status, employment_type) INCLUDE (employee_code, full_name) WHERE is_deleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[hris].[EmployeeContactInfo]') AND name = N'UX_EmployeeContactInfo_official_email')
  CREATE UNIQUE INDEX UX_EmployeeContactInfo_official_email ON [hris].[EmployeeContactInfo](official_email) WHERE official_email IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[hris].[EmployeeContactInfo]') AND name = N'IX_EmployeeContactInfo_phone')
  CREATE INDEX IX_EmployeeContactInfo_phone ON [hris].[EmployeeContactInfo](primary_phone) WHERE primary_phone IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[hris].[EmployeeEmergencyContacts]') AND name = N'UX_EmployeeEmergencyContacts_one_primary')
  CREATE UNIQUE INDEX UX_EmployeeEmergencyContacts_one_primary ON [hris].[EmployeeEmergencyContacts](employee_id) WHERE is_primary = 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'[hris].[EmployeeDocuments]') AND name = N'IX_EmployeeDocuments_owner_status')
  CREATE INDEX IX_EmployeeDocuments_owner_status ON [hris].[EmployeeDocuments](employee_id, draft_id, document_status);
GO

IF OBJECT_ID(N'[hris].[EmployeeMasterView]', N'V') IS NOT NULL
  DROP VIEW [hris].[EmployeeMasterView];
GO

CREATE VIEW [hris].[EmployeeMasterView]
AS
SELECT
  e.employee_id,
  e.employee_code,
  e.full_name,
  e.preferred_name,
  e.employment_status,
  e.employment_type,
  e.source_system,
  e.source_employee_id,
  e.source_draft_id,
  p.first_name,
  p.middle_name,
  p.last_name,
  p.gender,
  p.date_of_birth,
  c.official_email,
  c.personal_email,
  c.primary_phone,
  c.city,
  c.state,
  c.country,
  emp.date_joined,
  emp.work_mode,
  emp.work_location,
  j.job_title,
  j.designation,
  j.job_grade,
  j.department,
  j.division,
  j.business_unit,
  j.cost_center,
  j.project_site,
  j.reporting_manager,
  e.created_at,
  e.modified_at
FROM [hris].[Employees] e
LEFT JOIN [hris].[EmployeePersonalInfo] p ON p.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeContactInfo] c ON c.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeEmploymentInfo] emp ON emp.employee_id = e.employee_id
LEFT JOIN [hris].[EmployeeJobInfo] j ON j.employee_id = e.employee_id
WHERE e.is_deleted = 0;
GO

CREATE OR ALTER PROCEDURE [hris].[usp_AllocateEmployeeCode]
  @EmployeeTypeName nvarchar(40),
  @EmployeeCode nvarchar(50) OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @typeCode char(1);
  SET @typeCode =
    CASE UPPER(LTRIM(RTRIM(@EmployeeTypeName)))
      WHEN 'PERMANENT' THEN 'P'
      WHEN 'LUMPSUM' THEN 'L'
      WHEN 'DAILY RATE' THEN 'C'
      ELSE NULL
    END;

  IF @typeCode IS NULL
    THROW 51010, 'Employee Type must be Permanent, Lumpsum, or Daily Rate.', 1;

  BEGIN TRANSACTION;

  DECLARE @latestExisting int = 0;
  SELECT @latestExisting = ISNULL(MAX(TRY_CONVERT(int, SUBSTRING(employee_code, 2, 20))), 0)
  FROM [hris].[Employees] WITH (UPDLOCK, HOLDLOCK)
  WHERE is_deleted = 0
    AND employee_code LIKE @typeCode + '[0-9][0-9][0-9][0-9]%'
    AND TRY_CONVERT(int, SUBSTRING(employee_code, 2, 20)) IS NOT NULL;

  UPDATE [hris].[EmployeeCodeCounters] WITH (UPDLOCK, HOLDLOCK)
  SET last_sequence = CASE WHEN last_sequence < @latestExisting THEN @latestExisting + 1 ELSE last_sequence + 1 END,
      modified_at = SYSUTCDATETIME(),
      modified_by = SUSER_SNAME()
  WHERE employee_type_code = @typeCode;

  IF @@ROWCOUNT = 0
  BEGIN
    INSERT [hris].[EmployeeCodeCounters](employee_type_code, employee_type_name, last_sequence)
    VALUES (@typeCode, @EmployeeTypeName, @latestExisting + 1);
  END;

  SELECT @EmployeeCode = @typeCode + RIGHT('0000' + CONVERT(varchar(20), last_sequence), 4)
  FROM [hris].[EmployeeCodeCounters]
  WHERE employee_type_code = @typeCode;

  COMMIT TRANSACTION;
END;
GO
