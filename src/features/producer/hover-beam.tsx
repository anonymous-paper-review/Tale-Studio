// 입력창(<input>/<textarea>)을 감싸 hover/focus 시 빨간 빔(테두리를 도는 빛)을 보여주는 래퍼.
// <input>/<textarea>는 ::before를 못 가지므로 div 래퍼에 .hover-red-beam을 건다.
// 버튼(<button>)은 래퍼 없이 .hover-red-beam(=HOVER_RED_BORDER) 클래스를 직접 쓴다.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function HoverBeam({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  // rounded-md 로 내부 입력창(shadcn Input/Textarea, rounded-md w-full)과 빔 링을 정렬한다.
  return <div className={cn('hover-red-beam rounded-md', className)}>{children}</div>
}
