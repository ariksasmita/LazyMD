// src/db/worker.ts
// Runs in a dedicated Web Worker for synchronous OPFS access.
import { SCHEMA_V1 } from './schema'

let sqlite3: any = null
let db: any = null

function log(...args: unknown[]) {
  console.log('[DB Worker]', ...args)
}

async function init() {
  log('Initializing...')

  // 1. Load the wa-sqlite WASM module (sync build for AccessHandlePoolVFS)
  log('Loading wa-sqlite...')
  const Module = await import('wa-sqlite/dist/wa-sqlite.mjs')
  const module = await Module.default({
    locateFile: (file: string) => '/' + file,
  })
  log('WASM ready')

  // 2. Build the SQLite API
  const { Factory } = await import('wa-sqlite')
  sqlite3 = Factory(module)
  log('SQLite3 API ready')

  // 3. Register OPFS VFS
  log('Setting up OPFS VFS...')
  const { AccessHandlePoolVFS } = await import(
    'wa-sqlite/src/examples/AccessHandlePoolVFS.js'
  )
  const vfs = new AccessHandlePoolVFS('lazymd')
  await vfs.isReady
  sqlite3.vfs_register(vfs, true)
  log('VFS registered:', vfs.name)

  // 4. Open database
  db = await sqlite3.open_v2('lazymd.db')
  log('Database opened')

  // 5. Migrate
  await sqlite3.exec(db, SCHEMA_V1)
  log('Schema applied')

  // 6. Seed if empty
  const count = await getNoteCount()
  log('Note count:', count)
  if (count === 0) {
    await seedNotes()
    log('Seeded initial notes')
  }

  log('READY')
  self.postMessage({ type: 'READY' })
}

async function getNoteCount(): Promise<number> {
  let count = 0
  await sqlite3.exec(db, 'SELECT COUNT(*) as cnt FROM notes WHERE is_deleted = 0', (row: number[]) => {
    count = row[0]
  })
  return count
}

async function seedNotes() {
  const now = Date.now()
  const welcomeId = crypto.randomUUID()
  const startId = crypto.randomUUID()

  const welcomeContent = `# Welcome to LazyMD

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
`

  const startContent = `# Getting Started

## Creating Notes

Click the **+** button in the sidebar to create a new note.

## Editing

Just start typing. The editor is powered by **CodeMirror 6** with full Vim support.

## What's Next?

- Phase 2: SQLite WASM storage ✅
- Phase 3: Google Drive sync
- Phase 4: Full PWA with offline support
`

  // Use exec with escaped SQL strings
  const esc = (s: string) => s.replace(/'/g, "''")
  await sqlite3.exec(db, `
    INSERT INTO notes (id, title, content, created_at, updated_at) VALUES
    ('${welcomeId}', 'Welcome to LazyMD', '${esc(welcomeContent)}', ${now - 86400000}, ${now - 86400000}),
    ('${startId}', 'Getting Started', '${esc(startContent)}', ${now - 3600000}, ${now - 3600000})
  `)
}

// ── Message handler ──
self.onmessage = async (event: MessageEvent) => {
  const msg = event.data

  if (msg.type === 'INIT') {
    try {
      await init()
    } catch (err) {
      log('INIT ERROR:', err)
      self.postMessage({ type: 'ERROR', id: 'INIT', error: String(err) })
    }
    return
  }

  if (!db) {
    self.postMessage({ type: 'ERROR', id: msg.id, error: 'Database not initialized' })
    return
  }

  try {
    let result: unknown
    switch (msg.type) {
      case 'QUERY': {
        const rows: Record<string, unknown>[] = []
        await sqlite3.exec(db, msg.sql, (row: unknown[], columns: string[]) => {
          const obj: Record<string, unknown> = {}
          columns.forEach((col: string, i: number) => {
            obj[col] = row[i]
          })
          rows.push(obj)
        })
        result = rows
        break
      }
      case 'RUN': {
        if (msg.params && msg.params.length > 0) {
          await sqlite3.run(db, msg.sql, msg.params)
        } else {
          await sqlite3.exec(db, msg.sql)
        }
        result = { ok: true, changes: sqlite3.changes(db) }
        break
      }
      case 'CLOSE':
        await sqlite3.close(db)
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
