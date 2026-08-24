-- ========================================================================
-- SAFE RENAME: BLESSED OKPARA (Lumpsum Driver) — L2792 -> L2791
-- Target: DLE_Enterprise database, schema hris
-- How to use: Paste the ENTIRE script into SSMS, press Execute (F5).
-- It rolls back automatically unless every check passes.
-- ========================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

BEGIN TRY
  DECLARE @TargetEmployeeId BIGINT;
  DECLARE @CurrentCode NVARCHAR(50);
  DECLARE @FullName NVARCHAR(250);
  DECLARE @OldLMax INT;
  DECLARE @NewLMax INT;

  -- 1. Confirm exactly 1 employee matches L2792 + name contains BLESSED OKPARA
  SELECT
    @TargetEmployeeId = employee_id,
    @CurrentCode = employee_code,
    @FullName = full_name
  FROM hris.Employees
  WHERE employee_code = 'L2792';

  IF @TargetEmployeeId IS NULL
  BEGIN
    PRINT 'ERROR: No employee found with employee_code = L2792';
    ROLLBACK TRANSACTION;
    RETURN;
  END;

  IF @FullName NOT LIKE '%BLESSED%OKPARA%'
  BEGIN
    PRINT 'ERROR: Employee found on L2792 is ''' + @FullName + ''' not BLESSED OKPARA. Aborting to avoid renaming wrong person.';
    ROLLBACK TRANSACTION;
    RETURN;
  END;

  PRINT 'Found: employee_id=' + CAST(@TargetEmployeeId AS VARCHAR(20))
      + '  code=' + @CurrentCode
      + '  name=' + @FullName
      + '  — target: L2791';

  -- 2. Confirm L2791 is FREE in Employees + active Drafts
  IF EXISTS (SELECT * FROM hris.Employees WHERE employee_code = 'L2791')
  BEGIN
    PRINT 'ERROR: L2791 already taken by another employee (Employees table).';
    ROLLBACK TRANSACTION;
    RETURN;
  END;

  IF EXISTS (
    SELECT * FROM hris.EmployeeDrafts
    WHERE employee_code = 'L2791' AND draft_status NOT IN ('cancelled', 'created')
  )
  BEGIN
    PRINT 'ERROR: L2791 is reserved by a non-cancelled Employee Draft.';
    ROLLBACK TRANSACTION;
    RETURN;
  END;

  PRINT 'L2791 confirmed free — safe to rename.';

  -- 3. Apply rename
  UPDATE hris.Employees
  SET employee_code = 'L2791',
      modified_at = SYSUTCDATETIME()
  WHERE employee_id = @TargetEmployeeId
    AND employee_code = 'L2792';

  IF @@ROWCOUNT <> 1
  BEGIN
    PRINT 'ERROR: UPDATE failed — rows affected=' + CAST(@@ROWCOUNT AS VARCHAR(10));
    ROLLBACK TRANSACTION;
    RETURN;
  END;

  -- 4. Mirror the code into the source-record raw JSON for consistency
  UPDATE hris.EmployeeSourceRecords
  SET raw_payload_json = JSON_MODIFY(
    JSON_MODIFY(raw_payload_json, 'strict $.employeeCode', 'L2791'),
    '$.source_employee_code', 'L2791'
  )
  WHERE employee_id = @TargetEmployeeId;

  -- 5. Also mark draft-status record (if any) that created this employee as created_employee_code = L2791
  IF EXISTS (SELECT * FROM hris.EmployeeDrafts WHERE created_employee_code = 'L2792')
    UPDATE hris.EmployeeDrafts
    SET created_employee_code = 'L2791', modified_at = SYSUTCDATETIME()
    WHERE created_employee_code = 'L2792';

  -- 6. Rewind EmployeeCodeCounters for L-prefix so:
  --    Current true max(L seq) = L2791 -> last_sequence = 2791
  --    Next allocate will return L2792 (max + 1). This handles the counter
  --    being ahead-of-truth because of the earlier skip bug.
  SELECT @OldLMax = ISNULL(last_sequence, 0)
  FROM hris.EmployeeCodeCounters WHERE employee_type_code = 'L';

  IF EXISTS (SELECT * FROM hris.EmployeeCodeCounters WHERE employee_type_code = 'L')
    UPDATE hris.EmployeeCodeCounters SET last_sequence = 2791 WHERE employee_type_code = 'L';
  ELSE
    INSERT hris.EmployeeCodeCounters (employee_type_code, last_sequence) VALUES ('L', 2791);

  SELECT @NewLMax = last_sequence FROM hris.EmployeeCodeCounters WHERE employee_type_code = 'L';

  -- 7. Full audit log entry
  INSERT hris.EmployeeAuditLog (employee_id, audit_action, performed_by, notes)
  VALUES (
    @TargetEmployeeId,
    'Manual employee_code rename',
    SUSER_SNAME(),
    'L2792 -> L2791 · Blessed Okpara (Driver, Lumpsum). Counter L reset from '
      + ISNULL(CAST(@OldLMax AS VARCHAR(20)), 'NULL')
      + ' -> ' + CAST(@NewLMax AS VARCHAR(20))
  );

  -- 8. Final confirmation select
  COMMIT TRANSACTION;

  PRINT '';
  PRINT '====================================';
  PRINT 'RENAME SUCCESSFUL';
  PRINT '====================================';
  SELECT
    employee_id,
    employee_code,
    full_name,
    employment_status,
    employment_type,
    modified_at
  FROM hris.Employees WHERE employee_id = @TargetEmployeeId;

  PRINT 'L counter after fix:';
  SELECT employee_type_code, last_sequence FROM hris.EmployeeCodeCounters WHERE employee_type_code = 'L';

  PRINT 'Next auto-allocated Lumpsum code will be L2792 (no skips).';

END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  PRINT 'ROLLBACK triggered by exception: ' + ERROR_MESSAGE();
  THROW;
END CATCH;
