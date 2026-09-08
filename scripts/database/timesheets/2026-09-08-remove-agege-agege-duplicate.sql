/*
  Remove duplicate Agege location labels from timesheet dimension tables.

  Canonical location: AGEGE
  Duplicate form:     AGEGE - AGEGE (and Agege-Agege variants)

  1) Ensure a canonical AGEGE row exists in TimesheetLocations
  2) Delete duplicate AGEGE - AGEGE rows
  3) Normalize OrganizationLocationsSites Name/Location when duplicated
*/

SET NOCOUNT ON;

-- Preview duplicates
SELECT [Id], [Code], [Name], [Site], [SourceSystem]
FROM [hris].[TimesheetLocations]
WHERE [Name] LIKE N'AGEGE%AGEGE%'
   OR [Site] LIKE N'AGEGE%AGEGE%'
   OR UPPER(LTRIM(RTRIM([Name]))) = N'AGEGE - AGEGE'
   OR UPPER(LTRIM(RTRIM([Site]))) = N'AGEGE - AGEGE'
ORDER BY [Name];

-- Ensure canonical AGEGE location exists
IF NOT EXISTS (
  SELECT 1 FROM [hris].[TimesheetLocations]
  WHERE UPPER(LTRIM(RTRIM([Name]))) = N'AGEGE'
)
BEGIN
  INSERT INTO [hris].[TimesheetLocations] ([Id], [Code], [Name], [Site], [SourceSystem])
  VALUES (N'loc-agege', N'AGEGE', N'AGEGE', N'AGEGE', N'HRIS');
END
ELSE
BEGIN
  UPDATE [hris].[TimesheetLocations]
  SET [Site] = N'AGEGE',
      [Code] = COALESCE(NULLIF(LTRIM(RTRIM([Code])), N''), N'AGEGE'),
      [UpdatedAt] = SYSUTCDATETIME()
  WHERE UPPER(LTRIM(RTRIM([Name]))) = N'AGEGE'
    AND (
      ISNULL([Site], N'') <> N'AGEGE'
      OR ISNULL([Code], N'') = N''
    );
END

-- Remove duplicate AGEGE - AGEGE style rows (keep canonical AGEGE)
DELETE FROM [hris].[TimesheetLocations]
WHERE UPPER(REPLACE(REPLACE(LTRIM(RTRIM([Name])), N' ', N''), N'-', N'')) = N'AGEGEAGEGE'
   OR (
        UPPER(LTRIM(RTRIM([Name]))) LIKE N'AGEGE%AGEGE%'
        AND UPPER(LTRIM(RTRIM([Name]))) <> N'AGEGE'
      );

-- Normalize remaining Site values that still say AGEGE - AGEGE
UPDATE [hris].[TimesheetLocations]
SET [Site] = N'AGEGE',
    [UpdatedAt] = SYSUTCDATETIME()
WHERE UPPER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL([Site], N''))), N' ', N''), N'-', N'')) = N'AGEGEAGEGE'
   OR UPPER(LTRIM(RTRIM(ISNULL([Site], N'')))) LIKE N'AGEGE%AGEGE%';

-- Organization site registry (if present)
IF OBJECT_ID(N'[hris].[OrganizationLocationsSites]', N'U') IS NOT NULL
BEGIN
  UPDATE [hris].[OrganizationLocationsSites]
  SET [Name] = N'AGEGE',
      [Location] = N'AGEGE',
      [LastSyncedAt] = SYSUTCDATETIME()
  WHERE [RecordType] = N'Site'
    AND (
      UPPER(REPLACE(REPLACE(LTRIM(RTRIM([Name])), N' ', N''), N'-', N'')) = N'AGEGEAGEGE'
      OR UPPER(LTRIM(RTRIM([Name]))) LIKE N'AGEGE%AGEGE%'
      OR UPPER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL([Location], N''))), N' ', N''), N'-', N'')) = N'AGEGEAGEGE'
    );
END

-- Confirm result
SELECT [Id], [Code], [Name], [Site], [SourceSystem]
FROM [hris].[TimesheetLocations]
WHERE [Name] LIKE N'%AGEGE%' OR [Site] LIKE N'%AGEGE%'
ORDER BY [Name];
