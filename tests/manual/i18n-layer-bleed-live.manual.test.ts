import { describe, it, expect } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Genre, Characters, PipelineInput, SceneCinematography } from '@/lib/writer/types/pipeline'

// #i18n-layer-bleed 언어 침범 감사 하니스 (수동 게이트 — **실제 LLM 다수 콜 과금**, CI 항상 skip):
//   BLEED_OUT=<dir> RUN_I18N_LAYER_BLEED=1 pnpm vitest run tests/i18n-layer-bleed-live.manual.test.ts
//
// 목적: 같은 한국어 시드(스토리+캐스트)로 writer 텍스트 파이프라인 전 레이어를 outputLocale
//   'en'/'ko' 두 번 직접 구동해 레이어별 산출 JSON을 ${BLEED_OUT}/{locale}/ 아래 저장한다 —
//   #20 에서 outputLanguageClause 를 배선한 그 스테이지들. 판정(언어 침범 여부)은 이 파일이
//   내리지 않는다 — 저장된 JSON은 오케스트레이터가 읽어 분석한다.
//
// steps.ts(WRITER_STEPS)의 프로덕션 배선을 그대로 미러링하되:
//   - DB/fal 부수효과(persistDesignTokens/persistAssetsToDb/triggerAssetDrafts/persistShots)는
//     전부 생략한다 — projectId 도 진짜 프로젝트일 필요 없이 라벨용 문자열이면 된다.
//   - runLaneVisual/runLaneDialogue(steps.ts:175~297)는 export 되지 않은 모듈 비공개 함수라
//     **프로덕트 코드를 건드리지 않는다는 이번 임무의 절대 제약** 아래서는 직접 import 할 수
//     없다. 대신 그 두 함수가 내부에서 호출하는 스테이지 함수(runShotDesign/runShotCheck/
//     runRenderPrompts, runDialogue)를 steps.ts 와 동일한 인자 순서·동일한 compact 분기로
//     이 파일에서 직접 재현한다 — 산출 관점에서 동등하다.

const LIVE = process.env.RUN_I18N_LAYER_BLEED === '1'
const OUT_DIR = process.env.BLEED_OUT

function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

// tests/i18n-output-locale-live.manual.test.ts 의 시드 재사용(team-lead 지시) — 같은 한국어
// 스토리로 두 로케일을 비교해야 결과가 서로 비교 가능하다.
const KOREAN_STORY =
  '늦은 밤 편의점에서 일하는 수민은 매일 같은 시간에 우유 하나만 사 가는 노인이 궁금하다. ' +
  '어느 날 노인이 오지 않자 수민은 가게를 나서 골목을 헤매고, 낡은 대문 앞에서 쓰러진 노인을 발견한다. ' +
  '구급차를 기다리는 동안 노인은 수민의 손을 잡고 오래된 사진 한 장을 쥐여 준다.'

const KOREAN_GENRE: Genre = {
  genre: 'drama',
  tone: ['따뜻함'],
  targetEmotion: ['따뜻함', '그리움'],
  runtime_seconds: 30,
  depth_level: 'D1',
  format: 'horizontal_16:9',
}

// 한국어 캐스트 2인 fixture — 이름·성격·관계 전부 한국어. 이 시드 재료가 outputLocale='en'
// 산출을 한국어 쪽으로 끌어당기는지가 이 하니스가 실측하려는 핵심 침범 경로다.
const KOREAN_CHARACTERS: Characters = {
  characters: [
    {
      id: 'sumin',
      name: '수민',
      role: 'protagonist',
      personality: ['다정하다', '호기심이 많다', '무던하다'],
      arc: { start_state: '무심한 방관자', end_state: '먼저 다가서는 사람', arc_type: 'positive_change' },
      appearance_description: '편의점 조끼를 입은 20대 초반',
      motivation: { want: '노인의 안부를 확인하고 싶다', need: '타인과 연결되고 싶은 마음을 인정하는 것' },
    },
    {
      id: 'old_man',
      name: '노인',
      role: 'supporting',
      personality: ['말수가 적다', '고집이 세다', '따뜻함을 숨긴다'],
      arc: { start_state: '홀로 남은 사람', end_state: '누군가에게 곁을 내준 사람', arc_type: 'redemption' },
      appearance_description: '낡은 외투를 입은 70대',
      motivation: { want: '매일 같은 우유를 사는 것', need: '외로움을 나눌 사람' },
    },
  ],
  relationships: [
    {
      between: ['sumin', 'old_man'],
      type: '편의점 손님과 직원',
      state_change: '무심함에서 유대감으로',
      visible_in_video: true,
    },
  ],
  subtext_notes: ['일상의 사소한 관찰이 인간적 연결로 이어진다'],
}

