
/* DLE Connect Recruitment Management - SQL Server Enterprise Schema */
CREATE TABLE RecruitmentManpowerRequest(
 Id bigint IDENTITY PRIMARY KEY, RequestNo nvarchar(30) UNIQUE NOT NULL, RequestType nvarchar(30) NOT NULL,
 DepartmentId bigint NOT NULL, PositionTitle nvarchar(150) NOT NULL, EmploymentType nvarchar(30) NOT NULL,
 Headcount int NOT NULL CHECK(Headcount>0), RequiredDate date NULL, Priority nvarchar(20) NOT NULL DEFAULT 'Medium',
 ReplacementEmployeeId bigint NULL, ProjectId bigint NULL, CostCentreId bigint NULL, WorkLocation nvarchar(120) NULL,
 Budgeted bit NOT NULL DEFAULT 0, EstimatedAnnualCost decimal(19,2) NULL, Currency char(3) NOT NULL DEFAULT 'NGN',
 BusinessJustification nvarchar(max) NULL, Status nvarchar(30) NOT NULL DEFAULT 'Draft',
 CreatedBy bigint NOT NULL, CreatedAt datetime2 NOT NULL DEFAULT sysdatetime(), UpdatedAt datetime2 NULL
);
CREATE TABLE RecruitmentRequisition(
 Id bigint IDENTITY PRIMARY KEY, RequisitionNo nvarchar(30) UNIQUE NOT NULL, ManpowerRequestId bigint NOT NULL,
 JobTitle nvarchar(150) NOT NULL, DepartmentId bigint NOT NULL, HiringManagerId bigint NOT NULL,
 Openings int NOT NULL, Grade nvarchar(30) NULL, EmploymentType nvarchar(30) NOT NULL, Location nvarchar(120) NULL,
 Priority nvarchar(20) NOT NULL, TargetHireDate date NULL, JobPurpose nvarchar(max) NULL, Responsibilities nvarchar(max) NULL,
 MinimumQualification nvarchar(200) NULL, MinimumYearsExperience decimal(5,1) NULL, RequiredSkills nvarchar(max) NULL,
 PreferredSkills nvarchar(max) NULL, Status nvarchar(30) NOT NULL DEFAULT 'Draft', CreatedAt datetime2 NOT NULL DEFAULT sysdatetime()
);
CREATE TABLE RecruitmentScreeningCriterion(
 Id bigint IDENTITY PRIMARY KEY, RequisitionId bigint NOT NULL, CriterionName nvarchar(120) NOT NULL,
 CriterionType nvarchar(30) NOT NULL, Weight decimal(5,2) NOT NULL, Mandatory bit NOT NULL DEFAULT 0,
 DisplayOrder int NOT NULL DEFAULT 0, Active bit NOT NULL DEFAULT 1
);
CREATE TABLE RecruitmentJobPosting(
 Id bigint IDENTITY PRIMARY KEY, PostingNo nvarchar(30) UNIQUE NOT NULL, RequisitionId bigint NOT NULL,
 PostingTitle nvarchar(180) NOT NULL, Summary nvarchar(max) NULL, AdvertContent nvarchar(max) NULL,
 PublishAt datetime2 NULL, CloseAt datetime2 NULL, Status nvarchar(30) NOT NULL DEFAULT 'Draft',
 InternalOnly bit NOT NULL DEFAULT 0, CreatedAt datetime2 NOT NULL DEFAULT sysdatetime()
);
CREATE TABLE RecruitmentPostingChannel(
 Id bigint IDENTITY PRIMARY KEY, PostingId bigint NOT NULL, Channel nvarchar(80) NOT NULL,
 ExternalReference nvarchar(200) NULL, PublishedAt datetime2 NULL, ClosedAt datetime2 NULL,
 Views int NOT NULL DEFAULT 0, Applications int NOT NULL DEFAULT 0
);
CREATE TABLE RecruitmentCandidate(
 Id bigint IDENTITY PRIMARY KEY, CandidateNo nvarchar(30) UNIQUE NOT NULL,
 FirstName nvarchar(80) NOT NULL, LastName nvarchar(80) NOT NULL, Email nvarchar(180) NULL, Phone nvarchar(50) NULL,
 Location nvarchar(120) NULL, CurrentEmployer nvarchar(150) NULL, CurrentTitle nvarchar(150) NULL,
 YearsExperience decimal(5,1) NULL, HighestQualification nvarchar(150) NULL, PrimarySkills nvarchar(max) NULL,
 Source nvarchar(80) NULL, ReferredBy nvarchar(150) NULL, ConsentAt datetime2 NULL, ConsentExpiresAt datetime2 NULL,
 Status nvarchar(30) NOT NULL DEFAULT 'Active', CreatedAt datetime2 NOT NULL DEFAULT sysdatetime()
);
CREATE TABLE RecruitmentCandidateDocument(
 Id bigint IDENTITY PRIMARY KEY, CandidateId bigint NOT NULL, DocumentType nvarchar(50) NOT NULL,
 FileName nvarchar(260) NOT NULL, StorageKey nvarchar(500) NOT NULL, VersionNo int NOT NULL DEFAULT 1,
 UploadedBy bigint NULL, UploadedAt datetime2 NOT NULL DEFAULT sysdatetime()
);
CREATE TABLE RecruitmentApplication(
 Id bigint IDENTITY PRIMARY KEY, CandidateId bigint NOT NULL, RequisitionId bigint NOT NULL,
 PostingId bigint NULL, Stage nvarchar(40) NOT NULL DEFAULT 'Applied', ScreeningScore decimal(5,2) NULL,
 RecruiterDecision nvarchar(30) NULL, RecruiterDecisionReason nvarchar(max) NULL,
 AppliedAt datetime2 NOT NULL DEFAULT sysdatetime(), UpdatedAt datetime2 NULL,
 CONSTRAINT UQ_RecruitmentApplication UNIQUE(CandidateId,RequisitionId)
);
CREATE TABLE RecruitmentScreeningResult(
 Id bigint IDENTITY PRIMARY KEY, ApplicationId bigint NOT NULL, CriterionId bigint NOT NULL,
 Evidence nvarchar(max) NULL, RawScore decimal(7,2) NULL, WeightedScore decimal(7,2) NULL,
 AiSuggestedScore decimal(7,2) NULL, AiExplanation nvarchar(max) NULL,
 RecruiterScore decimal(7,2) NULL, RecruiterComment nvarchar(max) NULL
);
CREATE TABLE RecruitmentInterview(
 Id bigint IDENTITY PRIMARY KEY, ApplicationId bigint NOT NULL, RoundNo int NOT NULL, InterviewType nvarchar(50) NOT NULL,
 ScheduledAt datetime2 NULL, DurationMinutes int NULL, Mode nvarchar(30) NULL, VenueOrMeeting nvarchar(500) NULL,
 Status nvarchar(30) NOT NULL DEFAULT 'Scheduled', CandidateConfirmedAt datetime2 NULL
);
CREATE TABLE RecruitmentInterviewPanel(
 Id bigint IDENTITY PRIMARY KEY, InterviewId bigint NOT NULL, EmployeeId bigint NOT NULL, PanelRole nvarchar(50) NULL,
 AttendanceStatus nvarchar(30) NULL, ConflictDeclared bit NULL, ConflictComment nvarchar(1000) NULL
);
CREATE TABLE RecruitmentInterviewEvaluation(
 Id bigint IDENTITY PRIMARY KEY, InterviewId bigint NOT NULL, EvaluatorEmployeeId bigint NOT NULL,
 TechnicalScore decimal(5,2) NULL, BehaviouralScore decimal(5,2) NULL, ValuesScore decimal(5,2) NULL,
 CommunicationScore decimal(5,2) NULL, OverallScore decimal(5,2) NULL, Recommendation nvarchar(40) NULL,
 Strengths nvarchar(max) NULL, Concerns nvarchar(max) NULL, Comments nvarchar(max) NULL, SubmittedAt datetime2 NULL
);
CREATE TABLE RecruitmentOffer(
 Id bigint IDENTITY PRIMARY KEY, ApplicationId bigint NOT NULL, OfferVersion int NOT NULL DEFAULT 1,
 Grade nvarchar(40) NULL, EmploymentType nvarchar(30) NULL, Currency char(3) NOT NULL DEFAULT 'NGN',
 BasicPay decimal(19,2) NULL, TotalPackage decimal(19,2) NULL, SalaryBandMin decimal(19,2) NULL,
 SalaryBandMid decimal(19,2) NULL, SalaryBandMax decimal(19,2) NULL, ProposedStartDate date NULL,
 Status nvarchar(30) NOT NULL DEFAULT 'Draft', IssuedAt datetime2 NULL, ExpiresAt datetime2 NULL,
 AcceptedAt datetime2 NULL, DeclinedAt datetime2 NULL, DeclineReason nvarchar(1000) NULL
);
CREATE TABLE RecruitmentOfferComponent(
 Id bigint IDENTITY PRIMARY KEY, OfferId bigint NOT NULL, ComponentName nvarchar(100) NOT NULL,
 Amount decimal(19,2) NULL, Frequency nvarchar(30) NULL, Taxable bit NULL, Notes nvarchar(500) NULL
);
CREATE TABLE RecruitmentBackgroundCheck(
 Id bigint IDENTITY PRIMARY KEY, ApplicationId bigint NOT NULL, CheckType nvarchar(60) NOT NULL,
 Provider nvarchar(120) NULL, Status nvarchar(30) NOT NULL DEFAULT 'Not Started', Result nvarchar(30) NULL,
 RiskRating nvarchar(20) NULL, StartedAt datetime2 NULL, DueAt datetime2 NULL, CompletedAt datetime2 NULL,
 Notes nvarchar(max) NULL, AuthorizedAt datetime2 NULL
);
CREATE TABLE RecruitmentApprovalEvent(
 Id bigint IDENTITY PRIMARY KEY, EntityType nvarchar(50) NOT NULL, EntityId bigint NOT NULL,
 WorkflowStage nvarchar(80) NOT NULL, SequenceNo int NOT NULL, ActorEmployeeId bigint NOT NULL,
 Action nvarchar(30) NOT NULL, Comment nvarchar(1500) NULL, PreviousStatus nvarchar(30) NULL,
 NewStatus nvarchar(30) NULL, ActionAt datetime2 NOT NULL DEFAULT sysdatetime()
);
CREATE TABLE RecruitmentTalentPool(
 Id bigint IDENTITY PRIMARY KEY, CandidateId bigint NOT NULL, PoolName nvarchar(100) NOT NULL,
 PrimarySkill nvarchar(120) NULL, Discipline nvarchar(100) NULL, Availability nvarchar(40) NULL,
 TalentScore decimal(5,2) NULL, AddedBy bigint NOT NULL, AddedAt datetime2 NOT NULL DEFAULT sysdatetime()
);
CREATE TABLE RecruitmentNotification(
 Id bigint IDENTITY PRIMARY KEY, RecipientEmployeeId bigint NULL, RecipientEmail nvarchar(180) NULL,
 NotificationType nvarchar(60) NOT NULL, Subject nvarchar(250) NOT NULL, Body nvarchar(max) NULL,
 EntityType nvarchar(50) NULL, EntityId bigint NULL, Status nvarchar(20) NOT NULL DEFAULT 'Queued',
 SentAt datetime2 NULL, CreatedAt datetime2 NOT NULL DEFAULT sysdatetime()
);
CREATE TABLE RecruitmentAudit(
 Id bigint IDENTITY PRIMARY KEY, EntityType nvarchar(50) NOT NULL, EntityId bigint NOT NULL,
 ActorEmployeeId bigint NULL, Action nvarchar(80) NOT NULL, BeforeJson nvarchar(max) NULL,
 AfterJson nvarchar(max) NULL, Reason nvarchar(1000) NULL, IpAddress nvarchar(64) NULL,
 OccurredAt datetime2 NOT NULL DEFAULT sysdatetime()
);
CREATE INDEX IX_RecruitmentApplication_RequisitionStage ON RecruitmentApplication(RequisitionId,Stage);
CREATE INDEX IX_RecruitmentCandidate_Email ON RecruitmentCandidate(Email);
CREATE INDEX IX_RecruitmentApproval_Entity ON RecruitmentApprovalEvent(EntityType,EntityId,ActionAt DESC);
CREATE INDEX IX_RecruitmentAudit_Entity ON RecruitmentAudit(EntityType,EntityId,OccurredAt DESC);
