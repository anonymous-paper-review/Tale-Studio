// 채팅 메시지/제안/제안카드의 inline 마크다운(**굵게**, *기울임*, `코드`)을 렌더한다 (C6).
// renderInlineMarkdown 이 입력을 먼저 HTML escape 하므로 dangerouslySetInnerHTML 사용이 안전하다.
import { renderInlineMarkdown } from '@/lib/inline-markdown'

export function MarkdownText({
  text,
  className,
  polish = true,
}: {
  text: string
  className?: string
  /** false = 사용자가 쓴 글(대시·단계 이름 후처리를 하지 않는다). 기본은 AI 답변용 후처리. */
  polish?: boolean
}) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(text ?? '', { polish }) }}
    />
  )
}
