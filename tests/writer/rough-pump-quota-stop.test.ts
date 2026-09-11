// 러프 전체 생성은 생성 자리가 없으면 다시 시도하지 않고 멈추되, 내 묶음이 끝나면 다음 묶음은 이어서 낸다
import { describe, expect, it, vi } from 'vitest'
import { runRoughPump, type RoughPumpRound } from '@/lib/writer/rough-pump-client'

function round(partial: Partial<RoughPumpRound>): RoughPumpRound {
  return { submitted: 0, remaining: 0, quota: false, done: Promise.resolve(), ...partial }
}

describe('러프 전체 생성 펌프', () => {
  // 왜: 다른 사용자의 생성이 자리를 채운 상황에서 8초마다 최대 40번 두드리던 동작을 없앤다(2026-09-11 오너 결정 — 자동 재시도 없음).
  //     자동 진입이든 버튼이든 같은 펌프를 타므로 이 한 케이스가 두 경로를 모두 고정한다.
  it('생성 자리가 없다는 응답을 받으면 다시 시도하지 않고 그 자리에서 멈춘다', async () => {
    const generate = vi.fn().mockResolvedValue(round({ quota: true }))
    const result = await runRoughPump({ generate, isAborted: () => false })
    expect(result).toBe('quota')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  // 왜: 정상 경로 고정 — 서버가 한 번에 6샷까지만 받으므로, 자리 부족이 아닌 한 내 묶음이 끝난 뒤 남은 샷을 이어서 낸다.
  it('내 묶음이 끝나면 남은 샷을 다음 묶음으로 이어서 낸다', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(round({ submitted: 6, remaining: 4 }))
      .mockResolvedValueOnce(round({ submitted: 4, remaining: 0 }))
      .mockResolvedValueOnce(round({ submitted: 0, remaining: 0 }))
    const result = await runRoughPump({ generate, isAborted: () => false })
    expect(result).toBe('done')
    expect(generate).toHaveBeenCalledTimes(3)
  })

  // 왜: 첫 묶음은 나갔는데 두 번째 묶음에서 자리가 없어지면(그 사이 다른 사용자가 채움) 거기서 멈춘다 — 이어서 두드리지 않는다.
  it('묶음을 이어가다 자리가 없어지면 그 자리에서 멈춘다', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(round({ submitted: 6, remaining: 4 }))
      .mockResolvedValueOnce(round({ quota: true }))
    const result = await runRoughPump({ generate, isAborted: () => false })
    expect(result).toBe('quota')
    expect(generate).toHaveBeenCalledTimes(2)
  })

  // 왜: 접수 여부가 불확실한 묶음 뒤에 새 요청을 내면 같은 이미지를 두 번 주문할 수 있다(기존 약속 유지).
  it('접수 여부가 불확실한 묶음 뒤에는 새 묶음을 내지 않는다', async () => {
    const generate = vi.fn().mockResolvedValue(round({ submitted: 2, remaining: 3, confirmationPending: true }))
    const result = await runRoughPump({ generate, isAborted: () => false })
    expect(result).toBe('unconfirmed')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  // 왜: 화면을 떠나면 다음 묶음을 내지 않는다(기존 약속 유지).
  it('화면을 떠나면 다음 묶음을 내지 않는다', async () => {
    let left = false
    const generate = vi.fn().mockImplementation(async () => {
      left = true
      return round({ submitted: 6, remaining: 4 })
    })
    const result = await runRoughPump({ generate, isAborted: () => left })
    expect(result).toBe('aborted')
    expect(generate).toHaveBeenCalledTimes(1)
  })
})
