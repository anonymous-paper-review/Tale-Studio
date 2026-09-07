// 샷 ↔ 대사 조인 정합 (#dialogue-join 2026-08-10) — 회귀 방지.
//
// 실측 결함(f32b3f50): 대사 트랙은 데쿠파주 id 공간에 키가 잡히는데 shotCheck Step 3 가 분할 적용 후
//   시퀀스를 위치 기준으로 리넘버한다. 최종 shot_id 로 조인하면 분할 지점 이후 전 샷의 대사가 밀려
//   137 조인가능 샷 중 98샷이 다른 씬의 대사를 물었다(68라인 중 48라인 오배치).
//
// 계약:
//   1. 조인은 리넘버 전 id(source_shot_id) 기준 — 오배치 0.
//   2. 같은 부모에서 갈라진 형제는 위치상 첫 자식만 대사를 상속한다 (design_ref 이디엄과 동일).
//   3. 분할이 0이면 결과가 종전(직접 id 조인)과 완전히 같다.
//   4. source_shot_id 가 없는 구 시퀀스는 직접 id 조인으로 폴백한다 (하위호환).
import { describe, it, expect } from 'vitest'
import { buildShotDialogueMap } from '@/lib/writer/pipeline/util/dialogue_join'
import type { DialogueTrack, ShotSequenceItem } from '@/lib/writer/types/pipeline'

/** 최종 시퀀스의 한 샷 — id 는 리넘버 후, source 는 리넘버 전(분할 자식이면 부모). */
function seqShot(id: string, sceneId: string, source?: string): ShotSequenceItem {
  return {
    shot_id: id,
    duration_seconds: 5,
    ...(source !== undefined ? { source_shot_id: source } : {}),
    S: { scene_id: sceneId, scene_purpose: '', emotion_beat: { start: '', end: '' }, character_action: '' },
    C: { causal_link: { from: null, to: null }, info_disclosure: '' },
    V: {
      camera: { type: 'MS', angle: 'eye_level', movement: 'static' },
      lighting: { key_fill_ratio: '', color_temp: '' },
      composition: '',
      mood: '',
    },
    assets: { characters: [], locations: [] },
    first_frame_generation: { base_assets: [], composition_prompt: '' },
    video_generation: { motion_prompt: '' },
    action_budget: {
      primary_action_count: 1,
      secondary_action_count: 0,
      camera_movement_complexity: 'none',
      environmental_changes: 0,
      passed_validation: true,
    },
    continuity: { carry_forward_from: null, consistent_elements: [], changes: [], is_scene_transition: false },
  } as ShotSequenceItem
}

/** 대사 트랙 — 데쿠파주 id 공간. 각 라인은 자기 소스 id 를 본문에 박아 추적 가능하게 한다. */
const track: DialogueTrack = {
  profiles: [],
  scenes: [
    {
      scene_id: 'scene_1',
      shots: [
        { shot_id: 'shot_1', dialogue: [{ character_id: 'a', line: 'line-of-shot_1' }], narration: null },
        { shot_id: 'shot_2', dialogue: [{ character_id: 'a', line: 'line-of-shot_2' }], narration: null },
        { shot_id: 'shot_3', dialogue: [{ character_id: 'a', line: 'line-of-shot_3' }], narration: null },
      ],
    },
    {
      scene_id: 'scene_2',
      shots: [
        { shot_id: 'shot_4', dialogue: [{ character_id: 'b', line: 'line-of-shot_4' }], narration: null },
        { shot_id: 'shot_5', dialogue: [{ character_id: 'b', line: 'line-of-shot_5' }], narration: null },
      ],
    },
  ],
} as DialogueTrack

/** 대사 라인이 어느 소스 샷에서 왔는지 — 'line-of-shot_N' → 'shot_N'. */
const sourceOfLine = (line: string) => line.replace('line-of-', '')

describe('buildShotDialogueMap — 분할 시퀀스 조인 정합', () => {
  // shot_2 가 두 자식으로 분할된 최종 시퀀스. 리넘버 때문에 최종 id 는 소스와 어긋난다.
  const split = [
    seqShot('shot_1', 'scene_1', 'shot_1'),
    seqShot('shot_2', 'scene_1', 'shot_2'), // 분할 첫 자식
    seqShot('shot_3', 'scene_1', 'shot_2'), // 분할 둘째 자식 (형제)
    seqShot('shot_4', 'scene_1', 'shot_3'),
    seqShot('shot_5', 'scene_2', 'shot_4'),
    seqShot('shot_6', 'scene_2', 'shot_5'),
  ]

  it('① 오배치 0 — 모든 샷이 자기 소스의 대사를 물고, 씬도 일치한다', () => {
    const map = buildShotDialogueMap(split, track)
    const sceneOfSource = new Map<string, string>()
    for (const sc of track.scenes) for (const sh of sc.shots) sceneOfSource.set(sh.shot_id, sc.scene_id)

    let misattributed = 0
    for (const shot of split) {
      const got = map.get(shot.shot_id)
      if (!got) continue
      const from = sourceOfLine(got.dialogue[0].line)
      // 라인의 출처가 그 샷의 source_shot_id 와 같아야 하고, 씬도 어긋나면 안 된다.
      if (from !== shot.source_shot_id || sceneOfSource.get(from) !== shot.S.scene_id) misattributed += 1
    }
    expect(misattributed).toBe(0)

    // 리넘버로 밀린 자리를 구체적으로 고정: 최종 shot_4 는 소스 shot_3 의 대사를 물어야 한다
    // (버그판은 최종 id 로 조인해 shot_4 — 다른 씬의 대사 — 를 물었다).
    expect(map.get('shot_4')?.dialogue[0].line).toBe('line-of-shot_3')
    expect(map.get('shot_5')?.dialogue[0].line).toBe('line-of-shot_4')
  })

  it('② 형제는 첫 자식만 상속 — 둘째 자식은 빈 대사', () => {
    const map = buildShotDialogueMap(split, track)
    expect(map.get('shot_2')?.dialogue[0].line).toBe('line-of-shot_2') // 첫 자식
    expect(map.has('shot_3')).toBe(false) // 형제 — 같은 말을 두 번 하지 않는다
  })

  it('③ 분할 0이면 종전(직접 id 조인)과 동일', () => {
    const noSplit = [
      seqShot('shot_1', 'scene_1', 'shot_1'),
      seqShot('shot_2', 'scene_1', 'shot_2'),
      seqShot('shot_3', 'scene_1', 'shot_3'),
      seqShot('shot_4', 'scene_2', 'shot_4'),
      seqShot('shot_5', 'scene_2', 'shot_5'),
    ]
    const map = buildShotDialogueMap(noSplit, track)
    for (const shot of noSplit) {
      expect(map.get(shot.shot_id)?.dialogue[0].line).toBe(`line-of-${shot.shot_id}`)
    }
    expect(map.size).toBe(5)
  })

  it('④ source_shot_id 없는 구 시퀀스는 직접 id 조인으로 폴백', () => {
    const legacy = [
      seqShot('shot_1', 'scene_1'),
      seqShot('shot_2', 'scene_1'),
      seqShot('shot_3', 'scene_1'),
    ]
    const map = buildShotDialogueMap(legacy, track)
    expect(map.get('shot_1')?.dialogue[0].line).toBe('line-of-shot_1')
    expect(map.get('shot_3')?.dialogue[0].line).toBe('line-of-shot_3')
    expect(map.size).toBe(3)
  })

  it('대사 트랙이 없으면 빈 맵', () => {
    expect(buildShotDialogueMap(split, null).size).toBe(0)
  })
})
