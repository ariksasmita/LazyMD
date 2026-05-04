import { Marked } from 'marked'
import DOMPurify from 'dompurify'

const marked = new Marked({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(raw: string): string {
  const html = marked.parse(raw)
  if (typeof html !== 'string') return ''
  return DOMPurify.sanitize(html)
}
