import type { StageConfig, StageId } from '@/types'

// Camera 탭 이름(오너 2026-11-22 D2~D5 — 가칭, 오너가 바꿀 수 있다. id 'camera' 는 그대로). 레일 이름 · 문장 속 이름은 여기 한 곳에서만 정하고,
//   이름이 들어가는 문구는 모두 STAGE_LABEL · STAGE_AGENT_NAME 을 {stage} · {agent} 로 받는다(리드 11/22 "문구 키 한 곳에").
const CAMERA_LABEL = 'Camera'
const CAMERA_AGENT = 'Cinematographer'

export const STAGES = [
  // 리뉴얼 1차(2026-10-19): 화면 이름 Producer → Writer → Artist → Storyboard → Director → Editor.
  //   id 는 옛 이름 그대로다(types/project.ts StageId 주석): entry=Producer, producer=Writer, writer=Storyboard.
  //   넘어간 Producer · Writer 는 잠금이 아니라 "완료" — 뒤 단계의 변화를 앞으로 다시 맞추지 않는다.
  {
    id: 'entry',
    name: 'The Meeting Room',
    agent: 'Producer',
    path: '/studio/start',
    handoffLabel: 'Start writing',
    nextStage: 'producer',
  },
  {
    // 화면 이름 Writer — 산문(씬 스토리) 작업공간. 파이프라인 01~04 결과를 다룬다.
    id: 'producer',
    name: "The Writers' Room",
    agent: 'Writer',
    path: '/studio/producer',
    handoffLabel: 'Breakdown',
    nextStage: 'artist',
  },
  {
    id: 'artist',
    name: 'The Visual Studio',
    agent: 'Concept Artist',
    path: '/studio/artist',
    handoffLabel: 'Complete',
    nextStage: 'writer',
  },
  {
    // 콘티(옛 화면 이름 Storyboard) — 씬 · 샷 · 러프 콘티. 예전 Writer 화면 그대로 Artist 뒤로 옮겼다.
    //   2026-11-22(오너 D1): Writer 탭 안의 콘티 칸이다 — 레일은 Writer 칸 하나로 보인다(lib/stage-rail RAIL_ITEMS). 이름표 · 담당도 Writer.
    //   2026-11-22(오너 D2~D5): 다음 단계는 Director 앞에 선 새 탭 Camera 다.
    id: 'writer',
    name: "The Writers' Room",
    agent: 'Writer',
    path: '/studio/writer',
    handoffLabel: `Next: ${CAMERA_LABEL}`,
    nextStage: 'camera',
  },
  {
    // 화면 이름 Camera(가칭, 오너 2026-11-22 D2~D5) — 씬마다 샷의 실사 그림 · 영상 이력. 옛 Director 스토리보드 보기의 일을 받았다.
    //   Director 로는 조건 없이 넘긴다(리드 11/22 f).
    id: 'camera',
    name: `The ${CAMERA_LABEL} Room`,
    agent: CAMERA_AGENT,
    path: '/studio/camera',
    handoffLabel: 'Next: Director',
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

// 화면에 보이는 단계 이름 — id 와 다르다(리뉴얼 1차): producer 는 Writer. writer(콘티)도 Writer 다 — Writer 탭 안의 칸(D1 2026-11-22).
export const STAGE_LABEL: Record<StageId, string> = {
  entry: 'Producer',
  producer: 'Writer',
  writer: 'Writer',
  artist: 'Artist',
  camera: CAMERA_LABEL,
  director: 'Director',
  editor: 'Editor',
}

/**
 * 에이전트 정식 표기 — STAGES[].agent 와 같은 이름(artist 는 'Concept Artist').
 * STAGE_LABEL 은 좁은 배지·레일용 축약이고, 이건 문장 안에서 "누가 하고 있는지"를 말할 때 쓴다
 * (진행 알림바: "Concept Artist가 캐릭터 이미지를 생성하고 있습니다").
 */
export const STAGE_AGENT_NAME: Record<StageId, string> = {
  entry: 'Producer',
  producer: 'Writer',
  writer: 'Writer',
  artist: 'Concept Artist',
  camera: CAMERA_AGENT,
  director: 'Director',
  editor: 'Editor',
}

/** stage 색 badge 클래스 — design.md §2.9 토큰. JIT-safe literal (face와 동일 색). */
//   색은 화면 이름을 따른다: Producer(entry) · Writer(producer) · 콘티(writer — Writer 탭 안의 칸이라 Writer 색, D1 2026-11-22 · 리드 결정 2).
//   Camera 는 옛 Storyboard 색(딥 블루)을 받는다(리드 2026-11-22 — 콘티가 Writer 칸 안으로 들어가며 비는 자리, design.md §2.9).
export const STAGE_BADGE_CLASS: Record<StageId, string> = {
  entry: 'bg-stage-producer/15 text-stage-producer border-stage-producer/30',
  producer: 'bg-stage-writer/15 text-stage-writer border-stage-writer/30',
  writer: 'bg-stage-writer/15 text-stage-writer border-stage-writer/30',
  artist: 'bg-stage-artist/15 text-stage-artist border-stage-artist/30',
  camera: 'bg-stage-storyboard/15 text-stage-storyboard border-stage-storyboard/30',
  director: 'bg-stage-director/15 text-stage-director border-stage-director/30',
  editor: 'bg-stage-editor/15 text-stage-editor border-stage-editor/30',
}

/** 스테이지 색 CSS var (badge와 동일) — 플레이트 그라데이션·강조 텍스트용. */
export const STAGE_FACE_COLOR: Record<StageId, string> = {
  entry: 'var(--stage-producer)',
  producer: 'var(--stage-writer)',
  writer: 'var(--stage-writer)',
  artist: 'var(--stage-artist)',
  camera: 'var(--stage-storyboard)',
  director: 'var(--stage-director)',
  editor: 'var(--stage-editor)',
}

// 채팅 머리 제목(v3 2026-11-03) — "Lumi와 산문 이야기"처럼 그 단계에서 하는 일. 시안에 있는 넷(산문 · 그림 · 연출 · 편집) 그대로,
//   시안에 없는 Producer 는 기획, Director 는 촬영(Storyboard 가 이미 연출이라 겹치지 않게). 값은 영어 원문 = i18n 키.
export const STAGE_CHAT_TITLE: Record<StageId, string> = {
  entry: 'Planning with Lumi',
  producer: 'Prose with Lumi',
  artist: 'Art with Lumi',
  writer: 'Directing with Lumi',
  // Director · Editor 는 11/13 시안 D5 대로 단계 이름을 적는다(오너 11/14 "추천대로") — 다른 단계는 v3 그대로.
  //   Camera 도 같은 꼴(시안 없음, 오너 2026-11-22 D2~D5). 이름은 STAGE_LABEL 에서 — 채팅 머리가 {stage} 로 넘긴다.
  camera: 'Lumi · {stage}',
  director: 'Lumi · Director',
  editor: 'Lumi · Editor',
}

// 값은 영어 원문 = i18n 키(#i18n-s5-batch4). 렌더 지점(global-chat.tsx)이 t() 로 번역한다.
export const STAGE_PLACEHOLDER: Record<StageId, string> = {
  entry: 'Tell us about your story…',
  producer: 'E.g. rewrite it, or make the ending funnier',
  writer: 'E.g. make shot 8 darker',
  // 새 인물 · 배경은 채팅으로 만들지 않는다(디자이너 QA 1차 #04) — 있는 인물을 고치는 예시를 든다.
  artist: "E.g. make the main character's hair shorter",
  // Camera(오너 2026-11-22 D2~D5) — 판을 쌓는 탭이라 다시 만드는 예시를 든다.
  camera: "E.g. make shot 3's video again, a bit slower",
  // 11/13 시안 D5 — 말로 샷 하나를 고치는 예시(오너 11/14 "추천대로").
  director: "E.g. make shot 1's lighting neon blue",
  // Editor 채팅은 조언만 한다(오너 2026-11-14 10번) — 작업물을 바꾸지 않으니 "어떻게 하나"를 묻는 예시를 든다.
  editor: 'E.g. how do I connect two cuts smoothly?',
}

// Director 빠른 칩(11/13 시안 D5, 오너 2026-11-14 "추천대로") — 입력칸 바로 위에 늘 보이고, 누르면 그 말을 바로 보낸다.
//   칩 말은 AI 를 거치지 않고 지금 보드 상태로 바로 한다(global-chat-store runDirectorQuickChip · lib/director/lumi-quick-chips).
//   순서가 칩의 뜻이다: 이미지 필요한 샷 · 이미지 나온 샷 영상 · 실패한 샷 다시 · 지금 어디까지. 값은 영어 원문 = i18n 키.
export const DIRECTOR_QUICK_CHIPS = [
  'Make images for every shot that needs one',
  'Make videos for shots with images',
  'Remake the failed shots',
  'How far along is it?',
] as const

// ── GlobalChat: 응답 대기 사고 흐름 (#oiioii-chat v2 2026-08-06) ──
// "생각 중…" 정지 문구 대신 순환시켜 에이전트가 뭔가 굴리고 있음을 보여주는 문구들.
//   각 stage 채팅이 실제로 거치는 처리 단계(컨텍스트 직렬화·카드 대조·수정 범위 판정)에서
//   따온 표현만 — 존재하지 않는 작업명(가짜 툴콜)은 넣지 않는다.
// 값은 영어 원문 = i18n 키(#i18n-s5-batch4). 렌더 지점(global-chat.tsx ThinkingIndicator)이 t() 로 번역한다.
export const STAGE_THINKING_PHRASES: Record<StageId, readonly string[]> = {
  entry: ['Pinpointing the heart of the story', 'Weighing genre and tone', 'Choosing the next question'],
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
  // Camera(오너 2026-11-22 D2~D5) — 샷마다 쌓인 판을 보고 고친다.
  camera: ['Looking over the shot history', 'Gauging lighting and mood', 'Checking shot continuity'],
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
  // Producer(entry)는 시작 화면이라 빠른 요청이 없다. Writer(producer) 는 산문 고치기 요청.
  entry: [],
  producer: ['Rewrite it', 'Make it shorter', 'Make the dialogue funnier'],
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
  // Camera(오너 2026-11-22 D2~D5)는 Director 와 같은 채팅 엔진이라 같은 요청을 쓴다.
  camera: [
    "Change this shot's camera to a low angle",
    'Make the lighting more dramatic',
    'Write the shot description more specifically',
  ],
  director: [
    "Change this shot's camera to a low angle",
    'Make the lighting more dramatic',
    'Write the shot description more specifically',
  ],
  // Editor 는 조언 질문만(오너 2026-11-14 10번 — 작업물에는 손대지 않는다).
  editor: [
    'How do I connect two cuts smoothly?',
    'Is any cut too long?',
    'How do I add background music?',
  ],
}

// writer 채팅: 러프 스토리보드 검토 단계에서 씬/샷 CRUD (api/writer/chat + global-chat-store 'writer' case).
//   editor 채팅은 조언만 한다(api/editor/chat — 오너 2026-11-14 10번, 작업물을 바꾸는 길이 없다).
export const CHAT_SUPPORTED_STAGES: ReadonlySet<StageId> = new Set<StageId>([
  'producer',
  'writer',
  'artist',
  'director',
  'editor',
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
// v3(2026-11-03) 시안의 채팅 폭은 360~380 — 본문이 넓은 쪽(360)을 기본으로. 사용자가 바꾼 폭은 그대로 기억한다.
export const CHAT_DEFAULT_WIDTH = 360
export const CHAT_MIN_WIDTH = 280
export const CHAT_MAX_WIDTH = 560

// ── Studio shell 기하 (#shell-lift 2026-07-31 → v3 2026-11-03) ──
// 좌측 레일은 INSET 만큼 띄운 둥근 패널, 우측 채팅은 v3 시안대로 오른쪽 가장자리에 붙은 패널(왼쪽 모서리만 둥글다).
//   본문 왼쪽 여백 = INSET + 레일폭 + INSET, 오른쪽 여백 = 채팅폭 + INSET(본문과 채팅 사이). 세 곳(레일·채팅·본문)이
//   같은 값을 봐야 어긋나지 않으므로 여기서만 정의한다.
export const SHELL_INSET = 8
/** 좌측 스테이지 레일 폭 — v3 시안 80(칸 64 + 좌우 8). 아이콘 아래 stage 라벨이 들어갈 만큼. */
export const SHELL_RAIL_WIDTH = 80
/** 채팅 접힘 시 남는 열기 레일 폭 (global-chat 의 w-11). */
export const CHAT_COLLAPSED_RAIL = 44
