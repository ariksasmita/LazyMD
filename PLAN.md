# LazyMD — Technical Implementation Plan

> Local-first, browser-based Markdown note-taking PWA with Vim motions, SQLite WASM storage, and Google Drive sync.

---

## Phase 1: Project Scaffolding & Editor Setup

### 1.1 Initialize the Project

```bash
npm create vite@latest . -- --template vue-ts
```

### 1.2 Install Dependencies

```bash
# Core
npm install vue-router pinia

# CodeMirror 6 (editor engine)
npm install codemirror @codemirror/view @codemirror/state \
  @codemirror/lang-markdown @codemirror/language-data \
  @replit/codemirror-vim @codemirror/theme-one-dark \
  @codemirror/commands

# Markdown rendering
npm install marked sanitize-html

# SQLite WASM
npm install wa-sqlite

# PWA
npm install -D vite-plugin-pwa

# Dev tooling
npm install -D vitest @vue/test-utils @types/sanitize-html
```

### 1.3 Vite Config (`vite.config.ts`)

Key concerns:
- `vite-plugin-pwa` with `registerType: 'prompt'` for install prompt
- `wa-sqlite` WASM files must be served as static assets — copy to `public/` or use `vite-plugin-static-copy`
- OPFS requires secure context — Vite dev server already serves HTTPS-capable localhost

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'LazyMD',
        short_name: 'LazyMD',
        description: 'Local-first Markdown editor with Vim motions and Google Drive sync',
        theme_color: '#1a1b26',
        background_color: '#1a1b26',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // wa-sqlite needs to fetch its WASM file from a URL it controls.
  // We place it in public/ so Vite serves it as-is.
  optimizeDeps: {
    exclude: ['wa-sqlite'],
  },
})
```

### 1.4 TypeScript Types (`src/types/index.ts`)

```typescript
export interface Note {
  id: string              // UUID v4
  title: string           // Derived from first H1 or filename
  content: string         // Raw markdown
  created_at: number      // Unix epoch ms
  updated_at: number      // Unix epoch ms
  gdrive_file_id: string | null  // Google Drive File ID (null = not synced yet)
  gdrive_modified: number | null // Server-side mtime from Drive
  is_deleted: boolean     // Soft delete for sync conflict resolution
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error' | 'offline'
  lastSyncAt: number | null
  error: string | null
  pendingCount: number    // Notes awaiting push
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
```

### 1.5 CodeMirror 6 Composable (`src/composables/useEditor.ts`)

This is the most complex integration point. Key decisions:
- Vim extension is always active (non-optional)
- Editor state changes are debounced before writing to the DB
- The composable owns the EditorView lifecycle — the component only provides a DOM mount point

```typescript
// src/composables/useEditor.ts
import { ref, shallowRef, onUnmounted, type Ref } from 'vue'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { vim } from '@replit/codemirror-vim'
import { oneDark } from '@codemirror/theme-one-dark'
import { indentWithTab } from '@codemirror/commands'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from '@codemirror/language'
import {
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'
import {
  highlightActiveLine,
  lineNumbers,
  highlightActiveLineGutter,
} from '@codemirror/view'

export function useEditor(
  container: Ref<HTMLElement | undefined>,
  options: {
    initialContent?: string
    onUpdate?: (content: string) => void
  } = {}
) {
  const view = shallowRef<EditorView | null>(null)
  const content = ref(options.initialContent ?? '')

  function createState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        // ── Vim motions (ALWAYS ON) ──
        vim(),

        // ── Core editing ──
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        bracketMatching(),
        closeBrackets(),
        indentWithTab,
        keymap.of(closeBracketsKeymap),

        // ── Markdown + code fencing ──
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

        // ── Theme ──
        oneDark,

        // ── Placeholder when empty ──
        placeholder('Start writing in Markdown...'),

        // ── Change callback (debounced upstream) ──
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            content.value = update.state.doc.toString()
            options.onUpdate?.(content.value)
          }
        }),

        // ── Fixed-height scroller ──
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    })
  }

  function mount() {
    if (!container.value) return
    destroy()
    view.value = new EditorView({
      state: createState(content.value),
      parent: container.value,
    })
  }

  function destroy() {
    view.value?.destroy()
    view.value = null
  }

  function setContent(newContent: string) {
    if (!view.value) return
    const current = view.value.state.doc.toString()
    if (current === newContent) return
    view.value.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: newContent,
      },
    })
    content.value = newContent
  }

  onUnmounted(destroy)

  return { view, content, mount, destroy, setContent }
}
```

### 1.6 Markdown Preview Renderer (`src/services/markdown.ts`)

```typescript
// src/services/markdown.ts
import { Marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

const marked = new Marked({
  gfm: true,
  breaks: true,
})

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'details', 'summary', 'mark', 'abbr', 'input', // GFM task lists
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height'],
    input: ['type', 'checked', 'disabled'],
    a: ['href', 'title', 'target', 'rel'],
    '*': ['class', 'id'],
  },
}

