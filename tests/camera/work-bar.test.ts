// Camera 위쪽 만들기 줄 — [이미지 만들기 · N] · [영상 만들기 · N] · 진행 · [모두 멈추기] · 영상까지 이어서가 Director 툴바와 같은 규칙 · 같은 러너로 되고, 세는 범위를 한 곳에서 정하는지 검사한다 (오너 2026-11-22 D2~D5 · 리드 답 a · 약속 E)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { scopeShotStates } from '@/features/camera/work-scope'
import type { DirectorShotState } from '@/lib/director/shot-state'

const states = new Map<string, DirectorShotState>([['s1', 'image_needed'], ['s2', 'image_done'], ['s3', 'video_done'], ['s4', 'image_failed']])
const bar = () => readFileSync('src/features/camera/work-bar.tsx', 'utf8')

describe('세는 범위', () => {
  it('위쪽 단추가 세는 샷은 정한 범위 안의 샷뿐이고, 범위를 정하지 않으면 모든 씬의 샷이다', () => {
    // 왜: 씬 단추로 범위를 좁히는 것은 오너 답 뒤(리드 11/22) — 그때 범위만 넘기면 되게 한 곳에서 자른다. 지금은 모든 씬.
    expect([...scopeShotStates(states, null).keys()]).toEqual(['s1', 's2', 's3', 's4'])
    expect([...scopeShotStates(states, ['s2', 's4', 'gone']).entries()]).toEqual([['s2', 'image_done'], ['s4', 'image_failed']])
    expect(bar()).toMatch(/scopeShotStates\(shotStates, scope\)/)
  })
})

describe('Director 툴바와 같은 규칙', () => {
  it('[이미지 만들기 · N]은 이미지가 없는 샷을, [영상 만들기 · N]은 이미지가 있고 완성 영상이 없는 샷을 세고, 가장 밝은 단추는 지금 할 일 하나다', () => {
    // 왜: 시안 R · 11/14 — Director 와 같은 판정 함수(toolbar-work)를 쓴다. 만들 것이 없으면 [다음: Director]가 가장 밝다.
    const source = bar()
    expect(source).toMatch(/imageButtonMode\(workStates, picked\)/)
    expect(source).toMatch(/videoWorkShotIds\(workStates, picked\)/)
    expect(source).toMatch(/primaryWorkAction\(\{/)
    expect(source).toMatch(/emphasis=\{primary === 'editor' \? 'primary' : 'secondary'\}/)
  })

  it('만들 것이 없거나 일괄이 도는 중이면 단추가 꺼지고 까닭 한 줄이 단추 아래에 보이며, Take 를 못 읽으면 그 까닭을 보인다', () => {
    // 왜: 결정 페이지 "꺼진 단추 아래 이유 한 줄" · 리드 11/14(잔액을 못 읽으면 Take 를 쓰는 단추가 시작하지 않는다).
    const source = bar()
    expect(source).toMatch(/imageWorkBlock\(workStates, picked/)
    expect(source).toMatch(/videoWorkBlock\(workStates, picked, videoLive/)
    expect(source).toMatch(/takesUnknown && takeState\.failed \? t\(TAKES_UNKNOWN_TEXT\) : workBlockLine\(imageBlock, videoBlock, t\)/)
  })

  it('[영상 만들기 · N]은 누를 때 Take 를 다시 읽고, 확인 창에 만들 영상 수 · 필요한 Take · 가진 Take 를 보인 뒤에만 가진 만큼 시작한다', () => {
    // 왜: 약속 E1 · E2 — Take 를 쓰는 일괄은 확인 창을 거친다. 창을 연 뒤 잔액을 못 읽게 됐으면 시작하지 않는다.
    const source = bar()
    expect(source).toMatch(/if \(!\(await takesReadable\(\)\)\)/)
    expect(source).toMatch(/refetchTakeBalance\(\)/)
    expect(source).toMatch(/describeVideoBatchPlan\(videoPlan, t\)/)
    expect(source).toMatch(/runVideoBatch\(pid, \{ limit: videoPlan\.runCount, shotIds: videoWork \}\)/)
  })

  it('[모두 멈추기]는 아직 보내지 않은 이미지 · 영상은 보내지 않고, 만들고 있는 것은 화면에서 멈추며 몇 개를 멈췄는지 알린다', () => {
    // 왜: 오너 7번 — 이미 보낸 작업은 생성처에서 끝까지 돌고 Take 는 돌려주지 않는다(화면에서 멈춤).
    const source = bar()
    for (const call of ['cancelRealBatchResume(run.projectId)', 'run.cancelRealBatch()', 'cancelWaitingRealBatch()', 'await run.cancelVideoBatch()', 'stoppableJobs(await freshActiveJobs(run.projectId))', 'run.cancelRunningJobs(', 'stopNotice(stoppedCounts(']) {
      expect(source, call).toContain(call)
    }
  })

  it('영상까지 이어서를 켜면 이미지 단추가 "이미지+영상 만들기"가 되어 그림이 끝난 샷의 영상을 이 화면이 이어 보내고, 화면을 떠나면 꺼진다', () => {
    // 왜: 시안 D4 · 오너 답 6 — 이어 보내기는 이 화면이 한다("이 화면을 닫으면 영상은 시작되지 않아요").
    const source = bar()
    expect(source).toMatch(/chainStep\(chainWaitingShotIds, shotStates, realBatchBusy, resumeWaitingNodeIds, videoBatchBusy\)/)
    expect(source).toMatch(/setChainVideoAfterImage\(false\)/)
    expect(source).toContain("t('Make images + videos')")
  })
})
