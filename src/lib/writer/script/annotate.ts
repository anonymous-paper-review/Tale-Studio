// 대본 보존 주석기(#script-preserve 2026-09-17) — 대본에서 그대로 옮긴 씬에 빠진 분류 칸(목적·감정 곡선·정보 비대칭·대사 요약)만
//   LLM 으로 채운다. 대본 내용(장소·시간·인물·비트·대사)은 보내되 바꾸지 말라고 못 박고, 코드는 받은 값을 그 네 칸에만 쓴다
//   (annotateScriptScenes 가 화이트리스트 적용 — architecture.md "모델은 제안만 한다"). 실패한 씬은 자리표시 값으로 남는다.
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type { PipelineLogger } from '@/lib/writer/logger';
import type { StoryScene } from '@/lib/writer/types/pipeline';
import type { SceneAnnotation, SceneAnnotator } from './preserve';

const PURPOSES = 'exposition | conflict | decision | revelation | transformation | resolution | setup | comic_relief';

function buildPrompt(scene: StoryScene, ctx: { index: number; total: number }): string {
  const beats = scene.scene_actions.map((a, i) => `  [${i}] ${a}`).join('\n');
  return `당신은 시나리오 분석가다. 아래 씬은 작가가 쓴 대본 원문에서 그대로 옮긴 것이다(${ctx.index + 1}/${ctx.total}).
내용을 바꾸거나 다시 쓰지 말고, 대본에 없는 분류 칸만 채운다. 대사·지문을 새로 만들지 않는다.

[씬]
- scene_id: ${scene.scene_id}
- 장소: ${scene.location}
- 시간: ${scene.time_of_day}
- 인물: ${scene.characters_in_scene.join(', ') || '(없음)'}
${scene.source_directions?.length ? `- 대본의 연출 지시: ${scene.source_directions.join(' / ')}\n` : ''}
[비트 — 원문 그대로]
${beats}

[출력 JSON]
{
  "purpose": "${PURPOSES} 중 하나",
  "emotion_beat": { "start": "씬 시작의 감정(짧게)", "end": "씬 끝의 감정(짧게)" },
  "info_asymmetry": "audience=character | audience>character | character>audience 중 하나",
  "dialogue_summary": "대사가 하는 일을 한두 문장으로(비트와 같은 언어). 대사를 인용하지 말 것"
}`;
}

/** 파이프라인 S축 모델로 도는 주석기. logger 가 있으면 호출 기록을 남긴다. */
export function makeScriptSceneAnnotator(axis: LlmAxisConfig, logger?: PipelineLogger): SceneAnnotator {
  return async (scene, ctx) => {
    const prompt = buildPrompt(scene, ctx);
    const raw = await generateJson<Partial<SceneAnnotation> & { emotion_beat?: { start?: unknown; end?: unknown } }>(prompt, axis, { temperature: 0.3 });
    await logger?.saveLlmCall?.(`script_annotate_${scene.scene_id}`, {
      prompt,
      response: JSON.stringify(raw, null, 2),
      model: describeAxisConfig(axis),
      provider: axis.provider,
    });
    const eb = raw?.emotion_beat;
    return {
      purpose: typeof raw?.purpose === 'string' ? raw.purpose : undefined,
      emotion_beat: eb && typeof eb.start === 'string' && typeof eb.end === 'string' ? { start: eb.start, end: eb.end } : undefined,
      info_asymmetry: typeof raw?.info_asymmetry === 'string' ? raw.info_asymmetry : undefined,
      dialogue_summary: typeof raw?.dialogue_summary === 'string' ? raw.dialogue_summary : undefined,
    };
  };
}
