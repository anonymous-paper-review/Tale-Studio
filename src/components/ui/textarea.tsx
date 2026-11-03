import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // v3(2026-11-03): Input 과 같은 칸 — 카드색 · 테두리 없음 · 자리표시 흐린 글자 · 포커스 Info 링.
        "flex field-sizing-content min-h-16 w-full rounded-md border border-transparent bg-card px-3 py-2 text-base text-foreground transition-[color,box-shadow,border-color] outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/40 md:text-label",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
