// 러프 스토리보드 프롬프트 LLM 재생성 — force 3차+ 재시도 전용 (model-layer, server-only).
//
// rule-base safeMode 가 못 뚫은 deterministic 실패(주로 fal 콘텐츠 모더레이션)용 최후 수단.
//   같은 구도·스테이징을 "비그래픽 영어"로 재서술한다. 호출마다 변주(temp↑)되어 "동일 프롬프트 반복"
//   문제를 회피. 모델은 제안만(architecture §3): 실패/거부 시 null → 호출부가 rule-base 프롬프트로 폴백.
//   (출력 영어 통일 = "LLM 쓰는 부분 생기면 영어로" 정책 적용.)
import { claudeChat } from '@/lib/claude'

const SYSTEM = `You rewrite text-to-image prompts for a film "rough storyboard" previz panel.
A text-encoder diffusion model REJECTED the previous prompt — most likely its content filter flagged graphic, violent, or explicit wording.
Rewrite it into ONE new English prompt that keeps the SAME camera framing, composition, depth layers, mannequin figure staging, and focal point, but expresses any conflict NON-graphically.

Rules:
- This is a rough monochrome pencil-sketch previz; every character is a featureless wooden mannequin (no face, no identity). No realism, no gore.
- Convey tension or conflict through posture, distance, gesture, and composition — never through blood, wounds, weapon impact, or violent verbs.
- Keep: shot size, camera angle + lens, three depth layers, mannequin positions, focal point, loose pencil-sketch style, camera-POV framing, wordless panel.
- Replace any word a content filter could flag (kill, stab, blood, wound, corpse, strike, attack, …) with neutral staging language.
- Output ENGLISH only, and output ONLY the final prompt text — no preamble, no quotes, no explanation.`

export async function rewriteRoughStoryboardPromptViaLLM(args: {
  /** 직전에 거부된 rule-base 프롬프트 (재서술 기준). */
  previousPrompt: string
  shotType: string
  /** 현재 시도 회차 — 변주 힌트. */
  attempt: number
}): Promise<string | null> {
  const user = `Previous (rejected) prompt:
${args.previousPrompt}

Shot type: ${args.shotType}. Retry attempt #${args.attempt}. Produce a fresh, content-safe English rewrite that a strict image content filter will accept.`
  try {
    const out = (
      await claudeChat(SYSTEM, [], user, 0.8, 'rough-storyboard-rewrite')
    ).trim()
    // 거부·빈 응답 방어: 너무 짧거나 명백한 거부문이면 폴백(null) → 호출부가 rule-base 로 진행.
    if (out.length < 20) return null
    if (/^(i'?m sorry|i cannot|i can'?t|i am unable|as an ai|sorry)/i.test(out)) {
      return null
    }
    return out
  } catch (e) {
    console.error(
      '[rough-storyboard-llm] rewrite failed:',
      e instanceof Error ? e.message : e,
    )
    return null
  }
}
