<script setup lang="ts">
import EditorView from '@/views/EditorView.vue'
import SyncBadge from '@/components/sync/SyncBadge.vue'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="logo">LazyMD</h1>
      <div class="header-right">
        <SyncBadge />
        <span class="vim-badge">VIM</span>
      </div>
    </header>
    <main class="app-main">
      <EditorView />
    </main>
  </div>
</template>

<style>
/* ── Reset ── */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#app {
  height: 100%;
  background: #1a1b26;
  color: #c0caf5;
}

/* ── Design tokens ── */
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

/* ── Scrollbar ── */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--bg-elevated);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
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
  height: 36px;
  min-height: 36px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  user-select: none;
}

.logo {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.06em;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.vim-badge {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 0.15rem 0.4rem;
  background: var(--success);
  color: var(--bg-primary);
  border-radius: 3px;
  letter-spacing: 0.1em;
}

.app-main {
  flex: 1;
  overflow: hidden;
}
</style>
