// Writer 스크립트 라인맵 파생 모듈.
// 뷰어 라인번호, @L 멘션 ref, 채팅 컨텍스트의 [L#] 주석을 같은 순수 함수에서 만든다.
import {
  sceneShotMentions,
  type CardMention,
  type SceneShotMentionTarget,
} from '@/lib/card-mention'
import type { DialogueLine, Scene, SceneManifest, Shot } from '@/types'
import { fixKoreanParticles } from '@/lib/korean-particles'
import { collapseDoubledArticles, insideWrittenName, keyRule, writtenNameSpans } from '@/lib/writer/resolve-entity-names'
import { boardShotLabels, boardShots } from '@/lib/writer/board-summary'
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

// locale 을 안 넘기는 호출부가 조용히 안 깨지도록 기존 동작(항상 한국어)을 기본값으로 보존한다 —
//   producer-gate.ts/card-mention.ts 와 동일 취급. 채팅 고르기(global-chat.tsx)는 2026-11-10 부터 화면 언어를 넘긴다.
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
 * 이미 이름이 쓰인 자리 안의 슬러그 낱말은 다시 바꾸지 않고, 관사로 시작하는 이름 앞에 겹친 관사는 하나로 걷는다
 * (qa1110 C12 "The The Keeper" — resolveEntityNames 와 같은 규칙).
 */
export function replaceSlugs(
  text: string,
  entries: SlugEntry[],
  prefix: '@' | '' = '@',
): string {
  // #names-in-prose(2026-09-08): 긴 슬러그부터 — 'char_2' 가 'char' 로 오인되지 않게. 치환 뒤 한국어 조사를 맞춘다.
  //   한 번에 바꾼다 — 앞에서 넣은 이름 안의 낱말을 뒤의 짧은 슬러그가 또 바꾸지 않게.
  //   장면 머리 번호(BUS · COUNTRY ROAD)는 글자 그대로일 때만, 이름과 대소문자만 다르면 바꾸지 않는다(resolveEntityNames 의 keyRule).
  const byId = new Map<string, string>()
  const exactIds = new Map<string, string>()
  for (const e of [...entries].sort((a, b) => (b.slug?.length ?? 0) - (a.slug?.length ?? 0))) {
    const slug = e.slug?.trim()
    const name = e.name?.trim()
    if (!slug || !name || name === slug) continue
    const rule = keyRule(slug, name)
    if (rule === 'skip') continue
    if (byId.has(slug.toLowerCase())) continue
    if (rule === 'exact') exactIds.set(slug.toLowerCase(), slug)
    byId.set(slug.toLowerCase(), name)
  }
  if (byId.size === 0) return text
  const names = [...new Set(byId.values())]
  const written = writtenNameSpans(text, names)
  const keys = [...byId.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp)
  let out = text.replace(new RegExp(`(?<![A-Za-z0-9_])(?:${keys.join('|')})(?![A-Za-z0-9_])`, 'gi'), (token, offset: number) => {
    if (insideWrittenName(written, offset, token.length)) return token
    const exact = exactIds.get(token.toLowerCase())
    if (exact !== undefined && token !== exact) return token
    return `${prefix}${byId.get(token.toLowerCase()) ?? token}`
  })
  out = collapseDoubledArticles(out, names, prefix)
  return prefix === '' ? fixKoreanParticles(out, names) : out
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
 * 샷은 보드 카드와 같은 전체 번호(씬마다 다시 세지 않는 번호)로 부른다 — "Shot 8"(오너 2026-11-02 "전체 번호로 통일").
 * 셈은 보드와 같은 boardShots 하나다. 보드에 없는(씬 목록 밖) 샷은 멘션에도 없다.
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
  for (const entry of boardShots(manifest, shots)) {
    if (seenShots.has(entry.shot.shotId)) continue
    seenShots.add(entry.shot.shotId)
    targets.push({ kind: 'shot', id: entry.shot.shotId, label: `Shot ${entry.shotNo}` })
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
  /** 번호를 셀 보드 전체 — 목록이 보드 일부(씬 하나)일 때 넘긴다. 없으면 이 목록이 보드다(리뷰 L5). */
  board?: { manifest: SceneManifest | null; shots: readonly Shot[] },
): string {
  const scenes = manifest?.scenes ?? []
  if (scenes.length === 0 && shots.length === 0) return '## 현재 씬/샷\n(아직 없음)'

  const scriptLines = precomputedLines ?? buildScriptLines(manifest, shots)
  const byRef = lineMap(scriptLines)
  const sceneIds = new Set(scenes.map((scene) => scene.sceneId))
  const lines: string[] = [
    '## 현재 씬/샷 (scene_id·shot_id 를 그대로 사용, [L#] = 스크립트 라인 번호)',
    // 오너 2026-11-02 "전체 번호로 통일" — 보드 카드 이름(괄호)이 샷의 이름이다. 씬마다 다시 세지 않는다.
    '샷 번호: 샷마다 괄호 안의 보드 이름("Scene 2 · Shot 8")이 사용자가 보는 이름이고, 샷 번호는 씬마다 다시 세지 않는 전체 번호다. "샷 8"·"Shot 8"·"Scene 2 · Shot 8"은 그 전체 번호의 샷이다. 씬과 샷을 함께 말하면("씬2 샷5") 보드 Shot 5(그 씬에 있을 때)와 그 씬의 다섯 번째 샷 두 가지로 읽힐 수 있다 — 하나만 되면 그것, 둘 다 되고 서로 다르면 고치지 말고 두 샷을 보드 이름으로 보여 주며 되묻는다. "2씬 두 번째 샷"처럼 씬 안 자리를 말하면 그 자리다. 답할 때 샷은 이 보드 이름으로 부르고 id(sh_..)나 씬 안 순서로 부르지 않는다.',
  ]
  const numbering = board ?? { manifest, shots }
  const boardLabels = boardShotLabels(numbering.manifest, numbering.shots)
  const boardSceneNo = (sceneId: string, fallback: number) => {
    const index = numbering.manifest?.scenes.findIndex((scene) => scene.sceneId === sceneId) ?? -1
    return index >= 0 ? index + 1 : fallback
  }
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
      `\n### ${lineLabel(heading)}${scene.sceneId} (씬${boardSceneNo(scene.sceneId, sceneIdx + 1)}) — 장소:${scene.location || '?'} / ${scene.timeOfDay || '?'} / 분위기:${scene.mood || '?'} (등장: ${present})`,
    )
    if (scene.narrativeSummary) lines.push(`  요약: ${scene.narrativeSummary}`)

    for (const shot of shots.filter((s) => s.sceneId === scene.sceneId)) {
      pushShotContextLines(lines, byRef, manifest, shot, boardLabels.get(shot.shotId))
    }
  }

  const orphan = shots.filter((shot) => !sceneIds.has(shot.sceneId))
  if (orphan.length > 0) {
    lines.push('\n### (씬 미배정 샷)')
    for (const shot of orphan) {
      pushShotContextLines(lines, byRef, manifest, shot, undefined)
    }
  }

  return lines.join('\n')
}

