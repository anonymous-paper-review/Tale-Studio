'use client'

import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { GateResult } from '@/lib/producer-gate'

/**
 * 핸드오프 게이트 사유 표시. hard=차단(destructive), soft=권장(warning/info).
 * design.md §2.5 — 상태는 색+icon+label 3중. 색만으로 전달하지 않는다.
 */
export function GateStatus({ gate }: { gate: GateResult }) {
  const { hardMissing, softMissing, canHandoff } = gate

  if (canHandoff && softMissing.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-success">
        <CheckCircle2 className="size-3.5 shrink-0" />
        모든 게이트 충족 — 핸드오프 준비 완료
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {hardMissing.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertCircle className="size-3.5 shrink-0" />
            핸드오프 전 필요 ({hardMissing.length})
          </div>
          <ul className="space-y-0.5 pl-5">
            {hardMissing.map((i) => (
              <li key={i.field} className="list-disc text-xs text-muted-foreground">
                {i.label}
                {i.detail ? <span className="text-muted-foreground/70"> · {i.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {softMissing.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <Info className="size-3.5 shrink-0" />
            권장 (비워도 진행 가능, {softMissing.length})
          </div>
          <ul className="space-y-0.5 pl-5">
            {softMissing.map((i) => (
              <li key={i.field} className="list-disc text-xs text-muted-foreground">
                {i.label}
                {i.detail ? <span className="text-muted-foreground/70"> · {i.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
