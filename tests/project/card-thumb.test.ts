// 프로젝트 카드 썸네일 — 못 읽으면 깨진 그림 대신 그림 없는 카드와 같은 이름 첫 글자 타일(리드 2026-11-09, 11/5 시안 R2)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const mocks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))

// 화면 함수를 React 밖에서 부른다 — 상태 칸만 시험이 들고 있는다(로그인 시험과 같은 방식).
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = mocks.cursor++
    if (!(slot in mocks.slots)) mocks.slots[slot] = initial
    return [mocks.slots[slot], (value: unknown) => { mocks.slots[slot] = value }]
  },
}))

import { ProjectCardArt, ProjectThumb } from '@/features/projects/project-card-art'

type Element = ReactElement<Record<string, unknown>>
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elements(node.props.children as ReactNode)]
}
function render(props: { url: string | null; title: string }): Element[] {
  mocks.cursor = 0
  return elements(ProjectCardArt(props))
}
const letters = (nodes: Element[]) => nodes.flatMap((node) => (typeof node.props.children === 'string' ? [node.props.children] : []))
const BROKEN = 'http://127.0.0.1:3001/storage/v1/object/public/media/thumb.png'

beforeEach(() => {
  mocks.slots = []
  mocks.cursor = 0
})

describe('프로젝트 카드 썸네일', () => {
  // 왜: 썸네일 파일이 없어졌거나 주소를 못 읽으면 브라우저의 깨진 그림 표시가 카드에 그대로 드러났다(개발 DB 시험 프로젝트 · 운영에서 파일이 지워진 경우).
  it('프로젝트 카드 썸네일을 못 읽으면 깨진 그림 대신 이름 첫 글자 타일을 보인다', () => {
    const first = render({ url: BROKEN, title: '자판기의 반란' })
    const thumb = first.find((node) => node.type === ProjectThumb)
    expect(thumb).toBeDefined()
    ;(thumb!.props.onError as () => void)()

    const after = render({ url: BROKEN, title: '자판기의 반란' })
    expect(after.find((node) => node.type === ProjectThumb)).toBeUndefined()
    expect(letters(after)).toContain('자')
  })

  // 왜: 정상 경로 고정 — 그림이 아직 없는 카드는 지금처럼 이름 첫 글자 타일이고, 못 읽은 카드도 같은 모양이다.
  it('썸네일이 없는 카드는 이름 첫 글자 타일을 보이고 이름이 없으면 U 를 보인다', () => {
    expect(letters(render({ url: null, title: 'hong kong love story' }))).toContain('H')
    expect(letters(render({ url: null, title: '' }))).toContain('U')
  })

  // 왜: 썸네일이 새 그림으로 바뀌면(주소가 바뀌면) 한 번 못 읽었던 카드도 새 그림을 다시 읽어 본다.
  it('썸네일 주소가 바뀌면 새 썸네일을 다시 읽어 본다', () => {
    const first = render({ url: BROKEN, title: '자판기의 반란' })
    ;(first.find((node) => node.type === ProjectThumb)!.props.onError as () => void)()
    const next = render({ url: 'https://media.test/thumb-2.png', title: '자판기의 반란' })
    expect(next.find((node) => node.type === ProjectThumb)?.props.url).toBe('https://media.test/thumb-2.png')
  })

  // 왜: 썸네일 그림은 이 부품 하나로만 그린다 — 목록 화면에 따로 그린 그림 자리가 있으면 그쪽은 깨진 그림을 다시 드러낸다.
  it('프로젝트 목록 카드는 이 그림 자리 부품을 쓴다', () => {
    const page = readFileSync('src/app/projects/page.tsx', 'utf8')
    expect(page).toContain('<ProjectCardArt url={project.thumbnail_url} title={project.title} />')
    expect(page).not.toContain('<img')
  })
})
