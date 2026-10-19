'use client'

// /studio/start — Producer 시작 화면(리뉴얼 1차 2026-10-19, id entry). 아이디어 · 산문 조건 · 화면 비율을 정하고 시작한다.
//   셸(사이드바)은 layout.tsx 가 처리하고, 이 단계에는 오른쪽 채팅이 없다.
import { EntryWorkspace } from '@/features/entry/entry-workspace'

export default function StartPage() {
  return <EntryWorkspace />
}
