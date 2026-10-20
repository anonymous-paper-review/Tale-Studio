// [내보내기] 메뉴의 "마스터 시트 이미지로 저장"(2026-10-20 오너 "storyboard 탭에서 마스터시트 지워주고 export로 기능 빼줘").
//   예전 Storyboard 마스터 시트 탭과 같은 시트 · 같은 파일(한 장이면 PNG, 여러 장이면 장마다 PNG 를 담은 ZIP)을 미리보기 없이 바로 받는다.
//   그리기(캔버스) · 압축 · 내려받기는 호출부가 넘긴다 — 이 파일은 순서만 정한다(DOM 의존 없음).
//   약속: tests/writer/master-sheet-export.test.ts · 시트 내용과 파일 이름: tests/writer/master-sheet.test.ts
import { buildMasterSheet, masterSheetExportPlan, type MasterSheetPage, type MasterSheetResult } from '@/lib/writer/master-sheet'
import type { AppLocale } from '@/lib/locale'
import type { ProjectFormat, SceneManifest, Shot } from '@/types'

/** 한 장을 그릴 때 머리글 · 바닥글에 찍는 값(features/writer/master-sheet-render 의 MasterSheetRenderContext 와 같은 모양). */
export interface MasterSheetPageContext {
  projectTitle: string
  frameAspectRatio: string
  totalRuntimeSeconds: number
  locale: AppLocale
}

export interface MasterSheetExportDeps<Canvas> {
  /** Storyboard 화면과 같은 자료(씬 · 샷 · 인물 · 배경). */
  load: () => Promise<{ sceneManifest: SceneManifest | null; shots: readonly Shot[] }>
  /** 시트 글자를 찍을 언어 — 다른 내보내기처럼 프로젝트 언어. */
  projectLocale: () => Promise<AppLocale>
  renderPage: (page: MasterSheetPage, context: MasterSheetPageContext) => Promise<Canvas>
  toPng: (canvas: Canvas) => Promise<Blob>
  /** PNG 로 바꾼 그림판을 놓는다 — 장 수가 많아도 그림판을 한꺼번에 들고 있지 않게(검토 지적). */
  release?: (canvas: Canvas) => void
  zip: (files: ReadonlyArray<{ name: string; data: Blob }>) => Promise<Blob>
  download: (blob: Blob, fileName: string) => void
}

export type MasterSheetExportOutcome =
  | { kind: 'empty' }
  | { kind: 'saved'; fileName: string; pages: number; missingFrameShots: number }

/** Storyboard 자료로 마스터 시트를 만든다 — 샷이 없으면 null. */
export function masterSheetFromBoard(input: {
  projectFormat: ProjectFormat | null
  sceneManifest: SceneManifest | null
  shots: readonly Shot[]
}): MasterSheetResult | null {
  const { sceneManifest, shots } = input
  if (!sceneManifest || shots.length === 0) return null
  return buildMasterSheet({
    projectFormat: input.projectFormat,
    scenes: sceneManifest.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sortOrder: scene.sortOrder,
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      charactersPresent: scene.charactersPresent,
    })),
    shots: shots.map((shot) => ({
      shotId: shot.shotId,
      sceneId: shot.sceneId,
      sortOrder: shot.sortOrder,
      shotType: shot.shotType,
      actionDescription: shot.actionDescription,
      characters: shot.characters,
      dialogueLines: shot.dialogueLines,
      durationSeconds: shot.durationSeconds,
      roughStoryboard: shot.roughStoryboard,
    })),
    characters: sceneManifest.characters,
    locations: sceneManifest.locations,
  })
}

/** 마스터 시트를 만들어 받는다. 씬 · 샷이 아직 없으면 아무것도 받지 않고 'empty'. */
export async function exportMasterSheet<Canvas>(
  input: { projectTitle: string; projectFormat: ProjectFormat | null },
  deps: MasterSheetExportDeps<Canvas>,
): Promise<MasterSheetExportOutcome> {
  const board = await deps.load()
  const sheet = masterSheetFromBoard({ projectFormat: input.projectFormat, sceneManifest: board.sceneManifest, shots: board.shots })
  if (!sheet || sheet.pages.length === 0) return { kind: 'empty' }
  const context: MasterSheetPageContext = {
    projectTitle: input.projectTitle,
    frameAspectRatio: sheet.frameAspectRatio,
    totalRuntimeSeconds: sheet.totalRuntimeSeconds,
    locale: await deps.projectLocale(),
  }
  // 한 장씩 그려 바로 PNG 로 바꾸고 그림판을 놓는다 — 세로 · 씬이 많은 작품은 장이 수십 장이라 한꺼번에 들고 있으면 브라우저가 멈춘다.
  const pngs: Blob[] = []
  for (const page of sheet.pages) {
    const canvas = await deps.renderPage(page, context)
    pngs.push(await deps.toPng(canvas))
    deps.release?.(canvas)
  }

  const plan = masterSheetExportPlan(sheet.pages, input.projectTitle)
  if (plan.kind === 'png') {
    deps.download(pngs[0], plan.fileName)
  } else {
    deps.download(await deps.zip(pngs.map((data, index) => ({ name: plan.entries[index], data }))), plan.fileName)
  }
  return { kind: 'saved', fileName: plan.fileName, pages: sheet.pages.length, missingFrameShots: sheet.missingFrameShots }
}
