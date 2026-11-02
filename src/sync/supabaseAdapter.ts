import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { TableName } from '../types';

/**
 * One stored record. table_name may be a version 1 name in rows written by an older device.
 * `data` is the record itself, or an encrypted envelope when end-to-end encryption is on.
 */
export interface CloudRow {
  table_name: TableName | string;
  record_id: string;
  data: unknown;
  updated_at: number;
}

export interface CloudHandlers {
  /** Live items from another device: plain records, or `{ id, data: envelope }` when encrypted. */
  onRecords: (table: string, items: unknown[]) => void;
  onDisconnect: (reason: string) => void;
}

export interface CloudAdapter {
  connect(room: string, handlers: CloudHandlers): Promise<void>;
  pullAll(): Promise<CloudRow[]>;
  push(rows: CloudRow[]): Promise<void>;
  broadcast(table: TableName, items: unknown[]): void;
  disconnect(): Promise<void>;
}

export function cloudConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

const PAGE = 1000;

/**
 * Supabase adapter. Records are stored through two security-definer RPC functions, so the
 * anon key cannot list or read other rooms. Live updates travel over a Realtime Broadcast
 * channel named after the room hash. See README for the SQL.
 */
export async function createSupabaseAdapter(): Promise<CloudAdapter> {
  const { createClient } = await import('@supabase/supabase-js');
  const client: SupabaseClient = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  let room = '';
  let channel: RealtimeChannel | null = null;

  return {
    async connect(nextRoom, handlers) {
      room = nextRoom;
      await new Promise<void>((resolve, reject) => {
        const ch = client.channel(`study-space:${room}`, { config: { broadcast: { self: false, ack: false } } });
        let settled = false;
        ch.on('broadcast', { event: 'records' }, ({ payload }) => {
          const p = payload as { table?: unknown; records?: unknown };
          if (typeof p?.table === 'string' && Array.isArray(p.records)) handlers.onRecords(p.table, p.records);
        });
        ch.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            channel = ch;
            if (!settled) {
              settled = true;
              resolve();
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            const reason = err?.message ?? status.toLowerCase().replace('_', ' ');
            if (!settled) {
              settled = true;
              reject(new Error(`Realtime ${reason}`));
            } else {
              handlers.onDisconnect(reason);
            }
          }
        });
      });
    },

    async pullAll() {
      const rows: CloudRow[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await client.rpc('study_sync_pull', { p_room: room, p_offset: offset, p_limit: PAGE });
        if (error) throw new Error(error.message);
        const page = (data ?? []) as CloudRow[];
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      return rows;
    },

    async push(rows) {
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await client.rpc('study_sync_push', { p_room: room, p_rows: batch });
        if (error) throw new Error(error.message);
      }
    },

    broadcast(table, items) {
      if (!channel) return;
      void channel.send({ type: 'broadcast', event: 'records', payload: { table, records: items } });
    },

    async disconnect() {
      if (channel) await client.removeChannel(channel);
      channel = null;
    },
  };
}
