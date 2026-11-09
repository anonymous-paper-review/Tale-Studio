"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
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
//   그림자 0 30 80 검정 55%, 뒤 막 검정 60%, 닫기 X 24px(위 13 · 오른쪽 23). 큰 작업 창(샷 · 인물 상세 등)은 부르는 쪽 className 이 이긴다.
const DIALOG_WIDTH = {
  default: "sm:max-w-[520px]",
  wide: "sm:max-w-[748px]",
} as const

function DialogContent({
  className,
  children,
  showCloseButton = true,
  size = "default",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** default 520 · wide 748(SYS, 스타일 고르기 같은 넓은 팝업). */
  size?: keyof typeof DIALOG_WIDTH
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-5 rounded-[22px] bg-side px-[30px] py-[50px] shadow-dialog duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          // 확인 창 Lumi 를 DialogHeader 앞에 둔 창도 Lumi · 제목 사이를 제목 묶음 간격(15)으로 맞춘다(블록 사이 20 + 머리 위 6 − 11).
          "[&>[data-slot=confirm-lumi]+[data-slot=dialog-header]]:-mt-[11px]",
          DIALOG_WIDTH[size],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-[13px] right-[19px] flex size-7 items-center justify-center rounded-md text-subtle-foreground transition-colors hover:text-foreground focus:ring-2 focus:ring-ring focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]"
          >
            <XIcon strokeWidth={2.25} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // SYS 제목 묶음(Lumi · 제목 · 설명) — 가운데, 사이 15, 위아래 6.
      className={cn("flex flex-col items-center gap-[15px] py-1.5 text-center", className)}
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
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // SYS 단추 — 오른쪽 정렬 · 사이 8 · 둥근 알약(취소 = variant="secondary" #30302E, 확인 = 기본 크림).
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&_[data-slot=button]]:h-auto [&_[data-slot=button]]:rounded-full [&_[data-slot=button]]:px-[18px] [&_[data-slot=button]]:py-[11px] [&_[data-slot=button]]:text-[14px] [&_[data-slot=button]]:font-semibold",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-[20px] leading-[1.2] font-bold text-foreground", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-label leading-[1.5] text-subtle-foreground", className)}
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