function layerFile(locale: string, seq: number, layer: string): string {
  if (!OUT_DIR) throw new Error('BLEED_OUT 환경변수가 필요합니다 (예: BLEED_OUT=/tmp/bleed)')
  return path.join(OUT_DIR, locale, `${String(seq).padStart(2, '0')}_${layer}.json`)
}

function saveLayer(locale: string, seq: number, layer: string, data: unknown): void {
  const filepath = layerFile(locale, seq, layer)
  mkdirSync(path.dirname(filepath), { recursive: true })
  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8')
}

function logStageTime(locale: string, label: string, startedMs: number) {
  console.log(`[i18n-bleed] ${locale} · ${label} — ${((Date.now() - startedMs) / 1000).toFixed(1)}s`)
}

interface LocaleChainResult {
  locale: 'en' | 'ko'
  layersCompleted: number
  ms: number
  ok: boolean
  failedLayer?: number
  error?: string
}

async function runLocaleChain(locale: 'en' | 'ko'): Promise<LocaleChainResult> {
  // 동적 import — loadEnv() 이후에 로드해야 llm/dispatch 등이 올바른 API 키로 초기화된다
  // (tests/i18n-output-locale-live.manual.test.ts 와 동일한 이유).
  const { runDramaturgySafe } = await import('@/lib/writer/pipeline/stages/s0_dramaturgy')
  const { runNarrativeStructure } = await import('@/lib/writer/pipeline/stages/s1_structure')
  const { runScenes, mergeOpenCast, mergeOpenWorld } = await import('@/lib/writer/pipeline/stages/s3_scenes')
  const { runVisualIdentity } = await import('@/lib/writer/pipeline/stages/v0_visual')
  const { runActVisualArc } = await import('@/lib/writer/pipeline/stages/v1_act_arc')
  const { runV2Design } = await import('@/lib/writer/pipeline/stages/v2_design')
  const { runSceneCinematography } = await import('@/lib/writer/pipeline/stages/v3_scene_plan')
  const { runDecoupage } = await import('@/lib/writer/pipeline/stages/decoupage')
  const { runShotDesign } = await import('@/lib/writer/pipeline/stages/v4_shots')
  const { runShotCheck } = await import('@/lib/writer/pipeline/stages/c_application_2')
  const { runRenderPrompts } = await import('@/lib/writer/pipeline/stages/v5_prompts')
  const { runDialogue, toDialogueTrack } = await import('@/lib/writer/pipeline/stages/dialogue')
  const { inferSceneCinematographyFromShots } = await import('@/lib/writer/pipeline/util/infer_v3')
  const { isCompactDepth } = await import('@/lib/writer/types/pipeline')
  const { resolveModels, resolveSkip } = await import('@/lib/writer/pipeline')
  const { PipelineLogger } = await import('@/lib/writer/logger')

  const input: PipelineInput = {
    story: KOREAN_STORY,
    outputLocale: locale,
    runtimeSeconds: KOREAN_GENRE.runtime_seconds,
    sceneGate: false,
  }
  const models = resolveModels(input)
  const logger = new PipelineLogger(`i18n-bleed-${locale}`)
  await logger.init()

  let seq = 0
  const t0 = Date.now()

  try {
    // 1. dramaturgy — steps.ts 'dramaturgy' step 미러(313~321행). 실패 흡수 래퍼 그대로 사용.
    seq += 1
    let started = Date.now()
    const dramaturgy = await runDramaturgySafe(input, KOREAN_GENRE, KOREAN_CHARACTERS, logger, models.S)
    await logger.flushRawLlm('dramaturgy')
    saveLayer(locale, seq, 'dramaturgy', { dramaturgy, absorbed: dramaturgy === null })
    logStageTime(locale, `${seq}_dramaturgy`, started)

    // 2. narrativeStructure — steps.ts 322~354행 (WRITER_MERGE_S1S3 미설정 = 현행 2콜 경로).
    seq += 1
    started = Date.now()
    const narrativeStructure = await runNarrativeStructure(input, KOREAN_GENRE, logger, models.S, dramaturgy ?? null)
    await logger.flushRawLlm('narrativeStructure')
    saveLayer(locale, seq, 'narrativeStructure', narrativeStructure)
    logStageTime(locale, `${seq}_narrativeStructure`, started)

    // 3. scenes — steps.ts 355~372행. 오픈 캐스트/월드 머지까지 포함해야 하류가 실제로 보는
    //    characters/world 가 나온다(스토리 전개상 생성된 인물·장소가 있으면 이후 스테이지에 반영).
    seq += 1
    started = Date.now()
    const scenes = await runScenes(input, KOREAN_GENRE, narrativeStructure, KOREAN_CHARACTERS, undefined, logger, models.S, undefined, dramaturgy ?? null)
    await logger.flushRawLlm('scenes')
    const characters = mergeOpenCast(KOREAN_CHARACTERS, scenes)
    const world = mergeOpenWorld(undefined, scenes, dramaturgy?.world_inventory)
    saveLayer(locale, seq, 'scenes', { scenes, mergedCharacters: characters, mergedWorld: world })
    logStageTime(locale, `${seq}_scenes`, started)

    // 4. storyCheck — steps.ts 373~386행. resolveSkip 기본(validation1=true)이면 통째 skip —
    //    이 하니스는 input.skip 을 지정하지 않으므로 프로덕션 기본 경로와 동일하게 항상 skip.
    seq += 1
    const skip = resolveSkip(input)
    saveLayer(locale, seq, 'storyCheck', {
      skipped: skip.validation1,
      reason: 'resolveSkip default (input.skip 미지정 → validation1=true)',
    })

    // 5. visualFormat (v0) — steps.ts 387~396행.
    seq += 1
    started = Date.now()
    const visualIdentity = await runVisualIdentity(KOREAN_GENRE, logger, models.V, input.styleAnchor)
    await logger.flushRawLlm('visualIdentity')
    saveLayer(locale, seq, 'visualFormat', visualIdentity)
    logStageTime(locale, `${seq}_visualFormat`, started)

    // 6. actVisualArc (v1) — steps.ts 397~413행.
    seq += 1
    started = Date.now()
    const actVisualArc = await runActVisualArc(narrativeStructure, visualIdentity, logger, models.V)
    await logger.flushRawLlm('actVisualArc')
    saveLayer(locale, seq, 'actVisualArc', actVisualArc)
    logStageTime(locale, `${seq}_actVisualArc`, started)

    // 7. v2Design — steps.ts 414~443행. persistDesignTokens/persistAssetsToDb/triggerAssetDrafts
    //    는 전부 DB/fal 부수효과라 생략(지시 §1).
    seq += 1
    started = Date.now()
    const { characterVisual, worldVisual } = await runV2Design(visualIdentity, actVisualArc, characters, world, '', logger, models.V, input.outputLocale)
    await logger.flushRawLlm('v2Design')
    saveLayer(locale, seq, 'v2Design', { characterVisual, worldVisual })
    logStageTime(locale, `${seq}_v2Design`, started)

    // 8. sceneCinematography (v3) — steps.ts 444~484행. compact 분기 그대로 재현(현재
    //    COMPACT_DEPTH_LEVELS=[] 라 항상 false — 향후 재활성화돼도 이 하니스가 정합하게 동작).
    seq += 1
    started = Date.now()
    const compact = isCompactDepth(KOREAN_GENRE.depth_level)
    let sceneCinematography: SceneCinematography[]
    if (compact) {
      sceneCinematography = []
      saveLayer(locale, seq, 'sceneCinematography', { skipped: true, reason: `compact mode (${KOREAN_GENRE.depth_level})` })
    } else {
      const planResult = await runSceneCinematography(KOREAN_GENRE, characters, scenes, visualIdentity, worldVisual, logger, models.V, actVisualArc, input.outputLocale)
      await logger.flushRawLlm('sceneCinematography')
      sceneCinematography = planResult.scene_plans
      saveLayer(locale, seq, 'sceneCinematography', planResult)
    }
    logStageTime(locale, `${seq}_sceneCinematography`, started)

    // 9. decoupage — steps.ts 485~517행.
    seq += 1
    started = Date.now()
    const decoupageResult = await runDecoupage(KOREAN_GENRE, characters, scenes, worldVisual, compact ? null : sceneCinematography, logger, models.V, {
      outputLocale: input.outputLocale,
    })
    await logger.flushRawLlm('decoupage')
    const decoupagePlan = decoupageResult.plan
    if (!decoupageResult.done || !decoupagePlan) {
      throw new Error('decoupage 가 done=false(부분 진행) 반환 — softDeadlineMs 미전달 하니스에서는 발생하지 않아야 함')
    }
    saveLayer(locale, seq, 'decoupage', decoupagePlan)
    logStageTime(locale, `${seq}_decoupage`, started)

    // 10. shotDesign (v4) — runLaneVisual 미러(steps.ts:183~216). v4/v5 는 #20 에서 outputLocale
    //     미배선(생성기행 영어 강제 유지) — 그대로 outputLocale 인자 없이 호출.
    seq += 1
    started = Date.now()
    const shotDesignResult = await runShotDesign(
      KOREAN_GENRE,
      characters,
      scenes,
      visualIdentity,
      worldVisual,
      characterVisual,
      compact ? null : sceneCinematography,
      decoupagePlan,
      '',
      logger,
      models.V,
    )
    await logger.flushRawLlm('shotDesign')
    if (!shotDesignResult.done) {
      throw new Error('shotDesign 이 done=false(부분 진행) 반환 — softDeadlineMs 미전달 하니스에서는 발생하지 않아야 함')
    }
    const shots = shotDesignResult.shots
    // compact 모드 사후처리(steps.ts:215) — 현재 compact 는 항상 false 라 사실상 미실행.
    if (compact) sceneCinematography = inferSceneCinematographyFromShots(shots, scenes)
    saveLayer(locale, seq, 'shotDesign', shots)
    logStageTime(locale, `${seq}_shotDesign`, started)

    // 11. shotCheck (C2) — runLaneVisual 미러(steps.ts:219~251). deadlineMs 미전달이라 착수
    //     게이트(EST_SHOTCHECK_MS)가 걸리지 않는다.
    seq += 1
    started = Date.now()
    const shotCheckResult = await runShotCheck(
      `i18n-bleed-${locale}`,
      KOREAN_GENRE,
      characters,
      scenes,
      worldVisual,
      shots,
      decoupagePlan,
      [],
      logger,
      models.C,
      input.outputLocale,
    )
    await logger.flushRawLlm('shotCheck')
    saveLayer(locale, seq, 'shotCheck', shotCheckResult)
    logStageTime(locale, `${seq}_shotCheck`, started)

    // 12. renderPrompts (v5) — runLaneVisual 미러(steps.ts:253~262). v4 와 동일 사유로 outputLocale 없음.
    seq += 1
    started = Date.now()
    const renderPrompts = await runRenderPrompts(shotCheckResult.shotSequence, visualIdentity, worldVisual, logger, models.V)
    await logger.flushRawLlm('renderPrompts')
    saveLayer(locale, seq, 'renderPrompts', renderPrompts)
    logStageTime(locale, `${seq}_renderPrompts`, started)

    // 13. dialogue — runLaneDialogue 미러(steps.ts:266~297). WRITER_LANES=0(직렬) 경로와 동일하게
    //     visual 레인 완료 후 실행(지시: "WRITER_LANES 직렬 경로로 단순하게").
    seq += 1
    started = Date.now()
    const dialogueResult = await runDialogue(input.story, KOREAN_GENRE, characters, scenes, decoupagePlan, logger, models.S, {
      outputLocale: input.outputLocale,
    })
    await logger.flushRawLlm('dialogue')
    if (!dialogueResult.done) {
      throw new Error('dialogue 가 done=false(부분 진행) 반환 — softDeadlineMs 미전달 하니스에서는 발생하지 않아야 함')
    }
    saveLayer(locale, seq, 'dialogue', toDialogueTrack(dialogueResult))
    logStageTime(locale, `${seq}_dialogue`, started)

    const ms = Date.now() - t0
    console.log(`[i18n-bleed] ${locale}: 전 레이어(${seq}) 완료 — ${(ms / 1000).toFixed(1)}s`)
    return { locale, layersCompleted: seq, ms, ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const ms = Date.now() - t0
    console.error(`[i18n-bleed] ${locale}: 레이어 ${seq} 에서 실패 — 체인 중단 (${(ms / 1000).toFixed(1)}s):`, message)
    saveLayer(locale, seq + 1, 'FAILED', {
      failedAtLayer: seq,
      message,
      stack: e instanceof Error ? e.stack : undefined,
    })
    return { locale, layersCompleted: seq, ms, ok: false, failedLayer: seq, error: message }
  }
}

describe.runIf(LIVE)('i18n 레이어 침범 감사 — en/ko 동일 한국어 시드, 전 레이어', () => {
  it(
    '같은 한국어 스토리+캐스트로 outputLocale en/ko 순차 구동 — 레이어별 JSON 저장',
    async () => {
      loadEnv()
      if (!OUT_DIR) throw new Error('BLEED_OUT 환경변수가 필요합니다 (예: BLEED_OUT=/tmp/bleed)')

      // 두 로케일은 순차 실행(429 방어) — Promise.all 로 동시에 돌리지 않는다.
      const results: LocaleChainResult[] = []
      for (const locale of ['en', 'ko'] as const) {
        results.push(await runLocaleChain(locale))
      }

      writeFileSync(path.join(OUT_DIR, '_summary.json'), JSON.stringify(results, null, 2), 'utf8')
      console.log('[i18n-bleed] 요약:', JSON.stringify(results))

      for (const r of results) {
        expect(r.layersCompleted, `${r.locale}: dramaturgy 조차 완료 못함 — 환경/설정 문제 가능성`).toBeGreaterThan(0)
      }
      const failed = results.filter((r) => !r.ok)
      expect(
        failed,
        `체인 중단된 로케일: ${failed.map((f) => `${f.locale}(레이어 ${f.failedLayer}: ${f.error})`).join(', ')}`,
      ).toEqual([])
    },
    3_600_000,
  )
})