export function renderMarkdown(raw: string): string {
  const html = marked.parse(raw)
  if (typeof html !== 'string') return ''
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}
```

### 1.7 Main Layout — Split Pane (`src/views/EditorView.vue`)

```vue
<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useEditor } from '@/composables/useEditor'
import { renderMarkdown } from '@/services/markdown'
import { useNotes } from '@/composables/useNotes'

const {
  notes,
  activeNote,
  activeContent,
  selectNote,
  createNote,
  saveActiveNote,
} = useNotes()

// Editor
const editorContainer = ref<HTMLElement>()
const { content: editorContent, mount, setContent } = useEditor(
  editorContainer,
  { onUpdate: onEditorChange }
)

// Preview
const previewHtml = ref('')

function updatePreview(md: string) {
  previewHtml.value = renderMarkdown(md)
}

// Debounce save — 300ms after last keystroke
let saveTimer: ReturnType<typeof setTimeout>
function onEditorChange(newContent: string) {
  updatePreview(newContent)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveActiveNote(newContent)
  }, 300)
}

// When switching notes, swap editor content
watch(activeNote, (note) => {
  if (note) {
    setContent(note.content)
    updatePreview(note.content)
  }
})

onMounted(() => {
  mount()
  updatePreview(activeContent.value)
})

// Draggable divider
const dividerX = ref(50) // percentage
const isDragging = ref(false)
const containerEl = ref<HTMLElement>()

function startDrag(e: MouseEvent) {
  isDragging.value = true
  e.preventDefault()
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

function onDrag(e: MouseEvent) {
  if (!containerEl.value || !isDragging.value) return
  const rect = containerEl.value.getBoundingClientRect()
  dividerX.value = Math.max(20, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100))
}

function stopDrag() {
  isDragging.value = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}
</script>

<template>
  <div class="editor-view" ref="containerEl">
    <!-- Sidebar -->
    <aside class="sidebar">
      <button @click="createNote">+ New Note</button>
      <ul>
        <li
          v-for="note in notes"
          :key="note.id"
          :class="{ active: note.id === activeNote?.id }"
          @click="selectNote(note.id)"
        >
          {{ note.title || 'Untitled' }}
        </li>
      </ul>
    </aside>

    <!-- Editor Pane -->
    <section class="pane editor-pane" :style="{ width: dividerX + '%' }">
      <div ref="editorContainer" class="editor-mount" />
    </section>

    <!-- Divider -->
    <div
      class="divider"
      :class="{ dragging: isDragging }"
      @mousedown="startDrag"
    />

    <!-- Preview Pane -->
    <section class="pane preview-pane" :style="{ width: (100 - dividerX) + '%' }">
      <div class="preview-content" v-html="previewHtml" />
    </section>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  height: 100vh;
  background: #1a1b26;
  color: #c0caf5;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.sidebar {
  width: 220px;
  min-width: 220px;
  border-right: 1px solid #2f3347;
  padding: 1rem;
  overflow-y: auto;
}

