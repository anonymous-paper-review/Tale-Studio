"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

// 11/5 Figma SYS 팝업 — "모든 팝업에 똑같이": 너비 520 · 넓은 팝업 748, 안쪽 위아래 50 · 양옆 30, 블록 사이 20, 모서리 22,
//   그림자 0 30 80 검정 55%, 뒤 막 검정 60%, 닫기 ✕ 24 틀(글자 24px — 획이 18.5px 를 채운다).
//   frame="work" = 큰 작업 창(샷 고치기 · 샷/씬 추가 · 인물 상세 · 산문 재점검): 시안이 없고 폭도 부르는 쪽이 정하는 창이라
//   머리 · 여백 · 단추는 예전 모양(왼쪽 머리 · 안쪽 24 · 알약 아님)으로 둔다(리드 2026-11-09 검토 A C3). 바탕 · 모서리 · 그림자 · 닫기는 같다.
const DIALOG_WIDTH = {
  default: "sm:max-w-[520px]",
  wide: "sm:max-w-[748px]",
} as const

type DialogFrame = "sys" | "work"
const DialogFrameContext = React.createContext<DialogFrame>("sys")

const FRAME = {
  sys: {
    content: "gap-5 px-[30px] py-[50px]",
    header: "flex flex-col items-center gap-[15px] py-1.5 text-center",
    // SYS 단추 — 오른쪽 정렬 · 사이 8 · 둥근 알약(취소 = variant="secondary" #30302E, 확인 = 기본 크림).
    footer:
      "[&_[data-slot=button]]:h-auto [&_[data-slot=button]]:rounded-full [&_[data-slot=button]]:px-[18px] [&_[data-slot=button]]:py-[11px] [&_[data-slot=button]]:text-[14px] [&_[data-slot=button]]:font-semibold",
    heading: "text-[20px] leading-[1.2] font-bold",
    note: "leading-[1.5] text-subtle-foreground",
  },
  work: {
    content: "gap-4 p-6",
    header: "flex flex-col gap-2 text-center sm:text-left",
    footer: "",
    heading: "text-lg leading-snug font-semibold",
    note: "text-muted-foreground",
  },
} as const

/** 11/5 SYS 닫기 ✕ — 24 틀에 획 18.5px(둥근 끝 2.1). lucide X 는 틀의 절반만 그려 시안의 반 크기였다(검토 A L1). */
function CloseMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round">
      <path d="M3.8 3.8 20.2 20.2M20.2 3.8 3.8 20.2" />
    </svg>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  size = "default",
  frame = "sys",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** default 520 · wide 748(SYS, 스타일 고르기 같은 넓은 팝업). */
  size?: keyof typeof DIALOG_WIDTH
  /** "work" = 큰 작업 창(머리 · 여백 · 단추는 예전 모양). 폭은 부르는 쪽 className 이 정한다. */
  frame?: DialogFrame
}) {
  const t = useT()
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-[22px] bg-side shadow-dialog duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          FRAME[frame].content,
          // 확인 창 Lumi 를 DialogHeader 앞에 둔 창도 Lumi · 제목 사이를 제목 묶음 간격(15)으로 맞춘다(블록 사이 20 + 머리 위 6 − 11).
          "[&>[data-slot=confirm-lumi]+[data-slot=dialog-header]]:-mt-[11px]",
          DIALOG_WIDTH[size],
          className
        )}
        data-frame={frame}
        {...props}
      >
        <DialogFrameContext.Provider value={frame}>{children}</DialogFrameContext.Provider>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-[15px] right-[20px] flex size-7 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:text-foreground focus:ring-2 focus:ring-ring focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0"
          >
            <CloseMark />
            <span className="sr-only">{t("Close")}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const frame = React.useContext(DialogFrameContext)
  return (
    <div
      data-slot="dialog-header"
      // SYS 제목 묶음(Lumi · 제목 · 설명) — 가운데, 사이 15, 위아래 6. 큰 작업 창은 예전처럼 왼쪽.
      className={cn(FRAME[frame].header, className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const frame = React.useContext(DialogFrameContext)
  const t = useT()
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", FRAME[frame].footer, className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="secondary">{t("Close")}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const frame = React.useContext(DialogFrameContext)
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-foreground", FRAME[frame].heading, className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const frame = React.useContext(DialogFrameContext)
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-label", FRAME[frame].note, className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
