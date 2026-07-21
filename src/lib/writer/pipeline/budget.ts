// 씬 시간 예산 (E3b, #prompt-audit 2026-07-21) — 예산 계산 + 검증 + 프롬프트 블록.
//
// physics.ts(물리 — 백엔드 법칙, 협상 불가)와 달리 여기는 **제품 정책**이다:
// 장편(D6~D7)은 MVP에서 "겉으로 30~60분 되는 척"이 목표이지 정직한 커버가 아니다
// (제품 오너 결정 2026-07-21 — research/writer/experiments/results/E3a-time-budget.md).
// 장편이 진짜 스코프가 되면 이 파일의 정책 상수만 조정한다.
//
// 배경 실측(E3a): 모델은 총합 산수(총 estimated_seconds ≈ runtime)는 잘 맞추지만,
// 장편에서 씬당 액션을 3개로 고정한 채 씬 초만 부풀린다(M2 중앙값 9~10배) — 산수를
// 모델에게 위임하지 않고(독트린 P6) 코드가 예산표를 계산해 주입하고 검증한다.
import { SHOT_PHYSICS } from '@/lib/writer/pipeline/physics';
import type { DepthLevel, Genre, Scenes } from '@/lib/writer/types/pipeline';

export type CoverageMode = 'honest' | 'representative';

// ── 정책 상수 (물리 아님 — MVP 판단) ──
/** 대표 스토리보드(표면) 대역: total은 runtime을 유지하되 샷 물량은 정책 상한. */
export const REPRESENTATIVE_DEPTHS: readonly DepthLevel[] = ['D6', 'D7'];
/** 대표 모드의 전역 샷 총량 상한 — 생성 비용 가드. */
export const REPRESENTATIVE_SHOT_CAP = 120;
/** 대표 모드의 씬당 액션 대역 — 긴 씬이어도 대표 액션만. */
export const REPRESENTATIVE_ACTIONS_RANGE: readonly [number, number] = [3, 6];

// depth → 씬 수 대역 (옛 s3 sceneCountHintMap의 수치화)
const SCENE_COUNT_RANGE: Record<DepthLevel, [number, number]> = {
  D1: [1, 1],
  D2: [1, 2],
  D3: [3, 5],
  D4: [5, 10],
  D5: [10, 20],
  D6: [20, 30],
  D7: [30, 40],
};

export interface SceneBudget {
  mode: CoverageMode;
  sceneCountMin: number; // act 커버리지 하한(씬 수 ≥ 막 수) 반영 — E3a: D1 "1씬"은 규칙상 도달 불가였다
  sceneCountMax: number;
  totalSeconds: number;
  totalToleranceRatio: number;
  avgSceneSeconds: number;
  actionsPerSceneMin: number;
  actionsPerSceneMax: number;
  /** 액션 1개의 기준 화면 초 (물리 대역 중앙값 근사) — M2 검증 분모. */
  secondsPerAction: number;
}

export function computeSceneBudget(genre: Genre, actCount: number): SceneBudget {
  const mode: CoverageMode = REPRESENTATIVE_DEPTHS.includes(genre.depth_level) ? 'representative' : 'honest';
  const [hintLo, hintHi] = SCENE_COUNT_RANGE[genre.depth_level] ?? [5, 10];
  const sceneCountMin = Math.max(hintLo, Math.max(1, actCount));
  const sceneCountMax = Math.max(hintHi, sceneCountMin);
  const secondsPerAction = (SHOT_PHYSICS.shotSecondsMin + SHOT_PHYSICS.shotSecondsMax) / 2 + 1.5; // 6.5
  const totalSeconds = genre.runtime_seconds;
  const avgSceneSeconds = totalSeconds / Math.max(1, Math.round((sceneCountMin + sceneCountMax) / 2));

  if (mode === 'representative') {
    const [aMin, aMax] = REPRESENTATIVE_ACTIONS_RANGE;
    return { mode, sceneCountMin, sceneCountMax, totalSeconds, totalToleranceRatio: 0.1, avgSceneSeconds, actionsPerSceneMin: aMin, actionsPerSceneMax: aMax, secondsPerAction };
  }
  const a = Math.max(1, Math.min(8, Math.round(avgSceneSeconds / secondsPerAction)));
  return {
    mode, sceneCountMin, sceneCountMax, totalSeconds, totalToleranceRatio: 0.1, avgSceneSeconds,
    actionsPerSceneMin: Math.max(1, a - 1), actionsPerSceneMax: a + 1, secondsPerAction,
  };
}

/** 시스템프롬프트 주입 블록 — 산수는 코드가 끝냈고 모델은 배분 판단만 한다. */
export function renderBudgetBlock(b: SceneBudget): string {
  const head = `시간 예산 (코드 계산 — 준수 필수):
- 씬 수: ${b.sceneCountMin}~${b.sceneCountMax}개 (막 커버리지 하한 포함)
- estimated_seconds 총합 = ${b.totalSeconds}초 (±${Math.round(b.totalToleranceRatio * 100)}%)`;
  if (b.mode === 'representative') {
    return `${head}
- 씬당 scene_actions ${b.actionsPerSceneMin}~${b.actionsPerSceneMax}개만 — 긴 씬이어도 **대표 액션**만 적는다.
  (이 프로젝트는 대표 샷 스토리보드로 제작된다 — estimated_seconds는 씬 비중대로 총합을 배분하며, 액션 수보다 클 수 있다.)`;
  }
  return `${head}
- 씬당 scene_actions ${b.actionsPerSceneMin}~${b.actionsPerSceneMax}개, 씬의 estimated_seconds ≈ 액션 수 × ${SHOT_PHYSICS.shotSecondsMin}~${SHOT_PHYSICS.shotSecondsMax}초.
- 시간이 남으면 씬이나 액션을 늘리고, 모자라면 줄여라 — **estimated_seconds를 액션 없이 부풀리지 마라.**`;
}

export interface BudgetViolation {
  scene_id: string | null; // null = 전체 수준 위반
  message: string;
}

/** honest 모드 검증 — 총합 ±tol, 씬 수 대역, 씬별 M2(est ÷ 액션×기준초) ≤ 1.5. representative는 검증 없음(의도된 초과). */
export function validateSceneBudget(scenes: Scenes, b: SceneBudget): BudgetViolation[] {
  if (b.mode !== 'honest') return [];
  const v: BudgetViolation[] = [];
  const total = scenes.total_estimated_seconds ?? scenes.scenes.reduce((s, x) => s + (x.estimated_seconds || 0), 0);
  const tol = b.totalSeconds * b.totalToleranceRatio;
  if (Math.abs(total - b.totalSeconds) > tol) {
    v.push({ scene_id: null, message: `총합 ${total}초 — 목표 ${b.totalSeconds}초 ±${Math.round(tol)}초 이탈` });
  }
  const n = scenes.scenes.length;
  if (n < b.sceneCountMin || n > b.sceneCountMax + 2) {
    v.push({ scene_id: null, message: `씬 수 ${n}개 — 예산 ${b.sceneCountMin}~${b.sceneCountMax}개 이탈` });
  }
  for (const sc of scenes.scenes) {
    const actions = sc.scene_actions?.length ?? 0;
    const capacity = Math.max(1, actions) * b.secondsPerAction;
    if ((sc.estimated_seconds ?? 0) > capacity * 1.5) {
      v.push({
        scene_id: sc.scene_id,
        message: `estimated_seconds=${sc.estimated_seconds}초가 액션 용량(${actions}개×${b.secondsPerAction}초)의 1.5배 초과 — 시간을 줄이거나 액션을 늘려라`,
      });
    }
  }
  return v;
}
