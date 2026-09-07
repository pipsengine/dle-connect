/* DLE Connect - Cost Control Unit extension
   Target: Microsoft SQL Server / DLE_Enterprise
   Purpose: budget governance, CBS/cost codes, commitments, actual allocation, labour validation,
            forecasting, EVM, variations, cashflow and controlled period close.
*/
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name='pm') EXEC('CREATE SCHEMA pm');
GO

CREATE TABLE pm.CostBaselines(
 CostBaselineId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL,
 BaselineCode nvarchar(30) NOT NULL,
 VersionNo int NOT NULL,
 EffectiveDate date NOT NULL,
 OriginalBudget decimal(19,4) NOT NULL,
 ApprovedChanges decimal(19,4) NOT NULL DEFAULT 0,
 TransfersNet decimal(19,4) NOT NULL DEFAULT 0,
 CurrentBAC AS (OriginalBudget + ApprovedChanges + TransfersNet) PERSISTED,
 ContingencyBudget decimal(19,4) NOT NULL DEFAULT 0,
 Reason nvarchar(1000) NOT NULL,
 ApprovalReference nvarchar(100) NULL,
 Status nvarchar(30) NOT NULL DEFAULT 'Draft',
 SubmittedBy uniqueidentifier NULL, SubmittedAt datetime2(3) NULL,
 ApprovedBy uniqueidentifier NULL, ApprovedAt datetime2(3) NULL,
 LockedAt datetime2(3) NULL,
 CreatedBy uniqueidentifier NOT NULL, CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 RowVersion rowversion,
 CONSTRAINT FK_pm_CostBaseline_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT UX_pm_CostBaseline UNIQUE(ProjectId,VersionNo),
 CONSTRAINT CK_pm_CostBaseline_Status CHECK(Status IN ('Draft','Submitted','Approved','Superseded','Rejected'))
); GO

CREATE TABLE pm.CBS(
 CbsId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL,
 ParentCbsId uniqueidentifier NULL,
 ControlAccountId uniqueidentifier NULL,
 CbsCode nvarchar(60) NOT NULL,
 CbsName nvarchar(250) NOT NULL,
 LevelNo tinyint NOT NULL,
 BudgetOwnerEmployeeId uniqueidentifier NULL,
 IsControlAccount bit NOT NULL DEFAULT 0,
 IsActive bit NOT NULL DEFAULT 1,
 SortOrder int NOT NULL DEFAULT 0,
 CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT FK_pm_CBS_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT FK_pm_CBS_Parent FOREIGN KEY(ParentCbsId) REFERENCES pm.CBS(CbsId),
 CONSTRAINT FK_pm_CBS_ControlAccount FOREIGN KEY(ControlAccountId) REFERENCES pm.CostControlAccounts(ControlAccountId)
); GO
CREATE UNIQUE INDEX UX_pm_CBS_Code ON pm.CBS(ProjectId,CbsCode); GO

CREATE TABLE pm.CostCodes(
 CostCodeId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL,
 CbsId uniqueidentifier NOT NULL,
 CostCode nvarchar(60) NOT NULL,
 Description nvarchar(250) NOT NULL,
 CostType nvarchar(30) NOT NULL,
 Chargeability nvarchar(30) NOT NULL DEFAULT 'Chargeable',
 BudgetAmount decimal(19,4) NOT NULL DEFAULT 0,
 Currency char(3) NOT NULL DEFAULT 'NGN',
 IsActive bit NOT NULL DEFAULT 1,
 LockedAt datetime2(3) NULL,
 CreatedBy uniqueidentifier NOT NULL, CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 ModifiedBy uniqueidentifier NULL, ModifiedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 RowVersion rowversion,
 CONSTRAINT FK_pm_CostCode_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT FK_pm_CostCode_CBS FOREIGN KEY(CbsId) REFERENCES pm.CBS(CbsId),
 CONSTRAINT UX_pm_CostCode UNIQUE(ProjectId,CostCode),
 CONSTRAINT CK_pm_CostCode_Type CHECK(CostType IN ('Labour','Material','Equipment','Subcontract','Travel','Overhead','Other'))
); GO

