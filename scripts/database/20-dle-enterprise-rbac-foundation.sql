/*
  DLE_Enterprise RBAC foundation.
  Creates role-management structure only. No application users or user-role mappings.
  Safe to rerun.
*/

USE [DLE_Enterprise];
GO

IF SCHEMA_ID(N'security') IS NULL
  EXEC(N'CREATE SCHEMA [security]');
GO

IF OBJECT_ID(N'[security].[RoleCategories]', N'U') IS NULL
BEGIN
  CREATE TABLE [security].[RoleCategories] (
    role_category_id int IDENTITY(1,1) NOT NULL,
    category_code nvarchar(50) NOT NULL,
    category_name nvarchar(100) NOT NULL,
    description nvarchar(500) NULL,
    sort_order int NOT NULL CONSTRAINT DF_RoleCategories_sort_order DEFAULT (100),
    is_active bit NOT NULL CONSTRAINT DF_RoleCategories_is_active DEFAULT (1),
    created_at datetime2(0) NOT NULL CONSTRAINT DF_RoleCategories_created_at DEFAULT SYSUTCDATETIME(),
    created_by sysname NOT NULL CONSTRAINT DF_RoleCategories_created_by DEFAULT SUSER_SNAME(),
    modified_at datetime2(0) NULL,
    modified_by sysname NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_RoleCategories PRIMARY KEY CLUSTERED (role_category_id),
    CONSTRAINT UQ_RoleCategories_category_code UNIQUE (category_code),
    CONSTRAINT UQ_RoleCategories_category_name UNIQUE (category_name),
    CONSTRAINT CK_RoleCategories_category_code_format CHECK (category_code = UPPER(category_code) AND category_code NOT LIKE N'%[^A-Z0-9_]%'),
    CONSTRAINT CK_RoleCategories_sort_order CHECK (sort_order BETWEEN 1 AND 9999)
  );
END;
GO

IF OBJECT_ID(N'[security].[Roles]', N'U') IS NULL
BEGIN
  CREATE TABLE [security].[Roles] (
    role_id bigint IDENTITY(1,1) NOT NULL,
    role_code nvarchar(80) NOT NULL,
    role_name nvarchar(150) NOT NULL,
    role_category_id int NOT NULL,
    description nvarchar(1000) NULL,
    role_status varchar(30) NOT NULL CONSTRAINT DF_Roles_role_status DEFAULT ('Active'),
    is_system_role bit NOT NULL CONSTRAINT DF_Roles_is_system_role DEFAULT (0),
    approval_level tinyint NOT NULL CONSTRAINT DF_Roles_approval_level DEFAULT (0),
    hierarchy_level int NOT NULL,
    is_deleted bit NOT NULL CONSTRAINT DF_Roles_is_deleted DEFAULT (0),
    deleted_at datetime2(0) NULL,
    deleted_by sysname NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_Roles_created_at DEFAULT SYSUTCDATETIME(),
    created_by sysname NOT NULL CONSTRAINT DF_Roles_created_by DEFAULT SUSER_SNAME(),
    modified_at datetime2(0) NULL,
    modified_by sysname NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_Roles PRIMARY KEY CLUSTERED (role_id),
    CONSTRAINT FK_Roles_RoleCategories FOREIGN KEY (role_category_id) REFERENCES [security].[RoleCategories](role_category_id),
    CONSTRAINT CK_Roles_role_code_format CHECK (role_code = UPPER(role_code) AND role_code NOT LIKE N'%[^A-Z0-9_]%'),
    CONSTRAINT CK_Roles_role_status CHECK (role_status IN ('Active', 'Inactive', 'Pending Approval', 'Retired')),
    CONSTRAINT CK_Roles_approval_level CHECK (approval_level BETWEEN 0 AND 10),
    CONSTRAINT CK_Roles_hierarchy_level CHECK (hierarchy_level BETWEEN 1 AND 100),
    CONSTRAINT CK_Roles_soft_delete CHECK ((is_deleted = 0 AND deleted_at IS NULL AND deleted_by IS NULL) OR (is_deleted = 1 AND deleted_at IS NOT NULL))
  );
END;
GO

