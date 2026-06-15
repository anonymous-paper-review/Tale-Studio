// V2: 프로덕션 디자인 (팔레트, 컬러 의미, 로케이션, 의상, VFX)
import { generateJson, describeAxisConfig, type LlmAxisConfig } from '@/lib/writer/llm/dispatch';
import type {
  ProductionDesign,
  Characters,
  Scenes,
  ArtDirection,
  MidPreview,
  VisualIdentity,
  ActVisualArc,
  CharacterVisual,
  WorldVisual,
  BackgroundContract,
} from '@/lib/writer/types/pipeline';
import type { PipelineLogger } from '@/lib/writer/logger';

export async function runProductionDesign(
  characters: Characters,
  scenes: Scenes,
  artDirection: ArtDirection,
  midPreview: MidPreview,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<ProductionDesign> {
  await logger.markStage('productionDesign', 'started');

  // scenes에서 unique 로케이션 추출
  const uniqueLocations = Array.from(new Set(scenes.scenes.map((s) => s.location)));

  const systemInstruction = `당신은 V축 V2(프로덕션 디자인) 디자이너이다.
characters, scenes, artDirection, Mid Preview의 컬러 스크립트를 바탕으로:

1. 글로벌 컬러 팔레트 (primary, secondary, accent, forbidden)
2. 컬러 의미 매핑 (특정 색이 무엇을 상징하는지)
3. 로케이션별 디자인 (스타일, 광원, 소품)
4. 캐릭터별 의상 (S2.appearance_description 확장)
5. VFX 접근 방식

색상은 hex 코드 또는 일반명으로.
forbidden 색상은 작품에서 절대 사용 안 할 색 (예: "Her" 영화의 blue 금지).
`;

  const userPrompt = `[characters]
${JSON.stringify(characters.characters, null, 2)}

[scenes unique 로케이션]
${JSON.stringify(uniqueLocations)}

[artDirection 스타일]
${JSON.stringify(artDirection, null, 2)}

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

  const result = await generateJson<ProductionDesign>(userPrompt, axisConfig, {
    systemInstruction,
    temperature: 0.6,
  });

  await logger.saveLlmCall('productionDesign', {
    prompt: userPrompt,
    response: JSON.stringify(result, null, 2),
    model: describeAxisConfig(axisConfig),
    provider: axisConfig.provider,
  });

  await logger.saveStage('09_productionDesign.json', result);
  await logger.markStage('productionDesign', 'completed');
  return result;
}

// ── v2 분화 (V축 재설계): productionDesign → CharacterVisual + WorldVisual 파생 ──
//   transitional 파생(추가 LLM 콜 없음). 네이티브 생성(풍부한 인물/월드 비주얼)은 하류 마이그레이션 후 후속.
//   s2 = characters + world(producer seed + 오픈캐스트, append-only). producer world 가 권위 소스.

/** characters + productionDesign → CharacterVisual (인물별 외형/의상/팔레트). */
export function deriveCharacterVisual(characters: Characters, pd: ProductionDesign): CharacterVisual {
  return {
    characters: characters.characters.map((c) => ({
      character_id: c.id,
      appearance: c.appearance_description ?? '',
      costume: pd.costumes[c.id] ?? [],
      palette: [],
    })),
  };
}

/** productionDesign + state.world → WorldVisual. world(producer+오픈캐스트)가 있으면 그 로케이션을
 *  권위 목록으로 삼고 pd.locations 의 디자인과 매칭(없으면 최소 필드). */
export function deriveWorldVisual(pd: ProductionDesign, world: BackgroundContract | undefined): WorldVisual {
  const locations = world?.locations?.length
    ? world.locations.map((wl) => {
        const key = wl.id.toLowerCase().trim();
        const name = wl.name.toLowerCase().trim();
        const designed = pd.locations.find(
          (p) => p.id.toLowerCase().trim() === key || p.id.toLowerCase().trim() === name,
        );
        return designed ?? { id: wl.id, style_description: wl.description ?? '', lighting_sources: [], props: [] };
      })
    : pd.locations;
  return {
    global_palette: pd.global_palette,
    color_meaning: pd.color_meaning,
    locations,
    vfx_approach: pd.vfx_approach,
  };
}

// ── native v2 (V축 재설계): CharacterVisual + WorldVisual 를 LLM 으로 직접 생성 ──
//   읽음: v0 visualIdentity(전역 스타일 루트) + v1 actVisualArc(막별 아크, v-체인 상속)
//        + s2 characters + s2 world(producer + 오픈캐스트) + bridge seed.v2.
//   옛 runProductionDesign+derive shim 을 대체한다(productionDesign 중간산물 없음).
//   원천 보존(§5): 출력 인물/로케이션은 입력 ID 를 권위 목록으로 결정론적 정렬(누락은 최소 보강).
//   actVisualArc=null(로컬 경로 등 v1 미가용) 이어도 graceful — 스타일+seed 로 자체 결정.
export async function runV2Design(
  visualIdentity: VisualIdentity,
  actVisualArc: ActVisualArc | null,
  characters: Characters,
  world: BackgroundContract | undefined,
  seedV2: string,
  logger: PipelineLogger,
  axisConfig: LlmAxisConfig,
): Promise<{ characterVisual: CharacterVisual; worldVisual: WorldVisual }> {
  await logger.markStage('v2Design', 'started');

  const locations = world?.locations ?? [];

  const systemInstruction = `당신은 V축 V2(비주얼 디자인) 디자이너이다.
전역 비주얼 아이덴티티(고정 스타일)와 막별 비주얼 아크 안에서 두 가지를 설계한다:
1. 인물별 비주얼 — 외형(스타일에 맞게 구체화), 의상, 인물 강조색(전역 팔레트에서 선택)
2. 월드 비주얼 — 글로벌 팔레트(primary/secondary/accent/forbidden), 컬러 의미, 로케이션별 디자인(스타일/광원/소품), VFX 접근

원칙:
- 전역 스타일(art_style/shape_language/line/proportion/texture)을 모든 디자인이 따른다.
- 팔레트는 막별 아크의 palette_shift/lighting_mood 와 정합해야 한다(아크가 없으면 스타일+seed 로 자체 결정).
- forbidden 색은 작품에서 절대 사용 안 할 색.
- 주어진 로케이션 id 와 인물 character_id 를 **그대로** 사용한다(발명·변경 금지).`;

  const userPrompt = `[v0 비주얼 아이덴티티 — 전역 고정 스타일]
${JSON.stringify(visualIdentity.style, null, 2)}

[v1 막별 비주얼 아크 — 이 진화 안에서 디자인]
${actVisualArc ? JSON.stringify(actVisualArc, null, 2) : '(없음 — 전역 스타일 + seed 로 자체 결정)'}

[bridge 거친 seed (v2 디자인 방향)]
${seedV2 || '(없음)'}

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
locations=${JSON.stringify(locations, null, 2)}

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
  });

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
    global_palette: result.worldVisual?.global_palette ?? { primary: '', secondary: '', accent: '', forbidden: [] },
    color_meaning: result.worldVisual?.color_meaning ?? {},
    locations: locations.length
      ? locations.map((wl) => {
          const m = wlById.get(wl.id);
          return {
            id: wl.id,
            style_description: m?.style_description ?? wl.description ?? '',
            lighting_sources: m?.lighting_sources ?? [],
            props: m?.props ?? [],
          };
        })
      : (result.worldVisual?.locations ?? []),
    vfx_approach: result.worldVisual?.vfx_approach ?? '',
  };

  await logger.saveStage('09_v2Design.json', { characterVisual, worldVisual });
  await logger.markStage('v2Design', 'completed', {
    character_count: characterVisual.characters.length,
    location_count: worldVisual.locations.length,
  });
  return { characterVisual, worldVisual };
}
