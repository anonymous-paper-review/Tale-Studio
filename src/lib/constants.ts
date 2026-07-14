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

// ── GlobalChat: stage 표기 + 색 (design.md §2.9). 단일 source — 컴포넌트는 import만 ──

export const STAGE_BADGE: Record<StageId, string> = {
  producer: 'P1',
  writer: 'P2',
  artist: 'P3',
  director: 'P4',
  editor: 'P5',
}

export const STAGE_LABEL: Record<StageId, string> = {
  producer: 'Producer',
  writer: 'Writer',
  artist: 'Artist',
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

/** AgentFace SVG color — CSS var (badge와 동일 색). */
export const STAGE_FACE_COLOR: Record<StageId, string> = {
  producer: 'var(--stage-producer)',
  writer: 'var(--stage-writer)',
  artist: 'var(--stage-artist)',
  director: 'var(--stage-director)',
  editor: 'var(--stage-editor)',
}

export const STAGE_PLACEHOLDER: Record<StageId, string> = {
  producer: '스토리에 대해 말해주세요…',
  writer: '예: 마지막 씬에 클로즈업 샷 추가해줘 / sc_02 분위기를 더 어둡게',
  artist: '예: Kai 캐릭터 만들어줘, 갈색머리 검은코트',
  director: '러프 스토리보드를 실제 촬영 이미지로 생성해보세요.',
  editor: '아직 이 단계에서는 채팅을 쓸 수 없어요.',
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
