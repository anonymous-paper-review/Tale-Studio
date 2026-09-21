// 이 파일이 지키는 약속: 사용자가 대본을 "그대로 보존"하기로 하면 씬·인물·대사는 대본에서 그대로 옮겨지고, 대본에 없어 새로 채운 칸은 "추가됨"으로 표시된다.
//   근거: 2026-09-17 오너 — 창작자의 대본은 각색되지 않고 writer·artist 까지 담겨야 한다. 요소 분석: research/seeds/scripts/summer-2025/00-분류.md §4.
import { describe, it, expect } from 'vitest'
import { parseScript } from '@/lib/writer/script/parse'
import { castFromScript, scenesFromScript, dialogueTrackFromScript, annotateScriptScenes, SCRIPT_GENERATED_FIELDS } from '@/lib/writer/script/preserve'
import type { DecoupagePlan, DecoupageShot, NarrativeStructure } from '@/lib/writer/types/pipeline'

const SCRIPT = `AND COUNTING

Character Breakdowns

SPENCER - Lead Role
Early 20s, mom of the friend group. Finds a way to maintain calm.

LUIS - Lead Role
Early 20s, "Dad" of the friend group.

INT. DINING ROOM - CONTINUOUS
KAIA, RODNEY, SPENCER, and LUIS talk and eat at the dinner table.

LUIS
He won't budge.

SPENCER
(getting up)
I should make him a plate-

The lights flicker for a moment. When the light becomes stable again, the cake is gone.

CUT TO:

INT. WINE CELLAR - CONTINUOUS
Spencer closes the door behind her. She grabs a wine bottle and before she can drink it disappears from her hand.

SPENCER
Happy?

LUIS
Don't give me that-

EXT. BEACH - DUSK
PUSH IN on the three figures. Callum reads a verse.

CALLUM (V.O.)
Do not fear, for I am with you.

FADE TO WHITE.`

const doc = parseScript(SCRIPT)!

function shot(id: string, scene_id: string, source_beats: number[], extra: Partial<DecoupageShot> = {}): DecoupageShot {
  return { shot_id: id, scene_id, operation: source_beats.length ? 'derived' : 'added', shot_function: 'action', source_beats, beat_summary: '', shot_size: 'MS', intended_duration_seconds: 4, rhythm_role: 'develop', camera_intent: 'static', dramatic_purpose: '', ...extra }
}
// scene_1 비트: [0]=지문 [1]=LUIS 대사 [2]=SPENCER 대사 [3]=지문. 샷은 0-1 / 2 / (added) / 3 로 나뉜다.
const DEC: DecoupagePlan = {
  scenes: [
    { scene_id: 'scene_1', beat_count: 4, shot_count: 4, coverage_ratio: 1, rhythm_profile: '', uncovered_beats: [], shots: [shot('shot_1', 'scene_1', [0, 1], { operation: 'merged' }), shot('shot_2', 'scene_1', [2]), shot('shot_3', 'scene_1', []), shot('shot_4', 'scene_1', [3])] },
    { scene_id: 'scene_2', beat_count: 3, shot_count: 1, coverage_ratio: 0.33, rhythm_profile: '', uncovered_beats: [], shots: [shot('shot_5', 'scene_2', [0])] }, // 대사 비트 1·2 를 덮는 샷이 없다 → 가장 가까운 앞 샷
    { scene_id: 'scene_3', beat_count: 2, shot_count: 1, coverage_ratio: 0.5, rhythm_profile: '', uncovered_beats: [], shots: [shot('shot_6', 'scene_3', [0, 1])] },
  ],
  total_shots: 6, total_added: 1, total_merged: 1, total_split: 0, director_notes: '',
}

