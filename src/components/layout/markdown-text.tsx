// 채팅 메시지/제안/제안카드의 inline 마크다운(**굵게**, *기울임*, `코드`)을 렌더한다 (C6).
// renderInlineMarkdown 이 입력을 먼저 HTML escape 하므로 dangerouslySetInnerHTML 사용이 안전하다.
import { renderInlineMarkdown } from '@/lib/inline-markdown'

export function MarkdownText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(text ?? '') }}
    />
  )
}
