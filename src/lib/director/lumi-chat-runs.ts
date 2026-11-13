// Director 에서 Lumi 에게 말로 부탁한 일을 바로 실행할 때 쓰는 순수 셈(오너 2026-11-14 9번).
//   - 샷마다 보드 번호 · 이미지 준비 · 영상 실패(영상 막이 · 칩이 쓴다)
//   - Lumi 가 낸 고침을 글(전후 비교 뒤 [적용])과 설정(바로)으로 나누기 — "끝난 결과가 글이면 전후 비교 후 변화 채택"
//   - 샷 이름 줄("샷 1·2" · "Shots 1 · 2")과 전후 비교 줄
//   약속: tests/director/lumi-chat-runs.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { effectivePromptOf } from '@/lib/director/video-frame-inputs'
import type { BoardNodeNames } from '@/features/director/node-label'
import { directorNodeLabel } from '@/features/director/node-label'
import type { DirectorCanvasUpdate } from '@/stores/director-store'
import { isSceneData, isShotData, isVideoData, type DirectorNode } from '@/types/director'
import type { ChatShotRef } from '@/lib/director/chat-video-targets'

/** 보드 번호("Shot 8" → 8). 보드에 없는 샷(Director 에서 만든 것 · 이름을 바꾼 것)은 null. */
function boardNo(node: DirectorNode, names: BoardNodeNames | null): number | null {
  const name = directorNodeLabel(node.data, names)
  const match = /^(?:Shot|Scene) (\d+)$/.exec(name)
  return match ? Number(match[1]) : null
}

/** 샷마다 보드 번호 · 이미지 준비 · 영상 실패(완성 Take 가 없고 마지막 시도가 실패, 만드는 중이 아님). */
export function directorShotRefs(nodes: readonly DirectorNode[], names: BoardNodeNames | null): ChatShotRef[] {
  const takes = new Map<string, DirectorNode[]>()
  for (const node of nodes) {
    if (!isVideoData(node.data) || node.data.parentShotNodeId === null) continue
    takes.set(node.data.parentShotNodeId, [...(takes.get(node.data.parentShotNodeId) ?? []), node])
  }
  return nodes.flatMap((node) => {
    if (!isShotData(node.data)) return []
    const image = node.data.storyboardImage
    const own = (takes.get(node.id) ?? []).flatMap((take) => (isVideoData(take.data) ? [take.data] : []))
    const playable = own.some((take) => take.status === 'completed' && !!take.videoUrl)
    const making = own.some((take) => take.status === 'generating' || take.lastAttemptStatus === 'generating')
    const failed = own.some((take) => take.lastAttemptStatus === 'failed' || (take.lastAttemptStatus == null && take.status === 'failed'))
    return [{
      nodeId: node.id,
      shotNo: boardNo(node, names),
      imageReady: image?.status === 'completed' && !!image.url,
      videoFailed: !playable && !making && failed,
    }]
  })
}

/** "Shot 3" · "Shots 1 · 2" / "샷 3" · "샷 1·2" — 보드 번호가 없는 샷은 지금 이름으로. */
export function shotListLabel(locale: AppLocale, labels: readonly (number | string)[]): string {
  const sep = locale === 'ko' ? '·' : ' · '
  if (labels.length === 1) {
    const only = labels[0]
    return typeof only === 'number' ? translate(locale, 'Shot {n}', { n: only }) : String(only)
  }
  return translate(locale, 'Shots {list}', { list: labels.join(sep) })
}

/** 노드 하나의 보이는 이름 — 보드 번호가 있으면 그 번호, 없으면 지금 이름. */
export function shotLabelOf(node: DirectorNode | undefined, names: BoardNodeNames | null): number | string {
  if (!node) return '?'
  return boardNo(node, names) ?? directorNodeLabel(node.data, names)
}

export type DirectorTextField = 'label' | 'prompt' | 'location' | 'timeOfDay' | 'mood' | 'description'

export interface DirectorTextEdit {
  nodeId: string
  kind: 'shot' | 'scene'
  field: DirectorTextField
  before: string
  after: string
}

const SHOT_TEXT: readonly DirectorTextField[] = ['label', 'prompt']
const SCENE_TEXT: readonly DirectorTextField[] = ['label', 'location', 'timeOfDay', 'mood', 'description']

