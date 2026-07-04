import { describe, expect, it } from 'vitest'
import { renderInlineMarkdown, escapeHtml } from '@/lib/inline-markdown'

describe('renderInlineMarkdown (C6 chat markdown)', () => {
  it('strips **bold** markers to plain text (bold suppressed in chat UI)', () => {
    const out = renderInlineMarkdown('이건 **굵게** 입니다')
    expect(out).toBe('이건 굵게 입니다')
    expect(out).not.toContain('**')
    expect(out).not.toContain('<strong>')
  })

  it('renders *italic* and _italic_ as <em>', () => {
    expect(renderInlineMarkdown('a *기울임* b')).toContain('<em>기울임</em>')
    expect(renderInlineMarkdown('a _기울임_ b')).toContain('<em>기울임</em>')
  })

  it('renders `code` as <code>', () => {
    expect(renderInlineMarkdown('use `npm run` here')).toContain('<code')
    expect(renderInlineMarkdown('use `npm run` here')).toContain('npm run</code>')
  })

  it('removes all double asterisks without leaving <strong>', () => {
    const out = renderInlineMarkdown('**A** and **B**')
    expect(out).toBe('A and B')
  })

  it('escapes raw HTML so injected markup cannot execute (XSS)', () => {
    const out = renderInlineMarkdown('<img src=x onerror="alert(1)">')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
    expect(out).not.toContain('onerror="alert(1)"') // quotes escaped too
  })

  it('strips bold markers around a script tag but still escapes it (no <strong>, no exec)', () => {
    const out = renderInlineMarkdown('**<script>evil()</script>**')
    expect(out).not.toContain('<strong>')
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
