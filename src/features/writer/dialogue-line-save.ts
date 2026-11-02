// 대사(Dialogue) 탭 바로 고치기의 저장(2026-11-02 오너 "탭 안에서 바로 고치기") — 샷 고치기 팝업과 같은 길로 그 샷의 대사 목록을 저장한다.
//   updateShot 이 화면 값을 먼저 바꾸고(보드 · 팝업 · Director · Editor 가 같은 글을 본다) flushShotSave 가 미뤄 둔 저장을 지금 하고 기다린다.
//   저장되면 사물함(shots-cache)을 무효화한다(updateShot 안). 실패하면 던진다 — 화면은 쓴 글을 그대로 두고 [다시 저장]을 준다.
//   러프는 다시 그리지 않는다: 러프 요청은 샷의 대사 칸을 읽지 않는다. 약속: tests/writer/dialogue-tab-save.test.ts
import { flushShotSave, useWriterStore } from '@/stores/writer-store'
import type { DialogueLine } from '@/types'

/** 지금 화면에 있는 그 샷의 대사 목록(없으면 null) — 끝낼 때 이것으로 고칠 목록을 만든다(그새 바뀐 줄을 덮어쓰지 않게). */
export function shotDialogueLines(shotId: string): DialogueLine[] | null {
  const shot = useWriterStore.getState().shots.find((item) => item.shotId === shotId)
  return shot ? shot.dialogueLines : null
}

export async function saveShotDialogue(shotId: string, lines: DialogueLine[]): Promise<void> {
  useWriterStore.getState().updateShot(shotId, { dialogueLines: lines })
  await flushShotSave(shotId)
}
