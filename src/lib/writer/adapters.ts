// writer-pipeline 출력을 기존 main app 데이터 모델로 변환
//   - characters → Character[]
//   - scenes → Scene[] + SceneManifest
//   - shotDesign → Shot[]
//   - renderPrompts → Shot.referenceImageUrl 등
//   - shotImages/shotVideos → Shot.referenceImageUrl / VideoClip[]
import type {
  Scene,
  Character,
  Location,
  SceneManifest,
  Shot,
  VideoClip,
  ShotType,
  CameraConfig,
  LightingConfig,
  GenerationMethod,
} from '@/types';
import type {
  Characters,
  Scenes,
  ProductionDesign,
  ShotDesign,
  RenderPromptsOutput,
  ShotImagesOutput,
  ShotVideosOutput,
} from '@/lib/writer/types/pipeline';

// writer scene_id (scene_1) → main sc_01
export function writerSceneIdToMain(rawId: string): string {
  const m = /scene[_-]?(\d+)/i.exec(rawId);
  if (m) {
    return `sc_${m[1].padStart(2, '0')}`;
  }
  return rawId;
}

// writer shot_id (shot_scene_1_001 or shot_s01_001) → main sh_01_01
export function writerShotIdToMain(rawShotId: string, sceneId: string): string {
  const sceneMain = writerSceneIdToMain(sceneId);
  const sceneNum = sceneMain.replace('sc_', '');
  const m = /[_-](\d{2,3})$/.exec(rawShotId);
  if (m) {
    const n = parseInt(m[1], 10);
    return `sh_${sceneNum}_${String(n).padStart(2, '0')}`;
  }
  return rawShotId;
}

// writer characters.characters → main Character[]
export function adaptCharacters(characters: Characters): Character[] {
  return characters.characters.map((c) => ({
    characterId: c.id,
    name: c.name,
    role: ['protagonist', 'antagonist', 'supporting'].includes(c.role)
      ? (c.role as 'protagonist' | 'antagonist' | 'supporting')
      : 'supporting',
    description: c.appearance_description ?? '',
    fixedPrompt: `${c.name} (${c.role}): ${c.appearance_description ?? ''}. 성격: ${(c.personality ?? []).join(', ')}.`,
    referenceImages: [],
  }));
}

// writer productionDesign.locations → main Location[]
export function adaptLocations(productionDesign?: ProductionDesign): Location[] {
  if (!productionDesign?.locations) return [];
  return productionDesign.locations.map((loc) => ({
    locationId: loc.id,
    name: loc.id,
    visualDescription: loc.style_description ?? '',
    timeOfDay: '',
    lightingDirection: (loc.lighting_sources ?? []).join(', '),
  }));
}

// writer scenes.scenes → main Scene[]
export function adaptScenes(scenes: Scenes): Scene[] {
  return scenes.scenes.map((sc) => ({
    sceneId: writerSceneIdToMain(sc.scene_id),
    narrativeSummary: sc.dialogue_summary ?? sc.purpose ?? '',
    originalTextQuote: sc.scene_actions?.join(' ') ?? '',
    location: sc.location ?? '',
    timeOfDay: sc.time_of_day ?? '',
    mood: `${sc.emotion_beat?.start ?? ''} → ${sc.emotion_beat?.end ?? ''}`,
    charactersPresent: sc.characters_in_scene ?? [],
    estimatedDurationSeconds: sc.estimated_seconds ?? 0,
  }));
}

// 통합 SceneManifest
export function adaptSceneManifest(characters: Characters, scenes: Scenes, productionDesign?: ProductionDesign): SceneManifest {
  return {
    scenes: adaptScenes(scenes),
    characters: adaptCharacters(characters),
    locations: adaptLocations(productionDesign),
  };
}

// L4 shot type 정규화 (writer는 다양한 형태로 옴)
function normalizeShotType(input: unknown): ShotType {
  const s = String(input ?? '').toUpperCase();
  const candidates: ShotType[] = ['ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS', 'OTS', 'POV', 'TRACK', '2S'];
  for (const c of candidates) if (s === c) return c;
  // 일반 키워드 매핑
  if (s.includes('WIDE')) return 'WS';
  if (s.includes('CLOSE')) return 'CU';
  if (s.includes('MEDIUM')) return 'MS';
  return 'MS';
}

