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
        keymap.of([indentWithTab, ...closeBracketsKeymap]),

        // ── Markdown + code fencing ──
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

        // ── Theme ──
        oneDark,

        // ── Placeholder when empty ──
        placeholder('Start writing in Markdown...'),

        // ── Change callback ──
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            content.value = update.state.doc.toString()
            options.onUpdate?.(content.value)
          }
        }),

        // ── Full-height editor ──
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "'JetBrains Mono', monospace",
          },
          '.cm-content': {
            padding: '1rem 0',
          },
          '.cm-gutters': {
            borderRight: '1px solid #2f3347',
          },
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
      changes: { from: 0, to: current.length, insert: newContent },
    })
    content.value = newContent
  }

  function focus() {
    view.value?.focus()
  }

  onUnmounted(destroy)

  return { view, content, mount, destroy, setContent, focus }
}
