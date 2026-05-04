<script setup lang="ts">
defineProps<{
  html: string
}>()
</script>

<template>
  <div class="preview-pane">
    <div class="preview-content" v-html="html" />
  </div>
</template>

<style scoped>
.preview-pane {
  height: 100%;
  overflow-y: auto;
  padding: 1.5rem 2rem;
}

.preview-content {
  max-width: 780px;
  line-height: 1.75;
  color: var(--text-secondary);
  font-size: 15px;
}

/* Markdown elements */
.preview-content :deep(h1) {
  font-size: 1.8rem;
  margin: 1.5rem 0 0.75rem;
  color: var(--accent);
  font-weight: 700;
}
.preview-content :deep(h2) {
  font-size: 1.4rem;
  margin: 1.25rem 0 0.6rem;
  color: var(--accent);
  font-weight: 600;
}
.preview-content :deep(h3) {
  font-size: 1.15rem;
  margin: 1rem 0 0.5rem;
  color: #bb9af7;
  font-weight: 600;
}
.preview-content :deep(h4) {
  font-size: 1rem;
  margin: 0.75rem 0 0.4rem;
  color: #7dcfff;
  font-weight: 600;
}
.preview-content :deep(p) {
  margin: 0.5rem 0;
}
.preview-content :deep(a) {
  color: var(--accent);
  text-decoration: none;
}
.preview-content :deep(a:hover) {
  text-decoration: underline;
}
.preview-content :deep(code) {
  background: var(--bg-elevated);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', monospace;
  color: #e0af68;
}
.preview-content :deep(pre) {
  background: var(--bg-primary);
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.75rem 0;
}
.preview-content :deep(pre code) {
  background: none;
  padding: 0;
  color: var(--text-primary);
}
.preview-content :deep(blockquote) {
  border-left: 3px solid var(--accent);
  padding-left: 1rem;
  margin: 0.5rem 0;
  color: var(--text-muted);
  font-style: italic;
}
.preview-content :deep(ul),
.preview-content :deep(ol) {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}
.preview-content :deep(li) {
  margin: 0.2rem 0;
}
.preview-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 0.5rem 0;
}
.preview-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.5rem 0;
}
.preview-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
}
.preview-content :deep(th),
.preview-content :deep(td) {
  border: 1px solid var(--border);
  padding: 0.4rem 0.75rem;
  text-align: left;
}
.preview-content :deep(th) {
  background: var(--bg-elevated);
  font-weight: 600;
}
.preview-content :deep(input[type="checkbox"]) {
  margin-right: 0.4rem;
}
</style>
