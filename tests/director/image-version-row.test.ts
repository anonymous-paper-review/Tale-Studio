// 샷 상세 이미지 탭의 버전 줄은 버전을 다 남기되 한 번에 5개만 보이고, 왼쪽 · 오른쪽 단추로 이전 · 다음 버전을 넘겨 본다 (오너 2026-11-14 답 5)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/generation-queue', async (original) => ({
  ...await original<typeof import('@/lib/generation-queue')>(),
  useActiveGenerationJobs: () => [],
  useGenerationQueueStatus: () => 'ready',
}))
vi.mock('@/lib/use-debug-prompts', () => ({ useDebugPrompts: () => false }))
vi.mock('@/lib/billing/use-take-balance', () => ({ useTakeBalance: () => ({ balance: 100, mode: 'shadow', loading: false }) }))

import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { useDirectorCanvasStore as director } from '@/stores/director-store'
import { useLocaleStore } from '@/stores/locale-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { selectStoryboardVersion, storyboardImageVersions, withStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { shownVersionRowPage, versionRowPageOf, versionRowView } from '@/lib/director/image-version-row'
import type { StoryboardImage } from '@/types/director'

let shotId = ''

function setLocale(locale: 'ko' | 'en') {
  useLocaleStore.setState({ locale })
  Object.assign(useLocaleStore.getInitialState(), useLocaleStore.getState())
}
const render = (layout: 'popup' | 'panel') => {
  Object.assign(director.getInitialState(), director.getState())
  Object.assign(useProjectFormatStore.getInitialState(), useProjectFormatStore.getState())
  return renderToStaticMarkup(createElement(DirectorShotDetail, { shotNodeId: shotId, initialTab: 'image', layout, onClose: () => {} }))
}
const version = (n: number) => ({
  id: `job-${n}`,
  url: `https://media.test/v${n}-s.png`,
  frames: { start: `https://media.test/v${n}-s.png`, direction: `https://media.test/v${n}-d.png`, end: `https://media.test/v${n}-e.png` },
  generatedAt: n,
  source: 'generated' as const,
})
/** v1 … v{count} 를 차례로 만든 그림 — 마지막에 만든 것이 지금 그림. selected 를 주면 그 버전을 골라 둔다. */
function made(count: number, selected?: number): StoryboardImage {
  let image: StoryboardImage | null = null
  for (let n = 1; n <= count; n++) image = withStoryboardVersion(image, version(n), { select: true })
  return selected ? selectStoryboardVersion(image, `job-${selected}`)! : image!
}
/** 멈춘 뒤 끝난 그림만 있는 샷 — 지금 그림이 없다. */
function stoppedOnly(count: number): StoryboardImage {
  let image: StoryboardImage | null = null
  for (let n = 1; n <= count; n++) image = withStoryboardVersion(image, { ...version(n), cancelled: true }, { select: false })
  return image!
}
const useImage = (image: StoryboardImage) => director.getState().updateNodeData<'shot'>(shotId, { storyboardImage: image })
/** 버전 줄(여는 태그부터 닫는 태그까지). */
function row(out: string): string {
  const at = out.indexOf('data-testid="shot-detail-versions"')
  expect(at, 'version row').toBeGreaterThan(-1)
  const start = out.lastIndexOf('<div', at)
  return out.slice(start, out.indexOf('</div>', at) + '</div>'.length)
}
/** 버전 줄에 보이는 칩 글. */
const chips = (out: string) => [...row(out).matchAll(/>(v\d+)</g)].map((m) => m[1])
/** 그 화면 읽기 이름을 가진 단추의 여는 태그 — 없으면 null. */
function arrowTag(out: string, label: string): string | null {
  const at = row(out).indexOf(`aria-label="${label}"`)
  if (at < 0) return null
  const html = row(out)
  const start = html.lastIndexOf('<button', at)
  return html.slice(start, html.indexOf('>', start) + 1)
}
const names = (list: Array<{ n: number }>) => list.map((v) => `v${v.n}`)
const source = () => readFileSync('src/features/director/shot-detail/shot-image-tab.tsx', 'utf8')

beforeEach(() => {
  director.setState({ projectId: 'version-row-project', nodes: [], edges: [], realBatchBusy: false, generatingNodeIds: {} })
  shotId = director.getState().addShotNode(null, { x: 0, y: 0 })
  director.getState().updateNodeData<'shot'>(shotId, { writerShotId: 'sh_01_01' })
  useProjectFormatStore.setState({ format: 'horizontal_16:9' })
  setLocale('en')
})

