<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useEditor } from '@/composables/useEditor'
import { renderMarkdown } from '@/services/markdown'
import { useNotes } from '@/composables/useNotes'
import NoteSidebar from '@/components/sidebar/NoteSidebar.vue'
import MarkdownPreview from '@/components/preview/MarkdownPreview.vue'

const {
  notes,
  activeId,
  activeNote,
  activeContent,
  isLoading,
  loadAll,
  selectNote,
  createNote,
  saveActiveNote,
} = useNotes()

// ── Editor ──
const editorContainer = ref<HTMLElement>()
const { content: editorContent, mount, setContent, focus } = useEditor(
  editorContainer,
  { initialContent: activeContent.value, onUpdate: onEditorChange }
)

// ── Preview ──
const previewHtml = ref('')

function updatePreview(md: string) {
  previewHtml.value = renderMarkdown(md)
}

// ── Debounced save ──
let saveTimer: ReturnType<typeof setTimeout>
function onEditorChange(newContent: string) {
  updatePreview(newContent)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveActiveNote(newContent)
  }, 300)
}

// ── Switch notes ──
watch(activeId, () => {
  if (activeNote.value) {
    setContent(activeNote.value.content)
    updatePreview(activeNote.value.content)
  }
})

// ── Draggable divider ──
const dividerPct = ref(50)
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
  const pct = ((e.clientX - rect.left) / rect.width) * 100
  dividerPct.value = Math.max(20, Math.min(80, pct))
}

function stopDrag() {
  isDragging.value = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

// ── Init ──
onMounted(async () => {
  await loadAll()
  await nextTick()
  mount()
  // Set content to active note after DB load
  if (activeNote.value) {
    setContent(activeNote.value.content)
    updatePreview(activeNote.value.content)
  }
  focus()
})
</script>

<template>
  <div class="editor-view" ref="containerEl">
    <!-- Sidebar -->
    <NoteSidebar
      :notes="notes"
      :active-id="activeId"
      @select="selectNote"
      @create="createNote"
    />

    <!-- Editor Pane -->
    <section class="pane editor-pane" :style="{ width: dividerPct + '%' }">
      <div ref="editorContainer" class="editor-mount" />
    </section>

    <!-- Divider -->
    <div
      class="divider"
      :class="{ dragging: isDragging }"
      @mousedown="startDrag"
    />

    <!-- Preview Pane -->
    <section class="pane preview-pane" :style="{ width: (100 - dividerPct) + '%' }">
      <MarkdownPreview :html="previewHtml" />
    </section>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  height: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
}

.pane {
  overflow: hidden;
  min-width: 0;
}

.editor-pane {
  position: relative;
}

.editor-mount {
  position: absolute;
  inset: 0;
}

/* CodeMirror overrides — match our theme */
.editor-mount :deep(.cm-editor) {
  height: 100%;
}

.editor-mount :deep(.cm-focused) {
  outline: none;
}

.divider {
  width: 3px;
  cursor: col-resize;
  background: var(--border);
  transition: background 0.15s;
  flex-shrink: 0;
  position: relative;
}

.divider:hover,
.divider.dragging {
  background: var(--accent);
}

/* Wider hit target for the divider */
.divider::before {
  content: '';
  position: absolute;
  top: 0;
  left: -4px;
  right: -4px;
  bottom: 0;
}
</style>
