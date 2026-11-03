// [내보내기]를 누르면 지금 메뉴의 네 항목이 체크 창으로 뜨고, 고른 것만 창의 순서대로 하나씩 내보낸다 (오너 2026-11-03 "버튼을 누르면 check 박스가 떠서 어떤 아이템만 내보낼 수 있을지 정해줘")
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return {
    translate,
    useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params),
    useLocale: () => 'ko',
  }
})
// 메뉴 파일이 부르는 무거운 모듈(받기 · DB)은 이 시험이 보지 않는다 — tests/editor/export-menu.test.ts 와 같게 막는다.
vi.mock('@/lib/export', () => ({
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  exportProject: vi.fn(),
  exportStage: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/shots-cache', () => ({ invalidateShots: vi.fn(), loadShotsResult: vi.fn() }))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: { getState: () => ({ shots: [] }) } }))

import { ExportDialogBody, resolveExportStage } from '@/components/export-menu'
import {
  EXPORT_CHOICES,
  exportChoiceStates,
  exportRunList,
  runExportChoices,
  waitUntilGone,
  warnsMultipleDownloads,
  type ExportChoice,
} from '@/lib/export/export-choices'
import type { PrevizExportAccess } from '@/lib/billing/export-access'
import type { StageId } from '@/types'

const menuSource = readFileSync(path.join(process.cwd(), 'src/components/export-menu.tsx'), 'utf8')

function statesAt(stage: StageId, access: PrevizExportAccess = 'open') {
  return exportChoiceStates({ hasProject: true, busy: false, access, stage: resolveExportStage(stage) })
}

function body(input: { stage?: StageId; access?: PrevizExportAccess; picked?: ExportChoice[] } = {}) {
  const access = input.access ?? 'open'
  return renderToStaticMarkup(
    createElement(ExportDialogBody, {
      access,
      states: statesAt(input.stage ?? 'writer', access),
      picked: new Set(input.picked ?? []),
      stageName: 'Storyboard',
      onToggle: () => {},
      onCancel: () => {},
      onStart: () => {},
    }),
  )
}

/** 받기 순서를 적는 가짜 항목들 — 항목마다 끝나는 때를 밖에서 정할 수 있다. */
function recorder(order: string[], fail: ExportChoice[] = []) {
  const run = {} as Record<ExportChoice, () => Promise<void>>
  for (const choice of EXPORT_CHOICES) {
    run[choice] = async () => {
      order.push(`${choice}:start`)
      await Promise.resolve()
      if (fail.includes(choice)) throw new Error(`${choice} broke`)
      order.push(`${choice}:end`)
    }
  }
  return run
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('[내보내기] 체크 창에서 고를 수 있는 것', () => {
  it('레일의 [내보내기]를 누르면 메뉴 대신 화면 JPEG · 마스터 시트 · 이 단계 ZIP · 전체 프로젝트 ZIP 네 칸의 체크 창이 뜬다', () => {
    // 왜: 오너 결정 3 · 4 — 지금 메뉴의 기능 그대로를 체크 칸으로 골라 내보낸다. 칸 순서도 지금 메뉴 순서다.
    expect(EXPORT_CHOICES).toEqual(['screen', 'sheet', 'stage', 'project'])
    const html = body()
    expect(html.match(/type="checkbox"/g)).toHaveLength(4)
    const at = ['화면 JPEG로 저장', '마스터 시트 이미지로 저장', '이 단계 ZIP', '전체 프로젝트 ZIP'].map((label) => html.indexOf(label))
    expect(at.every((index) => index >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // 레일의 단추는 메뉴가 아니라 체크 창을 연다.
    expect(menuSource).not.toMatch(/DropdownMenu/)
    expect(menuSource).toMatch(/<Dialog open=\{open\}/)
    expect(menuSource).toMatch(/<ExportDialogBody/)
  })

  it('Writer · Artist · Storyboard · Director 에서 연 창에서는 네 칸을 모두 고를 수 있다', () => {
    // 왜: 정상 경로 고정 — 지금 메뉴와 같다(단계 id 는 producer=Writer · writer=Storyboard).
    for (const stage of ['producer', 'artist', 'writer', 'director'] as StageId[]) {
      expect(statesAt(stage).map((state) => state.enabled), stage).toEqual([true, true, true, true])
    }
  })

  it('Producer 시작 화면 · Editor 에서 연 창에서는 이 단계 ZIP 칸만 고를 수 없고 그 까닭이 보인다', () => {
    // 왜: 지금 메뉴와 같다 — 두 단계는 단계 ZIP 으로 묶을 자료가 없다. 고장: Editor 에서 [내보내기]를 열 때.
    for (const stage of ['entry', 'editor'] as StageId[]) {
      expect(statesAt(stage).map((state) => [state.choice, state.enabled]), stage).toEqual([
        ['screen', true],
        ['sheet', true],
        ['stage', false],
        ['project', true],
      ])
    }
    const html = body({ stage: 'editor' })
    expect(html).toMatch(/<input[^>]*disabled=""[^>]*data-testid="export-choice-stage"/)
    expect(html).not.toMatch(/<input[^>]*disabled=""[^>]*data-testid="export-choice-screen"/)
    expect(html).toContain('이 단계에서는 받을 수 없어요.')
  })

  it('요금제가 previz 내보내기를 열지 않으면 네 칸 모두 고를 수 없다', () => {
    // 왜: 지금 메뉴와 같다(2026-10-27 오너 "s2 내보내기 막으셈") — 요금제를 읽는 중이거나 읽지 못했을 때도 열지 않는다.
    for (const access of ['locked', 'checking', 'failed'] as PrevizExportAccess[]) {
      expect(statesAt('writer', access).every((state) => !state.enabled && state.blockedBy === 'plan'), access).toBe(true)
    }
    const html = body({ access: 'locked' })
    expect(html).toContain('Previz 데이터 내보내기는 Producer10 이상에서 쓸 수 있어요')
    expect(html).toContain('요금제 보기')
    expect(html.match(/<input[^>]*disabled=""/g)).toHaveLength(4)
  })

  it('창을 열 때마다 아무것도 체크돼 있지 않고, 아무것도 고르지 않으면 창의 [내보내기] 단추가 꺼진다', () => {
    // 왜: 실수로 전체 프로젝트 ZIP 같은 큰 받기가 시작되지 않게 한다(혼자 정함). 고른 것이 없으면 받을 것도 없다.
    expect(menuSource).toMatch(/const openChoices = \(\) => \{[\s\S]{0,200}setPicked\(new Set\(\)\)/)
    expect(exportRunList(new Set(), statesAt('writer'))).toEqual([])
    expect(body({ picked: [] })).toMatch(/<button[^>]*disabled=""[^>]*data-testid="export-start"/)
    expect(body({ picked: ['screen'] })).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="export-start"/)
  })

  it('창이 열린 뒤 고를 수 없게 된 칸은 체크돼 있어도 내보내지 않는다', () => {
    // 왜: 창을 열 때 요금제를 다시 읽는다 — 읽고 나니 잠긴 계정이면 이미 눌러 둔 체크가 남아 있어도 받지 않는다(혼자 정함).
    expect(exportRunList(new Set(['screen', 'stage']), statesAt('writer', 'locked'))).toEqual([])
    expect(exportRunList(new Set(['screen', 'stage']), statesAt('editor'))).toEqual(['screen'])
  })

  it('두 칸 이상 고르면 브라우저가 여러 파일 받기를 허용할지 물을 수 있다고 창에서 미리 알린다', () => {
    // 왜: 크롬은 두 번째 파일부터 여러 파일 다운로드를 허용할지 묻고, 막으면 아무 말 없이 안 받아진다(혼자 정함).
    expect(warnsMultipleDownloads(['screen'])).toBe(false)
    expect(warnsMultipleDownloads(['screen', 'project'])).toBe(true)
    const hint = '여러 개를 받으면 브라우저가 여러 파일 다운로드를 허용할지 물을 수 있어요.'
    expect(body({ picked: ['sheet'] })).not.toContain(hint)
    expect(body({ picked: ['sheet', 'stage'] })).toContain(hint)
  })
})

describe('[내보내기] 체크 창에서 고른 것을 받는 순서', () => {
  it('고른 칸만, 창의 순서대로 하나가 끝나면 다음 것을 내보낸다', async () => {
    // 왜: 한꺼번에 받으면 브라우저 · 메모리가 버겁다. 화면 JPEG 는 다른 받기(시트가 샷을 다시 읽는다)가 화면을 바꾸기 전에 찍는다(혼자 정함).
    const order: string[] = []
    const list = exportRunList(new Set(['project', 'screen', 'stage']), statesAt('writer'))
    expect(list).toEqual(['screen', 'stage', 'project'])
    await runExportChoices(list, { closeDialog: () => order.push('close'), dialogGone: async () => { order.push('gone') }, run: recorder(order) })
    expect(order).toEqual(['close', 'gone', 'screen:start', 'screen:end', 'stage:start', 'stage:end', 'project:start', 'project:end'])
  })

  it('화면 JPEG 는 내보내기 창이 다 닫힌 뒤에 찍어 창이 그림에 들어가지 않는다', async () => {
    // 왜: 창이 떠 있는 채로 찍으면 창과 어두운 막이 그림에 남는다 — 지금 메뉴도 메뉴가 닫힌 뒤에 찍었다.
    const order: string[] = []
    let finishClosing!: () => void
    const closing = new Promise<void>((resolve) => { finishClosing = resolve })
    const running = runExportChoices(['screen'], { closeDialog: () => order.push('close'), dialogGone: () => closing, run: recorder(order) })
    await flush()
    expect(order).toEqual(['close'])
    finishClosing()
    await running
    expect(order).toEqual(['close', 'screen:start', 'screen:end'])
    // 메뉴 파일은 창이 문서에서 사라질 때까지 기다린 뒤에 찍는다.
    expect(menuSource).toMatch(/dialogGone: \(\) => waitUntilGone\(/)
  })

  it('창이 사라지기를 기다리다가 2초가 지나면 더 기다리지 않고 이어서 받는다', async () => {
    // 왜: 창이 남아 있다고 받기가 멈추면 안 된다. 고장: 닫히는 움직임이 끝나지 않을 때(탭이 뒤로 가 애니메이션이 멈춘 때).
    let clock = 0
    const sleep = async (ms: number) => { clock += ms }
    let checks = 0
    await waitUntilGone(() => ++checks <= 3, sleep, () => clock)
    expect(checks).toBe(4)
    expect(clock).toBeLessThan(2000)
    clock = 0
    await waitUntilGone(() => true, sleep, () => clock)
    expect(clock).toBeGreaterThanOrEqual(2000)
    expect(clock).toBeLessThan(2100)
  })

  it('한 칸이 실패해도 나머지 칸은 이어서 내보낸다', async () => {
    // 왜: 칸끼리 서로 기대지 않는다 — 마스터 시트가 실패했다고 ZIP 을 못 받으면 안 된다. 실패 알림은 그 칸이 지금처럼 띄운다(혼자 정함).
    const order: string[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runExportChoices(['screen', 'sheet', 'project'], { closeDialog: () => {}, dialogGone: async () => {}, run: recorder(order, ['sheet']) })
    warn.mockRestore()
    expect(order).toEqual(['screen:start', 'screen:end', 'sheet:start', 'project:start', 'project:end'])
  })
})
