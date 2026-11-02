import { TABLE_NAMES, type Syncable, type TableMap, type TableName } from '../types';
import { clearLegacyUnitCount, legacyQuestionLogs, normalizeMany, resolveTable } from '../db/migrate';

export const SNAPSHOT_VERSION = 3;

export interface Snapshot {
  app: 'study-space';
  version: 3;
  exportedAt: number;
  tables: { [K in TableName]: TableMap[K][] };
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** Last write wins. Ties keep the local record so merging is stable. */
export function pickNewer<T extends Syncable>(local: T | undefined, incoming: T): T {
  if (!local) return incoming;
  return incoming.updatedAt > local.updatedAt ? incoming : local;
}

export interface MergeResult<T extends Syncable> {
  merged: T[];
  /** Incoming records that replaced or added to local data. */
  changed: T[];
}

export function mergeRecords<T extends Syncable>(local: T[], incoming: T[]): MergeResult<T> {
  const byId = new Map<string, T>();
  for (const r of local) byId.set(r.id, pickNewer(byId.get(r.id), r));
  const changed = new Map<string, T>();
  for (const r of incoming) {
    const current = byId.get(r.id);
    const winner = pickNewer(current, r);
    if (winner !== current) {
      byId.set(r.id, winner);
      changed.set(r.id, winner);
    }
  }
  return { merged: [...byId.values()], changed: [...changed.values()] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isSyncable(v: unknown): v is Syncable {
  return isRecord(v) && typeof v.id === 'string' && v.id.length > 0 && typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt);
}

/**
 * Validates a version 1 or version 2 snapshot and returns it as version 2. Version 1 table
 * names are mapped, and every record is normalized. Throws SnapshotError with a readable reason.
 */
export function validateSnapshot(value: unknown): Snapshot {
  if (!isRecord(value)) throw new SnapshotError('The file is not a Study Space backup.');
  if (value.app !== 'study-space') throw new SnapshotError('This backup was not exported from Study Space.');
  if (value.version !== 1 && value.version !== 2 && value.version !== 3) throw new SnapshotError(`Backup version ${String(value.version)} is not supported.`);
  if (!isRecord(value.tables)) throw new SnapshotError('The backup has no tables.');

  const tables = Object.fromEntries(TABLE_NAMES.map((n) => [n, [] as Syncable[]])) as Record<TableName, Syncable[]>;
  const rawTasks: unknown[] = [];
  const rawChapters: unknown[] = [];
  for (const [rawName, rows] of Object.entries(value.tables)) {
    const name = resolveTable(rawName);
    if (!name) continue;
    if (!Array.isArray(rows)) throw new SnapshotError(`Table "${rawName}" is not a list.`);
    rows.forEach((r, i) => {
      if (!isSyncable(r)) throw new SnapshotError(`Row ${i + 1} in "${rawName}" is missing an id or updatedAt.`);
    });
    if (name === 'tasks') rawTasks.push(...rows);
    if (name === 'chapters') rawChapters.push(...rows);
    const clean = name === 'tasks' && value.version !== 3 ? rows.map((r) => clearLegacyUnitCount(r as Record<string, unknown>)) : rows;
    tables[name].push(...normalizeMany(name, clean));
  }
  // Older backups kept question counts on tasks and chapters. The ids match the ones the
  // database upgrade writes, so importing after upgrading does not count them twice.
  if (value.version !== 3) tables.questionLogs.push(...legacyQuestionLogs(rawTasks, rawChapters, 1));
  return {
    app: 'study-space',
    version: 3,
    exportedAt: typeof value.exportedAt === 'number' ? value.exportedAt : Date.now(),
    tables: tables as Snapshot['tables'],
  };
}

export function parseSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SnapshotError('The file is not valid JSON.');
  }
  return validateSnapshot(parsed);
}
