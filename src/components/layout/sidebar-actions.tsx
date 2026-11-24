'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { FooterIconItem, FOOTER_TRIGGER_CLASS } from '@/components/layout/footer-icon-item'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function SidebarActions({
  children,
  profile,
  blocked,
}: {
  children: ReactNode
  profile: ReactNode
  blocked: boolean
}) {
  const t = useT()
  const panelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const insideEvents = useRef(new WeakSet<Event>())
  const [open, setOpen] = useState(false)
  if (blocked && open) setOpen(false)

  const dismiss = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    // 배치는 CSS가 정한다. 펼친 높이로 돌아오면 숨은 트리거의 메뉴도 닫는다.
    const compact = window.matchMedia('(max-height: 800px)')
    const closeWhenExpanded = () => {
      if (!compact.matches) dismiss(false)
    }
    compact.addEventListener('change', closeWhenExpanded)
    return () => compact.removeEventListener('change', closeWhenExpanded)
  }, [dismiss])

  useEffect(() => {
    if (!open || blocked) return
    // Take 버튼에 초점을 주면 잔액 HoverCard가 즉시 뜬다. 패널 자체에서 시작한다.
    panelRef.current?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!insideEvents.current.has(event)) dismiss(true)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!insideEvents.current.has(event)) dismiss(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // 자식 Radix 팝업은 capture 단계에서 Escape를 먼저 처리한다.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      dismiss(true)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, blocked, dismiss])

  return (
    <div
      className="sidebar-actions relative flex flex-col items-center gap-1.5"
      data-open={open && !blocked ? '' : undefined}
      // body에 그리는 자식 Popover · Dialog도 React 자식이다. DOM의 contains만으로는
      // 바깥으로 오인하므로 React의 capture에서 안쪽 네이티브 이벤트를 기록한다.
      onPointerDownCapture={(event) => insideEvents.current.add(event.nativeEvent)}
      onFocusCapture={(event) => insideEvents.current.add(event.nativeEvent)}
    >
      <div className="sidebar-actions-toggle">
        <FooterIconItem label={t('Menu')}>
          <button
            ref={triggerRef}
            type="button"
            aria-label={t('Menu')}
            aria-haspopup="dialog"
            aria-expanded={open && !blocked}
            aria-controls={panelId}
            title={t('Menu')}
            className={FOOTER_TRIGGER_CLASS}
            onClick={() => open ? dismiss(true) : setOpen(true)}
          >
            <Menu className="size-6" />
          </button>
        </FooterIconItem>
      </div>
      {/* 항상 같은 한 묶음을 그려 메뉴를 닫아도 Help 입력과 Export 처리 중 상태를 유지한다.
          짧은 화면에서 닫으면 CSS의 display:none으로 자식도 Tab 이동과 읽기 대상에서 빠진다. */}
      <div
        id={panelId}
        ref={panelRef}
        role={open && !blocked ? 'dialog' : undefined}
        aria-label={open && !blocked ? t('Menu') : undefined}
        tabIndex={-1}
        inert={blocked || undefined}
        className={cn(
          'sidebar-actions-panel z-popover flex flex-col items-center gap-1.5 outline-none',
          open && !blocked && 'rounded-xl border bg-popover p-3 text-popover-foreground shadow-panel',
        )}
      >
        <div className="sidebar-actions-items flex flex-col items-center gap-1.5">
          {children}
        </div>
        {/* 프로필도 같은 한 개를 유지한다. 접힌 화면에서는 보조 액션과 함께 메뉴 안에 둔다. */}
        <div className="sidebar-actions-profile mt-1">
          {profile}
        </div>
      </div>
    </div>
  )
}
