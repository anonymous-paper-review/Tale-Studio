'use client'

// Writer 실행 확인(project-store verifyWriterGate)이 어느 프로젝트까지 끝났는지 — 끝나야 산문 초안 프로젝트인지 안다(그때 treatmentDraft 를 켠다).
//   studio/layout 이 프로젝트를 열 때 확인을 부르고 끝나면(실패해도) 적고, 프로젝트를 비우면(바꾸는 중) 지운다.
//   Writer 기다리는 카드가 본다 — 확인 전의 "넘기기 전(아직 산문이 없어요)" 화면은 틀린 안내다(m1126 G1 · m-qa 2026-11-27).
//   약속: tests/writer/prose-open-wait.test.ts
import { useSyncExternalStore } from 'react'

let checked: string | null = null
const listeners = new Set<() => void>()

/** 이 프로젝트의 Writer 실행 확인이 끝났다(null = 지운다). */
export function noteWriterGateChecked(projectId: string | null): void {
  if (checked === projectId) return
  checked = projectId
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const read = () => checked

/** 지금 프로젝트의 Writer 실행 확인이 끝났나. 서버는 확인을 부르지 않아 늘 null — 하이드레이션 첫 그림과 같다. */
export function useWriterGateChecked(projectId: string | null): boolean {
  const value = useSyncExternalStore(subscribe, read, read)
  return !!projectId && value === projectId
}
