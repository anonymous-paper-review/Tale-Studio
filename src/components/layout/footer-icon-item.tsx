import type { ReactNode } from 'react'

// 사이드바 아래 단추(Take · 공유 · 내보내기 · Help) 공통 — v3: 채움 아이콘(24) 아래 캡션(11.5px 600, 흐린 글자), 아이콘 · 글 사이 4(11/5 시안).
//   개별 컴포넌트는 트리거(아이콘 단추)만 넘기고, 단추 모양은 FOOTER_TRIGGER_CLASS, 캡션 타이포는 여기서만 정한다.
export const FOOTER_TRIGGER_CLASS =
  'flex size-8 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

export function FooterIconItem({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      {children}
      <span className="text-micro font-semibold leading-none text-subtle-foreground">
        {label}
      </span>
    </div>
  )
}
