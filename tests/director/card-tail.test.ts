// Director 스토리보드 카드의 태그 · 꼬리 · 빈 판 — 이미지 필요 태그, 다시 만들기 실패, 일괄 기다림, 고른 상태가 0개일 때 (리드 검토 c ① · ③ · ④, 시안 D1 406:3717)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relative: string) => readFileSync(relative, 'utf8')
const grid = read('src/features/director/canvas-views/StoryboardGridView.tsx')
const page = read('src/app/studio/director/page.tsx')
const ko = read('src/lib/i18n/messages-ko.ts')

describe('카드 태그 · 꼬리', () => {
  it('실사 보기 카드는 이미지가 필요한 샷에 주황 "이미지 필요" 태그를 붙이고, 옛 단계 배지는 러프 보기에만 남는다', () => {
    // 왜: 리드 검토 c ③ — 태그 부품만 시험하면 카드가 그 부품을 안 써도 통과했다. 카드 소스가 그 부품을 쓰는지 본다.
    expect(grid).toContain("{shotState === 'image_needed' && <ImageNeededTag />}")
    const badge = grid.slice(grid.indexOf('const stageBadge ='), grid.indexOf('const runImage'))
    expect(badge).toMatch(/mediaMode === 'previz'/)
    expect(badge).not.toContain('completedVideoUrl')
    expect(badge).not.toContain("t('Image needed')")
  })

  it('실사 보기 카드는 다시 만들기가 실패해도 옛 그림을 보이고, 꼬리에 "다시 만들기 실패"와 [다시 만들기]를 단다', () => {
    // 왜: 리드 검토 c ① — 옛 그림이 남았으면 이미지 완료로 세고, 실패는 꼬리 · [다시 만들기]로만 알린다.
    expect(grid).toContain('const remakeFailed = imageRemakeFailed(img)')
    expect(grid).toMatch(/<ShotStateTail[\s\S]{0,200}remakeFailed=\{remakeFailed\}/)
    expect(grid).toMatch(/retry=\{<RemakeRetryButton nodeId=\{node\.id\} data=\{data\} \/>\}/)
  })

  it('일괄이 맡아 차례를 기다리는 카드의 꼬리는 "대기 중"이고, [모두 멈추기]를 누르면 기다림이 풀린다', () => {
    // 왜: 리드 검토 c ④d — 큐에 앉기 전 샷을 '이미지 필요'로 보이지 않는다. 멈춘 뒤에는 남은 샷을 그리지 않으니 기다림도 아니다.
    expect(grid).toMatch(/<ShotStateTail[\s\S]{0,200}waiting=\{imageWaitingOnly\}/)
    expect(grid).toMatch(/const autoFillPending =\s*mediaMode === 'real' && realBatchBusy && !realBatchCancelled &&/)
  })
})

describe('고른 상태가 0개일 때', () => {
  it('상태를 골랐는데 그 상태 샷이 하나도 없으면 판 · 캔버스에 "이 상태의 샷이 없어요"를 쓴다', () => {
    // 왜: 리드 검토 c ④c — 빈 판(스토리보드형) · 모두 흐린 캔버스(노드형)만 보이면 고장으로 보인다. 시안에 없는 상태.
    expect(grid).toMatch(/visibleGroups\.length === 0 && statusFilter !== 'all'/)
    expect(grid).toContain("t('No shots in this status')")
    expect(page).toContain("t('No shots in this status')")
    expect(ko).toContain("'No shots in this status': '이 상태의 샷이 없어요'")
  })
})

describe('이름 맞추기', () => {
  it('꼬리 · 태그 · 도움말은 같은 이름 "이미지 필요"를 쓰고 옛 이름 "이미지 생성 필요"는 남기지 않는다', () => {
    // 왜: 리드 검토 c ④a — 태그를 "이미지 필요"로 바꾼 뒤 도움말만 옛 이름이었다(S1 에서 도움말을 새로 쓰며 빠짐).
    expect(ko).toContain("'Image needed': '이미지 필요'")
    expect(ko).not.toContain('이미지 생성 필요')
    expect(page).not.toContain('Image generation needed')
  })
})