describe('대본 보존 — 씬', () => {
  const scenes = scenesFromScript(doc)

  // 왜: 보존의 첫째 약속 — 지금 S축은 씬을 다시 나누고 합친다. 대본이면 씬 단위는 작가가 정한 것이다.
  it('대본을 보존하면 씬의 순서·장소·시간은 대본 그대로이고 씬을 만들거나 합치지 않는다', () => {
    expect(scenes.scenes.map((s) => s.scene_id)).toEqual(['scene_1', 'scene_2', 'scene_3'])
    expect(scenes.scenes.map((s) => s.location)).toEqual(['DINING ROOM', 'WINE CELLAR', 'BEACH'])
    expect(scenes.scenes.map((s) => s.time_of_day)).toEqual(['CONTINUOUS', 'CONTINUOUS', 'DUSK'])
    expect(scenes.scenes[0].characters_in_scene).toEqual(expect.arrayContaining(['luis', 'spencer']))
  })

  // 왜: 데쿠파주는 scene_actions 인덱스로 샷을 나눈다 — 비트가 대본 블록과 1:1 이어야 대사가 정확한 샷에 실린다.
  it('보존한 씬의 비트는 대본의 지문·대사 블록을 순서대로 담고, 대사 블록은 화자 이름으로 시작한다', () => {
    const s1 = scenes.scenes[0]
    expect(s1.scene_actions).toHaveLength(4)
    expect(s1.scene_actions[0]).toMatch(/^KAIA, RODNEY, SPENCER, and LUIS talk/)
    expect(s1.scene_actions[1]).toBe("LUIS: He won't budge.")
    expect(s1.scene_actions[2]).toBe('SPENCER: (getting up) I should make him a plate-')
    expect(s1.key_dialogue?.[0]).toEqual({ character_id: 'luis', line: "He won't budge.", delivery: '' })
  })

  // 왜: 카메라·트랜지션·화면 문자는 우리 V축이 다시 정하는 영역이라 비트에 섞지 않고 따로 넘겨 "대본의 지시" 로 보이게 한다.
  it('대본의 카메라·편집·화면·소리 지시는 비트가 아니라 씬의 지시 메모(source_directions)로 넘어간다', () => {
    expect(scenes.scenes[0].source_directions).toEqual(['CUT TO:'])
    expect(scenes.scenes[2].source_directions).toEqual(['PUSH IN on the three figures. Callum reads a verse.', 'FADE TO WHITE.'])
    expect(scenes.scenes[2].scene_actions.some((a) => /PUSH IN/.test(a))).toBe(false)
  })

  // 왜: 대본에는 씬 목적·감정 곡선·정보 비대칭이 없다. 채우되 사람이 "이건 대본에 없던 것" 을 알아야 한다.
  it('대본에 없는 요소(씬 목적·감정 비트·정보 비대칭·요약·길이)는 채우되 "추가됨"으로 표시한다', () => {
    for (const s of scenes.scenes) {
      expect(s.provenance?.source).toBe('script')
      expect(s.provenance?.generated_fields).toEqual(expect.arrayContaining([...SCRIPT_GENERATED_FIELDS]))
      expect(typeof s.purpose).toBe('string')
      expect(s.estimated_seconds).toBeGreaterThan(0)
    }
    expect(scenes.total_estimated_seconds).toBe(scenes.scenes.reduce((a, s) => a + s.estimated_seconds, 0))
  })

  // 왜: 막 구조가 있으면 씬을 막에 나눠 넣어야 하류(v1 막별 아크)가 돈다 — 없으면 한 막.
  it('막 구조를 주면 씬을 막 비율대로 나눠 넣고, 없으면 첫 막에 둔다', () => {
    const structure = { structure_type: '3-act', acts: [{ act_id: 'act_1', purpose: '', proportion: 0.34 }, { act_id: 'act_2', purpose: '', proportion: 0.33 }, { act_id: 'act_3', purpose: '', proportion: 0.33 }], pov: '', theme: '', central_dramatic_question: '', turning_point_position: 0.5 } as NarrativeStructure
    const withActs = scenesFromScript(doc, { structure })
    expect(withActs.scenes.map((s) => s.act_ref)).toEqual(['act_1', 'act_2', 'act_3'])
    expect(scenes.scenes.every((s) => s.act_ref === 'act_1')).toBe(true)
  })
})

