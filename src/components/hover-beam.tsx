// 입력창(<input>/<textarea>)을 감싸 hover/focus 시 빨간 빔(테두리를 도는 빛)을 보여주는 공용 래퍼.
// <input>/<textarea>는 ::before를 못 가지므로 div 래퍼에 .hover-red-beam(globals.css)을 건다.
// <button>(SelectTrigger 등)은 래퍼 없이 'hover-red-beam' 클래스를 직접 쓰면 된다.
// producer/artist/writer/director 공통 — 빨간 hover 효과는 이 래퍼/클래스만 사용(평행 구현 금지).
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
  // 레이아웃(flex-1/w-full 등)이 필요하면 className 으로 넘긴다.
  return <div className={cn('hover-red-beam rounded-md', className)}>{children}</div>
}
