import postgres from 'postgres';
import { ProspectMasterRecord } from '../types';

/** Connection string for the cloud database, or '' when running on local files. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

let sqlClient: postgres.Sql | null = null;

export function getSql(url = databaseUrl()): postgres.Sql {
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!sqlClient) {
    // prepare:false keeps it compatible with pooled (pgbouncer-style) connection strings.
    sqlClient = postgres(url, { ssl: 'require', max: 3, prepare: false, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
  }
  return sqlClient;
}

export async function closeSql(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
  }
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(sql = getSql()): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists prospects (
          lead_id    text primary key,
          data       jsonb not null,
          updated_at timestamptz not null default now()
        )`;
      await sql`
        create table if not exists login_failures (
          ip text not null,
          at timestamptz not null default now()
        )`;
      await sql`create index if not exists login_failures_ip_at on login_failures (ip, at)`;
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export async function fetchAllProspects(sql = getSql()): Promise<ProspectMasterRecord[]> {
  await ensureSchema(sql);
  const rows = await sql<{ data: ProspectMasterRecord }[]>`select data from prospects order by updated_at desc`;
  return rows.map((r) => r.data);
}

export async function upsertProspect(record: ProspectMasterRecord, sql = getSql()): Promise<void> {
  await ensureSchema(sql);
  await sql`
    insert into prospects (lead_id, data, updated_at)
    values (${record.leadId}, ${sql.json(record as any)}, now())
    on conflict (lead_id) do update set data = excluded.data, updated_at = now()`;
}

/** Inserts records whose leadId is not in the cloud yet. Returns how many were added. */
export async function insertMissingProspects(records: ProspectMasterRecord[], sql = getSql()): Promise<number> {
  await ensureSchema(sql);
  let added = 0;
  for (const record of records) {
    const result = await sql`
      insert into prospects (lead_id, data) values (${record.leadId}, ${sql.json(record as any)})
      on conflict (lead_id) do nothing`;
    added += result.count;
  }
  return added;
}
