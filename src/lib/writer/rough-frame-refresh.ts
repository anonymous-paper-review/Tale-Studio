// 러프 그림 한 장을 서버가 바꾼 뒤(한 장 다시 그리기 · 연출 그림 저장 · 저장 후 END) 화면이 새 그림을 다시 읽게 한다.
//   샷 사물함(shots-cache)은 30초 동안 같은 목록을 돌려준다 — 낡음 표시 없이 다시 읽으면 "다시 그렸어요" 알림 뒤에도
//   팝업 세 장 · 보드 카드에 옛 그림이 남는다(2026-10-31 QA 실측). 약속: tests/writer/rough-frame-edit-refresh.test.ts
import { invalidateShots } from '@/lib/shots-cache'

export async function reloadAfterRoughFrameEdit(projectId: string, reload: () => void | Promise<void>): Promise<void> {
  await invalidateShots(projectId)
  await reload()
}
