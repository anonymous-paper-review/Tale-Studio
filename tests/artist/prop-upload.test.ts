// 소품 그림 올리기 — 소품 창에서 그림을 올리면 그림 사용 권리를 확인한 뒤 그 소품의 그림으로 그대로 쓰고, 이 프로젝트에 올린 그림만 받는다 (D7, 2026-11-22)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
  characters: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const filters: Array<[string, unknown]> = []
      const chain: Record<string, unknown> = {}
      const rows = () => ((table === 'projects' ? [{ id: 'project-1', workspace_id: 'ws-1' }] : db[table as 'props' | 'characters']) ?? []).filter((row) => filters.every(([c, v]) => row[c] === v))
      chain.select = () => chain
      chain.eq = (column: string, value: unknown) => { filters.push([column, value]); return chain }
      chain.update = (values: Record<string, unknown>) => { db.updates.push({ table, values }); return chain }
      chain.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve)
      return chain
    },
  },
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: async (_req: Request, projectId: string) => ({ ok: true, projectId, userId: 'user-1', viaShare: false }) }))

import { PATCH as patchPropImage } from '@/app/api/artist/prop-image/route'
import { addPropImage } from '@/lib/artist/prop-upload'
import { PropDetailPanels } from '@/features/artist/prop-view-dialog'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { mediaPublicUrl } from '@/lib/storage/media'
import type { PropAsset } from '@/types'

const OWN = mediaPublicUrl('ws-1/project-1/breakdown/abc.png')
const asset = (over: Partial<PropAsset> = {}): PropAsset => ({ propId: 'obj_ring', name: '은반지', appearance: 'a ring', appearanceNative: '반지', imageUrl: null, sourceHash: null, origin: 'producer', ...over })
const initial = { ...useArtistStore.getInitialState() }
const patch = (body: Record<string, unknown>) => patchPropImage(new Request('http://test/api/artist/prop-image', { method: 'PATCH', body: JSON.stringify({ projectId: 'project-1', propId: 'obj_ring', ...body }) }))
const pngFile = () => new File([new Uint8Array([137, 80, 78, 71])], 'ring.png', { type: 'image/png' })

beforeEach(() => {
  db.props = [{ project_id: 'project-1', prop_id: 'obj_ring', name: '은반지' }]
  db.characters = []
  db.updates.length = 0
})
afterEach(() => {
  useArtistStore.setState({ propAssets: initial.propAssets })
  Object.assign(useArtistStore.getInitialState(), { propAssets: initial.propAssets })
  useProjectStore.setState({ projectId: null })
  vi.unstubAllGlobals()
})

describe('소품 그림 올리기', () => {
  // 왜: 혼자 정한 것 — 사람이 가진 소품 사진을 그대로 쓰게(배경 레퍼런스 올리기와 같다). 그림 사용 권리 확인을 닫으면 아무것도 올리지 않는다.
  it('소품 창에서 그림을 올리면 그림 사용 권리를 확인한 뒤 그 소품의 그림으로 그대로 쓴다', async () => {
    useProjectStore.setState({ projectId: 'project-1' })
    useArtistStore.setState({ propAssets: [asset({ sourceHash: 'p1:old:jp_anime' })] })
    const patched: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/artist/prop-image') {
        patched.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ ok: true, imageUrl: OWN }), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    }))
    const upload = vi.fn(async () => ({ url: OWN }))
    expect(await addPropImage({ projectId: 'project-1', propId: 'obj_ring' }, pngFile(), { confirm: async () => false, upload })).toEqual({ status: 'cancelled' })
    expect(upload).not.toHaveBeenCalled()
    expect(await addPropImage({ projectId: 'project-1', propId: 'obj_ring' }, pngFile(), { confirm: async () => true, upload })).toEqual({ status: 'attached', url: OWN })
    expect(patched).toEqual([{ projectId: 'project-1', propId: 'obj_ring', url: OWN }])
    expect(useArtistStore.getState().propAssets[0]).toMatchObject({ imageUrl: OWN, sourceHash: null })
    // 창에는 올리기 단추와 권리 확인 창이 있다.
    useArtistStore.setState({ propAssets: [asset()] })
    Object.assign(useArtistStore.getInitialState(), { propAssets: [asset()] })
    expect(renderToStaticMarkup(createElement(PropDetailPanels, { propId: 'obj_ring' }))).toContain('data-testid="prop-detail-upload"')
    expect(readFileSync('src/features/artist/prop-view-dialog.tsx', 'utf8')).toMatch(/useImageUploadConsent\(projectId\)/)
  })

  // 왜: 다른 사람 · 다른 프로젝트의 그림 주소나 바깥 주소를 소품 그림으로 적지 못하게 — 이 프로젝트 올림 폴더({작업 공간}/{프로젝트}/breakdown/)의 그림만 받는다. 올린 그림은 지문이 없어 바뀜 표시가 없다.
  it('이 프로젝트에 올린 그림이 아닌 주소는 소품 그림으로 받지 않는다', async () => {
    for (const url of ['https://evil.test/x.png', mediaPublicUrl('ws-2/project-1/breakdown/abc.png'), mediaPublicUrl('ws-1/project-9/breakdown/abc.png'), mediaPublicUrl('ws-1/project-1/props/abc.png')]) {
      expect((await patch({ url })).status).toBe(400)
    }
    expect(db.updates).toEqual([])
    const ok = await patch({ url: OWN })
    expect(ok.status).toBe(200)
    expect(db.updates).toEqual([{ table: 'props', values: { image_url: OWN, source_hash: null } }])
  })

  // 왜: 예전 저장 고장으로 같은 id 가 인물 행에도 있으면 어느 그림을 바꿀지 모른다 — 그리기 창구와 같이 409.
  it('같은 id 가 인물 행에도 있는 소품에는 그림을 올리지 않는다', async () => {
    db.characters = [{ project_id: 'project-1', character_id: 'obj_ring' }]
    expect((await patch({ url: OWN })).status).toBe(409)
    db.characters = []
    db.props = []
    expect((await patch({ url: OWN })).status).toBe(404)
    expect(db.updates).toEqual([])
  })
})
