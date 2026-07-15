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

  describe('@멘션 하늘색(#a2 2026-07-15)', () => {
    it('문두/공백 뒤 @토큰을 sky span으로 감싼다', () => {
      expect(renderInlineMarkdown('@차미르 등장')).toContain(
        '<span class="font-medium text-sky-300">@차미르</span>',
      )
      expect(renderInlineMarkdown('배경은 @장소 로 하자')).toContain('text-sky-300">@장소</span>')
    })

    it('구두점 앞에서 토큰이 끝난다', () => {
      const out = renderInlineMarkdown('@스토리, 그리고')
      expect(out).toContain('>@스토리</span>,')
    })

    it('이메일 주소는 물들이지 않는다', () => {
      const out = renderInlineMarkdown('mail: user@example.com')
      expect(out).not.toContain('text-sky-300')
    })

    it('escape된 HTML 안전성 유지 (멘션 뒤 태그 주입 불가)', () => {
      const out = renderInlineMarkdown('@x <script>evil()</script>')
      expect(out).toContain('&lt;script&gt;')
      expect(out).not.toContain('<script>')
    })
  })
})
