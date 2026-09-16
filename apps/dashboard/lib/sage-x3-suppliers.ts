import sql from 'mssql';
import { loadWorkspaceEnv } from '@/lib/dle-enterprise-db';

export type SageX3Supplier = {
  sageCode: string;
  name: string;
  shortName: string | null;
  contactName: string | null;
  currency: string | null;
  paymentTerms: string | null;
  deliveryLocation: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  addressLine: string | null;
  city: string | null;
  stateName: string | null;
  country: string | null;
  postalCode: string | null;
  taxId: string | null;
  registrationNo: string | null;
  isActive: boolean;
  isBlacklisted: boolean;
};

type NamedTable = { schemaName: string; tableName: string };

const boolEnv = (value: string | undefined, fallback: boolean) => {
  if (value == null || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
};

const trim = (value: unknown) => String(value ?? '').trim();

const pick = (row: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    const match = Object.keys(row).find((key) => key.toLowerCase() === name.toLowerCase());
    if (!match) continue;
    const text = trim(row[match]);
    if (text) return text;
  }
  return null;
};

const COUNTRY_NAMES: Record<string, string> = {
  NGA: 'Nigeria',
  GH: 'Ghana',
  GHA: 'Ghana',
  GB: 'United Kingdom',
  GBR: 'United Kingdom',
  UK: 'United Kingdom',
  US: 'United States',
  USA: 'United States',
  ZA: 'South Africa',
  ZAF: 'South Africa',
  CM: 'Cameroon',
  CMR: 'Cameroon',
  KE: 'Kenya',
  KEN: 'Kenya',
  CN: 'China',
  CHN: 'China',
  IN: 'India',
  IND: 'India',
  AE: 'United Arab Emirates',
  ARE: 'United Arab Emirates',
  DE: 'Germany',
  DEU: 'Germany',
  FR: 'France',
  FRA: 'France',
};

const prettyCountry = (value: string | null) => {
  if (!value) return null;
  return COUNTRY_NAMES[value.toUpperCase()] || value;
};

