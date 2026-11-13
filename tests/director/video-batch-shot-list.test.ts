// [영상 만들기 · N]은 화면이 센 샷만 묶음으로 보낸다 — 이미 영상이 있거나 만드는 중인 샷은 빼고 캔버스 순서를 지킨다 (시안 R 416:4941 · D2, 오너 2026-11-14)
import { describe, expect, it } from 'vitest'
import { videoBatchShotList } from '@/lib/director/video-batch-client'
import type { DirectorNode } from '@/types/director'

const shot = (id: string): DirectorNode =>
  ({ id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: id, writerShotId: `w-${id}` } }) as unknown as DirectorNode
const take = (id: string, parent: string, status: string, url: string | null): DirectorNode =>
  ({ id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: parent, status, videoUrl: url, lastAttemptStatus: status } }) as unknown as DirectorNode

describe('영상 묶음에 보낼 샷', () => {
  it('영상 만들기는 화면이 센 샷만 묶음으로 보내고, 이미 영상이 있거나 만드는 중인 샷은 빼고, 캔버스 순서를 지킨다', () => {
    // 왜: 단추 숫자(이미지가 있고 영상이 없는 샷)와 실제로 보내는 목록이 같아야 한다 — 예전엔 이미지 없는 샷까지 보내 서버가 말없이 뺐다.
    const nodes = [shot('a'), shot('b'), shot('c'), shot('d'), take('vb', 'b', 'completed', 'https://x/b.mp4'), take('vc', 'c', 'generating', null)]
    expect(videoBatchShotList(nodes, ['d', 'b', 'a', 'c'])).toEqual(['a', 'd'])
  })

  it('보낼 샷을 따로 주지 않으면 지금처럼 캔버스에서 영상이 없는 샷 전부다', () => {
    // 왜: 채팅 · 다른 길에서 부르는 일괄은 지금 그대로.
    const nodes = [shot('a'), shot('b'), take('vb', 'b', 'completed', 'https://x/b.mp4')]
    expect(videoBatchShotList(nodes)).toEqual(['a'])
  })
})