const DEFAULT_CAMERA: CameraConfig = {
  horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0,
};
const DEFAULT_LIGHTING: LightingConfig = {
  position: 'front', brightness: 50, colorTemp: 5000,
};

// writer shotDesign + renderPrompts → main Shot[] (다양한 writer 샷 스키마 수용)
export function adaptShots(shotDesigns: ShotDesign[], renderPrompts?: RenderPromptsOutput): Shot[] {
  return shotDesigns.map((sh, idx) => {
    const s = sh as unknown as Record<string, unknown>;
    const sceneIdRaw = String(
      s.scene_id ?? (s.intent as { scene_id?: string } | undefined)?.scene_id ?? `scene_${idx + 1}`,
    );
    const shotIdRaw = String(
      s.shot_id ?? (s.intent as { shot_id?: string } | undefined)?.shot_id ?? `shot_${idx + 1}`,
    );
    const sceneId = writerSceneIdToMain(sceneIdRaw);
    const shotId = writerShotIdToMain(shotIdRaw, sceneIdRaw);

    const intent = s.intent as Record<string, unknown> | undefined;
    const staticSpec = s.static_spec as Record<string, unknown> | undefined;
    const dynamicSpec = s.dynamic_spec as Record<string, unknown> | undefined;

    const duration = Number(
      s.duration_seconds ?? intent?.duration_seconds ?? 5,
    );

    const shotTypeRaw =
      staticSpec?.shot_type ??
      (s.S as { shot_type?: string; frame_size?: string } | undefined)?.shot_type ??
      (s.S as { shot_type?: string; frame_size?: string } | undefined)?.frame_size ??
      (s.V as { camera?: { type?: string } } | undefined)?.camera?.type ??
      'MS';

    // 캐릭터 목록 추출
    const characters: string[] = [];
    const cb = staticSpec?.character_blocking;
    if (Array.isArray(cb)) {
      for (const c of cb) {
        if (c && typeof c === 'object' && typeof (c as { character_id?: string }).character_id === 'string') {
          characters.push((c as { character_id: string }).character_id);
        }
      }
    }
    const assetsChars = (s.assets as { characters?: unknown } | undefined)?.characters;
    if (Array.isArray(assetsChars)) {
      for (const c of assetsChars) {
        if (typeof c === 'string') characters.push(c);
        else if (c && typeof c === 'object' && typeof (c as { id?: string }).id === 'string') {
          characters.push((c as { id: string }).id);
        }
      }
    }

    // action description: L4c motion_prompt or L4a dramatic_purpose
    const actionDescription =
      (dynamicSpec?.motion_prompt as string | undefined) ??
      (intent?.dramatic_purpose as string | undefined) ??
      String(s.primary_action ?? '');

    // renderPrompts 매칭해서 첫 프레임 프롬프트 참조
    const fp = renderPrompts?.shots.find((p) => p.shot_id === shotIdRaw);

    return {
      shotId,
      sceneId,
      shotType: normalizeShotType(shotTypeRaw),
      actionDescription,
      characters: Array.from(new Set(characters)),
      durationSeconds: duration,
      generationMethod: 'I2V' as GenerationMethod,
      dialogueLines: [],
      camera: { ...DEFAULT_CAMERA },
      lighting: { ...DEFAULT_LIGHTING },
      referenceImageUrl: fp?.t2i.prompt ? null : null,  // L6 결과로 채워짐
    };
  });
}

// shotImages 결과 → Shot.referenceImageUrl 매핑 (URL)
export function imagesByMainShotId(shotImages: ShotImagesOutput): Record<string, string> {
  const map: Record<string, string> = {};
  for (const img of shotImages.shots) {
    if (img.status === 'success' && img.image_url) {
      const mainId = writerShotIdToMain(img.shot_id, img.scene_id);
      map[mainId] = img.image_url;
    }
  }
  return map;
}

// shotVideos 결과 → VideoClip[]
export function adaptVideoClips(shotVideos: ShotVideosOutput): VideoClip[] {
  return shotVideos.shots.map((v) => ({
    shotId: writerShotIdToMain(v.shot_id, v.scene_id),
    url: v.status === 'success' ? v.video_url : null,
    status: v.status === 'success' ? 'completed' : v.status === 'failed' ? 'failed' : 'pending',
    thumbnailUrl: v.first_frame_url || null,
  }));
}
