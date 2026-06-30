import { describe, expect, it } from 'vitest'
import { renderInlineMarkdown, escapeHtml } from '@/lib/inline-markdown'

describe('renderInlineMarkdown (C6 chat markdown)', () => {
  it('renders **bold** as <strong> and removes the raw asterisks', () => {
    const out = renderInlineMarkdown('이건 **굵게** 입니다')
    expect(out).toContain('<strong>굵게</strong>')
    expect(out).not.toContain('**')
  })

  it('renders *italic* and _italic_ as <em>', () => {
    expect(renderInlineMarkdown('a *기울임* b')).toContain('<em>기울임</em>')
    expect(renderInlineMarkdown('a _기울임_ b')).toContain('<em>기울임</em>')
  })

  it('renders `code` as <code>', () => {
    expect(renderInlineMarkdown('use `npm run` here')).toContain('<code')
    expect(renderInlineMarkdown('use `npm run` here')).toContain('npm run</code>')
  })

  it('does not leave double asterisks for bold', () => {
    const out = renderInlineMarkdown('**A** and **B**')
    expect(out).toBe('<strong>A</strong> and <strong>B</strong>')
  })

  it('escapes raw HTML so injected markup cannot execute (XSS)', () => {
    const out = renderInlineMarkdown('<img src=x onerror="alert(1)">')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
    expect(out).not.toContain('onerror="alert(1)"') // quotes escaped too
  })

  it('escapes a script tag wrapped in bold', () => {
    const out = renderInlineMarkdown('**<script>evil()</script>**')
    expect(out).toContain('<strong>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>')
  })

  it('escapeHtml handles &, <, >, quotes', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })

  it('plain text passes through unchanged', () => {
    expect(renderInlineMarkdown('just plain text 123')).toBe('just plain text 123')
  })
})
