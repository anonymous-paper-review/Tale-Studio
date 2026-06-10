// 스테이지별 "완성도" 모델 (chat-proactive-copilot Phase 4 — 누락 감지 제안의 연료).
//
// 순수 함수만 — store/네트워크 의존 없음. 채팅 프로액티브 넛지가 "뭐가 비었는지"를
// 사람이 읽을 수 있는 문장으로 만들 때 쓴다. 생성을 트리거하지 않는다(비용 무발생).
import type { CharacterAsset, WorldAsset } from '@/types'
import type { DirectorNode } from '@/types/director-canvas'
import { isShotData } from '@/types/director-canvas'
import { CHARACTER_DIRECTIONAL_VIEWS } from '@/lib/artist/turnaround'

export interface CompletenessGap {
  /** 사람이 읽는 한 줄 설명 */
  label: string
}

/** Artist 누락: 캐릭터 대표/방향뷰, 월드 wide/establishing 이 비어있는 것들. */
export function getArtistGaps(
  characters: CharacterAsset[],
  worlds: WorldAsset[],
): CompletenessGap[] {
  const gaps: CompletenessGap[] = []
  for (const c of characters) {
    if (c.views.main == null) gaps.push({ label: `${c.name}: 대표 이미지 없음` })
    const missing = CHARACTER_DIRECTIONAL_VIEWS.filter((v) => c.views[v] == null)
    if (missing.length > 0)
      gaps.push({ label: `${c.name}: 방향뷰 ${missing.length}개 비어있음` })
  }
  for (const w of worlds) {
    if (w.wideShot == null) gaps.push({ label: `${w.name}: 와이드샷 없음` })
    if (w.establishingShot == null)
      gaps.push({ label: `${w.name}: 설정샷 없음` })
  }
  return gaps
}

/** Director 누락: 샷에 캐릭터·배경 참조가 없거나 스토리보드가 아직 안 만들어진 것들. */
export function getDirectorGaps(nodes: DirectorNode[]): CompletenessGap[] {
  const gaps: CompletenessGap[] = []
  for (const n of nodes) {
    if (!isShotData(n.data)) continue
    const d = n.data
    if (d.characterAssetIds.length === 0 && d.worldAssetIds.length === 0)
      gaps.push({ label: `${d.label}: 캐릭터·배경 참조 없음` })
    else if (d.storyboardImage?.status !== 'completed')
      gaps.push({ label: `${d.label}: 스토리보드 미생성` })
  }
  return gaps
}

/** 갭 목록을 채팅 메시지용 요약 문자열로 (상위 max건 + 나머지 개수). */
export function summarizeGaps(gaps: CompletenessGap[], max = 3): string {
  const shown = gaps
    .slice(0, max)
    .map((g) => `• ${g.label}`)
    .join('\n')
  const extra = gaps.length > max ? `\n…외 ${gaps.length - max}건` : ''
  return shown + extra
}
