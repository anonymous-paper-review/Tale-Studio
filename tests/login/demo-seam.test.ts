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

describe('demo supabase shim', () => {
  beforeEach(() => setDemoSnapshot(snap))

  it('filters by eq from snapshot (no real DB)', async () => {
    const db = createDemoClient()
    const { data, error } = await db
      .from('characters')
      .select('*')
      .eq('project_id', 'p1')
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBe(2)
  })

  it('orders ascending + limit + maybeSingle', async () => {
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

  it('writes are no-op', async () => {
    const db = createDemoClient()
    const { data, error } = await db
      .from('characters')
      .update({ name: 'Z' })
      .eq('character_id', 'c1')
    expect(data).toBeNull()
    expect(error).toBeNull()
  })

  it('missing table → empty array', async () => {
    const db = createDemoClient()
    const { data } = await db.from('nope').select('*')
    expect(data).toEqual([])
  })
})

describe('demo fetch classification', () => {
  it('passes share endpoints and non-api', () => {
    expect(classifyDemoFetch('/api/share/abc', 'GET')).toBe('passthrough')
    expect(classifyDemoFetch('https://x.com/api/share/abc/', 'GET')).toBe(
      'passthrough',
    )
    expect(classifyDemoFetch('/foo.png', 'GET')).toBe('passthrough')
    expect(classifyDemoFetch('blob:xyz', 'GET')).toBe('passthrough')
  })

  it('read-noop on api GET', () => {
    expect(classifyDemoFetch('/api/project/init', 'GET')).toBe('read-noop')
    expect(classifyDemoFetch('/api/project/123/messages', 'GET')).toBe(
      'read-noop',
    )
  })

  it('write-noop on api mutation/generation', () => {
    expect(classifyDemoFetch('/api/artist/generate-sheet', 'POST')).toBe(
      'write-noop',
    )
    expect(classifyDemoFetch('/api/project/123', 'PATCH')).toBe('write-noop')
    expect(classifyDemoFetch('/api/editor/state', 'PUT')).toBe('write-noop')
  })
})

describe('canned chat', () => {
  it('covers all stages', () => {
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

describe('demo server guard', () => {
  const withCookie = (v: string) =>
    new Request('https://x.com/api/artist/generate-sheet', {
      method: 'POST',
      headers: { cookie: v },
    })

  it('detects demo cookie', () => {
    expect(hasDemoCookie(withCookie('demo_share=abc'))).toBe(true)
    expect(hasDemoCookie(withCookie('other=1'))).toBe(false)
    expect(hasDemoCookie(new Request('https://x.com/'))).toBe(false)
  })

  it('blocks writes with 403 when demo cookie present', () => {
    expect(demoWriteBlock(withCookie('demo_share=abc'))?.status).toBe(403)
    expect(demoWriteBlock(withCookie('x=1'))).toBeNull()
  })
})

describe('share url ticket (URL 티켓 방식)', () => {
  // 실 토큰 형태(64-hex)와 동일한 합성 값 — 라이브 공유 토큰을 저장소에 남기지 않는다.
  const token = '0123456789abcdef'.repeat(4)

  it('parses valid 64-hex share param', () => {
    expect(parseShareParam(`?share=${token}`)).toBe(token)
    expect(parseShareParam(`?projectId=p1&share=${token}`)).toBe(token)
  })

  it('rejects malformed tokens', () => {
    expect(parseShareParam('?share=short')).toBeNull()
    expect(parseShareParam(`?share=${token}zz`)).toBeNull()
    expect(parseShareParam('?share=')).toBeNull()
    expect(parseShareParam('')).toBeNull()
  })

  it('withDemoShare is a no-op outside browser (SSR/node)', () => {
    // node 컨텍스트(document 없음)에선 데모 판정 불가 → 경로 그대로.
    expect(withDemoShare('/studio/writer')).toBe('/studio/writer')
  })
})
