// [내보내기]의 마스터 시트를 받는 사이 다른 프로젝트로 바꾸면 그 자료(비었거나 새 프로젝트 것)로 시트를 만들지 않고 받지 않았다고 알리는지, 프로젝트가 그대로면 지금처럼 받는지 — 를 검사한다 (P1 검토 고침의 뒤따름, 리드 2026-11-27)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 개발 DB 대신 쓰는 프로젝트별 답 — 문을 닫아 두면 열 때까지 답이 오지 않는다(받는 사이 늦게 오는 응답). tests/writer/load-project.test.ts 와 같은 꼴.
const fake = vi.hoisted(() => {
  type Result = { data: unknown; error: unknown }
  const results = new Map<string, Record<string, Result>>()
  const gates = new Map<string, { promise: Promise<void>; open: () => void }>()
  const wait = (projectId: string) => gates.get(projectId)?.promise ?? Promise.resolve()
  function hold(projectId: string) {
    let open = () => {}
    const promise = new Promise<void>((resolve) => { open = resolve })
    gates.set(projectId, { promise, open })
  }
  const release = (projectId: string) => gates.get(projectId)?.open()
  const answer = (projectId: string, table: string): Result => results.get(projectId)?.[table] ?? { data: [], error: null }
  function query(table: string) {
    let projectId = ''
    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => { if (column === 'project_id') projectId = value; return builder },
      order: () => builder,
      then: (ok: (result: Result) => unknown, fail?: (error: unknown) => unknown) => wait(projectId).then(() => answer(projectId, table)).then(ok, fail),
    }
    return builder
  }
  return { results, gates, hold, release, wait, answer, query }
})
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: fake.query }) }))
vi.mock('@/lib/shots-cache', async (original) => ({
  ...await original<typeof import('@/lib/shots-cache')>(),
  loadShotsResult: (projectId: string) => fake.wait(projectId).then(() => fake.answer(projectId, 'shots')),
}))

import { exportMasterSheet, masterSheetBoardFor, type MasterSheetExportDeps } from '@/lib/export/master-sheet'
import { KO } from '@/lib/i18n/messages-ko'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

/** 이 시험을 위해 지은 프로젝트 자료 — 씬 하나 · 샷 하나, 샷 설명에 프로젝트 이름을 넣어 어느 자료로 만든 시트인지 가린다. */
function projectRows(projectId: string, scenes = 1) {
  return {
    scenes: { data: Array.from({ length: scenes }, () => ({ scene_id: 's1', sort_order: 0, location: '', time_of_day: '', characters_present: [] })), error: null },
    characters: { data: [], error: null },
    locations: { data: [], error: null },
    shots: { data: [{ shot_id: 'sh_01_01', scene_id: 's1', sort_order: 0, shot_type: 'MS', action_description: `${projectId} 프로젝트의 장면`, dialogue_lines: [], duration_seconds: 4 }], error: null },
  }
}
/** 그리기 · 받기는 적어 두기만 한다(캔버스 없음). */
function harness() {
  const rendered: string[] = []
  const downloads: string[] = []
  const deps: Omit<MasterSheetExportDeps<string>, 'load'> = {
    projectLocale: async () => 'ko',
    renderPage: async (page) => { rendered.push(JSON.stringify(page)); return 'canvas' },
    toPng: async () => new Blob(['png']),
    zip: async () => new Blob(['zip']),
    download: (_blob, name) => { downloads.push(name) },
  }
  return { deps, rendered, downloads }
}
/** [내보내기] 메뉴의 받기와 같은 길 — Writer 자료를 다시 읽고, 받기를 시작한 그 프로젝트 자료만 시트로 넘긴다(아래 마지막 시험이 메뉴가 같은 줄을 쓰는지 본다). */
const menuLoad = (projectId: string) => async () => {
  await useWriterStore.getState().loadProject()
  return masterSheetBoardFor(projectId, useWriterStore.getState(), useProjectStore.getState().projectId)
}
const CHANGED = "The project changed, so the master sheet wasn't downloaded. Please download it again."

beforeEach(() => {
  fake.results.clear()
  fake.gates.clear()
  useWriterStore.getState().reset()
  useProjectStore.setState({ projectId: 'A' })
  fake.results.set('A', projectRows('A'))
  fake.results.set('B', projectRows('B'))
})

