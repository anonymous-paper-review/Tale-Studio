import type { StageId } from '@/types'

/**
 * 채팅 메시지 렌더 분류 (#oiioii-chat 2026-08-06) — oiioii 참조 UI의 그룹핑 룰 이식.
 *
 * "전부 말풍선"을 버리고 메시지 종류별로 렌더를 가른다 (ref: oiioii-chat-ui-spec.md §2):
 * 1. 유저 메시지만 채운 말풍선을 가진다. 에이전트 메시지는 배경 없는 flat 출력 —
 *    서피스(카드 배경)는 서브블록(상태 행·승인 카드·선택지)만 가진다.
 * 2. 화자 name plate 는 메시지마다가 아니라 **턴당 1회** — 연속된 model run 의
 *    첫 일반(text) 메시지에만 붙는다. 이 플레이트의 상단 여백이 턴 구분자 역할.
 * 3. 상태 행(status): 완료(✓)/실패(⚠) 알림은 "말"이 아니라 시스템 이벤트 —
 *    tool-row 스타일(서피스 + 아이콘 + 라벨)로 구분하고, 턴을 열지 않는다
 *    (플레이트를 붙이지 않는다).
 * 4. 핸드오프 초대(handoff): 스테이지 전이 마커(⇄) — 두 에이전트 아바타가 만나는
 *    초대 블록으로 렌더 (ref spec §8). status 처럼 턴을 열지 않는다.
 *
 * 판별은 global-chat-store 가 emit 하는 prefix(✓/⚠/⇄)를 본다 — 별도 메타 필드를
 * 붙이면 DB 스키마·저장 경로까지 번지므로, 표시 계층의 분류는 표시 계층에서 한다.
 */

export type ChatBlockKind = 'user' | 'status' | 'text' | 'handoff'

export interface ChatBlockMessage {
  role: 'user' | 'model'
  content: string
}

const HANDOFF_PREFIX = '⇄'

/** 핸드오프 초대 마커 직렬화 — store 가 성공한 전이 직후 model 메시지로 emit·영속화한다. */
export function handoffMarker(from: StageId, to: StageId): string {
  return `${HANDOFF_PREFIX} ${from}→${to}`
}

const ATTACHMENT_PREFIX = '📎'

/**
 * 첨부 이미지 마커 — 유저 메시지 본문 마지막 줄에 원본 이미지 URL 을 실어 영속화한다.
 *
 * messages 테이블에는 content(text) 하나뿐이라 별도 컬럼이 없다. 핸드오프 마커(⇄)와 같은
 * 방식으로 본문에 실어 두면 새로고침 후에도 "이 턴에 뭘 올렸는지"가 스레드에 남는다.
 *
 * 슬라이스가 아니라 원본 URL 만 담는다 — 사용자가 알아보는 건 자기가 올린 그 파일이고,
 * 슬라이스까지 넣으면 본문이 URL 로 뒤덮인다.
 */
export function withAttachmentMarker(text: string, imageUrls: string[]): string {
  if (imageUrls.length === 0) return text
  const marker = `${ATTACHMENT_PREFIX} ${imageUrls.join(' ')}`
  return text ? `${text}\n\n${marker}` : marker
}

/**
 * 마커 분리 — 렌더러는 text 를 말풍선에, urls 를 썸네일로 쓴다.
 * 형태가 어긋나면 원문 그대로 돌려준다(사용자가 직접 📎 를 친 경우 등).
 */
export function parseAttachmentMarker(content: string): { text: string; urls: string[] } {
  const lines = content.split('\n')
  const last = lines[lines.length - 1]?.trim() ?? ''
  if (!last.startsWith(ATTACHMENT_PREFIX)) return { text: content, urls: [] }

  const tokens = last.slice(ATTACHMENT_PREFIX.length).trim().split(/\s+/).filter(Boolean)
  // 전부 http(s) URL 일 때만 마커로 인정한다.
  if (tokens.length === 0 || !tokens.every((t) => /^https?:\/\/\S+$/.test(t))) {
    return { text: content, urls: [] }
  }

  return { text: lines.slice(0, -1).join('\n').trimEnd(), urls: tokens }
}

const STAGE_IDS: ReadonlySet<string> = new Set([
  'producer',
  'writer',
  'artist',
  'director',
  'editor',
])

/** 마커 파싱 — 형태가 어긋나면 null (렌더러는 status 행으로 폴백). */
export function parseHandoffMarker(
  content: string,
): { from: StageId; to: StageId } | null {
  const m = /^\s*⇄\s*([a-z]+)\s*→\s*([a-z]+)\s*$/.exec(content)
  if (!m) return null
  if (!STAGE_IDS.has(m[1]) || !STAGE_IDS.has(m[2])) return null
  return { from: m[1] as StageId, to: m[2] as StageId }
}

/** 상태 행 판별 — flushCompletion(✓) / notifyActionError(⚠) / 핸드오프 마커(⇄)의 고정 prefix. */
export function classifyChatMessage(msg: ChatBlockMessage): ChatBlockKind {
  if (msg.role === 'user') return 'user'
  const t = msg.content.trimStart()
  if (t.startsWith(HANDOFF_PREFIX)) return 'handoff'
  return /^[✓⚠]/.test(t) ? 'status' : 'text'
}

export interface ChatBlock<M extends ChatBlockMessage> {
  msg: M
  kind: ChatBlockKind
  /** 이 메시지 위에 화자 name plate 를 그린다 — model run 의 첫 text 메시지만 true. */
  showRolePlate: boolean
}

/**
 * 한 구간(section)의 메시지 목록 → 렌더 블록.
 * 구간이 이미 stage 단위로 쪼개져 있으므로(chat-sections) 여기서는 role 연속성만 본다 —
 * 유저 발화가 run 을 리셋하고, 다음 model text 메시지가 새 플레이트를 연다.
 */
export function buildChatBlocks<M extends ChatBlockMessage>(
  messages: readonly M[],
): ChatBlock<M>[] {
  const blocks: ChatBlock<M>[] = []
  let plateShown = false
  for (const msg of messages) {
    const kind = classifyChatMessage(msg)
    if (kind === 'user') {
      plateShown = false
      blocks.push({ msg, kind, showRolePlate: false })
      continue
    }
    const showRolePlate = kind === 'text' && !plateShown
    if (showRolePlate) plateShown = true
    blocks.push({ msg, kind, showRolePlate })
  }
  return blocks
}
