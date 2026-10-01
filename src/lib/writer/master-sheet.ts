// Writer 마스터 시트 — 러프 스토리보드를 클라이언트용 촬영 시트로 정리하는 순수 모델(#master-sheet).
//   React·DOM 의존 없음 — 페이지 나누기·이름 치환·타임코드 계산까지 여기서 끝내고, 렌더
//   (master-sheet-render.ts)와 화면(master-sheet-view.tsx)은 이 결과를 그대로 그린다(WYSIWYG).
//   클라이언트(외부 협업자)가 받는 문서라 shotId·sceneId·생성 방식·프롬프트는 출력 타입 자체에 없다.
import type { DialogueLine, ProjectFormat, ShotType } from '@/types'
import { shotImageAspectRatio } from '@/lib/project-aspect'
import { manifestEntities, resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'

export interface MasterSheetSceneInput {
  sceneId: string
  sortOrder?: number
  /** 원문 그대로(Writer 씬의 location 필드) — 장소 id 슬러그가 섞여 있어도 이름으로 치환한다. */
  location: string
  timeOfDay: string
  charactersPresent: string[]
}

export interface MasterSheetShotInput {
  shotId: string
  sceneId: string
  sortOrder?: number
  shotType: ShotType
  actionDescription: string
  characters: string[]
  dialogueLines: DialogueLine[]
  durationSeconds: number
  roughStoryboard?: { frames?: { start: string; direction: string; end: string } } | null
}

export interface MasterSheetCharacterInput {
  characterId: string
  name: string
}

export interface MasterSheetLocationInput {
  locationId: string
  name: string
}

export interface BuildMasterSheetInput {
  projectFormat: ProjectFormat | null
  scenes: readonly MasterSheetSceneInput[]
  shots: readonly MasterSheetShotInput[]
  characters: readonly MasterSheetCharacterInput[]
  locations: readonly MasterSheetLocationInput[]
}

export interface MasterSheetFrameSet {
  start: string | null
  direction: string | null
  end: string | null
}

export interface MasterSheetRow {
  /** "씬번호-씬 안 샷번호" (예: "1-2"), 둘 다 1부터. 내부 shotId/sceneId 대신 쓰는 표시용 코드. */
  code: string
  frames: MasterSheetFrameSet
  framesComplete: boolean
  shotSizeLabel: string
  characters: string[]
  action: string
  dialogueLines: string[]
  durationSeconds: number
  /** 영화 시작부터 누적한 초 — 그림이 없는 샷도 상영 시간을 차지하므로 포함해 센다. */
  timecodeStart: number
  timecodeEnd: number
}

export interface MasterSheetScenePart {
  /** 1부터 — 이 씬이 여러 장으로 나뉠 때 몇 번째 장인지. */
  index: number
  total: number
}

export interface MasterSheetPage {
  /** 문서 전체 기준 1부터. */
  pageIndex: number
  totalPages: number
  /** 씬 순서 기준 1부터(불변 id 아님 — rough-storyboard-view 와 같은 표시 규칙). */
  sceneNumber: number
  scenePart: MasterSheetScenePart
  locationName: string
  timeOfDay: string
  characters: string[]
  sceneDurationSeconds: number
  rows: MasterSheetRow[]
}

export interface MasterSheetResult {
  pages: MasterSheetPage[]
  shotCount: number
  missingFrameShots: number
  /** 프로젝트 포맷에서 고정된 그림 칸 비율(예: '16:9', '9:16') — 미리보기·렌더가 같은 값을 쓴다. */
  frameAspectRatio: string
  /** 전체 상영 시간(초) — 모든 샷 duration 합. 푸터의 총 러닝타임에 쓴다. */
  totalRuntimeSeconds: number
}

// 16:9 기준 한 장당 샷 수(오너 지시: "4 shots for 16:9, fewer for 9:16"). 다른 비율은 칸 높이에
//   반비례로 스케일한다 — 세로(9:16)는 칸이 높아져 적게, 시네마(2.39:1)는 낮아져 많이 들어간다.
//   A4 한 장에 지나치게 많거나(판독 불가) 적게(장 수 폭증) 들어가지 않도록 2~6으로 가둔다.
const BASE_SHOTS_PER_PAGE = 4
const BASE_HEIGHT_PER_WIDTH = 9 / 16
const MIN_SHOTS_PER_PAGE = 2
const MAX_SHOTS_PER_PAGE = 6

function shotsPerPage(aspectRatio: string): number {
  const [w, h] = aspectRatio.split(':').map(Number)
  if (!w || !h) return BASE_SHOTS_PER_PAGE
  const heightPerWidth = h / w
  const raw = Math.round(BASE_SHOTS_PER_PAGE * (BASE_HEIGHT_PER_WIDTH / heightPerWidth))
  return Math.max(MIN_SHOTS_PER_PAGE, Math.min(MAX_SHOTS_PER_PAGE, raw))
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** id 목록 → 이름 목록(중복 제거, 순서 보존). 로스터에 없는 id 는 그대로 둔다(알 수 없는 건 지어내지 않는다). */
function namesOf(ids: readonly string[], namesById: Map<string, string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    const name = namesById.get(id) ?? id
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

function dialogueLineText(
  line: DialogueLine,
  namesById: Map<string, string>,
  entityNames: ReturnType<typeof manifestEntities>,
): string {
  const text = resolveEntityNames(line.text, entityNames)
  if (!line.characterId) return text // 내레이션(V.O.) — 화자 표기 없이 그대로(팀 지시).
  const name = namesById.get(line.characterId) ?? line.characterId
  return `${name}: ${text}`
}

export function buildMasterSheet(input: BuildMasterSheetInput): MasterSheetResult {
  const frameAspectRatio = shotImageAspectRatio(input.projectFormat)
  const capacity = shotsPerPage(frameAspectRatio)
  const namesById = new Map<string, string>([
    ...input.characters.map((c) => [c.characterId, c.name] as const),
    ...input.locations.map((l) => [l.locationId, l.name] as const),
  ])
  const entityNames = manifestEntities({ characters: input.characters, locations: input.locations })

  const scenesSorted = [...input.scenes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  let missingFrameShots = 0
  let shotCount = 0
  // 전체 상영 시간 기준 타임코드 — 씬 순서 → 그 안 샷 순서로 이어 센다(영화 시작부터 누적).
  let runningSeconds = 0
  const rawPages: Omit<MasterSheetPage, 'pageIndex' | 'totalPages'>[] = []

  for (const [sceneIdx, scene] of scenesSorted.entries()) {
    const sceneNumber = sceneIdx + 1
    const sceneShots = input.shots
      .filter((s) => s.sceneId === scene.sceneId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    if (sceneShots.length === 0) continue // 샷 없는 씬은 실을 행이 없다 — 장을 만들지 않는다.

    const sceneDurationSeconds = sceneShots.reduce((sum, s) => sum + s.durationSeconds, 0)
    const sceneCharacterNames = namesOf(scene.charactersPresent, namesById)
    // 씬 장소는 대개 배경 id 그대로다 — id 로 먼저 찾고(평범한 낱말 id 'location' 등도), 자유 문장이면 슬러그만 치환한다.
    const locationName = namesById.get(scene.location) ?? resolveEntityNames(scene.location, entityNames)

    const chunks = chunk(sceneShots, capacity)
    chunks.forEach((chunkShots, chunkIdx) => {
      const rows: MasterSheetRow[] = chunkShots.map((shot, rowIdx) => {
        const shotNumber = chunkIdx * capacity + rowIdx + 1
        const frames: MasterSheetFrameSet = shot.roughStoryboard?.frames
          ? {
              start: shot.roughStoryboard.frames.start,
              direction: shot.roughStoryboard.frames.direction,
              end: shot.roughStoryboard.frames.end,
            }
          : { start: null, direction: null, end: null }
        const framesComplete = !!(frames.start && frames.direction && frames.end)
        if (!framesComplete) missingFrameShots += 1
        shotCount += 1
        const timecodeStart = runningSeconds
        runningSeconds += shot.durationSeconds
        const timecodeEnd = runningSeconds
        return {
          code: `${sceneNumber}-${shotNumber}`,
          frames,
          framesComplete,
          shotSizeLabel: SHOT_TYPE_DESCRIPTIONS[shot.shotType] ?? shot.shotType,
          characters: namesOf(shot.characters, namesById),
          action: resolveEntityNames(shot.actionDescription, entityNames),
          dialogueLines: (shot.dialogueLines ?? []).map((line) => dialogueLineText(line, namesById, entityNames)),
          durationSeconds: shot.durationSeconds,
          timecodeStart,
          timecodeEnd,
        }
      })
      rawPages.push({
        sceneNumber,
        scenePart: { index: chunkIdx + 1, total: chunks.length },
        locationName,
        timeOfDay: scene.timeOfDay,
        characters: sceneCharacterNames,
        sceneDurationSeconds,
        rows,
      })
    })
  }

  const totalPages = rawPages.length
  const pages: MasterSheetPage[] = rawPages.map((page, idx) => ({ ...page, pageIndex: idx + 1, totalPages }))

  return { pages, shotCount, missingFrameShots, frameAspectRatio, totalRuntimeSeconds: runningSeconds }
}

export interface MasterSheetPngExportPlan {
  kind: 'png'
  fileName: string
}
export interface MasterSheetZipExportPlan {
  kind: 'zip'
  fileName: string
  entries: string[]
}
export type MasterSheetExportPlan = MasterSheetPngExportPlan | MasterSheetZipExportPlan

/** 파일명 안전화 — 경로/와일드카드 문자 제거. 전부 지워지면 'untitled' 로 대체. */
function sanitizeFileNameSegment(value: string): string {
  const cleaned = value.replace(/[/\\:*?"<>|]/g, '').trim()
  return cleaned || 'untitled'
}

/** 페이지 하나면 PNG 하나, 여러 장이면 ZIP 하나(항목 = 페이지별 PNG, 이름에 씬·부분 번호). */
export function masterSheetExportPlan(
  pages: readonly MasterSheetPage[],
  projectTitle: string,
): MasterSheetExportPlan {
  const safeTitle = sanitizeFileNameSegment(projectTitle)
  if (pages.length <= 1) {
    return { kind: 'png', fileName: `${safeTitle}-master-sheet.png` }
  }
  return {
    kind: 'zip',
    fileName: `${safeTitle}-master-sheet.zip`,
    entries: pages.map(
      (page) => `${safeTitle}-S${String(page.sceneNumber).padStart(2, '0')}-p${page.scenePart.index}.png`,
    ),
  }
}