describe('대본 보존 — 인물', () => {
  // 왜: 9/10 대본에 인물 설정이 붙어 있다. 그것이 cast 다. 없는 인물을 지어내면 각색이다.
  it('대본에 인물 설정이 있으면 그것이 cast 가 되고 새 인물을 만들지 않는다', () => {
    const cast = castFromScript(doc)
    const ids = cast.characters.map((c) => c.character_id)
    expect(ids).toEqual(expect.arrayContaining(['spencer', 'luis', 'callum']))
    expect(ids).toHaveLength(doc.characters.length)
    const spencer = cast.characters.find((c) => c.character_id === 'spencer')!
    expect(spencer.name).toBe('SPENCER')
    expect(spencer.appearance).toContain('mom of the friend group')
    expect(spencer.role).toBe('protagonist') // "Lead Role" → 주연
    expect(cast.characters.every((c) => c.entity_type === 'person')).toBe(true)
  })
})

describe('대본 보존 — 대사', () => {
  const scenes = scenesFromScript(doc)
  const track = dialogueTrackFromScript(doc, scenes, DEC)

  // 왜: 대사가 한 글자라도 바뀌면 보존이 아니다. 화자도 큐 이름 그대로.
  it('보존한 대본의 대사는 샷 대사 트랙에 그대로 실리고 화자는 큐 이름 그대로다', () => {
    const all = track.scenes.flatMap((s) => s.shots.flatMap((sh) => sh.dialogue))
    expect(all.map((l) => l.line)).toEqual(["He won't budge.", 'I should make him a plate-', 'Happy?', "Don't give me that-", 'Do not fear, for I am with you.'])
    expect(all.map((l) => l.character_id)).toEqual(['luis', 'spencer', 'spencer', 'luis', 'callum'])
    expect(all[1].delivery).toBe('getting up')
  })

  // 왜: 데쿠파주가 비트를 샷에 배정한 대로 대사가 따라가야 러프·실사·자막이 맞는 샷에 붙는다. 덮는 샷이 없으면 가장 가까운 앞 샷.
  it('대사는 그 비트를 덮는 샷에 실리고, 덮는 샷이 없으면 가장 가까운 앞 샷에 실리며, 없어지는 대사는 없다', () => {
    const byShot = Object.fromEntries(track.scenes.flatMap((s) => s.shots.map((sh) => [sh.shot_id, sh.dialogue.map((l) => l.line)])))
    expect(byShot.shot_1).toEqual(["He won't budge."]) // 비트 0-1 을 덮는 롱테이크
    expect(byShot.shot_2).toEqual(['I should make him a plate-'])
    expect(byShot.shot_3).toEqual([]) // 감독이 더한 샷 — 침묵
    expect(byShot.shot_4).toEqual([])
    expect(byShot.shot_5).toEqual(['Happy?', "Don't give me that-"]) // 덮는 샷이 없어 앞 샷으로
    expect(byShot.shot_6).toEqual(['Do not fear, for I am with you.'])
    const total = doc.scenes.flatMap((s) => s.elements).filter((e) => e.type === 'dialogue').length
    expect(track.scenes.flatMap((s) => s.shots.flatMap((sh) => sh.dialogue))).toHaveLength(total)
  })

  // 왜: (V.O.) 는 화면 밖 목소리다 — 내레이션 칸이 아니라 화자가 있는 대사로 남기되 표기를 잃지 않는다.
  it('(V.O.)·(O.S.) 표기는 대사의 전달 방식(delivery)에 남는다', () => {
    const vo = track.scenes[2].shots[0].dialogue[0]
    expect(vo.character_id).toBe('callum')
    expect(vo.delivery).toContain('V.O.')
  })

  // 왜: 목소리 프로파일은 대사 저작용 자료인데 보존 모드에서는 저작하지 않는다 — 형식만 갖추고 "각색 없음" 을 적는다.
  it('목소리 프로파일은 인물마다 있되 "대본 원문 그대로" 라고 적힌다', () => {
    expect(track.profiles.map((p) => p.character_id)).toEqual(expect.arrayContaining(['luis', 'spencer', 'callum']))
    expect(track.profiles[0].speech_style).toContain('대본')
  })
})

