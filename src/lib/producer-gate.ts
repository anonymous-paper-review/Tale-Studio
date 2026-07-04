// producer-gate — 핸드오프 게이트의 결정적 판정 (제품 레이어).
//
// architecture §3: 채팅 LLM 추출은 폼을 채우는 *제안*일 뿐, 게이트 충족 판정은 코드가 한다.
//   게이트 A(Story Foundation, 옛 S0) + 게이트 B(Cast, 옛 S2, depth 연동)를 순수 함수로 판정한다.
//   하드 게이트만 핸드오프를 차단하고, soft는 경고만(채팅 넛지로 의식적 선택 유도).
import type { ProjectSettings } from '@/types'
import { depthLevelFromRuntime } from '@/lib/depth'

export type EntityType = 'person' | 'object'

export interface CastArc {
  start_state: string
  end_state: string
  arc_type: string
}
export interface CastMotivation {
  want: string
  need?: string
  wound?: string
}

// producer가 편집하는 캐스트 멤버. characters 테이블 컬럼과 1:1 (handoff 시 upsert).
export interface CastMember {
  // slug. producer 편집 중에는 미정(핸드오프 때 생성)일 수 있다 — 로컬 임시 키는 localId.
  localId: string
  characterId?: string
  name: string
  entityType: EntityType
  appearance: string
  role?: string
  arc?: CastArc
  motivation?: CastMotivation
  origin?: 'producer' | 'writer'
  // 사용자가 카드 UI 로 직접 손댄 값인지. true 면 채팅이 덮어쓰기 전에 승인 게이트를 거친다.
  userEdited?: boolean
}

export interface BackgroundSource {
  localId: string
  locationId?: string
  name: string
  visualDescription: string
  purpose: string
  origin?: 'producer' | 'writer'
  userEdited?: boolean
  stale?: boolean
}

export interface GateIssue {
  field: string
  label: string // 한국어 — UI 노출
  detail?: string
}

export interface GateResult {
  /** 하드 게이트가 전부 충족돼 핸드오프 가능한가. */
  canHandoff: boolean
  hardMissing: GateIssue[]
  softMissing: GateIssue[]
}

export interface GateInput {
  settings: ProjectSettings
  storyReady: boolean
  cast: CastMember[]
  backgrounds: BackgroundSource[]
}

function isFilled(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return v != null
}

function arcComplete(arc?: CastArc): boolean {
  return (
    !!arc &&
    isFilled(arc.start_state) &&
    isFilled(arc.end_state) &&
    isFilled(arc.arc_type)
  )
}

// depth별 person 필수 필드 (proposal §2 게이트 B 표).
function evaluatePersonFields(
  person: CastMember,
  depth: (typeof DEPTH_ORDER)[number],
): GateIssue[] {
  const issues: GateIssue[] = []
  const who = person.name || '이름 미정 인물'
  // 모든 depth: name + appearance 필수.
  if (!isFilled(person.name))
    issues.push({ field: `cast:${person.localId}:name`, label: `${who}: 이름 필요` })
  if (!isFilled(person.appearance))
    issues.push({ field: `cast:${person.localId}:appearance`, label: `${who}: 외모(appearance) 필요` })

  // D3+ : arc / motivation.want 추가 필수.
  if (depthAtLeast(depth, 'D3')) {
    if (!arcComplete(person.arc))
      issues.push({ field: `cast:${person.localId}:arc`, label: `${who}: 아크(시작/끝/유형) 필요` })
    if (!isFilled(person.motivation?.want))
      issues.push({ field: `cast:${person.localId}:want`, label: `${who}: 동기(want) 필요` })
  }
  return issues
}

const DEPTH_ORDER = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] as const
function depthAtLeast(
  depth: (typeof DEPTH_ORDER)[number],
  min: (typeof DEPTH_ORDER)[number],
): boolean {
  return DEPTH_ORDER.indexOf(depth) >= DEPTH_ORDER.indexOf(min)
}

export function isProducerBackgroundComplete(background: BackgroundSource): boolean {
  return (
    isFilled(background.name) &&
    isFilled(background.visualDescription) &&
    isFilled(background.purpose)
  )
}

