import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SnapshotError, mergeRecords, parseSnapshot, pickNewer, validateSnapshot } from '../src/sync/snapshot';
import type { Syncable } from '../src/types';

const RUNS = { numRuns: 300 };

interface Rec extends Syncable {
  value: number;
}

const arbRecords = fc.array(
  fc.record({
    id: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'),
    updatedAt: fc.integer({ min: 1, max: 50 }),
    value: fc.integer(),
    deleted: fc.boolean(),
  }),
  { maxLength: 20 },
) as fc.Arbitrary<Rec[]>;

const maxById = (list: Rec[]) => {
  const m = new Map<string, number>();
  for (const r of list) m.set(r.id, Math.max(m.get(r.id) ?? 0, r.updatedAt));
  return m;
};

const stampMap = (list: Rec[]) => new Map(list.map((r) => [r.id, r.updatedAt]));

describe('Snapshot merge (last write wins)', () => {
  it('keeps the newest version of every record, tombstones included', () => {
    fc.assert(
      fc.property(arbRecords, arbRecords, (local, incoming) => {
        const { merged } = mergeRecords(local, incoming);
        expect(stampMap(merged)).toEqual(maxById([...local, ...incoming]));
        expect(new Set(merged.map((r) => r.id)).size).toBe(merged.length);
      }),
      RUNS,
    );
  });

  it('merging the same data twice changes nothing the second time', () => {
    fc.assert(
      fc.property(arbRecords, arbRecords, (local, incoming) => {
        const first = mergeRecords(local, incoming);
        const second = mergeRecords(first.merged, incoming);
        expect(second.changed).toHaveLength(0);
        expect(stampMap(second.merged)).toEqual(stampMap(first.merged));
      }),
      RUNS,
    );
  });

  it('the result does not depend on the order records arrive in', () => {
    fc.assert(
      fc.property(arbRecords, arbRecords, fc.func(fc.integer()), (local, incoming, key) => {
        const shuffled = [...incoming].sort((x, y) => key(x.id + x.updatedAt) - key(y.id + y.updatedAt));
        expect(stampMap(mergeRecords(local, shuffled).merged)).toEqual(stampMap(mergeRecords(local, incoming).merged));
      }),
      RUNS,
    );
  });

  it('a newer tombstone removes a record and an older one does not', () => {
    const live: Rec = { id: 'x', updatedAt: 10, value: 1 };
    expect(pickNewer(live, { id: 'x', updatedAt: 11, value: 1, deleted: true }).deleted).toBe(true);
    expect(pickNewer(live, { id: 'x', updatedAt: 9, value: 1, deleted: true }).deleted).toBeUndefined();
    expect(pickNewer(live, { id: 'x', updatedAt: 10, value: 2 })).toBe(live);
  });
});

describe('Snapshot validation', () => {
  const good = {
    app: 'study-space',
    version: 2,
    exportedAt: 5,
    tables: { tasks: [{ id: 't1', updatedAt: 3 }], focusSessions: [] },
  };

  it('accepts a valid snapshot and fills in missing tables', () => {
    const s = validateSnapshot(good);
    expect(s.version).toBe(3);
    expect(s.tables.tasks).toHaveLength(1);
    expect(s.tables.tasks[0]).toMatchObject({ id: 't1', targetMode: 'pomodoro', repeat: { kind: 'never' } });
    expect(s.tables.quickNotes).toEqual([]);
    expect(s.tables.hydrationLogs).toEqual([]);
    expect(parseSnapshot(JSON.stringify(good)).tables.tasks[0].id).toBe('t1');
  });

  it('converts a version 1 backup to the version 2 tables', () => {
    const v1 = {
      app: 'study-space',
      version: 1,
      exportedAt: 7,
      tables: {
        sessions: [{ id: 's1', updatedAt: 4, taskId: null, subjectId: 'a', category: 'current', quickRevision: false, segments: [{ start: 1000, end: 61_000 }], plannedMinutes: 25, createdAt: 1000 }],
        notes: [{ id: 'n1', updatedAt: 4, text: 'Ask about flux', topic: 'Gauss Law', mode: '25m focus', status: 'open', createdAt: 9 }],
        settings: [{ id: 'app', updatedAt: 4, studentName: 'Asha', dailyGoalMinutes: 180 }],
        retiredTable: [{ id: 'r', updatedAt: 1 }],
      },
    };
    const s = validateSnapshot(v1);
    expect(s.version).toBe(3);
    expect(s.tables.focusSessions).toHaveLength(1);
    expect(s.tables.focusSessions[0]).toMatchObject({ mode: 'pomodoro', status: 'completed', durationMs: 60_000, start: 1000, end: 61_000 });
    expect(s.tables.quickNotes[0]).toMatchObject({ context: 'Gauss Law, 25m focus', resolved: false });
    expect(s.tables.userSettings[0]).toMatchObject({ id: 'app', displayName: 'Asha', dailyGoalMinutes: 180 });
    expect(Object.keys(s.tables)).not.toContain('sessions');
    expect(Object.keys(s.tables)).not.toContain('retiredTable');
  });

  it.each([
    ['not JSON', '{oops'],
    ['another app', JSON.stringify({ ...good, app: 'other' })],
    ['a future version', JSON.stringify({ ...good, version: 4 })],
    ['no tables', JSON.stringify({ app: 'study-space', version: 1 })],
    ['a table that is not a list', JSON.stringify({ ...good, tables: { tasks: {} } })],
    ['a row without updatedAt', JSON.stringify({ ...good, tables: { tasks: [{ id: 't1' }] } })],
  ])('rejects %s with a readable message', (_label, text) => {
    expect(() => parseSnapshot(text)).toThrow(SnapshotError);
  });
});
