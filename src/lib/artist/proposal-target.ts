// A1(2026-09-28): 대기 중인 승인 카드가 어느 Artist 카드를 잡고 있는지 판정하는 순수 함수.
//
// 인물·배경 카드는 "지금 에이전트가 이 카드를 잡고 있다"를 표시하고 모습 추가·팝업 열기를 잠근다.
//   제안의 대상은 두 모양으로 실린다 — 도구 편집 승인은 payload.toolEdit(resource + id),
//   생성·삭제 제안은 payload.characterId / payload.locationId. 여러 대상을 한 장으로 묶은
//   카드(combinePendingProposals)는 items 에 원래 요청이 그대로 남아 있어 하나씩 훑는다.
import type { PendingProposal } from '@/lib/pending-proposal'

/** 모습 행 id 는 `${entityId}/${appearanceKey}` — 키에는 '/' 가 없다(chat-tool-bindings 와 같은 규칙). */
export function splitArtistRowId(id: string): readonly [string, string] {
  const at = id.lastIndexOf('/')
  return at > 0 ? [id.slice(0, at), id.slice(at + 1)] : [id, '']
}

const entityOfRowId = (id: string) => splitArtistRowId(id)[0]

/** 제안 한 건이 직접 가리키는 인물 id·배경 id. 대상을 못 읽으면 빈 값이다. */
function targetsOf(proposal: PendingProposal): { characterIds: string[]; locationIds: string[] } {
  const characterIds: string[] = []
  const locationIds: string[] = []
  const payload = proposal.payload ?? {}
  const toolEdit = payload.toolEdit as { resource?: unknown; id?: unknown } | undefined
  if (toolEdit && typeof toolEdit.id === 'string') {
    if (toolEdit.resource === 'characters') characterIds.push(toolEdit.id)
    else if (toolEdit.resource === 'appearances') characterIds.push(entityOfRowId(toolEdit.id))
    else if (toolEdit.resource === 'backgrounds') locationIds.push(toolEdit.id)
    else if (toolEdit.resource === 'background_appearances') locationIds.push(entityOfRowId(toolEdit.id))
  }
  if (typeof payload.characterId === 'string') characterIds.push(payload.characterId)
  if (typeof payload.locationId === 'string') locationIds.push(payload.locationId)
  return { characterIds, locationIds }
}

/**
 * 대기 중인 승인 카드가 이 인물·배경 카드를 가리키는가.
 *   - Artist 단계 제안만 Artist 카드를 잠근다(Producer·Writer 제안은 무시).
 *   - 인물 카드는 characterId 로, 배경 카드는 locationId 로만 대조한다 — 두 id 공간을 섞지 않는다.
 */
export function proposalTargetsCard(
  proposal: PendingProposal | null | undefined,
  card: { characterId?: string; locationId?: string },
): boolean {
  if (!proposal || proposal.stage !== 'artist') return false
  if (!card.characterId && !card.locationId) return false
  return (proposal.items ?? [proposal]).some((item) => {
    const { characterIds, locationIds } = targetsOf(item)
    return (
      (!!card.characterId && characterIds.includes(card.characterId)) ||
      (!!card.locationId && locationIds.includes(card.locationId))
    )
  })
}

/**
 * A2: 되돌릴 수 있는 마지막 승인이 이 카드의 것인가 — 되돌리기 줄을 그 카드에만 보인다.
 *   순환 임포트를 피하려고 artist-store 타입 대신 같은 모양의 값만 받는다.
 */
export function proposalUndoTargetsCard(
  undo: { resource: string; id: string } | null | undefined,
  card: { characterId?: string; locationId?: string },
): boolean {
  if (!undo) return false
  if (undo.resource === 'characters') return !!card.characterId && card.characterId === undo.id
  if (undo.resource === 'appearances') return !!card.characterId && card.characterId === entityOfRowId(undo.id)
  if (undo.resource === 'backgrounds') return !!card.locationId && card.locationId === undo.id
  if (undo.resource === 'background_appearances') return !!card.locationId && card.locationId === entityOfRowId(undo.id)
  return false
}
