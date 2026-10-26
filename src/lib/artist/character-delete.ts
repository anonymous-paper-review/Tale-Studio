// 채팅으로 만들어진 인물 카드 지우기의 판정(2026-10-27 디자이너 QA 1차 #04 · 오너 "채팅 추가 막고 안내") — 순수 함수.
//   지울 수 있는 카드 = 산문 밖에서 만들어진 인물(characters.origin 'user', 예전 Artist 채팅 · + 단추)뿐이다.
//   산문에서 나온 인물(producer · writer)은 산문에서 고친다. 씬 · 샷이 부르고 있거나 그리는 중이면 지우지 않는다.
//   서버 라우트(DELETE /api/artist/character)와 화면(character-delete-client)이 같은 판정을 쓴다.
import { parseDirectorRefs } from '@/lib/director/director-refs'

/** 지우지 않은 까닭 — 화면이 이 값으로 알림 문장을 고른다. */
export type CharacterDeleteRefusal = 'from_prose' | 'in_use' | 'drawing' | 'not_found'

/** 산문 밖에서 만들어진(지울 수 있는) 인물 카드인가. */
export function isChatMadeCharacter(character: { origin?: string | null }): boolean {
  return character.origin === 'user'
}

export interface CharacterUsage {
  /** 이 인물이 나오는 씬 수(등장 인물 · 씬별 모습 지정). */
  scenes: number
  /** 이 인물을 부르는 샷 수(샷 인물 · 샷의 모습 · 대사 · Director 참조). */
  shots: number
}

interface SceneRow { scene_id: string; characters_present?: unknown }
interface ShotRow { shot_id: string; characters?: unknown; character_appearance_keys?: unknown; dialogue_lines?: unknown; director_refs?: unknown }
interface OverrideRow { scene_id: string; character_id?: string | null }

function shotUsesCharacter(shot: ShotRow, characterId: string): boolean {
  if (Array.isArray(shot.characters) && shot.characters.includes(characterId)) return true
  const keys = shot.character_appearance_keys
  if (keys && typeof keys === 'object' && !Array.isArray(keys) && Object.prototype.hasOwnProperty.call(keys, characterId)) return true
  if (Array.isArray(shot.dialogue_lines) && shot.dialogue_lines.some((line) => !!line && typeof line === 'object' && (line as { characterId?: unknown }).characterId === characterId)) return true
  return parseDirectorRefs(shot.director_refs)?.characters.includes(characterId) === true
}

/** 씬 · 샷이 이 인물을 부르는 곳을 센다 — 하나라도 있으면 지우지 않는다. */
export function characterUsage(
  characterId: string,
  rows: { scenes: readonly SceneRow[]; shots: readonly ShotRow[]; overrides: readonly OverrideRow[] },
): CharacterUsage {
  const scenes = new Set<string>()
  for (const scene of rows.scenes) {
    if (Array.isArray(scene.characters_present) && scene.characters_present.includes(characterId)) scenes.add(scene.scene_id)
  }
  for (const override of rows.overrides) {
    if (override.character_id == null || override.character_id === characterId) scenes.add(override.scene_id)
  }
  return { scenes: scenes.size, shots: rows.shots.filter((shot) => shotUsesCharacter(shot, characterId)).length }
}

/** 대기 중인 그림 작업(generation_jobs 의 target)이 이 인물을 그리고 있는가. */
export function queuedJobDrawsCharacter(jobs: ReadonlyArray<{ target?: unknown }>, characterId: string): boolean {
  return jobs.some((job) => !!job.target && typeof job.target === 'object' && (job.target as { characterId?: unknown }).characterId === characterId)
}

type CastLike = { characterId?: unknown; name?: unknown; origin?: unknown }

/**
 * 산문 목록(Producer 캐스트 · producer_draft.cast)에서 지운 카드를 뺀다 — 다시 저장 · 다시 열기로 되살아나지 않게.
 *   아이디가 같으면 뺀다. 아이디 없이 이름만 같은 줄은 다른 출처(산문 · Producer · 트리트먼트)가 적혀 있지 않을 때만 같은 카드로 본다.
 */
export function removeCharacterFromCast<T extends CastLike>(cast: readonly T[], target: { characterId: string; name: string }): T[] {
  const name = target.name.trim().toLowerCase()
  return cast.filter((member) => {
    if (typeof member.characterId === 'string' && member.characterId.trim()) return member.characterId !== target.characterId
    const sameName = !!name && typeof member.name === 'string' && member.name.trim().toLowerCase() === name
    const noOtherOrigin = member.origin == null || member.origin === 'user'
    return !(sameName && noOtherOrigin)
  })
}

/** projects.producer_draft(jsonb) 에서 지운 카드를 뺀 새 초안. 바뀐 게 없으면 changed:false 로 그대로 돌려준다. */
export function removeCharacterFromProducerDraft(raw: unknown, target: { characterId: string; name: string }): { draft: unknown; changed: boolean } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { draft: raw, changed: false }
  const draft = raw as { cast?: unknown }
  if (!Array.isArray(draft.cast)) return { draft: raw, changed: false }
  const cast = draft.cast.filter((member): member is CastLike => !!member && typeof member === 'object')
  const kept = removeCharacterFromCast(cast, target)
  if (kept.length === cast.length) return { draft: raw, changed: false }
  return { draft: { ...draft, cast: kept }, changed: true }
}
