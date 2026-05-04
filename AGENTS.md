# Project: LazyMD

## Tech Stack

### Frontend
- Framework: Vue 3 (Composition API, `<script setup>`, TypeScript)
- Build: Vite 6
- Styling: CSS with scoped styles + CSS variables (dark-first)
- State: Pinia + composables
- PWA: vite-plugin-pwa

### Editor
- Engine: CodeMirror 6
- Vim: @replit/codemirror-vim
- Markdown: @codemirror/lang-markdown + language-data
- Rendering: marked (or markdown-it) → sanitize-html

### Storage
- Local: wa-sqlite (SQLite compiled to WASM) backed by OPFS (Origin Private File System)
- Sync: Google Drive REST API v3 (GIS popup-based OAuth, fallback note for ad-blockers)
- Conflict: Last-Write-Wins (mtime comparison)

### Testing
- Unit: Vitest + Vue Test Utils
- E2E: TBD

## Project Structure (Target)

```
src/
├── assets/
├── components/
│   ├── editor/          # CodeMirror wrapper, toolbar
│   ├── preview/         # Markdown renderer
│   ├── sidebar/         # Note list, file tree
│   └── sync/            # Sync status, auth button
├── composables/
│   ├── useDatabase.ts   # SQLite WASM / OPFS bridge
│   ├── useSync.ts       # Google Drive sync engine
│   ├── useEditor.ts     # CodeMirror 6 lifecycle
│   └── useNotes.ts      # CRUD over local DB
├── db/
│   ├── worker.ts        # Dedicated Web Worker for SQLite
│   ├── schema.ts        # DDL statements
│   └── migrations/      # Future schema versions
├── services/
│   ├── gdrive.ts        # Google Drive REST client
│   └── markdown.ts      # Parse + render pipeline
├── stores/
│   ├── notes.ts         # Pinia store for note list
│   └── sync.ts          # Pinia store for sync state
├── types/
│   └── index.ts         # Shared TypeScript types
├── views/
│   └── EditorView.vue   # Main split-pane layout
├── App.vue
└── main.ts
```

## Conventions
- All `<script>` blocks use `<script setup lang="ts">`
- Composables return `{ data, isLoading, error, ...methods }` pattern
- Database ops run in a dedicated Web Worker — never on the main thread
- Vim mode is non-optional (the entire point of the app)
- No Electron/Tauri — 100% browser PWA

## Key Commands
- `npm run dev` — Start Vite dev server
- `npm run build` — Production build (includes PWA service worker)
- `npm run preview` — Preview production build
- `npm run test` — Run Vitest
- `npm run test:watch` — Vitest in watch mode

## Notes
- OPFS requires secure context (HTTPS or localhost)
- wa-sqlite + OPFS requires a dedicated Web Worker (cannot use main-thread OPFS access with synchronous SQLite API)
- Google Drive OAuth: GIS (Google Identity Services) popup-based token model; store tokens in IndexedDB (not localStorage). If ad-blockers break GIS popup, document fallback to manual redirect flow.
- The split-pane divider must be draggable
