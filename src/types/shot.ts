export type ShotType =
  | 'ECU' | 'CU' | 'MCU' | 'MS' | 'MFS' | 'FS'
  | 'WS' | 'EWS' | 'OTS' | 'POV' | 'TRACK' | '2S'

export type GenerationMethod = 'T2V' | 'I2V'

export interface DialogueLine {
  /** null = 내레이션(V.O.) 라인 (#dialogue-v4) — 기존 DB에도 null 실재(persist가 화자 미상 시 null 기록). */
  characterId: string | null
  text: string
  emotion: string
  delivery: string
  durationHint: number
}

/** Kling 6-axis camera config, each -10 to +10 */
export interface CameraConfig {
  horizontal: number
  vertical: number
  pan: number   // pitch (up/down rotation)
  tilt: number  // yaw (left/right rotation)
  roll: number
  zoom: number
}

export interface LightingConfig {
  position: 'left' | 'top' | 'right' | 'front'
  brightness: number    // 0-100
  colorTemp: number     // 2000-10000 Kelvin
}

export interface CameraPreset {
  brand: string         // brand id: 'arri' | 'panavision' | 'red' | 'cooke' | 'zeiss'
  focalLength: number   // mm: 24 | 35 | 50 | 85
  aperture: number      // f-stop: 1.4 | 2 | 2.8 | 4 | 5.6 | 8
  whiteBalance: number  // kelvin: 3200 | 5600 | 6500 or custom
}

export const DEFAULT_CAMERA_PRESET: CameraPreset = {
  brand: 'arri',
  focalLength: 35,
  aperture: 2.8,
  whiteBalance: 5600,
}

/**
 * 러프 스토리보드 패널 (writer 탭, pre-concept previz).
 * 컨셉 아트 이전에 목각 인형/스틱 피겨로 연출(구도·포즈·배치)만 확인하는 패널.
 * DB shots.rough_storyboard JSONB — Director의 storyboard_image와 동일 shape, 다른 용도.
 */
export interface RoughStoryboardImage {
  /** 대표 프레임(3프레임 세트에선 start) — 단일 패널 구버전과의 하위 호환 필드. */
  url: string
  status: 'pending' | 'generating' | 'completed' | 'failed'
  errorMessage: string | null
  generatedAt: number
  /** 3프레임 세트(#rough-grid 2026-07-22): start → direction(화살표/지시문) → end. UI 는 순환 재생. */
  frames?: {
    start: string
    direction: string
    end: string
  }
  /** [레거시 기록] 이 세트가 잘려 나온 원본 그리드 — #no-originals(2026-08-24) 이후 미기록·
   *  기존 행의 값도 스토리지에서 회수돼 404. 소비처 없음(제거 검증 완료). */
  gridUrl?: string
  /** 화살표 레이어 분리(#arrow-layer 실험 2026-08-09) — direction 프레임에서 화살표·지시문을
   *  i2i 로 지운 클린 플레이트 캐시. for = 파생 원본 generatedAt (재생성되면 stale → 재분리). */
  cleanDirection?: { url: string; for: number }
  /** START↔설명 정합 검사(#adherence P2) — 생성 완료 후 VLM 판정. mismatch = 카드 배지. */
  adherence?: {
    status: 'ok' | 'mismatch'
    reason?: string
    checkedAt: string
    /** 판정 대상 generatedAt — 재생성 시 재검사 트리거의 기준 */
    checkedFor: number
  }
}

export interface Shot {
  shotId: string
  sceneId: string
  shotType: ShotType
  actionDescription: string
  /** 이미지/영상 생성용 rich 프롬프트(구도·의상·인물 명시). 없으면 actionDescription 폴백. */
  prompt?: string
  characters: string[]
  durationSeconds: number
  generationMethod: GenerationMethod
  dialogueLines: DialogueLine[]
  camera: CameraConfig
  cameraPreset?: CameraPreset
  movementPreset?: string | null
  movementIntensity?: number
  lighting: LightingConfig
  referenceImageUrl?: string | null
  roughStoryboard?: RoughStoryboardImage | null
  /** 목각 previz 영상(#previz-video 2026-07-22) — 러프 START+END 로 생성한 연출 판독용 영상. */
  previzVideo?: RoughStoryboardImage | null
  /** DB shots.sort_order — 씬 내 순서. 위치 삽입(추가 팝업)에서 이웃 기준 계산에 사용. */
  sortOrder?: number
  /**
   * 타이틀 카드(#owner-title-card 2026-08-31) — 검은 배경 위에 텍스트(+선택 이미지)만 보여주는
   * synthetic 클립(shotId 접미 __t) 전용 필드. DB shots 에 대응 행이 없다(editor_states 스냅샷 소관).
   */
  titleCard?: TitleCardData | null
  /**
   * 클립 자막(약속 K, 2026-09-04) — 클립마다 한 덩어리. undefined = 손대지 않음(Writer 대사가 초기값), null = 지움.
   *   자리는 화면 비율(덩어리 가운데). 편집기 스냅샷(editor_states)에 저장된다.
   */
  subtitle?: ShotSubtitle | null
}

