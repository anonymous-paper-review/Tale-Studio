import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // v3(2026-11-03): 카드색 칸(#30302E) · 테두리 없음 · 자리표시는 흐린 글자 · 포커스는 Info 링.
        "h-9 w-full min-w-0 rounded-md border border-transparent bg-card px-3 py-1 text-base text-foreground transition-[color,box-shadow,border-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-subtle-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-label",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