.sidebar button {
  width: 100%;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: #2f3347;
  color: #c0caf5;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.sidebar button:hover { background: #3b4261; }

.sidebar li {
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar li:hover { background: #2f3347; }
.sidebar li.active { background: #3b4261; }

.pane { overflow: auto; }

.editor-pane {
  min-width: 0;
}

.editor-mount {
  height: 100%;
}

.divider {
  width: 4px;
  cursor: col-resize;
  background: #2f3347;
  transition: background 0.15s;
  flex-shrink: 0;
}

.divider:hover,
.divider.dragging {
  background: #7aa2f7;
}

.preview-pane {
  min-width: 0;
  padding: 1.5rem 2rem;
}

.preview-content {
  max-width: 780px;
  line-height: 1.7;
}

/* Basic markdown preview styles */
.preview-content :deep(h1) { font-size: 1.8rem; margin: 1.5rem 0 0.75rem; color: #7aa2f7; }
.preview-content :deep(h2) { font-size: 1.4rem; margin: 1.2rem 0 0.6rem; color: #7aa2f7; }
.preview-content :deep(h3) { font-size: 1.15rem; margin: 1rem 0 0.5rem; color: #bb9af7; }
.preview-content :deep(code) { background: #2f3347; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.9em; }
.preview-content :deep(pre) { background: #1f2335; padding: 1rem; border-radius: 6px; overflow-x: auto; }
.preview-content :deep(a) { color: #7aa2f7; }
.preview-content :deep(blockquote) { border-left: 3px solid #3b4261; padding-left: 1rem; color: #a9b1d6; }
.preview-content :deep(ul), .preview-content :deep(ol) { padding-left: 1.5rem; }
.preview-content :deep(img) { max-width: 100%; border-radius: 6px; }
</style>
```

---

## Phase 2: Local Database (SQLite WASM via OPFS)

### 2.1 Architecture Decision — Why a Web Worker?

`wa-sqlite` is synchronous (it wraps a C library). OPFS access from the main thread is async-only via `FileSystemFileHandle.createWritable()`. To use `wa-sqlite` with OPFS, we **must** run it in a dedicated Web Worker where we can use `opfs-sahpool` (SQLite Access Handle Pool) — a synchronous OPFS API only available in workers.

**Message flow:**
```
Main Thread                          Web Worker
──────────                           ──────────
useDatabase composable  ──postMessage──►  db/worker.ts
                        ◄──postMessage──  (wa-sqlite + OPFS)
```

### 2.2 Database Schema (`src/db/schema.ts`)

```typescript
// src/db/schema.ts

export const SCHEMA_V1 = `
  CREATE TABLE IF NOT EXISTS notes (
    id              TEXT PRIMARY KEY NOT NULL,
    title           TEXT NOT NULL DEFAULT '',
    content         TEXT NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    gdrive_file_id  TEXT,
    gdrive_modified INTEGER,
    is_deleted      INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_notes_updated
    ON notes(updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_notes_gdrive
    ON notes(gdrive_file_id)
    WHERE gdrive_file_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_notes_deleted
    ON notes(is_deleted)
    WHERE is_deleted = 1;
`;
```

### 2.3 Database Worker (`src/db/worker.ts`)

This is the **critical integration point**. The worker:
1. Loads `wa-sqlite` WASM
2. Initializes the `opfs-sahpool` VFS (synchronous OPFS)
3. Opens a database connection
4. Listens for query messages from the main thread

```typescript
// src/db/worker.ts
import { SCHEMA_V1 } from './schema'

// wa-sqlite exports are non-standard — we use dynamic import
// The WASM file must be in public/ for the browser to fetch it
type Sqlite3 = {
  new(): {
    openVFS(name: string): Promise<VFS>
    open(dbName: string, vfsName: string): Promise<Database>
  }
}

type VFS = { name: string }

type Database = {
  exec(sql: string, params?: unknown[]): unknown[][]
  close(): void
}

let db: Database | null = null

async function init() {
  // ── Import wa-sqlite ──
  // The exact import path depends on the wa-sqlite build you use.
  // For the "bundle" target, wa-sqlite exposes a global factory.
  // For ES module, use the import below.
  const sqliteModule = await import('wa-sqlite')
  const sqlite3 = sqliteModule.default ?? sqliteModule

  // ── Register OPFS VFS (synchronous access handle pool) ──
  // opfs-sahpool is the recommended VFS for wa-sqlite in workers.
  // It gives us synchronous file I/O on OPFS — required by SQLite's architecture.
  const { pool } = await import('wa-sqlite/src/examples/OPFSAdaptiveVFS.js')
    .catch(() => import('wa-sqlite/dist/OPFSAdaptiveVFS.js'))

  // Alternative: if using the npm package's bundled VFS helpers:
  // import { createOPFSVFS } from 'wa-sqlite'
  const vfs = await pool('lazydb-vfs')

  // ── Open database ──
  db = sqlite3.open('lazymd.db', vfs.name)

  // ── Run migrations ──
  db.exec(SCHEMA_V1)

  self.postMessage({ type: 'READY' })
}

// ── Message handler ──
self.onmessage = async (event: MessageEvent) => {
  const msg = event.data

  if (msg.type === 'INIT') {
    await init()
    return
  }

  if (!db) {
    self.postMessage({ type: 'ERROR', id: msg.id, error: 'Database not initialized' })
    return
  }

  try {
    let result: unknown
    switch (msg.type) {
      case 'QUERY':
        result = db.exec(msg.sql, msg.params)
        break
      case 'EXEC':
        db.exec(msg.sql, msg.params)
        result = { ok: true }
        break
      case 'CLOSE':
        db.close()
        db = null
        result = { ok: true }
        break
      default:
        throw new Error(`Unknown message type: ${msg.type}`)
    }
    self.postMessage({ type: 'RESULT', id: msg.id, data: result })
  } catch (err) {
    self.postMessage({ type: 'ERROR', id: msg.id, error: String(err) })
  }
}
```

> **⚠️ Note on wa-sqlite imports:** The exact import paths for `wa-sqlite` and its OPFS VFS adapter depend on the package version and build target. At scaffold time, we'll verify against the current `wa-sqlite` npm package and adjust. The pattern above shows the architectural intent — the specifics may shift.

### 2.4 Database Composable (`src/composables/useDatabase.ts`)

```typescript
// src/composables/useDatabase.ts
import { ref, onUnmounted } from 'vue'
import type { WorkerMessage, WorkerResponse } from '@/types'

let worker: Worker | null = null
let pending = new Map<string, {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
}>()
let msgCounter = 0

const isReady = ref(false)
const error = ref<string | null>(null)

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('@/db/worker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.type === 'READY') {
        isReady.value = true
        return
      }
      const pendingEntry = pending.get(msg.id)
      if (!pendingEntry) return
      pending.delete(msg.id)
      if (msg.type === 'RESULT') {
        pendingEntry.resolve(msg.data)
      } else if (msg.type === 'ERROR') {
        pendingEntry.reject(new Error(msg.error))
      }
    }
    worker.onerror = (e) => {
      error.value = e.message
    }
  }
  return worker
}

function send<T = unknown>(msg: Omit<WorkerMessage, 'id'>): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = String(++msgCounter)
    pending.set(id, { resolve: resolve as (d: unknown) => void, reject })
    getWorker().postMessage({ ...msg, id })
  })
}

export function useDatabase() {
  async function init() {
    getWorker()
    await send({ type: 'INIT' })
  }

  async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await send<T[]>({ type: 'QUERY', sql, params })
    return result as T[]
  }

  async function exec(sql: string, params?: unknown[]): Promise<void> {
    await send({ type: 'EXEC', sql, params })
  }

  async function close(): Promise<void> {
    await send({ type: 'CLOSE' })
    worker?.terminate()
    worker = null
    isReady.value = false
  }

  return { isReady, error, init, query, exec, close }
}
```

### 2.5 Notes Composable (`src/composables/useNotes.ts`)

```typescript
// src/composables/useNotes.ts
import { ref, computed } from 'vue'
import { useDatabase } from './useDatabase'
import type { Note } from '@/types'

export function useNotes() {
  const { isReady, init, query, exec } = useDatabase()
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
      notes.value = rows
    } finally {
      isLoading.value = false
    }
  }

  async function selectNote(id: string) {
    activeId.value = id
  }

  async function createNote() {
    const now = Date.now()
    const id = crypto.randomUUID()
    await exec(
      `INSERT INTO notes (id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, 'Untitled', '', now, now]
    )
    await loadAll()
    activeId.value = id
  }

  async function saveActiveNote(content: string) {
    if (!activeId.value) return
    const title = extractTitle(content) || 'Untitled'
    const now = Date.now()
    await exec(
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
    await exec(
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
```

---

## Phase 3: Google Drive Sync Layer

### 3.1 Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Pinia      │────►│  useSync     │────►│  Google      │
│   sync store │     │  composable  │     │  Drive API   │
│              │◄────│              │◄────│  v3 REST     │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────▼───────┐
                     │  useDatabase │
                     │  (worker)    │
                     └──────────────┘
```

### 3.2 Google Drive Client (`src/services/gdrive.ts`)

```typescript
// src/services/gdrive.ts
//
// GIS popup-based OAuth flow.
// Uses the Google Identity Services (GIS) token client for SPA.
// Fallback note: if ad-blockers block the GIS iframe, users can
// switch to a manual redirect-based flow by setting a config flag.

const SCOPES = 'https://www.googleapis.com/auth/drive.file'
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'

// These are loaded from environment variables — never committed
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let accessToken: string | null = null
let tokenExpiry = 0

export function initGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Load the GIS script dynamically
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) {
            reject(new Error(resp.error))
            return
          }
          accessToken = resp.access_token
          tokenExpiry = Date.now() + (parseInt(resp.expires_in) - 60) * 1000
          resolve()
        },
      })
      resolve() // resolve init — actual auth happens on login()
    }
    script.onerror = () => reject(new Error('Failed to load GIS script'))
    document.head.appendChild(script)
  })
}

