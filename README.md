# LazyMD

A local-first, browser-based Markdown note-taking PWA with Vim motions and Google Drive sync.

Built with Vue 3, CodeMirror 6, SQLite (OPFS), and Vite.

## Features

- **Vim motions** — always-on via `@replit/codemirror-vim`
- **Live Markdown preview** — side-by-side with draggable divider
- **Dark theme** — Tokyo Night-inspired (CodeMirror oneDark)
- **Local-first storage** — SQLite WASM with Origin Private File System (Phase 2)
- **Google Drive sync** — GIS popup-based OAuth (Phase 3)
- **PWA** — installable, works offline

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Vue 3 Composition API + TypeScript |
| Editor | CodeMirror 6 (`@replit/codemirror-vim`) |
| Markdown | `marked` + DOMPurify |
| Storage | SQLite WASM + OPFS (Web Worker) |
| Sync | Google Drive API via GIS |
| Build | Vite 8 + `vite-plugin-pwa` |
| State | Pinia |

## Getting Started

```bash
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:5173`. Press `i` to enter insert mode, `Esc` to return to normal mode.

## Project Structure

```
src/
├── components/
│   ├── preview/MarkdownPreview.vue
│   └── sidebar/NoteSidebar.vue
├── composables/
│   ├── useEditor.ts        # CodeMirror 6 + Vim setup
│   └── useNotes.ts         # Note CRUD (mock → SQLite)
├── services/
│   └── markdown.ts         # marked + DOMPurify renderer
├── types/
│   └── index.ts            # Note, SyncStatus, Worker types
├── views/
│   └── EditorView.vue      # Split-pane layout
├── App.vue
└── main.ts
```

## Implementation Plan

| Phase | Scope | Status |
|---|---|---|
| 1 | Project scaffold + CM6 editor + preview | ✅ Done |
| 2 | SQLite WASM + OPFS + Web Worker storage | Planned |
| 3 | Google Drive sync (GIS OAuth + CRUD) | Planned |
| 4 | Pinia stores, auto-sync, PWA testing | Planned |

See [PLAN.md](./PLAN.md) for full details.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run type-check` | Run `vue-tsc --noEmit` |
