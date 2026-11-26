// 산문 확정 → 콘티(오너 2026-11-26 O1 "콘티를 Artist 앞에" · O6 "그림체는 산문 확정 창에서 한 번 고르고 Artist 에서 계속 바꿀 수 있게").
//   확정 창 [예, 확정하기]와 채팅 카드 [좋아요, 콘티 짜기로]가 같은 길로 간다(features/prose/writer-next-card 의 useConfirmProse).
//   1) 그림체가 없으면 확정하지 않고 확정 창을 연다 — 창이 그림체 카드를 보인다.
//   2) 창에서 고른 그림체가 지금과 다르면 먼저 작품 그림체로 저장한다(씬 · 샷 디자인이 그림체를 입력으로 쓴다).
//   3) 산문을 확정한다(서버: 산문 잠금 · 저장 단계 conti).
//   4) 씬 · 샷 나누기를 이어 간다 — Artist 그림을 기다리지 않는다. 인물 · 배경 그림은 Artist [만들기]가 그린다(lib/artist/draft-trigger).
//   5) 콘티 화면으로 간다.
//   나누기를 걸지 못하면 창을 닫지 않는다 — 다시 누르면 확정은 그대로 두고(서버가 같은 확정을 받아 준다) 나누기만 다시 건다.
//   약속: tests/writer/prose-confirm-conti.test.ts
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

export interface ProseConfirmDeps {
  navigate: (path: string) => void
  notify: { success: (text: string) => unknown; error: (text: string) => unknown }
  /** 화면 말(영어 원문 = i18n 키) → 지금 화면 언어. */
  t: (text: string) => string
}

const SPLIT_FAILED = 'Could not start splitting into scenes and shots. Please press it again.'

/** 산문 확정 결과 → 안내. 실패 까닭마다 다음에 할 일을 알려 준다(영어 원문 = i18n 키). */
export function proseConfirmError(code: string | undefined): string {
  if (code === 'scene_story_proposal_pending') return 'Apply or discard the AI proposal first, then confirm the prose.'
  if (code === 'prose_missing') return 'The prose is not ready yet. Wait until it is written, then confirm it.'
  if (code === 'comic_rewrite_running') return 'The prose is being rewritten from the comic. Confirm it after the new draft is ready.'
  return 'Could not confirm the prose. Please try again.'
}

/** 작품 그림체가 정해져 있나 — 고른 그림체(style_anchor_key) 또는 올린 내 그림체. */
export function hasWorkStyle(): boolean {
  const producer = useProducerStore.getState()
  return !!producer.styleAnchorKey || !!producer.customStyleAnchor
}

/** 확정한 산문으로 씬 · 샷 나누기를 이어 건다(확정 뒤 · 콘티의 [씬 · 샷 나누기 시작]). */
export async function continueContiSplit(deps: ProseConfirmDeps): Promise<boolean> {
  if (await useProducerStore.getState().saveAndHandoff({ conti: true })) return true
  deps.notify.error(useProducerStore.getState().error ?? deps.t(SPLIT_FAILED))
  return false
}

/** 산문을 확정하고 콘티로 — pickedStyle 은 확정 창에서 고른 그림체(그림체가 없을 때만 창이 묻는다). */
export async function confirmProseToConti(deps: ProseConfirmDeps, pickedStyle: string | null = null): Promise<boolean> {
  const producer = useProducerStore.getState()
  if (pickedStyle && !producer.customStyleAnchor && pickedStyle !== producer.styleAnchorKey) {
    if (!(await producer.setStyleAnchor(pickedStyle))) {
      deps.notify.error(useProducerStore.getState().error ?? deps.t('Could not save the style. Please try again.'))
      return false
    }
  } else if (!hasWorkStyle()) {
    // 그림체 없이 나누면 그림체 없는 디자인이 된다 — 확정 창을 열어 그림체부터 고르게 한다(채팅 카드에서 눌렀을 때).
    useWriterRoomStore.getState().openConfirm()
    return false
  }
  const result = await useGlobalChatStore.getState().confirmProse()
  if (!result.ok) {
    if (result.code !== 'busy') deps.notify.error(deps.t(proseConfirmError(result.code)))
    return false
  }
  if (!(await continueContiSplit(deps))) return false
  useWriterRoomStore.getState().closeConfirm()
  deps.notify.success(deps.t('Prose confirmed. Opening the rough storyboard.'))
  deps.navigate('/studio/conti')
  return true
}