/** 지금 글 — 샷 프롬프트는 사용자 고침 > Writer 파생 > 옛 값. */
export function currentDirectorText(node: DirectorNode, field: DirectorTextField): string {
  if (isShotData(node.data)) return field === 'prompt' ? effectivePromptOf(node.data) : field === 'label' ? node.data.label : ''
  if (isSceneData(node.data)) return String((node.data as unknown as Record<string, unknown>)[field] ?? '')
  return ''
}

/**
 * Lumi 의 고침을 나눈다 — 이미 있는 샷 · 씬의 글(샷 이름 · 프롬프트, 씬 이름 · 장소 · 시간 · 분위기 · 설명)은 전후 비교로(edits),
 *   나머지(설정 · 연결 · 새 노드 · 같은 답에서 만든 새 노드의 글)는 바로(immediate). 바뀌지 않는 글은 버린다.
 */
export function splitDirectorTextEdits(
  updates: readonly DirectorCanvasUpdate[],
  nodes: readonly DirectorNode[],
): { immediate: DirectorCanvasUpdate[]; edits: DirectorTextEdit[] } {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const immediate: DirectorCanvasUpdate[] = []
  const edits: DirectorTextEdit[] = []
  for (const update of updates) {
    if (update.type !== 'updateShot' && update.type !== 'updateScene') {
      immediate.push(update)
      continue
    }
    const node = byId.get(update.id)
    const kind = update.type === 'updateShot' ? 'shot' : 'scene'
    if (!node || (kind === 'shot' ? !isShotData(node.data) : !isSceneData(node.data))) {
      immediate.push(update)
      continue
    }
    const textFields = kind === 'shot' ? SHOT_TEXT : SCENE_TEXT
    const rest: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(update.patch)) {
      if ((textFields as readonly string[]).includes(key) && typeof value === 'string') {
        const before = currentDirectorText(node, key as DirectorTextField)
        if (before !== value) edits.push({ nodeId: node.id, kind, field: key as DirectorTextField, before, after: value })
      } else {
        rest[key] = value
      }
    }
    if (Object.keys(rest).length > 0) immediate.push({ ...update, patch: rest } as DirectorCanvasUpdate)
  }
  return { immediate, edits }
}

/**
 * 글 고침이 걸린 샷(노드 id) — 그 샷의 글을 고치거나, 그 샷이 속한 씬의 글을 고친다. 같은 답의 그림 · 영상이 이 샷이면 바로 만들지 않고
 *   글 카드 [적용]을 기다린다 — 옛 글로 만들어 Take 를 쓰지 않게(검토 b 보통 1).
 */
export function textBoundShotIds(edits: readonly DirectorTextEdit[], nodes: readonly DirectorNode[]): Set<string> {
  const scenes = new Set(edits.filter((edit) => edit.kind === 'scene').map((edit) => edit.nodeId))
  const out = new Set(edits.filter((edit) => edit.kind === 'shot').map((edit) => edit.nodeId))
  for (const node of nodes) {
    if (isShotData(node.data) && node.data.parentSceneNodeId && scenes.has(node.data.parentSceneNodeId)) out.add(node.id)
  }
  return out
}

const FIELD_NAME: Record<DirectorTextField, string> = {
  label: 'name',
  prompt: 'prompt',
  location: 'place',
  timeOfDay: 'time of day',
  mood: 'mood',
  description: 'description',
}

const clip = (text: string) => (text.length > 160 ? `${text.slice(0, 157)}...` : text)

/** 전후 비교 줄 — "Shot 1 prompt · before: …" / "샷 1 프롬프트 · 전: …". */
export function directorTextEditLines(
  locale: AppLocale,
  edits: readonly DirectorTextEdit[],
  nodes: readonly DirectorNode[],
  names: BoardNodeNames | null,
): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return edits.flatMap((edit) => {
    const node = byId.get(edit.nodeId)
    const label = edit.kind === 'shot'
      ? shotListLabel(locale, [shotLabelOf(node, names)])
      : (() => {
          const no = node ? boardNo(node, names) : null
          return no !== null ? translate(locale, 'Scene {n}', { n: no }) : node ? directorNodeLabel(node.data, names) : '?'
        })()
    const name = `${label} ${translate(locale, FIELD_NAME[edit.field])}`
    return [
      translate(locale, '{name} · before: {text}', { name, text: clip(edit.before) || translate(locale, '(empty)') }),
      translate(locale, '{name} · after: {text}', { name, text: clip(edit.after) || translate(locale, '(empty)') }),
    ]
  })
}
