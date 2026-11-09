// Writer 산문을 고쳐 달라고 한 뒤 채팅(11/5 시안 WL · WS, 오너 2026-11-09 추천대로) — 보낸 직후 답 문장은 없고, 수정안이 올 때까지
//   Lumi 점 세 개, 오면 Lumi 가 "S2를 고쳐 봤어요. 바뀐 곳은 산문에 표시해 뒀어요. [적용] 전에는 원래 글 그대로예요."를 한 번 남긴다.
//   수정안 카드 대신 "수정안 · S2 · 1곳" 칩 — 버리기 · 적용은 산문 안 상자에서 한다. 약속: tests/writer/prose-revise-chat.test.ts
import { translate } from '@/lib/i18n/translate'
import { objectParticle } from '@/lib/korean-particles'
import type { AppLocale } from '@/lib/locale'
import { changedSceneRows, type SceneStoryProposalView } from '@/lib/producer/scene-story-proposal'

/** 칩에 적는 문단 번호 수 — 넘으면 "…"(칩이 한 줄을 넘지 않게). */
const CHIP_LABELS_SHOWN = 3

/**
 * 수정안이 오면 알릴지 — 'announce' 지금 알리고 표시를 지운다 · 'wait' 아직 만드는 중 · 'drop' 알리지 않고 표시를 지운다
 * (실패 · 그새 산문이 바뀜 · 수정 요청이 없어짐 · 다른 프로젝트 · 세 가지 안) · null 알릴 요청이 없다.
 */
export function reviseAnnouncement(
  marker: { projectId: string; label: string | null } | null,
  now: { projectId: string | null; proposal: Pick<SceneStoryProposalView, 'status' | 'stale' | 'variants'> | null | undefined; hasProposal: boolean },
): 'announce' | 'wait' | 'drop' | null {
  if (!marker) return null
  if (marker.projectId !== now.projectId || !now.hasProposal) return 'drop'
  const proposal = now.proposal
  if (!proposal) return 'wait'
  if (proposal.variants?.length) return 'drop'
  if (proposal.status === 'generating') return 'wait'
  return proposal.status === 'ready' && !proposal.stale ? 'announce' : 'drop'
}

/** 수정안이 왔다고 알리는 Lumi 말 — 고친 문단 번호가 있으면 "S2를 고쳐 봤어요…", 없으면 "산문을 고쳐 봤어요…". */
export function proseRevisedMessage(locale: AppLocale, label: string | null): string {
  return label
    ? translate(locale, 'I revised {label}. The changes are marked in the prose. The original stays as it is until you press [Apply].', { label, ul: objectParticle(label) })
    : translate(locale, 'I revised the prose. The changes are marked in the prose. The original stays as it is until you press [Apply].')
}

/** 채팅의 수정안 칩 — "수정안 · S2 · 1곳"(바뀐 문단 번호 셋까지, 넘으면 …). */
export function proposalChipText(locale: AppLocale, proposal: Pick<SceneStoryProposalView, 'before' | 'after'>): string {
  const changes = changedSceneRows(proposal.before, proposal.after)
  const labels = [...new Set(changes.map(({ before, after }) => `S${(after?.index ?? before?.index ?? 0) + 1}`))]
  const shown = labels.slice(0, CHIP_LABELS_SHOWN).join(' · ') + (labels.length > CHIP_LABELS_SHOWN ? ' …' : '')
  return translate(locale, 'Proposal · {labels} · {count} changed', { labels: shown, count: changes.length })
}