IF OBJECT_ID(N'[security].[RoleHierarchy]', N'U') IS NULL
BEGIN
  CREATE TABLE [security].[RoleHierarchy] (
    role_hierarchy_id bigint IDENTITY(1,1) NOT NULL,
    parent_role_id bigint NOT NULL,
    child_role_id bigint NOT NULL,
    relationship_type varchar(30) NOT NULL CONSTRAINT DF_RoleHierarchy_relationship_type DEFAULT ('Inherits'),
    hierarchy_status varchar(20) NOT NULL CONSTRAINT DF_RoleHierarchy_status DEFAULT ('Active'),
    effective_from datetime2(0) NOT NULL CONSTRAINT DF_RoleHierarchy_effective_from DEFAULT SYSUTCDATETIME(),
    effective_to datetime2(0) NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_RoleHierarchy_created_at DEFAULT SYSUTCDATETIME(),
    created_by sysname NOT NULL CONSTRAINT DF_RoleHierarchy_created_by DEFAULT SUSER_SNAME(),
    modified_at datetime2(0) NULL,
    modified_by sysname NULL,
    row_version rowversion NOT NULL,
    CONSTRAINT PK_RoleHierarchy PRIMARY KEY CLUSTERED (role_hierarchy_id),
    CONSTRAINT FK_RoleHierarchy_parent FOREIGN KEY (parent_role_id) REFERENCES [security].[Roles](role_id),
    CONSTRAINT FK_RoleHierarchy_child FOREIGN KEY (child_role_id) REFERENCES [security].[Roles](role_id),
    CONSTRAINT UQ_RoleHierarchy_parent_child UNIQUE (parent_role_id, child_role_id),
    CONSTRAINT CK_RoleHierarchy_no_self CHECK (parent_role_id <> child_role_id),
    CONSTRAINT CK_RoleHierarchy_relationship_type CHECK (relationship_type IN ('Inherits', 'ReportsTo', 'ApprovesFor')),
    CONSTRAINT CK_RoleHierarchy_status CHECK (hierarchy_status IN ('Active', 'Inactive')),
    CONSTRAINT CK_RoleHierarchy_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
  );
END;
GO