export interface ShotSubtitle {
  text: string
  x: number
  y: number
}

/** 타이틀 카드 레이어 자리 — 카드 폭·높이 비율(0..1). x·y 는 왼쪽 위, w 는 폭 비율(높이는 내용이 정한다). */
export interface TitleCardLayer {
  x: number
  y: number
  w: number
}
export interface TitleCardLayout {
  text: TitleCardLayer
  image: TitleCardLayer
  /** 겹칠 때 어느 것이 위인가(우클릭 메뉴로 바꾼다, 약속 J 배치). */
  order: 'text-over-image' | 'image-over-text'
}
/** 약속 J(2026-09-04): 글자·이미지를 자유 배치하고, 미리보기와 내보내기가 같은 배치를 쓴다(src/lib/editor/title-card.ts). */
export interface TitleCardData {
  text: string
  imageUrl: string | null
  layout?: TitleCardLayout | null
}

export interface VideoClip {
  shotId: string
  url: string | null
  status: 'pending' | 'generating' | 'completed' | 'failed'
  thumbnailUrl: string | null
  trimStart?: number  // seconds, client-only for P5 crop
  trimEnd?: number    // seconds, client-only for P5 crop
  speed?: number      // 0.25 ~ 4.0, default 1.0
  // #d11(2026-08-31 오너 확정): 실제 영상 파일 길이(초) — 에디터가 로드 시 메타데이터로 측정.
  //   파생값이라 DB 미저장(architecture §0). 계획(durationSeconds)보다 짧으면 타임라인이
  //   이 길이로 자동 트림해 죽은 꼬리를 없앤다(모델 최소 길이 3~4s 파일이 긴 계획 슬롯에 앉는 사례).
  actualDurationSec?: number
}

/**
 * 오디오 트랙 클립 — 비디오와 독립 트랙.
 * 생성 영상의 오디오는 파편화되어 거슬리므로 비디오 오디오는 기본 mute,
 * 사용자가 외부 오디오(음악/내레이션)를 업로드해 이 트랙에 배치한다.
 */
export interface AudioTrackClip {
  id: string
  name: string
  url: string          // 업로드된 오디오 object URL or 원격 URL
  startSec: number     // 타임라인 시작 위치 (자유 배치)
  durationSec: number  // 타임라인에 차지하는 길이 (cut 시 줄어듦)
  volume: number       // 0~1, default 1
  muted: boolean
  peaks?: number[]     // 파형 렌더용 정규화 peak (0~1, 원본 소스 전체 기준). 디코드 후 캐시
  // cut(split) 지원: 한 소스 파일을 여러 조각으로 나눠도 각 조각이 원본의 어느 구간인지 추적.
  sourceOffsetSec?: number    // 이 조각이 원본 파일의 몇 초부터 시작하는지 (default 0)
  sourceDurationSec?: number  // 원본 파일 전체 길이 (peaks 슬라이스 매핑용. default = durationSec)
  // 영속화: 업로드 파일 blob 의 IndexedDB 키 (새로고침 후 url 재생성). source bin 클립이면 동일 키 공유.
  blobKey?: string
  sourceId?: string           // 어떤 AudioSource 에서 왔는지 (bin 추적용)
  trackId?: string            // 어느 오디오 레인(트랙)에 속하는지 (멀티 트랙). 없으면 첫 트랙
}

/**
 * 오디오/보이스 소스 보관함 항목 (Video Source 의 오디오 버전).
 * 업로드하면 bin 에 등록되고, 타임라인 오디오 트랙으로 드래그해 여러 번 인스턴스화할 수 있다.
 */
export interface AudioSource {
  id: string
  name: string
  url: string          // 라이브 object URL (세션마다 blob 에서 재생성)
  durationSec: number
  peaks?: number[]
  blobKey?: string     // IndexedDB 키 (원본 파일 blob)
  kind: 'voice' | 'audio'
}
