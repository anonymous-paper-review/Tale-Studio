// V2: 비주얼 디자인 (인물/월드) — native 생성 [v0 스타일]+[v1 아크]+[s2 chars/world]+[seed.v2].
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import { outputLanguageClause } from '@/lib/writer/pipeline/util/output-language';
import { VisualDesignSchema } from '@/lib/writer/pipeline/schemas';
import { seriesLookLines } from '@/lib/writer/pipeline/series-block';
import type {
  Characters,
  VisualIdentity,
  ActVisualArc,
  CharacterVisual,
  WorldVisual,
  BackgroundContract,
  DesignTokens,
  PipelineInput,
  StoryScene,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';
import type { AppLocale } from '@/lib/locale';

// ── native v2 (V축 재설계): CharacterVisual + WorldVisual 를 LLM 으로 직접 생성 ──
//   읽음: v0 visualIdentity(전역 스타일 루트) + v1 actVisualArc(막별 아크, v-체인 상속)
//        + s2 characters + s2 world(producer + 오픈캐스트) + bridge seed.v2.
//   옛 runProductionDesign+derive shim 을 대체한다(productionDesign 중간산물 없음).
//   원천 보존(§5): 출력 인물/로케이션은 입력 ID 를 권위 목록으로 결정론적 정렬(누락은 최소 보강).
//   actVisualArc=null(로컬 경로 등 v1 미가용) 이어도 graceful — 스타일+seed 로 자체 결정.
//
//   2026-10-27 오너 "제품에서 고칠 것":
//   - 로케이션마다 그곳이 나오는 씬의 시간대 · 날씨 · 일어나는 일을 싣는다(모든 프로젝트). 운영 2화 나룻배가 "강 안개 속으로" 씬인데
//     맑은 대낮 · 노을로 그려졌다 — 이 단계가 씬을 보지 못했다.
//   - 시리즈 다음 화는 앞 화 인물 · 배경 모습을 같은 세계의 기준으로 주고, 같은 그림체면 앞 화 전역 팔레트 · 색 의미 · 효과 방식을
//     그대로 쓴다(LLM 이 다른 값을 내도 앞 화 값으로 덮는다).
export async function runV2Design(
  visualIdentity: VisualIdentity,
  actVisualArc: ActVisualArc | null,
  characters: Characters,
  world: BackgroundContract | undefined,
  seedV2: string,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
  // #i18n-s5: 미지정(레거시)이면 systemInstruction 절 미주입 — 종전 동작 그대로.
  outputLocale?: AppLocale,
  context: {
    scenes?: StoryScene[];
    series?: PipelineInput['series'];
    looks?: PipelineInput['inheritedLooks'];
    designTokens?: DesignTokens;
  } = {},
): Promise<{ characterVisual: CharacterVisual; worldVisual: WorldVisual }> {
  await logger.markStage('v2Design', 'started');

  const locations = world?.locations ?? [];
  const series = context.series;
  const inherited = context.designTokens;

  const systemInstruction = `당신은 V축 V2(비주얼 디자인) 디자이너이다.
전역 비주얼 아이덴티티(고정 스타일)와 막별 비주얼 아크 안에서 두 가지를 설계한다:
1. 인물별 비주얼 — 외형(스타일에 맞게 구체화), 의상, 인물 강조색(전역 팔레트에서 선택)
2. 월드 비주얼 — 글로벌 팔레트(primary/secondary/accent/forbidden), 컬러 의미, 로케이션별 디자인(스타일/광원/소품), VFX 접근

원칙:
- 전역 스타일(art_style/shape_language/line/proportion/texture)을 모든 디자인이 따른다.
- 팔레트는 막별 아크의 palette_shift/lighting_mood 와 정합해야 한다(아크가 없으면 스타일+seed 로 자체 결정).
- forbidden 색은 작품에서 절대 사용 안 할 색.
- 로케이션의 style_description · lighting_sources 는 그 로케이션이 처음 나오는 씬의 시간대 · 날씨 · 일어나는 일(안개 · 비 · 눈 · 어둠 등)에 맞춘다. 씬에 없는 시간대 · 날씨(노을 · 맑은 하늘 등)를 지어내지 않는다.
- 주어진 로케이션 id 와 인물 character_id 를 **그대로** 사용한다(발명·변경 금지).${outputLanguageClause(outputLocale)}`;

  const seriesSection = series
    ? `

[시리즈 · 앞 화와 같은 세계]
이 이야기는 「${series.prevTitle}」의 다음 화다.${seriesLookLines(context.looks).join('\n')}
- 새 인물의 외형 · 의상과 새 로케이션의 건축 · 소품은 이야기가 다르게 말하지 않는 한 앞 화와 같은 세계 · 같은 시대 · 같은 문화권으로 디자인한다.`
    : '';
  const inheritedSection = inherited
    ? `

[앞 화 색 설계 — 그대로 쓴다]
${JSON.stringify({ global_palette: inherited.palette, color_meaning: inherited.color_meaning, vfx_approach: inherited.vfx_approach }, null, 2)}
- global_palette · color_meaning · vfx_approach 는 위 값을 그대로 낸다.
- 인물 강조색(palette)은 이 팔레트에서 고른다.`
    : '';
  const locationInput = context.scenes ? designLocations(locations, context.scenes) : locations;

  const userPrompt = `[v0 비주얼 아이덴티티 — 전역 고정 스타일]
${JSON.stringify(visualIdentity.style, null, 2)}

[v1 막별 비주얼 아크 — 이 진화 안에서 디자인]
${actVisualArc ? JSON.stringify(actVisualArc, null, 2) : '(없음 — 전역 스타일 + seed 로 자체 결정)'}

[bridge 거친 seed (v2 디자인 방향)]
${seedV2 || '(없음)'}${seriesSection}${inheritedSection}

[s2 인물 (character_id 그대로 사용)]
${JSON.stringify(
    characters.characters.map((c) => ({
      character_id: c.id,
      name: c.name,
      role: c.role,
      appearance_description: c.appearance_description,
      personality: c.personality,
    })),
    null,
    2,
  )}

[s2 월드/로케이션 (id 그대로 사용)]
setting=${world?.setting ?? ''}
locations=${JSON.stringify(locationInput, null, 2)}

[출력 형식 - JSON]
{
  "characterVisual": {
    "characters": [
      { "character_id": "(입력 id 그대로)", "appearance": "시각 외형(구체)", "costume": ["item1", ...], "palette": ["#color", ...] }
    ]
  },
  "worldVisual": {
    "global_palette": { "primary": "...", "secondary": "...", "accent": "...", "forbidden": ["..."] },
    "color_meaning": { "color_name": "meaning" },
    "locations": [
      { "id": "(입력 id 그대로)", "style_description": "...", "lighting_sources": ["..."], "props": ["..."] }
    ],
    "vfx_approach": "..."
  }
}`;

  const result = await generateJson<{ characterVisual: CharacterVisual; worldVisual: WorldVisual }>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.6,
    schema: VisualDesignSchema,
  });

  const knownCharacters = new Set(characters.characters.map((c) => c.id));
  const knownLocations = new Set(locations.map((l) => l.id));
  const referenceIssues = [
    ...result.characterVisual.characters.filter((c) => !knownCharacters.has(c.character_id)).map((c) => `unknown_character: ${c.character_id}`),
    ...result.worldVisual.locations.filter((l) => !knownLocations.has(l.id)).map((l) => `unknown_location: ${l.id}`),
  ];
  if (referenceIssues.length) {
    await logger.markStage('v2Design', 'failed', { validation_issues: referenceIssues });
    throw new Error(`화면 구성 참조 검증 실패: ${referenceIssues.join(' | ')}`);
  }

  await logger.saveLlmCall('v2Design', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  // 원천 보존(§5): 입력 인물/로케이션 ID 를 권위 목록으로 — LLM 출력에서 매칭, 누락은 최소 필드 보강.
  const cvById = new Map((result.characterVisual?.characters ?? []).map((c) => [c.character_id, c]));
  const characterVisual: CharacterVisual = {
    characters: characters.characters.map((c) => {
      const m = cvById.get(c.id);
      return {
        character_id: c.id,
        appearance: m?.appearance || c.appearance_description || '',
        costume: m?.costume ?? [],
        palette: m?.palette ?? [],
      };
    }),
  };

  const wlById = new Map((result.worldVisual?.locations ?? []).map((l) => [l.id, l]));
  const worldVisual: WorldVisual = {
    global_palette: inherited
      ? { ...inherited.palette, forbidden: [...(inherited.palette.forbidden ?? [])] }
      : result.worldVisual?.global_palette ?? { primary: '', secondary: '', accent: '', forbidden: [] },
    color_meaning: inherited ? { ...inherited.color_meaning } : result.worldVisual?.color_meaning ?? {},
    locations: locations.length
      ? locations.map((wl) => {
          const m = wlById.get(wl.id);
          return {
            id: wl.id,
            name: wl.name,
            style_description: m?.style_description ?? wl.description ?? '',
            lighting_sources: m?.lighting_sources ?? [],
            props: m?.props ?? [],
          };
        })
      : (result.worldVisual?.locations ?? []),
    vfx_approach: inherited ? inherited.vfx_approach : result.worldVisual?.vfx_approach ?? '',
  };

  await logger.saveStage('09_v2_design.json', { characterVisual, worldVisual });
  await logger.markStage('v2Design', 'completed', {
    character_count: characterVisual.characters.length,
    location_count: worldVisual.locations.length,
    ...(inherited ? { inherited_palette: true } : {}),
  });
  return { characterVisual, worldVisual };
}

