// "3시간 전" 같은 상대 시각을 화면 언어로 만든다. 포맷터는 컴포넌트가 아니라 훅을 쓸 수 없어 t 를 인자로 받는다
//   (#i18n-s5-batch2). 사용자 메뉴와 프로젝트 카드가 같이 쓴다 — 카드만 "3h ago" 로 남아 있던 것을 2026-10-26 에 합쳤다.

type Translate = (text: string, params?: Record<string, string | number>) => string

export function relativeTime(dateStr: string, t: Translate): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('Just now')
  if (mins < 60) return t('{mins}m ago', { mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('{hours}h ago', { hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('{days}d ago', { days })
  return t('{months}mo ago', { months: Math.floor(days / 30) })
}
