// ⌘/Ctrl+클릭 멘션의 비행 연출 (#b5 2026-08-03).
//
// 카드와 채팅 입력창이 화면 양끝이라 "@라벨이 어디에 입력됐는지" 눈으로 잇기 어렵다 —
//   멘션 추가면 클릭 지점에서 입력창으로 "@라벨" 배지가 날아가고, 해제면 입력창에서 클릭
//   지점으로 되돌아온다. 기능은 requestMentionToggle 이 전부고 이 파일은 표시 전용이다.
//   입력창 위치는 GlobalChat 패널의 data-chat-panel 로 찾는다. reduced-motion 이면 생략.
//   채팅이 닫혀 있던 화면(Director · Editor 는 닫은 채 시작)에서는 패널이 오른쪽 화면 밖에 있다 — 멘션 요청이 패널을 여는 동안
//   다 열렸을 때의 입력창 자리로 난다(오너 D9 · 리드 11/22 답 d). 약속: tests/chat/mention-flight.test.ts

const FLIGHT_MS = 600

interface RectLike {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
}

/**
 * 채팅이 다 열렸을 때의 입력창 자리. 패널은 화면 오른쪽 끝에 붙어 쉰다(global-chat: fixed · right 0).
 * 닫혔거나 열리는 중이면 패널이 오른쪽으로 밀려 있으니(translate-x-full · duration-350) 그만큼 왼쪽으로 되돌린 자리다.
 * 열려 있으면 지금 자리 그대로.
 */
export function restingChatInputRect(input: RectLike, panel: RectLike, viewportWidth: number): RectLike {
  const pushed = panel.right - viewportWidth
  if (pushed <= 1) return input
  return { ...input, left: input.left - pushed, right: input.right - pushed }
}

/**
 * 채팅 입력창에 @라벨이 이미 있는가 — 비행 방향 판정용 (#b2 2026-08-03).
 * mentioned prop(카드 ring)은 mentionItems 에 등록된 ref 만 추적해 일부 설정 필드(스타일 등)에서
 * 항상 false 였다 — 해제인데도 "카드 → 채팅"으로 날아가는 버그. requestMentionToggle 이 실제로
 * 토글하는 진실은 입력창 텍스트이므로 그걸 직접 본다(토글 반영 전, 클릭 시점 값 기준).
 */
export function chatInputHasMention(label: string): boolean {
  if (typeof document === 'undefined') return false
  const input = document.querySelector<HTMLTextAreaElement>('[data-chat-panel] textarea')
  return !!input && input.value.includes(`@${label}`)
}

export function launchMentionFlight(opts: {
  label: string
  clickX: number
  clickY: number
  /** true = 카드 → 채팅(멘션 추가), false = 채팅 → 카드(해제) */
  toChat: boolean
}): void {
  if (typeof document === 'undefined') return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const chatInput = document.querySelector('[data-chat-panel] textarea')
  const panel = chatInput?.closest('[data-chat-panel]')
  if (!chatInput || !panel) return
  // 고정 위치의 기준 폭(세로 스크롤 막대 제외) — 패널의 right 0 이 이 폭의 오른쪽 끝이다.
  const viewportWidth = document.documentElement?.clientWidth || window.innerWidth
  const rect = restingChatInputRect(chatInput.getBoundingClientRect(), panel.getBoundingClientRect(), viewportWidth)
  const chat = { x: rect.left + 20, y: rect.top + rect.height / 2 }
  const from = opts.toChat ? { x: opts.clickX, y: opts.clickY } : chat
  const to = opts.toChat ? chat : { x: opts.clickX, y: opts.clickY }

  const el = document.createElement('span')
  el.textContent = `@${opts.label}`
  el.className =
    'pointer-events-none fixed z-50 whitespace-nowrap rounded-full border border-sky-400/50 bg-popover px-2 py-0.5 text-xs font-medium text-sky-400 shadow-md'
  el.style.left = `${from.x}px`
  el.style.top = `${from.y}px`
  document.body.appendChild(el)

  const dx = to.x - from.x
  const dy = to.y - from.y
  const anim = el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      {
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.72)`,
        opacity: 0.15,
      },
    ],
    { duration: FLIGHT_MS, easing: 'cubic-bezier(0.3, 0.6, 0.2, 1)' },
  )
  anim.onfinish = () => el.remove()
  anim.oncancel = () => el.remove()
}
