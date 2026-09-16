import { Pool, types, type QueryResultRow } from "pg";
import { env } from "./env";

// DATE columns come back as plain 'YYYY-MM-DD' strings instead of local-midnight Dates.
types.setTypeParser(1082, (value) => value);
// int8 (count(*)) as number; our magnitudes are far below 2^53.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

declare global {
  var __bgtPool: Pool | undefined;
}

/**
 * Neon connection strings carry sslmode=require, whose meaning in node-postgres
 * is changing (and currently skips certificate verification). Drop the URL's
 * ssl params and ask for verified TLS explicitly.
 */
function withoutSslParams(connectionString: string): string {
  const url = new URL(connectionString);
  for (const key of ["sslmode", "channel_binding", "uselibpqcompat"]) url.searchParams.delete(key);
  return url.toString();
}

export function getPool(): Pool {
  if (!globalThis.__bgtPool) {
    globalThis.__bgtPool = new Pool({
      connectionString: withoutSslParams(env.databaseUrl),
      ssl: { rejectUnauthorized: true },
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
  }
  return globalThis.__bgtPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
