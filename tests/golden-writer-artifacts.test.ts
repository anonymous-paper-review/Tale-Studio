// 골든 스냅샷(#writer-overhaul Phase 0, 2026-08-10) — 파이프라인 오버홀의 안전망.
//
// 왜: 죽은 스테이지(v5/v6/v7/runPipeline)·죽은 스키마 필드를 걷어낼 때, "하류 산출물은
//   한 글자도 안 바뀐다"를 눈이 아니라 diff 로 증명해야 한다. 고정 입력(tests/golden/
//   writer-fixture.ts)을 제품 함수에 그대로 통과시켜 최종 산출물 5종을 한 파일로 박제한다.
//
// 박제 대상 = 사람/모델이 실제로 소비하는 것만:
//   A. C2 결정론 조립(+분할·check_notes) 결과 — persist 입력이 되는 shotSequence
//   B. shots 테이블 insert 행 — 러프/실사/영상 전부가 읽는 진실
//   C. 러프 previz 그리드 프롬프트 (writer 산출물)
//   D. 실사 리페인트 프롬프트 (director viz)
//   E. 영상 프롬프트 — 정지/이동 계약 두 분기
//   F. writer export 마크다운 (shots.md / prompts.md)
//
// 실패 시 대응: 의도한 변경이면 `pnpm vitest -u tests/golden-writer-artifacts.test.ts` 로
//   갱신하고 diff 를 커밋에 남긴다. 의도 안 한 변경이면 그게 이 파일의 존재 이유다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insertedShots: [] as Record<string, unknown>[],
}))

// persist 는 DB·i18n LLM 을 탄다 — 둘 다 결정론 스텁으로 고정(스냅샷이 네트워크에 의존하면 안 된다).
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  // 이미 영어인 파이프라인 산출물의 실제 동작(무변환 통과)을 재현한다.
  deriveEnBatch: async (items: Array<{ id: string; native: string }>) =>
    new Map(items.map((i) => [i.id, i.native])),
  deriveNativeBatch: async () => new Map(),
  isTargetScript: () => false,
  i18nHash: (value: string) => `h${value.length}`,
}))

import {
  assembleShotsFromDesigns,
  attachCheckNotes,
  buildSplitChildren,
} from '@/lib/writer/pipeline/stages/c_application_2'
import { persistShotsToDb } from '@/lib/writer/pipeline/util/persist_manifest'
import { buildRoughGridCell, buildRoughGridPrompt } from '@/lib/writer/rough-storyboard-grid'
import { buildRealGridPrompt, buildRealStripPrompt } from '@/lib/director/storyboard-strip'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { collectWriterArtifacts } from '@/lib/export/writer'
import type { ShotSequence, ShotSequenceItem, ValidationIssue } from '@/lib/writer/types/pipeline'
import {
  CHECK_ISSUES,
  DECOUPAGE,
  PROJECT_ID,
  SCENES,
  SHOT_DESIGNS,
  SPLIT_PROPOSAL,
} from './golden/writer-fixture'

// ── DB 스텁: insert 페이로드만 포획, 나머지는 성공으로 흘린다 ──
function shotQuery() {
  return {
    select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
    delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    insert: vi.fn(async (rows: Record<string, unknown>[]) => {
      mocks.insertedShots = rows
      return { error: null }
    }),
  }
}
function projectQuery() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { locale: 'en' }, error: null })) })),
    })),
  }
}
function sceneQuery() {
  const chain = { eq: vi.fn(() => chain) }
  return { update: vi.fn(() => chain) }
}

beforeEach(() => {
  mocks.insertedShots = []
  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => {
    if (table === 'shots') return shotQuery()
    if (table === 'projects') return projectQuery()
    if (table === 'scenes') return sceneQuery()
    throw new Error(`unexpected table ${table}`)
  })
})

/** runShotCheck 의 결정론 부분만 재현 — LLM 판정(분할안·이슈)은 고정 입력으로 대체한다. */
function buildShotSequence(): ShotSequence {
  const beatByShotId = new Map(
    DECOUPAGE.scenes.flatMap((sc) =>
      sc.shots.map((sh) => [sh.shot_id, { en: sh.beat_summary, native: sh.beat_summary_native }] as const),
    ),
  )
  const assembled = assembleShotsFromDesigns(SHOT_DESIGNS, SCENES, beatByShotId)

  // 분할 적용(shot_3 → 자식 2) — 제품과 같은 순서: splice → check_notes → 리넘버.
  let shots: Array<ShotSequenceItem & { _splitFrom?: string }> = [...assembled]
  const idx = shots.findIndex((s) => s.shot_id === SPLIT_PROPOSAL.shot_id)
  shots.splice(
    idx,
    1,
    ...buildSplitChildren(
      shots[idx],
      SPLIT_PROPOSAL.shot_id,
      SPLIT_PROPOSAL.new_shots as unknown as ShotSequenceItem[],
    ),
  )
  shots = attachCheckNotes(shots, CHECK_ISSUES as ValidationIssue[])
  shots = shots.map((shot, i) => {
    const { _splitFrom: _drop, ...rest } = shot
    void _drop
    return { ...rest, shot_id: `shot_${i + 1}` }
  })
  shots = shots.map((shot, i) => ({
    ...shot,
    C: {
      ...shot.C,
      causal_link: {
        from: i === 0 ? null : shots[i - 1].shot_id,
        to: i === shots.length - 1 ? null : shots[i + 1]?.shot_id ?? null,
      },
    },
  }))

  return {
    project_id: PROJECT_ID,
    total_shots: shots.length,
    total_duration_seconds: shots.reduce((sum, s) => sum + s.duration_seconds, 0),
    depth_level: 'D3',
    shots,
  }
}