export async function login(): Promise<string> {
  if (!tokenClient) await initGis()

  // If token is still valid, reuse it
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken
  }

  return new Promise((resolve, reject) => {
    // Re-init with a callback that resolves this specific promise
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error))
          return
        }
        accessToken = resp.access_token
        tokenExpiry = Date.now() + (parseInt(resp.expires_in) - 60) * 1000
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken()
  })
}

export function logout() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken)
    accessToken = null
    tokenExpiry = 0
  }
}

export function isLoggedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiry
}

// ── Drive API helpers ──

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files'

async function headers(): Promise<HeadersInit> {
  if (!isLoggedIn()) await login()
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

/** Find or create the LazyMD folder in Drive root */
export async function getAppFolderId(): Promise<string> {
  const res = await fetch(
    `${DRIVE_BASE}?q=name='LazyMD' and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&fields=files(id)`,
    { headers: await headers() }
  )
  const data = await res.json()
  if (data.files?.length > 0) return data.files[0].id

  // Create it
  const createRes = await fetch(DRIVE_BASE, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      name: 'LazyMD',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  const created = await createRes.json()
  return created.id
}

/** Upload or update a .md file in the LazyMD folder */
export async function uploadNote(
  fileId: string | null,
  folderId: string,
  title: string,
  content: string
): Promise<{ id: string; modifiedTime: string }> {
  const metadata = {
    name: `${title}.md`,
    mimeType: 'text/markdown',
    ...(fileId ? {} : { parents: [folderId] }),
  }

  // Multipart upload (metadata + content)
  const boundary = 'lazymd_boundary'
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/markdown\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`

  const method = fileId ? 'PATCH' : 'POST'

  const res = await fetch(url, {
    method,
    headers: {
      ...(await headers()),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  return await res.json()
}

/** Download a .md file's content */
export async function downloadNote(fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_BASE}/${fileId}?alt=media`, {
    headers: await headers(),
  })
  return await res.text()
}

/** List all .md files in the LazyMD folder */
export async function listRemoteNotes(
  folderId: string
): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  const res = await fetch(
    `${DRIVE_BASE}?q='${folderId}' in parents and mimeType='text/markdown' and trashed=false&fields=files(id,name,modifiedTime)&spaces=drive`,
    { headers: await headers() }
  )
  const data = await res.json()
  return data.files ?? []
}

