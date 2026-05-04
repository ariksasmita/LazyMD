export interface Note {
  id: string
  title: string
  content: string
  created_at: number
  updated_at: number
  gdrive_file_id: string | null
  gdrive_modified: number | null
  is_deleted: boolean
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'offline'
  lastSyncAt: number | null
  error: string | null
  pendingCount: number
}

export type WorkerMessage =
  | { type: 'INIT' }
  | { type: 'QUERY'; id: string; sql: string; params?: unknown[] }
  | { type: 'EXEC'; id: string; sql: string; params?: unknown[] }
  | { type: 'CLOSE' }

export type WorkerResponse =
  | { type: 'READY' }
  | { type: 'RESULT'; id: string; data: unknown }
  | { type: 'ERROR'; id: string; error: string }
