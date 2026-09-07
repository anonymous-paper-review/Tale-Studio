// 채팅 글의 꾸밈 표시는 읽기 쉽게 보여 주고 입력한 태그는 실행하지 않는다.
import { describe, expect, it } from 'vitest'
import { renderInlineMarkdown, escapeHtml } from '@/lib/inline-markdown'

describe('renderInlineMarkdown', () => {
  it('굵은 글씨 표시를 넣으면 글자만 보여 준다', () => {
    const out = renderInlineMarkdown('이건 **굵게** 입니다')
    expect(out).toBe('이건 굵게 입니다')
    expect(out).not.toContain('**')
    expect(out).not.toContain('<strong>')
  })

  it('기울임 표시를 넣으면 기울인 글씨로 보여 준다', () => {
    expect(renderInlineMarkdown('a *기울임* b')).toContain('<em>기울임</em>')
    expect(renderInlineMarkdown('a _기울임_ b')).toContain('<em>기울임</em>')
  })

  it('밑줄 두 개로 감싼 글자는 밑줄 없이 보여 준다 (오너 실측: 밑줄 노출)', () => {
    const out = renderInlineMarkdown('__A__')
    expect(out).not.toContain('_')
    expect(out).toBe('A')
  })

  it('굵은 글씨 표시를 섞어도 표시 기호 없이 글자만 보여 준다', () => {
    const out = renderInlineMarkdown('이건 __굵게__ 입니다')
    expect(out).toBe('이건 굵게 입니다')
    expect(out).not.toContain('__')
    expect(out).not.toContain('<strong>')
  })

  it('문장 앞의 제목 표시는 없애고 제목 글자는 남긴다', () => {
    expect(renderInlineMarkdown('## Title')).toBe('Title')
    expect(renderInlineMarkdown('# 제목')).toBe('제목')
    expect(renderInlineMarkdown('### 서브제목')).toBe('서브제목')
    expect(renderInlineMarkdown('## Title')).not.toContain('#')
  })

  it('문장 중간의 #은 해시태그 글자로 그대로 둔다', () => {
    expect(renderInlineMarkdown('use tag #hello here')).toContain('#hello')
  })

  it('코드 표시로 감싼 내용은 코드처럼 보여 준다', () => {
    expect(renderInlineMarkdown('use `npm run` here')).toContain('<code')
    expect(renderInlineMarkdown('use `npm run` here')).toContain('npm run</code>')
  })

  it('여러 굵은 글씨 표시를 모두 없애고 글자만 보여 준다', () => {
    const out = renderInlineMarkdown('**A** and **B**')
    expect(out).toBe('A and B')
  })

  it('태그를 입력해도 화면에서 실행되지 않고 글자로 보여 준다', () => {
    const out = renderInlineMarkdown('<img src=x onerror="alert(1)">')
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
    expect(out).not.toContain('onerror="alert(1)"') // quotes escaped too
  })

  it('위험한 태그를 굵게 표시해도 실행되지 않고 안전한 글자로 보여 준다', () => {
    const out = renderInlineMarkdown('**<script>evil()</script>**')
    expect(out).not.toContain('<strong>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>')
  })

  it('특수 기호와 따옴표를 넣어도 안전한 글자로 보여 준다', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })

  it('일반 문장은 바꾸지 않고 그대로 보여 준다', () => {
    expect(renderInlineMarkdown('just plain text 123')).toBe('just plain text 123')
  })

  describe('@멘션 하늘색(#a2 2026-07-15)', () => {
    it('문장 첫머리나 띄어쓰기 뒤 @이름을 넣으면 하늘색으로 보여 준다', () => {
      expect(renderInlineMarkdown('@차미르 등장')).toContain(
        '<span class="font-medium text-sky-300">@차미르</span>',
      )
      expect(renderInlineMarkdown('배경은 @장소 로 하자')).toContain('text-sky-300">@장소</span>')
    })

    it('@이름 뒤 구두점은 이름에 포함하지 않는다', () => {
      const out = renderInlineMarkdown('@스토리, 그리고')
      expect(out).toContain('>@스토리</span>,')
    })

    it('이메일 주소의 @는 이름 색으로 바꾸지 않는다', () => {
      const out = renderInlineMarkdown('mail: user@example.com')
      expect(out).not.toContain('text-sky-300')
    })

    it('@이름 뒤에 태그를 넣어도 안전하게 글자로 보여 준다', () => {
      const out = renderInlineMarkdown('@x <script>evil()</script>')
      expect(out).toContain('&lt;script&gt;')
      expect(out).not.toContain('<script>')
    })
  })
})
