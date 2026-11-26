// [만들기] 때 중요한 소품 고르기(D7 · 오너 E5 2026-11-22 "추천대로" = 안 B) — 인물 · 배경 디자인(v2Design) 바로 앞에서 부른다.
//   확정한 이야기(씬 목록 · 이야기 글)에서 중요한 물건을 골라 사물(entity_type object)로 캐스트에 더하고, 그 물건이 나오는 장면의 등장 목록에 잇는다.
//   그 뒤는 Producer 사물 카드와 같은 길이다: 디자인 → 저장(props 행, writer) → 서버 첫 그림(인물 · 배경 다음) → 샷 단계가 장면 등장 목록에서
//   그 id 를 받아 소품 칸에 쓴다(2026-11-22 실측 8/8).
//   Producer 사물은 늘 함께 간다 — 합쳐 많아야 5개(KEY_PROP_LIMIT), 자리가 없으면 모델을 부르지 않는다.
//   사람 · Producer 사물 · 배경과 같은 것, 장면에 안 나오는 것은 버린다. 실패(모델 오류 · 꼴이 틀린 답)는 [만들기]를 멈추지 않는다 — 소품 없이 간다.
//   모델: 디자인과 같은 V축. 이름 · 생김새는 작품 언어로 쓰고, 그림용 영어 생김새는 저장(persist_manifest)이 인물과 같이 옮긴다.
//   뜻을 나르는 글씨(간판 · 책 제목 · 편지)는 생김새에 따옴표로 적게 한다 — 소품 그림은 설명에 적힌 글씨만 그린다(오너 P1, prop-image.ts).
//   약속: tests/artist/key-props.test.ts
import { z } from 'zod'
import { generateJson, type LlmAxisConfig } from '@/lib/writer/llm/dispatch'
import { recordWriterObservabilityEvent } from '@/lib/writer/debug-events'
import { ACTIVE_PROP_SOURCE } from '@/lib/artist/prop-source'
import type { PipelineLogger } from '@/lib/writer/logger'
import type { Characters, Scenes, StoryCharacter } from '@/lib/writer/types/pipeline'

/** 소품(Producer 사물 + AI 가 고른 것) 최대 수 — 오너 "중요한 소품 3~5개". */
export const KEY_PROP_LIMIT = 5

export type KeyPropDropReason = 'empty' | 'person' | 'duplicate' | 'location' | 'no_scene' | 'over_limit'

/** 고르기 결과 — 실행 상태(keyProps)에 남겨 무엇을 더하고 왜 버렸는지 볼 수 있게 한다. */
export interface KeyPropsOutcome {
  added: Array<{ id: string; name: string; scenes: string[] }>
  dropped: Array<{ id: string; reason: KeyPropDropReason }>
  /** 'full' — Producer 사물이 이미 5개 이상이라 고르지 않았다. */
  skipped?: 'full'
  /** 모델 오류 · 꼴이 틀린 답 — 소품 없이 이어 갔다. */
  failed?: string
}

export interface PickedKeyProp {
  id: string
  name: string
  appearance: string
  scenes: string[]
}

const KeyPropsSchema = z.object({
  props: z.array(z.object({ id: z.string(), name: z.string(), appearance: z.string(), scenes: z.array(z.string()) })).max(12),
})

/** 이름 · id 비교 열쇠 — 소문자, 앞 관사(a/an/the) · 띄어쓰기 · 밑줄 · 붙임표를 지운다. */
function sameKey(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().trim().replace(/^(a|an|the)\s+/, '').replace(/[\s_-]+/g, '')
}

/** 소품 id — 영어 소문자 · 숫자 · 밑줄. 영어 글자로 시작하지 않으면 prop_<순번>. */
function propIdOf(raw: string, order: number): string {
  const id = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(id) ? id : `prop_${order}`
}

/** AI 가 고를 수 있는 자리 — Producer 사물을 빼고 남은 수. */
export function keyPropRoom(characters: Characters): number {
  return Math.max(0, KEY_PROP_LIMIT - characters.characters.filter((character) => character.entity_type === 'object').length)
}

/**
 * 고른 소품을 캐스트 · 장면에 넣는다(순수 — 들어온 값은 바꾸지 않는다).
 *   버리는 차례: 빈 이름 · 생김새 → 사람 → 이미 있는 사물(Producer · 앞서 넣은 것) → 배경 → 장면에 안 나옴 → 자리 넘침.
 *   id 가 사람 · 배경 · 다른 소품과 같으면(이름은 다른 물건) 뒤에 _2, _3 을 붙인다.
 */
