// 산문 조건(리뉴얼 1차 2026-10-19, 프로토타입 W3): Writer [AI 다시 쓰기 ▾]의 러닝타임 · 장르·분위기 · 아이디어 소재.
//   조건은 다시 쓴 안을 적용할 때만 지금 산문의 조건이 된다 — 그 전에는 세 안을 쓰는 바탕(rewriteBasis)일 뿐이다.
//   지금 산문의 조건은 실행 기록이 진실이다(입력 러닝타임 · 장르, 마지막으로 적용한 소재).
import { depthLevelFromRuntime } from '@/lib/depth'
import type { RewriteLevel } from '@/lib/producer/scene-story-rewrite'
import type { Genre, PipelineInput } from '@/lib/writer/types/pipeline'

/** 아이디어 소재 — keep: 지금 아이디어 소재 유지 · new: 소재부터 새로. */
export type ProseSeed = 'keep' | 'new'

export interface ProseConditions {
  runtimeSeconds: number
  /** 장르·분위기 이름(프로젝트 언어로 번역된 값 — Producer 시작 화면이 저장하는 것과 같다). */
  genre: string
  seed: ProseSeed
}

export function rewriteLevelForSeed(seed: ProseSeed): RewriteLevel {
  return seed === 'new' ? 'rethink' : 'reword'
}

interface ConditionState {
  input: PipelineInput
  genre?: Genre
  _proseSeed?: ProseSeed
}

/** 지금 산문이 쓰인 조건 — 산문 위 "지금 산문" 줄과 다시 쓰기 옵션의 표시가 읽는다. */
export function proseConditionsOf(state: ConditionState | null | undefined): { runtimeSeconds: number | null; genre: string | null; seed: ProseSeed } {
  const runtime = state?.input?.runtimeSeconds ?? state?.genre?.runtime_seconds ?? null
  return {
    runtimeSeconds: typeof runtime === 'number' && runtime > 0 ? runtime : null,
    genre: state?.genre?.genre?.trim() || state?.input?.genre?.genre?.trim() || null,
    seed: state?._proseSeed === 'new' ? 'new' : 'keep',
  }
}

function withConditions(genre: Genre | undefined, conditions: ProseConditions): Genre | undefined {
  if (!genre) return undefined
  return { ...genre, genre: conditions.genre, runtime_seconds: conditions.runtimeSeconds, depth_level: depthLevelFromRuntime(conditions.runtimeSeconds) }
}

/** 다시 쓰는 안의 바탕 — 조건이 있으면 그 길이 · 장르로, 없으면 지금 산문 그대로. runtimeChanged 면 이야기 구조부터 다시 잡는다. */
export function rewriteBasis(
  state: ConditionState,
  conditions: ProseConditions | null | undefined,
): { input: PipelineInput; genre: Genre | undefined; runtimeChanged: boolean } {
  if (!conditions) return { input: state.input, genre: state.genre, runtimeChanged: false }
  const current = proseConditionsOf(state).runtimeSeconds
  const genre = withConditions(state.genre, conditions)
  const input: PipelineInput = {
    ...state.input,
    runtimeSeconds: conditions.runtimeSeconds,
    ...(state.input.genre ? { genre: withConditions(state.input.genre, conditions) } : {}),
  }
  return { input, genre, runtimeChanged: current !== conditions.runtimeSeconds }
}
