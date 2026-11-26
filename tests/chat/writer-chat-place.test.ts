// Storyboard 채팅이 씬을 만들거나 고칠 때 장소를 Artist 배경 목록과 잇는다 — 배경 이름으로 적어도 그 배경에 이어지고, 목록에 없는 장소면 배경 그림 없이 그린다고 알린다 (오너 2026-11-26 W6 "채팅으로 샷 추가 시 인물 · 배경 연결")
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveSceneLocations, validateWriterUpdates } from '@/lib/writer-chat-updates'
import { unknownPlacesNotice } from '@/lib/agentic-reply-guard'
import { serializeWriterScriptContext } from '@/lib/script-lines'
import type { SceneManifest, Shot } from '@/types'

const read = (path: string) => readFileSync(path, 'utf8')
const HANGUL = /[가-힣]/
// 개발 DB 시험 복사본(QA conti)과 같은 모양 — 배경 id 가 영어 낱말인 배경 하나, 이름이 곧 id 인 배경 하나.
const LOCATIONS = [
  { location_id: 'ceiling_fluorescent_lights', name: '천장 형광등' },
  { location_id: '지하철 객차', name: '지하철 객차' },
]

describe('채팅이 적은 씬 장소를 배경과 잇기', () => {
  // 왜: 2026-11-26 재현 — "Artist 배경에 있는 천장 형광등으로 새 씬"을 부탁하자 채팅은 "그 배경으로 만들었어요"라고 답했지만
  //   장소 칸에 이름("천장 형광등")을 적어 배경(ceiling_fluorescent_lights)과 안 이어졌다 — 러프 배경 글 · 실사 참고 배경 · Director 배경 선이 모두 빠졌다.
  it('채팅이 Artist 배경에 있는 장소를 이름으로 적어 새 씬을 만들면 그 씬은 그 배경에 이어진다', () => {
    const updates = validateWriterUpdates([{ type: 'addScene', location: '천장 형광등', timeOfDay: '밤', tempId: 'S1' }])
    const out = resolveSceneLocations(updates, LOCATIONS)
    expect(out.updates).toEqual([{ type: 'addScene', location: 'ceiling_fluorescent_lights', timeOfDay: '밤', tempId: 'S1' }])
    expect(out.unknownPlaces).toEqual([])
  })

  // 왜: 씬 장소를 고칠 때도 같은 함정이다 — 이름으로 적으면 그 씬의 샷 전부가 배경을 잃는다. 띄어쓰기 · 대소문자만 달라도 같은 배경이다.
  it('채팅이 씬의 장소를 배경 이름으로 고치면 그 배경 id 로 바꿔 저장한다', () => {
    const updates = validateWriterUpdates([{ type: 'updateScene', id: 'sc_02', patch: { location: '  천장  형광등 ', mood: '차갑게' } }])
    expect(resolveSceneLocations(updates, LOCATIONS).updates).toEqual([
      { type: 'updateScene', id: 'sc_02', patch: { location: 'ceiling_fluorescent_lights', mood: '차갑게' } },
    ])
    const english = resolveSceneLocations(validateWriterUpdates([{ type: 'addScene', location: 'Ceiling Fluorescent Lights' }]), [{ location_id: 'lights', name: 'ceiling fluorescent lights' }])
    expect(english.updates).toEqual([{ type: 'addScene', location: 'lights' }])
  })

  // 왜: 정상 경로 고정 — 배경 id 를 그대로 적었으면 바꾸지 않는다. 장소를 건드리지 않는 고침 · 샷 더하기도 그대로다.
  it('채팅이 배경 id 를 그대로 적으면 그대로 두고, 장소가 없는 변경은 건드리지 않는다', () => {
    const updates = validateWriterUpdates([
      { type: 'addScene', location: '지하철 객차', tempId: 'S1' },
      { type: 'updateScene', id: 'sc_01', patch: { mood: '조용히' } },
      { type: 'addShot', sceneId: 'S1', actionDescription: '여자가 앉는다', characters: ['tired_woman'] },
    ])
    const out = resolveSceneLocations(updates, LOCATIONS)
    expect(out.updates).toEqual(updates)
    expect(out.unknownPlaces).toEqual([])
  })

  // 왜: Artist 배경에 없는 새 장소는 이을 배경이 없다 — 적은 글을 그대로 두되(지금처럼 새 장소), 이 씬은 배경 그림 없이 그려진다는 것을 알려야 한다.
  it('배경 목록에 없는 장소면 적은 그대로 두고 그 장소를 알릴 목록에 담는다', () => {
    const updates = validateWriterUpdates([
      { type: 'addScene', location: '지하철역 플랫폼', tempId: 'S1' },
      { type: 'updateScene', id: 'sc_03', patch: { location: '지하철역 플랫폼' } },
      { type: 'addScene', location: '편의점' },
    ])
    const out = resolveSceneLocations(updates, LOCATIONS)
    expect(out.updates).toEqual(updates)
    expect(out.unknownPlaces).toEqual(['지하철역 플랫폼', '편의점'])
  })

  // 왜: 서버가 정한 배경 목록이 진실이다(인물 목록과 같은 원칙) — 배경을 못 읽었으면 바꾸지도 알리지도 않는다(지금 그대로).
  it('배경 목록을 모르면 장소를 바꾸지도 알리지도 않는다', () => {
    const updates = validateWriterUpdates([{ type: 'addScene', location: '천장 형광등' }])
    expect(resolveSceneLocations(updates, undefined)).toEqual({ updates, unknownPlaces: [] })
  })
})