const sageX3Attempts = (): sql.config[] => {
  loadWorkspaceEnv();
  const database = process.env.SAGE_X3_DB_NAME || 'x3data';
  const user = process.env.SAGE_X3_DB_USER || 'sage';
  const password = process.env.SAGE_X3_DB_PASSWORD || '';
  const instance = process.env.SAGE_X3_DB_INSTANCE || 'SAGEX3';
  const configuredHosts = (process.env.SAGE_X3_DB_HOST || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const hosts = [...new Set(['DLESGENT', ...configuredHosts, '192.168.5.5'])];
  if (!password) {
    throw new Error(
      'Sage X3 credentials are not configured. Set SAGE_X3_DB_PASSWORD in apps/dashboard/.env (instance DLESGENT\\SAGEX3, database x3data).',
    );
  }
  const attempts: sql.config[] = [];
  for (const host of hosts) {
    const base = {
      database,
      user,
      password,
      connectionTimeout: Number(process.env.SAGE_X3_DB_CONNECT_TIMEOUT || 20000),
      requestTimeout: Number(process.env.SAGE_X3_DB_REQUEST_TIMEOUT || 60000),
    };
    attempts.push({
      ...base,
      server: host,
      options: {
        instanceName: instance,
        encrypt: boolEnv(process.env.SAGE_X3_DB_ENCRYPT, false),
        trustServerCertificate: boolEnv(process.env.SAGE_X3_DB_TRUST_SERVER_CERTIFICATE, true),
        enableArithAbort: true,
      },
    });
    attempts.push({
      ...base,
      server: host,
      options: {
        instanceName: instance,
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    });
  }
  return attempts;
};

const connectSageX3 = async () => {
  const attempts = sageX3Attempts();
  let lastError: unknown = null;
  for (const config of attempts) {
    try {
      return await new sql.ConnectionPool(config).connect();
    } catch (error) {
      lastError = error;
    }
  }
  const first = attempts[0];
  const message = lastError instanceof Error ? lastError.message : 'Sage X3 connection failed';
  throw new Error(
    `Unable to read suppliers from Sage X3 (${first?.database} on ${first?.server}\\SAGEX3): ${message}`,
  );
};

const listCandidateTables = async (pool: sql.ConnectionPool) => {
  const result = await pool.request().query(`
    SELECT s.name AS schemaName, t.name AS tableName
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name LIKE N'%BPSUPPLIER%'
       OR t.name LIKE N'%BPARTNER%'
       OR t.name LIKE N'%BPADDRESS%'
       OR t.name LIKE N'%SUPPLIER%'
    ORDER BY s.name, t.name
  `);
  return result.recordset.map((row) => ({
    schemaName: String(row.schemaName),
    tableName: String(row.tableName),
  })) as NamedTable[];
};

const tableHasColumn = async (pool: sql.ConnectionPool, table: NamedTable, column: string) => {
  const result = await pool
    .request()
    .input('SchemaName', sql.NVarChar(128), table.schemaName)
    .input('TableName', sql.NVarChar(128), table.tableName)
    .input('ColumnName', sql.NVarChar(128), column)
    .query(`
      SELECT 1 AS Ok
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @SchemaName AND TABLE_NAME = @TableName AND COLUMN_NAME = @ColumnName
    `);
  return result.recordset.length > 0;
};

const resolveColumn = async (pool: sql.ConnectionPool, table: NamedTable, names: string[]) => {
  for (const name of names) {
    if (await tableHasColumn(pool, table, name)) return name;
  }
  return null;
};

const qn = (table: NamedTable) => `[${table.schemaName}].[${table.tableName}]`;

const pickBestTable = async (pool: sql.ConnectionPool, tables: NamedTable[], pattern: RegExp) => {
  const preferredSchema = (process.env.SAGE_X3_FOLDER || 'DLEX3DATA').toUpperCase();
  const exact = tables.filter((table) => pattern.test(table.tableName));
  let best: { table: NamedTable; score: number } | null = null;
  for (const table of exact) {
    try {
      const result = await pool.request().query(`SELECT COUNT(1) AS Cnt FROM ${qn(table)}`);
      const count = Number(result.recordset[0]?.Cnt || 0);
      const score = count + (table.schemaName.toUpperCase() === preferredSchema ? 1_000_000 : 0);
      if (!best || score > best.score) best = { table, score };
    } catch {
      // Skip tables the login cannot read.
    }
  }
  return best?.table || exact[0] || null;
};

const isEnabledFlag = (value: unknown) => {
  const text = trim(value).toUpperCase();
  if (!text) return true;
  if (text === '1' || text === 'N' || text === 'NO' || text === 'FALSE' || text === '0') return false;
  return true;
};

const isYesFlag = (value: unknown) => {
  const text = trim(value).toUpperCase();
  return text === '2' || text === 'Y' || text === 'YES' || text === 'TRUE';
};

export const fetchDistinctSageX3Suppliers = async () => {
  const pool = await connectSageX3();
  try {
    const tables = await listCandidateTables(pool);
    const supplierTable = await pickBestTable(pool, tables, /^BPSUPPLIER$/i)
      || await pickBestTable(pool, tables, /BPSUPPLIER/i);
    if (!supplierTable) {
      throw new Error('No Sage X3 supplier table was found in x3data.');
    }

    const partnerTable = await pickBestTable(pool, tables, /^BPARTNER$/i);
    const addressTable = await pickBestTable(pool, tables, /^BPADDRESS$/i);

    const supplierCodeCol = await resolveColumn(pool, supplierTable, ['BPSNUM_0', 'BPSNUM']);
    if (!supplierCodeCol) {
      throw new Error(`Sage supplier table ${qn(supplierTable)} does not expose BPSNUM.`);
    }

    const supplierSelect = [`LTRIM(RTRIM(s.[${supplierCodeCol}])) AS SageCode`];
    const nameCol = await resolveColumn(pool, supplierTable, ['BPSNAM_0', 'BPSNAM']);
    const shortCol = await resolveColumn(pool, supplierTable, ['BPSSHO_0', 'BPSSHO']);
    const contactCol = await resolveColumn(pool, supplierTable, ['CNTNAM_0', 'CNTNAM']);
    const currencyCol = await resolveColumn(pool, supplierTable, ['CUR_0', 'CUR']);
    const payCol = await resolveColumn(pool, supplierTable, ['PTE_0', 'PTE']);
    const enabledCol = await resolveColumn(pool, supplierTable, ['ENAFLG_0', 'ENAFLG']);
    const emailCol = await resolveColumn(pool, supplierTable, ['YEMAIL_0', 'YEMAIL', 'CNTEML_0', 'CNTWEB_0', 'EMAIL_0', 'EMAIL']);
    const locCol = await resolveColumn(pool, supplierTable, ['LOC_0', 'LOC']);
    const blacklistCol = await resolveColumn(pool, supplierTable, ['YBLACKLIST_0', 'YBLACKLIST']);
    const regCol = await resolveColumn(pool, supplierTable, ['YREGNO_0', 'YREGNO', 'CRN_0', 'CRN']);
    const supplierTelCol = await resolveColumn(pool, supplierTable, ['CNTTEL_0', 'TEL_0', 'TEL']);
    if (nameCol) supplierSelect.push(`s.[${nameCol}] AS SupplierName`);
    if (shortCol) supplierSelect.push(`s.[${shortCol}] AS ShortName`);
    if (contactCol) supplierSelect.push(`s.[${contactCol}] AS ContactName`);
    if (currencyCol) supplierSelect.push(`s.[${currencyCol}] AS Currency`);
    if (payCol) supplierSelect.push(`s.[${payCol}] AS PaymentTerms`);
    if (enabledCol) supplierSelect.push(`s.[${enabledCol}] AS EnabledFlag`);
    if (emailCol) supplierSelect.push(`s.[${emailCol}] AS SupplierEmail`);
    if (locCol) supplierSelect.push(`s.[${locCol}] AS SupplierLocation`);
    if (blacklistCol) supplierSelect.push(`s.[${blacklistCol}] AS BlacklistFlag`);
    if (regCol) supplierSelect.push(`s.[${regCol}] AS RegistrationNo`);
    if (supplierTelCol) supplierSelect.push(`s.[${supplierTelCol}] AS SupplierPhone`);

    const joins: string[] = [];
    if (partnerTable) {
      const partnerCodeCol = await resolveColumn(pool, partnerTable, ['BPRNUM_0', 'BPRNUM']);
      if (partnerCodeCol) {
        joins.push(`LEFT JOIN ${qn(partnerTable)} p ON p.[${partnerCodeCol}] = s.[${supplierCodeCol}]`);
        const partnerNameCol = await resolveColumn(pool, partnerTable, ['BPRNAM_0', 'BPRNAM']);
        const partnerCountryCol = await resolveColumn(pool, partnerTable, ['CRY_0', 'CRY']);
        const partnerRegCol = await resolveColumn(pool, partnerTable, ['CRN_0', 'CRN']);
        const partnerVatCol = await resolveColumn(pool, partnerTable, ['VATNUM_0', 'VATNO_0', 'VATNUM', 'VATNO']);
        if (partnerNameCol) supplierSelect.push(`p.[${partnerNameCol}] AS PartnerName`);
        if (partnerCountryCol) supplierSelect.push(`p.[${partnerCountryCol}] AS Country`);
        if (partnerRegCol) supplierSelect.push(`p.[${partnerRegCol}] AS PartnerRegNo`);
        if (partnerVatCol) supplierSelect.push(`p.[${partnerVatCol}] AS TaxId`);
      }
    }
    if (addressTable) {
      const addressCodeCol = await resolveColumn(pool, addressTable, ['BPANUM_0', 'BPANUM']);
      if (addressCodeCol) {
        const addressSelect: string[] = [];
        const addrIdCol = await resolveColumn(pool, addressTable, ['BPAADD_0', 'BPAADD']);
        const line0 = await resolveColumn(pool, addressTable, ['BPAADDLIG_0', 'BPAADDLIG']);
        const line1 = await resolveColumn(pool, addressTable, ['BPAADDLIG_1']);
        const line2 = await resolveColumn(pool, addressTable, ['BPAADDLIG_2']);
        const cityCol = await resolveColumn(pool, addressTable, ['CTY_0', 'CTY']);
        const stateCol = await resolveColumn(pool, addressTable, ['SAT_0', 'SAT']);
        const countryNameCol = await resolveColumn(pool, addressTable, ['CRYNAM_0', 'CRYNAM']);
        const postalCol = await resolveColumn(pool, addressTable, ['POSCOD_0', 'POSCOD']);
        const telCol = await resolveColumn(pool, addressTable, ['TEL_0', 'TEL']);
        const mobileCol = await resolveColumn(pool, addressTable, ['MOB_0', 'MOB']);
        const webCol = await resolveColumn(pool, addressTable, ['WEB_0', 'WEB']);
        if (line0) addressSelect.push(`a.[${line0}] AS Addr1`);
        if (line1) addressSelect.push(`a.[${line1}] AS Addr2`);
        if (line2) addressSelect.push(`a.[${line2}] AS Addr3`);
        if (cityCol) addressSelect.push(`a.[${cityCol}] AS City`);
        if (stateCol) addressSelect.push(`a.[${stateCol}] AS StateName`);
        if (countryNameCol) addressSelect.push(`a.[${countryNameCol}] AS CountryName`);
        if (postalCol) addressSelect.push(`a.[${postalCol}] AS PostalCode`);
        if (telCol) addressSelect.push(`a.[${telCol}] AS Phone`);
        if (mobileCol) addressSelect.push(`a.[${mobileCol}] AS Mobile`);
        if (webCol) addressSelect.push(`a.[${webCol}] AS Website`);
        if (addressSelect.length) {
          const orderBits = [
            telCol ? `CASE WHEN NULLIF(LTRIM(RTRIM(a.[${telCol}])), N'') IS NULL THEN 1 ELSE 0 END` : null,
            webCol ? `CASE WHEN NULLIF(LTRIM(RTRIM(a.[${webCol}])), N'') IS NULL THEN 1 ELSE 0 END` : null,
            addrIdCol ? `a.[${addrIdCol}]` : '1',
          ].filter(Boolean);
          joins.push(`
            OUTER APPLY (
              SELECT TOP 1 ${addressSelect.join(', ')}
              FROM ${qn(addressTable)} a
              WHERE a.[${addressCodeCol}] = s.[${supplierCodeCol}]
              ORDER BY ${orderBits.join(', ')}
            ) a
          `);
          supplierSelect.push(
            ...addressSelect.map((bit) => {
              const alias = bit.split(/ AS /i).pop()?.trim();
              return alias ? `a.[${alias}] AS [${alias}]` : bit;
            }),
          );
        }
      }
    }

    const result = await pool.request().query(`
      SELECT ${supplierSelect.join(', ')}
      FROM ${qn(supplierTable)} s
      ${joins.join('\n')}
    `);

    const richness = (supplier: SageX3Supplier) =>
      (supplier.email ? 2 : 0)
      + (supplier.phone ? 2 : 0)
      + (supplier.addressLine ? 1 : 0)
      + (supplier.contactName ? 1 : 0)
      + (supplier.city ? 1 : 0);

    const distinct = new Map<string, SageX3Supplier>();
    for (const raw of result.recordset) {
      const row = raw as Record<string, unknown>;
      const sageCode = pick(row, ['SageCode', 'BPSNUM_0', 'BPSNUM']) || '';
      if (!sageCode) continue;
      const name = pick(row, ['SupplierName', 'PartnerName', 'ShortName']) || sageCode;
      const websiteOrWeb = pick(row, ['Website', 'WEB_0', 'WebEmail']);
      const website = websiteOrWeb && !websiteOrWeb.includes('@') ? websiteOrWeb : null;
      const webEmail = websiteOrWeb && websiteOrWeb.includes('@') ? websiteOrWeb : null;
      const city = pick(row, ['City', 'CTY_0']);
      const stateName = pick(row, ['StateName', 'SAT_0']);
      const country = prettyCountry(pick(row, ['CountryName', 'Country', 'CRYNAM_0', 'CRY_0']));
      const next: SageX3Supplier = {
        sageCode,
        name,
        shortName: pick(row, ['ShortName', 'BPSSHO_0']),
        contactName: pick(row, ['ContactName', 'CNTNAM_0']),
        currency: pick(row, ['Currency', 'CUR_0', 'CUR']),
        paymentTerms: pick(row, ['PaymentTerms', 'PTE_0', 'PTE']),
        deliveryLocation:
          pick(row, ['SupplierLocation', 'LOC_0'])
          || [city, stateName, country].filter(Boolean).join(', ')
          || null,
        email: pick(row, ['SupplierEmail']) || webEmail,
        phone: pick(row, ['Phone', 'SupplierPhone', 'TEL_0', 'TEL']),
        mobile: pick(row, ['Mobile', 'MOB_0']),
        website,
        addressLine: [pick(row, ['Addr1']), pick(row, ['Addr2']), pick(row, ['Addr3'])].filter(Boolean).join(', ') || null,
        city,
        stateName,
        country,
        postalCode: pick(row, ['PostalCode', 'POSCOD_0']),
        taxId: pick(row, ['TaxId', 'VATNUM_0', 'VATNO_0']),
        registrationNo: pick(row, ['RegistrationNo', 'PartnerRegNo', 'YREGNO_0', 'CRN_0']),
        isActive: isEnabledFlag(row.EnabledFlag ?? row.ENAFLG_0 ?? row.ENAFLG),
        isBlacklisted: isYesFlag(row.BlacklistFlag ?? row.YBLACKLIST_0),
      };
      const existing = distinct.get(sageCode);
      if (!existing || richness(next) > richness(existing) || (existing.name === existing.sageCode && next.name !== next.sageCode)) {
        distinct.set(sageCode, next);
      }
    }
    return {
      table: qn(supplierTable),
      suppliers: [...distinct.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  } finally {
    await pool.close();
  }
};
