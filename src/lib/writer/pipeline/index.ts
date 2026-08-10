// writer 파이프라인 공용 헬퍼(#writer-overhaul 2026-08-10).
//   실행 엔진은 서버리스 stepwise(pipeline/steps.ts) 하나뿐이다. 옛 로컬 일괄 실행기
//   (runPipeline — 파일 캐시 resume)는 호출자가 0이라 제거했고, 그 시절 함께 살던
//   v5(renderPrompts)/v6(images)/v7(videos) 스테이지와 generate·resume 라우트도 같이 걷어냈다.
//   여기 남은 것은 steps.ts 와 dialogue 라우트가 공유하는 입력 해석 헬퍼뿐이다.
import { DEFAULT_MODELS, type PipelineModelsConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { PipelineInput, StoryCheckReport } from '@/lib/writer/types/pipeline';

// Skip 모드 default = true (피드백 미반영 stage 건너뜀, 비용 절감)
// export: stepwise 엔진(pipeline/steps.ts)이 동일 로직 재사용.
export function resolveSkip(input: PipelineInput): { validation1: boolean } {
  return {
    validation1: input.skip?.validation1 ?? true,
  };
}

// c_validation_1 skip 시 다운스트림에 줄 빈 리포트
export function emptyC1Report(): StoryCheckReport {
  return {
    passed: true,
    issues: [],
    causality_chain: [],
    cdq_present: false,
    cdq_clarity_score: 0,
    cliche_count: 0,
    retry_count: 0,
  };
}

export function resolveModels(input: PipelineInput): PipelineModelsConfig {
  const fallback = DEFAULT_MODELS;
  const m = input.models ?? {};
  const fill = (cfg: { provider?: string; model?: string; baseUrl?: string } | undefined, def: LlmAxisConfig): LlmAxisConfig => {
    if (!cfg || !cfg.provider) return def;
    return {
      provider: cfg.provider as LlmAxisConfig['provider'],
      model: cfg.model ?? def.model,
      baseUrl: cfg.baseUrl ?? def.baseUrl,
    };
  };
  return {
    S: fill(m.S, fallback.S),
    V: fill(m.V, fallback.V),
    C: fill(m.C, fallback.C),
  };
}
