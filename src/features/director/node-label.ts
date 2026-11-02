// 개발자용 원본 id 라벨(sc_02 · shot_8 · sh_03_13)을 사람이 읽는 표기(Scene 2 · Shot 8)로.
//   표시 전용 변환(#e4 2026-07-13) — data.label(원본)은 편집·저장·매칭 경로에서 그대로 유지된다.
//   패턴 밖 라벨(사용자 커스텀 이름)은 무변환 통과.
// #internal-id-scrub(2026-08-26, 오너 확정): 표기는 로케일 무관 "Scene N"/"Shot N" 단일형 —
//   한국어 UI 도 동일(오너 지시). 매칭 키(멘션 라벨)와 표시가 같은 문자열이라 어긋남이 없다.
// 오너 2026-11-02 "전체 번호로 통일": Writer 에서 온 씬 · 샷은 id 숫자가 아니라 보드와 같은 번호로 부른다 — directorNodeLabel.
//   id 숫자는 씬 · 샷을 끼워 넣거나 지우면 보드와 어긋난다. 셈은 보드의 boardShots 하나다.
import type { SceneShotMentionTarget } from '@/lib/card-mention'
import { boardShots } from '@/lib/writer/board-summary'
import type { DirectorNodeData } from '@/types/director'

export function prettyNodeLabel(label: string): string {
  const raw = label.trim()
  const sceneWord = 'Scene'
  const shotWord = 'Shot'
  const scene = /^sc[_-]0*(\d+)$/i.exec(raw)
  if (scene) return `${sceneWord} ${Number(scene[1])}`
  const shot = /^shot[_-]0*(\d+)$/i.exec(raw)
  if (shot) return `${shotWord} ${Number(shot[1])}`
  // writer 산출 샷 id: sh_{scene}_{n} → 씬 컨텍스트는 그룹 헤더가 보여주므로 샷 번호만.
  const writerShot = /^sh[_-]0*(\d+)[_-]0*(\d+)$/i.exec(raw)
  if (writerShot) return `${shotWord} ${Number(writerShot[2])}`
  // 영상 테이크 라벨: take_v1 → Shot 1 (#e10 2026-07-14 — SHOT VIDEO 카드 표기 요청)
  const take = /^take[_-]?v0*(\d+)$/i.exec(raw)
  if (take) return `${shotWord} ${Number(take[1])}`
  return label
}

/** 보드 이름표 한 칸 — name 은 카드에 쓰는 이름("Shot 8" · "Scene 2"), label 은 채팅 모델에게 주는 전체 이름("Scene 2 · Shot 8"). */
interface BoardNodeName {
  name: string
  label: string
  order: number
}

/** Writer 씬 · 샷 id → 보드와 같은 이름과 순서. */
export interface BoardNodeNames {
  scenes: ReadonlyMap<string, BoardNodeName>
  shots: ReadonlyMap<string, BoardNodeName>
}

export function boardNodeNames(
  manifest: { scenes: ReadonlyArray<{ sceneId: string }> } | null | undefined,
  shots: ReadonlyArray<{ shotId: string; sceneId: string }>,
): BoardNodeNames {
  return {
    scenes: new Map((manifest?.scenes ?? []).map((scene, order) => [scene.sceneId, { name: `Scene ${order + 1}`, label: `Scene ${order + 1}`, order }])),
    shots: new Map(boardShots(manifest, shots).map((entry, order) => [entry.shot.shotId, { name: `Shot ${entry.shotNo}`, label: entry.label, order }])),
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

/** Director 노드 이름 — 보드의 씬 · 샷이면 보드 번호("Scene 2" · "Shot 8"), 아니면 지금 이름(prettyNodeLabel). */
export function directorNodeLabel(data: NamedNodeData, names: BoardNodeNames | null | undefined): string {
  return boardEntry(data, names)?.name ?? prettyNodeLabel(data.label)
}

/** 채팅 모델에게 보이는 보드 전체 이름("Scene 2 · Shot 8") — 보드에 없으면 null. */
export function directorBoardLabel(data: NamedNodeData, names: BoardNodeNames | null | undefined): string | null {
  return boardEntry(data, names)?.label ?? null
}

/** 씬 맥락 없이 쓰는 이름(지우기 확인 창 · 그림 대체 글) — 보드의 샷은 "Scene 2 · Shot 8", 씬은 "Scene 2", 그 밖은 지금 이름. */
export function directorFullLabel(data: NamedNodeData, names: BoardNodeNames | null | undefined): string {
  return directorBoardLabel(data, names) ?? prettyNodeLabel(data.label)
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