function section(title: string, body: string): string {
  return `${'='.repeat(78)}\n${title}\n${'='.repeat(78)}\n${body}\n`
}

describe('골든 산출물 — writer 파이프라인 하류 계약', () => {
  it('고정 입력 → 최종 산출물 5종이 바이트 단위로 유지된다', async () => {
    const parts: string[] = []

    // ── A. C2 결정론 조립 (persist 입력) ──
    const shotSequence = buildShotSequence()
    parts.push(section('A. shotSequence (C2 조립 + 분할 + check_notes)', JSON.stringify(shotSequence, null, 2)))

    // ── B. shots insert 행 (모든 하류 소비자의 진실) ──
    await persistShotsToDb(PROJECT_ID, shotSequence, null)
    parts.push(section('B. shots insert rows', JSON.stringify(mocks.insertedShots, null, 2)))

    // ── C. 러프 previz 그리드 프롬프트 ──
    //   라우트는 DB 행 + state 스펙을 합쳐 셀 입력을 만든다. 여기서는 그 조립 결과를
    //   고정 입력으로 직접 주어(라우트의 i18n 경유는 무변환 통과가 정상 동작) 셀→시트를 박제.
    const cells = SHOT_DESIGNS.map((d) =>
      buildRoughGridCell(
        {
          shotType: d.static_spec.shot_type,
          actionDescription: d.dynamic_spec.motion_prompt,
          characterNames: d.static_spec.character_blocking.map((b) => b.character_id),
          characterNameById: new Map([
            ['mira', 'Mira'],
            ['warden', 'Warden'],
          ]),
          location: 'dust_yard',
          timeOfDay: 'dusk',
          mood: 'wary → cornered',
          durationSeconds: d.intent.duration_seconds,
          spec: { staticSpec: d.static_spec, intent: d.intent, dynamicSpec: d.dynamic_spec },
        },
        d.intent.shot_id,
      ),
    )
    parts.push(section('C. 러프 그리드 프롬프트 (grid4)', buildRoughGridPrompt(cells, 'grid4')))
    parts.push(section('C2. 러프 셀 원본 (grid4 입력)', JSON.stringify(cells, null, 2)))

    // ── D. 실사 리페인트 프롬프트 (시네라인 OFF = 현행 라이브 경로) ──
    parts.push(
      section(
        'D. 실사 그리드 리페인트 프롬프트',
        buildRealGridPrompt(3, { characterRefCount: 2, hasStyleRef: true }),
      ),
    )
    parts.push(
      section(
        'D2. 실사 스트립 리페인트 프롬프트',
        buildRealStripPrompt(SHOT_DESIGNS[0].static_spec.first_frame_prompt, {
          characterRefCount: 2,
          hasStyleRef: false,
        }),
      ),
    )

    // ── E. 영상 프롬프트 — 정지 계약 / 이동 계약 두 분기 ──
    const videoStatic = buildVideoPrompt({
      prompt: SHOT_DESIGNS[0].static_spec.first_frame_prompt,
      generationMethod: 'I2V',
      modelKey: 'kling-o3',
      durationSeconds: 6,
      startEndReference: true,
      dynamicSpec: SHOT_DESIGNS[0].dynamic_spec,
    })
    const videoMoving = buildVideoPrompt({
      prompt: SHOT_DESIGNS[1].static_spec.first_frame_prompt,
      generationMethod: 'I2V',
      modelKey: 'kling-o3',
      durationSeconds: 5,
      startEndReference: true,
      dynamicSpec: SHOT_DESIGNS[1].dynamic_spec,
    })
    parts.push(section('E. 영상 프롬프트 (정지 계약)', videoStatic.fullPrompt))
    parts.push(section('E2. 영상 프롬프트 (이동 계약)', videoMoving.fullPrompt))

    // ── F. writer export 마크다운 ──
    //   export 는 writer_runs.state 투영을 읽는다 — v5 renderPrompts 소비의 유일한 생존 소비자라
    //   Phase 1(v5 제거)의 등가성 판정 기준이 된다.
    const renderPromptsProjection = {
      total_shots: shotSequence.shots.length,
      shots: shotSequence.shots.map((s) => ({
        shot_id: s.shot_id,
        scene_id: s.S.scene_id,
        duration_seconds: s.duration_seconds,
        t2i: { prompt: s.first_frame_generation.composition_prompt },
        ti2v: { motion_prompt: s.video_generation.motion_prompt, duration_seconds: s.duration_seconds },
      })),
    }
    const artifacts = await collectWriterArtifacts(PROJECT_ID, {
      fetchFn: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          storyBible: null,
          scenes: SCENES.scenes,
          shotDesign: SHOT_DESIGNS,
          renderPrompts: renderPromptsProjection,
        }),
      }),
      loadDbFallback: async () => ({}),
    })
    for (const file of artifacts.filter((f) => f.path.endsWith('shots.md') || f.path.endsWith('prompts.md'))) {
      parts.push(section(`F. export ${file.path}`, String(file.content)))
    }

    await expect(parts.join('\n')).toMatchFileSnapshot('./golden/writer-artifacts.snap.txt')
  })
})
