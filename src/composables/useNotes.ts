import { ref, computed } from 'vue'

export interface MockNote {
  id: string
  title: string
  content: string
  created_at: number
  updated_at: number
}

/**
 * Temporary in-memory notes for Phase 1.
 * Phase 2 replaces this with useNotes backed by SQLite WASM.
 */
export function useNotes() {
  const notes = ref<MockNote[]>([
    {
      id: 'welcome',
      title: 'Welcome to LazyMD',
      content: `# Welcome to LazyMD

A **local-first** Markdown editor with Vim motions, running entirely in your browser.

## Features

- **Vim motions** — visual block, macros, ex commands, the works
- **Split-pane** — write on the left, read on the right
- **Local-first** — your notes live in your browser, powered by SQLite
- **Google Drive sync** — push/pull to the cloud when you want

## Vim Cheat Sheet

| Mode    | Key   | Action          |
|---------|-------|-----------------|
| Normal  | \`dd\`  | Delete line     |
| Normal  | \`yy\`  | Yank line       |
| Normal  | \`p\`   | Paste after     |
| Visual  | \`V\`   | Line visual     |
| Visual  | \`Ctrl+V\` | Block visual |
| Command | \`:w\`  | Save (no-op)    |
| Command | \`:q\`  | Close (no-op)   |

---

> Start typing to see the live preview update.

\`\`\`javascript
// Code blocks work too
const greeting = "Hello, LazyMD!";
console.log(greeting);
\`\`\`
`,
      created_at: Date.now() - 86400000,
      updated_at: Date.now() - 86400000,
    },
    {
      id: 'second',
      title: 'Getting Started',
      content: `# Getting Started

## Creating Notes

Click the **+** button in the sidebar to create a new note.

## Editing

Just start typing. The editor is powered by **CodeMirror 6** with full Vim support.

## Keyboard Shortcuts

- Use Vim motions as you'd expect
- The split-pane divider is draggable with your mouse

## What's Next?

- Phase 2: SQLite WASM storage (notes persist across sessions)
- Phase 3: Google Drive sync
- Phase 4: Full PWA with offline support
`,
      created_at: Date.now() - 3600000,
      updated_at: Date.now() - 3600000,
    },
  ])

  const activeId = ref<string | null>('welcome')

  const activeNote = computed(() =>
    notes.value.find((n) => n.id === activeId.value) ?? null
  )

  const activeContent = computed(() => activeNote.value?.content ?? '')

  function selectNote(id: string) {
    activeId.value = id
  }

  function createNote() {
    const now = Date.now()
    const id = crypto.randomUUID()
    notes.value.unshift({
      id,
      title: 'Untitled',
      content: '# Untitled\n\n',
      created_at: now,
      updated_at: now,
    })
    activeId.value = id
  }

  function saveActiveNote(content: string) {
    const note = notes.value.find((n) => n.id === activeId.value)
    if (!note) return
    note.content = content
    note.title = extractTitle(content) || 'Untitled'
    note.updated_at = Date.now()
  }

  function deleteNote(id: string) {
    notes.value = notes.value.filter((n) => n.id !== id)
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
    selectNote,
    createNote,
    saveActiveNote,
    deleteNote,
  }
}
