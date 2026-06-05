// svc-pipeline 출력을 기존 main app 데이터 모델로 변환
//   - S2 → Character[]
//   - S3 → Scene[] + SceneManifest
//   - L4 → Shot[]
//   - L5 → Shot.referenceImageUrl 등
//   - L6/L7 → Shot.referenceImageUrl / VideoClip[]
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
  S2Block,
  S3Block,
  S3Scene,
  L2Design,
  L4Shot,
  FinalPromptsOutput,
  L6ImagesOutput,
  L7VideosOutput,
} from '@/lib/svc/types/pipeline';

// svc scene_id (scene_1) → main sc_01
export function svcSceneIdToMain(svcId: string): string {
  const m = /scene[_-]?(\d+)/i.exec(svcId);
  if (m) {
    return `sc_${m[1].padStart(2, '0')}`;
  }
  return svcId;
}

// svc shot_id (shot_scene_1_001 or shot_s01_001) → main sh_01_01
export function svcShotIdToMain(svcShotId: string, sceneId: string): string {
  const sceneMain = svcSceneIdToMain(sceneId);
  const sceneNum = sceneMain.replace('sc_', '');
  const m = /[_-](\d{2,3})$/.exec(svcShotId);
  if (m) {
    const n = parseInt(m[1], 10);
    return `sh_${sceneNum}_${String(n).padStart(2, '0')}`;
  }
  return svcShotId;
}

// svc S2.characters → main Character[]
export function adaptCharacters(s2: S2Block): Character[] {
  return s2.characters.map((c) => ({
    characterId: c.id,
    name: c.name,
    role: ['protagonist', 'antagonist', 'supporting'].includes(c.role)
      ? (c.role as 'protagonist' | 'antagonist' | 'supporting')
      : 'supporting',
    description: c.appearance_description ?? '',
    fixedPrompt: `${c.name} (${c.role}): ${c.appearance_description ?? ''}. 성격: ${(c.personality ?? []).join(', ')}. ${c.voice ? `목소리: ${c.voice}.` : ''}`,
    referenceImages: [],
  }));
}

// svc L2.locations → main Location[]
export function adaptLocations(l2?: L2Design): Location[] {
  if (!l2?.locations) return [];
  return l2.locations.map((loc) => ({
    locationId: loc.id,
    name: loc.id,
    visualDescription: loc.style_description ?? '',
    timeOfDay: '',
    lightingDirection: (loc.lighting_sources ?? []).join(', '),
  }));
}

// svc S3.scenes → main Scene[]
export function adaptScenes(s3: S3Block): Scene[] {
  return s3.scenes.map((sc) => ({
    sceneId: svcSceneIdToMain(sc.scene_id),
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
export function adaptSceneManifest(s2: S2Block, s3: S3Block, l2?: L2Design): SceneManifest {
  return {
    scenes: adaptScenes(s3),
    characters: adaptCharacters(s2),
    locations: adaptLocations(l2),
  };
}

// L4 shot type 정규화 (svc는 다양한 형태로 옴)
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

// svc L4 + L5 → main Shot[] (다양한 svc 샷 스키마 수용)
export function adaptShots(l4Shots: L4Shot[], finalPrompts?: FinalPromptsOutput): Shot[] {
  return l4Shots.map((sh, idx) => {
    const s = sh as unknown as Record<string, unknown>;
    const sceneIdRaw = String(
      s.scene_id ?? (s.intent as { scene_id?: string } | undefined)?.scene_id ?? `scene_${idx + 1}`,
    );
    const shotIdRaw = String(
      s.shot_id ?? (s.intent as { shot_id?: string } | undefined)?.shot_id ?? `shot_${idx + 1}`,
    );
    const sceneId = svcSceneIdToMain(sceneIdRaw);
    const shotId = svcShotIdToMain(shotIdRaw, sceneIdRaw);

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

    // L5 final_prompts 매칭해서 첫 프레임 프롬프트 참조
    const fp = finalPrompts?.shots.find((p) => p.shot_id === shotIdRaw);

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

// L6 결과 → Shot.referenceImageUrl 매핑 (URL)
export function imagesByMainShotId(l6: L6ImagesOutput): Record<string, string> {
  const map: Record<string, string> = {};
  for (const img of l6.shots) {
    if (img.status === 'success' && img.image_url) {
      const mainId = svcShotIdToMain(img.shot_id, img.scene_id);
      map[mainId] = img.image_url;
    }
  }
  return map;
}

// L7 결과 → VideoClip[]
export function adaptVideoClips(l7: L7VideosOutput): VideoClip[] {
  return l7.shots.map((v) => ({
    shotId: svcShotIdToMain(v.shot_id, v.scene_id),
    url: v.status === 'success' ? v.video_url : null,
    status: v.status === 'success' ? 'completed' : v.status === 'failed' ? 'failed' : 'pending',
    thumbnailUrl: v.first_frame_url || null,
  }));
}
