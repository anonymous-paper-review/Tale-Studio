import type { StageConfig, StageId } from '@/types'

export const STAGES = [
  {
    id: 'producer',
    name: 'The Meeting Room',
    agent: 'Producer',
    path: '/studio/producer',
    handoffLabel: 'Hand over to Writer',
    nextStage: 'writer',
  },
  {
    // writer 탭 부활 (2026-06-12): 파이프라인 실행은 여전히 백엔드(producer 핸드오프가 발사).
    // 이 탭은 파이프라인 완료 후 러프 스토리보드(목각 인형 previz + 스토리 텍스트) 검토 단계.
    id: 'writer',
    name: "The Writers' Room",
    agent: 'Writer',
    path: '/studio/writer',
    handoffLabel: 'Hand over to Concept Artist',
    nextStage: 'artist',
  },
  {
    id: 'artist',
    name: 'The Visual Studio',
    agent: 'Concept Artist',
    path: '/studio/artist',
    handoffLabel: 'Approve & Direct',
    nextStage: 'director',
  },
  {
    id: 'director',
    name: 'The Set',
    agent: 'Director',
    path: '/studio/director',
    handoffLabel: 'Head to Editor',
    nextStage: 'editor',
  },
  {
    id: 'editor',
    name: 'Post-Production Suite',
    agent: 'Editor',
    path: '/studio/editor',
    handoffLabel: '',
    nextStage: null,
  },
] as const satisfies readonly StageConfig[]

export const CAMERA_AXIS_RANGE = { min: -10, max: 10 } as const
export const PROMPT_MAX_LENGTH = 150
export const SHOTS_PER_SCENE = 6
export const DEFAULT_SCENES_COUNT = 4
export const DEFAULT_SHOT_DURATION = 8

// ── GlobalChat: stage 이름 + 색 (design.md §2.9). 단일 source — 컴포넌트는 import만 ──

export const STAGE_LABEL: Record<StageId, string> = {
  producer: 'Producer',
  writer: 'Writer',
  artist: 'Artist',
  director: 'Director',
  editor: 'Editor',
}

/**
 * 에이전트 정식 표기 — STAGES[].agent 와 같은 이름(artist 는 'Concept Artist').
 * STAGE_LABEL 은 좁은 배지·레일용 축약이고, 이건 문장 안에서 "누가 하고 있는지"를 말할 때 쓴다
 * (진행 알림바: "Concept Artist가 캐릭터 이미지를 생성하고 있습니다").
 */
export const STAGE_AGENT_NAME: Record<StageId, string> = {
  producer: 'Producer',
  writer: 'Writer',
  artist: 'Concept Artist',
  director: 'Director',
  editor: 'Editor',
}

/** stage 색 badge 클래스 — design.md §2.9 토큰. JIT-safe literal (face와 동일 색). */
export const STAGE_BADGE_CLASS: Record<StageId, string> = {
  producer: 'bg-stage-producer/15 text-stage-producer border-stage-producer/30',
  writer: 'bg-stage-writer/15 text-stage-writer border-stage-writer/30',
  artist: 'bg-stage-artist/15 text-stage-artist border-stage-artist/30',
  director: 'bg-stage-director/15 text-stage-director border-stage-director/30',
  editor: 'bg-stage-editor/15 text-stage-editor border-stage-editor/30',
}

/** 스테이지 색 CSS var (badge와 동일) — 플레이트 그라데이션·강조 텍스트용. */
export const STAGE_FACE_COLOR: Record<StageId, string> = {
  producer: 'var(--stage-producer)',
  writer: 'var(--stage-writer)',
  artist: 'var(--stage-artist)',
  director: 'var(--stage-director)',
  editor: 'var(--stage-editor)',
}

// 값은 영어 원문 = i18n 키(#i18n-s5-batch4). 렌더 지점(global-chat.tsx)이 t() 로 번역한다.
export const STAGE_PLACEHOLDER: Record<StageId, string> = {
  producer: 'Tell us about your story…',
  writer: 'E.g. make scene 2 shot 3 darker',
  artist: 'E.g. create a character named Kai with brown hair',
  director: 'Try generating the rough storyboard into shooting-ready images.',
  editor: "Chat isn't available at this stage yet.",
}

// ── GlobalChat: 응답 대기 사고 흐름 (#oiioii-chat v2 2026-08-06) ──
// "생각 중…" 정지 문구 대신 순환시켜 에이전트가 뭔가 굴리고 있음을 보여주는 문구들.
//   각 stage 채팅이 실제로 거치는 처리 단계(컨텍스트 직렬화·카드 대조·수정 범위 판정)에서
//   따온 표현만 — 존재하지 않는 작업명(가짜 툴콜)은 넣지 않는다.
// 값은 영어 원문 = i18n 키(#i18n-s5-batch4). 렌더 지점(global-chat.tsx ThinkingIndicator)이 t() 로 번역한다.
export const STAGE_THINKING_PHRASES: Record<StageId, readonly string[]> = {
  producer: [
    'Pinpointing the heart of the story',
    'Finding gaps in the settings',
    'Looking over the cast cards',
    'Weighing genre and tone',
    'Choosing the next question',
  ],
  writer: [
    'Retracing the scene structure',
    'Looking over the shot list',
    'Gauging the rhythm of the dialogue',
    'Sorting out the scope of the edit',
  ],
  artist: [
    'Checking character appearances',
    'Finding empty views',
    'Matching up look consistency',
    'Organizing the generation plan',
  ],
  director: [
    'Retracing the storyboard order',
    'Mapping out camera movement',
    'Gauging lighting and mood',
    'Checking shot continuity',
  ],
  editor: ['Looking over the clips'],
}

