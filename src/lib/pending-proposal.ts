import type { StageId } from '@/types'

export type PendingProposalStage = Extract<StageId, 'producer' | 'writer' | 'artist'>

export type PendingProposalKind =
  | 'producerSourcePatch'
  | 'producerWriterRerunRequest'
  | 'artistRegenerateCharacterView'
  | 'artistRegenerateCharacterAllViews'
  | 'artistRegenerateCharacterViews'
  | 'artistRegenerateWorldAsset'
  // C3 F6: cc 가 감지한 "기존 캐릭터 canonical 외형(원천) 변경"은 자동경로 금지 — 이 제안으로만 표면화,
  //   승인 후 서버 검증 라우트(/api/artist/appearance)가 characters.appearance 를 커밋한다.
  | 'artistSourceAppearancePatch'
  | 'writerShrinkDialogue'

export interface PendingProposal {
  id: string
  stage: PendingProposalStage
  kind: PendingProposalKind
  target: string
  action: string
  impact: string[]
  payload: Record<string, unknown>
  createdAt: string
}

const NEGATIVE_APPROVAL_PATTERNS = [
  /하지\s*마/,
  /안\s*돼/,
  /취소/,
  /보류/,
  /나중/,
  /멈춰/,
  /중지/,
  /\b(no|nope|stop|cancel|later|hold|don'?t)\b/i,
]

const APPROVAL_PATTERNS = [
  /^(ok|okay|yes|y|approve|approved|proceed|go|go ahead|do it)$/i,
  /^(진행|진행해|진행해줘|승인|승인해|승인해줘|좋아|좋습니다|해|해줘|그래|콜|오케이|ㅇㅋ)$/,
]

function normalizeApprovalText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,。！？~…]+/g, '')
    .replace(/\s+/g, ' ')
}

function normalizeKoreanApprovalText(text: string): string {
  return normalizeApprovalText(text).replace(/\s+/g, '')
}

export function isApprovalUtterance(text: string | null | undefined): boolean {
  if (!text) return false
  const normalized = normalizeApprovalText(text)
  const compactKorean = normalizeKoreanApprovalText(text)
  if (!normalized) return false
  if (NEGATIVE_APPROVAL_PATTERNS.some((pattern) => pattern.test(normalized))) return false
  return APPROVAL_PATTERNS.some((pattern) => pattern.test(normalized) || pattern.test(compactKorean))
}

export function formatProposalImpact(impact: string[]): string {
  const items = impact.map((item) => item.trim()).filter(Boolean)
  if (items.length === 0) return '영향 없음'
  return items.map((item) => `• ${item}`).join('\n')
}

export function createPendingProposal(input: Omit<PendingProposal, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: string
}): PendingProposal {
  return {
    ...input,
    id: input.id ?? `proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}
