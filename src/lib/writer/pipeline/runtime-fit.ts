// 고른 길이 맞춤(오너 2026-11-10 "고른 길이 안으로 맞춘다" → ③ 둘 다) — 산문 · 샷 나누기 · 저장 단계가 같이 쓰는 기준.
//   15초 이하는 산문을 1~2씬으로 쓰고(이 파일의 막 · 씬 상한), 샷 나누기는 씬 시간 안에서 나누며(decoupage.ts),
//   그래도 넘는 몇 초는 저장 단계가 고른 길이 안으로 깎는다(duration_reallocation.ts fitShotDurationsToRuntime).
//   약속: tests/writer/runtime-fit.test.ts · runtime-fit-save.test.ts · short-runtime-prose.test.ts
import type { NarrativeStructure, PipelineInput, Scenes } from '@/lib/writer/types/pipeline';

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

/** 구조 지시에 붙는 15초 이하 규칙 — 구조 단계와 합친 산문 경로가 같은 문장을 쓴다. */
export function shortRuntimeStructureBlock(): string {
  return `[고른 길이 — ${SHORT_RUNTIME_SECONDS}초 이하]
사용자가 영상 길이를 ${SHORT_RUNTIME_SECONDS}초 이하로 골랐다. acts 는 1~${SHORT_RUNTIME_MAX_ACTS}개만 쓴다 — 이 길이는 한두 장면짜리 한 순간이다.
기승전결 · 3막 같은 흐름은 막을 나누지 말고 한두 막 안의 흐름(purpose 문장)으로 담아라. 이 규칙이 "acts 수는 고른 구조를 따른다"보다 먼저다.

`;
}

/** 막이 max 개보다 많으면 앞에서부터 이웃한 막끼리 묶어 max 개로 합친다 — 묶음의 첫 막 id, 목적은 "A → B", 비율은 합.
 *  actIdMap = 합쳐진 막 id → 묶음의 첫 막 id(씬의 막 참조를 옮길 때 쓴다). 합칠 것이 없으면 구조를 그대로 · 빈 지도. */
export function foldActsWithMap(structure: NarrativeStructure, max: number): { structure: NarrativeStructure; actIdMap: Map<string, string> } {
  const acts = structure.acts ?? [];
  const actIdMap = new Map<string, string>();
  if (acts.length <= max) return { structure, actIdMap };
  const size = Math.ceil(acts.length / max);
  const folded: NarrativeStructure['acts'] = [];
  for (let i = 0; i < acts.length; i += size) {
    const group = acts.slice(i, i + size);
    for (const act of group.slice(1)) actIdMap.set(act.act_id, group[0].act_id);
    folded.push({
      act_id: group[0].act_id,
      purpose: group.map((act) => act.purpose).filter(Boolean).join(' → '),
      proportion: Math.round(group.reduce((sum, act) => sum + (Number(act.proportion) || 0), 0) * 1000) / 1000,
    });
  }
  return { structure: { ...structure, acts: folded }, actIdMap };
}

export function foldActs(structure: NarrativeStructure, max: number): NarrativeStructure {
  return foldActsWithMap(structure, max).structure;
}

/** 씬의 막 참조를 합친 막으로 옮긴다 — 지도에 없는 참조는 그대로. 바뀔 것이 없으면 같은 객체. */
export function remapActRefs(scenes: Scenes, actIdMap: Map<string, string>): Scenes {
  if (!actIdMap.size || !scenes.scenes.some((sc) => actIdMap.has(sc.act_ref))) return scenes;
  return { ...scenes, scenes: scenes.scenes.map((sc) => (actIdMap.has(sc.act_ref) ? { ...sc, act_ref: actIdMap.get(sc.act_ref)! } : sc)) };
}
