// #p4-json-guard — LLM 산출 스키마 게이트 검증.
// ① 단위: 스키마가 결손·절단(빈 배열/필드 소실)을 실제로 잡는가 — repairJson 무신호 손실(Q6) 방어 확인.
// ② 픽스처 회귀: 실제 프로덕션 산출(로컬 3런 로그)이 스키마를 통과하는가 — 정상 산출을 죽이는
//    오탐(false positive)이 없음을 실데이터로 검산. 로그는 gitignored 라 없으면 skip(CI 안전).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DramaturgySchema,
  MergedRawSchema,
  NarrativeStructureSchema,
  ScenesSchema,
  findUnknownFields,
} from '@/lib/writer/pipeline/schemas'

describe('스키마 게이트 — 결손을 잡는다 (Q6 계열 방어)', () => {
  it('Dramaturgy: world_inventory 소실을 거부한다', () => {
    const r = DramaturgySchema.safeParse({
      core_engine: 'x',
      mechanism_notes: [],
      dramatic_diagnosis: { stakes: '', weak_beats: [], cdq_candidates: [], ending_check: '' },
    })
    expect(r.success).toBe(false)
  })

  it('Scenes: 빈 씬 배열(절단 복구가 아이템을 다 버린 형태)을 거부한다', () => {
    const r = ScenesSchema.safeParse({ scenes: [], total_estimated_seconds: 100 })
    expect(r.success).toBe(false)
  })

  it('Scenes: 씬에 scene_actions 가 없으면 거부한다', () => {
    const r = ScenesSchema.safeParse({
      scenes: [{ scene_id: 'sc_1', location: 'loc' }],
    })
    expect(r.success).toBe(false)
  })

  it('Scenes: 미지 필드는 거부하지 않는다(원본 반환 원칙과 합)', () => {
    const r = ScenesSchema.safeParse({
      scenes: [
        {
          scene_id: 'sc_1',
          act_ref: 'act_1',
          location: 'loc',
          time_of_day: 'day',
          weather: 'rain',
          characters_in_scene: ['char_1'],
          purpose: 'conflict',
          emotion_beat: { start: 'calm', end: 'tense' },
          dialogue_summary: 'they argue',
          info_asymmetry: 'audience=character',
          estimated_seconds: 12,
          scene_actions: ['a'],
          extra: 1, // 미지 필드
        },
      ],
      total_estimated_seconds: 10,
      unknown_root_field: true,
    })
    expect(r.success, JSON.stringify(!r.success && r.error.issues.slice(0, 5))).toBe(true)
  })

  it('NarrativeStructure: acts 빈 배열을 거부한다', () => {
    const r = NarrativeStructureSchema.safeParse({
      structure_type: '3-act',
      acts: [],
      pov: '3rd_limited',
      theme: 't',
      central_dramatic_question: 'q',
      turning_point_position: 0.5,
    })
    expect(r.success).toBe(false)
  })
})

// ── StorySceneLooseSchema — 2026-08-12 13필드 전집합 확장 게이트 ──
//   #p4-json-guard 후속: 3필드(scene_id/location/scene_actions)만 강제하던 구멍으로
//   key_dialouge 오타(2026-08-04)·characters_id 오타(2026-07-27)가 무신호로 통과했다.
//   StoryScene(pipeline.ts) 전 필드를 옮긴 뒤에도 결손·형태 위반이 실제로 잡히는지 검산한다.
describe('StorySceneLooseSchema — 씬 전 필드 게이트', () => {
  // 필수 11필드만 채운 최소 유효 씬 — weather/key_dialogue(optional)는 의도적으로 비움.
  const validScene = () => ({
    scene_id: 'sc_1',
    act_ref: 'act_1',
    location: 'loc_1',
    time_of_day: 'day',
    characters_in_scene: ['char_1'],
    purpose: 'conflict',
    emotion_beat: { start: 'calm', end: 'tense' },
    dialogue_summary: 'they argue',
    info_asymmetry: 'audience=character',
    estimated_seconds: 12,
    scene_actions: ['a walks in'],
  })

  it('characters_in_scene 결손을 거부한다(2026-07-27 characters_id 오타 사고 재현)', () => {
    const scene = validScene() as Record<string, unknown>
    delete scene.characters_in_scene
    const r = ScenesSchema.safeParse({ scenes: [scene] })
    expect(r.success).toBe(false)
  })

  it('emotion_beat 결손을 거부한다', () => {
    const scene = validScene() as Record<string, unknown>
    delete scene.emotion_beat
    const r = ScenesSchema.safeParse({ scenes: [scene] })
    expect(r.success).toBe(false)
  })

  it('emotion_beat 형태 위반({start,end} 아님)을 거부한다', () => {
    const scene = { ...validScene(), emotion_beat: { start: 'calm' } } // end 없음
    const r = ScenesSchema.safeParse({ scenes: [scene] })
    expect(r.success).toBe(false)
  })

  it('optional 필드(weather, key_dialogue) 부재는 통과한다(오탐 0 확인)', () => {
    const r = ScenesSchema.safeParse({ scenes: [validScene()] })
    expect(r.success, JSON.stringify(!r.success && r.error.issues.slice(0, 5))).toBe(true)
  })

  // 알려진 사각지대(characterization test) — key_dialogue 는 StoryScene 타입에서 optional 이다
  // (item 1 규칙: optional 을 required 로 승격 금지 — 실패율만 올린다). 그래서 "필드가 아예
  // 없음"과 "오타 이름(key_dialouge)으로 대신 있음"을 스키마가 구분하지 못한다 — 둘 다 정본
  // key_dialogue 부재로 보여 통과한다. z.looseObject 는 미지 필드를 허용하므로 key_dialouge
  // 자체도 거부 사유가 안 된다. 오타 방어를 원하면 key_dialogue 를 required 로 올리는
  // 트레이드오프(실패율 상승)를 오너가 별도로 결정해야 한다 — 여기선 현재 동작을 고정만 한다.
  it('key_dialogue 오타(key_dialouge)는 optional 필드라 스키마 레벨에서 못 잡는다(알려진 한계)', () => {
    const scene = validScene() as Record<string, unknown>
    scene.key_dialouge = [{ character_id: 'char_1', line: 'hi', delivery: 'soft' }]
    const r = ScenesSchema.safeParse({ scenes: [scene] })
    expect(r.success).toBe(true)
  })
})

