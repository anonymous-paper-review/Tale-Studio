// 데모에서는 프로젝트 자료를 안전하게 보여 주고 실제 자료 변경은 일어나지 않게 한다
import { describe, it, expect, beforeEach } from 'vitest'
import { setDemoSnapshot, parseShareParam, withDemoShare } from '@/lib/demo/context'
import { createDemoClient } from '@/lib/demo/supabase-shim'
import { classifyDemoFetch } from '@/lib/demo/fetch-guard'
import { CANNED_CHAT } from '@/lib/demo/canned'
import type { ProjectSnapshot } from '@/lib/demo/types'
import { hasDemoCookie, demoWriteBlock } from '@/lib/demo/guard-server'

const snap: ProjectSnapshot = {
  version: 1,
  capturedAt: 0,
  projectId: 'p1',
  workspaceId: 'w1',
  project: { id: 'p1', title: 'T' },
  tables: {
    characters: [
      { character_id: 'c1', project_id: 'p1', name: 'A', sort_order: 2 },
      { character_id: 'c2', project_id: 'p1', name: 'B', sort_order: 1 },
      { character_id: 'c3', project_id: 'p2', name: 'X', sort_order: 0 },
    ],
  },
}

describe('데모 프로젝트 자료 이용 규칙', () => {
  beforeEach(() => setDemoSnapshot(snap))

  it('데모 자료에서 선택한 프로젝트의 등장인물만 보여 준다', async () => {
    const db = createDemoClient()
    const { data, error } = await db
      .from('characters')
      .select('*')
      .eq('project_id', 'p1')
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBe(2)
  })

  it('정렬과 개수 제한을 적용해 첫 번째 자료만 보여 준다', async () => {
    const db = createDemoClient()
    const { data } = await db
      .from('characters')
      .select('*')
      .eq('project_id', 'p1')
      .order('sort_order')
      .limit(1)
      .maybeSingle()
    expect((data as { character_id: string }).character_id).toBe('c2')
  })

  it('데모에서 자료를 바꿔도 실제 내용은 바뀌지 않는다', async () => {
    const db = createDemoClient()
    const { data, error } = await db
      .from('characters')
      .update({ name: 'Z' })
      .eq('character_id', 'c1')
    expect(data).toBeNull()
    expect(error).toBeNull()
  })

  it('없는 자료 종류를 요청하면 결과가 없다고 보여 준다', async () => {
    const db = createDemoClient()
    const { data } = await db.from('nope').select('*')
    expect(data).toEqual([])
  })
})

describe('데모에서 자료 요청을 처리하는 방식', () => {
  it('공유 링크와 화면 자료 요청은 그대로 통과시킨다', () => {
    expect(classifyDemoFetch('/api/share/abc', 'GET')).toBe('passthrough')
    expect(classifyDemoFetch('https://x.com/api/share/abc/', 'GET')).toBe(
      'passthrough',
    )
    expect(classifyDemoFetch('/foo.png', 'GET')).toBe('passthrough')
    expect(classifyDemoFetch('blob:xyz', 'GET')).toBe('passthrough')
  })

  it('읽기 요청은 데모 자료로 응답한다', () => {
    expect(classifyDemoFetch('/api/project/init', 'GET')).toBe('read-noop')
    expect(classifyDemoFetch('/api/project/123/messages', 'GET')).toBe(
      'read-noop',
    )
  })

  it('자료를 바꾸거나 만들기 요청은 실제로 처리하지 않는다', () => {
    expect(classifyDemoFetch('/api/artist/generate-sheet', 'POST')).toBe(
      'write-noop',
    )
    expect(classifyDemoFetch('/api/project/123', 'PATCH')).toBe('write-noop')
    expect(classifyDemoFetch('/api/editor/state', 'PUT')).toBe('write-noop')
  })
})

describe('단계별 데모 대화', () => {
  it('모든 작업 단계에 데모 대화가 준비되어 있다', () => {
    for (const s of [
      'producer',
      'writer',
      'artist',
      'director',
      'editor',
    ] as const) {
      expect(typeof CANNED_CHAT[s]).toBe('string')
      expect(CANNED_CHAT[s].length).toBeGreaterThan(0)
    }
  })
})

describe('데모 접근 보호', () => {
  const withCookie = (v: string) =>
    new Request('https://x.com/api/artist/generate-sheet', {
      method: 'POST',
      headers: { cookie: v },
    })

  it('데모 공유 표시가 있는지 확인한다', () => {
    expect(hasDemoCookie(withCookie('demo_share=abc'))).toBe(true)
    expect(hasDemoCookie(withCookie('other=1'))).toBe(false)
    expect(hasDemoCookie(new Request('https://x.com/'))).toBe(false)
  })

  it('데모 공유 상태에서는 자료 변경을 막는다', () => {
    expect(demoWriteBlock(withCookie('demo_share=abc'))?.status).toBe(403)
    expect(demoWriteBlock(withCookie('x=1'))).toBeNull()
  })
})

describe('주소로 공유 링크를 여는 경우', () => {
  // 실 토큰 형태(64-hex)와 동일한 합성 값 — 라이브 공유 토큰을 저장소에 남기지 않는다.
  const token = '0123456789abcdef'.repeat(4)

  it('올바른 64자리 공유 링크를 읽는다', () => {
    expect(parseShareParam(`?share=${token}`)).toBe(token)
    expect(parseShareParam(`?projectId=p1&share=${token}`)).toBe(token)
  })

  it('형식이 잘못된 공유 링크는 거부한다', () => {
    expect(parseShareParam('?share=short')).toBeNull()
    expect(parseShareParam(`?share=${token}zz`)).toBeNull()
    expect(parseShareParam('?share=')).toBeNull()
    expect(parseShareParam('')).toBeNull()
  })

  it('브라우저 밖에서는 주소를 그대로 둔다', () => {
    // node 컨텍스트(document 없음)에선 데모 판정 불가 → 경로 그대로.
    expect(withDemoShare('/studio/writer')).toBe('/studio/writer')
  })
})
