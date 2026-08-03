// ⌘/Ctrl+클릭 멘션의 비행 연출 (#b5 2026-08-03).
//
// 카드와 채팅 입력창이 화면 양끝이라 "@라벨이 어디에 입력됐는지" 눈으로 잇기 어렵다 —
//   멘션 추가면 클릭 지점에서 입력창으로 "@라벨" 배지가 날아가고, 해제면 입력창에서 클릭
//   지점으로 되돌아온다. 기능은 requestMentionToggle 이 전부고 이 파일은 표시 전용이다.
//   입력창 위치는 GlobalChat 패널의 data-chat-panel 로 찾는다. reduced-motion 이면 생략.

const FLIGHT_MS = 600

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
  if (!chatInput) return
  const rect = chatInput.getBoundingClientRect()
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
