import { describe, it, expect } from 'vitest'
import {
  writerRoughWork,
  artistImageWork,
  directorShotImageWork,
  directorVideoWork,
} from '@/lib/pipeline-progress'
import type { DirectorNode } from '@/types/director'

// #chat-progress-pin — 채팅 상단 고정 진행도의 파생 규칙.
// 핵심 계약: "생성 중(generating)이 하나라도 있을 때만" 핀이 뜬다 — 완료/실패만 남으면 null
// (핀 해제 → 온보딩/완료 브리핑이 그 자리를 잇는다).

const roughShot = (status: string | null, action = '달린다') => ({
  actionDescription: action,
  roughStoryboard: status ? { status } : null,
})

describe('writerRoughWork', () => {
  it('생성 중 패널이 없으면 null (전부 완료 = 핀 해제)', () => {
    expect(writerRoughWork([])).toBeNull()
    expect(writerRoughWork([roughShot('completed'), roughShot('completed')])).toBeNull()
  })

  it('생성 중이면 완료/전체/실패 개수를 파생한다', () => {
    const work = writerRoughWork([
      roughShot('completed'),
      roughShot('generating'),
      roughShot('failed'),
      roughShot(null),
    ])
    expect(work).toMatchObject({ done: 1, total: 4, failed: 1 })
  })

  it('액션 없는 샷은 생성 자격이 없어 분모에서 빠진다', () => {
    const work = writerRoughWork([
      roughShot('generating'),
      roughShot(null, ''),
      roughShot(null, '  '),
    ])
    expect(work).toMatchObject({ done: 0, total: 1 })
  })
})

describe('artistImageWork', () => {
  const base = {
    imagesReady: false,
    stalled: false,
    failed: false,
    progress: { ready: 2, total: 5 },
    generatingCount: 0,
  }

  it('초기 잠금 구간: 서버 집계 ready/total 을 그대로 노출', () => {
    expect(artistImageWork(base)).toMatchObject({ done: 2, total: 5 })
  })

  it('stalled/failed 로 큐가 멈추면 "진행 중"이 아니므로 null', () => {
    expect(artistImageWork({ ...base, stalled: true })).toBeNull()
    expect(artistImageWork({ ...base, failed: true })).toBeNull()
  })

  it('잠금 해제 후엔 in-flight 재생성 개수로만 뜬다', () => {
    expect(artistImageWork({ ...base, imagesReady: true })).toBeNull()
    const work = artistImageWork({ ...base, imagesReady: true, generatingCount: 3 })
    expect(work?.label).toContain('3건')
    expect(work?.total).toBeUndefined()
  })
})

// 노드 타입 가드는 data.kind 만 본다 — 테스트는 최소 형태로 구성.
const node = (data: Record<string, unknown>) => ({ data }) as unknown as DirectorNode

describe('directorShotImageWork', () => {
  it('생성 중 샷이 없으면 null', () => {
    expect(directorShotImageWork([])).toBeNull()
    expect(
      directorShotImageWork([
        node({ kind: 'shot', storyboardImage: { status: 'completed' } }),
      ]),
    ).toBeNull()
  })

  it('생성 중이면 샷 노드만 세어 완료/전체를 파생 (다른 노드 무시)', () => {
    const work = directorShotImageWork([
      node({ kind: 'shot', storyboardImage: { status: 'completed' } }),
      node({ kind: 'shot', storyboardImage: { status: 'generating' } }),
      node({ kind: 'shot', storyboardImage: null }),
      node({ kind: 'scene' }),
      node({ kind: 'video', status: 'generating' }),
    ])
    expect(work).toMatchObject({ done: 1, total: 3 })
    expect(work?.failed).toBeUndefined()
  })
})

describe('directorVideoWork', () => {
  it('생성 중 비디오 노드가 있을 때만 완료/전체/실패를 파생', () => {
    expect(directorVideoWork([node({ kind: 'video', status: 'completed' })])).toBeNull()
    const work = directorVideoWork([
      node({ kind: 'video', status: 'generating' }),
      node({ kind: 'video', status: 'completed' }),
      node({ kind: 'video', status: 'failed' }),
      node({ kind: 'shot', storyboardImage: { status: 'generating' } }),
    ])
    expect(work).toMatchObject({ done: 1, total: 3, failed: 1 })
  })
})
