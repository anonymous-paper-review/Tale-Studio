// 연출 화살표 편집기에 저장하지 않은 화살표가 있을 때 창 아래 [적용] · 닫기가 그 화살표를 지키는지 검사한다(2026-11-14 오너 고장 · 리드 ①②)
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { applyDirectionTab, closeRequest, directionApplyEnabled, resolveUnsavedClose } from '@/features/writer/unsaved-arrows-confirm'

describe('저장하지 않은 화살표', () => {
  // 왜: 연출 탭의 창 아래 [적용]은 길이만 저장하고 길이를 안 바꾸면 꺼져 있었다. 편집기 [저장]은 그림 아래 화면 밖이라,
  //   화살표를 그린 오너가 저장하지 못하고 [취소] · ✕ 로 닫아 화살표가 사라졌다(2026-11-14 개발 실측 · 운영 연출 고치기 0건과 맞음).
  it('연출 탭에서 저장하지 않은 화살표가 있으면 길이를 바꾸지 않아도 창 아래 [적용]이 켜지고, 누르면 화살표를 저장한 뒤 닫는다', async () => {
    expect(directionApplyEnabled({ arrowsDirty: true, durationDirty: false })).toBe(true)
    expect(directionApplyEnabled({ arrowsDirty: false, durationDirty: false })).toBe(false)
    const saveArrows = vi.fn(async () => true)
    const saveDuration = vi.fn(async () => undefined)
    const close = vi.fn()
    await applyDirectionTab({ arrowsDirty: true, durationDirty: false }, { saveArrows, saveDuration, close })
    expect(saveArrows).toHaveBeenCalledTimes(1)
    expect(saveDuration).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    // 화살표 저장이 안 되면 길이도 저장하지 않고 창을 그대로 둔다(편집기가 알린다).
    const failed = vi.fn(async () => false)
    close.mockClear()
    await applyDirectionTab({ arrowsDirty: true, durationDirty: true }, { saveArrows: failed, saveDuration, close })
    expect(saveDuration).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  // 왜: [취소] · ✕ · Esc · 바깥 누르기가 묻지 않고 닫혀, 다시 열면 그린 화살표가 없었다(2026-11-14 실측).
  it('저장하지 않은 화살표가 있으면 창을 닫기 전에 묻고, [저장하고 닫기]는 저장된 뒤에만 닫는다', async () => {
    expect(closeRequest(true)).toBe('ask')
    const close = vi.fn()
    await expect(resolveUnsavedClose('save', { save: async () => true, close })).resolves.toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    close.mockClear()
    await expect(resolveUnsavedClose('save', { save: async () => false, close })).resolves.toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  // 왜: 버릴지 더 그릴지는 사람이 고른다 — 버리면 저장 없이 닫고, 계속 그리면 창 · 그린 것을 그대로 둔다.
  it('[버리고 닫기]는 저장하지 않고 닫고, [계속 그리기]는 창을 그대로 둔다', async () => {
    const save = vi.fn(async () => true)
    const close = vi.fn()
    await expect(resolveUnsavedClose('discard', { save, close })).resolves.toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    close.mockClear()
    await expect(resolveUnsavedClose('keep', { save, close })).resolves.toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  // 왜: 정상 경로 고정 — 그린 것이 없거나 다 저장했으면 지금처럼 바로 닫는다.
  it('저장하지 않은 화살표가 없으면 묻지 않고 닫는다', () => {
    expect(closeRequest(false)).toBe('close')
  })

  // 왜: 연출 화살표 편집기는 두 곳에서 열린다 — Storyboard 샷 고치기 창(입구 A)과 Director 연출 화살표 편집 창(입구 B). 둘 다 같은 물음을 거쳐 닫는다.
  it('Storyboard 샷 고치기 창과 Director 연출 화살표 편집 창은 둘 다 닫기 전에 저장하지 않은 화살표를 묻는다', () => {
    for (const file of ['src/features/writer/storyboard-shot-dialog.tsx', 'src/features/writer/shot-detail-dialog.tsx']) {
      const source = readFileSync(file, 'utf8')
      expect(source).toMatch(/useUnsavedArrowsGuard\(/)
      expect(source).toMatch(/<UnsavedArrowsConfirm /)
      expect(source).toMatch(/onDirtyChange=\{guard\.setDirty\}/)
      expect(source).toMatch(/if \(!open\) guard\.requestClose\(\)/)
    }
  })
})
