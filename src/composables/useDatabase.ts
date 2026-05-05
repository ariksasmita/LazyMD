// src/composables/useDatabase.ts
import { ref } from 'vue'

type WorkerMessage =
  | { type: 'INIT' }
  | { type: 'QUERY'; id: string; sql: string; params?: unknown[] }
  | { type: 'RUN'; id: string; sql: string; params?: unknown[] }
  | { type: 'CLOSE' }

type WorkerResponse =
  | { type: 'READY' }
  | { type: 'RESULT'; id: string; data: unknown }
  | { type: 'ERROR'; id: string; error: string }

let worker: Worker | null = null
let pending = new Map<string, {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
}>()
let msgCounter = 0

export const isReady = ref(false)
export const dbError = ref<string | null>(null)

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('../db/worker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.type === 'READY') {
        isReady.value = true
        return
      }
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.type === 'RESULT') {
        entry.resolve(msg.data)
      } else if (msg.type === 'ERROR') {
        entry.reject(new Error(msg.error))
      }
    }
    worker.onerror = (e) => {
      dbError.value = e.message
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

async function rawQuery(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
  const result = await send<Record<string, unknown>[]>({ type: 'QUERY', sql, params })
  return result
}

async function rawRun(sql: string, params?: unknown[]): Promise<{ ok: boolean; changes: number }> {
  return send<{ ok: boolean; changes: number }>({ type: 'RUN', sql, params })
}

export function useDatabase() {
  async function init() {
    const w = getWorker()
    w.postMessage({ type: 'INIT' })
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('DB init timeout')), 10_000)
      const check = () => {
        if (isReady.value) {
          clearTimeout(timeout)
          resolve()
        } else {
          requestAnimationFrame(check)
        }
      }
      check()
    })
  }

  async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return rawQuery(sql, params) as Promise<T[]>
  }

  async function run(sql: string, params?: unknown[]): Promise<{ ok: boolean; changes: number }> {
    return rawRun(sql, params)
  }

  async function close(): Promise<void> {
    await send({ type: 'CLOSE' })
    worker?.terminate()
    worker = null
    isReady.value = false
  }

  return { isReady, dbError, init, query, run, close }
}

// ── Dev console helper ──
// Usage in browser DevTools: db("SELECT * FROM notes")
async function dbConsoleHelper(sql: string): Promise<void> {
  if (!isReady.value) {
    console.error('[db] Database not ready yet')
    return
  }
  try {
    const rows = await rawQuery(sql)
    console.table(rows)
    return rows as any
  } catch (err) {
    console.error('[db]', err)
  }
}

if (typeof window !== 'undefined') {
  ;(window as any).db = dbConsoleHelper
}
