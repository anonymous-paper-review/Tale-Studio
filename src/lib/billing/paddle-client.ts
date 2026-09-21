'use client'

import { initializePaddle, type Paddle, type PaddleEventData } from '@paddle/paddle-js'

export type { PaddleEventData } from '@paddle/paddle-js'

let paddlePromise: Promise<Paddle | undefined> | null = null
const listeners = new Set<(event: PaddleEventData) => void>()

/** 초기화 전에도 구독한다. _ptxn 자동 결제창의 첫 이벤트부터 같은 경로로 전달한다. */
export function subscribePaddleEvents(listener: (event: PaddleEventData) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function dispatchPaddleEvent(event: PaddleEventData): void {
  for (const listener of [...listeners]) {
    try {
      listener(event)
    } catch {
      // 한 화면의 표시 실패가 다른 화면의 결제 확인까지 끊지 않는다. 고객 데이터는 로그에 남기지 않는다.
      console.error('[Paddle] Checkout event listener failed')
    }
  }
}

/** 모든 구매 버튼이 같은 카드 전용 결제 설정과 Paddle 인스턴스를 사용한다. */
export function loadPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    const environment = process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox'
    if (!token) return Promise.resolve(undefined)
    paddlePromise = initializePaddle({
      token,
      environment,
      checkout: { settings: { displayMode: 'overlay', theme: 'dark', allowedPaymentMethods: ['card'] } },
      eventCallback: dispatchPaddleEvent,
    }).then((paddle) => {
      if (!paddle) paddlePromise = null
      return paddle
    }, (error: unknown) => {
      paddlePromise = null
      throw error
    })
  }
  return paddlePromise
}