function pushShotContextLines(
  lines: string[],
  byRef: Map<string, ScriptLine>,
  manifest: SceneManifest | null,
  shot: Shot,
  boardLabel: string | undefined,
): void {
  const action = byRef.get(`${shot.shotId}.action`)
  const chars =
    (shot.characters ?? []).map((id) => characterRef(manifest, id)).join(', ') || '없음'
  lines.push(
    `  - ${lineLabel(action)}${shot.shotId}${boardLabel ? ` (${boardLabel})` : ''} [${shot.shotType}] ${shot.actionDescription || '(설명 없음)'} (등장: ${chars}, ${shot.durationSeconds}s)`,
  )

  dialogueLinesOf(shot).forEach((dialogue, index) => {
    const line = byRef.get(`${shot.shotId}.dialogue[${index}]`)
    const speaker = characterRef(manifest, dialogue.characterId)
    // emotion·delivery·durationHint도 보여준다 — 모델은 보이는 필드만 재제출할 수 있고,
    //   대사 수정은 전체 배열 재제출 계약이라 안 보이면 그대로 유실된다(2026-08-31 실측).
    const extras: string[] = []
    if (dialogue.emotion) extras.push(`emotion: ${dialogue.emotion}`)
    if (dialogue.delivery) extras.push(`delivery: ${dialogue.delivery}`)
    if (dialogue.durationHint) extras.push(`durationHint: ${dialogue.durationHint}`)
    if (dialogue.plannedTiming) extras.push(`plannedTiming: ${dialogue.plannedTiming}`)
    const extraNote = extras.length > 0 ? ` {${extras.join(' · ')}}` : ''
    lines.push(`    ${lineLabel(line)}대사[${index}] ${speaker}: "${dialogue.text}"${extraNote}`)
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
