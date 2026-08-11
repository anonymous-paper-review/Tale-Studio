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
        { scene_id: 'sc_1', location: 'loc', scene_actions: ['a'], weather: 'rain', extra: 1 },
      ],
      total_estimated_seconds: 10,
      unknown_root_field: true,
    })
    expect(r.success).toBe(true)
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
