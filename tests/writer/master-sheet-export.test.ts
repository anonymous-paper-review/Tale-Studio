// 마스터 시트는 Storyboard 탭이 아니라 [내보내기] 메뉴에서 받는다 · 한 장이면 PNG, 여러 장이면 ZIP (2026-10-20 오너 "storyboard 탭에서 마스터시트 지워주고 export로 기능 빼줘")
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { exportMasterSheet, type MasterSheetExportDeps } from '@/lib/export/master-sheet'
import { KO } from '@/lib/i18n/messages-ko'
import type { SceneManifest, Shot } from '@/types'

const frames = { start: 'https://img/start.png', direction: 'https://img/direction.png', end: 'https://img/end.png' }
const manifest = {
  scenes: [
    { sceneId: 'sc1', sortOrder: 0, location: 'hall', timeOfDay: 'night', charactersPresent: ['minho'] },
    { sceneId: 'sc2', sortOrder: 1, location: 'hall', timeOfDay: 'night', charactersPresent: ['minho'] },
  ],
  characters: [{ characterId: 'minho', name: '민호' }],
  locations: [{ locationId: 'hall', name: '복도 끝 자판기 구역' }],
} as unknown as SceneManifest
const shot = (shotId: string, sceneId: string, sortOrder: number, over: Partial<Shot> = {}) => ({
  shotId, sceneId, sortOrder, shotType: 'MS', actionDescription: '민호가 자판기를 흔든다.', characters: ['minho'],
  dialogueLines: [], durationSeconds: 4, roughStoryboard: { frames }, ...over,
}) as unknown as Shot

function harness(board: { sceneManifest: SceneManifest | null; shots: Shot[] }, locale: 'ko' | 'en' = 'ko') {
  const downloads: Array<{ name: string; blob: Blob }> = []
  const rendered: Array<{ page: number; locale: string }> = []
  const zipped: string[][] = []
  const deps: MasterSheetExportDeps<{ page: number }> = {
    load: async () => board,
    projectLocale: async () => locale,
    renderPage: async (page, context) => {
      rendered.push({ page: page.pageIndex, locale: context.locale })
      return { page: page.pageIndex }
    },
    toPng: async (canvas) => new Blob([`png-${canvas.page}`]),
    zip: async (files) => {
      zipped.push(files.map((file) => file.name))
      return new Blob(['zip'])
    },
    download: (blob, name) => downloads.push({ name, blob }),
  }
  return { deps, downloads, rendered, zipped }
}

describe('[내보내기]의 마스터 시트', () => {
  it('한 장이면 PNG 하나로 받는다', async () => {
    // 왜: 정상 경로 고정 — Storyboard 탭에서 받던 것과 같은 파일이다.
    const { deps, downloads } = harness({ sceneManifest: manifest, shots: [shot('a', 'sc1', 0), shot('b', 'sc1', 1)] })

    const outcome = await exportMasterSheet({ projectTitle: '자판기', projectFormat: null }, deps)

    expect(outcome).toMatchObject({ kind: 'saved', pages: 1 })
    expect(downloads.map((item) => item.name)).toEqual(['자판기-master-sheet.png'])
  })

  it('여러 장이면 장마다 PNG 를 담은 ZIP 하나로 받는다', async () => {
    // 왜: 정상 경로 고정 — 씬이 바뀌면 새 장에서 시작하고, 장마다 씬 · 장 번호가 붙은 이름으로 담는다.
    const { deps, downloads, zipped } = harness({ sceneManifest: manifest, shots: [shot('a', 'sc1', 0), shot('b', 'sc2', 0)] })

    const outcome = await exportMasterSheet({ projectTitle: '자판기', projectFormat: null }, deps)

    expect(outcome).toMatchObject({ kind: 'saved', pages: 2 })
    expect(zipped).toEqual([['자판기-S01-p1.png', '자판기-S02-p1.png']])
    expect(downloads.map((item) => item.name)).toEqual(['자판기-master-sheet.zip'])
  })

  it('씬 · 샷이 아직 없으면 받지 않는다', async () => {
    // 왜: 빈 시트를 받으면 고장처럼 보인다 — 메뉴는 "아직 생성된 씬·샷이 없어요"로 알린다. 고장: Storyboard 전 단계에서 누를 때.
    for (const board of [{ sceneManifest: null, shots: [] }, { sceneManifest: manifest, shots: [] }]) {
      const { deps, downloads, rendered } = harness(board)

      expect(await exportMasterSheet({ projectTitle: '자판기', projectFormat: null }, deps)).toEqual({ kind: 'empty' })
      expect(downloads).toEqual([])
      expect(rendered).toEqual([])
    }
  })

  it('시트의 머리글 · 라벨은 프로젝트 언어로 찍는다', async () => {
    // 왜: 다른 내보내기(ZIP)와 같은 규칙 — 받는 사람이 보는 문서라 화면 언어가 아니라 작품 언어를 따른다.
    const { deps, rendered } = harness({ sceneManifest: manifest, shots: [shot('a', 'sc1', 0), shot('b', 'sc2', 0)] }, 'en')

    await exportMasterSheet({ projectTitle: '자판기', projectFormat: null }, deps)

    expect(rendered.map((item) => item.locale)).toEqual(['en', 'en'])
  })

  it('러프 그림이 없는 샷 수를 알려 준다', async () => {
    // 왜: 빈 칸이 섞인 시트인지 받기 전에는 모른다 — 받은 뒤 "러프 그림이 아직 없는 샷 N개"를 띄운다.
    const { deps } = harness({ sceneManifest: manifest, shots: [shot('a', 'sc1', 0), shot('b', 'sc1', 1, { roughStoryboard: null } as Partial<Shot>)] })

    expect(await exportMasterSheet({ projectTitle: '자판기', projectFormat: null }, deps)).toMatchObject({ kind: 'saved', missingFrameShots: 1 })
  })

  it('Storyboard 탭에는 마스터 시트가 없고, [내보내기] 메뉴에 "마스터 시트 이미지로 저장"이 있다', () => {
    // 왜: 2026-10-20 오너 지시 그대로 — 화면 연결이 빠지면 기능은 있어도 누를 곳이 없다.
    const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8')
    expect(read('src/features/writer/writer-tabs.tsx')).not.toMatch(/value="sheet"/)
    expect(read('src/components/export-menu.tsx')).toMatch(/t\('Save master sheet as image'\)/)
    expect((KO as Record<string, string>)['Save master sheet as image']).toBe('마스터 시트 이미지로 저장')
  })
})
