// 채팅 상단 고정 진행도 핀의 파생 셀렉터 (#chat-progress-pin #feedback 2026-08-07).
//
// "파이프라인 진척도"라는 단일 진실은 없다 — 스테이지마다 다른 곳에 산다:
//   writer 텍스트 = writer_runs 폴링(useWriterStatus) / writer 러프보드 = shots[].roughStoryboard /
//   artist = /api/writer/status?assets=1 서버 집계(project-store) + artist-store in-flight /
//   director = 캔버스 노드 status / editor = rendering 플래그.
// 여기는 completeness.ts 선례를 따라 순수함수만 둔다 — store/네트워크 의존 없음, 호출자가
//   진실을 주입한다(pull). 새 상태를 만들지 않는다(architecture §0). 컴포넌트 로컬 잡 상태
//   (rough-storyboard-view 의 panelJobs 등)는 unmount 에 증발하므로 여기서 읽지 않는다 —
//   전 함수가 reload 생존 진실(DB 파생)만 본다.

import type { DirectorNode } from '@/types/director'
import { isShotData, isVideoData } from '@/types/director'

/** 핀 한 줄 — done/total 이 있으면 분수 + 진행 바, 없으면 스피너 + 라벨만. */
export interface PipelineWork {
  key: string
  label: string
  done?: number
  total?: number
  failed?: number
}

interface RoughShotLike {
  actionDescription?: string | null
  roughStoryboard?: { status: string } | null
}

/** Writer 러프 스토리보드 — 생성 중 패널이 있을 때만. 대상은 액션이 있는 샷(생성 자격). */
export function writerRoughWork(shots: RoughShotLike[]): PipelineWork | null {
  const eligible = shots.filter((s) => !!s.actionDescription?.trim())
  const generating = eligible.filter(
    (s) => s.roughStoryboard?.status === 'generating',
  ).length
  if (generating === 0) return null
  const done = eligible.filter((s) => s.roughStoryboard?.status === 'completed').length
  const failed = eligible.filter((s) => s.roughStoryboard?.status === 'failed').length
  return {
    key: 'writer-rough',
    label: '러프 스토리보드 그리는 중',
    done,
    total: eligible.length,
    failed: failed || undefined,
  }
}

/**
 * Artist 이미지 생성 — 초기 잠금 구간은 서버 집계(ready/total)로, 그 이후 수동 재생성은
 * artist-store in-flight 개수로. stalled/failed 로 큐가 멈췄으면 "진행 중"이 아니므로 숨긴다
 * (실패 표면화는 기존 배지/제안 몫 — 핀은 도는 것만 보여준다).
 */
export function artistImageWork(opts: {
  imagesReady: boolean
  stalled: boolean
  failed: boolean
  progress: { ready: number; total: number } | null
  generatingCount: number
}): PipelineWork | null {
  if (!opts.imagesReady && !opts.stalled && !opts.failed && opts.progress && opts.progress.total > 0) {
    return {
      key: 'artist-images',
      label: '캐릭터·배경 이미지 생성 중',
      done: opts.progress.ready,
      total: opts.progress.total,
    }
  }
  if (opts.generatingCount > 0) {
    return {
      key: 'artist-regen',
      label: `이미지 ${opts.generatingCount}건 생성 중`,
    }
  }
  return null
}

/** Director 촬영용(실사) 스토리보드 이미지 — 생성 중 샷이 있을 때만. */
export function directorShotImageWork(nodes: DirectorNode[]): PipelineWork | null {
  const shots = nodes.map((n) => n.data).filter(isShotData)
  const generating = shots.filter(
    (d) => d.storyboardImage?.status === 'generating',
  ).length
  if (generating === 0) return null
  const done = shots.filter((d) => d.storyboardImage?.status === 'completed').length
  const failed = shots.filter((d) => d.storyboardImage?.status === 'failed').length
  return {
    key: 'director-storyboard',
    label: '촬영용 이미지 생성 중',
    done,
    total: shots.length,
    failed: failed || undefined,
  }
}

/** Director 영상 테이크 — 생성 중 비디오 노드가 있을 때만. */
export function directorVideoWork(nodes: DirectorNode[]): PipelineWork | null {
  const videos = nodes.map((n) => n.data).filter(isVideoData)
  const generating = videos.filter((d) => d.status === 'generating').length
  if (generating === 0) return null
  const done = videos.filter((d) => d.status === 'completed').length
  const failed = videos.filter((d) => d.status === 'failed').length
  return {
    key: 'director-video',
    label: '영상 생성 중',
    done,
    total: videos.length,
    failed: failed || undefined,
  }
}
