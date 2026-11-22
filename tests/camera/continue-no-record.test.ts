// 이어서(앞 영상 잇기)가 꺼질 때, 앞 샷의 ★ Take 에 만든 기록이 없으면 "기록이 없어 이어 받을 수 없어요"라고 하고 ★ Take 가 정말 없을 때만 "아직 완성된 영상이 없어요"라고 하는지 검사한다 (fb-camera QA A · 리드 2026-11-23)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cameraModeFacts, videoModeBlockText } from '@/features/camera/video-mode'
import { videoModeAvailability } from '@/lib/director/video-modes'
import { translate } from '@/lib/i18n/translate'
import type { DirectorNode } from '@/types/director'

const shot = (id: string, writerShotId: string) =>
  ({
    id,
    data: {
      kind: 'shot', label: id, writerShotId, parentSceneNodeId: 'sc', provider: 'seedance', durationSeconds: 4,
      storyboardImage: { url: 'https://x/s.png', status: 'completed', generatedAt: 1, frames: { start: 'https://x/s.png', direction: 'https://x/d.png', end: 'https://x/e.png' } },
    },
  }) as unknown as DirectorNode
const take = (parent: string, extra: Record<string, unknown>) =>
  ({
    id: `t-${parent}`,
    data: {
      kind: 'video', takeNumber: 1, parentShotNodeId: parent, videoClipId: `c-${parent}`, generationJobId: `j-${parent}`, status: 'completed', lastAttemptStatus: 'completed',
      videoUrl: `https://x/${parent}.mp4`, final: false, createdAt: '2026-11-22T10:00:00Z', lastAttemptAt: '2026-11-22T10:00:00Z', cancelledAt: null, override: {}, ...extra,
    },
  }) as unknown as DirectorNode
const writerShots = [
  { shotId: 'w1', sceneId: 'sc_a', sortOrder: 1, roughStoryboard: null },
  { shotId: 'w2', sceneId: 'sc_a', sortOrder: 2, roughStoryboard: null },
] as unknown as Parameters<typeof cameraModeFacts>[0]['writerShots']
/** 씬의 둘째 샷(n2)에서 본 사실 — 앞 샷 n1 의 Take 를 바꿔 가며 본다. */
const facts = (previousTakes: DirectorNode[]) => cameraModeFacts({ shotNodeId: 'n2', nodes: [shot('n1', 'w1'), shot('n2', 'w2'), ...previousTakes], writerShots })
const reasonOf = (seen: ReturnType<typeof facts>, locale: 'ko' | 'en') => {
  const state = videoModeAvailability('continue', seen.facts)
  return state.enabled ? null : translate(locale, videoModeBlockText(state.reason, seen))
}

describe('같이 정한 것(리드 11/23)', () => {
  it('앞 샷의 ★ Take 에 만든 기록이 없으면 이어서 까닭은 "앞 샷 영상에 만든 기록이 없어 마지막 장면을 이어 받을 수 없어요. 앞 샷 영상을 다시 만들면 쓸 수 있어요."다', () => {
    // 왜: 복사한 프로젝트 · 작업 기록이 생기기 전의 옛 Take 는 영상은 있는데 마지막 장면을 잡을 기록이 없다 —
    //   "앞 샷에 아직 완성된 영상이 없어요"는 사실과 달랐다(QA A, 복사본 78533f35 의 8샷).
    const seen = facts([take('n1', { generationJobId: null })])
    expect(seen.previousNoRecord).toBe(true)
    expect(reasonOf(seen, 'ko')).toBe('앞 샷 영상에 만든 기록이 없어 마지막 장면을 이어 받을 수 없어요. 앞 샷 영상을 다시 만들면 쓸 수 있어요.')
    expect(reasonOf(seen, 'en')).toBe("The previous shot's video has no generation record, so its last frame can't be carried over. Remake that video to use Continuation.")
    // [영상 만들기] 칸의 세 자리(방식 단추 설명 · 꺼진 방식 줄 · 단추 아래 까닭)가 모두 이 말을 쓴다.
    const panel = readFileSync('src/features/camera/fix-panel.tsx', 'utf8')
    expect(panel).not.toMatch(/VIDEO_MODE_BLOCK_TEXT\[/)
    expect(panel.match(/videoModeBlockText\([^)]*, \{ previousNoRecord \}\)/g)?.length).toBe(3)
  })

  it('"앞 샷에 아직 완성된 영상이 없어요"는 앞 샷에 ★ Take 가 정말 없을 때만 쓴다', () => {
    // 왜: 두 까닭은 할 일이 다르다 — 영상이 없으면 앞 샷 영상을 만들고, 기록이 없으면 앞 샷 영상을 다시 만든다.
    const none = facts([])
    expect(none.previousNoRecord).toBe(false)
    expect(reasonOf(none, 'ko')).toBe('앞 샷에 아직 완성된 영상이 없어요.')
    const failed = facts([take('n1', { status: 'failed', lastAttemptStatus: 'failed', videoUrl: null })])
    expect(failed.previousNoRecord).toBe(false)
    expect(reasonOf(failed, 'ko')).toBe('앞 샷에 아직 완성된 영상이 없어요.')
    // 기록이 있는 ★ Take 면 이어서가 켜진다(지금 그대로).
    expect(videoModeAvailability('continue', facts([take('n1', {})]).facts)).toEqual({ enabled: true, reason: null })
  })
})
