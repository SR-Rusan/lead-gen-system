/**
 * Moves leads between this Mac (data/master_prospects.json) and the cloud dashboard database.
 *   npm run db:push  -> uploads local leads the cloud doesn't have yet (never overwrites online decisions)
 *   npm run db:pull  -> replaces local records with the cloud versions (so approvals made online show here)
 * The connection string comes from $DATABASE_URL or the macOS Keychain item "axioms-leads-db".
 */
import { execFileSync } from 'child_process';
import { DatabaseClient } from '../src/db/sheets-client';
import { closeSql, fetchAllProspects, getSql, insertMissingProspects } from '../src/db/pg';

function connectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'axioms-leads-db', '-w'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    console.error('No database connection found (set DATABASE_URL or add Keychain item "axioms-leads-db").');
    process.exit(1);
  }
}

(async () => {
  const mode = process.argv[2];
  if (mode !== 'push' && mode !== 'pull') {
    console.error('Usage: db_sync.ts push|pull');
    process.exit(1);
  }
  const sql = getSql(connectionString());
  const local = new DatabaseClient(); // local file mode (DATABASE_URL is not set in this process)
  try {
    if (mode === 'push') {
      const records = local.getAll();
      const added = await insertMissingProspects(records, sql);
      console.log(`Pushed: ${added} new of ${records.length} local leads (existing cloud leads left as they are).`);
    } else {
      const cloud = await fetchAllProspects(sql);
      local.upsertBatch(cloud);
      console.log(`Pulled: ${cloud.length} leads from the cloud into data/master_prospects.json.`);
    }
  } finally {
    await closeSql();
  }
})().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
