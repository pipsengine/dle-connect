import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

export async function getPmPool() {
  if (pool?.connected) return pool;
  const connectionString = process.env.DLE_SQL_CONNECTION_STRING;
  if (!connectionString) throw new Error('DLE_SQL_CONNECTION_STRING is not configured');
  pool = await sql.connect(connectionString);
  return pool;
}

export async function pmQuery<T = unknown>(text: string, params: Record<string, unknown> = {}) {
  const p = await getPmPool();
  const req = p.request();
  Object.entries(params).forEach(([key, value]) => req.input(key, value as never));
  const result = await req.query<T>(text);
  return result.recordset;
}
