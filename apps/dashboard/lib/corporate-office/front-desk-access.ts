import sql from 'mssql';
import { CORPORATE_OFFICE_PARTICIPANT_PERMISSION } from '@/lib/access/corporate-office-access';
import { ensureFrontDeskDb } from '@/lib/corporate-office/front-desk-store';

export { CORPORATE_OFFICE_PARTICIPANT_PERMISSION };

const participantMatch = `
  UPPER(ISNULL(c.[AddressedEmployeeCode], N'')) = UPPER(@Code)
  OR UPPER(ISNULL(c.[AssignedEmployeeCode], N'')) = UPPER(@Code)
  OR EXISTS (
    SELECT 1
    FROM [corporate].[FrontDeskRoutes] r
    WHERE r.[CorrespondenceId] = c.[CorrespondenceId]
      AND (
        UPPER(ISNULL(r.[AssigneeEmployeeCode], N'')) = UPPER(@Code)
        OR UPPER(ISNULL(r.[HodEmployeeCode], N'')) = UPPER(@Code)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM [corporate].[FrontDeskRecipients] p
    WHERE p.[CorrespondenceId] = c.[CorrespondenceId]
      AND UPPER(ISNULL(p.[EmployeeCode], N'')) = UPPER(@Code)
  )
`;

/** True when this employee is the addressee, assignee, department officer, or HOD on a correspondence. */
export const employeeHasCorrespondenceAccess = async (employeeCode: string, correspondenceId = '') => {
  const code = employeeCode.trim();
  if (!code) return false;
  const pool = await ensureFrontDeskDb();
  const request = pool.request();
  request.input('Code', sql.NVarChar(40), code);
  request.input('Id', sql.NVarChar(40), correspondenceId.trim());
  const result = await request.query(`
    SELECT TOP 1 c.[CorrespondenceId] AS [Id]
    FROM [corporate].[FrontDeskCorrespondence] c
    WHERE (${participantMatch})
      AND (@Id = N'' OR c.[CorrespondenceId] = @Id)
  `);
  return Boolean(result.recordset[0]);
};

export const withCorrespondenceParticipantPermission = async (permissions: string[], employeeCode?: string) => {
  const list = [...(permissions || [])];
  if (!employeeCode || list.includes('*') || list.includes(CORPORATE_OFFICE_PARTICIPANT_PERMISSION)) return list;
  if (await employeeHasCorrespondenceAccess(employeeCode)) list.push(CORPORATE_OFFICE_PARTICIPANT_PERMISSION);
  return list;
};
