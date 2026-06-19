const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');

const loadEnv = () => {
  for (const file of [path.join(process.cwd(), '.env'), path.join(process.cwd(), 'apps', 'dashboard', '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  }
};

const clean = (value) => String(value ?? '').trim();
const nullable = (value) => {
  const text = clean(value);
  return text || null;
};
const concatAddress = (...parts) => parts.map(clean).filter(Boolean).join(', ');

const employeeCode = (rawCode) => {
  const code = clean(rawCode).replace(/_/g, '').toUpperCase();
  if (!code) return '';
  if (/^(P|C|L|IT|NYSC|N|I)/.test(code)) return code;
  return `P${code}`;
};

const fullName = (row) => {
  const firstNames = clean(row.firstNames);
  const middleName = clean(row.middleName);
  return [
    clean(row.title),
    firstNames,
    middleName && !firstNames.toLowerCase().includes(middleName.toLowerCase()) ? middleName : '',
    clean(row.lastName),
  ].filter(Boolean).join(' ') || clean(row.displayName) || employeeCode(row.employeeCode);
};

const sageConfig = () => ({
  server: process.env.SAGE_PAYROLL_DB_HOST || '192.168.5.8',
  port: Number(process.env.SAGE_PAYROLL_DB_PORT || 1433),
  database: process.env.SAGE_PAYROLL_DB_NAME || 'DLE_JUNE',
  user: process.env.SAGE_PAYROLL_DB_USER || 'sa',
  password: process.env.SAGE_PAYROLL_DB_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: process.env.SAGE_PAYROLL_DB_INSTANCE || 'MSSQLSERVERPEOPL',
  },
  connectionTimeout: Number(process.env.SAGE_PAYROLL_DB_CONNECT_TIMEOUT || 15000),
  requestTimeout: Number(process.env.SAGE_PAYROLL_DB_REQUEST_TIMEOUT || 60000),
});

const dleConfig = () => ({
  server: process.env.DLE_ENTERPRISE_DB_HOST || '192.168.5.5',
  port: Number(process.env.DLE_ENTERPRISE_DB_PORT || 1433),
  database: process.env.DLE_ENTERPRISE_DB_NAME || 'DLE_Enterprise',
  user: process.env.DLE_ENTERPRISE_DB_USER || 'sa',
  password: process.env.DLE_ENTERPRISE_DB_PASSWORD || '',
  options: {
    encrypt: String(process.env.DLE_ENTERPRISE_DB_ENCRYPT || 'true').toLowerCase() === 'true',
    trustServerCertificate: String(process.env.DLE_ENTERPRISE_DB_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() === 'true',
  },
  connectionTimeout: 15000,
  requestTimeout: 60000,
});

const readSageEmployees = async () => {
  const pool = await new sql.ConnectionPool(sageConfig()).connect();
  try {
    const result = await pool.request().query(`
      SELECT
        e.EmployeeID AS employeeId,
        e.EmployeeCode AS employeeCode,
        ge.DisplayName AS displayName,
        ed.Title AS title,
        ed.FirstNames AS firstNames,
        ed.SecondName AS middleName,
        ed.LastName AS lastName,
        ed.EmailAddress AS emailAddress,
        ed.CellNo AS cellNo,
        ed.HomeTelNo AS homeTelNo,
        ed.WorkTelNo AS workTelNo,
        CONCAT_WS(', ',
          NULLIF(LTRIM(RTRIM(ed.PhysicalUnitPostalNumber)), ''),
          NULLIF(LTRIM(RTRIM(ed.PhysicalComplex)), ''),
          NULLIF(LTRIM(RTRIM(ed.PhysicalStreetNumber)), ''),
          NULLIF(LTRIM(RTRIM(ed.PhysicalStreetFarmName)), ''),
          NULLIF(LTRIM(RTRIM(ed.PhysicalSuburbDistrict)), '')
        ) AS physicalStreetAddress,
        ed.PhysicalCityTown AS physicalCityTown,
        ed.PhysicalProvince AS physicalProvince,
        ed.PhysicalCountryCode AS physicalCountryCode,
        ed.PhysicalPostalCode AS physicalPostalCode,
        COALESCE(NULLIF(LTRIM(RTRIM(ed.PostalConcat)), ''), CONCAT_WS(', ',
          NULLIF(LTRIM(RTRIM(ed.PostalUnitPostalNumber)), ''),
          NULLIF(LTRIM(RTRIM(ed.PostalComplex)), ''),
          NULLIF(LTRIM(RTRIM(ed.PostalStreetNumber)), ''),
          NULLIF(LTRIM(RTRIM(ed.PostalStreetFarmName)), ''),
          NULLIF(LTRIM(RTRIM(ed.PostalSuburbDistrict)), '')
        )) AS postalStreetAddress,
        ed.PostalCityTown AS postalCityTown,
        ed.PostalProvince AS postalProvince,
        ed.PostalPostalCode AS postalPostalCode
      FROM Employee.Employee e
      JOIN Entity.GenEntity ge ON ge.GenEntityID = e.GenEntityID
      JOIN Company.Company c ON c.CompanyID = e.CompanyID
      LEFT JOIN Employee.EmployeeStatus es ON es.EmployeeStatusID = e.EmployeeStatusID
      LEFT JOIN Employee.EmployeeDetail ed ON ed.EmployeeID = e.EmployeeID
      WHERE e.TerminationDate IS NULL
        AND ISNULL(es.Code, 'A') = 'A'
        AND ge.Status = 'A'
        AND c.Status = 'A'
      ORDER BY e.EmployeeCode;
    `);
    return result.recordset;
  } finally {
    await pool.close();
  }
};

const syncEmployees = async (rows) => {
  const pool = await new sql.ConnectionPool(dleConfig()).connect();
  let updated = 0;
  let skipped = 0;
  try {
    for (const row of rows) {
      const code = employeeCode(row.employeeCode);
      if (!code) {
        skipped += 1;
        continue;
      }

      const residentialAddress = nullable(row.physicalStreetAddress);
      const permanentAddress = nullable(row.postalStreetAddress) || residentialAddress;
      const request = pool.request()
        .input('employee_code', sql.NVarChar(50), code)
        .input('source_employee_id', sql.NVarChar(80), String(row.employeeId))
        .input('full_name', sql.NVarChar(250), fullName(row))
        .input('title', sql.NVarChar(30), nullable(row.title))
        .input('first_name', sql.NVarChar(100), nullable(row.firstNames) || fullName(row))
        .input('middle_name', sql.NVarChar(100), nullable(row.middleName))
        .input('last_name', sql.NVarChar(100), nullable(row.lastName) || fullName(row))
        .input('official_email', sql.NVarChar(320), nullable(row.emailAddress))
        .input('primary_phone', sql.NVarChar(50), nullable(row.cellNo))
        .input('alternate_phone', sql.NVarChar(50), nullable(row.homeTelNo || row.workTelNo))
        .input('office_extension', sql.NVarChar(30), nullable(row.workTelNo))
        .input('residential_address', sql.NVarChar(1000), residentialAddress)
        .input('permanent_address', sql.NVarChar(1000), permanentAddress)
        .input('city', sql.NVarChar(120), nullable(row.physicalCityTown || row.postalCityTown))
        .input('state', sql.NVarChar(120), nullable(row.physicalProvince || row.postalProvince))
        .input('country', sql.NVarChar(120), nullable(row.physicalCountryCode))
        .input('postal_code', sql.NVarChar(30), nullable(row.physicalPostalCode || row.postalPostalCode));

      const result = await request.query(`
        DECLARE @employee_id bigint;
        DECLARE @safe_official_email nvarchar(320) = NULLIF(@official_email, N'');

        SELECT @employee_id = employee_id
        FROM [hris].[EmployeeSourceRecords] WITH (UPDLOCK, HOLDLOCK)
        WHERE source_system = N'Sage 300 People Payroll'
          AND source_employee_id = @source_employee_id;

        IF @employee_id IS NULL
        BEGIN
          SELECT @employee_id = employee_id
          FROM [hris].[Employees] WITH (UPDLOCK, HOLDLOCK)
          WHERE employee_code = @employee_code;
        END;

        IF @employee_id IS NULL
          RETURN;

        UPDATE [hris].[Employees]
        SET full_name = @full_name,
            modified_at = SYSUTCDATETIME(),
            modified_by = N'Sage employee name/address sync'
        WHERE employee_id = @employee_id;

        MERGE [hris].[EmployeePersonalInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          title = @title,
          first_name = @first_name,
          middle_name = @middle_name,
          last_name = @last_name,
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (employee_id, title, first_name, middle_name, last_name)
        VALUES (@employee_id, @title, @first_name, @middle_name, @last_name);

        IF @safe_official_email IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM [hris].[EmployeeContactInfo]
            WHERE official_email = @safe_official_email AND employee_id <> @employee_id
          )
        BEGIN
          SET @safe_official_email = NULL;
        END;

        MERGE [hris].[EmployeeContactInfo] AS target
        USING (SELECT @employee_id AS employee_id) AS source
        ON target.employee_id = source.employee_id
        WHEN MATCHED THEN UPDATE SET
          official_email = COALESCE(@safe_official_email, target.official_email),
          primary_phone = COALESCE(@primary_phone, target.primary_phone),
          alternate_phone = COALESCE(@alternate_phone, target.alternate_phone),
          office_extension = COALESCE(@office_extension, target.office_extension),
          residential_address = COALESCE(@residential_address, target.residential_address),
          permanent_address = COALESCE(@permanent_address, target.permanent_address),
          city = COALESCE(@city, target.city),
          state = COALESCE(@state, target.state),
          country = COALESCE(@country, target.country),
          postal_code = COALESCE(@postal_code, target.postal_code),
          modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          employee_id, official_email, primary_phone, alternate_phone, office_extension,
          residential_address, permanent_address, city, state, country, postal_code
        )
        VALUES (
          @employee_id, @safe_official_email, @primary_phone, @alternate_phone, @office_extension,
          @residential_address, @permanent_address, @city, @state, @country, @postal_code
        );

        SELECT 1 AS synced;
      `);
      if (result.recordset?.[0]?.synced) updated += 1;
      else skipped += 1;
    }
  } finally {
    await pool.close();
  }
  return { updated, skipped };
};

(async () => {
  loadEnv();
  const rows = await readSageEmployees();
  const withAddress = rows.filter((row) => clean(row.physicalStreetAddress) || clean(row.postalStreetAddress)).length;
  const result = await syncEmployees(rows);
  console.log(JSON.stringify({ sageRows: rows.length, sageRowsWithAddress: withAddress, ...result }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