const DESIGN_SCENE_TEXT_MAX = 200;
const clipText = (text: string): string => {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= DESIGN_SCENE_TEXT_MAX ? clean : `${clean.slice(0, DESIGN_SCENE_TEXT_MAX).trimEnd()}…`;
};

export interface DesignLocation {
  id: string;
  name: string;
  description: string;
  /** 이 로케이션이 나오는 씬(순서대로). 어느 씬에도 안 나오면 빈 목록. */
  scenes: Array<{ scene_id: string; time_of_day: string; weather?: string; what: string }>;
}

/** 디자인 지시에 싣는 로케이션 — 그 로케이션이 나오는 씬의 시간대 · 날씨 · 일어나는 일(앞 두 동작 + 대사 요약)을 붙인다. */
export function designLocations(
  locations: BackgroundContract['locations'],
  scenes: StoryScene[],
): DesignLocation[] {
  return locations.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    scenes: scenes
      .filter((s) => s.location === l.id)
      .map((s) => {
        const actions = (Array.isArray(s.scene_actions) ? s.scene_actions : []).filter((a) => typeof a === 'string' && a.trim()).slice(0, 2);
        const weather = typeof s.weather === 'string' ? s.weather.trim() : '';
        return {
          scene_id: s.scene_id,
          time_of_day: s.time_of_day,
          ...(weather ? { weather } : {}),
          what: clipText([...actions, s.dialogue_summary ?? ''].filter(Boolean).join(' ')),
        };
      }),
  }));
}