export function mergeKeyProps(input: {
  characters: Characters
  scenes: Scenes
  locations: ReadonlyArray<{ id: string; name?: string | null }>
  picked: readonly PickedKeyProp[]
  room: number
}): { characters: Characters; scenes: Scenes; outcome: KeyPropsOutcome } {
  const persons = input.characters.characters.filter((character) => character.entity_type !== 'object')
  const objects = input.characters.characters.filter((character) => character.entity_type === 'object')
  const personKeys = new Set(persons.flatMap((person) => [sameKey(person.name), sameKey(person.id)]))
  const personIds = new Set(persons.map((person) => person.id))
  const objectKeys = new Set(objects.flatMap((object) => [sameKey(object.name), sameKey(object.id)]))
  const objectIds = new Set(objects.map((object) => object.id))
  const locationKeys = new Set(input.locations.flatMap((location) => [sameKey(location.name), sameKey(location.id)]))
  const sceneIds = new Set(input.scenes.scenes.map((scene) => scene.scene_id))
  const taken = new Set([...input.characters.characters.map((character) => character.id), ...input.locations.map((location) => location.id)])

  const added: KeyPropsOutcome['added'] = []
  const dropped: KeyPropsOutcome['dropped'] = []
  const newObjects: StoryCharacter[] = []
  input.picked.forEach((pick, index) => {
    const name = pick.name.trim()
    const appearance = pick.appearance.trim()
    const baseId = propIdOf(pick.id, index + 1)
    const nameKey = sameKey(name)
    const drop = (reason: KeyPropDropReason) => dropped.push({ id: baseId, reason })
    if (!name || !appearance) return drop('empty')
    if (personKeys.has(nameKey) || personIds.has(baseId)) return drop('person')
    if (objectKeys.has(nameKey) || objectIds.has(baseId)) return drop('duplicate')
    if (locationKeys.has(nameKey)) return drop('location')
    const scenes = [...new Set(pick.scenes.filter((sceneId) => sceneIds.has(sceneId)))]
    if (scenes.length === 0) return drop('no_scene')
    if (added.length >= input.room) return drop('over_limit')
    let id = baseId
    for (let n = 2; taken.has(id); n++) id = `${baseId}_${n}`
    taken.add(id)
    objectKeys.add(nameKey)
    objectKeys.add(sameKey(id))
    objectIds.add(id)
    added.push({ id, name, scenes })
    newObjects.push({
      id,
      name,
      entity_type: 'object',
      role: 'supporting',
      personality: [],
      arc: { start_state: '', end_state: '', arc_type: '' },
      appearance_description: appearance,
      motivation: { want: '', need: '' },
    })
  })

  const scenes: Scenes = {
    ...input.scenes,
    scenes: input.scenes.scenes.map((scene) => {
      const joined = added.filter((prop) => prop.scenes.includes(scene.scene_id) && !scene.characters_in_scene.includes(prop.id)).map((prop) => prop.id)
      return joined.length ? { ...scene, characters_in_scene: [...scene.characters_in_scene, ...joined] } : scene
    }),
  }
  return {
    characters: { ...input.characters, characters: [...input.characters.characters, ...newObjects] },
    scenes,
    outcome: { added, dropped },
  }
}

const LANGUAGE: Record<string, string> = { ko: '한국어', en: '영어(English)' }
const STORY_CHARS = 8000