describe('대본 보존 — 주석 채우기', () => {
  // 왜: "추가됨" 칸을 LLM 이 채우더라도 대본 내용(장소·대사·비트)은 손대지 않아야 한다. 주석기는 갈아 끼울 수 있다.
  it('주석기는 목적·감정·정보 비대칭·요약만 채우고 대본에서 온 칸은 바꾸지 않는다', async () => {
    const before = scenesFromScript(doc)
    const after = await annotateScriptScenes(before, async (scene) => ({ purpose: 'conflict', emotion_beat: { start: 'calm', end: 'tense' }, info_asymmetry: 'audience>character', dialogue_summary: `${scene.scene_id} summary` }))
    expect(after.scenes[0].purpose).toBe('conflict')
    expect(after.scenes[0].dialogue_summary).toBe('scene_1 summary')
    expect(after.scenes[0].scene_actions).toEqual(before.scenes[0].scene_actions)
    expect(after.scenes[0].location).toBe(before.scenes[0].location)
    expect(after.scenes[0].provenance?.generated_fields).toEqual(expect.arrayContaining(['purpose', 'emotion_beat']))
  })

  // 왜: 주석기가 죽어도 보존 런은 계속되어야 한다(원문이 진실). 실패한 씬은 자리표시 값으로 남는다.
  it('주석기가 실패한 씬은 자리표시 값을 그대로 두고 나머지는 채운다', async () => {
    const before = scenesFromScript(doc)
    const after = await annotateScriptScenes(before, async (scene) => { if (scene.scene_id === 'scene_2') throw new Error('boom'); return { purpose: 'revelation' } })
    expect(after.scenes[0].purpose).toBe('revelation')
    expect(after.scenes[1].purpose).toBe(before.scenes[1].purpose)
    expect(after.scenes[2].purpose).toBe('revelation')
  })
})

// 2026-09-21 오너 결정 — 씬 카드의 요약이 모델 요약(영어→한국어 재번역, "보스급 인물…")이라 보존한 대본에 어울리지 않았다.
describe('대본에서 옮긴 씬의 화면 요약', () => {
  // 왜: 요약 자리는 사람이 씬을 알아보는 첫 줄이다. 대본이 있는데 모델이 지어낸 요약이 앞에 서면 "원문과 다르다"로 읽힌다.
  it('대본에서 옮긴 씬의 요약 자리에는 모델 요약 대신 대본의 첫 지문을 쓴다', async () => {
    const doc = parseScript(SCRIPT)!
    const { scenes } = scenesFromScript(doc)
    const s1 = scenes[0]
    expect(s1.source_summary).toMatch(/^KAIA, RODNEY, SPENCER, and LUIS talk/)
    const { sceneSummaryText } = await import('@/lib/writer/script/preserve')
    // 주석기가 요약을 채워도 대본 씬은 첫 지문이 요약이다.
    expect(sceneSummaryText({ ...s1, dialogue_summary: 'Friends argue over dinner.' })).toMatch(/^KAIA, RODNEY/)
    // 대본이 아닌 씬은 종전대로 모델 요약.
    expect(sceneSummaryText({ ...s1, provenance: undefined, source_summary: undefined, dialogue_summary: 'Friends argue over dinner.' })).toBe('Friends argue over dinner.')
    // 화면·DB 로 가는 두 길이 같은 함수를 쓴다.
    const { adaptScenes } = await import('@/lib/writer/adapters')
    expect(adaptScenes({ scenes: [{ ...s1, dialogue_summary: 'Friends argue over dinner.' }], total_estimated_seconds: 0, coverage_mode: 'honest' })[0].narrativeSummary).toMatch(/^KAIA, RODNEY/)
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('src/lib/writer/pipeline/util/persist_manifest.ts', 'utf8')).toMatch(/sceneSummaryText\(/)
  })
})
