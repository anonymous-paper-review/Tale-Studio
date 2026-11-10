// 고른 길이 맞춤(오너 2026-11-10 "고른 길이 안으로 맞춘다" → ③ 둘 다) — 산문 · 샷 나누기 · 저장 단계가 같이 쓰는 기준.
//   15초 이하는 산문을 1~2씬으로 쓰고(이 파일의 막 · 씬 상한), 샷 나누기는 씬 시간 안에서 나누며(decoupage.ts),
//   그래도 넘는 몇 초는 저장 단계가 고른 길이 안으로 깎는다(duration_reallocation.ts fitShotDurationsToRuntime).
//   약속: tests/writer/runtime-fit.test.ts · runtime-fit-save.test.ts · short-runtime-prose.test.ts
import type { NarrativeStructure, PipelineInput } from '@/lib/writer/types/pipeline';

/** 고른 길이(초) — 사용자가 길이를 골랐을 때만. 대본 그대로 · 길이 없음이면 null(맞추지 않는다). */
export function runtimeFitCap(input: Pick<PipelineInput, 'runtimeSeconds' | 'preserveScript'>): number | null {
  if (input.preserveScript) return null;
  const seconds = input.runtimeSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** "15초 이하" 구간 — 산문을 1~2씬으로 쓴다. 막 수 ≤ 씬 수 규칙은 그대로라 막도 1~2개로 쓴다. */
export const SHORT_RUNTIME_SECONDS = 15;
export const SHORT_RUNTIME_MAX_ACTS = 2;
export const SHORT_RUNTIME_MAX_SCENES = 2;

export function isShortRuntime(input: Pick<PipelineInput, 'runtimeSeconds' | 'preserveScript'>): boolean {
  const cap = runtimeFitCap(input);
  return cap !== null && cap <= SHORT_RUNTIME_SECONDS;
}

/** 막이 max 개보다 많으면 앞에서부터 이웃한 막끼리 묶어 max 개로 합친다 — 묶음의 첫 막 id, 목적은 "A → B", 비율은 합. */
export function foldActs(structure: NarrativeStructure, max: number): NarrativeStructure {
  const acts = structure.acts ?? [];
  if (acts.length <= max) return structure;
  const size = Math.ceil(acts.length / max);
  const folded: NarrativeStructure['acts'] = [];
  for (let i = 0; i < acts.length; i += size) {
    const group = acts.slice(i, i + size);
    folded.push({
      act_id: group[0].act_id,
      purpose: group.map((act) => act.purpose).filter(Boolean).join(' → '),
      proportion: Math.round(group.reduce((sum, act) => sum + (Number(act.proportion) || 0), 0) * 1000) / 1000,
    });
  }
  return { ...structure, acts: folded };
}
