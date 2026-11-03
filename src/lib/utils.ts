import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// v3 글자 크기 · 그림자 이름(globals.css @theme)을 합치기 도구에 알린다 — 모르면 text-label 을 글자 색으로 보고
//   text-foreground 와 함께 쓸 때 지워 버린다(약속: tests/ops/class-merge.test.ts).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["tag", "micro", "meta", "caption", "label", "chat", "body", "prose", "title", "display"],
      shadow: ["panel", "node"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
