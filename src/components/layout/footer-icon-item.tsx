import type { ReactNode } from 'react'

// 사이드바 푸터 아이콘(공유·내보내기·문의·프로필) 공통 래퍼.
//   버튼(40px 원형)과 캡션의 크기·폰트·자간·세로 간격을 한 곳에서 통일한다.
//   개별 컴포넌트는 40px 원형 버튼(트리거)만 넘기고, 캡션 타이포는 여기서만 정의한다.
export function FooterIconItem({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1">
      {children}
      <span className="text-xs font-medium leading-none text-muted-foreground">
        {label}
      </span>
    </div>
  )
}
