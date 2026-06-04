// L2: 프로덕션 디자인 (팔레트, 컬러 의미, 로케이션, 의상, VFX)
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/svc/llm/dispatch';
import type {
  L2Design,
  S2Block,
  S3Block,
  L1Style,
  MidPreview,
} from '@/lib/svc/types/pipeline';
import type { PipelineLogger } from '@/lib/svc/logger';

export async function runL2(
  s2: S2Block,
  s3: S3Block,
  l1: L1Style,
  midPreview: MidPreview,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<L2Design> {
  await logger.markStage('L2', 'started');

  // S3에서 unique 로케이션 추출
  const uniqueLocations = Array.from(new Set(s3.scenes.map((s) => s.location)));

  const systemInstruction = `당신은 V축 L2(프로덕션 디자인) 디자이너이다.
S2 캐릭터, S3 씬, L1 스타일, Mid Preview의 컬러 스크립트를 바탕으로:

1. 글로벌 컬러 팔레트 (primary, secondary, accent, forbidden)
2. 컬러 의미 매핑 (특정 색이 무엇을 상징하는지)
3. 로케이션별 디자인 (스타일, 광원, 소품)
4. 캐릭터별 의상 (S2.appearance_description 확장)
5. VFX 접근 방식

색상은 hex 코드 또는 일반명으로.
forbidden 색상은 작품에서 절대 사용 안 할 색 (예: "Her" 영화의 blue 금지).
`;

  const userPrompt = `[S2 캐릭터]
${JSON.stringify(s2.characters, null, 2)}

[S3 unique 로케이션]
${JSON.stringify(uniqueLocations)}

[L1 스타일]
${JSON.stringify(l1, null, 2)}

[Mid Preview 컬러 스크립트]
${JSON.stringify(midPreview.color_script, null, 2)}

[출력 형식 - JSON]
{
  "global_palette": {
    "primary": "string",
    "secondary": "string",
    "accent": "string",
    "forbidden": ["string", ...]
  },
  "color_meaning": {
    "color_name": "meaning"
  },
  "locations": [
    {
      "id": "string (location name)",
      "style_description": "string",
      "lighting_sources": ["string", ...],
      "props": ["string", ...]
    }
  ],
  "costumes": {
    "character_id": ["item1", "item2", ...]
  },
  "vfx_approach": "string"
}`;

  const result = await generateJson<L2Design>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.6,
  });

  await logger.saveLlmCall('L2_design', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('09_L2.json', result);
  await logger.markStage('L2', 'completed');
  return result;
}
