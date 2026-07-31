'use client'

// 생성 트리거 버튼 공통 훅 (#double-fire 2026-07-31).
//
// 느린 서버에서 버튼이 두 번 눌리는 문제를 세 겹으로 막는다:
//   1. 즉시 잠금 — 클릭 순간(await 전에) pending 을 세워 스피너로 바꾸고 버튼을 막는다.
//      서버 응답이나 store 상태를 기다리지 않으므로 "눌렀는데 반응이 없다"는 창이 사라진다.
//   2. 1초 창 — claimAction 이 같은 키의 연타를 버린다. 버튼이 아니라 동작 키에 걸리므로,
//      같은 대상을 가리키는 다른 화면의 버튼에서 눌러도 함께 막힌다.
//   3. 인계 — store 의 진행 상태(busy)가 올라오면 로컬 pending 을 내리고 잠금을 넘긴다.
//      그래야 생성이 끝나(busy=false) 다시 누를 수 있다.
//
// 성공하면 잠금을 풀지 않는다 — 서버가 큐를 만들었으므로 추가 발사를 막아야 한다.
// 실패하면 사유를 채팅에 남기고 아이콘을 원복한다(창도 즉시 열어 바로 재시도 가능).
// 실패를 알리려면 action 이 throw 해야 한다. 내부에서 삼키고 busy 만 내리는 store 액션은
//   3번(인계)으로 잠금이 풀리고, 사유는 그 store 의 catch 가 직접 채팅에 남긴다.

import { useCallback, useEffect, useRef, useState } from 'react'
import { claimAction, releaseAction } from '@/lib/action-guard'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import type { StageId } from '@/types'

export interface GuardedAction {
  /** 버튼을 잠가야 하는가 — 로컬 즉시 pending 또는 store 진행 상태(busy). */
  locked: boolean
  /** 클릭 핸들러. 1초 창 안의 중복이면 조용히 버린다. */
  run: () => void
}

export function useGuardedAction({
  actionKey,
  stage,
  label,
  busy = false,
  action,
}: {
  /** 동작+대상 식별자 (예: `storyboard:${nodeId}`). 같은 키끼리 1초 창을 공유한다. */
  actionKey: string
  stage: StageId
  /** 실패 통지 문구에 쓰는 대상 이름 (예: '스토리보드 이미지'). */
  label: string
  /** store 파생 진행 상태 — 있으면 잠금을 여기로 넘긴다. */
  busy?: boolean
  action: () => Promise<unknown>
}): GuardedAction {
  const [pending, setPending] = useState(false)

  // busy 가 올라오면 로컬 pending 은 소임을 다한다(잠금 인계). 계속 들고 있으면 생성이 끝나도
  //   버튼이 영영 죽는다. 상태 전환 감지는 set-state-in-render 패턴.
  const [prevBusy, setPrevBusy] = useState(busy)
  if (busy !== prevBusy) {
    setPrevBusy(busy)
    if (busy && pending) setPending(false)
  }

  // 최신 action 을 ref 로 들어 run 의 정체성을 고정 — 인라인 화살표를 넘겨도 매 렌더 새로 만들지 않는다.
  const actionRef = useRef(action)
  useEffect(() => {
    actionRef.current = action
  })

  // store 액션도 같은 이름의 키로 자체 창을 건다. 같은 키를 공유하면 훅이 창을 잡은 직후
  //   store 가 자기 창에 막혀 생성이 아예 시작되지 않는다 — 버튼 층은 별도 네임스페이스를 쓴다.
  const guardKey = `ui:${actionKey}`

  const run = useCallback(() => {
    if (!claimAction(guardKey)) return
    setPending(true)
    void (async () => {
      try {
        await actionRef.current()
      } catch (err) {
        setPending(false)
        releaseAction(guardKey)
        useGlobalChatStore
          .getState()
          .notifyActionError(stage, label, err instanceof Error ? err.message : String(err))
      }
    })()
  }, [guardKey, stage, label])

  return { locked: pending || busy, run }
}
