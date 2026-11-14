// 개발자용 원본 id 라벨(sc_02 · shot_8 · sh_03_13)을 사람이 읽는 표기(Scene 2 · Shot 8)로.
//   표시 전용 변환(#e4 2026-07-13) — data.label(원본)은 편집·저장·매칭 경로에서 그대로 유지된다.
//   패턴 밖 라벨(사용자 커스텀 이름)은 무변환 통과.
// 오너 2026-11-14 답 7 "언어가 한국어일 때는 한국어로 영어일 때는 영어로 해줘. 이 규칙은 전역으로": 이름은 화면 언어로 짓는다 —
//   한국어 화면 "씬 2" · "샷 8", 영어 화면 "Scene 2" · "Shot 8"(8/26 의 로케일 무관 단일형을 바꿈). 말은 lib/board-names 가 고른다.
//   보드 이름표(boardNodeNames)가 언어를 들고 다니고, 그 이름표로 짓는 이름(카드 · 노드 · 상세 · 멘션 · Lumi 목록)이 다 같이 따른다.
// 오너 2026-11-02 "전체 번호로 통일": Writer 에서 온 씬 · 샷은 id 숫자가 아니라 보드와 같은 번호로 부른다 — directorNodeLabel.
//   id 숫자는 씬 · 샷을 끼워 넣거나 지우면 보드와 어긋난다. 셈은 보드의 boardShots 하나다.
import type { SceneShotMentionTarget } from '@/lib/card-mention'
import { sceneName, sceneShotName, shotName } from '@/lib/board-names'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { boardShots } from '@/lib/writer/board-summary'
import type { DirectorNodeData } from '@/types/director'

/** 원래 id 라벨의 번호(sc_02 → 씬 2, shot_8 · sh_03_13 · take_v1 → 샷 8 · 13 · 1). 패턴 밖이면 null. */
function idLabelNo(label: string): { kind: 'scene' | 'shot'; no: number } | null {
  const raw = label.trim()
  const scene = /^sc[_-]0*(\d+)$/i.exec(raw)
  if (scene) return { kind: 'scene', no: Number(scene[1]) }
  const shot = /^shot[_-]0*(\d+)$/i.exec(raw)
  if (shot) return { kind: 'shot', no: Number(shot[1]) }
  // writer 산출 샷 id: sh_{scene}_{n} → 씬 컨텍스트는 그룹 헤더가 보여주므로 샷 번호만.
  const writerShot = /^sh[_-]0*(\d+)[_-]0*(\d+)$/i.exec(raw)
  if (writerShot) return { kind: 'shot', no: Number(writerShot[2]) }
  // 영상 테이크 라벨: take_v1 → Shot 1 (#e10 2026-07-14 — SHOT VIDEO 카드 표기 요청)
  const take = /^take[_-]?v0*(\d+)$/i.exec(raw)
  if (take) return { kind: 'shot', no: Number(take[1]) }
  return null
}

export function prettyNodeLabel(label: string, locale: AppLocale): string {
  const id = idLabelNo(label)
  if (id) return id.kind === 'scene' ? sceneName(locale, id.no) : shotName(locale, id.no)
  // Director 에서 만든 노드의 기본 이름(DB 에 이 글자로 저장된다) — 보일 때만 화면 언어로(DB 는 그대로).
  const raw = label.trim()
  if (raw === 'New Shot') return translate(locale, 'New Shot')
  if (raw === 'New Scene') return translate(locale, 'New Scene')
  return label
}

/** 보드 이름표 한 칸 — name 은 카드에 쓰는 이름("샷 8" · "Shot 8"), label 은 씬 맥락 없이 부르는 전체 이름("씬 2 · 샷 8"),
 *  no 는 보드 번호(씬 순서 · 샷 전체 번호 — 말과 상관없이 Lumi 실행 줄 · 채팅이 쓴다). */
interface BoardNodeName {
  name: string
  label: string
  order: number
  no: number
}

/** Writer 씬 · 샷 id → 보드와 같은 이름과 순서. locale = 이름을 지은 말(그 이름이 들어갈 글의 언어). */
export interface BoardNodeNames {
  locale: AppLocale
  scenes: ReadonlyMap<string, BoardNodeName>
  shots: ReadonlyMap<string, BoardNodeName>
}

export function boardNodeNames(
  manifest: { scenes: ReadonlyArray<{ sceneId: string }> } | null | undefined,
  shots: ReadonlyArray<{ shotId: string; sceneId: string }>,
  locale: AppLocale,
): BoardNodeNames {
  return {
    locale,
    scenes: new Map((manifest?.scenes ?? []).map((scene, order) => {
      const name = sceneName(locale, order + 1)
      return [scene.sceneId, { name, label: name, order, no: order + 1 }]
    })),
    shots: new Map(boardShots(manifest, shots).map((entry, order) => [
      entry.shot.shotId,
      { name: shotName(locale, entry.shotNo), label: sceneShotName(locale, entry.sceneNo, entry.shotNo), order, no: entry.shotNo },
    ])),
  }
}

