// Producer 시작 화면에서 그림 파일은 사용 동의를 받은 뒤에만 올리고, 글 파일은 묻지 않고 올린다 (리뉴얼 1차 검토 2026-10-19)
import { describe, expect, it, vi } from 'vitest'
import { pickEntryFile } from '@/features/entry/options'

const file = (name: string) => new File(['x'], name)

describe('시작 화면의 파일 고르기', () => {
  it('그림 파일을 고르면 동의하기 전에는 올리지 않는다', async () => {
    // 왜: 다른 그림 올리기 화면(채팅 · Director · Editor)처럼 동의는 매번 직접 체크해야 한다 — 시작 화면만 묻지 않고 올렸다(검토 지적).
    let answer!: (accepted: boolean) => void
    const requestConsent = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve }))
    const upload = vi.fn(async () => 'ok')

    const picked = pickEntryFile(file('memo.png'), { requestConsent, upload })
    await Promise.resolve()

    expect(requestConsent).toHaveBeenCalledOnce()
    expect(upload).not.toHaveBeenCalled()
    answer(true)
    expect(await picked).toBe('uploaded')
    expect(upload).toHaveBeenCalledOnce()
  })

  it('그림 사용 동의를 하지 않으면 그 그림을 올리지 않는다', async () => {
    // 왜: 동의창을 닫거나 취소하면 파일을 보내지 않는다(이미지 사용 동의 약속).
    const upload = vi.fn(async () => 'ok')

    expect(await pickEntryFile(file('scan.JPG'), { requestConsent: async () => false, upload })).toBe('declined')
    expect(upload).not.toHaveBeenCalled()
  })

  it('글 파일은 그림 동의를 묻지 않고 올린다', async () => {
    // 왜: 정상 경로 고정 — 그림 사용 동의는 그림에만 묻는다.
    const requestConsent = vi.fn(async () => true)
    const upload = vi.fn(async () => 'ok')

    expect(await pickEntryFile(file('script.hwp'), { requestConsent, upload })).toBe('uploaded')
    expect(requestConsent).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledOnce()
  })
})
