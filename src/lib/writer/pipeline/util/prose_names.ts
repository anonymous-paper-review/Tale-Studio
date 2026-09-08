// 이야기 문장에는 이름이 나온다(#names-in-prose 2026-09-08, 오너 지시) — 순수 함수. 씬 스토리·데쿠파주·V4 가 같이 쓴다.
//
//   왜: 한글 이름은 슬러그가 비어 'char','char_2' 로 폴백하고, 씬 스토리 지시서가 캐스트를 "char (용족수장)" 로 보여 주니
//   모델이 문장에도 id 를 썼다(겨울_7: 26샷 중 18샷). 그 문장이 데쿠파주·V4·이미지 프롬프트까지 번졌다.
//   규칙: 산문 필드는 표시 이름, 구조 칸(characters_in_scene·character_id·gaze_arc·camera_target·prop id)은 id 그대로.
//   지시서(1차 방어)가 규칙을 말하고, 여기(2차 방어)가 남은 id 를 이름으로 바꾼다 — 모르는 id 는 지어내지 않는다.
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import type { Characters, DecoupageShot, Scenes, ShotDesign } from '@/lib/writer/types/pipeline'

export interface ProseEntity {
  id: string
  name: string
}

/** 지시서 공통 문구 — 세 단계가 같은 문장을 싣는다. */
export const PROSE_NAME_RULE = `[이름 규칙] 이야기 문장(scene_actions·요약·대사·beat_summary·layers·first_frame_prompt·motion_prompt·pose·verb 등 사람이 읽는 모든 산문)에서 인물·장소는 **표시 이름**으로 쓴다(예: "용족수장이 눈을 뜬다"). slug/id(char, char_2, location_2 …)는 characters_in_scene·character_id·camera_target 같은 **구조 칸에만** 쓴다. 문장에 id 가 남으면 코드가 이름으로 바꾼다.`

export function castEntities(characters: Characters | null | undefined, extra?: ReadonlyArray<{ id: string; name: string }> | null): ProseEntity[] {
  const out: ProseEntity[] = []
  for (const c of characters?.characters ?? []) if (c.id && c.name) out.push({ id: c.id, name: c.name })
  for (const c of extra ?? []) if (c.id && c.name) out.push({ id: c.id, name: c.name })
  return out
}

const fix = (text: string | undefined | null, entities: readonly ProseEntity[]): string | undefined =>
  typeof text === 'string' ? resolveEntityNames(text, entities) : text ?? undefined

/** 씬 스토리 — scene_actions·요약·대사 문장. characters_in_scene·character_id 는 그대로. new_characters 의 이름도 로스터에 든다. */
export function cleanSceneProse(scenes: Scenes, characters: Characters): Scenes {
  const entities = castEntities(characters, scenes.new_characters?.map((n) => ({ id: n.id, name: n.name })))
  if (entities.length === 0) return scenes
  return {
    ...scenes,
    scenes: scenes.scenes.map((sc) => ({
      ...sc,
      dialogue_summary: fix(sc.dialogue_summary, entities) ?? sc.dialogue_summary,
      ...(sc.key_dialogue ? { key_dialogue: sc.key_dialogue.map((d) => ({ ...d, line: fix(d.line, entities) ?? d.line })) } : {}),
      scene_actions: (sc.scene_actions ?? []).map((a) => (typeof a === 'string' ? resolveEntityNames(a, entities) : a)),
    })),
  }
}

/** 데쿠파주 — beat_summary(_native)·목적·추가 사유·자유 문장 동기. camera_target 은 그대로. */
export function cleanDecoupageProse<T extends Partial<DecoupageShot>>(shots: T[], entities: readonly ProseEntity[]): T[] {
  if (entities.length === 0) return shots
  return shots.map((s) => ({
    ...s,
    ...(typeof s.beat_summary === 'string' ? { beat_summary: resolveEntityNames(s.beat_summary, entities) } : {}),
    ...(typeof s.beat_summary_native === 'string' ? { beat_summary_native: resolveEntityNames(s.beat_summary_native, entities) } : {}),
    ...(typeof s.dramatic_purpose === 'string' ? { dramatic_purpose: resolveEntityNames(s.dramatic_purpose, entities) } : {}),
    ...(typeof s.added_rationale === 'string' ? { added_rationale: resolveEntityNames(s.added_rationale, entities) } : {}),
    ...(typeof s.camera_move_motivation === 'string' ? { camera_move_motivation: resolveEntityNames(s.camera_move_motivation, entities) } : {}),
  }))
}

/** V4 — 산문 필드만. character_id·gaze_arc·camera_motion.target·prop 는 그대로. */
export function cleanShotDesignProse(shot: ShotDesign, entities: readonly ProseEntity[]): ShotDesign {
  if (entities.length === 0) return shot
  const intent = shot.intent
    ? {
        ...shot.intent,
        dramatic_purpose: fix(shot.intent.dramatic_purpose, entities) ?? shot.intent.dramatic_purpose,
        duration_justification: fix(shot.intent.duration_justification, entities) ?? shot.intent.duration_justification,
        audience_focus: fix(shot.intent.audience_focus, entities) ?? shot.intent.audience_focus,
      }
    : shot.intent
  const st = shot.static_spec
  const staticSpec = st
    ? {
        ...st,
        framing: st.framing
          ? {
              ...st.framing,
              focal_point: fix(st.framing.focal_point, entities) ?? st.framing.focal_point,
              layers: Object.fromEntries(
                Object.entries(st.framing.layers ?? {}).map(([k, v]) => [k, typeof v === 'string' ? resolveEntityNames(v, entities) : v]),
              ) as typeof st.framing.layers,
            }
          : st.framing,
        character_blocking: Array.isArray(st.character_blocking)
          ? st.character_blocking.map((b) => ({ ...b, pose: fix(b.pose, entities) ?? b.pose }))
          : st.character_blocking,
        prop_placement: Array.isArray(st.prop_placement)
          ? st.prop_placement.map((p) => ({ ...p, ...(typeof p.significance === 'string' ? { significance: resolveEntityNames(p.significance, entities) } : {}) }))
          : st.prop_placement,
        texture_notes: fix(st.texture_notes, entities) ?? st.texture_notes,
        color_grading_intent: fix(st.color_grading_intent, entities) ?? st.color_grading_intent,
        first_frame_prompt: fix(st.first_frame_prompt, entities) ?? st.first_frame_prompt,
      }
    : st
  const dyn = shot.dynamic_spec
  const dynamicSpec = dyn
    ? {
        ...dyn,
        character_motion: (dyn.character_motion ?? []).map((m) => ({ ...m, verb: fix(m.verb, entities) ?? m.verb })),
        ...(Array.isArray(dyn.environmental_change)
          ? { environmental_change: dyn.environmental_change.map((e) => { const d = (e as unknown as { description?: unknown }).description; return typeof d === 'string' ? { ...e, description: resolveEntityNames(d, entities) } : e }) }
          : {}),
        motion_prompt: fix(dyn.motion_prompt, entities) ?? dyn.motion_prompt,
      }
    : dyn
  return { ...shot, intent, static_spec: staticSpec, dynamic_spec: dynamicSpec } as ShotDesign
}