type NamedNodeData = Pick<DirectorNodeData, 'label'> & { writerSceneId?: unknown; writerShotId?: unknown }

/** 보드의 씬 · 샷이면 그 이름표 — 이름을 바꾼 노드(라벨 ≠ Writer id)나 Director 에서 만든 노드는 보드에 없다. */
function boardEntry(data: NamedNodeData, names: BoardNodeNames | null | undefined): BoardNodeName | null {
  if (!names) return null
  if (typeof data.writerShotId === 'string' && data.label === data.writerShotId) return names.shots.get(data.writerShotId) ?? null
  if (typeof data.writerSceneId === 'string' && data.label === data.writerSceneId) return names.scenes.get(data.writerSceneId) ?? null
  return null
}

/** 이름표가 없을 때(보드를 모름 — 시험 · 옛 호출) 원래 id 를 바꾸는 말. 화면 코드는 늘 이름표를 넘긴다. */
const NO_NAMES_LOCALE: AppLocale = 'en'

/** Director 노드 이름 — 보드의 씬 · 샷이면 보드 번호("씬 2" · "샷 8"), 아니면 지금 이름(prettyNodeLabel). 말은 이름표의 언어. */
export function directorNodeLabel(data: NamedNodeData, names: BoardNodeNames | null | undefined): string {
  return boardEntry(data, names)?.name ?? prettyNodeLabel(data.label, names?.locale ?? NO_NAMES_LOCALE)
}

/** 채팅 모델에게 보이는 보드 전체 이름("씬 2 · 샷 8") — 보드에 없으면 null. */
export function directorBoardLabel(data: NamedNodeData, names: BoardNodeNames | null | undefined): string | null {
  return boardEntry(data, names)?.label ?? null
}

/** 보드 번호 — 보드의 씬 · 샷이면 그 번호, 원래 id 라벨(sc_03 · shot_7)이면 그 숫자, 사람이 지은 이름이면 null. 이름의 말과 상관없다
 *  (Lumi 실행 줄이 화면 이름을 다시 읽어 번호를 얻던 것 — 이름이 "샷 3"이 되면 번호를 잃었다, 2026-11-14). */
export function directorBoardNo(data: NamedNodeData, names: BoardNodeNames | null | undefined): number | null {
  const entry = boardEntry(data, names)
  if (entry) return entry.no
  const id = idLabelNo(data.label)
  if (id) return id.no
  // 이름 자체가 "Shot 3" · "샷 3"인 노드(예전 셈과 같게 — 예전에는 화면 이름 "Shot 3"을 다시 읽었다).
  const named = /^(?:Shot|Scene|샷|씬) (\d+)$/.exec(data.label.trim()) // i18n-ok: 두 말의 이름 꼴을 읽는다
  return named ? Number(named[1]) : null
}

/** 씬 맥락 없이 쓰는 이름(지우기 확인 창 · 그림 대체 글) — 보드의 샷은 "씬 2 · 샷 8", 씬은 "씬 2", 그 밖은 지금 이름. */
export function directorFullLabel(data: NamedNodeData, names: BoardNodeNames | null | undefined): string {
  return directorBoardLabel(data, names) ?? prettyNodeLabel(data.label, names?.locale ?? NO_NAMES_LOCALE)
}

/** 보드 순서로 늘어놓는다 — Writer 에서 온 씬 · 샷은 보드 순서(이름을 바꿨어도 Writer id 의 자리 — 리뷰 3차 L5),
 *  나머지는 원래 순서대로 뒤에(안정 정렬). */
export function sortByBoard<N extends { data: NamedNodeData }>(nodes: readonly N[], names: BoardNodeNames | null | undefined): N[] {
  const rank = (node: N) => {
    const { writerShotId, writerSceneId } = node.data
    const entry = typeof writerShotId === 'string' ? names?.shots.get(writerShotId) : typeof writerSceneId === 'string' ? names?.scenes.get(writerSceneId) : undefined
    return entry?.order ?? Number.POSITIVE_INFINITY
  }
  return [...nodes].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    return ra === rb ? 0 : ra < rb ? -1 : 1
  })
}

/** Director 채팅 @멘션 대상 — 씬 · 샷 노드를 보드와 같은 이름으로. */
export function directorMentionTargets(
  nodes: ReadonlyArray<{ id: string; data: DirectorNodeData }>,
  names: BoardNodeNames | null | undefined,
): SceneShotMentionTarget[] {
  return nodes.flatMap((node): SceneShotMentionTarget[] => {
    if (node.data.kind === 'scene') return [{ kind: 'scene', id: node.id, label: directorNodeLabel(node.data, names) }]
    if (node.data.kind === 'shot') return [{ kind: 'shot', id: node.id, label: directorNodeLabel(node.data, names) }]
    return []
  })
}
