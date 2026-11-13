// D8 Lumi 알림 카드(11/13 시안 414:5066, 오너 2026-11-14 "추천대로") — Director 에서 채팅을 접어 둔 채 이미지 · 영상 일괄이 끝나면
//   오른쪽 아래에 끝난 수 · 실패와 다음 할 일 단추를 띄운다. 채팅이 열려 있으면 카드 없이 채팅 줄(약속 E4)로만 알린다.
//   카드는 저절로 닫히지 않는다 — ✕ · 단추로 닫고, 채팅을 열거나 Director 를 떠나거나 다른 프로젝트로 가면 사라진다(다시 접어도 돌아오지 않는다).
//   글 · 단추는 lib/director/lumi-batch-notice, 카드는 features/director/lumi-batch-notice. 약속: tests/director/lumi-batch-notice.test.ts
import { create } from 'zustand'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useProjectStore } from '@/stores/project-store'

export interface LumiBatchNotice {
  projectId: string
  kind: 'image' | 'video'
  /** 이번 일괄에서 끝난 샷 수 · 실패한 샷 수. */
  done: number
  failed: number
}

interface LumiNoticeState {
  notice: LumiBatchNotice | null
  /** 일괄이 끝났을 때(러너가 부른다) — 지금 그 프로젝트의 Director 에서 채팅을 접어 둔 때만 카드를 띄운다. */
  batchEnded: (notice: LumiBatchNotice) => void
  dismiss: () => void
}

export const useLumiNoticeStore = create<LumiNoticeState>()((set) => ({
  notice: null,
  batchEnded: (notice) => {
    const project = useProjectStore.getState()
    if (project.currentStage !== 'director' || project.projectId !== notice.projectId) return
    if (!useChatUiStore.getState().collapsed) return
    if (notice.done + notice.failed === 0) return
    set({ notice })
  },
  dismiss: () => set({ notice: null }),
}))

useChatUiStore.subscribe((state) => {
  if (!state.collapsed && useLumiNoticeStore.getState().notice) useLumiNoticeStore.setState({ notice: null })
})
useProjectStore.subscribe((state) => {
  const notice = useLumiNoticeStore.getState().notice
  if (notice && (state.currentStage !== 'director' || state.projectId !== notice.projectId)) useLumiNoticeStore.setState({ notice: null })
})
