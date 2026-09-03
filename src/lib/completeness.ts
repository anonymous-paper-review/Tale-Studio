// 스테이지별 "완성도" 모델 (chat-proactive-copilot Phase 4 — 누락 감지 제안의 연료).
//
// 순수 함수만 — store/네트워크 의존 없음. 채팅 프로액티브 넛지가 "뭐가 비었는지"를
// 사람이 읽을 수 있는 문장으로 만들 때 쓴다. 생성을 트리거하지 않는다(비용 무발생).
import type { CharacterAsset, WorldAsset } from '@/types'
import type { DirectorNode } from '@/types/director'
import { isShotData } from '@/types/director'

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
    // 캐릭터 = 턴어라운드 시트 1장(#7·#9): main(시트)만 확인. 방향뷰 개별 생성 폐기.
    if (c.views.main == null) gaps.push({ label: `${c.name}: 이미지 없음` })
  }
  for (const w of worlds) {
    // 배경 = 이미지 1장(#6·#9): wide 만 확인. establishing 폐기.
    if (w.wideShot == null) gaps.push({ label: `${w.name}: 배경 이미지 없음` })
  }
  return gaps
}

/** #ref-gate: 연결된 인물의 시트 유무를 store 없이 판정하려고 호출부가 주는 조회자. */
export interface DirectorGapAssets {
  hasCharacterImage: (characterId: string) => boolean
  characterName: (characterId: string) => string
  /** #ledger: 상태 변화를 보여주는 샷이 없는 항목의 라벨(씬·인물·변화) — 호출부가 scenes.stage.ledger 에서 만든다. */
  ledgerGaps?: string[]
}

/** Director 누락: 샷에 캐릭터·배경 참조가 없거나, 연결된 인물의 시트가 없거나, 스토리보드가 아직 안 만들어진 것들. */
export function getDirectorGaps(nodes: DirectorNode[], assets?: DirectorGapAssets): CompletenessGap[] {
  const gaps: CompletenessGap[] = []
  for (const label of assets?.ledgerGaps ?? []) gaps.push({ label })
  for (const n of nodes) {
    if (!isShotData(n.data)) continue
    const d = n.data
    if (d.characterAssetIds.length === 0 && d.worldAssetIds.length === 0) {
      gaps.push({ label: `${d.label}: 캐릭터·배경 참조 없음` })
      continue
    }
    // #ref-gate(2026-09-02, 실측 겨울_4): 연결은 됐는데 시트가 없는 인물은 실사에서 목각 인형으로 남는다 —
    //   옛 검사는 "참조가 둘 다 없음"만 봐서 이 경우를 놓쳤다.
    const noSheet = assets ? d.characterAssetIds.filter((id) => !assets.hasCharacterImage(id)) : []
    if (noSheet.length > 0) {
      gaps.push({ label: `${d.label}: 시트 없는 인물 — ${noSheet.map((id) => assets!.characterName(id)).join(', ')}` }) // i18n-ok: 누락 넛지 라벨 — 이 파일의 기존 라벨과 같은 관행(채팅 제안 본문)
      continue
    }
    if (d.storyboardImage?.status !== 'completed') gaps.push({ label: `${d.label}: 스토리보드 미생성` })
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

const LEDGER_POSTURE_KO: Record<string, string> = {
  standing: '섬', sitting: '앉음', kneeling: '무릎', crouching: '웅크림', lying: '누움', // i18n-ok: 무대 장부 라벨
  walking: '걸음', running: '달림', floating: '부유', other: '기타', // i18n-ok: 무대 장부 라벨
}
/** #ledger: scenes.stage.ledger 에서 "보여주는 샷이 없는 변화"를 사람 말 라벨로. */
export function ledgerGapLabels(
  sceneLedgers: Record<string, { transitions: Array<{ character_id: string; beat: number; kind: string; from: string; to: string; covered: boolean; distance_m?: number }> }> | null | undefined,
  characterName: (id: string) => string,
): string[] {
  const out: string[] = []
  for (const [sceneId, ledger] of Object.entries(sceneLedgers ?? {})) {
    for (const t of ledger?.transitions ?? []) {
      if (t.covered) continue
      const change =
        t.kind === 'posture'
          ? `${LEDGER_POSTURE_KO[t.from] ?? t.from}→${LEDGER_POSTURE_KO[t.to] ?? t.to}`
          : `이동 ${t.distance_m ?? '?'}m` // i18n-ok: 무대 장부 라벨
      out.push(`${sceneId} 비트 ${t.beat}: ${characterName(t.character_id)} ${change} — 보여주는 샷 없음`) // i18n-ok: 무대 장부 라벨
    }
  }
  return out
}
