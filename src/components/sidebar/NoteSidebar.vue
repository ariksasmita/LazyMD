<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  notes: Array<{ id: string; title: string; updated_at: number }>
  activeId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  create: []
}>()

const searchQuery = ref('')

const filteredNotes = computed(() => {
  if (!searchQuery.value) return props.notes
  const q = searchQuery.value.toLowerCase()
  return props.notes.filter((n) => n.title.toLowerCase().includes(q))
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">Notes</span>
      <button class="new-note-btn" @click="emit('create')" title="New note">
        +
      </button>
    </div>

    <input
      v-model="searchQuery"
      type="text"
      class="search-input"
      placeholder="Search..."
    />

    <ul class="note-list">
      <li
        v-for="note in filteredNotes"
        :key="note.id"
        class="note-item"
        :class="{ active: note.id === activeId }"
        @click="emit('select', note.id)"
      >
        <span class="note-title">{{ note.title || 'Untitled' }}</span>
        <span class="note-time">{{ formatTime(note.updated_at) }}</span>
      </li>
      <li v-if="filteredNotes.length === 0" class="empty-state">
        {{ searchQuery ? 'No matches' : 'No notes yet' }}
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 240px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--bg-surface);
  height: 100%;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}

.sidebar-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.new-note-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: var(--bg-primary);
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
}

.new-note-btn:hover {
  opacity: 0.85;
}

.search-input {
  margin: 0.5rem 0.75rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 0.8rem;
  font-family: inherit;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.note-list {
  list-style: none;
  overflow-y: auto;
  flex: 1;
  padding: 0.25rem 0;
}

.note-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.1s;
}

.note-item:hover {
  background: var(--bg-elevated);
}

.note-item.active {
  background: var(--bg-elevated);
  border-left-color: var(--accent);
}

.note-title {
  font-size: 0.85rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.note-time {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.empty-state {
  padding: 1.5rem 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.8rem;
}
</style>
