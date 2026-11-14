// 러프 스토리보드가 내용 검사(moderation)로 실패했을 때 채팅이 한 줄로 알린다(2026-11-14 오너 — 러프 내용 검사 실패를 채팅이 알리게).
//   예전에는 실패가 Storyboard 카드의 작은 빨간 글씨와 토스트로만 보였고, Artist 에서 뒤로 그리던 러프는 머리 표시만 사라질 뿐 말이 없어
//   채팅으로 상태를 묻는 사용자는 걸린 샷이 있다는 것도 알 수 없었다.
//   한 줄 = 한 묶음(요청 하나의 라운드). 한 번에 여러 샷이 걸리면 샷마다 줄을 만들지 않고 번호 순서로 모아 한 줄로 쓴다.
//   샷은 보드 이름(번호)으로 부르고 말은 채팅 언어다(오너 2026-11-14 답 7) — 번호를 모르면 장수만 말한다.
//   "내용 검사로 실패했는지"는 서버가 안전 모드 재시도를 가를 때 쓰는 글 규칙(lib/fal/failure-class)과 같다.
//   제출 전 내용 규칙 거절(400)은 요청 단위라 샷을 가릴 수 없어 지금처럼 토스트만 쓴다.
//   약속: tests/writer/rough-moderation-notice.test.ts · tests/artist/rough-moderation-in-background.test.ts
import { shotNumbersName } from '@/lib/board-names'
import { isModerationFailureText } from '@/lib/fal/failure-class'
import { contentLocale } from '@/lib/i18n/content'
import { countText } from '@/lib/i18n/count-text'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { boardShots } from '@/lib/writer/board-summary'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useWriterStore } from '@/stores/writer-store'
import type { StageId } from '@/types'

export { isModerationFailureText }

/** 채팅 한 줄(⚠ 표지는 채팅이 상태 행으로 가르는 고정 마커) — 걸린 샷의 번호를 모두 알면 보드 이름("샷 3·5"), 하나라도 모르면 장수만. */
export function roughModerationLine(locale: AppLocale, input: { shotNos: readonly number[]; total: number }): string {
  const t = (text: string, params?: Record<string, string | number>) => translate(locale, text, params)
  const named = input.shotNos.length > 0 && input.shotNos.length === input.total
  const body = named
    ? countText(
        t,
        input.total,
        'The rough for {shots} was not drawn because it did not pass the content check.',
        'The roughs for {shots} were not drawn because they did not pass the content check.',
        { shots: shotNumbersName(locale, input.shotNos) },
      )
    : countText(
        t,
        input.total,
        'A rough was not drawn because it did not pass the content check.',
        '{count} roughs were not drawn because they did not pass the content check.',
        { count: input.total },
      )
  return `⚠ ${body}`
}

/** 한 묶음에서 내용 검사에 걸린 샷들을 채팅에 한 줄로 남긴다. stage = 그 일이 일어난 화면(읽는 사람이 보는 채팅). 걸린 샷이 없으면 아무것도 안 한다. */
export function announceRoughModerationFailures(stage: StageId, shotIds: readonly string[]): void {
  const ids = [...new Set(shotIds)]
  if (ids.length === 0) return
  const board = useWriterStore.getState()
  const numberOf = new Map(boardShots(board.sceneManifest, board.shots).map((entry) => [entry.shot.shotId, entry.shotNo]))
  const shotNos = ids.flatMap((id) => {
    const no = numberOf.get(id)
    return no === undefined ? [] : [no]
  })
  useGlobalChatStore.getState().notifyIssue(stage, roughModerationLine(contentLocale(), { shotNos, total: ids.length }))
}
