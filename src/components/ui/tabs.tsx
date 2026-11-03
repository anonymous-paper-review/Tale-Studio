"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

// v3(2026-11-03): default = 카드색 바탕 위 눌린 칸(Nav/Mode Toggle), pill = 칩처럼 떨어진 탭(러프 | 대본 · 모두 | 인물 | 배경),
//   line = 밑줄. 고른 pill 은 지금 단계 색 테두리 · 18% 바탕(ChoiceChip 과 같은 규칙).
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-subtle-foreground group-data-[orientation=horizontal]/tabs:h-[38px] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "gap-0.5 rounded-lg bg-card p-[3px]",
        line: "gap-1 bg-transparent",
        pill: "gap-1.5 bg-transparent group-data-[orientation=horizontal]/tabs:h-8",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-[9px] border border-transparent px-3 py-1 text-label font-medium whitespace-nowrap text-subtle-foreground transition-colors group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
        "data-[state=active]:font-semibold data-[state=active]:text-foreground group-data-[variant=default]/tabs-list:data-[state=active]:bg-accent",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "group-data-[variant=pill]/tabs-list:flex-none group-data-[variant=pill]/tabs-list:rounded-full group-data-[variant=pill]/tabs-list:border-[1.5px] group-data-[variant=pill]/tabs-list:bg-card group-data-[variant=pill]/tabs-list:px-3.5 group-data-[variant=pill]/tabs-list:text-foreground group-data-[variant=pill]/tabs-list:data-[state=active]:border-stage group-data-[variant=pill]/tabs-list:data-[state=active]:bg-stage/18",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
