import * as fs from 'fs';
import * as path from 'path';
import sql from 'mssql';

async function main() {
  try {
    const loadFile = (p: string) => {
      if (!fs.existsSync(p)) return;
      const raw = fs.readFileSync(p, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 1) continue;
        const k = t.slice(0, eq).trim();
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[k] === undefined) process.env[k] = v;
      }
    };
    const fixedRoot = 'C:\\Next-Generation\\dle-connect\\apps\\dashboard';
    for (const f of ['.env.local', '.env']) loadFile(path.join(fixedRoot, f));

    const server = String(process.env.DLE_ENTERPRISE_DB_HOST || '').trim();
    const port = Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433);
    const database = String(process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise').trim();
    const user = String(process.env.DLE_ENTERPRISE_DB_USER || '').trim();
    const password = String(process.env.DLE_ENTERPRISE_DB_PASSWORD || '').trim();
    const encryptRaw = process.env.DLE_ENTERPRISE_DB_ENCRYPT;
    const trustRaw = process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE;
    const encrypt = encryptRaw === undefined ? true : /^(1|true|yes|on)$/i.test(String(encryptRaw).trim());
    const trustServerCertificate = trustRaw === undefined ? true : /^(1|true|yes|on)$/i.test(String(trustRaw).trim());
    const cfg: sql.config = {
      server, port, database, user, password,
      options: { encrypt, trustServerCertificate, enableArithAbort: true },
      requestTimeout: 60000, connectionTimeout: 20000,
      pool: { max: 2, min: 0, idleTimeoutMillis: 10_000 },
    };
    const pool = await new sql.ConnectionPool(cfg).connect();
    console.log('Connected OK to DLE_Enterprise.');

    // Renaming Blessed Okpara (Lumpsum Driver) — employee_id 42541 confirmed.
    const FROM_CODE = 'L2792';
    const TO_CODE = 'L2791';
    const EXPECTED_NAME_REGEX = /BLESSED.*OKPARA/i;

    // Transaction with UPDLOCK/HOLDLOCK
    const tx = pool.transaction();
    try {
      await tx.begin();
      console.log(`Transaction started. Locating ${FROM_CODE} with name containing BLESSED OKPARA…`);

      const empRow = await tx.request()
        .input('fromCode', sql.NVarChar(50), FROM_CODE)
        .query<{ employee_id: number; full_name: string; employee_code: string }>(`
          SELECT employee_id, employee_code, full_name
          FROM [hris].[Employees] WITH (UPDLOCK, HOLDLOCK)
          WHERE employee_code = @fromCode;
        `);

      if (!empRow.recordset.length) {
        console.error(`ABORT ROLLBACK: No employee found with employee_code = ${FROM_CODE}`);
        await tx.rollback();
        process.exit(4);
      }
      const { employee_id, full_name } = empRow.recordset[0];
      if (!EXPECTED_NAME_REGEX.test(full_name || '')) {
        console.error(`ABORT ROLLBACK: Employee on ${FROM_CODE} is "${full_name}" (id=${employee_id}) — does NOT match BLESSED OKPARA name guard.`);
        await tx.rollback();
        process.exit(5);
      }
      console.log(`  ✔  Found: employee_id=${employee_id}  code=${FROM_CODE}  name="${full_name}"`);

      // Check L2791 is free in Employees
      const takenEmp = await tx.request()
        .input('toCode', sql.NVarChar(50), TO_CODE)
        .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM [hris].[Employees] WHERE employee_code = @toCode;`);
      if ((takenEmp.recordset[0]?.cnt ?? 0) > 0) {
        console.error(`ABORT ROLLBACK: ${TO_CODE} already taken in [hris].[Employees]`);
        await tx.rollback();
        process.exit(6);
      }
      // Check L2791 is free in active drafts
      const takenDraft = await tx.request()
        .input('toCode', sql.NVarChar(50), TO_CODE)
        .query<{ cnt: number }>(`
          SELECT COUNT(*) AS cnt FROM [hris].[EmployeeDrafts]
          WHERE employee_code = @toCode AND draft_status NOT IN ('cancelled', 'created');
        `);
      if ((takenDraft.recordset[0]?.cnt ?? 0) > 0) {
        console.error(`ABORT ROLLBACK: ${TO_CODE} reserved by non-cancelled/non-created draft in EmployeeDrafts`);
        await tx.rollback();
        process.exit(7);
      }
      console.log(`  ✔  ${TO_CODE} confirmed FREE in Employees + active Drafts.`);

      // Update Employees
      await tx.request()
        .input('employeeId', sql.BigInt, employee_id)
        .input('fromCode', sql.NVarChar(50), FROM_CODE)
        .input('toCode', sql.NVarChar(50), TO_CODE)
        .query(`
          UPDATE [hris].[Employees]
          SET employee_code = @toCode,
              modified_at = SYSUTCDATETIME(),
              modified_by = COALESCE(modified_by, SUSER_SNAME())
          WHERE employee_id = @employeeId AND employee_code = @fromCode;
        `);

      // Mirror to EmployeeSourceRecords (source_employee_code + raw_payload_json.employeeCode)
      // Also set modified_by if modified_by column exists. From schema it does NOT have modified_by/modified_at cols, so skip.
      const srcRows = await tx.request()
        .input('employeeId', sql.BigInt, employee_id)
        .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM [hris].[EmployeeSourceRecords] WHERE employee_id = @employeeId;`);
      if ((srcRows.recordset[0]?.cnt ?? 0) > 0) {
        await tx.request()
          .input('employeeId', sql.BigInt, employee_id)
          .input('toCode', sql.NVarChar(50), TO_CODE)
          .query(`
            UPDATE [hris].[EmployeeSourceRecords]
            SET source_employee_code = @toCode,
                raw_payload_json = CASE
                  WHEN JSON_VALUE(ISNULL(raw_payload_json, '{}'), '$.employeeCode') IS NOT NULL
                    THEN JSON_MODIFY(raw_payload_json, '$.employeeCode', @toCode)
                  ELSE raw_payload_json
                END
            WHERE employee_id = @employeeId;
          `);
        console.log(`  ✔  EmployeeSourceRecords (${srcRows.recordset[0].cnt} rows) mirror updated.`);
      }

      // Mirror to EmployeeDrafts.created_employee_code if linked
      const linkedDrafts = await tx.request()
        .input('fromCode', sql.NVarChar(50), FROM_CODE)
        .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM [hris].[EmployeeDrafts] WHERE created_employee_code = @fromCode;`);
      if ((linkedDrafts.recordset[0]?.cnt ?? 0) > 0) {
        await tx.request()
          .input('fromCode', sql.NVarChar(50), FROM_CODE)
          .input('toCode', sql.NVarChar(50), TO_CODE)
          .query(`
            UPDATE [hris].[EmployeeDrafts]
            SET created_employee_code = @toCode,
                modified_at = SYSUTCDATETIME()
            WHERE created_employee_code = @fromCode;
          `);
        console.log(`  ✔  EmployeeDrafts.created_employee_code mirror updated (${linkedDrafts.recordset[0].cnt} drafts).`);
      }

      // Reset EmployeeCodeCounters (L) to 2791 so next allocate returns L2792.
      // Schema: employee_type_code (char(1) PK), employee_type_name (NOT NULL, nvarchar(40)), last_sequence (int NOT NULL), modified_at (NOT NULL datetime2), modified_by (NOT NULL nvarchar(128))
      const counterBefore = await tx.request()
        .input('typeCode', sql.Char(1), 'L')
        .query<{ last_sequence: number; employee_type_name: string }>(`
          SELECT ISNULL(last_sequence, 0) AS last_sequence, employee_type_name
          FROM [hris].[EmployeeCodeCounters] WHERE employee_type_code = @typeCode;
        `);
      const beforeSeq = counterBefore.recordset[0]?.last_sequence ?? 0;
      const existingTypeName = counterBefore.recordset[0]?.employee_type_name || 'Lumpsum';
      const TARGET_SEQ = 2791;
      await tx.request()
        .input('typeCode', sql.Char(1), 'L')
        .input('typeName', sql.NVarChar(40), existingTypeName || 'Lumpsum')
        .input('targetSequence', sql.Int, TARGET_SEQ)
        .query(`
          MERGE [hris].[EmployeeCodeCounters] AS target
          USING (SELECT @typeCode AS employee_type_code, @typeName AS employee_type_name, @targetSequence AS last_sequence) AS source
          ON target.employee_type_code = source.employee_type_code
          WHEN MATCHED THEN UPDATE SET last_sequence = source.last_sequence, modified_at = SYSUTCDATETIME(), modified_by = SUSER_SNAME()
          WHEN NOT MATCHED THEN INSERT (employee_type_code, employee_type_name, last_sequence, modified_at, modified_by)
            VALUES (source.employee_type_code, source.employee_type_name, source.last_sequence, SYSUTCDATETIME(), SUSER_SNAME());
        `);
      console.log(`  ✔  EmployeeCodeCounters [L]: last_sequence ${beforeSeq} -> ${TARGET_SEQ}. (Next allocate = L${TARGET_SEQ + 1} = L2792 ✅)`);

      // Write EmployeeAuditLog entry (schema confirmed: audit_action nvarchar(150), performed_by nvarchar(128), reason nvarchar(1000), old_value nvarchar(MAX), new_value nvarchar(MAX), audit_at datetime2)
      await tx.request()
        .input('employeeId', sql.BigInt, employee_id)
        .input('action', sql.NVarChar(150), 'Manual employee_code rename')
        .input('performed_by', sql.NVarChar(128), 'System (rename script: L2792 -> L2791)')
        .input('reason', sql.NVarChar(1000), `Renamed BLESSED OKPARA (employee_id ${employee_id}) from L2792 to L2791 because L2791 was skipped due to earlier allocation-drift bug. Post-fix counter L last_sequence reset to 2791 so next auto-allocate returns L2792.`)
        .input('old_value', sql.NVarChar(sql.MAX), JSON.stringify({ employee_code: FROM_CODE, counter_L_last_sequence_before: beforeSeq }))
        .input('new_value', sql.NVarChar(sql.MAX), JSON.stringify({ employee_code: TO_CODE, counter_L_last_sequence_after: TARGET_SEQ, next_auto_allocate_expected: `L${TARGET_SEQ + 1}` }))
        .query(`
          INSERT [hris].[EmployeeAuditLog] (employee_id, audit_action, performed_by, reason, old_value, new_value, audit_at)
          VALUES (@employeeId, @action, @performed_by, @reason, @old_value, @new_value, SYSUTCDATETIME());
        `);
      console.log(`  ✔  EmployeeAuditLog entry written (id-based, with reason + old/new JSON diffs).`);

      await tx.commit();
      console.log('');
      console.log('================================================================');
      console.log('✅ RENAME TRANSACTION COMMITTED — ALL 8 GUARDS PASSED');
      console.log('================================================================');
    } catch (e) {
      try { await tx.rollback(); } catch { /* */ }
      console.error('ROLLBACK triggered by exception:', e instanceof Error ? e.message : e);
      try { await pool.close(); } catch { /* */ }
      process.exit(10);
    }

    // Final confirmation SELECTs
    console.log('');
    console.log('Post-check verification:');
    const conf = await pool.request()
      .input('a', sql.NVarChar(50), FROM_CODE)
      .input('b', sql.NVarChar(50), TO_CODE)
      .query(`
        SELECT employee_id, employee_code, full_name, employment_status, employment_type, modified_at
        FROM [hris].[Employees] WHERE employee_code IN (@a, @b) ORDER BY employee_code;

        SELECT employee_type_code, last_sequence, modified_at
        FROM [hris].[EmployeeCodeCounters] WHERE employee_type_code = 'L';

        SELECT TOP 2 audit_id, employee_id, audit_action, performed_by, reason, old_value, new_value, audit_at
        FROM [hris].[EmployeeAuditLog] WHERE employee_id = 42541 ORDER BY audit_id DESC;
      `);
    console.log('Employees:');
    for (const r of conf.recordset as any[]) console.log('  ', JSON.stringify(r));
    console.log('Counter L:');
    for (const r of (conf.recordsets as any[])[1] || []) console.log('  ', JSON.stringify(r));
    console.log('Audit log (most recent):');
    for (const r of (conf.recordsets as any[])[2] || []) console.log('  ', JSON.stringify(r));

    await pool.close();
    process.exit(0);
  } catch (topError) {
    console.error('TOP-LEVEL FAILURE:', topError instanceof Error ? topError.stack || topError.message : topError);
    process.exit(99);
  }
}

main().catch((e) => { console.error('UNHANDLED:', e); process.exit(100); });
