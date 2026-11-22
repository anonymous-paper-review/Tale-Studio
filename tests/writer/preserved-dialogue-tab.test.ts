// 원본 그대로(대본 보존) 프로젝트의 콘티 대사 탭에는 [대사 다시 생성]이 없고, 대사 줄은 그 자리에서 손으로 고칠 수 있다 (D15 오너 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({
  writer: {
    sceneManifest: {
      characters: [{ characterId: 'min_ho', name: '민호' }],
      locations: [],
      scenes: [{ sceneId: 'sc_01', location: '복도', mood: '' }],
    },
    shots: [
      { shotId: 'sh_01_01', sceneId: 'sc_01', shotType: 'MS', actionDescription: '민호가 자판기 앞에 선다.', dialogueLines: [{ characterId: 'min_ho', text: '아, 또야?', emotion: '', delivery: '', durationHint: 1 }] },
    ] as Array<Record<string, unknown>>,
    loadProject: vi.fn(),
  },
  preserved: false,
}))
vi.mock('@/stores/writer-store', () => ({ useWriterStore: (select: (s: unknown) => unknown) => select(data.writer) }))
vi.mock('@/stores/project-store', () => ({ useProjectStore: (select: (s: unknown) => unknown) => select({ projectId: 'p' }) }))
vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})
vi.mock('@/hooks/use-guarded-action', () => ({ useGuardedAction: () => ({ run: vi.fn(), locked: false }) }))
vi.mock('@/features/writer/writer-header', () => ({ WriterHeader: () => null }))

import { DialogueView } from '@/features/writer/dialogue-view'
import { scriptKeptAsWritten } from '@/lib/writer/preserved-run'

// 대사 탭은 인자 없이도 그려진다(다른 시험이 DialogueView() 로 부른다) — 여기서는 원본 그대로 표시를 넘긴다.
const View = DialogueView as unknown as FunctionComponent<{ preserved?: boolean }>
const html = () => renderToStaticMarkup(createElement(View, { preserved: data.preserved }))

beforeEach(() => {
  data.preserved = false
  data.writer.shots = [
    { shotId: 'sh_01_01', sceneId: 'sc_01', shotType: 'MS', actionDescription: '민호가 자판기 앞에 선다.', dialogueLines: [{ characterId: 'min_ho', text: '아, 또야?', emotion: '', delivery: '', durationHint: 1 }] },
  ]
})

describe('원본 그대로 프로젝트의 대사 탭', () => {
  it('원본 그대로 프로젝트의 대사 탭에는 [대사 다시 생성] · [대사 생성] 단추가 없다', () => {
    // 왜: D15 — 원작 대사를 지킨다. AI 가 대사를 새로 쓰는 단추를 두지 않는다.
    data.preserved = true
    const out = html()
    expect(out).not.toContain('대사 재생성')
    expect(out).not.toContain('대사 생성')
  })

  it('원본 그대로 프로젝트에서도 대사 줄은 그 자리에서 손으로 고칠 수 있다', () => {
    // 왜: D15 "손으로 고치기는 허용" — 막는 것은 AI 가 대사를 새로 쓰는 것뿐이다.
    data.preserved = true
    const line = html().match(/<div[^>]*data-testid="dialogue-line"[^>]*>/)?.[0] ?? ''
    expect(line).toContain('role="button"')
    expect(line).not.toContain('aria-disabled="true"')
  })

  it('원본 그대로 프로젝트에 대사가 하나도 없으면 [대사 생성]을 권하지 않고 샷 고치기 창에서 대사를 더할 수 있다고 알린다', () => {
    // 왜(혼자 정한 것): 빈 대사 안내가 "위의 대사 생성을 누르라"고 하면 없는 단추를 가리킨다.
    data.preserved = true
    data.writer.shots = [{ ...data.writer.shots[0], dialogueLines: [] }]
    const out = html()
    expect(out).toContain('원본 대본 그대로 만드는 프로젝트라 대사를 새로 쓰지 않아요. 샷마다 연필 단추로 대사를 더할 수 있어요.')
    expect(out).not.toContain('위의 &quot;대사 생성&quot;')
  })

  it('원본 그대로가 아닌 프로젝트의 대사 탭에는 지금처럼 [대사 다시 생성]이 있다', () => {
    // 왜: 정상 경로 고정 — 원본 그대로가 아니면 대사를 AI 로 다시 쓸 수 있다.
    data.preserved = false
    expect(html()).toContain('대사 재생성')
  })

  it('콘티 화면은 시작할 때 고른 "원본 그대로"로 판별해 대사 탭에 넘긴다 — 그대로 쓰기를 고른 대본이 있을 때만', () => {
    // 왜: 산문 화면이 원본 그대로를 보이는 판별(use-prose showOriginal)과 같아야 한 프로젝트가 화면마다 다르게 굴지 않는다.
    expect(scriptKeptAsWritten({ preserveScript: true, storyText: 'INT. 복도 - 낮' })).toBe(true)
    expect(scriptKeptAsWritten({ preserveScript: true, storyText: '  ' })).toBe(false)
    expect(scriptKeptAsWritten({ preserveScript: false, storyText: 'INT. 복도 - 낮' })).toBe(false)
    expect(scriptKeptAsWritten({ preserveScript: null, storyText: 'INT. 복도 - 낮' })).toBe(false)
    expect(readFileSync('src/features/writer/writer-workspace.tsx', 'utf8')).toMatch(/<DialogueView preserved=\{preserved\} \/>/)
  })
})