describe('배경 목록에 없는 장소 알림', () => {
  // 왜: 재현 — 채팅 답은 배경에 이었다고 말했는데 실제로는 이을 배경이 없었다. 답 끝에 사실을 한 줄로 붙인다(빠진 인물 알림과 같은 자리).
  it('배경 목록에 없는 장소로 씬을 만들거나 고치면 채팅 답 끝에 그 씬은 배경 그림 없이 그린다는 알림이 붙는다', () => {
    const ko = unknownPlacesNotice(['지하철역 플랫폼'], 'ko')
    expect(ko).toContain('지하철역 플랫폼')
    expect(ko).toContain('Artist 배경')
    expect(ko).toContain('배경 그림 없이')
    const en = unknownPlacesNotice(['Subway platform', 'Store'], 'en')
    expect(en).toContain('Subway platform, Store')
    expect(en).not.toMatch(HANGUL)
    const route = read('src/app/api/writer/chat/route.ts')
    expect(route).toMatch(/from\('locations'\)\.select\('location_id, name'\)\.eq\('project_id', projectId\)/)
    expect(route).toContain('resolveSceneLocations(')
    expect(route).toContain('unknownPlacesNotice(')
  })
})

describe('채팅 AI 에게 주는 배경 목록', () => {
  const manifest: SceneManifest = {
    scenes: [{ sceneId: 'sc_01', narrativeSummary: '', originalTextQuote: '', location: 'ceiling_fluorescent_lights', timeOfDay: '밤', mood: '', charactersPresent: ['tired_woman'], estimatedDurationSeconds: 10 }],
    characters: [{ characterId: 'tired_woman', name: '지친 여자', role: 'protagonist', description: '', fixedPrompt: '', referenceImages: [] }],
    locations: [
      { locationId: 'ceiling_fluorescent_lights', name: '천장 형광등', visualDescription: '', timeOfDay: '', lightingDirection: '' },
      { locationId: '지하철 객차', name: '지하철 객차', visualDescription: '', timeOfDay: '', lightingDirection: '' },
    ],
  }
  const shots = [{ shotId: 'sh_01_01', sceneId: 'sc_01', shotType: 'MS', actionDescription: '여자가 천장을 본다', characters: ['tired_woman'], durationSeconds: 3, generationMethod: 'T2V', dialogueLines: [], camera: { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }, lighting: { position: 'front', brightness: 50, colorTemp: 5600 } }] as unknown as Shot[]

  // 왜: AI 가 배경 id 를 모르면 사용자가 배경 이름으로 말한 장소를 이름 그대로 적는다(재현). 인물 목록처럼 배경 목록도 id 와 이름으로 싣는다.
  it('채팅 AI 에게 주는 보드 현황에 Artist 배경 목록(배경 id — 이름)이 실리고 씬마다 장소 이름이 함께 적힌다', () => {
    const context = serializeWriterScriptContext(manifest, shots, 'ko')
    expect(context).toContain('- ceiling_fluorescent_lights — 천장 형광등')
    expect(context).toContain('- 지하철 객차 — 지하철 객차')
    expect(context).toContain('장소:ceiling_fluorescent_lights(천장 형광등)')
    // 배경이 하나도 없으면 목록 머리를 싣지 않는다(빈 목록이 "배경이 없다"로 읽히지 않게).
    expect(context).toContain('## Locations')
    expect(serializeWriterScriptContext({ ...manifest, locations: [] }, shots, 'ko')).not.toContain('## Locations')
  })

  // 왜: 목록만 실으면 AI 는 여전히 이름을 적을 수 있다 — 지시문이 장소 칸에 그 id 를 쓰라고 말한다(인물 id 규칙과 같은 꼴).
  it('채팅 AI 지시문은 씬 장소에 배경 목록의 id 를 쓰고, 목록에 없는 장소만 짧은 이름으로 적으라고 말한다', () => {
    const route = read('src/app/api/writer/chat/route.ts')
    expect(route).toMatch(/location uses the location ID from the "## Locations" roster/)
    expect(route).toMatch(/only for a place that is not in the roster/i)
  })
})