IF OBJECT_ID(N'[security].[RoleAuditLog]', N'U') IS NULL
BEGIN
  CREATE TABLE [security].[RoleAuditLog] (
    role_audit_log_id bigint IDENTITY(1,1) NOT NULL,
    audit_at datetime2(0) NOT NULL CONSTRAINT DF_RoleAuditLog_audit_at DEFAULT SYSUTCDATETIME(),
    audit_action varchar(30) NOT NULL,
    role_id bigint NULL,
    role_code nvarchar(80) NULL,
    role_name nvarchar(150) NULL,
    category_code nvarchar(50) NULL,
    old_values nvarchar(max) NULL,
    new_values nvarchar(max) NULL,
    performed_by sysname NOT NULL CONSTRAINT DF_RoleAuditLog_performed_by DEFAULT SUSER_SNAME(),
    host_name sysname NULL CONSTRAINT DF_RoleAuditLog_host_name DEFAULT HOST_NAME(),
    app_name nvarchar(128) NULL CONSTRAINT DF_RoleAuditLog_app_name DEFAULT APP_NAME(),
    CONSTRAINT PK_RoleAuditLog PRIMARY KEY CLUSTERED (role_audit_log_id),
    CONSTRAINT FK_RoleAuditLog_role FOREIGN KEY (role_id) REFERENCES [security].[Roles](role_id),
    CONSTRAINT CK_RoleAuditLog_audit_action CHECK (audit_action IN ('INSERT', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'DELETE'))
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Roles_role_code_active' AND object_id = OBJECT_ID(N'[security].[Roles]'))
  CREATE UNIQUE INDEX UX_Roles_role_code_active ON [security].[Roles](role_code) WHERE is_deleted = 0;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Roles_role_name_category_active' AND object_id = OBJECT_ID(N'[security].[Roles]'))
  CREATE UNIQUE INDEX UX_Roles_role_name_category_active ON [security].[Roles](role_category_id, role_name) WHERE is_deleted = 0;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Roles_category_status_level' AND object_id = OBJECT_ID(N'[security].[Roles]'))
  CREATE INDEX IX_Roles_category_status_level ON [security].[Roles](role_category_id, role_status, hierarchy_level) INCLUDE (role_code, role_name, approval_level, is_system_role);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Roles_status_deleted' AND object_id = OBJECT_ID(N'[security].[Roles]'))
  CREATE INDEX IX_Roles_status_deleted ON [security].[Roles](role_status, is_deleted) INCLUDE (role_code, role_name);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RoleHierarchy_child' AND object_id = OBJECT_ID(N'[security].[RoleHierarchy]'))
  CREATE INDEX IX_RoleHierarchy_child ON [security].[RoleHierarchy](child_role_id, hierarchy_status) INCLUDE (parent_role_id, relationship_type);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_RoleAuditLog_role_time' AND object_id = OBJECT_ID(N'[security].[RoleAuditLog]'))
  CREATE INDEX IX_RoleAuditLog_role_time ON [security].[RoleAuditLog](role_id, audit_at DESC);
GO

CREATE OR ALTER TRIGGER [security].[trg_Roles_Audit]
ON [security].[Roles]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
  SET NOCOUNT ON;

  INSERT [security].[RoleAuditLog] (
    audit_action,
    role_id,
    role_code,
    role_name,
    category_code,
    old_values,
    new_values
  )
  SELECT
    CASE
      WHEN d.role_id IS NULL THEN 'INSERT'
      WHEN i.role_id IS NULL THEN 'DELETE'
      WHEN ISNULL(d.is_deleted, 0) = 0 AND ISNULL(i.is_deleted, 0) = 1 THEN 'SOFT_DELETE'
      WHEN ISNULL(d.is_deleted, 0) = 1 AND ISNULL(i.is_deleted, 0) = 0 THEN 'RESTORE'
      ELSE 'UPDATE'
    END,
    COALESCE(i.role_id, d.role_id),
    COALESCE(i.role_code, d.role_code),
    COALESCE(i.role_name, d.role_name),
    COALESCE(ic.category_code, dc.category_code),
    CASE WHEN d.role_id IS NULL THEN NULL ELSE (
      SELECT d.role_code, d.role_name, dc.category_code, d.description, d.role_status, d.is_system_role, d.approval_level, d.hierarchy_level, d.is_deleted
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ) END,
    CASE WHEN i.role_id IS NULL THEN NULL ELSE (
      SELECT i.role_code, i.role_name, ic.category_code, i.description, i.role_status, i.is_system_role, i.approval_level, i.hierarchy_level, i.is_deleted
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ) END
  FROM inserted i
  FULL OUTER JOIN deleted d ON d.role_id = i.role_id
  LEFT JOIN [security].[RoleCategories] ic ON ic.role_category_id = i.role_category_id
  LEFT JOIN [security].[RoleCategories] dc ON dc.role_category_id = d.role_category_id;
END;
GO

DECLARE @Categories TABLE (
  category_code nvarchar(50) NOT NULL,
  category_name nvarchar(100) NOT NULL,
  description nvarchar(500) NOT NULL,
  sort_order int NOT NULL
);

INSERT @Categories (category_code, category_name, description, sort_order)
VALUES
  (N'EXECUTIVE', N'Executive', N'Executive leadership roles with enterprise-wide authority.', 10),
  (N'MANAGEMENT', N'Management', N'Department and function management roles.', 20),
  (N'LEAD', N'Lead', N'Team and functional lead roles.', 30),
  (N'SUPERVISOR', N'Supervisor', N'Operational supervisor roles.', 40),
  (N'OPERATIONAL', N'Operational', N'Day-to-day operational business users.', 50),
  (N'SYSTEM_ADMINISTRATION', N'System Administration', N'Privileged technical and platform administration roles.', 60),
  (N'EXTERNAL', N'External', N'External party access roles.', 70),
  (N'EMPLOYEE', N'Employee', N'General employee self-service role.', 80);

MERGE [security].[RoleCategories] AS tgt
USING @Categories AS src
  ON tgt.category_code = src.category_code
WHEN MATCHED THEN
  UPDATE SET
    category_name = src.category_name,
    description = src.description,
    sort_order = src.sort_order,
    is_active = 1,
    modified_at = SYSUTCDATETIME(),
    modified_by = SUSER_SNAME()
WHEN NOT MATCHED BY TARGET THEN
  INSERT (category_code, category_name, description, sort_order)
  VALUES (src.category_code, src.category_name, src.description, src.sort_order);

DECLARE @Roles TABLE (
  role_code nvarchar(80) NOT NULL,
  role_name nvarchar(150) NOT NULL,
  category_code nvarchar(50) NOT NULL,
  description nvarchar(1000) NOT NULL,
  is_system_role bit NOT NULL,
  approval_level tinyint NOT NULL,
  hierarchy_level int NOT NULL
);

INSERT @Roles (role_code, role_name, category_code, description, is_system_role, approval_level, hierarchy_level)
VALUES
  (N'EXECUTIVE_MANAGEMENT', N'Executive Management', N'EXECUTIVE', N'Executive management group role for enterprise leadership oversight.', 0, 10, 10),
  (N'MD_CEO', N'MD/CEO', N'EXECUTIVE', N'Managing Director and Chief Executive Officer role.', 0, 10, 10),
  (N'CFO', N'CFO', N'EXECUTIVE', N'Chief Financial Officer role.', 0, 10, 10),
  (N'GM_OPERATIONS', N'GM Operations', N'EXECUTIVE', N'General Manager for operations.', 0, 9, 11),
  (N'GM_COMMERCIAL', N'GM Commercial', N'EXECUTIVE', N'General Manager for commercial operations.', 0, 9, 11),
  (N'GM_LEGAL', N'GM Legal', N'EXECUTIVE', N'General Manager for legal and compliance leadership.', 0, 9, 11),

  (N'HR_MANAGER', N'HR Manager', N'MANAGEMENT', N'Human resources management role.', 0, 7, 20),
  (N'FINANCE_MANAGER', N'Finance Manager', N'MANAGEMENT', N'Finance management role.', 0, 7, 20),
  (N'PROCUREMENT_MANAGER', N'Procurement Manager', N'MANAGEMENT', N'Procurement management role.', 0, 7, 20),
  (N'OPERATIONS_MANAGER', N'Operations Manager', N'MANAGEMENT', N'Operations management role.', 0, 7, 20),
  (N'PROJECT_MANAGER', N'Project Manager', N'MANAGEMENT', N'Project management role.', 0, 7, 20),
  (N'ENGINEERING_MANAGER', N'Engineering Manager', N'MANAGEMENT', N'Engineering management role.', 0, 7, 20),
  (N'HSE_MANAGER', N'HSE Manager', N'MANAGEMENT', N'Health, safety, and environment management role.', 0, 7, 20),
  (N'QUALITY_MANAGER', N'Quality Manager', N'MANAGEMENT', N'Quality management role.', 0, 7, 20),
  (N'ASSET_MANAGER', N'Asset Manager', N'MANAGEMENT', N'Asset management role.', 0, 7, 20),
  (N'IT_MANAGER', N'IT Manager', N'MANAGEMENT', N'Information technology management role.', 0, 7, 20),
  (N'FLEET_MANAGER', N'Fleet Manager', N'MANAGEMENT', N'Fleet management role.', 0, 7, 20),
  (N'SALES_MANAGER', N'Sales Manager', N'MANAGEMENT', N'Sales management role.', 0, 7, 20),
  (N'DOCUMENT_CONTROL_MANAGER', N'Document Control Manager', N'MANAGEMENT', N'Document control management role.', 0, 7, 20),

  (N'HR_LEAD', N'HR Lead', N'LEAD', N'Human resources lead role.', 0, 5, 30),
  (N'FINANCE_LEAD', N'Finance Lead', N'LEAD', N'Finance lead role.', 0, 5, 30),
  (N'PROCUREMENT_LEAD', N'Procurement Lead', N'LEAD', N'Procurement lead role.', 0, 5, 30),
  (N'OPERATIONS_LEAD', N'Operations Lead', N'LEAD', N'Operations lead role.', 0, 5, 30),
  (N'PROJECT_LEAD', N'Project Lead', N'LEAD', N'Project lead role.', 0, 5, 30),
  (N'ENGINEERING_LEAD', N'Engineering Lead', N'LEAD', N'Engineering lead role.', 0, 5, 30),
  (N'HSE_LEAD', N'HSE Lead', N'LEAD', N'Health, safety, and environment lead role.', 0, 5, 30),
  (N'QA_QC_LEAD', N'QA/QC Lead', N'LEAD', N'Quality assurance and quality control lead role.', 0, 5, 30),
  (N'MAINTENANCE_LEAD', N'Maintenance Lead', N'LEAD', N'Maintenance lead role.', 0, 5, 30),
  (N'INVENTORY_LEAD', N'Inventory Lead', N'LEAD', N'Inventory lead role.', 0, 5, 30),
  (N'FLEET_LEAD', N'Fleet Lead', N'LEAD', N'Fleet lead role.', 0, 5, 30),
  (N'SALES_LEAD', N'Sales Lead', N'LEAD', N'Sales lead role.', 0, 5, 30),
  (N'DOCUMENT_CONTROL_LEAD', N'Document Control Lead', N'LEAD', N'Document control lead role.', 0, 5, 30),

  (N'SITE_SUPERVISOR', N'Site Supervisor', N'SUPERVISOR', N'Site supervision role.', 0, 4, 40),
  (N'WORKSHOP_SUPERVISOR', N'Workshop Supervisor', N'SUPERVISOR', N'Workshop supervision role.', 0, 4, 40),
  (N'WAREHOUSE_SUPERVISOR', N'Warehouse Supervisor', N'SUPERVISOR', N'Warehouse supervision role.', 0, 4, 40),
  (N'FLEET_SUPERVISOR', N'Fleet Supervisor', N'SUPERVISOR', N'Fleet supervision role.', 0, 4, 40),
  (N'HSE_SUPERVISOR', N'HSE Supervisor', N'SUPERVISOR', N'Health, safety, and environment supervision role.', 0, 4, 40),
  (N'QA_QC_SUPERVISOR', N'QA/QC Supervisor', N'SUPERVISOR', N'Quality assurance and quality control supervision role.', 0, 4, 40),
  (N'MAINTENANCE_SUPERVISOR', N'Maintenance Supervisor', N'SUPERVISOR', N'Maintenance supervision role.', 0, 4, 40),
  (N'OPERATIONS_SUPERVISOR', N'Operations Supervisor', N'SUPERVISOR', N'Operations supervision role.', 0, 4, 40),
  (N'PROJECT_SUPERVISOR', N'Project Supervisor', N'SUPERVISOR', N'Project supervision role.', 0, 4, 40),

  (N'HR_OFFICER', N'HR Officer', N'OPERATIONAL', N'Human resources officer role.', 0, 2, 50),
  (N'RECRUITER', N'Recruiter', N'OPERATIONAL', N'Recruitment operations role.', 0, 2, 50),
  (N'ACCOUNTANT', N'Accountant', N'OPERATIONAL', N'Accounting operations role.', 0, 2, 50),
  (N'PAYROLL_OFFICER', N'Payroll Officer', N'OPERATIONAL', N'Payroll operations role.', 0, 2, 50),
  (N'ACCOUNTS_PAYABLE_OFFICER', N'Accounts Payable Officer', N'OPERATIONAL', N'Accounts payable operations role.', 0, 2, 50),
  (N'ACCOUNTS_RECEIVABLE_OFFICER', N'Accounts Receivable Officer', N'OPERATIONAL', N'Accounts receivable operations role.', 0, 2, 50),
  (N'PROCUREMENT_OFFICER', N'Procurement Officer', N'OPERATIONAL', N'Procurement operations role.', 0, 2, 50),
  (N'STOREKEEPER', N'Storekeeper', N'OPERATIONAL', N'Storekeeping operations role.', 0, 2, 50),
  (N'INVENTORY_CONTROLLER', N'Inventory Controller', N'OPERATIONAL', N'Inventory control operations role.', 0, 2, 50),
  (N'PROJECT_ENGINEER', N'Project Engineer', N'OPERATIONAL', N'Project engineering operations role.', 0, 2, 50),
  (N'DESIGN_ENGINEER', N'Design Engineer', N'OPERATIONAL', N'Design engineering operations role.', 0, 2, 50),
  (N'HSE_OFFICER', N'HSE Officer', N'OPERATIONAL', N'Health, safety, and environment officer role.', 0, 2, 50),
  (N'QA_QC_INSPECTOR', N'QA/QC Inspector', N'OPERATIONAL', N'Quality assurance and quality control inspection role.', 0, 2, 50),
  (N'MAINTENANCE_TECHNICIAN', N'Maintenance Technician', N'OPERATIONAL', N'Maintenance technician role.', 0, 2, 50),
  (N'DOCUMENT_CONTROLLER', N'Document Controller', N'OPERATIONAL', N'Document control operations role.', 0, 2, 50),
  (N'SALES_EXECUTIVE', N'Sales Executive', N'OPERATIONAL', N'Sales operations role.', 0, 2, 50),
  (N'CUSTOMER_SERVICE_OFFICER', N'Customer Service Officer', N'OPERATIONAL', N'Customer service operations role.', 0, 2, 50),
  (N'LOGISTICS_COORDINATOR', N'Logistics Coordinator', N'OPERATIONAL', N'Logistics coordination role.', 0, 2, 50),
  (N'DRIVER', N'Driver', N'OPERATIONAL', N'Driver role.', 0, 1, 55),
  (N'ADMINISTRATIVE_OFFICER', N'Administrative Officer', N'OPERATIONAL', N'Administrative operations role.', 0, 2, 50),

  (N'SUPER_ADMINISTRATOR', N'Super Administrator', N'SYSTEM_ADMINISTRATION', N'Highest privileged application administration role.', 1, 10, 5),
  (N'SYSTEM_ADMINISTRATOR', N'System Administrator', N'SYSTEM_ADMINISTRATION', N'Application system administration role.', 1, 9, 6),
  (N'SECURITY_ADMINISTRATOR', N'Security Administrator', N'SYSTEM_ADMINISTRATION', N'Security and access administration role.', 1, 9, 6),
  (N'DATABASE_ADMINISTRATOR_DBA', N'Database Administrator (DBA)', N'SYSTEM_ADMINISTRATION', N'Database administration role.', 1, 9, 6),
  (N'NETWORK_ADMINISTRATOR', N'Network Administrator', N'SYSTEM_ADMINISTRATION', N'Network administration role.', 1, 8, 7),
  (N'AI_ADMINISTRATOR', N'AI Administrator', N'SYSTEM_ADMINISTRATION', N'AI platform administration role.', 1, 8, 7),
  (N'HELPDESK_OFFICER', N'Helpdesk Officer', N'SYSTEM_ADMINISTRATION', N'Helpdesk support role.', 1, 3, 60),

  (N'VENDOR', N'Vendor', N'EXTERNAL', N'External vendor access role.', 0, 1, 80),
  (N'CLIENT', N'Client', N'EXTERNAL', N'External client access role.', 0, 1, 80),
  (N'CONTRACTOR', N'Contractor', N'EXTERNAL', N'External contractor access role.', 0, 1, 80),
  (N'CONSULTANT', N'Consultant', N'EXTERNAL', N'External consultant access role.', 0, 1, 80),

  (N'EMPLOYEE', N'Employee', N'EMPLOYEE', N'General employee self-service role.', 0, 0, 90);

MERGE [security].[Roles] AS tgt
USING (
  SELECT
    r.role_code,
    r.role_name,
    c.role_category_id,
    r.category_code,
    r.description,
    r.is_system_role,
    r.approval_level,
    r.hierarchy_level
  FROM @Roles r
  JOIN [security].[RoleCategories] c ON c.category_code = r.category_code
) AS src
  ON tgt.role_code = src.role_code
WHEN MATCHED THEN
  UPDATE SET
    role_name = src.role_name,
    role_category_id = src.role_category_id,
    description = src.description,
    role_status = 'Active',
    is_system_role = src.is_system_role,
    approval_level = src.approval_level,
    hierarchy_level = src.hierarchy_level,
    is_deleted = 0,
    deleted_at = NULL,
    deleted_by = NULL,
    modified_at = SYSUTCDATETIME(),
    modified_by = SUSER_SNAME()
WHEN NOT MATCHED BY TARGET THEN
  INSERT (role_code, role_name, role_category_id, description, role_status, is_system_role, approval_level, hierarchy_level)
  VALUES (src.role_code, src.role_name, src.role_category_id, src.description, 'Active', src.is_system_role, src.approval_level, src.hierarchy_level);
GO

CREATE OR ALTER VIEW [security].[ActiveRoles]
AS
SELECT
  r.role_id,
  r.role_code,
  r.role_name,
  c.category_code,
  c.category_name,
  r.description,
  r.role_status,
  r.is_system_role,
  r.approval_level,
  r.hierarchy_level,
  r.created_at,
  r.created_by,
  r.modified_at,
  r.modified_by
FROM [security].[Roles] r
JOIN [security].[RoleCategories] c ON c.role_category_id = r.role_category_id
WHERE r.is_deleted = 0
  AND r.role_status = 'Active'
  AND c.is_active = 1;
GO

CREATE OR ALTER PROCEDURE [security].[usp_SoftDeleteRole]
  @RoleCode nvarchar(80),
  @DeletedBy sysname = NULL
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE [security].[Roles]
  SET
    is_deleted = 1,
    deleted_at = SYSUTCDATETIME(),
    deleted_by = COALESCE(@DeletedBy, SUSER_SNAME()),
    role_status = 'Retired',
    modified_at = SYSUTCDATETIME(),
    modified_by = COALESCE(@DeletedBy, SUSER_SNAME())
  WHERE role_code = @RoleCode
    AND is_deleted = 0;
END;
GO