// ── 미지 필드 기록(#p4-json-guard 후속 2026-08-12) — 거부 대신 기록. key_dialouge 는 스키마
//   레벨에서 통과하지만(위 characterization test), findUnknownFields 로는 잡혀야 무신호가 없어진다.
describe('findUnknownFields — 미지 필드는 거부하지 않고 기록만 한다', () => {
  const validScene = () => ({
    scene_id: 'sc_1',
    act_ref: 'act_1',
    location: 'loc_1',
    time_of_day: 'day',
    characters_in_scene: ['char_1'],
    purpose: 'conflict',
    emotion_beat: { start: 'calm', end: 'tense' },
    dialogue_summary: 'they argue',
    info_asymmetry: 'audience=character',
    estimated_seconds: 12,
    scene_actions: ['a walks in'],
  })

  it('key_dialouge 오타가 섞이면 스키마는 통과하되 미지 필드로 기록된다', () => {
    const scene = validScene() as Record<string, unknown>
    scene.key_dialouge = [{ character_id: 'char_1', line: 'hi', delivery: 'soft' }]
    const payload = { scenes: [scene] }
    const parsed = ScenesSchema.safeParse(payload)
    expect(parsed.success).toBe(true) // 통과는 시킨다(거부 아님)

    const report = findUnknownFields(ScenesSchema, payload)
    expect(report.size).toBeGreaterThan(0)
    const sceneLevel = report.get('scenes')
    expect(sceneLevel?.get('key_dialouge')).toEqual(['sc_1']) // 값은 안 담고 scene_id 라벨만
  })

  it('정상 산출(미지 필드 없음)은 경고 0 — 오탐 없음', () => {
    const payload = { scenes: [validScene()], total_estimated_seconds: 12 }
    const report = findUnknownFields(ScenesSchema, payload)
    expect(report.size).toBe(0)
  })

  it('모델 산출 값은 로그에 담기지 않는다 — 라벨은 키 이름/식별자뿐, 필드 값 문자열은 안 실린다', () => {
    const scene = validScene() as Record<string, unknown>
    scene.secret_note = 'this is sensitive model output text'
    const report = findUnknownFields(ScenesSchema, { scenes: [scene] })
    const labels = report.get('scenes')?.get('secret_note') ?? []
    expect(labels).toEqual(['sc_1']) // scene_id(식별자)만 — 필드 값('this is sensitive...')은 없음
  })
})

// ── 픽스처 회귀 — 실제 프로덕션 산출이 통과해야 한다 (오탐 0 검산) ──
const RUNS = [
  '064631aa-f6b2-4f7c-800b-66b0517a2769',
  '5260d92d-2e7b-4991-8bff-00213b37ef77',
  'e4da245a-8d89-44e5-8fde-131d016ef2e3',
]
const fixture = (run: string, file: string) => path.resolve(process.cwd(), 'logs', run, file)
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

describe('픽스처 회귀 — 실산출 오탐 0', () => {
  for (const run of RUNS) {
    const s0 = fixture(run, '01_s0_dramaturgy.json')
    it.skipIf(!existsSync(s0))(`s0 dramaturgy 실산출 통과 (${run.slice(0, 8)})`, () => {
      const r = DramaturgySchema.safeParse(load(s0))
      expect(r.success, JSON.stringify(!r.success && r.error.issues.slice(0, 3))).toBe(true)
    })

    const s1 = fixture(run, '03_s1_narrativeStructure.json')
    it.skipIf(!existsSync(s1))(`s1 구조 실산출 통과 (${run.slice(0, 8)})`, () => {
      const r = NarrativeStructureSchema.safeParse(load(s1))
      expect(r.success, JSON.stringify(!r.success && r.error.issues.slice(0, 3))).toBe(true)
    })

    const s3 = fixture(run, '05_s3_scenes.json')
    it.skipIf(!existsSync(s3))(`s3 씬 실산출 통과 (${run.slice(0, 8)})`, () => {
      const r = ScenesSchema.safeParse(load(s3))
      expect(r.success, JSON.stringify(!r.success && r.error.issues.slice(0, 3))).toBe(true)
    })

    // merged 산출은 s1+s3 결합 형태 — 실런 파일 둘을 합성해 동형 검산
    it.skipIf(!existsSync(s1) || !existsSync(s3))(`s1s3 병합 동형 통과 (${run.slice(0, 8)})`, () => {
      const scenes = load(s3)
      const r = MergedRawSchema.safeParse({
        narrative_structure: load(s1),
        scenes: scenes.scenes,
        total_estimated_seconds: scenes.total_estimated_seconds,
      })
      expect(r.success, JSON.stringify(!r.success && r.error.issues.slice(0, 3))).toBe(true)
    })
  }
})
