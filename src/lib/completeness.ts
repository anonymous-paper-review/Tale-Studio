// 스테이지별 "완성도" 모델 (chat-proactive-copilot Phase 4 — 누락 감지 제안의 연료).
//
// 순수 함수만 — store/네트워크 의존 없음. 채팅 프로액티브 넛지가 "뭐가 비었는지"를
// 사람이 읽을 수 있는 문장으로 만들 때 쓴다. 생성을 트리거하지 않는다(비용 무발생).
//
// 라벨은 넛지를 띄우는 화면의 언어로 쓴다(2026-11-10 오너 "영어 언어에서 한국어 나오는거 수정") — 언어를 안 넘기는 옛 호출은 종전처럼 한국어.
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import type { CharacterAsset, WorldAsset } from '@/types'
import type { DirectorNode } from '@/types/director'
import { isShotData } from '@/types/director'

const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

export interface CompletenessGap {
  /** 사람이 읽는 한 줄 설명 */
  label: string
}

/** Artist 누락: 캐릭터 대표/방향뷰, 월드 wide/establishing 이 비어있는 것들. */
export function getArtistGaps(
  characters: CharacterAsset[],
  worlds: WorldAsset[],
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): CompletenessGap[] {
  const gaps: CompletenessGap[] = []
  for (const c of characters) {
    // 캐릭터 = 턴어라운드 시트 1장(#7·#9): main(시트)만 확인. 방향뷰 개별 생성 폐기.
    if (c.views.main == null) gaps.push({ label: translate(locale, '{name}: no image', { name: c.name }) })
  }
  for (const w of worlds) {
    // 배경 = 이미지 1장(#6·#9): wide 만 확인. establishing 폐기.
    if (w.wideShot == null) gaps.push({ label: translate(locale, '{name}: no background image', { name: w.name }) })
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
export function getDirectorGaps(
  nodes: DirectorNode[],
  assets?: DirectorGapAssets,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): CompletenessGap[] {
  const gaps: CompletenessGap[] = []
  for (const label of assets?.ledgerGaps ?? []) gaps.push({ label })
  for (const n of nodes) {
    if (!isShotData(n.data)) continue
    const d = n.data
    if (d.characterAssetIds.length === 0 && d.worldAssetIds.length === 0) {
      gaps.push({ label: translate(locale, '{name}: no character or background reference', { name: d.label }) })
      continue
    }
    // #ref-gate(2026-09-02, 실측 겨울_4): 연결은 됐는데 시트가 없는 인물은 실사에서 목각 인형으로 남는다 —
    //   옛 검사는 "참조가 둘 다 없음"만 봐서 이 경우를 놓쳤다.
    const noSheet = assets ? d.characterAssetIds.filter((id) => !assets.hasCharacterImage(id)) : []
    if (noSheet.length > 0) {
      const characters = noSheet.map((id) => assets!.characterName(id)).join(', ')
      gaps.push({ label: translate(locale, '{name}: no sheet for {characters}', { name: d.label, characters }) })
      continue
    }
    if (d.storyboardImage?.status !== 'completed') gaps.push({ label: translate(locale, '{name}: no storyboard yet', { name: d.label }) })
  }
  return gaps
}

/** 갭 목록을 채팅 메시지용 요약 문자열로 (상위 max건 + 나머지 개수). */
export function summarizeGaps(gaps: CompletenessGap[], max = 3, locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK): string {
  const shown = gaps
    .slice(0, max)
    .map((g) => `• ${g.label}`)
    .join('\n')
  const extra = gaps.length > max ? `\n${translate(locale, '…and {count} more', { count: gaps.length - max })}` : ''
  return shown + extra
}

const LEDGER_POSTURE_KO: Record<string, string> = {
  standing: '섬', sitting: '앉음', kneeling: '무릎', crouching: '웅크림', lying: '누움', // i18n-ok: 무대 장부 라벨
  walking: '걸음', running: '달림', floating: '부유', other: '기타', // i18n-ok: 무대 장부 라벨
}
/** #ledger: scenes.stage.ledger 에서 "보여주는 샷이 없는 변화"를 사람 말 라벨로.
 *  영어는 장부 값(lying · standing)을 그대로 쓴다. 한국어 라벨은 시험이 글자로 못 박아 둔 그대로 둔다(긴 대시 포함, 사전에 못 올린다 — 결정 대기). */
export function ledgerGapLabels(
  sceneLedgers: Record<string, { transitions: Array<{ character_id: string; beat: number; kind: string; from: string; to: string; covered: boolean; distance_m?: number }> }> | null | undefined,
  characterName: (id: string) => string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): string[] {
  const out: string[] = []
  for (const [sceneId, ledger] of Object.entries(sceneLedgers ?? {})) {
    for (const t of ledger?.transitions ?? []) {
      if (t.covered) continue
      if (locale === 'en') {
        const move = t.kind === 'posture' ? `${t.from}→${t.to}` : `moves ${t.distance_m ?? '?'} m`
        out.push(`${sceneId} beat ${t.beat}: ${characterName(t.character_id)} ${move}, no shot shows it`)
        continue
      }
      const change =
        t.kind === 'posture'
          ? `${LEDGER_POSTURE_KO[t.from] ?? t.from}→${LEDGER_POSTURE_KO[t.to] ?? t.to}`
          : `이동 ${t.distance_m ?? '?'}m` // i18n-ok: 무대 장부 라벨
      out.push(`${sceneId} 비트 ${t.beat}: ${characterName(t.character_id)} ${change} — 보여주는 샷 없음`) // i18n-ok: 무대 장부 라벨
    }
  }
  return out
}