export function evaluateProducerGate({ settings, storyReady, cast, backgrounds }: GateInput): GateResult {
  const hardMissing: GateIssue[] = []
  const softMissing: GateIssue[] = []

  // ── 게이트 A: Story Foundation ──────────────────────────────
  if (!isFilled(settings.genre))
    hardMissing.push({ field: 'genre', label: '장르 필요' })
  if (!(typeof settings.playtime === 'number' && settings.playtime >= 5 && settings.playtime <= 1800 + 600))
    hardMissing.push({ field: 'playtime', label: '러닝타임 필요 (5초~30분+)' })
  if (!isFilled(settings.format))
    hardMissing.push({ field: 'format', label: '포맷 필요' })
  if (!isFilled(settings.dialogueLanguage))
    hardMissing.push({ field: 'dialogueLanguage', label: '대사 언어 필요' })
  if (!storyReady)
    hardMissing.push({ field: 'storyText', label: '스토리가 아직 준비되지 않음' })

  // soft: subGenre / tone[]
  if (!isFilled(settings.subGenre))
    softMissing.push({ field: 'subGenre', label: '세부 장르(subGenre)', detail: '비우면 writer에 빈 채로 전달' })
  if (!isFilled(settings.tone))
    softMissing.push({ field: 'tone', label: '톤(tone)', detail: '채우면 각본 퀄이 올라가요' })

  // ── 게이트 B: Cast (depth 연동) ─────────────────────────────
  const depth = depthLevelFromRuntime(
    typeof settings.playtime === 'number' ? settings.playtime : 0,
  )
  // 핸드오프 하드게이트는 producer 원천 카드만 평가한다 — writer 파이프라인이 (부분/실패 run 중)
  //   추가한 writer-origin 카드(미완성일 수 있음)가 producer 의 재핸드오프/재실행을 막지 않도록.
  //   origin 미지정(레거시)은 producer 로 간주해 포함한다.
  const isProducerOrigin = (c: { origin?: 'producer' | 'writer' }) => c.origin !== 'writer'
  const producerCast = cast.filter(isProducerOrigin)
  const persons = producerCast.filter((c) => c.entityType === 'person')

  // 최소 캐스트: D1~D2 = 0명, D3 = 1명, D4+ = 1명 필수 + 2명 권장.
  if (depthAtLeast(depth, 'D3') && persons.length < 1) {
    hardMissing.push({
      field: 'cast:minPerson',
      label: '주인공 1명 이상 필요 (필수)',
      detail: '러닝타임이 1분 이상이면 최소 1명의 인물이 필요합니다',
    })
  }
  if (depthAtLeast(depth, 'D4') && persons.length < 2) {
    softMissing.push({
      field: 'cast:recommendPersons',
      label: '인물 2명 이상 권장',
      detail: '5분 이상 영상은 관계가 있는 다중 인물을 권장',
    })
  }

  // 정의된 인물의 필수 필드 (object는 name+appearance만 — person 전용 필드 면제).
  for (const p of persons) {
    hardMissing.push(...evaluatePersonFields(p, depth))
  }
  for (const o of producerCast.filter((c) => c.entityType === 'object')) {
    const who = o.name || '이름 미정 사물'
    if (!isFilled(o.name))
      hardMissing.push({ field: `cast:${o.localId}:name`, label: `${who}: 이름 필요` })
    if (!isFilled(o.appearance))
      hardMissing.push({ field: `cast:${o.localId}:appearance`, label: `${who}: 외모(appearance) 필요` })
  }

  // ── 게이트 C: Background source (producer-owned location pool) ───────
  if (!backgrounds.filter(isProducerOrigin).some(isProducerBackgroundComplete)) {
    hardMissing.push({
      field: 'background:minComplete',
      label: '배경 1개 이상 필요',
      detail: '이름, 시각 설명, 목적이 모두 있는 배경 카드가 필요합니다',
    })
  }

  return {
    canHandoff: hardMissing.length === 0,
    hardMissing,
    softMissing,
  }
}
