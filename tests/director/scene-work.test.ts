// 씬을 고르면 위쪽 만들기 단추 · "영상까지 이어서" · 확인 창의 Take 가 그 씬(과 씬 밖 카드)의 샷만 세고 확인 창 제목에 씬 이름이 붙으며, [모두 멈추기] · 진행 줄 · 채팅 빠른 칩은 프로젝트 전체를 보는지 검사한다 (오너 E2(b1) 2026-11-22)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { boardNodeNames } from '@/features/director/node-label'
import { orderedScenes, sceneButtonItems, sceneCanvas, sceneDialogTitle, shotStatesIn } from '@/features/director/scene-view'
import { imageButtonMode, videoWorkShotIds, workScopeStates } from '@/lib/director/toolbar-work'
import type { DirectorShotState } from '@/lib/director/shot-state'
import { translate } from '@/lib/i18n/translate'
import type { DirectorNode } from '@/types/director'

const page = readFileSync('src/app/studio/director/page.tsx', 'utf8')
const node = (id: string, data: Record<string, unknown>): DirectorNode =>
  ({ id, type: data.kind as string, position: { x: 0, y: 0 }, data: { label: id, ...data } }) as unknown as DirectorNode
const scene = (id: string, writerSceneId: string) => node(id, { kind: 'scene', label: writerSceneId, writerSceneId, location: '' })
const shot = (id: string, sceneId: string | null, writerShotId: string | null) =>
  node(id, { kind: 'shot', label: writerShotId ?? 'New Shot', writerShotId, parentSceneNodeId: sceneId, characterAssetIds: [], worldAssetIds: [] })

/** 씬 1(a1 이미지 필요 · a2 이미지 완료) · 씬 2(b1 이미지 필요 · b2 이미지 완료) · 씬 밖 f1(이미지 필요). */
const nodes = [scene('S1', 'sc_01'), scene('S2', 'sc_02'), shot('a1', 'S1', 'sh_01_01'), shot('a2', 'S1', 'sh_01_02'), shot('b1', 'S2', 'sh_02_01'), shot('b2', 'S2', 'sh_02_02'), shot('f1', null, null)]
const states = new Map<string, DirectorShotState>([['a1', 'image_needed'], ['a2', 'image_done'], ['b1', 'image_needed'], ['b2', 'image_done'], ['f1', 'image_needed']])
const sceneTwo = () => shotStatesIn(states, sceneCanvas(nodes, [], 'S2').shotIds)

describe('씬을 고르면 만들기 단추가 그 씬만 센다', () => {
  it('씬을 고르면 [이미지 만들기 · N]은 그 씬(과 씬 밖 카드)의 샷만 센다', () => {
    // 왜: 오너 E2 — 보이는 씬 카드와 단추 숫자가 같아야 한다. 씬 2 를 보며 누르면 씬 1 샷을 만들지 않는다(11/14 "보이는 샷만"과 같은 규칙).
    expect(imageButtonMode(workScopeStates(sceneTwo(), 'all'), new Set()).shotIds).toEqual(['b1', 'f1'])
    expect(page).toContain('const workStates = workScopeStates(sceneShotStates, statusFilter)')
  })

  it('씬을 고르면 [영상 만들기 · N]과 확인 창의 Take 는 그 씬(과 씬 밖 카드)의 샷만 센다', () => {
    // 왜: 오너 E2 — Take 가 드는 단추라 보이지 않는 씬의 샷에 Take 를 쓰지 않는다. 확인 창 셈과 실제로 보내는 샷이 같은 목록이다.
    expect(videoWorkShotIds(workScopeStates(sceneTwo(), 'all'), new Set())).toEqual(['b2'])
    expect(page).toContain('const videoPlan = planVideoBatch(videoBatchTakeCosts(nodes, videoWork), takeState.balance, takeState.mode)')
    expect(page).toContain('void runVideoBatch(pid, { limit: videoPlan.runCount, shotIds: videoWork })')
  })

  it('씬을 고르면 "영상까지 이어서"도 그 씬에서 만드는 이미지의 샷만 영상을 이어 보낸다', () => {
    // 왜: 오너 E2 — 이어서 만드는 영상도 Take 가 든다. 이미지 단추가 세는 샷(그 씬)만 영상까지 간다.
    expect(page).toContain('const chainPlan = planVideoBatch(videoBatchTakeCosts(nodes, chainOn ? imageWork : []), takeState.balance, takeState.mode)')
    expect(page).toContain('startImages(imageWork.slice(0, chainPlan.runCount))')
  })

  it('만들기 확인 창 제목 앞에 지금 씬 이름이 붙는다', () => {
    // 왜: 오너 E2 — 확인 창에서 어느 씬을 만드는지 알 수 있게. 씬이 없는 캔버스는 제목 그대로.
    expect(sceneDialogTitle('씬 2', '영상을 만들까요?')).toBe('씬 2 · 영상을 만들까요?')
    expect(sceneDialogTitle(null, 'Generate videos?')).toBe('Generate videos?')
    expect(page.match(/title=\{sceneDialogTitle\(sceneLabel, /g)).toHaveLength(3)
  })

  it('씬 단추 줄에는 [전체] 단추가 없다', () => {
    // 왜: 오너 E2 "[전체] 단추 없음" — 모든 씬을 한 번에 만들려면 채팅 빠른 칩을 쓴다.
    const names = boardNodeNames({ scenes: [{ sceneId: 'sc_01' }, { sceneId: 'sc_02' }] }, [], 'ko')
    const t = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
    expect(sceneButtonItems(orderedScenes(nodes, names), nodes, names, { t, locationName: (slug) => slug }).map((item) => item.key)).toEqual(['sc_01', 'sc_02'])
    expect(page).not.toMatch(/t\('All scenes'\)/)
  })
})

describe('씬과 상관없이 프로젝트 전체를 보는 것', () => {
  it('[모두 멈추기] · 진행 줄 · [다음: Editor로] 크림은 씬과 상관없이 프로젝트 전체를 본다', () => {
    // 왜: 오너 E2 — 멈추기는 이 프로젝트에서 만드는 것을 모두 멈추고, 진행 줄은 지금 도는 일을 모두 보인다. 넘기기는 보드 전체에 할 일이 없을 때만 크림.
    expect(page).toContain('const stateList = [...shotStates.values()]')
    expect(page).toContain('stoppableJobs(await freshActiveJobs(run.projectId))')
    expect(page).toContain('const boardWorkLeft = imageWorkShotIds(shotStates, null).length + videoWorkShotIds(shotStates, null).length')
  })

  it('채팅 빠른 칩은 씬과 상관없이 모든 씬의 샷을 겨눈다', () => {
    // 왜: 오너 E2 "채팅 빠른 칩은 모든 씬" — 여러 씬을 한 번에 만드는 길이다. 칩은 캔버스의 모든 카드로 상태를 센다.
    const chat = readFileSync('src/stores/global-chat-store.ts', 'utf8')
    const run = chat.slice(chat.indexOf('async function runDirectorQuickChip('), chat.indexOf('const targets = quickChipTargets(input.chip, states)'))
    expect(run).toContain('const nodes = canvas.projectId === input.projectId ? canvas.nodes : []')
    expect(run).not.toMatch(/sceneCanvas|currentScene|sceneByProject/)
  })
})
