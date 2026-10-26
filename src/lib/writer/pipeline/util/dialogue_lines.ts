// 샷 대사 트랙 한 칸 → shots.dialogue_lines (#offscreen-speaker 2026-10-27).
//   파이프라인 저장(persist_manifest)과 [대사 다시 만들기](api/writer/dialogue)가 같은 대사 줄 규칙을 쓴다.
//   대사 단계는 등장인물 목록에 없는 화자(음성 메시지 속 병원 직원 등)를 지어낼 수 있다 — 그 화자는 그림 · 모습이
//   없어 샷 인물이 될 수 없다(운영 3945d1e6: 모습을 찾다 샷 저장이 세 번 다 실패해 샷 0개로 끝났다).
//   그 줄은 화자 없는 화면 밖 목소리(characterId null)로 남기고 말투 설명은 그대로 둔다 —
//   영상 프롬프트는 화자 없는 줄을 입 모양 없는 목소리로 다룬다(director/video-prompt dialogueClause).
import { speechSecondsForText } from '@/lib/writer/pipeline/util/duration_reallocation'
import type { ShotDialogue } from '@/lib/writer/types/pipeline'
import type { DialogueLine } from '@/types'

/**
 * 대사 화자 id → 등장인물 id. 대사 단계가 흔히 붙이는 어긋남(앞뒤 공백 · `_v1` 같은 버전 꼬리 — asset_refs 와 같은
 * 규칙 — 와 대소문자)은 맞춰 주고, 그래도 목록에 없으면 null(화면 밖 목소리).
 */
export function castSpeakerId(raw: unknown, cast: ReadonlySet<string>): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  if (!id) return null
  if (cast.has(id)) return id
  const base = id.replace(/_v\d+$/i, '')
  if (cast.has(base)) return base
  const lower = base.toLowerCase()
  for (const castId of cast) if (castId.toLowerCase() === lower) return castId
  return null
}

export function shotDialogueLines(shotDialogue: ShotDialogue | null | undefined, cast: ReadonlySet<string>): DialogueLine[] {
  if (!shotDialogue) return []
  const durationHint = (text: string) => Math.round(speechSecondsForText(text) * 10) / 10 // #d6 실발화 초
  return [
    ...shotDialogue.dialogue.map((l) => {
      const characterId = castSpeakerId(l.character_id, cast)
      if (characterId === null && typeof l.character_id === 'string' && l.character_id.trim()) {
        console.warn(`[dialogue] 등장인물 목록에 없는 화자 "${l.character_id}" → 화면 밖 목소리로 저장 (shot ${shotDialogue.shot_id})`)
      }
      return {
        characterId,
        text: l.line,
        emotion: '',
        delivery: l.delivery ?? '',
        durationHint: durationHint(l.line),
      }
    }),
    // 내레이션(V.O.)도 화자 없는 줄 — 뷰가 'V.O.'로 표기한다.
    ...(shotDialogue.narration
      ? [{ characterId: null, text: shotDialogue.narration, emotion: '', delivery: 'V.O.', durationHint: durationHint(shotDialogue.narration) }]
      : []),
  ]
}
