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
    id: 'writer',
    name: 'The Script Room',
    agent: 'Writer',
    path: '/studio/writer',
    handoffLabel: 'Ask Concept Artist',
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
  writer: '씬과 샷에 대해 물어보세요…',
  artist: '예: Kai 캐릭터 만들어줘, 갈색머리 검은코트',
  director: '촬영 기법에 대해 물어보세요…',
  editor: '아직 이 단계에서는 채팅을 쓸 수 없어요.',
}

export const CHAT_SUPPORTED_STAGES: ReadonlySet<StageId> = new Set<StageId>([
  'producer',
  'writer',
  'artist',
  'director',
])

// ── GlobalChat: 폭 리사이즈/접기 (design.md §6.1, chat-ui-store) ──
export const CHAT_DEFAULT_WIDTH = 320 // = 기존 w-80 (20rem)
export const CHAT_MIN_WIDTH = 280
export const CHAT_MAX_WIDTH = 560