CREATE TABLE pm.WbsCostCodeMap(
 WbsCostCodeMapId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, WbsId uniqueidentifier NOT NULL, CostCodeId uniqueidentifier NOT NULL,
 IsPrimary bit NOT NULL DEFAULT 0, EffectiveFrom date NULL, EffectiveTo date NULL,
 CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT FK_pm_WbsCostMap_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT FK_pm_WbsCostMap_WBS FOREIGN KEY(WbsId) REFERENCES pm.WBS(WbsId),
 CONSTRAINT FK_pm_WbsCostMap_CostCode FOREIGN KEY(CostCodeId) REFERENCES pm.CostCodes(CostCodeId)
); GO
CREATE UNIQUE INDEX UX_pm_WbsCostCodeMap ON pm.WbsCostCodeMap(ProjectId,WbsId,CostCodeId); GO

CREATE TABLE pm.Commitments(
 CommitmentId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, WbsId uniqueidentifier NULL, CostCodeId uniqueidentifier NOT NULL,
 CommitmentType nvarchar(30) NOT NULL, ReferenceNo nvarchar(80) NOT NULL,
 Description nvarchar(300) NOT NULL, VendorId uniqueidentifier NULL, VendorName nvarchar(200) NULL,
 OriginalValue decimal(19,4) NOT NULL DEFAULT 0, ApprovedVariationValue decimal(19,4) NOT NULL DEFAULT 0,
 CommittedValue AS (OriginalValue + ApprovedVariationValue) PERSISTED,
 InvoicedValue decimal(19,4) NOT NULL DEFAULT 0, Currency char(3) NOT NULL DEFAULT 'NGN',
 RequiredDate date NULL, BudgetCheckStatus nvarchar(30) NOT NULL DEFAULT 'Pending',
 BudgetCheckBy uniqueidentifier NULL, BudgetCheckAt datetime2(3) NULL, BudgetCheckComment nvarchar(1000) NULL,
 SourceSystem nvarchar(30) NOT NULL DEFAULT 'DLE Connect', SourceReference nvarchar(100) NULL,
 Status nvarchar(30) NOT NULL DEFAULT 'Open', CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 ModifiedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(), RowVersion rowversion,
 CONSTRAINT FK_pm_Commitment_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT FK_pm_Commitment_WBS FOREIGN KEY(WbsId) REFERENCES pm.WBS(WbsId),
 CONSTRAINT FK_pm_Commitment_CostCode FOREIGN KEY(CostCodeId) REFERENCES pm.CostCodes(CostCodeId),
 CONSTRAINT CK_pm_Commitment_Type CHECK(CommitmentType IN ('PR','PO','Subcontract','Reservation','Other')),
 CONSTRAINT CK_pm_Commitment_BudgetCheck CHECK(BudgetCheckStatus IN ('Pending','Approved','Rejected','Blocked'))
); GO
CREATE INDEX IX_pm_Commitments_ProjectStatus ON pm.Commitments(ProjectId,Status,BudgetCheckStatus) INCLUDE(CommittedValue,InvoicedValue,CostCodeId); GO

CREATE TABLE pm.ActualCostTransactions(
 ActualCostId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, WbsId uniqueidentifier NULL, CostCodeId uniqueidentifier NULL,
 PostingDate date NOT NULL, AccountingPeriod char(7) NOT NULL,
 DocumentNo nvarchar(100) NOT NULL, SourceSystem nvarchar(30) NOT NULL,
 SourceType nvarchar(40) NULL, SourceRecordId nvarchar(100) NULL,
 Description nvarchar(300) NOT NULL, Counterparty nvarchar(200) NULL,
 Amount decimal(19,4) NOT NULL, Currency char(3) NOT NULL DEFAULT 'NGN',
 AllocationPercent decimal(7,4) NOT NULL DEFAULT 100,
 AllocationStatus nvarchar(30) NOT NULL DEFAULT 'Allocated',
 ReconciliationStatus nvarchar(30) NOT NULL DEFAULT 'Unreconciled',
 ImportedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(), ReconciledBy uniqueidentifier NULL, ReconciledAt datetime2(3) NULL,
 RowVersion rowversion,
 CONSTRAINT FK_pm_Actual_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT FK_pm_Actual_WBS FOREIGN KEY(WbsId) REFERENCES pm.WBS(WbsId),
 CONSTRAINT FK_pm_Actual_CostCode FOREIGN KEY(CostCodeId) REFERENCES pm.CostCodes(CostCodeId),
 CONSTRAINT CK_pm_Actual_Allocation CHECK(AllocationPercent BETWEEN 0 AND 100)
); GO
CREATE INDEX IX_pm_Actual_ProjectPeriod ON pm.ActualCostTransactions(ProjectId,AccountingPeriod,PostingDate) INCLUDE(Amount,CostCodeId,AllocationStatus); GO

