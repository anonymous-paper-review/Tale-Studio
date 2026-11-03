import * as React from "react"

import { cn } from "@/lib/utils"

// 카드(shadcn new-york Card 와 같은 모양의 API, v3 2026-11-03) — 기본은 v3 "큰 내용 판"(산문 · 설정 · 인물 · 샷 카드):
//   바탕보다 한 단 어두운 panel 색 · 모서리 16 · 아래 그림자 하나. 작은 선택 칸(길이 · 화면 비율)은 controls/choice-chip 의 OptionCard.
//   variant="raised" 는 카드색(#30302E) 판 — 패널 위에 또 얹는 작은 묶음(지켜요 · 바꿔요 같은 상자).
function Card({
  className,
  variant = "panel",
  ...props
}: React.ComponentProps<"div"> & { variant?: "panel" | "raised" }) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn(
        "flex flex-col gap-3 rounded-xl p-4 text-card-foreground",
        variant === "panel" ? "bg-panel shadow-panel" : "bg-card",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-body leading-snug font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-caption text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn(className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
