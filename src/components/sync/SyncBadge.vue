<!-- src/components/sync/SyncBadge.vue -->
<script setup lang="ts">
import { useSync } from '@/composables/useSync'

const { status, isAuthed, authenticate, sync, disconnect, isLoggedIn } = useSync()

async function handleSync() {
  if (!isLoggedIn()) {
    const ok = await authenticate()
    if (!ok) return
  }
  await sync()
}

async function handleDisconnect() {
  await disconnect()
}
</script>

<template>
  <div class="sync-badge">
    <!-- Status dot -->
    <span
      class="status-dot"
      :class="status.state"
      :title="status.error ?? status.state"
    />

    <!-- Not authenticated -->
    <button
      v-if="!isAuthed"
      @click="handleSync"
      :disabled="status.state === 'syncing'"
      class="sync-btn login-btn"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
      </svg>
      Sync
    </button>

    <!-- Authenticated -->
    <template v-else>
      <button
        @click="handleSync"
        :disabled="status.state === 'syncing'"
        class="sync-btn"
      >
        <svg v-if="status.state === 'syncing'" class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 12a9 9 0 11-6.22-8.56"/>
        </svg>
        {{ status.state === 'syncing' ? 'Syncing...' : 'Sync now' }}
      </button>

      <button @click="handleDisconnect" class="disconnect-btn" title="Disconnect Google Drive">
        ✕
      </button>
    </template>

    <!-- Last sync time -->
    <span v-if="status.lastSyncAt" class="last-sync">
      {{ new Date(status.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
    </span>
  </div>
</template>

<style scoped>
.sync-badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}

.status-dot.idle { background: var(--success); }
.status-dot.syncing { background: var(--warning); animation: pulse 1s infinite; }
.status-dot.error { background: var(--danger); }
.status-dot.offline { background: var(--text-muted); }

@keyframes pulse {
  50% { opacity: 0.3; }
}

.sync-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.5rem;
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.7rem;
  font-family: inherit;
}

.sync-btn:hover { background: var(--accent-hover); }
.sync-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.login-btn {
  background: var(--accent);
  color: var(--bg-primary);
  font-weight: 600;
}

.login-btn:hover { opacity: 0.85; background: var(--accent); }

.disconnect-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem;
  line-height: 1;
}

.disconnect-btn:hover { color: var(--danger); }

.last-sync {
  color: var(--text-muted);
  font-size: 0.65rem;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
