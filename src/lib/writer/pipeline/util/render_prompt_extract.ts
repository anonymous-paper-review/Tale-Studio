// 렌더 프롬프트(V5) 뽑기 규칙 — 샷에 이미 있는 첫 장면(T2I) · 움직임(TI2V) 프롬프트를 고른다. 없으면 V5 가 AI 를 부른다.
//   V5 와 실행기(샷 점검 뒤 남은 시간 판단, 검토 b 2026-11-11)가 같은 규칙을 쓰도록 여기 한 곳에 둔다.
//   단계를 가짜로 바꾸는 시험(vi.mock v5_prompts)이 이 파일은 건드리지 않게 따로 뺐다.

export type RenderPromptShot = Record<string, unknown> & {
  S?: Record<string, unknown>;
  first_frame_generation?: { composition_prompt?: string; base_assets?: string[] };
  video_generation?: { motion_prompt?: string };
  static_spec?: Record<string, unknown>;
  dynamic_spec?: Record<string, unknown>;
};

export function extractT2IPrompt(shot: RenderPromptShot): string | null {
  // 우선순위:
  // ① shot.first_frame_generation.composition_prompt (C2 출력)
  // ② shot.static_spec.first_frame_prompt (V4b 출력 — rich-A)
  // ③ shot.S.subject + shot.S.background 조합 (rich-A fallback)
  const a = shot.first_frame_generation?.composition_prompt;
  if (typeof a === 'string' && a.trim().length > 20) return a;

  const b = (shot.static_spec as { first_frame_prompt?: string } | undefined)?.first_frame_prompt;
  if (typeof b === 'string' && b.trim().length > 20) return b;

  const S = shot.S as { subject?: string; background?: string } | undefined;
  if (S && typeof S.subject === 'string' && S.subject.trim().length > 10) {
    const bg = typeof S.background === 'string' ? `, 배경: ${S.background}` : '';
    return `${S.subject}${bg}`;
  }

  return null;
}

export function extractTI2VPrompt(shot: RenderPromptShot): string | null {
  // 우선순위:
  // ① shot.video_generation.motion_prompt (C2 출력)
  // ② shot.dynamic_spec.motion_prompt (V4c 출력 — rich-A)
  const a = shot.video_generation?.motion_prompt;
  if (typeof a === 'string' && a.trim().length > 5) return a;

  const b = (shot.dynamic_spec as { motion_prompt?: string } | undefined)?.motion_prompt;
  if (typeof b === 'string' && b.trim().length > 5) return b;

  return null;
}

/** V5 가 AI 로 새로 써야 할 프롬프트 수 — 샷마다 첫 장면 · 움직임 중 뽑지 못한 것. */
export function renderPromptLlmCalls(shots: readonly RenderPromptShot[]): number {
  return shots.reduce((n, shot) => n + (extractT2IPrompt(shot) ? 0 : 1) + (extractTI2VPrompt(shot) ? 0 : 1), 0);
}
