// V5: T2I + TI2V 최종 프롬프트 정리
//   - 기존 샷의 first_frame_generation.composition_prompt → T2I 프롬프트로 추출
//   - 기존 샷의 video_generation.motion_prompt → TI2V 프롬프트로 추출
//   - 둘 중 하나라도 없으면 LLM 호출로 생성 (fallback)
//   - 다양한 샷 스키마(rich-A / declared-B / V4 3분할 등) 모두 수용
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  RenderPromptsOutput,
  ShotGenerationPrompts,
  VisualIdentity,
  WorldVisual,
  ShotSequence,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

type AnyShot = Record<string, unknown> & {
  shot_id: string;
  duration_seconds?: number;
  scene_id?: string;
  S?: Record<string, unknown>;
  V?: Record<string, unknown>;
  assets?: Record<string, unknown>;
  first_frame_generation?: { composition_prompt?: string; base_assets?: string[] };
  video_generation?: { motion_prompt?: string };
  static_spec?: Record<string, unknown>;
  dynamic_spec?: Record<string, unknown>;
  intent?: Record<string, unknown>;
};

export async function runRenderPrompts(
  shotSequence: ShotSequence,
  visualIdentity: VisualIdentity,
  worldVisual: WorldVisual,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<RenderPromptsOutput> {
  await logger.markStage('renderPrompts', 'started', { total_shots: shotSequence.shots.length });

  // v0 VisualIdentity.format = 옛 RenderFormat (매체/해상도/fps/비율). 본문은 도메인명 유지.
  const renderFormat = visualIdentity.format;

  const shots: ShotGenerationPrompts[] = [];
  let t2iFallbacks = 0;
  let ti2vFallbacks = 0;

  for (const rawShot of shotSequence.shots as unknown as AnyShot[]) {
    const sid = rawShot.shot_id;
    const sceneId = String(rawShot.scene_id ?? (rawShot.S as { scene_id?: string } | undefined)?.scene_id ?? '');
    const duration = typeof rawShot.duration_seconds === 'number' ? rawShot.duration_seconds : 5;

    // T2I 추출 시도
    let t2iText = extractT2IPrompt(rawShot);
    if (!t2iText) {
      t2iFallbacks++;
      t2iText = await llmGenerateT2I(rawShot, axisConfig, worldVisual, logger);
    }

    // TI2V 추출 시도
    let ti2vText = extractTI2VPrompt(rawShot);
    if (!ti2vText) {
      ti2vFallbacks++;
      ti2vText = await llmGenerateTI2V(rawShot, axisConfig, logger);
    }

    shots.push({
      shot_id: sid,
      scene_id: sceneId,
      duration_seconds: duration,
      t2i: {
        prompt: t2iText.trim(),
        aspect_ratio: renderFormat.aspect_ratio,
        width: renderFormat.resolution?.width,
        height: renderFormat.resolution?.height,
        reference_assets: extractReferences(rawShot),
      },
      ti2v: {
        motion_prompt: ti2vText.trim(),
        duration_seconds: duration,
        fps: renderFormat.fps,
        camera_movement: extractCameraMovement(rawShot),
      },
    });
  }

  const output: RenderPromptsOutput = {
    total_shots: shots.length,
    shots,
    l0_meta: {
      aspect_ratio: renderFormat.aspect_ratio,
      fps: renderFormat.fps,
      resolution: renderFormat.resolution,
    },
    extraction_summary: {
      t2i_extracted: shots.length - t2iFallbacks,
      t2i_llm_generated: t2iFallbacks,
      ti2v_extracted: shots.length - ti2vFallbacks,
      ti2v_llm_generated: ti2vFallbacks,
      llm_axis: describeAxisConfig(axisConfig),
    },
  };

  await logger.saveStage('14_v5_renderPrompts.json', output);
  await logger.markStage('renderPrompts', 'completed', {
    total: shots.length,
    t2i_fallback: t2iFallbacks,
    ti2v_fallback: ti2vFallbacks,
  });
  return output;
}

// ===== 추출 헬퍼 =====

function extractT2IPrompt(shot: AnyShot): string | null {
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

function extractTI2VPrompt(shot: AnyShot): string | null {
  // 우선순위:
  // ① shot.video_generation.motion_prompt (C2 출력)
  // ② shot.dynamic_spec.motion_prompt (V4c 출력 — rich-A)
  const a = shot.video_generation?.motion_prompt;
  if (typeof a === 'string' && a.trim().length > 5) return a;

  const b = (shot.dynamic_spec as { motion_prompt?: string } | undefined)?.motion_prompt;
  if (typeof b === 'string' && b.trim().length > 5) return b;

  return null;
}

function extractReferences(shot: AnyShot): string[] {
  const refs: string[] = [];
  const assets = shot.assets;
  if (!assets) return refs;

  // characters: ["id"] 또는 [{id, ...}]
  const characters = (assets as { characters?: unknown }).characters;
  if (Array.isArray(characters)) {
    for (const c of characters) {
      if (typeof c === 'string') refs.push(c);
      else if (c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string') {
        refs.push((c as { id: string }).id);
      }
    }
  }

  // locations: ["id"] 또는 [{id}] 또는 location_id: string
  const locations = (assets as { locations?: unknown }).locations;
  if (Array.isArray(locations)) {
    for (const l of locations) {
      if (typeof l === 'string') refs.push(l);
      else if (l && typeof l === 'object' && typeof (l as { id?: unknown }).id === 'string') {
        refs.push((l as { id: string }).id);
      }
    }
  }
  const locId = (assets as { location_id?: unknown }).location_id;
  if (typeof locId === 'string') refs.push(locId);

  // first_frame_generation.base_assets
  if (Array.isArray(shot.first_frame_generation?.base_assets)) {
    for (const a of shot.first_frame_generation!.base_assets!) {
      if (typeof a === 'string') refs.push(a);
    }
  }

  return Array.from(new Set(refs));
}

function extractCameraMovement(shot: AnyShot): string | undefined {
  const V = shot.V as { camera?: { movement?: string; type?: string } } | undefined;
  if (V?.camera?.movement && typeof V.camera.movement === 'string') return V.camera.movement;

  const ds = shot.dynamic_spec as { camera_motion?: { type?: string; direction?: string; speed?: string } } | undefined;
  if (ds?.camera_motion) {
    const parts = [ds.camera_motion.type, ds.camera_motion.direction, ds.camera_motion.speed].filter(Boolean);
    if (parts.length > 0) return parts.join('_');
  }

  const cmTop = (shot as { camera_movement?: unknown }).camera_movement;
  if (typeof cmTop === 'string') return cmTop;

  return undefined;
}

// ===== LLM fallback (없을 때만) =====

async function llmGenerateT2I(
  shot: AnyShot,
  axisConfig: LlmAxisConfig,
  worldVisual: WorldVisual,
  logger: PipelineLogger,
): Promise<string> {
  const system = `당신은 T2I (Text-to-Image) 프롬프트 디자이너이다.
주어진 샷 정보로 첫 프레임 생성용 프롬프트를 작성한다.

원칙:
- 200~400자
- 정적 묘사만 (움직임/순차 표현 금지 — 첫 프레임은 멈춘 한 컷)
- 구체적 디테일: 인물 의상/포즈/표정, 배경 요소, 조명 방향, 색감, 카메라(렌즈/앵글)
- V2 global_palette를 우선 반영
`;

  const user = `[샷 정보 — 부분 누락 가능]
${JSON.stringify(shot, null, 2)}

[worldVisual 글로벌 디자인 — 팔레트/조명/로케이션 참조]
${JSON.stringify({ global_palette: worldVisual.global_palette, color_meaning: worldVisual.color_meaning }, null, 2)}

[출력 - JSON]
{ "prompt": "정적 첫 프레임 묘사 (한글, 200~400자)" }`;

  const r = await generateJson<{ prompt: string }>(user, axisConfig, {
    systemInstruction: system,
    temperature: 0.5,
  });
  await logger.saveLlmCall(`L5_t2i_${shot.shot_id}`, {
    prompt: user,
    response: JSON.stringify(r, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });
  return r.prompt ?? '';
}

async function llmGenerateTI2V(
  shot: AnyShot,
  axisConfig: LlmAxisConfig,
  logger: PipelineLogger,
): Promise<string> {
  const system = `당신은 TI2V (이미지+텍스트→비디오) 프롬프트 디자이너이다.
첫 프레임에서 출발하는 영상의 모션을 압축적으로 묘사한다.

원칙:
- 50~100자
- 동사 1~2개 이내
- 순차 표현("그 다음에", "그리고") 금지
- 단일 동작 + 카메라 움직임 정도까지만
- 첫 프레임을 부정하지 말 것 (예: 첫 프레임에 앉아 있는데 "걸어간다" 안 됨)
`;

  const user = `[샷 정보]
${JSON.stringify(shot, null, 2)}

[출력 - JSON]
{ "motion_prompt": "동적 영상 묘사 (한글, 50~100자)" }`;

  const r = await generateJson<{ motion_prompt: string }>(user, axisConfig, {
    systemInstruction: system,
    temperature: 0.5,
  });
  await logger.saveLlmCall(`L5_ti2v_${shot.shot_id}`, {
    prompt: user,
    response: JSON.stringify(r, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });
  return r.motion_prompt ?? '';
}
