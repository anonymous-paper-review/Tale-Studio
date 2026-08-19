// Writer 스크립트 라인맵 파생 모듈.
// 뷰어 라인번호, @L 멘션 ref, 채팅 컨텍스트의 [L#] 주석을 같은 순수 함수에서 만든다.
import {
  sceneShotMentions,
  type CardMention,
  type SceneShotMentionTarget,
} from '@/lib/card-mention'
import type { DialogueLine, Scene, SceneManifest, Shot } from '@/types'
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

// locale 을 안 넘기는 호출부(global-chat.tsx 의 scriptLineMentions 호출)가 조용히 안 깨지도록
//   기존 동작(항상 한국어)을 기본값으로 보존한다 — producer-gate.ts/card-mention.ts 와 동일 취급.
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

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

// 값은 영어 원문 = i18n 키(#i18n-s5-batch4). scriptLineMentions 가 translate() 로 번역해 반환한다.
const KIND_HINTS: Record<ScriptLineKind, string> = {
  sceneHeading: 'Scene',
  action: 'Action',
  dialogue: 'Dialogue',
}

// 씬 헤딩 표시 텍스트 — sceneId(SC_01 등) 노출 제거(#c11 2026-07-14). 뷰어 표시 전용이며
//   채팅 컨텍스트(serializeWriterScriptContext)는 자체 포맷으로 sceneId를 계속 명시한다.
function sceneHeadingText(scene: Scene): string {
  const location = scene.location || '?'
  const mood = scene.mood?.trim()
  return `${location}${mood ? ` · ${mood}` : ''}`
}

function characterNameOf(manifest: SceneManifest | null, characterId: string | null): string {
  if (!characterId) return 'V.O.' // 내레이션 라인 (#dialogue-v4 — characterId null)
  return manifest?.characters.find((c) => c.characterId === characterId)?.name ?? characterId
}

function characterRef(manifest: SceneManifest | null, characterId: string | null): string {
  if (!characterId) return 'V.O.' // 내레이션 — 채팅 컨텍스트에서도 화자 슬러그 없음
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface SlugEntry {
  slug: string
  name: string
}

/**
 * 표시 전용 슬러그 치환(#c13) — 텍스트 안의 엔티티 id(dr_lee·location_2 등)를 이름으로 바꾼다.
 * prefix '@'면 인라인 멘션 표기(@이름), ''면 구조 필드용 플레인 이름.
 * 데이터·멘션 ref·채팅 컨텍스트는 원문(슬러그) 유지 — 구동은 변수명, 표시는 실제 이름.
 * 로스터에 없는 슬러그는 해석 불가이므로 그대로 둔다. 대소문자 무시(CSS uppercase 표시 대비).
 */
export function replaceSlugs(
  text: string,
  entries: SlugEntry[],
  prefix: '@' | '' = '@',
): string {
  let out = text
  for (const e of entries) {
    const slug = e.slug?.trim()
    const name = e.name?.trim()
    if (!slug || !name || name === slug) continue
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(slug)}\\b`, 'gi'),
      `${prefix}${name}`,
    )
  }
  return out
}

export function scriptLineMentions(
  lines: ScriptLine[],
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): CardMention[] {
  return lines.map((line) => ({
    ref: line.ref,
    label: `L${line.lineNo}`,
    hint: translate(locale, KIND_HINTS[line.kind]),
  }))
}

/**
 * Writer 채팅에서 라인 외에 직접 참조할 수 있는 씬·샷 목록.
 * 순서와 stable id를 라벨에 함께 넣어 같은 장소/이름의 대상도 혼동하지 않는다.
 */
export function writerSceneShotMentions(
  manifest: SceneManifest | null,
  shots: readonly Shot[],
): CardMention[] {
  const scenes = manifest?.scenes ?? []
  const targets: SceneShotMentionTarget[] = scenes.map((scene) => ({
    kind: 'scene',
    id: scene.sceneId,
    label: `Scene ${scenes.indexOf(scene) + 1}`,
  }))
  const seenShots = new Set<string>()
  for (const shot of shots) {
    if (seenShots.has(shot.shotId)) continue
    seenShots.add(shot.shotId)
    const sceneIndex = scenes.findIndex((scene) => scene.sceneId === shot.sceneId)
    const position =
      sceneIndex >= 0
        ? shots.filter((candidate) => candidate.sceneId === shot.sceneId).findIndex(
            (candidate) => candidate.shotId === shot.shotId,
          ) + 1
        : 1
    targets.push({
      kind: 'shot',
      id: shot.shotId,
      label: `Shot ${sceneIndex >= 0 ? `${sceneIndex + 1}.` : ''}${position}`,
    })
  }
  return sceneShotMentions(targets, 'writer')
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
    // #p4-understand A1: 위치형 지칭("씬2의 3번째 샷") 해석 근거 — 아래 나열 순서가 곧 위치다.
    '위치 별칭: 사용자가 "씬N의 M번째 샷"처럼 위치로 지칭하면, 아래 씬 순서(### 표기의 씬N)와 그 씬 안 샷 나열 순서로 대응하는 shot_id 를 찾아 사용한다.',
  ]
  const roster = manifest?.characters ?? []
  if (roster.length > 0) {
    lines.push(
      '\n## 등장인물 (dialogueLines[].characterId·characters[]·charactersPresent[] 에는 이름이 아니라 이 characterId 를 쓴다)',
      ...roster.map((c) => `- ${c.characterId} — ${c.name}`),
    )
  }

  for (const [sceneIdx, scene] of scenes.entries()) {
    const present =
      (scene.charactersPresent ?? []).map((id) => characterRef(manifest, id)).join(', ') || '없음'
    const heading = byRef.get(`${scene.sceneId}.heading`)
    lines.push(
      `\n### ${lineLabel(heading)}${scene.sceneId} (씬${sceneIdx + 1}) — 장소:${scene.location || '?'} / ${scene.timeOfDay || '?'} / 분위기:${scene.mood || '?'} (등장: ${present})`,
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
