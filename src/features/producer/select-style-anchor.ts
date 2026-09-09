'use client'

import { evaluateProducerGate } from '@/lib/producer-gate'
import { contentLocale } from '@/lib/i18n/content'
import { translate } from '@/lib/i18n/translate'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'

// 안내는 피커에서 직접 고른 이벤트가 소유한다. 스타일 값의 변화만으로 판단하면
// 채팅 자동 반영·로드 복원도 새 선택으로 오인해 답변과 선택지를 가린다.
export async function selectStyleAnchorFromPicker(key: string | null): Promise<void> {
  const { projectId } = useProjectStore.getState()
  const previousKey = useProducerStore.getState().styleAnchorKey
  const chatBefore = useGlobalChatStore.getState()
  await useProducerStore.getState().setStyleAnchor(key)

  const project = useProjectStore.getState()
  const producer = useProducerStore.getState()
  const chat = useGlobalChatStore.getState()
  if (!projectId || project.projectId !== projectId || project.currentStage !== 'producer') return
  if (!key || previousKey === key || producer.styleAnchorKey !== key) return
  if (chatBefore.loading || chat.loading || chatBefore.messages !== chat.messages) return

  const locale = contentLocale()
  const gate = evaluateProducerGate({
    settings: producer.projectSettings,
    storyReady: producer.storyReady,
    cast: producer.cast,
    backgrounds: producer.backgrounds,
    styleAnchorKey: key,
    locale,
  })
  if (gate.canHandoff) return
  const items = gate.hardMissing.map((item) => item.label).join(' · ')
  if (!items) return
  chat.offerSuggestion({
    id: `style-then-guide:${projectId}:${key}`,
    stage: 'producer',
    content: translate(locale,
      'Style locked in! A few things are still needed before handing to Writer: {items}. Tell me in chat and I will fill them in.',
      { items }),
    action: null,
  })
}
