// 연출 화살표 편집기의 밑층(화살표를 지운 그림)이 지금 연출 그림의 것일 때만 쓰이는지 검사한다(2026-11-14 미들 프레임 고장 · 검토 낮음 2건)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), generateReservedImage: vi.fn(), upload: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/fal/generate-image', () => ({ generateReservedImage: mocks.generateReservedImage }))
vi.mock('@/lib/storage/media', () => ({
  mediaPathFromUrl: (url: string) => url.replace('https://media.test/', '').split('?')[0],
  mediaPublicUrl: (path: string) => `https://media.test/${path}`,
  mediaUpload: mocks.upload,
}))

import { cleanPlateFor, toolWithPlate } from '@/features/writer/directing-arrow-editor'
import { StaleDirectionError, separateArrowLayer, withCleanPlate } from '@/lib/writer/directing-edit'

// 이 시험을 위해 지은 러프 세 장 — 연출 그림 주소(?v= 포함)가 밑층을 묶는 열쇠다.
const frames = (direction: string) => ({ start: 'https://media.test/s.png', direction, end: 'https://media.test/e.png' })

describe('연출 편집기 밑층', () => {
  // 왜: 팝업을 연 채로 연출 그림을 다시 만들면(이 장만 다시 · 연출만 다시 만들기) 편집기가 옛 그림의 밑층을 그대로 써서,
  //   지우개로 긁으면 바뀌기 전 그림이 드러나고 저장하면 그 조각이 새 연출 그림에 박혔다(2026-11-14 재현 sh_01_03).
  it('연출 그림을 다시 만들면, 편집기 밑층은 옛 그림에서 지운 화살표 없는 그림을 쓰지 않는다', () => {
    const remade = { generatedAt: 200, frames: frames('d2') }
    expect(cleanPlateFor(remade, { url: 'old-clean', direction: 'd1' })).toBeNull()
    expect(cleanPlateFor({ ...remade, cleanDirection: { url: 'old-clean', for: 100 } }, null)).toBeNull()
  })

  // 왜: 정상 경로 고정 — 저장 · 시작 · 끝 다시 그리기는 연출 그림의 밑그림이 그대로라 서버가 밑층 기록을 이어 준다(다시 분리하면 그림 값이 든다).
  it('연출 그림을 저장하거나 시작 · 끝만 다시 그리면, 편집기 밑층은 그대로 쓴다', () => {
    expect(cleanPlateFor({ generatedAt: 300, frames: frames('d1-saved'), cleanDirection: { url: 'clean', for: 300 } }, { url: 'clean', direction: 'd1' })).toBe('clean')
  })

  // 왜: 정상 경로 고정 — 분리한 바로 뒤 지우개를 쓴다. 서버 기록을 다시 읽기 전이라 팝업의 그림 정보에는 아직 밑층이 없다.
  it('이 편집기에서 방금 분리한 밑층은 서버 기록을 다시 읽기 전에도 바로 쓴다', () => {
    expect(cleanPlateFor({ generatedAt: 100, frames: frames('d1') }, { url: 'fresh-clean', direction: 'd1' })).toBe('fresh-clean')
  })

  // 왜(검토 낮음 1): 밑층이 없어지면 지우개는 그릴 수 없다 — 지우개가 눌린 채 남으면 그림 칸이 금지 커서가 되고 [Pen] 을 직접 눌러야 했다
  //   (안내는 "펜은 바로 써요"). 다시 만든 뒤에는 펜으로 돌아간다.
  it('연출 그림을 다시 만들면 지우개를 쓰던 편집기는 펜으로 돌아가 바로 그릴 수 있다', () => {
    expect(toolWithPlate('eraser', false)).toBe('pen')
    expect(toolWithPlate('eraser', true)).toBe('eraser')
    expect(toolWithPlate('pen', false)).toBe('pen')
  })

  // 왜(검토 낮음 2 ①): [분리] 하는 30초 사이에 같은 창 세 장 줄에서 시작 · 끝만 다시 그리면 연출 그림은 그대로인데, 그림 시각(generatedAt)이
  //   바뀌어 서버도 편집기도 밑층을 버렸다 — 지우개가 꺼지고 다시 분리하면 그림 값이 또 들었다. 밑층은 연출 그림 주소로 묶는다.
  it('분리하는 동안 시작 · 끝만 다시 그려도 편집기 밑층은 그대로 쓰고 서버도 남긴다', () => {
    const afterEndRedraw = { status: 'completed', generatedAt: 2000, frames: frames('d1') }
    expect(cleanPlateFor(afterEndRedraw, { url: 'C1', direction: 'd1' })).toBe('C1')
    expect(withCleanPlate(afterEndRedraw, 'd1', 'C1')).toMatchObject({ cleanDirection: { url: 'C1', for: 2000 } })
    expect(withCleanPlate({ ...afterEndRedraw, frames: frames('d2') }, 'd1', 'C1')).toBeNull()
  })
})

describe('연출 편집기 밑층 — 낡은 화면에서 분리', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset()
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = async () => ({ data: { rough_storyboard: { status: 'completed', generatedAt: 500, frames: frames('https://media.test/d.png?v=new') } }, error: null })
    mocks.from.mockReturnValue(q)
  })

  // 왜(검토 낮음 2 ②): 화면이 서버보다 낡은 채 [분리] 하면 서버는 지금 그림(새것)을 지워, 위층(옛 그림)과 밑층(새 그림)이 섞였다 —
  //   화면이 보고 있는 연출 그림과 서버 그림이 다르면 그림 값을 쓰기 전에 거절하고, 화면이 다시 읽게 한다.
  it('화면이 서버보다 낡은 채 분리하면 옛 그림 위에 새 그림의 밑층을 섞지 않는다', async () => {
    await expect(separateArrowLayer('p1', 'sh_1', 'ko', { expectDirection: 'https://media.test/d.png?v=old' })).rejects.toBeInstanceOf(StaleDirectionError)
    expect(mocks.generateReservedImage).not.toHaveBeenCalled()
  })
})