describe('같이 정한 것', () => {
  it('버전이 5개를 넘어도 버전은 다 남고, 버전 줄에는 한 번에 5개만 보인다', () => {
    // 왜: 오너 11/14 답 5 "다 남기되 보여주는 건 5개로" — 예전엔 만든 만큼 줄이 길어져 옆으로 밀어 봐야 했다.
    const image = made(12)
    expect(storyboardImageVersions(image)).toHaveLength(12)
    useImage(image)
    expect(chips(render('popup'))).toEqual(['v8', 'v9', 'v10', 'v11', 'v12'])
    expect(chips(render('panel'))).toEqual(['v8', 'v9', 'v10', 'v11', 'v12'])
  })

  it('버전 줄의 왼쪽 단추를 누르면 이전 버전 5개가, 오른쪽 단추를 누르면 다음 버전 5개가 보인다', () => {
    // 왜: 오너 11/14 답 5 "오른쪽 왼쪽 버튼으로 … 이전껄 볼 수 있게" — 5개만 보여도 옛 버전으로 돌아갈 수 있어야 한다.
    const versions = storyboardImageVersions(made(12))
    const after = (page: number) => names(versionRowView(versions, shownVersionRowPage(versions, 'job-12', { anchor: 'job-12', page })).shown)
    expect(after(0)).toEqual(['v8', 'v9', 'v10', 'v11', 'v12'])
    expect(after(1)).toEqual(['v3', 'v4', 'v5', 'v6', 'v7'])
    expect(after(2)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
    // 단추가 쪽을 옮긴다 — 왼쪽은 한 쪽 이전(+1), 오른쪽은 한 쪽 다음(-1).
    expect(source()).toMatch(/aria-label=\{t\('Show earlier versions'\)\}[^>]*onClick=\{\(\) => moveVersions\(1\)\}/)
    expect(source()).toMatch(/aria-label=\{t\('Show later versions'\)\}[^>]*onClick=\{\(\) => moveVersions\(-1\)\}/)
    useImage(made(12))
    const out = render('popup')
    expect(arrowTag(out, 'Show earlier versions')).not.toContain('disabled=""')
    expect(arrowTag(out, 'Show later versions')).toContain('disabled=""')
  })
})

describe('혼자 정한 것', () => {
  it('상세를 열면 버전 줄은 지금 그림인 버전이 든 5개를 보이고, 지금 그림이 없으면 가장 새 5개를 보인다', () => {
    // 왜: 무엇이 지금 그림인지 눌린 칩으로 보여야 한다 — 옛 버전(v2)을 고른 뒤 상세를 다시 열어도 v2 가 보인다. 보통은 가장 새 것이 지금 그림이다.
    useImage(made(12, 2))
    const out = render('popup')
    expect(chips(out)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
    expect(row(out)).toMatch(/aria-pressed="true"[^>]*>v2</)
    // 멈춘 뒤 끝난 그림만 있는 샷(지금 그림 없음) — 가장 새 5개, 눌린 칩 없음.
    useImage(stoppedOnly(7))
    const none = render('popup')
    expect(chips(none)).toEqual(['v3', 'v4', 'v5', 'v6', 'v7'])
    expect(row(none)).not.toContain('aria-pressed="true"')
  })

  it('쪽은 가장 새 버전부터 5개씩 끊고, 맨 앞 쪽은 v1 부터 5개를 채운다 — 버전이 7개면 v3~v7 과 v1~v5 다', () => {
    // 왜: 버전이 5개를 넘으면 어느 쪽이든 5개가 보인다 — v1 부터 끊으면 가장 새 쪽에 한두 개만 덩그러니 남는다.
    const versions = storyboardImageVersions(made(7))
    expect(names(versionRowView(versions, 0).shown)).toEqual(['v3', 'v4', 'v5', 'v6', 'v7'])
    expect(names(versionRowView(versions, 1).shown)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
    expect(versionRowPageOf(7, 1)).toBe(1)
    expect(versionRowPageOf(7, 2)).toBe(0)
  })

  it('맨 앞 쪽에서는 왼쪽 단추가, 가장 새 쪽에서는 오른쪽 단추가 꺼지고 단추 자리는 그대로다', () => {
    // 왜: 디자이너 규칙 R "단추는 늘 같은 자리 · 할 게 없으면 꺼짐" — 끝에서 처음으로 돌지 않는다.
    useImage(made(12, 1))
    const oldest = render('panel')
    expect(chips(oldest)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
    expect(arrowTag(oldest, 'Show earlier versions')).toContain('disabled=""')
    expect(arrowTag(oldest, 'Show later versions')).not.toContain('disabled=""')
    // 단추는 줄의 맨 앞 · 맨 뒤에 있다.
    expect(row(oldest).indexOf('Show earlier versions')).toBeLessThan(row(oldest).indexOf('>v1<'))
    expect(row(oldest).indexOf('Show later versions')).toBeGreaterThan(row(oldest).indexOf('>v5<'))
    const versions = storyboardImageVersions(made(12))
    expect(versionRowView(versions, 2)).toMatchObject({ earlier: false, later: true })
    expect(versionRowView(versions, 0)).toMatchObject({ earlier: true, later: false })
    expect(versionRowView(versions, 5).page).toBe(2)
  })

  it('버전이 5개 이하면 넘기기 단추가 없다', () => {
    // 왜: 시안 D6(v1 · v2)에 넘기기 단추가 없고 넘길 것도 없다. 정상 경로 고정.
    useImage(made(5))
    const out = render('popup')
    expect(chips(out)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5'])
    expect(arrowTag(out, 'Show earlier versions')).toBeNull()
    expect(arrowTag(out, 'Show later versions')).toBeNull()
  })

  it('지금 그림이 바뀌면(새로 만든 그림 · Lumi 그림 · 올린 그림) 버전 줄은 지금 그림이 든 쪽으로 가고, 멈춘 뒤 끝난 그림이 쌓일 때는 보던 쪽 그대로다', () => {
    // 왜: 다시 만들기가 끝나면 새 그림이 눌린 칩으로 바로 보여야 다 됐다는 것을 안다. 멈춘 뒤 끝난 그림은 지금 그림을 바꾸지 않는다(오너 7번).
    const twelve = storyboardImageVersions(made(12))
    const back = { anchor: 'job-12', page: 2 }
    expect(shownVersionRowPage(twelve, 'job-12', back)).toBe(2)
    // 새 그림 v13 이 지금 그림이 됨 → 가장 새 쪽.
    const thirteen = storyboardImageVersions(made(13))
    expect(names(versionRowView(thirteen, shownVersionRowPage(thirteen, 'job-13', back)).shown)).toEqual(['v9', 'v10', 'v11', 'v12', 'v13'])
    // 멈춘 뒤 끝난 v13 은 지금 그림이 아니다 → 보던 쪽(2) 그대로.
    const withStopped = storyboardImageVersions(withStoryboardVersion(made(12), { ...version(13), cancelled: true }, { select: false }))
    expect(shownVersionRowPage(withStopped, 'job-12', back)).toBe(2)
  })

  it('버전 줄에서 버전을 누르면 그 버전이 지금 그림이 되고 줄은 보던 쪽 그대로다', () => {
    // 왜: 맨 앞 쪽(v1~v5)은 다음 쪽(v3~v7)과 겹친다 — 맨 앞 쪽에서 v4 를 눌렀는데 줄이 v3~v7 로 튀면 어디를 보던지 놓친다.
    const versions = storyboardImageVersions(made(12))
    expect(shownVersionRowPage(versions, 'job-4', { anchor: 'job-4', page: 2 })).toBe(2)
    expect(source()).toMatch(/setVersionMove\(\{ anchor: version\.id, page: versionRow\.page \}\)/)
    expect(source()).toMatch(/selectStoryboardImageVersion\(nodeId, version\.id\)/)
  })

  it('넘기기 단추의 화면 읽기 이름은 "이전 버전 보기" · "다음 버전 보기"이고, 마우스를 올려도 같은 말이 보인다', () => {
    // 왜: 아이콘(‹ ›)만 있는 단추라 화면 읽기와 마우스에 이름이 있어야 한다.
    useImage(made(9))
    const en = render('popup')
    expect(arrowTag(en, 'Show earlier versions')).toContain('title="Show earlier versions"')
    expect(arrowTag(en, 'Show later versions')).toContain('title="Show later versions"')
    setLocale('ko')
    const ko = render('popup')
    expect(arrowTag(ko, '이전 버전 보기')).toContain('title="이전 버전 보기"')
    expect(arrowTag(ko, '다음 버전 보기')).toContain('title="다음 버전 보기"')
  })

  it('스토리보드형 팝업과 노드형 왼쪽 패널은 같은 버전 줄(5개 · 넘기기 단추)을 보인다', () => {
    // 왜: 두 상세는 내용이 같다(디자이너 11/13 D6 · D7) — 한쪽만 넘겨 볼 수 있으면 안 된다.
    useImage(made(9))
    expect(row(render('panel'))).toBe(row(render('popup')))
  })
})
