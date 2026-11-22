// 씬 단추를 쓰는 화면(Director · Cinema)이 들어올 때 어느 씬을 열고, 지금 보는 씬을 프로젝트마다 이 브라우저에만 기억하는지 검사한다 (오너 D8 2026-11-22)
import { beforeEach, describe, expect, it } from 'vitest'

import { resolveCurrentScene } from '@/lib/current-scene'
import { CURRENT_SCENE_STORAGE_KEY, useCurrentSceneStore } from '@/stores/current-scene-store'

const SCENES = ['sc_01', 'sc_02', 'sc_03']

beforeEach(() => {
  localStorage.removeItem(CURRENT_SCENE_STORAGE_KEY)
  useCurrentSceneStore.setState({ sceneByProject: {} })
})

describe('들어올 때 여는 씬', () => {
  it('이 브라우저가 처음 여는 프로젝트는 첫 씬으로 연다', () => {
    // 왜: 기억한 씬이 없으면 이야기 순서대로 첫 씬부터 본다(혼자 정한 것 h1).
    expect(resolveCurrentScene(SCENES, undefined)).toBe('sc_01')
    expect(resolveCurrentScene(SCENES, null)).toBe('sc_01')
  })

  it('다시 들어오면 마지막에 본 씬으로 연다', () => {
    // 왜: 긴 작품에서 씬 7 을 하다 다른 탭에 다녀오거나 새로고침해도 씬 7 에서 이어 간다(혼자 정한 것 h3).
    expect(resolveCurrentScene(SCENES, 'sc_03')).toBe('sc_03')
  })

  it('기억한 씬이 없어졌으면 첫 씬으로 연다', () => {
    // 왜: Writer 에서 그 씬을 지웠으면 빈 판 대신 첫 씬을 보인다(혼자 정한 것 h4).
    expect(resolveCurrentScene(SCENES, 'sc_09')).toBe('sc_01')
  })

  it('처음 여는 프로젝트에서 먼저 보여 줄 씬이 정해져 있으면 그 씬으로 연다', () => {
    // 왜: 처음 여는 프로젝트에 만드는 중인 샷이 있으면 그 샷의 씬을 먼저 보인다(9/8 오너 판정을 씬으로 옮김, 혼자 정한 것 h2). 기억한 씬이 있으면 기억이 앞선다.
    expect(resolveCurrentScene(SCENES, null, 'sc_02')).toBe('sc_02')
    expect(resolveCurrentScene(SCENES, 'sc_03', 'sc_02')).toBe('sc_03')
    expect(resolveCurrentScene(SCENES, null, 'sc_09')).toBe('sc_01')
  })

  it('씬이 하나도 없으면 열 씬이 없다', () => {
    // 왜: 씬이 아직 없는 프로젝트에서 없는 씬을 고르지 않는다.
    expect(resolveCurrentScene([], 'sc_01')).toBeNull()
  })
})

describe('지금 보는 씬 기억', () => {
  it('지금 보는 씬은 프로젝트마다 따로 기억한다', () => {
    // 왜: 두 프로젝트를 오가도 각자 보던 씬으로 돌아간다.
    const store = useCurrentSceneStore.getState()
    store.setCurrentScene('p1', 'sc_02')
    store.setCurrentScene('p2', 'sc_03')
    expect(useCurrentSceneStore.getState().sceneByProject).toEqual({ p1: 'sc_02', p2: 'sc_03' })
  })

  it('지금 보는 씬은 화면 이름 없이 프로젝트 하나에 한 값이라, Director 와 Cinema 가 같은 값을 읽고 쓴다', () => {
    // 왜: Camera 에서 씬 3 을 보다 Director 로 가면 씬 3 이 열린다(리드 11/22 답 b — 두 화면이 같은 기억을 쓴다).
    useCurrentSceneStore.getState().setCurrentScene('p1', 'sc_03')
    useCurrentSceneStore.getState().setCurrentScene('p1', 'sc_01')
    expect(useCurrentSceneStore.getState().sceneByProject).toEqual({ p1: 'sc_01' })
  })

  it('지금 보는 씬은 이 브라우저에만 남고 새로고침 뒤에도 남는다', () => {
    // 왜: 서버 · DB 에는 쓰지 않는다(브라우저 저장소 한 칸). 새로고침해도 보던 씬으로 연다.
    useCurrentSceneStore.getState().setCurrentScene('p1', 'sc_02')
    const saved = JSON.parse(localStorage.getItem(CURRENT_SCENE_STORAGE_KEY) ?? '{}') as { state?: unknown }
    expect(saved.state).toEqual({ sceneByProject: { p1: 'sc_02' } })
  })

  it('프로젝트가 없거나 씬 열쇠가 비었으면 기억하지 않는다', () => {
    // 왜: 프로젝트를 열기 전(빈 id · 'default')의 화면이 남의 칸에 씬을 적지 않게.
    const store = useCurrentSceneStore.getState()
    store.setCurrentScene('', 'sc_01')
    store.setCurrentScene('default', 'sc_01')
    store.setCurrentScene('p1', '')
    expect(useCurrentSceneStore.getState().sceneByProject).toEqual({})
  })

  it('브라우저에 남은 기억이 망가져 있으면 비운 채로 시작한다', () => {
    // 왜: 옛 판이나 손상된 값 때문에 화면이 깨지지 않게 — 기억이 없으면 첫 씬으로 열 뿐이다.
    const merge = useCurrentSceneStore.persist.getOptions().merge!
    const current = useCurrentSceneStore.getState()
    expect(merge({ sceneByProject: 'broken' }, current).sceneByProject).toEqual({})
    expect(merge({ sceneByProject: { p1: 3, p2: 'sc_02' } }, current).sceneByProject).toEqual({ p2: 'sc_02' })
    expect(merge(undefined, current).sceneByProject).toEqual({})
  })
})
