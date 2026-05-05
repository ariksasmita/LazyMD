// src/composables/useSync.ts
//
// Two-way sync between local SQLite and Google Drive.
// Conflict resolution: Last-Write-Wins (LWW).
//
// Flow:
//   1. Push dirty local notes (updated_at > lastSyncAt) to Drive
//   2. Push deletes (soft-deleted notes with gdrive_file_id) → trash on Drive
//   3. Pull: compare remote mtimes vs local, download if remote is newer
//   4. Create local records for new remote files

import { ref } from 'vue'
import { useDatabase } from './useDatabase'
import {
  initGis,
  login,
  logout,
  isLoggedIn,
  getAppFolderId,
  uploadNote,
  downloadNote,
  listRemoteNotes,
  deleteRemoteFile,
} from '@/services/gdrive'
import type { Note, SyncStatus } from '@/types'

export function useSync() {
  const status = ref<SyncStatus>({
    state: 'idle',
    lastSyncAt: null,
    error: null,
    pendingCount: 0,
  })

  const { query, run } = useDatabase()
  const isAuthed = ref(false)

  /** Show Google OAuth popup. Returns true on success. */
  async function authenticate(): Promise<boolean> {
    try {
      await initGis()
      await login()
      isAuthed.value = true
      return true
    } catch (err) {
      status.value = {
        ...status.value,
        state: 'error',
        error: String(err),
      }
      return false
    }
  }

  /** Run a full push-then-pull sync cycle. */
  async function sync(): Promise<void> {
    if (!isLoggedIn()) {
      const ok = await authenticate()
      if (!ok) return
    }

    status.value = { ...status.value, state: 'syncing', error: null }

    try {
      const folderId = await getAppFolderId()

      // ── 1. Count + push dirty local notes ──
      const lastSync = status.value.lastSyncAt ?? 0
      const dirty = await query<Note>(
        'SELECT * FROM notes WHERE updated_at > ? AND is_deleted = 0',
        [lastSync]
      )
      status.value.pendingCount = dirty.length

      for (const note of dirty) {
        const result = await uploadNote(
          note.gdrive_file_id,
          folderId,
          note.title,
          note.content
        )
        const remoteMtime = new Date(result.modifiedTime).getTime()
        await run(
          'UPDATE notes SET gdrive_file_id = ?, gdrive_modified = ? WHERE id = ?',
          [result.id, remoteMtime, note.id]
        )
      }

      // ── 2. Push deletes ──
      const deleted = await query<Note>(
        "SELECT * FROM notes WHERE is_deleted = 1 AND gdrive_file_id IS NOT NULL"
      )
      for (const note of deleted) {
        await deleteRemoteFile(note.gdrive_file_id!)
        // Hard-delete from local DB since it's been removed from Drive
        await run('DELETE FROM notes WHERE id = ?', [note.id])
      }

      // ── 3. Pull remote files ──
      const remoteFiles = await listRemoteNotes(folderId)
      const localByGdriveId = new Map(
        (await query<Note>(
          "SELECT * FROM notes WHERE gdrive_file_id IS NOT NULL"
        )).map(n => [n.gdrive_file_id, n])
      )

      for (const remote of remoteFiles) {
        const local = localByGdriveId.get(remote.id)
        const remoteMtime = new Date(remote.modifiedTime).getTime()

        if (!local) {
          // New remote file → create local record
          const content = await downloadNote(remote.id)
          const title = remote.name.replace(/\.md$/, '')
          const now = Date.now()
          await run(
            `INSERT INTO notes (id, title, content, created_at, updated_at, gdrive_file_id, gdrive_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), title, content, now, remoteMtime, remote.id, remoteMtime]
          )
        } else if (remoteMtime > local.updated_at) {
          // Remote is newer → overwrite local
          const content = await downloadNote(remote.id)
          const title = remote.name.replace(/\.md$/, '')
          await run(
            'UPDATE notes SET content = ?, title = ?, updated_at = ?, gdrive_modified = ? WHERE id = ?',
            [content, title, remoteMtime, remoteMtime, local.id]
          )
        }
        // else: local is newer or equal → already pushed, skip
      }

      status.value = {
        state: 'idle',
        lastSyncAt: Date.now(),
        error: null,
        pendingCount: 0,
      }
    } catch (err) {
      status.value = {
        ...status.value,
        state: 'error',
        error: String(err),
      }
    }
  }

  /** Revoke token and reset status. */
  async function disconnect(): Promise<void> {
    logout()
    isAuthed.value = false
    status.value = {
      state: 'idle',
      lastSyncAt: null,
      error: null,
      pendingCount: 0,
    }
  }

  return { status, isAuthed, authenticate, sync, disconnect, isLoggedIn }
}