/** 고르기 지시문 — 작품 언어로 이름 · 생김새를 쓰고, 사람 · 이미 있는 사물 · 배경 목록을 함께 준다. */
export function buildKeyPropsPrompt(input: {
  characters: Characters
  scenes: Scenes
  locations: ReadonlyArray<{ id: string; name?: string | null }>
  story: string | undefined
  locale: string | undefined
  room: number
}): { systemInstruction: string; prompt: string } {
  const language = LANGUAGE[input.locale ?? 'ko'] ?? LANGUAGE.ko
  const persons = input.characters.characters.filter((character) => character.entity_type !== 'object')
  const objects = input.characters.characters.filter((character) => character.entity_type === 'object')
  const systemInstruction = `당신은 Artist 의 소품 담당이다. 확정된 이야기에서 화면에 보이는 중요한 물건(소품)을 고른다.
- 소품 = 손에 들리거나 놓이는 물건 가운데, 이야기를 움직이거나 여러 장면에 나와 매번 같은 모습이어야 하는 것.
- 사람 · 동물 · 장소(배경) · 건물 · 날씨 · 몸에 입은 옷 전체는 고르지 않는다. "이미 있는 사물"과 같은 물건도 다시 고르지 않는다.
- 많아야 ${input.room}개, 중요한 순서로. 이야기에 그만한 물건이 없으면 적게 고르고, 하나도 없으면 빈 목록을 낸다. 채우려고 지어내지 않는다.
- id: 영어 소문자 snake_case(아래 목록의 id 와 겹치지 않게). name · appearance: ${language}.
- appearance: 재질 · 색 · 크기 · 낡음처럼 눈에 보이는 생김새만 한두 문장. 간판 · 책 제목 · 편지처럼 물건에 적힌 글씨가 이야기에서 뜻을 나르는 글씨이면
  그 글씨를 따옴표로 그대로 적는다. 이야기에 없는 글씨는 지어내지 않는다.
- scenes: 그 물건이 화면에 나오는 장면의 scene_id — 아래 장면 목록에 있는 것만.`
  const scenes = input.scenes.scenes.map((scene) => ({
    scene_id: scene.scene_id,
    location: scene.location,
    characters_in_scene: scene.characters_in_scene,
    summary: scene.source_summary ?? scene.dialogue_summary,
    actions: scene.scene_actions,
    lines: (scene.key_dialogue ?? []).map((line) => line.line),
  }))
  const prompt = `[이야기]
${(input.story ?? '').slice(0, STORY_CHARS) || '(없음 — 장면 목록으로 판단)'}

[장면 목록]
${JSON.stringify(scenes, null, 2)}

[사람 — 소품이 아니다]
${JSON.stringify(persons.map((person) => ({ id: person.id, name: person.name })))}

[이미 있는 사물 — 다시 고르지 않는다]
${JSON.stringify(objects.map((object) => ({ id: object.id, name: object.name, appearance: object.appearance_description })))}

[배경 — 소품이 아니다]
${JSON.stringify(input.locations.map((location) => ({ id: location.id, name: location.name ?? location.id })))}

[출력 형식 - JSON]
{ "props": [ { "id": "old_letter", "name": "…", "appearance": "…", "scenes": ["<scene_id>"] } ] }`
  return { systemInstruction, prompt }
}

async function quietly(write: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await write()
  } catch {
    // 기록 실패는 [만들기]를 막지 않는다.
  }
}

/**
 * [만들기] 디자인 단계 앞에서 부른다 — 소품 출처가 story_pick 일 때만. 장면이 없으면 부르지 않는다.
 *   돌려주는 characters · scenes 는 소품을 하나라도 더했을 때만 있다(없으면 실행 상태를 바꾸지 않는다).
 */
export async function pickKeyProps(input: {
  characters: Characters
  scenes: Scenes | undefined
  world: { locations: ReadonlyArray<{ id: string; name?: string | null }> } | undefined
  story: string | undefined
  locale: string | undefined
  logger: PipelineLogger
  axis: LlmAxisConfig
  projectId: string
}): Promise<{ characters?: Characters; scenes?: Scenes; outcome?: KeyPropsOutcome }> {
  if (ACTIVE_PROP_SOURCE !== 'story_pick') return {}
  const scenes = input.scenes
  if (!scenes?.scenes?.length) return {}
  const room = keyPropRoom(input.characters)
  if (room === 0) return { outcome: { added: [], dropped: [], skipped: 'full' } }
  const locations = input.world?.locations ?? []
  const { systemInstruction, prompt } = buildKeyPropsPrompt({ characters: input.characters, scenes, locations, story: input.story, locale: input.locale, room })
  await quietly(() => input.logger.markStage('keyProps', 'started'))
  let picked: PickedKeyProp[]
  try {
    const result = await generateJson<unknown>(prompt, input.axis, { systemInstruction, temperature: 0.3, schema: KeyPropsSchema })
    const parsed = KeyPropsSchema.safeParse(result)
    if (!parsed.success) throw new Error('Key props output did not match the expected shape')
    picked = parsed.data.props
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await recordWriterObservabilityEvent(input.projectId, 'route_failed', { source: 'writer_key_props', kind: 'key_props', error: message })
    await quietly(() => input.logger.markStage('keyProps', 'failed', { error: message }))
    return { outcome: { added: [], dropped: [], failed: message } }
  }
  const merged = mergeKeyProps({ characters: input.characters, scenes, locations, picked, room })
  await quietly(() => input.logger.saveLlmCall('keyProps', {
    prompt,
    response: JSON.stringify(picked, null, 2),
    model: `${input.axis.provider}:${input.axis.model ?? ''}`,
    provider: input.axis.provider,
  }))
  await quietly(() => input.logger.markStage('keyProps', 'completed', { added: merged.outcome.added.map((prop) => prop.id), dropped: merged.outcome.dropped }))
  return merged.outcome.added.length ? merged : { outcome: merged.outcome }
}