CREATE TABLE pm.LabourCostValidations(
 LabourValidationId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, EmployeeId uniqueidentifier NOT NULL,
 TimesheetLineExternalId nvarchar(100) NOT NULL, WorkDate date NOT NULL,
 WbsId uniqueidentifier NOT NULL, CostCodeId uniqueidentifier NOT NULL,
 RegularHours decimal(8,2) NOT NULL DEFAULT 0, OvertimeHours decimal(8,2) NOT NULL DEFAULT 0,
 EstimatedLabourCost decimal(19,4) NULL, Currency char(3) NOT NULL DEFAULT 'NGN',
 ProjectManagerApprovalStatus nvarchar(30) NOT NULL,
 CostValidationStatus nvarchar(30) NOT NULL DEFAULT 'Pending',
 ValidationExceptionCode nvarchar(50) NULL, ValidationComment nvarchar(1000) NULL,
 CostControllerEmployeeId uniqueidentifier NULL, ValidatedAt datetime2(3) NULL,
 HrStatus nvarchar(30) NOT NULL DEFAULT 'Pending', PayrollStatus nvarchar(30) NOT NULL DEFAULT 'Pending',
 CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(), RowVersion rowversion,
 CONSTRAINT FK_pm_Labour_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT FK_pm_Labour_WBS FOREIGN KEY(WbsId) REFERENCES pm.WBS(WbsId),
 CONSTRAINT FK_pm_Labour_CostCode FOREIGN KEY(CostCodeId) REFERENCES pm.CostCodes(CostCodeId),
 CONSTRAINT UX_pm_Labour_External UNIQUE(TimesheetLineExternalId),
 CONSTRAINT CK_pm_Labour_Hours CHECK(RegularHours>=0 AND OvertimeHours>=0 AND RegularHours+OvertimeHours<=24),
 CONSTRAINT CK_pm_Labour_Status CHECK(CostValidationStatus IN ('Pending','Approved','Returned','Blocked'))
); GO
CREATE INDEX IX_pm_Labour_Pending ON pm.LabourCostValidations(ProjectId,CostValidationStatus,WorkDate) INCLUDE(EmployeeId,RegularHours,OvertimeHours,CostCodeId); GO

CREATE TABLE pm.CostForecastPeriods(
 ForecastPeriodId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, PeriodCode char(7) NOT NULL, DataDate date NOT NULL,
 BaselineId uniqueidentifier NOT NULL, Status nvarchar(30) NOT NULL DEFAULT 'Draft',
 SubmittedBy uniqueidentifier NULL, SubmittedAt datetime2(3) NULL,
 ProjectManagerReviewedBy uniqueidentifier NULL, ProjectManagerReviewedAt datetime2(3) NULL,
 ApprovedBy uniqueidentifier NULL, ApprovedAt datetime2(3) NULL, LockedAt datetime2(3) NULL,
 CreatedBy uniqueidentifier NOT NULL, CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(), RowVersion rowversion,
 CONSTRAINT FK_pm_ForecastPeriod_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT FK_pm_ForecastPeriod_Baseline FOREIGN KEY(BaselineId) REFERENCES pm.CostBaselines(CostBaselineId),
 CONSTRAINT UX_pm_ForecastPeriod UNIQUE(ProjectId,PeriodCode),
 CONSTRAINT CK_pm_ForecastPeriod_Status CHECK(Status IN ('Draft','Submitted','PM Reviewed','Approved','Locked','Rejected'))
); GO

