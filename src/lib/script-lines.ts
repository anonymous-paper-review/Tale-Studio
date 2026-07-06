// Writer 스크립트 라인맵 파생 모듈.
// 뷰어 라인번호, @L 멘션 ref, 채팅 컨텍스트의 [L#] 주석을 같은 순수 함수에서 만든다.
import type { CardMention } from '@/lib/card-mention'
import type { DialogueLine, Scene, SceneManifest, Shot } from '@/types'

export type ScriptLineKind = 'sceneHeading' | 'action' | 'dialogue'

export interface ScriptLine {
  lineNo: number
  kind: ScriptLineKind
  ref: string
  text: string
  sceneId: string
  shotId?: string
  characterName?: string
}

export interface LineRef {
  label: string
  ref: string
  kind: ScriptLineKind
}

const KIND_HINTS: Record<ScriptLineKind, string> = {
  sceneHeading: '씬',
  action: '액션',
  dialogue: '대사',
}

function sceneHeadingText(scene: Scene): string {
  const location = scene.location || '?'
  const mood = scene.mood?.trim()
  return `${scene.sceneId} — ${location}${mood ? ` · ${mood}` : ''}`
}

function characterNameOf(manifest: SceneManifest | null, characterId: string): string {
  return manifest?.characters.find((c) => c.characterId === characterId)?.name ?? characterId
}

function characterRef(manifest: SceneManifest | null, characterId: string): string {
  const name = characterNameOf(manifest, characterId)
  return name === characterId ? characterId : `${characterId}(${name})`
}

function dialogueLinesOf(shot: Shot): DialogueLine[] {
  return Array.isArray(shot.dialogueLines) ? shot.dialogueLines : []
}

export function buildScriptLines(
  manifest: SceneManifest | null,
  shots: Shot[],
): ScriptLine[] {
  const scenes = manifest?.scenes ?? []
  if (scenes.length === 0 && shots.length === 0) return []

  const lines: ScriptLine[] = []
  const seenSceneIds = new Set<string>()
  // 오염 입력 방어: 중복 shotId 는 첫 샷만 라인화 — ref(`sh_x.action`)가 두 라인을 가리키는 모호성 차단.
  const seenShotIds = new Set<string>()
  let lineNo = 1

  const pushShotLines = (shot: Shot) => {
    if (seenShotIds.has(shot.shotId)) return
    seenShotIds.add(shot.shotId)
    lines.push({
      lineNo: lineNo++,
      kind: 'action',
      ref: `${shot.shotId}.action`,
      text: shot.actionDescription || '(설명 없음)',
      sceneId: shot.sceneId,
      shotId: shot.shotId,
    })

    dialogueLinesOf(shot).forEach((dialogue, index) => {
      const characterName = characterNameOf(manifest, dialogue.characterId)
      lines.push({
        lineNo: lineNo++,
        kind: 'dialogue',
        ref: `${shot.shotId}.dialogue[${index}]`,
        text: dialogue.text,
        sceneId: shot.sceneId,
        shotId: shot.shotId,
        characterName,
      })
    })
  }

  for (const scene of scenes) {
    seenSceneIds.add(scene.sceneId)
    lines.push({
      lineNo: lineNo++,
      kind: 'sceneHeading',
      ref: `${scene.sceneId}.heading`,
      text: sceneHeadingText(scene),
      sceneId: scene.sceneId,
    })

    for (const shot of shots.filter((s) => s.sceneId === scene.sceneId)) {
      pushShotLines(shot)
    }
  }

  for (const shot of shots.filter((s) => !seenSceneIds.has(s.sceneId))) {
    pushShotLines(shot)
  }

  return lines
}

export function scriptLineMentions(lines: ScriptLine[]): CardMention[] {
  return lines.map((line) => ({
    ref: line.ref,
    label: `L${line.lineNo}`,
    hint: KIND_HINTS[line.kind],
  }))
}

function lineMap(lines: ScriptLine[]): Map<string, ScriptLine> {
  return new Map(lines.map((line) => [line.ref, line]))
}

