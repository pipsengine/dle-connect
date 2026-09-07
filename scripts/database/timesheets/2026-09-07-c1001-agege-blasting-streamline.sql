/*
  Streamline supervisor C1001 (Jimoh Gbadamosi) timesheets to:
    Location  = AGEGE
    Work center = Blasting

  - Normalize supervisor identity to "C1001 - JIMOH GBADAMOSI"
  - Move Draft/Returned Painting headers for C1001 onto Blasting
  - Clear trade-name-as-location on work centers
  - Deactivate leftover empty C1001 Painting drafts after the move

  Review counts, then run the UPDATEs.
*/

SET NOCOUNT ON;

DECLARE @CanonicalSupervisor NVARCHAR(120) = N'C1001 - JIMOH GBADAMOSI';

-- Preview conflicting C1001 headers
SELECT
  [Id],
  [TimesheetDate],
  [SupervisorId],
  [SupervisorName],
  [WorkCenterName],
  [Status],
  [ShiftLabel]
FROM [hris].[TimesheetHeaders]
WHERE (
    [SupervisorId] LIKE N'%C1001%'
    OR [SupervisorName] LIKE N'%C1001%'
    OR [SupervisorId] LIKE N'%GBADAMOSI%'
    OR [SupervisorName] LIKE N'%GBADAMOSI%'
  )
ORDER BY [TimesheetDate] DESC, [WorkCenterName];

-- 1) Canonical supervisor label
UPDATE [hris].[TimesheetHeaders]
SET
  [SupervisorId] = @CanonicalSupervisor,
  [SupervisorName] = @CanonicalSupervisor,
  [UpdatedAt] = SYSUTCDATETIME()
WHERE (
    [SupervisorId] LIKE N'%C1001%'
    OR [SupervisorName] LIKE N'%C1001%'
    OR [SupervisorId] LIKE N'%GBADAMOSI%'
    OR [SupervisorName] LIKE N'%GBADAMOSI%'
  )
  AND (
    [SupervisorId] <> @CanonicalSupervisor
    OR ISNULL([SupervisorName], N'') <> @CanonicalSupervisor
  );

-- 2) Move editable Painting sheets onto Blasting
UPDATE [hris].[TimesheetHeaders]
SET
  [WorkCenterName] = N'Blasting',
  [WorkCenterId] = N'blasting',
  [UpdatedAt] = SYSUTCDATETIME()
WHERE [SupervisorId] = @CanonicalSupervisor
  AND [WorkCenterName] = N'Painting'
  AND [Status] IN (N'Draft', N'Returned');

-- 3) Clear trade labels stored as Location/Site on work centers
UPDATE [hris].[TimesheetWorkCenters]
SET [Location] = NULL, [Site] = NULL, [UpdatedAt] = SYSUTCDATETIME()
WHERE [Location] = [Name] OR [Site] = [Name];

-- 4) If a date still has both Blasting + empty Painting for C1001, drop empty Painting leftovers
;WITH painting AS (
  SELECT h.[Id]
  FROM [hris].[TimesheetHeaders] h
  WHERE h.[SupervisorId] = @CanonicalSupervisor
    AND h.[WorkCenterName] = N'Painting'
    AND h.[Status] IN (N'Draft', N'Returned')
    AND NOT EXISTS (
      SELECT 1
      FROM [hris].[TimesheetLines] l
      WHERE l.[HeaderId] = h.[Id]
        AND (ISNULL(l.[UsedHours], 0) > 0 OR ISNULL(l.[TotalHours], 0) > 0)
    )
)
UPDATE h
SET h.[Status] = N'Cancelled', h.[UpdatedAt] = SYSUTCDATETIME()
FROM [hris].[TimesheetHeaders] h
INNER JOIN painting p ON p.[Id] = h.[Id];

SELECT
  [Id],
  [TimesheetDate],
  [SupervisorId],
  [WorkCenterName],
  [Status]
FROM [hris].[TimesheetHeaders]
WHERE [SupervisorId] = @CanonicalSupervisor
ORDER BY [TimesheetDate] DESC, [WorkCenterName];
