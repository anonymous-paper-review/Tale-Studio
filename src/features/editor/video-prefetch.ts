// #watch-all(2026-08-23 오너): Editor 프리뷰는 클립 경계마다 <video> 를 갈아끼우며 그때그때
//   내려받는다 — 처음 통째로 감상할 때 경계마다 로딩으로 멈칫거린다. "전체 보기"는 타임라인의
//   모든 클립을 먼저 blob 으로 받아 objectURL 로 재생한다: 이후 경계 전환은 디스크/메모리 로컬이라
//   즉시다. 스토리지 원본은 손대지 않는 순수 클라이언트 캐시.
//
//   수명: 프로젝트 단위 모듈 상태 — Editor 탭을 떠났다 돌아와도 유지(재진입 무비용),
//   프로젝트가 바뀌면 통째로 revoke(메모리 반환). 실패한 URL 은 캐시에 안 남아 <video> 가
//   종전처럼 스트리밍한다(전량 실패해도 기능 후퇴 없음).

let cacheProjectId: string | null = null
const cache = new Map<string, string>() // 원본 URL → objectURL

/** 프리뷰어가 src 를 고를 때 — 캐시에 있으면 objectURL, 없으면 null(원본 스트리밍). */
export function cachedVideoUrl(url: string | null | undefined): string | null {
  return url ? (cache.get(url) ?? null) : null
}

/** 프로젝트가 바뀌었으면 이전 프로젝트의 blob 을 전부 반환한다. 같은 프로젝트면 no-op. */
export function resetVideoPrefetchFor(projectId: string | null): void {
  if (cacheProjectId === projectId) return
  for (const objectUrl of cache.values()) URL.revokeObjectURL(objectUrl)
  cache.clear()
  cacheProjectId = projectId
}

/**
 * 타임라인 클립 URL 들을 미리 받는다. 이미 받은 것은 건너뛰고, 진행은 onProgress(done, total).
 * 개별 실패는 삼킨다(그 클립만 스트리밍) — 반환값의 failed 로 집계만 알린다.
 */
export async function prefetchVideos(
  projectId: string | null,
  urls: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ failed: number; total: number }> {
  resetVideoPrefetchFor(projectId)
  const targets = Array.from(new Set(urls.filter(Boolean))).filter((u) => !cache.has(u))
  const total = targets.length
  let done = 0
  let failed = 0
  onProgress?.(0, total)
  if (total === 0) return { failed, total }

  const queue = [...targets]
  const worker = async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        // 받는 사이 프로젝트가 바뀌었으면 버린다 — 새 프로젝트 캐시를 오염시키지 않는다.
        if (cacheProjectId === projectId && !cache.has(url)) {
          cache.set(url, URL.createObjectURL(blob))
        }
      } catch {
        failed += 1
      }
      done += 1
      onProgress?.(done, total)
    }
  }
  // 동시 4개 — 스토리지 대역폭을 쓸어가지 않으면서 수십 클립도 수 초 안에 끝나는 수준.
  await Promise.all(Array.from({ length: Math.min(4, total) }, worker))
  return { failed, total }
}
