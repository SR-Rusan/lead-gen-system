/** Small key/value settings stored in the database (e.g. the follow-up backup switch). */
import { ensureSchema, getSql } from './pg';

let ready: Promise<void> | null = null;
async function table() {
  const sql = getSql();
  if (!ready) {
    ready = (async () => {
      await ensureSchema(sql);
      await sql`create table if not exists settings (key text primary key, value jsonb not null)`;
    })().catch((e) => { ready = null; throw e; });
  }
  await ready;
  return sql;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const sql = await table();
  const rows = await sql<{ value: T }[]>`select value from settings where key = ${key}`;
  return rows.length ? rows[0].value : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const sql = await table();
  await sql`insert into settings (key, value) values (${key}, ${sql.json(value as any)}) on conflict (key) do update set value = excluded.value`;
}