describe('[내보내기] 마스터 시트 — 받는 사이 프로젝트 바꾸기', () => {
  // 왜: 받기를 누르고 자료를 읽는 1초쯤 사이에 사용자 메뉴로 다른 프로젝트를 열 때 — 늦게 온 옛 자료를 막은 뒤(599e1874)로는
  //   그 순간 store 에 있는 것(아직 비었거나, 이미 읽힌 새 프로젝트 자료)이 처음 프로젝트 제목으로 받아질 수 있었다.
  it('마스터 시트를 받는 사이 다른 프로젝트로 바꾸면 다른 프로젝트 자료로 시트를 만들지 않고, 받지 않았다고 알린다', async () => {
    for (const newProjectRead of [true, false]) {
      useWriterStore.getState().reset()
      useProjectStore.setState({ projectId: 'A' })
      fake.hold('A')
      const run = harness()
      const exporting = exportMasterSheet({ projectTitle: 'A 제목', projectFormat: 'vertical_9:16' }, { ...run.deps, load: menuLoad('A') })
      // 사용자가 다른 프로젝트를 연다 — switchProject 처럼 비운 뒤 B 를 정하고, B 화면이 B 자료를 읽는다(또는 아직 못 읽었다).
      useWriterStore.getState().reset()
      useProjectStore.setState({ projectId: 'B' })
      if (newProjectRead) await useWriterStore.getState().loadProject()
      fake.release('A')
      const label = newProjectRead ? '새 프로젝트 자료가 있을 때' : '아직 비었을 때'
      expect(await exporting, label).toEqual({ kind: 'project-changed' })
      expect(run.rendered, label).toEqual([])
      expect(run.downloads, label).toEqual([])
    }
  })

  // 왜(정상 경로 고정): 받는 동안 프로젝트를 그대로 두면 그 프로젝트 자료로 시트를 받는다.
  it('받는 사이 프로젝트가 그대로면 지금처럼 그 프로젝트 자료로 시트를 받는다', async () => {
    const run = harness()
    const outcome = await exportMasterSheet({ projectTitle: 'A 제목', projectFormat: 'vertical_9:16' }, { ...run.deps, load: menuLoad('A') })
    expect(outcome.kind).toBe('saved')
    expect(run.downloads).toHaveLength(1)
    expect(run.rendered.join('')).toContain('A 프로젝트의 장면')
    expect(run.rendered.join('')).not.toContain('B 프로젝트의 장면')
  })

  // 왜: 씬이 0개로 온 읽기는 이제 "못 읽음"이라 다 읽은 표시가 남지 않는다 — 그걸 프로젝트가 바뀐 것으로 알리면
  //   아직 씬이 없는 프로젝트(Producer 단계)에서 [내보내기]를 누를 때 틀린 말이 뜬다.
  it('씬이 아직 없는 프로젝트는 지금처럼 씬 · 샷이 아직 없다고 알리고, 프로젝트가 바뀌었다고 하지 않는다', async () => {
    fake.results.set('A', projectRows('A', 0))
    const run = harness()
    const outcome = await exportMasterSheet({ projectTitle: 'A 제목', projectFormat: 'vertical_9:16' }, { ...run.deps, load: menuLoad('A') })
    expect(outcome).toEqual({ kind: 'empty' })
    expect(run.downloads).toEqual([])
  })

  // 왜: 위 세 시험의 받기 길이 메뉴의 실제 받기와 같아야 시험이 뜻이 있다 — 메뉴는 누르기 전 그 프로젝트(projectId)로 고르고, 바뀌었으면 두 말로 알린다.
  it('[내보내기] 메뉴의 마스터 시트는 받기를 시작한 프로젝트 자료일 때만 시트를 만들고, 바뀌었으면 받지 않았다고 두 말로 알린다', () => {
    const menu = readFileSync(path.join(process.cwd(), 'src/components/export-menu.tsx'), 'utf8')
    expect(menu).toMatch(/await useWriterStore\.getState\(\)\.loadProject\(\)\s*\n(\s*\/\/[^\n]*\n)*\s*return masterSheetBoardFor\(projectId, useWriterStore\.getState\(\), useProjectStore\.getState\(\)\.projectId\)/)
    expect(menu).toMatch(/outcome\.kind === 'project-changed'\) \{\s*\n\s*toast\.error\(t\("The project changed, so the master sheet wasn't downloaded\. Please download it again\."\), \{ id: toastId \}\)/)
    expect((KO as Record<string, string>)[CHANGED]).toBe('프로젝트가 바뀌어 마스터 시트를 받지 못했어요. 다시 받아 주세요.')
  })
})