/** Delete a file from Drive */
export async function deleteRemoteFile(fileId: string): Promise<void> {
  await fetch(`${DRIVE_BASE}/${fileId}`, {
    method: 'DELETE',
    headers: await headers(),
  })
}
```

### 3.3 Sync Composable (`src/composables/useSync.ts`)

**Conflict resolution: Last-Write-Wins (LWW)**

Strategy:
1. **Push first:** Any local note with `updated_at > lastSyncAt` gets pushed to Drive.
2. **Pull second:** For each remote file, compare `gdrive_modified` (server mtime) with `updated_at` (local mtime).
   - Remote newer → overwrite local
   - Local newer → skip (already pushed)
   - New remote file (no local match) → create local record
3. **Deletes:** Soft-deleted local notes with a `gdrive_file_id` get deleted from Drive.

```typescript
// src/composables/useSync.ts
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

  const { query, exec } = useDatabase()

  async function authenticate(): Promise<boolean> {
    try {
      await initGis()
      await login()
      return true
    } catch (err) {
      status.value = { ...status.value, state: 'error', error: String(err) }
      return false
    }
  }

  async function sync(): Promise<void> {
    if (!isLoggedIn()) {
      const ok = await authenticate()
      if (!ok) return
    }

    status.value = { ...status.value, state: 'syncing', error: null }

    try {
      const folderId = await getAppFolderId()

      // ── 1. Count pending local changes ──
      const dirty = await query<Note>(
        `SELECT * FROM notes WHERE updated_at > ? AND is_deleted = 0`,
        [status.value.lastSyncAt ?? 0]
      )
      status.value.pendingCount = dirty.length

      // ── 2. Push: upload dirty local notes ──
      for (const note of dirty) {
        const result = await uploadNote(
          note.gdrive_file_id,
          folderId,
          note.title,
          note.content
        )
        await exec(
          `UPDATE notes SET gdrive_file_id = ?, gdrive_modified = ? WHERE id = ?`,
          [result.id, new Date(result.modifiedTime).getTime(), note.id]
        )
      }

      // ── 3. Push deletes ──
      const deleted = await query<Note>(
        `SELECT * FROM notes WHERE is_deleted = 1 AND gdrive_file_id IS NOT NULL`
      )
      for (const note of deleted) {
        await deleteRemoteFile(note.gdrive_file_id!)
        await exec(`DELETE FROM notes WHERE id = ?`, [note.id])
      }

      // ── 4. Pull: list remote and compare ──
      const remoteFiles = await listRemoteNotes(folderId)
      const localByGdriveId = new Map(
        (await query<Note>('SELECT * FROM notes WHERE gdrive_file_id IS NOT NULL'))
          .map(n => [n.gdrive_file_id, n])
      )

      for (const remote of remoteFiles) {
        const local = localByGdriveId.get(remote.id)
        const remoteMtime = new Date(remote.modifiedTime).getTime()

        if (!local) {
          // New remote file → create local
          const content = await downloadNote(remote.id)
          const title = remote.name.replace(/\.md$/, '')
          const now = Date.now()
          await exec(
            `INSERT INTO notes (id, title, content, created_at, updated_at, gdrive_file_id, gdrive_modified)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), title, content, now, remoteMtime, remote.id, remoteMtime]
          )
        } else if (remoteMtime > local.updated_at) {
          // Remote is newer → overwrite local
          const content = await downloadNote(remote.id)
          await exec(
            `UPDATE notes SET content = ?, updated_at = ?, gdrive_modified = ? WHERE id = ?`,
            [content, remoteMtime, remoteMtime, local.id]
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

  async function disconnect() {
    logout()
    status.value = {
      state: 'idle',
      lastSyncAt: null,
      error: null,
      pendingCount: 0,
    }
  }

  return { status, authenticate, sync, disconnect, isLoggedIn }
}
```

---

## Phase 4: State Management & UI Wiring

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Vue App                              │
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────┐   │
│  │ Pinia    │   │ Pinia    │   │  Composables          │   │
│  │ notes    │   │ sync     │   │  ├─ useEditor (CM6)   │   │
│  │ store    │   │ store    │   │  ├─ useNotes (CRUD)   │   │
│  └────┬─────┘   └────┬─────┘   │  ├─ useDatabase (Wrkr)│   │
│       │              │         │  └─ useSync (GDrive)  │   │
│       ▼              ▼         └──────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              EditorView.vue (split pane)              │  │
│  │  ┌─────────┐  ┌──────┐  ┌─────────┐                 │  │
│  │  │ Sidebar  │  │ CM6  │  │ Preview │                 │  │
│  │  │ (notes)  │  │ Vim  │  │ (HTML)  │                 │  │
│  │  └─────────┘  └──────┘  └─────────┘                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Pinia Notes Store (`src/stores/notes.ts`)

The store acts as the **reactive cache** — the single source of truth for the Vue UI. It reads from the worker-backed database and holds the data in reactive refs.

```typescript
// src/stores/notes.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Note } from '@/types'

export const useNotesStore = defineStore('notes', () => {
  const notes = ref<Note[]>([])
  const activeId = ref<string | null>(null)
  const isLoading = ref(false)
  const isInitialized = ref(false)

  const activeNote = computed(() =>
    notes.value.find(n => n.id === activeId.value) ?? null
  )

  const sortedNotes = computed(() =>
    [...notes.value].sort((a, b) => b.updated_at - a.updated_at)
  )

  // Called by useNotes composable after DB operations
  function setNotes(newNotes: Note[]) {
    notes.value = newNotes
    isInitialized.value = true
  }

  function upsertNote(note: Note) {
    const idx = notes.value.findIndex(n => n.id === note.id)
    if (idx >= 0) {
      notes.value[idx] = note
    } else {
      notes.value.push(note)
    }
  }

  function removeNote(id: string) {
    notes.value = notes.value.filter(n => n.id !== id)
    if (activeId.value === id) {
      activeId.value = notes.value[0]?.id ?? null
    }
  }

  function setActive(id: string | null) {
    activeId.value = id
  }

  function setLoading(v: boolean) {
    isLoading.value = v
  }

  return {
    notes, activeId, isLoading, isInitialized,
    activeNote, sortedNotes,
    setNotes, upsertNote, removeNote, setActive, setLoading,
  }
})
```

### 4.3 Pinia Sync Store (`src/stores/sync.ts`)

```typescript
// src/stores/sync.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SyncStatus } from '@/types'

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>({
    state: 'idle',
    lastSyncAt: null,
    error: null,
    pendingCount: 0,
  })

  const isAuthed = ref(false)

  function setStatus(s: Partial<SyncStatus>) {
    status.value = { ...status.value, ...s }
  }

  function setAuthed(v: boolean) {
    isAuthed.value = v
  }

  return { status, isAuthed, setStatus, setAuthed }
})
```

### 4.4 Sync Status Component (`src/components/sync/SyncBadge.vue`)

```vue
<!-- src/components/sync/SyncBadge.vue -->
<script setup lang="ts">
import { useSyncStore } from '@/stores/sync'
import { useSync } from '@/composables/useSync'

const syncStore = useSyncStore()
const { sync, authenticate, disconnect, isLoggedIn } = useSync()

async function handleSync() {
  if (!isLoggedIn()) {
    const ok = await authenticate()
    syncStore.setAuthed(ok)
    if (!ok) return
  }
  await sync()
}

async function handleDisconnect() {
  await disconnect()
  syncStore.setAuthed(false)
}
</script>

<template>
  <div class="sync-badge">
    <!-- Status indicator -->
    <span
      class="status-dot"
      :class="syncStore.status.state"
      :title="syncStore.status.error ?? syncStore.status.state"
    />

    <!-- Sync button -->
    <button
      v-if="!syncStore.isAuthed"
      @click="handleSync"
      :disabled="syncStore.status.state === 'syncing'"
      class="sync-btn"
    >
      Sign in with Google
    </button>

    <template v-else>
      <button
        @click="handleSync"
        :disabled="syncStore.status.state === 'syncing'"
        class="sync-btn"
      >
        {{ syncStore.status.state === 'syncing' ? 'Syncing...' : 'Sync now' }}
      </button>

      <button @click="handleDisconnect" class="disconnect-btn">
        Disconnect
      </button>
    </template>

    <!-- Last sync time -->
    <span v-if="syncStore.status.lastSyncAt" class="last-sync">
      Last: {{ new Date(syncStore.status.lastSyncAt).toLocaleTimeString() }}
    </span>
  </div>
</template>

<style scoped>
.sync-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.8rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #565f89;
}
.status-dot.idle { background: #9ece6a; }
.status-dot.syncing { background: #e0af68; animation: pulse 1s infinite; }
.status-dot.error { background: #f7768e; }
.status-dot.offline { background: #565f89; }

@keyframes pulse {
  50% { opacity: 0.4; }
}

.sync-btn, .disconnect-btn {
  padding: 0.3rem 0.6rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  color: #c0caf5;
}

.sync-btn { background: #2f3347; }
.sync-btn:hover { background: #3b4261; }
.sync-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.disconnect-btn { background: transparent; color: #565f89; }
.disconnect-btn:hover { color: #f7768e; }

.last-sync { color: #565f89; font-size: 0.7rem; }
</style>
```

### 4.5 Background Sync — Auto-Sync Timer (`src/composables/useAutoSync.ts`)

Non-blocking periodic sync. Runs in the background without freezing the UI.

```typescript
// src/composables/useAutoSync.ts
import { onMounted, onUnmounted } from 'vue'
import { useSyncStore } from '@/stores/sync'
import { useSync } from './useSync'

export function useAutoSync(intervalMs = 30_000) {
  const syncStore = useSyncStore()
  const { sync, isLoggedIn } = useSync()
  let timer: ReturnType<typeof setInterval> | null = null

  async function trySync() {
    if (!isLoggedIn()) return
    if (syncStore.status.state === 'syncing') return // already running
    await sync()
  }

  onMounted(() => {
    timer = setInterval(trySync, intervalMs)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { trySync }
}
```

### 4.6 App Entry Point (`src/main.ts`)

```typescript
// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import EditorView from './views/EditorView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'editor', component: EditorView },
  ],
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
```

### 4.7 App Shell (`src/App.vue`)

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useDatabase } from '@/composables/useDatabase'
import { useAutoSync } from '@/composables/useAutoSync'
import SyncBadge from '@/components/sync/SyncBadge.vue'

const { init: initDb } = useDatabase()
const { trySync } = useAutoSync(30_000)

onMounted(async () => {
  await initDb()
  trySync()
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="logo">LazyMD</h1>
      <SyncBadge />
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style>
/* Reset + global */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #app {
  height: 100%;
  background: #1a1b26;
  color: #c0caf5;
}

:root {
  --bg-primary: #1a1b26;
  --bg-surface: #1f2335;
  --bg-elevated: #2f3347;
  --text-primary: #c0caf5;
  --text-secondary: #a9b1d6;
  --text-muted: #565f89;
  --accent: #7aa2f7;
  --accent-hover: #3b4261;
  --danger: #f7768e;
  --success: #9ece6a;
  --warning: #e0af68;
  --border: #2f3347;
}
</style>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  height: 40px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}

.logo {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.05em;
}

.app-main {
  flex: 1;
  overflow: hidden;
}
</style>
```

---

## Execution Order — What to Build First

| Step | What | Blocks | Est. Time |
|------|------|--------|-----------|
| 1 | `npm create vite`, install deps, `vite.config.ts`, `tsconfig` | Everything | 15 min |
| 2 | `src/types/index.ts` | Steps 3-7 | 5 min |
| 3 | `src/db/schema.ts` + `src/db/worker.ts` | Steps 4, 5 | 30 min |
| 4 | `src/composables/useDatabase.ts` | Steps 5, 6, 8 | 20 min |
| 5 | `src/composables/useNotes.ts` | Step 9 | 20 min |
| 6 | `src/composables/useEditor.ts` (CM6 + Vim) | Step 9 | 30 min |
| 7 | `src/services/markdown.ts` | Step 9 | 10 min |
| 8 | `src/services/gdrive.ts` | Step 10 | 30 min |
| 9 | `src/views/EditorView.vue` + `src/App.vue` + `src/main.ts` | End-to-end test | 30 min |
| 10 | `src/composables/useSync.ts` + sync store + `SyncBadge.vue` | Full sync | 30 min |
| 11 | PWA manifest, icons, service worker testing | Production | 15 min |

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **`indentWithTab` is a `KeyBinding`, not an `Extension`** | Editor crashes with "Unrecognized extension value" | Wrap it in `keymap.of()` along with `closeBracketsKeymap` |
| **Vite pre-bundles `@codemirror/*` into multiple chunks** | Same "multiple instances" error | Exclude all `@codemirror/*` packages from `optimizeDeps` in `vite.config.ts` |
| `wa-sqlite` OPFS VFS import paths change between versions | Blocks Phase 2 entirely | Pin exact version in `package.json`. Verify against current npm build before writing worker code. |
| GIS popup blocked by ad-blockers | No Google Drive auth | Document manual redirect fallback. Add detection: if GIS script fails to load, show manual OAuth flow option. |
| OPFS not available in all browsers | No local storage in Firefox < 111, Safari quirks | Feature-detect `navigator.storage.getDirectory()`. Show clear error if unavailable. Firefox 111+ and Chrome 86+ are fine. |
| Large notes (>1MB markdown) cause UI jank | Editor lag during preview render | Debounce preview rendering. Consider Web Worker for markdown parsing on very large docs. |
| CodeMirror 6 + Vim extension API changes | Vim motions break | Pin `@replit/codemirror-vim` version. Test visual block mode (`Ctrl-V`), macros (`q`), ex commands (`:`) explicitly. |
| Google Drive rate limits on sync | Failed syncs | Exponential backoff on 403/429 responses. Min 30s between auto-syncs. |

---

## Next Step

Say **"scaffold it"** and I'll:
1. Run `npm create vite` and install all dependencies
2. Create every file listed in this plan with the exact code above
3. Verify the dev server starts and CodeMirror renders with Vim mode active
4. Come back with a working skeleton you can open in the browser
