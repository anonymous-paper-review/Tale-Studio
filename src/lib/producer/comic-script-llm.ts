// 만화 원고 → 대본: 모델 호출 한 번(2026-10-09 오너). 지시문 · 확인은 comic-script.ts(순수)에 있다.
//   그림은 주소로 넘긴다(produce/chat 첨부와 같은 방식) — 호출부가 우리 저장소 주소인지 먼저 확인한다.
import { CLAUDE_MODEL, getAnthropicClient } from '@/lib/claude'

/** 8쪽 대본은 출력 3~6천 토큰 — 생각(기본)까지 넉넉히 둔다. 스트리밍 없이 받는 한도 안이다. */
const COMIC_SCRIPT_MAX_TOKENS = 16000

export interface ComicTranscription {
  text: string
  stopReason?: string | null
  usage?: { input_tokens: number; output_tokens: number }
}

export async function transcribeComic(imageUrls: string[], prompt: string): Promise<ComicTranscription> {
  const started = Date.now()
  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: COMIC_SCRIPT_MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          ...imageUrls.map((url) => ({ type: 'image' as const, source: { type: 'url' as const, url } })),
          { type: 'text' as const, text: prompt },
        ],
      },
    ],
  })
  const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
  console.log(
    `[comic-script] model=${response.model} img=${imageUrls.length} in=${response.usage.input_tokens} out=${response.usage.output_tokens} stop=${response.stop_reason ?? 'null'} ${Date.now() - started}ms`,
  )
  return {
    text,
    stopReason: response.stop_reason,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  }
}
