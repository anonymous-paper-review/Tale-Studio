// 씬 무대 추출·정규화·검증(#stage 2026-09-03).
import { describe, it, expect } from 'vitest'
import { extractSceneStage, validateSceneStage, sanitizeSceneStage, normalizePosture, buildStageCorrectionNote } from '@/lib/writer/pipeline/stage/validate'

const SCENE = { scene_id: 'scene_1', characters_in_scene: ['char', 'char_2', 'char_3'], scene_actions: ['a', 'b', 'c', 'd', 'e', 'f'] }
const PEOPLE = new Set(['char', 'char_2', 'char_3'])

const GOOD = {
  scene_id: 'scene_1',
  landmarks: [{ id: 'forest', label: 'inverted forest', x: 0, y: 38 }],
  axis: { from: 'char_2', to: 'char' },
  camera_side: 'right',
  beats: [
    { beat: 0, characters: [
      { character_id: 'char', x: -4, y: 0, facing_deg: 90, posture: 'lying' },
      { character_id: 'char_2', x: 0, y: 3, facing_deg: 180, posture: 'lying' },
      { character_id: 'char_3', x: 5, y: 1, facing_deg: 270, posture: 'lying' },
    ] },
    { beat: 1, characters: [
      { character_id: 'char', x: -4, y: 0, facing_deg: 90, posture: 'sitting' },
      { character_id: 'char_2', x: 0, y: 3, facing_deg: 180, posture: 'lying' },
      { character_id: 'char_3', x: 5, y: 1, facing_deg: 270, posture: 'lying' },
    ], end_characters: [
      { character_id: 'char', x: -4, y: 0, facing_deg: 90, posture: 'sitting' },
      { character_id: 'char_2', x: 0, y: 3, facing_deg: 180, posture: 'lying' },
      { character_id: 'char_3', x: 5, y: 1, facing_deg: 270, posture: 'sitting' },
    ] },
  ],
}

describe('extractSceneStage', () => {
  it('{stage:{…}} / 직접 객체 / 배열 래핑을 모두 읽고 숫자·자세·각도를 정규화한다', () => {
    for (const raw of [{ stage: GOOD }, GOOD, [GOOD], { scene_stage: GOOD }]) {
      const s = extractSceneStage(raw, 'scene_1')!
      expect(s.scene_id).toBe('scene_1')
      expect(s.beats).toHaveLength(2)
      expect(s.axis).toEqual({ from: 'char_2', to: 'char' })
      expect(s.camera_side).toBe('right')
      expect(s.beats[1].end_characters).toHaveLength(3)
    }
    const s = extractSceneStage({ ...GOOD, camera_side: 'LEFT', beats: [{ beat: '2', characters: [{ id: 'char', x: '1.234', y: 'nope', facing_deg: -90, posture: 'Stands upright' }] }] }, 'scene_1')!
    expect(s.camera_side).toBe('left')
    expect(s.beats[0].beat).toBe(2)
    expect(s.beats[0].characters[0]).toMatchObject({ character_id: 'char', x: 1.23, y: 0, facing_deg: 270, posture: 'standing' })
    expect(extractSceneStage(null, 'scene_1')).toBeNull()
    expect(extractSceneStage('garbage', 'scene_1')).toBeNull()
  })

  it('자세 동의어', () => {
    expect(normalizePosture('seated')).toEqual({ posture: 'sitting', changed: true })
    expect(normalizePosture('lying down')).toEqual({ posture: 'lying', changed: true })
    expect(normalizePosture('walking')).toEqual({ posture: 'walking', changed: false })
    expect(normalizePosture('dancing')).toEqual({ posture: 'other', changed: true })
  })
})

describe('validateSceneStage', () => {
  it('정상 무대는 통과', () => {
    const v = validateSceneStage(extractSceneStage(GOOD, 'scene_1')!, SCENE, PEOPLE, [{ source_beats: [0] }, { source_beats: [1] }])
    expect(v.valid).toBe(true)
    expect(v.issues.filter((i) => i.severity === 'CRITICAL')).toHaveLength(0)
  })

  it('첫 비트에 씬 인물이 빠지면 CRITICAL, 알 수 없는 id 도 CRITICAL', () => {
    const bad = { ...GOOD, beats: [{ beat: 0, characters: [{ character_id: 'char', x: 0, y: 0, facing_deg: 0, posture: 'standing' }, { character_id: 'ghost', x: 1, y: 1, facing_deg: 0, posture: 'standing' }] }] }
    const v = validateSceneStage(extractSceneStage(bad, 'scene_1')!, SCENE, PEOPLE)
    expect(v.valid).toBe(false)
    expect(v.issues.map((i) => i.message).join('\n')).toMatch(/char_2, char_3/)
    expect(v.issues.some((i) => i.message.includes('ghost'))).toBe(true)
    expect(buildStageCorrectionNote(v.issues)).toContain('[CRITICAL]')
  })

  it('겹침·참조 비트 누락·범위 밖 비트는 WARNING', () => {
    const crowd = { ...GOOD, beats: [{ beat: 0, characters: GOOD.beats[0].characters.map((c) => ({ ...c, x: 0, y: 0 })) }, { beat: 9, characters: GOOD.beats[0].characters }] }
    const v = validateSceneStage(extractSceneStage(crowd, 'scene_1')!, SCENE, PEOPLE, [{ source_beats: [3] }])
    expect(v.valid).toBe(true)
    const msgs = v.issues.map((i) => i.message).join('\n')
    expect(msgs).toMatch(/같은 자리/)
    expect(msgs).toMatch(/무대 상태가 없다: 3/)
    expect(msgs).toMatch(/범위 밖 비트 번호: 9/)
  })

  it('빈 beats 는 CRITICAL', () => {
    const v = validateSceneStage(extractSceneStage({ ...GOOD, beats: [] }, 'scene_1')!, SCENE, PEOPLE)
    expect(v.valid).toBe(false)
  })
})

describe('sanitizeSceneStage', () => {
  it('알 수 없는 id 를 걷어내고 빠진 인물은 가장자리에 세우며 축이 깨지면 null', () => {
    const bad = { ...GOOD, axis: { from: 'ghost', to: 'char' }, beats: [{ beat: 0, characters: [{ character_id: 'char', x: 0, y: 0, facing_deg: 0, posture: 'standing' }, { character_id: 'ghost', x: 1, y: 1, facing_deg: 0, posture: 'standing' }] }] }
    const s = sanitizeSceneStage(extractSceneStage(bad, 'scene_1')!, SCENE, PEOPLE)
    const ids = s.beats[0].characters.map((c) => c.character_id).sort()
    expect(ids).toEqual(['char', 'char_2', 'char_3'])
    expect(s.axis).toBeNull()
    expect(validateSceneStage(s, SCENE, PEOPLE).valid).toBe(true)
  })
})