// 핸드오프 초대 연출(⇄ 블록)이 보인 뒤 스테이지 슬라이드로 넘어가기까지의 지연 (#oiioii-handoff).
//   즉시 이동하면 블록이 그려지기도 전에 화면이 넘어가 "초대"가 안 보인다.
export const HANDOFF_INVITE_NAVIGATE_MS = 1600

// ── GlobalChat: 빠른 요청 프리셋 (#oiioii-chat 2026-08-06) ──
// 입력창 툴바의 에이전트 필 popover 가 보여주는 stage별 대표 요청. 클릭 = 입력창에 **삽입**
//   (자동 전송 금지 — 과금/전이가 걸린 발화를 원클릭으로 쏘지 않는다. 사용자가 다듬어 Enter).
//   각 항목은 그 stage 채팅이 실제로 처리할 수 있는 능력 범위 안에서만 (모델에게 없는 일을
//   시키는 프리셋은 실망 버튼이다). 핸드오프 문구는 handoff-intent.ts HANDOFFS 가 단일 source.
// 값은 영어 원문 = i18n 키(#i18n-s5-batch4). 렌더 지점(global-chat.tsx 프리셋 popover)이 t() 로 번역한다.
export const STAGE_PROMPT_PRESETS: Record<StageId, readonly string[]> = {
  producer: [
    'Sort out the genre and tone first',
    'Add a protagonist character',
    'Add a background location',
  ],
  writer: [
    'Add a close-up shot to the last scene',
    'Make the dialogue more concise',
    'Make the overall mood darker',
  ],
  artist: [
    "Create a character. I'll tell you the name and appearance",
    'Fill in the empty character views',
    'Regenerate the background image',
  ],
  director: [
    "Change this shot's camera to a low angle",
    'Make the lighting more dramatic',
    'Write the shot description more specifically',
  ],
  editor: [],
}

// writer 채팅: 러프 스토리보드 검토 단계에서 씬/샷 CRUD (api/writer/chat + global-chat-store 'writer' case).
//   editor 만 미지원 (라우트·case 없음).
export const CHAT_SUPPORTED_STAGES: ReadonlySet<StageId> = new Set<StageId>([
  'producer',
  'writer',
  'artist',
  'director',
])

// ── GlobalChat: 컨텍스트 관리 (chat-context-management Phase 1) ──
// 매 턴 LLM에 전송하는 히스토리 윈도우 — 최근 N개만 보내 입력 토큰·비용·벽돌(컨텍스트 한도
//   도달) 시나리오를 막는다. prompt caching이 안정 prefix를 캐싱하므로 윈도우는 안전 캡 역할.
export const CHAT_HISTORY_WINDOW = 40
// 전송 히스토리 char 예산 (Phase 2) — 토큰 카운트의 클라사이드 근사(정확한 토크나이저 없이).
//   WINDOW(개수)와 함께 적용해, 긴 단일 메시지가 입력을 부풀리는 것까지 막는다. 한↔영 혼합
//   기준 대략 12~24K 토큰 ≈ compaction 트리거(600K)보다 한참 아래.
export const CHAT_HISTORY_CHAR_BUDGET = 48_000
// DB에서 한 번에 로드하는 메시지 상한 (최근 N개). 무한 성장 로그의 초기 로드 비용 가드.
export const CHAT_MESSAGES_LOAD_LIMIT = 200

// 서버사이드 compaction 트리거 (Phase 2) — 단일 요청 입력이 이 토큰 수에 닿으면 API가 과거
//   이력을 요약 블록으로 자동 압축(lossy). 1M 창의 60% = 병리적 장기 세션 전용 안전망. 평소엔
//   윈도잉으로 한참 아래라 안 켜짐. 최소 설정값 50K 미만 시 API 에러. (claude.ts claudeChat)
export const CHAT_COMPACTION_TRIGGER_TOKENS = 600_000

// ── GlobalChat: 폭 리사이즈/접기 (design.md §6.1, chat-ui-store) ──
export const CHAT_DEFAULT_WIDTH = 320 // = 기존 w-80 (20rem)
export const CHAT_MIN_WIDTH = 280
export const CHAT_MAX_WIDTH = 560

// ── Studio shell 기하 (#shell-lift 2026-07-31) ──
// 좌측 레일·우측 채팅은 뷰포트 가장자리에 붙은 area 가 아니라 INSET 만큼 띄운 둥근 패널이다.
//   본문 여백 = INSET(패널 바깥) + 패널폭 + INSET(패널과 본문 사이). 세 곳(레일·채팅·본문)이
//   같은 값을 봐야 어긋나지 않으므로 여기서만 정의한다.
export const SHELL_INSET = 8
/** 좌측 스테이지 레일 폭 — 셀(w-14=56) + 좌우 여백. 아이콘 아래 stage 라벨이 들어갈 만큼. */
export const SHELL_RAIL_WIDTH = 76
/** 채팅 접힘 시 남는 열기 레일 폭 (global-chat 의 w-11). */
export const CHAT_COLLAPSED_RAIL = 44
