// 채팅(Lumi)으로 만든 영상 Take 에 부탁한 말과 "채팅"이 남아 Camera 이력 판에 "채팅으로 부탁: …"으로 보이는지 검사한다 (오너 2026-11-22 D2~D5 "채팅 및 버튼으로 수정 + 이력 사이 변경 요약" · 리드 11/22 결정 ②)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildVideoBatchInputs } from '@/lib/director/video-batch-inputs'
import type { DirectorNode } from '@/types/director'

const node = (id: string, data: Record<string, unknown>) => ({ id, type: String(data.kind), position: { x: 0, y: 0 }, data }) as unknown as DirectorNode
const camera = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const shot = (id: string) =>
  node(id, { kind: 'shot', writerShotId: `w-${id}`, prompt: 'p', camera, lighting: { position: 'front', brightness: 50, colorTemp: 5600 }, cameraPreset: { brand: 'arri', focalLength: 35, aperture: 2.8, whiteBalance: 5600 }, provider: 'seedance', durationSeconds: 5, storyboardImage: null, referenceImages: [], imageInputs: [] })
const store = () => readFileSync('src/stores/global-chat-store.ts', 'utf8')

describe('채팅으로 만든 영상 Take 의 말', () => {
  it('채팅(Lumi)에 부탁해 만든 새 영상 Take 에는 부탁한 말과 "채팅"이 남는다', () => {
    // 왜: 결정 4 · 리드 결정 ② — 채팅으로 고친 영상도 이력에서 "무엇을 부탁했나"를 읽는다(그림 판과 같은 규칙, 조각 6).
    const items = buildVideoBatchInputs('p-1', [shot('s1'), shot('s2')], ['s1', 's2'], { note: '샷 1 · 2 영상 천천히', via: 'chat' }).items
    expect(items.map((item) => item.request.override)).toEqual([
      { note: '샷 1 · 2 영상 천천히', via: 'chat' },
      { note: '샷 1 · 2 영상 천천히', via: 'chat' },
    ])
    expect(store()).toContain('void runVideoBatch(pid, { onJob: input.onJob, shotIds: input.shotIds, takeNote })')
    expect(store()).toMatch(/startVideosFor\(\{ shotIds: nowVideos, say: lumiSays, onJob: observeGeneration, isCurrent: isCurrentSession, remake, named: namedVideoIds, asked: trimmed \}\)/)
  })

  it('채팅으로 다시 만든 영상 Take 에도 부탁한 말과 "채팅"이 남고, 앞 Take 의 설정은 그대로 이어받는다', () => {
    // 왜: 채팅의 "다시 만들어 줘"는 샷마다 [다시 만들기](remakeShotVideo)를 탄다 — 그 길에도 같은 말을 싣는다.
    expect(store()).toContain('remakeShotVideo(id, { onJob: input.onJob, onAccepted: () => resolve({ accepted: true }), takeNote })')
    const director = readFileSync('src/stores/director-store.ts', 'utf8')
    expect(director).toMatch(/\.\.\.\(opts\?\.takeNote \? \{ videoOverride: \{ note: opts\.takeNote\.note, via: opts\.takeNote\.via \} \} : \{\}\)/)
  })

  it('말이 없는 채팅 길(빠른 칩 · 되묻기 답 · 알림 카드 단추 · 글 고침 [적용] 뒤)로 만든 영상 Take 에는 빈 말과 "채팅"만 남는다', () => {
    // 왜: 그 길들은 그 영상을 부탁한 말 한 줄을 하나로 정할 수 없다(칩 말 · "응" · 여러 턴이 묶인 카드) — 옛 Take 의 말도 붙지 않게 빈 말을 적는다.
    expect(store()).toMatch(/const takeNote = \{ note: \(input\.asked \?\? ''\)\.trim\(\), via: 'chat' as const \}/)
  })

  it('위쪽 [영상 만들기 · N] 같은 일괄 단추로 만든 영상 Take 에는 사람 말 · 만든 길을 적지 않는다', () => {
    // 왜: 단추 일괄은 사람이 쓴 말이 없다 — 앞 Take 의 말을 복사하지도 않는다(조각 11).
    const items = buildVideoBatchInputs('p-1', [shot('s1')], ['s1']).items
    expect(items[0]!.request.override).toEqual({})
  })
})
