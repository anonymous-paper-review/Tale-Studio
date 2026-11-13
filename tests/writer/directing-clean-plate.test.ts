// 연출 화살표 편집기의 밑층(화살표를 지운 그림)이 지금 연출 그림의 것일 때만 쓰이는지 검사한다(2026-11-14 미들 프레임 고장)
import { describe, expect, it } from 'vitest'
import { cleanPlateFor } from '@/features/writer/directing-arrow-editor'

describe('연출 편집기 밑층', () => {
  // 왜: 팝업을 연 채로 연출 그림을 다시 만들면(이 장만 다시 · 연출만 다시 만들기) 편집기가 옛 그림의 밑층을 그대로 써서,
  //   지우개로 긁으면 바뀌기 전 그림이 드러나고 저장하면 그 조각이 새 연출 그림에 박혔다(2026-11-14 재현 sh_01_03).
  it('연출 그림을 다시 만들면, 편집기 밑층은 옛 그림에서 지운 화살표 없는 그림을 쓰지 않는다', () => {
    const remade = { generatedAt: 200 }
    expect(cleanPlateFor(remade, { url: 'old-clean', for: 100 })).toBeNull()
    expect(cleanPlateFor({ ...remade, cleanDirection: { url: 'old-clean', for: 100 } }, null)).toBeNull()
  })

  // 왜: 정상 경로 고정 — 저장 · 시작 · 끝 다시 그리기는 연출 그림의 밑그림이 그대로라 서버가 밑층 기록을 이어 준다(다시 분리하면 그림 값이 든다).
  it('연출 그림을 저장하거나 시작 · 끝만 다시 그리면, 편집기 밑층은 그대로 쓴다', () => {
    expect(cleanPlateFor({ generatedAt: 300, cleanDirection: { url: 'clean', for: 300 } }, { url: 'clean', for: 100 })).toBe('clean')
  })

  // 왜: 정상 경로 고정 — 분리한 바로 뒤 지우개를 쓴다. 서버 기록을 다시 읽기 전이라 팝업의 그림 정보에는 아직 밑층이 없다.
  it('이 편집기에서 방금 분리한 밑층은 서버 기록을 다시 읽기 전에도 바로 쓴다', () => {
    expect(cleanPlateFor({ generatedAt: 100 }, { url: 'fresh-clean', for: 100 })).toBe('fresh-clean')
  })
})
