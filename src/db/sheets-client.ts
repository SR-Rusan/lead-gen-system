import * as fs from 'fs';
import * as path from 'path';
import { ProspectMasterRecord, PipelineStatus } from '../types';
import { MASTER_SHEET_HEADERS, recordToRow, rowToRecord } from './schema';
import { CONFIG } from '../config';
import { databaseUrl, fetchAllProspects, upsertProspect } from './pg';

const DATA_DIR = path.resolve(__dirname, '../../data');
const LOCAL_CSV_PATH = path.join(DATA_DIR, 'master_prospects.csv');
const LOCAL_JSON_PATH = path.join(DATA_DIR, 'master_prospects.json');

/**
 * Lead store. Two modes:
 * - Cloud: when DATABASE_URL (or POSTGRES_URL) is set, records live in Postgres. Call `await ready()` before
 *   reading and `await flush()` before finishing, so reads are fresh and writes are saved.
 * - Local: otherwise records live in data/master_prospects.json (+ .csv); ready() and flush() do nothing.
 */
export class DatabaseClient {
  private cache: Map<string, ProspectMasterRecord> = new Map();
  public readonly cloud: boolean;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: unknown = null;

  constructor() {
    this.cloud = Boolean(databaseUrl());
    // On Vercel the disk is read-only, so without a database there is simply no data.
    if (!this.cloud && !process.env.VERCEL) {
      this.ensureStorage();
      this.loadFromDisk();
    }
  }

  /** Reloads every record from the cloud database (no-op on local files). */
  public async ready(): Promise<void> {
    if (!this.cloud) return;
    const list = await fetchAllProspects();
    this.cache = new Map(list.map((r) => [r.leadId, r]));
  }

  /** Waits until every queued cloud write is saved; throws if one failed. */
  public async flush(): Promise<void> {
    await this.writeChain;
    if (this.writeError) {
      const err = this.writeError;
      this.writeError = null;
      throw err;
    }
  }

  private persist(records: ProspectMasterRecord[]): void {
    if (!this.cloud) {
      this.saveToDisk();
      return;
    }
    // Snapshot now: callers keep mutating the same objects after upsert().
    const snapshots = records.map((r) => JSON.parse(JSON.stringify(r)) as ProspectMasterRecord);
    this.writeChain = this.writeChain.then(async () => {
      try {
        for (const snap of snapshots) await upsertProspect(snap);
      } catch (err) {
        console.error('[DatabaseClient] Cloud write failed:', err);
        this.writeError = err;
      }
    });
  }

  private ensureStorage(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOCAL_CSV_PATH)) {
      const headerLine = MASTER_SHEET_HEADERS.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
      fs.writeFileSync(LOCAL_CSV_PATH, headerLine + '\n', 'utf8');
    }
    if (!fs.existsSync(LOCAL_JSON_PATH)) {
      fs.writeFileSync(LOCAL_JSON_PATH, JSON.stringify([], null, 2), 'utf8');
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(LOCAL_JSON_PATH)) {
        const raw = fs.readFileSync(LOCAL_JSON_PATH, 'utf8');
        const list: ProspectMasterRecord[] = JSON.parse(raw);
        for (const item of list) {
          this.cache.set(item.leadId, item);
        }
      }
    } catch (err) {
      console.error('[DatabaseClient] Error loading local cache:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const records = Array.from(this.cache.values());
      fs.writeFileSync(LOCAL_JSON_PATH, JSON.stringify(records, null, 2), 'utf8');

      // Also serialize to CSV
      const lines = [MASTER_SHEET_HEADERS.map((h) => `"${h.replace(/"/g, '""')}"`).join(',')];
      for (const rec of records) {
        const row = recordToRow(rec);
        const csvLine = row
          .map((v) => {
            const str = String(v ?? '');
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',');
        lines.push(csvLine);
      }
      fs.writeFileSync(LOCAL_CSV_PATH, lines.join('\n') + '\n', 'utf8');
    } catch (err) {
      console.error('[DatabaseClient] Error saving local database:', err);
    }
  }

  public getAll(): ProspectMasterRecord[] {
    return Array.from(this.cache.values());
  }

  public getById(leadId: string): ProspectMasterRecord | undefined {
    return this.cache.get(leadId);
  }

  public getByStatus(status: PipelineStatus): ProspectMasterRecord[] {
    return Array.from(this.cache.values()).filter((r) => r.status === status);
  }

  public getRawLeads(): ProspectMasterRecord[] {
    return this.getByStatus('Raw');
  }

  public getReviewReadyLeads(): ProspectMasterRecord[] {
    return this.getByStatus('Ready for Review');
  }

  public upsert(record: ProspectMasterRecord): void {
    this.cache.set(record.leadId, record);
    this.persist([record]);
  }

  public upsertBatch(records: ProspectMasterRecord[]): void {
    for (const r of records) {
      this.cache.set(r.leadId, r);
    }
    this.persist(records);
  }

  public updateStatus(leadId: string, status: PipelineStatus, notes?: string): ProspectMasterRecord | null {
    const existing = this.cache.get(leadId);
    if (!existing) return null;
    existing.status = status;
    if (notes) {
      existing.notes = existing.notes ? `${existing.notes} | ${notes}` : notes;
    }
    this.cache.set(leadId, existing);
    this.persist([existing]);
    return existing;
  }

  public getCsvExportPath(): string {
    return LOCAL_CSV_PATH;
  }

  public getJsonExportPath(): string {
    return LOCAL_JSON_PATH;
  }
}

export const dbClient = new DatabaseClient();
