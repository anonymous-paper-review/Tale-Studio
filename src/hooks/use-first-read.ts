'use client'

// 이 화면이 지금 프로젝트를 한 번 다 읽었는가(m1126 G1 기다리는 카드의 근거, lib/stage-wait).
//   화면이 열릴 때 load 를 한 번 부르고, 끝나면(실패해도) 참이 된다. have 가 참이면(이미 받아 둔 내용이 있다) 읽지 않고 바로 참이고,
//   그 뒤 내용이 비어도(마지막 샷을 지움) 다시 기다리지 않는다. 프로젝트가 바뀌면 거짓에서 다시 시작한다.
//   load 는 렌더마다 바뀌지 않는 함수여야 한다(store 함수를 부르는 모듈 함수 등).
import { useEffect, useState } from 'react'
import { settleRead } from '@/lib/stage-wait'

export function useFirstRead(projectId: string | null, load: () => Promise<unknown>, have = false): boolean {
  const [readFor, setReadFor] = useState<string | null>(null)
  // 받아 둔 내용이 있으면 읽은 것으로 기억한다(렌더 중 갱신 — 이전 값에서 이어지는 상태).
  if (have && projectId && readFor !== projectId) setReadFor(projectId)
  const read = !!projectId && readFor === projectId
  useEffect(() => {
    if (!projectId || read) return
    let alive = true
    void settleRead(load).then(() => {
      if (alive) setReadFor(projectId)
    })
    return () => {
      alive = false
    }
  }, [projectId, load, read])
  return read || (have && !!projectId)
}
