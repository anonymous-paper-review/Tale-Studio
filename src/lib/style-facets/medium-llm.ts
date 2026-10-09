// 사용자 그림체의 매체 고르기 — 모델 호출 한 번(2026-10-09). 지시문 · 답 읽기는 medium.ts(순수)에 있다.
//   그림은 주소로 넘긴다 — 호출부(/api/produce/anchor-medium)가 우리 저장소 주소인지 먼저 확인한다.
import { CLAUDE_MODEL, getAnthropicClient } from '@/lib/claude'
import { buildMediumPickPrompt, parseMediumPick } from './medium'

/** 답은 낱말 하나지만 기본 생각이 앞에 붙을 수 있어 넉넉히 둔다. */
const MEDIUM_PICK_MAX_TOKENS = 4000

export async function pickAnchorMedium(imageUrl: string, allowed: readonly string[]): Promise<{ medium: string | null }> {
  const started = Date.now()
  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MEDIUM_PICK_MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text: buildMediumPickPrompt(allowed) },
        ],
      },
    ],
  })
  const answer = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('').trim()
  const medium = parseMediumPick(answer, allowed)
  console.log(`[anchor-medium] model=${response.model} medium=${medium ?? 'none'} stop=${response.stop_reason ?? 'null'} ${Date.now() - started}ms`)
  return { medium }
}