function lineLabel(line: ScriptLine | undefined): string {
  return line ? `[L${line.lineNo}] ` : ''
}

export function serializeWriterScriptContext(
  manifest: SceneManifest | null,
  shots: Shot[],
  precomputedLines?: ScriptLine[],
): string {
  const scenes = manifest?.scenes ?? []
  if (scenes.length === 0 && shots.length === 0) return '## 현재 씬/샷\n(아직 없음)'

  const scriptLines = precomputedLines ?? buildScriptLines(manifest, shots)
  const byRef = lineMap(scriptLines)
  const sceneIds = new Set(scenes.map((scene) => scene.sceneId))
  const lines: string[] = [
    '## 현재 씬/샷 (scene_id·shot_id 를 그대로 사용, [L#] = 스크립트 라인 번호)',
  ]
  const roster = manifest?.characters ?? []
  if (roster.length > 0) {
    lines.push(
      '\n## 등장인물 (dialogueLines[].characterId·characters[]·charactersPresent[] 에는 이름이 아니라 이 characterId 를 쓴다)',
      ...roster.map((c) => `- ${c.characterId} — ${c.name}`),
    )
  }

  for (const scene of scenes) {
    const present =
      (scene.charactersPresent ?? []).map((id) => characterRef(manifest, id)).join(', ') || '없음'
    const heading = byRef.get(`${scene.sceneId}.heading`)
    lines.push(
      `\n### ${lineLabel(heading)}${scene.sceneId} — 장소:${scene.location || '?'} / ${scene.timeOfDay || '?'} / 분위기:${scene.mood || '?'} (등장: ${present})`,
    )
    if (scene.narrativeSummary) lines.push(`  요약: ${scene.narrativeSummary}`)

    for (const shot of shots.filter((s) => s.sceneId === scene.sceneId)) {
      pushShotContextLines(lines, byRef, manifest, shot)
    }
  }

  const orphan = shots.filter((shot) => !sceneIds.has(shot.sceneId))
  if (orphan.length > 0) {
    lines.push('\n### (씬 미배정 샷)')
    for (const shot of orphan) {
      pushShotContextLines(lines, byRef, manifest, shot)
    }
  }

  return lines.join('\n')
}

function pushShotContextLines(
  lines: string[],
  byRef: Map<string, ScriptLine>,
  manifest: SceneManifest | null,
  shot: Shot,
): void {
  const action = byRef.get(`${shot.shotId}.action`)
  const chars =
    (shot.characters ?? []).map((id) => characterRef(manifest, id)).join(', ') || '없음'
  lines.push(
    `  - ${lineLabel(action)}${shot.shotId} [${shot.shotType}] ${shot.actionDescription || '(설명 없음)'} (등장: ${chars}, ${shot.durationSeconds}s)`,
  )

  dialogueLinesOf(shot).forEach((dialogue, index) => {
    const line = byRef.get(`${shot.shotId}.dialogue[${index}]`)
    const speaker = characterRef(manifest, dialogue.characterId)
    lines.push(`    ${lineLabel(line)}대사[${index}] ${speaker}: "${dialogue.text}"`)
  })
}

export function resolveLineRefs(text: string, lines: ScriptLine[]): LineRef[] {
  if (!lines.length) return []

  const byLineNo = new Map(lines.map((line) => [line.lineNo, line]))
  const seen = new Set<number>()
  const refs: LineRef[] = []
  const token = /(?:@?\b)L(\d+)\b/g
  let match: RegExpExecArray | null

  while ((match = token.exec(text)) !== null) {
    // 선행 0 앨리어스(L01→L1) 거부 — 표시 라벨과 1:1 인 정규 표기만 해석한다.
    if (match[1].startsWith('0')) continue
    const lineNo = Number.parseInt(match[1], 10)
    if (seen.has(lineNo)) continue
    const line = byLineNo.get(lineNo)
    if (!line) continue
    seen.add(lineNo)
    refs.push({
      label: `L${line.lineNo}`,
      ref: line.ref,
      kind: line.kind,
    })
  }

  return refs
}