CREATE TABLE pm.CostForecastLines(
 ForecastLineId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ForecastPeriodId uniqueidentifier NOT NULL, ControlAccountId uniqueidentifier NOT NULL,
 ActualToDate decimal(19,4) NOT NULL DEFAULT 0, OpenCommitment decimal(19,4) NOT NULL DEFAULT 0,
 UncommittedETC decimal(19,4) NOT NULL DEFAULT 0,
 EAC AS (ActualToDate + OpenCommitment + UncommittedETC) PERSISTED,
 ForecastBasis nvarchar(1000) NOT NULL, RiskAllowance decimal(19,4) NOT NULL DEFAULT 0,
 OwnerEmployeeId uniqueidentifier NULL, OwnerSubmittedAt datetime2(3) NULL,
 CostControllerComment nvarchar(1000) NULL, ModifiedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(), RowVersion rowversion,
 CONSTRAINT FK_pm_ForecastLine_Period FOREIGN KEY(ForecastPeriodId) REFERENCES pm.CostForecastPeriods(ForecastPeriodId),
 CONSTRAINT FK_pm_ForecastLine_CA FOREIGN KEY(ControlAccountId) REFERENCES pm.CostControlAccounts(ControlAccountId),
 CONSTRAINT UX_pm_ForecastLine UNIQUE(ForecastPeriodId,ControlAccountId)
); GO

CREATE TABLE pm.EarnedValuePeriods(
 EarnedValuePeriodId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, PeriodEndDate date NOT NULL,
 BAC decimal(19,4) NOT NULL, PV decimal(19,4) NOT NULL, EV decimal(19,4) NOT NULL, AC decimal(19,4) NOT NULL,
 CV AS (EV-AC) PERSISTED, SV AS (EV-PV) PERSISTED,
 CPI AS (CASE WHEN AC=0 THEN NULL ELSE EV/NULLIF(AC,0) END) PERSISTED,
 SPI AS (CASE WHEN PV=0 THEN NULL ELSE EV/NULLIF(PV,0) END) PERSISTED,
 EAC decimal(19,4) NULL, ETC decimal(19,4) NULL,
 Status nvarchar(30) NOT NULL DEFAULT 'Draft', CalculatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 ApprovedBy uniqueidentifier NULL, ApprovedAt datetime2(3) NULL,
 CONSTRAINT FK_pm_EVM_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT UX_pm_EVM_Period UNIQUE(ProjectId,PeriodEndDate)
); GO

CREATE TABLE pm.ChangeCostAssessments(
 CostAssessmentId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ChangeId uniqueidentifier NOT NULL,
 DirectCost decimal(19,4) NOT NULL DEFAULT 0, IndirectCost decimal(19,4) NOT NULL DEFAULT 0,
 RiskAllowance decimal(19,4) NOT NULL DEFAULT 0, ValidatedCost AS (DirectCost+IndirectCost+RiskAllowance) PERSISTED,
 RecommendedRecovery decimal(19,4) NULL, MarginImpact decimal(19,4) NULL,
 FundingSource nvarchar(100) NULL, CostControllerEmployeeId uniqueidentifier NOT NULL,
 AssessmentBasis nvarchar(max) NOT NULL, Status nvarchar(30) NOT NULL DEFAULT 'Draft',
 SubmittedAt datetime2(3) NULL, ApprovedBy uniqueidentifier NULL, ApprovedAt datetime2(3) NULL,
 CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(), RowVersion rowversion,
 CONSTRAINT FK_pm_ChangeCost_Change FOREIGN KEY(ChangeId) REFERENCES pm.Changes(ChangeId)
); GO

