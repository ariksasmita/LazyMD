// src/composables/useNotes.ts
import { ref, computed } from 'vue'
import { useDatabase } from './useDatabase'
import type { Note } from '@/types'

export function useNotes() {
  const { isReady, init, query, run } = useDatabase()
  const notes = ref<Note[]>([])
  const activeId = ref<string | null>(null)
  const isLoading = ref(false)

  const activeNote = computed(() =>
    notes.value.find(n => n.id === activeId.value) ?? null
  )

  const activeContent = computed(() =>
    activeNote.value?.content ?? ''
  )

  async function loadAll() {
    isLoading.value = true
    try {
      if (!isReady.value) await init()
      const rows = await query<Note>(
        'SELECT * FROM notes WHERE is_deleted = 0 ORDER BY updated_at DESC'
      )
      // SQLite stores is_deleted as INTEGER, coerce to boolean
      notes.value = rows.map(row => ({
        ...row,
        is_deleted: Boolean(row.is_deleted),
      }))
      // Auto-select first note if none selected
      if (!activeId.value && notes.value.length > 0) {
        activeId.value = notes.value[0].id
      }
    } finally {
      isLoading.value = false
    }
  }

  function selectNote(id: string) {
    activeId.value = id
  }

  async function createNote() {
    if (!isReady.value) await init()
    const now = Date.now()
    const id = crypto.randomUUID()
    await run(
      `INSERT INTO notes (id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, 'Untitled', '# Untitled\n\n', now, now]
    )
    await loadAll()
    activeId.value = id
  }

  async function saveActiveNote(content: string) {
    if (!activeId.value || !isReady.value) return
    const title = extractTitle(content) || 'Untitled'
    const now = Date.now()
    await run(
      `UPDATE notes SET content = ?, title = ?, updated_at = ? WHERE id = ?`,
      [content, title, now, activeId.value]
    )
    // Update local ref without full reload
    const note = notes.value.find(n => n.id === activeId.value)
    if (note) {
      note.content = content
      note.title = title
      note.updated_at = now
    }
  }

  async function deleteNote(id: string) {
    if (!isReady.value) return
    await run(
      `UPDATE notes SET is_deleted = 1, updated_at = ? WHERE id = ?`,
      [Date.now(), id]
    )
    notes.value = notes.value.filter(n => n.id !== id)
    if (activeId.value === id) {
      activeId.value = notes.value[0]?.id ?? null
    }
  }

  function extractTitle(md: string): string {
    const match = md.match(/^#\s+(.+)$/m)
    return match?.[1]?.trim() ?? ''
  }

  return {
    notes,
    activeId,
    activeNote,
    activeContent,
    isLoading,
    loadAll,
    selectNote,
    createNote,
    saveActiveNote,
    deleteNote,
  }
}
