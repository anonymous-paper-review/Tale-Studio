// Cinema 샷 줄 안에서 고치기 — [이미지 고치기]의 바꿀 점 · [영상 만들기]의 새 Take · 만드는 중 [멈추기] · 차례 [먼저 하기]가 지금 샷 상세 · 스토리보드 카드와 같은 규칙으로 되는지 검사한다 (오너 2026-11-22 D2~D5 · 11/14 약속)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { newTakeButton } from '@/features/camera/new-take'
import { shotHistory } from '@/features/camera/shot-history'
import { translate } from '@/lib/i18n/translate'
import { countText } from '@/lib/i18n/count-text'

const ko = (text: string, params?: Record<string, string | number>) => translate('ko', text, params)
const ready = { hasImage: true, imageBusy: false, takeMaking: false, batchBusy: false, sending: false, hasTake: true, imageChanged: false }
const label = (button: ReturnType<typeof newTakeButton>, count: number, showCost: boolean) =>
  showCost ? countText(ko, count, button.label.one, button.label.many, { count }) : ko(button.label.plain)

describe('[영상 만들기] 단추', () => {
  it('Take 가 없는 샷은 "영상 만들기 · N Take", 쓴 그림이 바뀐 뒤면 "바뀐 이미지로 새 Take 만들기", 그 밖은 "새 Take 만들기"이고 단추에 Take 값을 적는다', () => {
    // 왜: 샷 상세 영상 고치기와 같은 말 · 같은 규칙(11/14) — 단추 값이 곧 동의다(약속 E).
    expect(label(newTakeButton({ ...ready, hasTake: false }), 5, true)).toBe(ko('Make the video · {count} Takes', { count: 5 }))
    expect(label(newTakeButton({ ...ready, imageChanged: true }), 5, true)).toBe(ko('Make a new Take with the changed image · {count} Takes', { count: 5 }))
    expect(label(newTakeButton(ready), 1, true)).toBe(ko('Make a new Take · 1 Take'))
  })

  it('Take 과금이 꺼져 있으면 [영상 만들기] 단추에 Take 값을 적지 않는다', () => {
    // 왜: 과금이 꺼진 때 Take 값을 숨기는 규칙(entry D8 · #payments-phase-2)과 같다.
    expect(label(newTakeButton(ready), 5, false)).toBe(ko('Make a new Take'))
  })

  it('시작 · 끝 그림이 없거나 다시 그리는 중이거나 Take 를 만드는 중이거나 영상 일괄이 돌면 [영상 만들기]가 꺼지고 까닭 한 줄이 보인다', () => {
    // 왜: 리드 검토 c ① — 다시 그리는 중에 누르면 옛 그림으로 Take 가 나간다. 까닭은 마우스를 올리지 않아도 보인다.
    expect(newTakeButton({ ...ready, hasImage: false })).toMatchObject({ disabled: true, reason: 'Make the start and end images first.' })
    expect(newTakeButton({ ...ready, imageBusy: true })).toMatchObject({ disabled: true, reason: 'The start and end images are being remade. Make the Take when they are done.' })
    expect(newTakeButton({ ...ready, takeMaking: true })).toMatchObject({ disabled: true, reason: 'A Take is being made. You can make a new one when it is done.' })
    expect(newTakeButton({ ...ready, batchBusy: true })).toMatchObject({ disabled: true, reason: 'You can make it after the video batch finishes' })
    expect(newTakeButton({ ...ready, sending: true })).toMatchObject({ disabled: true, reason: null })
    expect(newTakeButton(ready)).toMatchObject({ disabled: false, reason: null })
  })

  it('[영상 만들기]는 누를 때 Take 를 다시 읽어 못 읽으면 시작하지 않고 까닭을 적고, 새 Take 는 가장 새 Take 의 설정에 적은 바꿀 점을 얹어 만든다', () => {
    // 왜: 약속 E(Take 를 못 읽으면 시작하지 않는다) · 11/14 "늘 새 Take, 보던 Take 의 설정을 이어받는다".
    const panel = readFileSync('src/features/camera/fix-panel.tsx', 'utf8')
    expect(panel).toMatch(/fetchTakeBalance\(\)\)\.failed/)
    expect(panel).toContain("I couldn't check your Takes, so I didn't start. Please try again in a moment.")
    expect(panel).toMatch(/generateVideoForShot\(shotNodeId, newTakeRequest\(\{[\s\S]{0,200}takeId: base\?\.id \?\? null[\s\S]{0,200}change,/)
    expect(panel).toMatch(/latestShotTake\(nodes, shotNodeId\)/)
  })
})

describe('[이미지 고치기]', () => {
  it('[이미지 고치기]의 바꿀 점은 이번 그림에만 붙고, 다시 그려도 지금 그림은 판으로 남는다', () => {
    // 왜: 11/14 답 5 · 샷 상세 이미지 고치기와 같은 단추(다시 그리면 확인 창 "지금 이미지는 버전으로 남아요").
    const panel = readFileSync('src/features/camera/fix-panel.tsx', 'utf8')
    expect(panel).toMatch(/<StoryboardImageButton[\s\S]{0,120}changeNote=\{imageChange\}/)
    expect(panel).toContain("'Remake start and end images · Takes 0'")
  })
})

describe('기다림 · 멈추기 · 먼저 하기', () => {
  it('일괄이 맡아 차례를 기다리는 그림은 줄 끝에 "이미지 생성 대기 중", 영상 묶음에서 차례를 기다리는 샷은 "순서 기다리는 중 · N번째" 자리가 선다', () => {
    // 왜: 스토리보드 카드 꼬리와 같은 말(11/14) — 아직 작업이 없는 기다림도 줄에서 보인다.
    const waiting = shotHistory({ image: null, takes: [], final: null, shot: { provider: 'kling-o3' }, imageWork: { phase: 'waiting' }, videoLine: 2 })
    expect(waiting.map((e) => e.kind)).toEqual(['image-pending', 'video-pending'])
    expect(waiting.map((e) => e.summary.map((p) => ko(p.key, p.params)).join(''))).toEqual(['이미지 생성 대기 중', '순서 기다리는 중 · 3번째'])
  })

  it('만드는 중인 그림 자리와 Take 판에는 [멈추기]가, 맨 앞이 아닌 차례 자리에는 [먼저 하기]가 있다', () => {
    // 왜: 오너 7번 · 시안 D4 — 만드는 것은 어디서든 그 자리에서 멈추고(이미 보낸 Take 는 돌려주지 않음), 차례는 앞으로 당긴다.
    const card = readFileSync('src/features/camera/history-card.tsx', 'utf8')
    expect(card).toMatch(/shotStopTarget\(activeJobs, writerShotId, 'image'\)/)
    expect(card).toMatch(/shotStopTarget\(activeJobs, writerShotId, 'video'\)/)
    expect(card).toMatch(/<StopMakingButton target=\{stop\} kind=\{kind\}/)
    expect(card).toMatch(/linePosition > 0 && writerShotId \? <MoveFirstButton shotId=\{writerShotId\}/)
  })
})
