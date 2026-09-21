import type { DialogueLine, Shot, StageId } from '@/types'
import { matchHandoffIntent, resolveDirectorHandoffIntent } from '@/lib/handoff-intent'
import type { WriterChatUpdate } from '@/stores/writer-store'

/** 대화에 명시된 목적지를 보존한다. 모델이 제안한 목적지는 사용자의 이동 지시가 아니다. */
export function dialogueHandoffTarget(
  text: string,
  history: Array<{ role: 'user' | 'model'; content: string }>,
): Extract<StageId, 'artist' | 'director'> | null {
  if (!/(?:전체|모두|모든|all|every)/i.test(text) || !/(?:한국어|korean)/i.test(text)) return null // i18n-ok: 사용자 요청의 전체 범위와 언어를 인식한다.
  if (!/(?:맞추|통일|바꾸|번역|translate|convert|make)/i.test(text)) return null // i18n-ok: 사용자 수정 의도를 인식한다.
  const explicitTarget = (value: string) => {
    if (/(?:director|디렉터|디렉타|감독)/i.test(value) && (matchHandoffIntent(value, 'artist') || resolveDirectorHandoffIntent(value, 'writer', []))) return 'director' as const // i18n-ok: 사용자 목적 단계 이름을 인식한다.
    if (matchHandoffIntent(value, 'writer')) return 'artist' as const
    return null
  }
  const target = explicitTarget(text) ?? [...history].reverse().filter(message => message.role === 'user').map(message => explicitTarget(message.content)).find(Boolean) ?? 'artist'
  // 같은 부정·질문·인용 제외 규칙을 재사용한다. 목적지 생략만 앞선 요청에서 채운다.
  const request = `${text} ${target}`
  return matchHandoffIntent(request, target === 'director' ? 'artist' : 'writer') ? target : null
}

/** 문자 수준의 언어 혼재 검출이다. 번역 의미·문장 품질 판정은 아니다. */
export function needsKoreanDialogue(text: string): boolean {
  return /[A-Za-z\u3040-\u30ff\u3400-\u9fff]/u.test(text)
}

export interface DialogueCompletionResult {
  total: number
  completed: number
  remaining: string[]
  errors: string[]
}

/** 원래 대상은 고정하며, 각 씬의 남은 대사는 앞선 저장 완료 후 이어서 요청한다. */
export async function completeKoreanDialogue(input: {
  shots: Shot[]
  initialUpdates: WriterChatUpdate[]
  requestScene: (shots: Shot[]) => Promise<WriterChatUpdate[]>
  save: (shot: Shot, lines: DialogueLine[]) => Promise<void>
  onProgress: (completed: number, total: number) => void
  isActive: () => boolean
}): Promise<DialogueCompletionResult> {
  const targets = input.shots.filter(shot => shot.dialogueLines.some(line => needsKoreanDialogue(line.text)))
  const remaining = new Map(targets.map(shot => [shot.shotId, shot]))
  const attempted = new Set<string>()
  const errors: string[] = []
  const apply = async (updates: WriterChatUpdate[]) => {
    for (const update of updates) {
      if (!input.isActive()) throw new DOMException('Aborted', 'AbortError')
      if (update.type !== 'updateShot') continue
      const shot = remaining.get(update.id)
      if (!shot || attempted.has(shot.shotId) || !Array.isArray(update.patch.dialogueLines)) continue
      const lines = update.patch.dialogueLines
      // 언어 통일은 대사 삭제·추가·화자 변경의 승인이 아니다.
      if (lines.length !== shot.dialogueLines.length || lines.some((line, index) =>
        line.characterId !== shot.dialogueLines[index].characterId || typeof line.text !== 'string' || !line.text.trim() || needsKoreanDialogue(line.text),
      )) continue
      const translated = shot.dialogueLines.map((line, index) => ({
        ...line, text: needsKoreanDialogue(line.text) ? lines[index].text : line.text,
      }))
      attempted.add(shot.shotId)
      try {
        await input.save(shot, translated)
        remaining.delete(shot.shotId)
        input.onProgress(targets.length - remaining.size, targets.length)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Save failed')
      }
    }
  }
  await apply(input.initialUpdates)
  const scenes = [...new Set(targets.map(shot => shot.sceneId))]
  for (const sceneId of scenes) {
    for (;;) {
      if (!input.isActive()) throw new DOMException('Aborted', 'AbortError')
      const shots = [...remaining.values()].filter(shot => shot.sceneId === sceneId && !attempted.has(shot.shotId))
      if (!shots.length) break
      try {
        await apply(await input.requestScene(shots))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        errors.push(error instanceof Error ? error.message : 'Request failed')
        break
      }
      // 새로 저장/확인한 대상이 없으면 같은 요청을 무한 반복하지 않는다.
      // 처리할 대상이 줄어드는 동안만 이어가므로 실행 횟수는 원래 샷 수에 의해 제한된다.
      if (shots.every(shot => !attempted.has(shot.shotId))) break
    }
  }
  return { total: targets.length, completed: targets.length - remaining.size, remaining: [...remaining.keys()], errors }
}