CREATE TABLE pm.ProjectCashFlowForecast(
 CashFlowLineId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, ForecastMonth date NOT NULL,
 OpeningBalance decimal(19,4) NOT NULL DEFAULT 0, ClientReceipts decimal(19,4) NOT NULL DEFAULT 0,
 OtherInflows decimal(19,4) NOT NULL DEFAULT 0, SupplierOutflows decimal(19,4) NOT NULL DEFAULT 0,
 LabourOutflows decimal(19,4) NOT NULL DEFAULT 0, SubcontractOutflows decimal(19,4) NOT NULL DEFAULT 0,
 OtherOutflows decimal(19,4) NOT NULL DEFAULT 0,
 NetFlow AS (ClientReceipts+OtherInflows-SupplierOutflows-LabourOutflows-SubcontractOutflows-OtherOutflows) PERSISTED,
 ForecastVersion int NOT NULL DEFAULT 1, Status nvarchar(30) NOT NULL DEFAULT 'Draft',
 CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT FK_pm_CashFlow_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT UX_pm_CashFlow UNIQUE(ProjectId,ForecastMonth,ForecastVersion)
); GO

CREATE TABLE pm.CostPeriods(
 CostPeriodId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, PeriodCode char(7) NOT NULL, StartDate date NOT NULL, EndDate date NOT NULL,
 Status nvarchar(30) NOT NULL DEFAULT 'Open', CloseTargetDate date NULL,
 OpenedBy uniqueidentifier NOT NULL, OpenedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 SubmittedForCloseBy uniqueidentifier NULL, SubmittedForCloseAt datetime2(3) NULL,
 ApprovedCloseBy uniqueidentifier NULL, ApprovedCloseAt datetime2(3) NULL,
 LockedAt datetime2(3) NULL, ReopenedBy uniqueidentifier NULL, ReopenedAt datetime2(3) NULL, ReopenReason nvarchar(1000) NULL,
 RowVersion rowversion,
 CONSTRAINT FK_pm_CostPeriod_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT UX_pm_CostPeriod UNIQUE(ProjectId,PeriodCode),
 CONSTRAINT CK_pm_CostPeriod_Status CHECK(Status IN ('Open','Closing','Submitted','Closed','Reopened'))
); GO

CREATE TABLE pm.CostPeriodChecklist(
 ChecklistId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 CostPeriodId uniqueidentifier NOT NULL, ControlCode nvarchar(50) NOT NULL, ControlName nvarchar(250) NOT NULL,
 IsMandatory bit NOT NULL DEFAULT 1, Status nvarchar(30) NOT NULL DEFAULT 'Pending', ExceptionCount int NOT NULL DEFAULT 0,
 CompletedBy uniqueidentifier NULL, CompletedAt datetime2(3) NULL, EvidenceReference nvarchar(500) NULL, Notes nvarchar(1000) NULL,
 CONSTRAINT FK_pm_CostChecklist_Period FOREIGN KEY(CostPeriodId) REFERENCES pm.CostPeriods(CostPeriodId),
 CONSTRAINT UX_pm_CostChecklist UNIQUE(CostPeriodId,ControlCode)
); GO

CREATE TABLE pm.CostApprovalActions(
 CostApprovalActionId uniqueidentifier NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
 ProjectId uniqueidentifier NOT NULL, EntityType nvarchar(50) NOT NULL, EntityId uniqueidentifier NOT NULL,
 WorkflowName nvarchar(100) NOT NULL, StepNo int NOT NULL, StepName nvarchar(100) NOT NULL,
 ApproverRole nvarchar(100) NOT NULL, ApproverEmployeeId uniqueidentifier NULL,
 Decision nvarchar(30) NOT NULL DEFAULT 'Pending', DecisionComment nvarchar(1000) NULL,
 DecidedAt datetime2(3) NULL, CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT FK_pm_CostApproval_Project FOREIGN KEY(ProjectId) REFERENCES pm.Projects(ProjectId),
 CONSTRAINT CK_pm_CostApproval_Decision CHECK(Decision IN ('Pending','Approved','Rejected','Returned','Skipped'))
); GO

/* Recommended security roles (map to DLE Connect RBAC rather than SQL logins):
   COST_CONTROL_VIEW, COST_CONTROL_VALIDATE, COST_CONTROL_FORECAST,
   COST_CONTROL_BASELINE_ADMIN, COST_CONTROL_PERIOD_CLOSE, COST_CONTROL_REPORT,
   PROJECT_MANAGER_COST_REVIEW, CFO_COST_APPROVE, AUDIT_COST_READ.
*/
